/**
 * Shipping quotes for the storefront checkout.
 *
 * Historically checkout just listed every ShippingRate row for the
 * destination country — a flat price, so a 50-book order shipped for the same
 * $9.95 as a single comic. This module rates the ACTUAL parcel weight:
 *
 *   1. Weigh the cart (see shipping-weight.ts — art prints by size, books
 *      estimated from trim size / page count / stock).
 *   2. Pack it into boxes with the same packer fulfillment's Auto-pack uses
 *      (auto-pack.ts): every active Package is a candidate, units are placed
 *      by footprint, thickness and weight, products with their own box get it.
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
import { contentWeightOz, perUnitWeightGrams, unitDimensionsIn, GRAMS_PER_OZ, type WeighableItem } from './shipping-weight.js';
import { autoPack, type PackageOption, type UnitToPack } from './auto-pack.js';

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

/** One kind of parcel to rate: its dimensions, packed weight, and how many of it ship. */
interface Parcel {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
  count: number;
  label: string;
}

/**
 * Split the cart across boxes — the same packing fulfillment's Auto-pack
 * does, so the quote prices the boxes that will actually ship. Every active
 * Package is a candidate: units are packed by footprint, thickness and
 * weight into the fewest boxes, each shrunk to the smallest box that holds
 * it. Products that name their own box (a 135-pack of mailers only fits the
 * 24×20×6) get parcels of that box only. A unit no box can take ships on its
 * own in the largest box, so it is still rated rather than dropped.
 */
async function planShipment(items: QuoteItem[]): Promise<{ parcels: Parcel[]; boxes: number; weightOz: number }> {
  const parcels: Parcel[] = [];
  const pushParcel = (p: Parcel) => {
    const same = parcels.find((x) => x.label === p.label && Math.abs(x.weightOz - p.weightOz) < 0.01);
    if (same) same.count += p.count; else parcels.push(p);
  };

  const units: UnitToPack[] = [];
  items.forEach((item, idx) => {
    const qty = Math.max(0, Math.floor(item.quantity ?? 0));
    if (qty === 0) return;
    // A weightless line still takes room: never pack 1000 of it into one mailer.
    const weightOz = Math.max(0.1, perUnitWeightGrams(item) / GRAMS_PER_OZ);
    const dims = unitDimensionsIn(item);
    for (let i = 0; i < qty; i++) units.push({ orderItemId: String(idx), weightOz, dims, packageId: item.product?.package?.id ?? null });
  });

  const catalogue = await prisma.package.findMany({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  // Boxes products ship in on their own belong in the catalogue even when retired.
  for (const item of items) {
    const box = item.product?.package;
    if (box && !catalogue.some((p) => p.id === box.id)) {
      catalogue.push({ ...box, description: null, costCents: 0, isDefault: false, active: true, sortOrder: 999 } as (typeof catalogue)[number]);
    }
  }
  const packages: PackageOption[] = catalogue.map((p) => ({
    id: p.id, name: p.name, maxWeightOz: p.maxWeightOz, emptyWeightOz: p.emptyWeightOz,
    lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn, costCents: p.costCents, sortOrder: p.sortOrder,
  }));

  if (packages.length === 0) {
    // No packages configured — assume a modest mailer so live rating still works.
    const weightOz = Math.max(0.5, +(contentWeightOz(items) + 2).toFixed(2));
    pushParcel({ lengthIn: 12, widthIn: 9, heightIn: 3, weightOz, count: 1, label: 'Default parcel' });
    return { parcels, boxes: 1, weightOz: contentWeightOz(items) };
  }

  const plan = autoPack(units, packages);
  for (const box of plan.boxes) {
    pushParcel({
      lengthIn: box.lengthIn, widthIn: box.widthIn, heightIn: box.heightIn,
      // EasyPost needs a positive weight; never rate a zero-ounce parcel.
      weightOz: Math.max(0.5, +(box.contentWeightOz + box.emptyWeightOz).toFixed(2)),
      count: 1,
      label: box.packageName,
    });
  }
  if (plan.unpacked.length > 0) {
    const biggest = [...packages].sort((a, b) => b.lengthIn * b.widthIn * b.heightIn - a.lengthIn * a.widthIn * a.heightIn)[0]!;
    for (const u of plan.unpacked) {
      pushParcel({
        lengthIn: biggest.lengthIn, widthIn: biggest.widthIn, heightIn: biggest.heightIn,
        weightOz: Math.max(0.5, +(u.weightOz + biggest.emptyWeightOz).toFixed(2)),
        count: 1,
        label: biggest.name,
      });
    }
  }

  return { parcels, boxes: parcels.reduce((s, p) => s + p.count, 0), weightOz: contentWeightOz(items) };
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
  const plan = await planShipment(args.items);
  const weightOz = plan.weightOz;
  const subtotalCents = args.subtotalCents ?? 0;

  const from = await epFromAddress();
  const canLive = !!from && !!args.address.postalCode && !!args.address.country;

  if (canLive) {
    try {
      // Rate each kind of parcel once; an option is offered only when the
      // carrier quoted every parcel, and its price is the sum across boxes.
      const perService = new Map<string, { carrier: string; service: string; cents: number; days: number | null; parcels: number }>();
      for (const parcel of plan.parcels) {
        const shipment = await epCreateShipment({
          from_address: from!,
          to_address: epToAddress(args.address),
          parcel: { length: parcel.lengthIn, width: parcel.widthIn, height: parcel.heightIn, weight: parcel.weightOz },
        });
        const rates = shipment.rates ?? [];
        if (rates.length === 0) throw new Error(`carrier returned no rates for a ${parcel.label} (${parcel.weightOz} oz)`);
        for (const r of rates) {
          // Identify by carrier+service, not the EasyPost rate id: quotes are
          // re-run at order time and EasyPost shipments/rate ids rotate, so a
          // stable id keeps the customer's choice resolvable.
          const key = `${LIVE_PREFIX}${r.carrier}:${r.service}`;
          const cur = perService.get(key) ?? { carrier: r.carrier, service: r.service, cents: 0, days: null, parcels: 0 };
          cur.cents += toCents(r.rate) * parcel.count;
          cur.parcels += 1;
          if (r.delivery_days) cur.days = Math.max(cur.days ?? 0, r.delivery_days);
          perService.set(key, cur);
        }
      }
      const options: ShippingOption[] = [...perService.entries()]
        .filter(([, v]) => v.parcels === plan.parcels.length)
        .map(([id, v]) => ({
          id,
          name: `${v.carrier} ${v.service}`.trim(),
          rateCents: v.cents,
          estimatedDays: v.days ? `${v.days} days` : null,
          source: 'live' as const,
          carrier: v.carrier,
          service: v.service,
        }))
        .sort((a, b) => a.rateCents - b.rateCents);
      if (options.length > 0) return { options, weightOz, boxes: plan.boxes };
      return {
        options: await tableOptions(args.address, weightOz, subtotalCents),
        weightOz,
        boxes: plan.boxes,
        liveError: 'no carrier service could take every box in this order',
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
