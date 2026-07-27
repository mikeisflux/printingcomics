/**
 * Shipping quotes for the storefront checkout.
 *
 * Historically checkout just listed every ShippingRate row for the
 * destination country — a flat price, so a 50-book order shipped for the same
 * $9.95 as a single comic. This module rates the ACTUAL parcel weight:
 *
 *   1. Weigh the cart (see shipping-weight.ts — art prints by size, books
 *      estimated from trim size / page count / stock).
 *   2. Pack it into boxes using the default Package's max packed weight.
 *   3. Ask EasyPost for live rates and return them.
 *   4. If EasyPost isn't configured or errors, fall back to the ShippingRate
 *      table — now honoring its `perKg` flag so the fallback still scales
 *      with weight instead of being flat.
 *
 * Rate ids are opaque to the client. `resolveShippingSelection` re-derives the
 * price server-side at order-create time so a tampered or stale id can never
 * set the shipping charge.
 */
import { prisma } from '../db.js';
import { getEasyPostConfig } from './settings.js';
import { epCreateShipment, type EpAddress } from './easypost.js';
import { contentWeightOz, type WeighableItem } from './shipping-weight.js';

export interface QuoteAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface ShippingOption {
  id: string;
  name: string;
  rateCents: number;
  estimatedDays?: string | null;
  source: 'live' | 'table';
  carrier?: string | null;
  service?: string | null;
}

export interface ShippingQuote {
  options: ShippingOption[];
  weightOz: number;
  boxes: number;
  /** Set when live rating was attempted but unavailable, for admin diagnostics. */
  liveError?: string;
}

type QuoteItem = WeighableItem & { quantity: number };

const LIVE_PREFIX = 'ep:';

/** Round a decimal-dollar string from EasyPost to integer cents. */
function toCents(rate: string): number {
  return Math.round(parseFloat(rate) * 100);
}

/**
 * Split the cart across boxes. Uses the default (or first active) Package's
 * `maxWeightOz` as the per-box cap; without a cap everything rides in one box.
 */
async function planBoxes(weightOz: number) {
  const pkg =
    (await prisma.package.findFirst({
      where: { active: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })) ?? null;

  // No packages configured — assume a modest mailer so live rating still works.
  const dims = pkg
    ? { lengthIn: pkg.lengthIn, widthIn: pkg.widthIn, heightIn: pkg.heightIn, emptyWeightOz: pkg.emptyWeightOz }
    : { lengthIn: 12, widthIn: 9, heightIn: 3, emptyWeightOz: 2 };

  const cap = pkg?.maxWeightOz && pkg.maxWeightOz > 0 ? pkg.maxWeightOz : null;
  const usable = cap ? Math.max(1, cap - dims.emptyWeightOz) : null;
  const boxes = usable ? Math.max(1, Math.ceil(weightOz / usable)) : 1;
  // EasyPost needs a positive weight; never rate a zero-ounce parcel.
  const perBoxOz = Math.max(0.5, +(weightOz / boxes + dims.emptyWeightOz).toFixed(2));
  return { ...dims, boxes, perBoxOz, packageName: pkg?.name ?? 'Default parcel' };
}

function epToAddress(a: QuoteAddress): EpAddress {
  return {
    street1: a.line1 || '',
    street2: a.line2 || undefined,
    city: a.city || '',
    state: a.region || '',
    zip: a.postalCode || '',
    country: a.country || 'US',
  } as EpAddress;
}

async function epFromAddress(): Promise<EpAddress | null> {
  const c = await getEasyPostConfig();
  if (!c.apiKey || !c.fromStreet1 || !c.fromPostalCode) return null;
  return {
    name: c.fromName || undefined,
    company: c.fromCompany || undefined,
    street1: c.fromStreet1,
    street2: c.fromStreet2 || undefined,
    city: c.fromCity,
    state: c.fromState,
    zip: c.fromPostalCode,
    country: c.fromCountry || 'US',
    phone: c.fromPhone || undefined,
    email: c.fromEmail || undefined,
  } as EpAddress;
}

/** Flat/per-kg options from the ShippingRate table for a destination. */
async function tableOptions(address: QuoteAddress, weightOz: number, subtotalCents: number): Promise<ShippingOption[]> {
  const country = address.country || 'US';
  const zones = await prisma.shippingZone.findMany({
    where: { countries: { has: country } },
    include: { rates: true },
  });
  const kg = (weightOz * 28.3495) / 1000;
  const out: ShippingOption[] = [];
  for (const z of zones) {
    for (const r of z.rates) {
      if (subtotalCents < r.minSubtotalCents) continue;
      if (r.maxSubtotalCents != null && subtotalCents > r.maxSubtotalCents) continue;
      out.push({
        id: r.id,
        name: r.name,
        // `perKg` rows are priced per kilogram — bill at least one unit.
        rateCents: r.perKg ? Math.round(r.rateCents * Math.max(1, kg)) : r.rateCents,
        estimatedDays: r.estimatedDays,
        source: 'table',
      });
    }
  }
  return out.sort((a, b) => a.rateCents - b.rateCents);
}

/**
 * Rate a cart for a destination. Live EasyPost rates when configured and the
 * address is complete enough; otherwise the rate table.
 */
export async function quoteShipping(args: {
  items: QuoteItem[];
  address: QuoteAddress;
  subtotalCents?: number;
}): Promise<ShippingQuote> {
  const weightOz = contentWeightOz(args.items);
  const plan = await planBoxes(weightOz);
  const subtotalCents = args.subtotalCents ?? 0;

  const from = await epFromAddress();
  const canLive = !!from && !!args.address.postalCode && !!args.address.country;

  if (canLive) {
    try {
      const shipment = await epCreateShipment({
        from_address: from!,
        to_address: epToAddress(args.address),
        parcel: {
          length: plan.lengthIn,
          width: plan.widthIn,
          height: plan.heightIn,
          weight: plan.perBoxOz,
        },
      });
      const rates = shipment.rates ?? [];
      if (rates.length > 0) {
        const options: ShippingOption[] = rates
          .map((r) => ({
            // Identify by carrier+service, not the EasyPost rate id: quotes are
            // re-run at order time and EasyPost shipments/rate ids rotate, so a
            // stable id keeps the customer's choice resolvable.
            id: `${LIVE_PREFIX}${r.carrier}:${r.service}`,
            name: `${r.carrier} ${r.service}`.trim(),
            // One rated box × the number of boxes we'd actually ship.
            rateCents: toCents(r.rate) * plan.boxes,
            estimatedDays: r.delivery_days ? `${r.delivery_days} days` : null,
            source: 'live' as const,
            carrier: r.carrier,
            service: r.service,
          }))
          .sort((a, b) => a.rateCents - b.rateCents);
        return { options, weightOz, boxes: plan.boxes };
      }
      return {
        options: await tableOptions(args.address, weightOz, subtotalCents),
        weightOz,
        boxes: plan.boxes,
        liveError: 'carrier returned no rates for this address',
      };
    } catch (e: any) {
      // Never block checkout on a carrier outage — fall back to the table.
      return {
        options: await tableOptions(args.address, weightOz, subtotalCents),
        weightOz,
        boxes: plan.boxes,
        liveError: e?.message ?? 'live rating failed',
      };
    }
  }

  const liveError = from ? 'incomplete destination address' : 'EasyPost not configured';
  if (!from) {
    // Without live rating every order falls back to flat table pricing — the
    // exact failure that let a 50-book order ship for a single-book rate.
    console.warn('[shipping] live rating unavailable (EasyPost not configured) — using flat rate table');
  }
  return {
    options: await tableOptions(args.address, weightOz, subtotalCents),
    weightOz,
    boxes: plan.boxes,
    liveError,
  };
}

/**
 * Re-derive the price for a selected shipping option. NEVER trust a price sent
 * by the client — this is what the order is actually charged.
 *
 * Live ids re-rate the same parcel and match the carrier+service, so a stale
 * EasyPost shipment (they expire) still resolves to a current price instead of
 * silently charging zero.
 */
export async function resolveShippingSelection(args: {
  optionId?: string | null;
  items: QuoteItem[];
  address: QuoteAddress;
  subtotalCents?: number;
}): Promise<{ cents: number; name: string | null }> {
  if (!args.optionId) return { cents: 0, name: null };

  if (args.optionId.startsWith(LIVE_PREFIX)) {
    // Re-rate now; the customer is charged the current price for the carrier +
    // service they chose, never a client-supplied number.
    const quote = await quoteShipping({ items: args.items, address: args.address, subtotalCents: args.subtotalCents });
    const exact = quote.options.find((o) => o.id === args.optionId);
    if (exact) return { cents: exact.rateCents, name: exact.name };
    // That service is no longer offered for this parcel — fall back to the
    // cheapest current option rather than shipping for free.
    const cheapest = quote.options[0];
    return cheapest ? { cents: cheapest.rateCents, name: cheapest.name } : { cents: 0, name: null };
  }

  const rate = await prisma.shippingRate.findUnique({ where: { id: args.optionId } });
  if (!rate) return { cents: 0, name: null };
  const weightOz = contentWeightOz(args.items);
  const kg = (weightOz * 28.3495) / 1000;
  return {
    cents: rate.perKg ? Math.round(rate.rateCents * Math.max(1, kg)) : rate.rateCents,
    name: rate.name,
  };
}
