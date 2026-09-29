/**
 * Shipping quotes for the storefront checkout.
 *
 * Historically checkout just listed every ShippingRate row for the
 * destination country — a flat price, so a 50-book order shipped for the same
 * $9.95 as a single comic. This module rates the ACTUAL parcel weight:
 *
 *   1. Weigh the cart (see shipping-weight.ts — art prints by size, books
 *      estimated from trim size / page count / stock).
 *   2. Pack it into boxes: products with their own box get it; the rest
 *      share the default Package, split by its max packed weight.
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
import { getEasyPostConfig, getSetting } from './settings.js';
import { epCreateShipment, type EpAddress } from './easypost.js';
import { contentWeightOz, perUnitWeightGrams, GRAMS_PER_OZ, type WeighableItem } from './shipping-weight.js';

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
 * Split the cart across boxes. Products that name their own box (a 135-pack
 * of mailers only fits the 24×20×6) get parcels of that box — as many as
 * the box's max packed weight allows per box, one per item when no max is
 * set. Everything else rides in the default (or first active) Package,
 * split by its max packed weight; without a cap it all goes in one box.
 */
async function planShipment(items: QuoteItem[]): Promise<{ parcels: Parcel[]; boxes: number; weightOz: number }> {
  const parcels: Parcel[] = [];
  const pushParcel = (p: Parcel) => {
    const same = parcels.find((x) => x.label === p.label && Math.abs(x.weightOz - p.weightOz) < 0.01);
    if (same) same.count += p.count; else parcels.push(p);
  };

  const own = items.filter((i) => i.product?.package && i.quantity > 0);
  for (const i of own) {
    const box = i.product!.package!;
    const unitOz = Math.max(0.1, perUnitWeightGrams(i) / GRAMS_PER_OZ);
    const cap = box.maxWeightOz && box.maxWeightOz > box.emptyWeightOz ? box.maxWeightOz - box.emptyWeightOz : null;
    const perBox = cap ? Math.max(1, Math.floor(cap / unitOz)) : 1;
    let left = i.quantity;
    while (left > 0) {
      const n = Math.min(perBox, left);
      pushParcel({ lengthIn: box.lengthIn, widthIn: box.widthIn, heightIn: box.heightIn, weightOz: +(n * unitOz + box.emptyWeightOz).toFixed(2), count: 1, label: box.name });
      left -= n;
    }
  }

  const rest = items.filter((i) => !i.product?.package);
  const restOz = contentWeightOz(rest);
  if (restOz > 0 || parcels.length === 0) {
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
    const boxes = usable ? Math.max(1, Math.ceil(restOz / usable)) : 1;
    // EasyPost needs a positive weight; never rate a zero-ounce parcel.
    const perBoxOz = Math.max(0.5, +(restOz / boxes + dims.emptyWeightOz).toFixed(2));
    pushParcel({ ...dims, weightOz: perBoxOz, count: boxes, label: pkg?.name ?? 'Default parcel' });
  }

  return { parcels, boxes: parcels.reduce((s, p) => s + p.count, 0), weightOz: contentWeightOz(items) };
}

// ---------------------------------------------------------------------------
// What the customer is shown: one carrier, plain names
// ---------------------------------------------------------------------------

/** EasyPost carrier account names → what to print. */
const CARRIER_LABEL: Record<string, string> = {
  USPS: 'USPS', UPSDAP: 'UPS', UPS: 'UPS', FedExDefault: 'FedEx', FedEx: 'FedEx', DHLExpress: 'DHL',
};
/** USPS service codes → the names on the counter. */
const USPS_SERVICE: Record<string, string> = {
  GroundAdvantage: 'Ground Advantage', First: 'First-Class Mail', Priority: 'Priority Mail', Express: 'Priority Mail Express',
  ParcelSelect: 'Parcel Select', MediaMail: 'Media Mail', LibraryMail: 'Library Mail',
  FirstClassMailInternational: 'First-Class Mail International', FirstClassPackageInternationalService: 'First-Class Package International',
  PriorityMailInternational: 'Priority Mail International', ExpressMailInternational: 'Priority Mail Express International',
};
/** Services that are not for merchandise, whatever the price says. */
const NEVER_OFFER = new Set(['USPS:MediaMail', 'USPS:LibraryMail']);

export function serviceName(carrier: string, service: string): string {
  const c = CARRIER_LABEL[carrier] ?? carrier.replace(/(Default|DAP)$/i, '');
  let sv = carrier === 'USPS' && USPS_SERVICE[service]
    ? USPS_SERVICE[service]
    : service.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b(\w)(\w*)/g, (_m, a: string, b: string) => a + b.toLowerCase());
  // "FedEx Fedex Ground" → "FedEx Ground"
  if (sv.toLowerCase().startsWith(c.toLowerCase() + ' ')) sv = sv.slice(c.length + 1);
  return `${c} ${sv}`.trim();
}

/**
 * Only the carriers set under Settings → EasyPost ("Carriers offered at
 * checkout", default USPS), never Media/Library Mail. If none of the rates
 * are from an offered carrier (a box USPS will not take, for instance) the
 * customer still gets the others rather than nothing.
 */
async function offeredOptions(all: ShippingOption[]): Promise<ShippingOption[]> {
  const raw = (await getSetting<string>('shipping.carriers')) || 'USPS';
  const allowed = new Set(raw.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean));
  const clean = all.filter((o) => !NEVER_OFFER.has(`${o.carrier}:${o.service}`));
  const label = (o: ShippingOption) => (CARRIER_LABEL[o.carrier ?? ''] ?? o.carrier ?? '').toUpperCase();
  const mine = clean.filter((o) => allowed.has(label(o)) || allowed.has((o.carrier ?? '').toUpperCase()));
  if (mine.length > 0) return mine;
  if (clean.length > 0) console.warn(`[shipping] none of the offered carriers (${[...allowed].join(', ')}) rated this order — showing all carriers`);
  return clean;
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
      const all: ShippingOption[] = [...perService.entries()]
        .filter(([, v]) => v.parcels === plan.parcels.length)
        .map(([id, v]) => ({
          id,
          name: serviceName(v.carrier, v.service),
          rateCents: v.cents,
          estimatedDays: v.days ? `${v.days} days` : null,
          source: 'live' as const,
          carrier: v.carrier,
          service: v.service,
        }))
        .sort((a, b) => a.rateCents - b.rateCents);
      const options = await offeredOptions(all);
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
