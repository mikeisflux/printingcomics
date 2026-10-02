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
import { contentWeightOz, perUnitWeightGrams, unitDimensionsIn, allowedBoxesFor, poolBoxes, GRAMS_PER_OZ, type WeighableItem } from './shipping-weight.js';
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
  /** The boxes themselves (Package.costCents × boxes), included in every option's price. */
  packagingCents: number;
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
export interface Parcel {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
  count: number;
  label: string;
  /** What one of these boxes costs us (Package.costCents) — charged with the postage. */
  costCents: number;
}

/**
 * Split the cart across boxes — the same packing fulfillment's Auto-pack
 * does, so the quote prices the boxes that will actually ship. Every active
 * Package is a candidate: units are packed by footprint, thickness and
 * weight into the fewest boxes, each shrunk to the smallest box that holds
 * it. A stock pool with boxes of its own (mailers: 50 to the 24×24×4, 135 to
 * the 24×20×10) is packed by count into those; products that name their own
 * box get parcels of that box only. A unit no box can take ships on its
 * own in the largest box, so it is still rated rather than dropped.
 */
export async function planShipment(items: QuoteItem[]): Promise<{ parcels: Parcel[]; boxes: number; weightOz: number }> {
  const parcels: Parcel[] = [];
  const pushParcel = (p: Parcel) => {
    const same = parcels.find((x) => x.label === p.label && Math.abs(x.weightOz - p.weightOz) < 0.01);
    if (same) same.count += p.count; else parcels.push(p);
  };
  const costOf = (name: string) => catalogueCost.get(name) ?? 0;
  const catalogueCost = new Map<string, number>();

  const units: UnitToPack[] = [];
  items.forEach((item, idx) => {
    const qty = Math.max(0, Math.floor(item.quantity ?? 0));
    if (qty === 0) return;
    // A weightless line still takes room: never pack 1000 of it into one mailer.
    const weightOz = Math.max(0.1, perUnitWeightGrams(item) / GRAMS_PER_OZ);
    // A pile with boxes of its own (mailers: 50 to the small box, 135 to the
    // big one) is packed by count; otherwise by the product's box and size.
    const allowed = allowedBoxesFor(item);
    const dims = allowed ? null : unitDimensionsIn(item);
    const box = allowed ? null : item.product?.package ?? null;
    for (let i = 0; i < qty; i++) units.push({ orderItemId: String(idx), weightOz, dims, packageId: box?.id ?? null, allowed });
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
  const listed = [...new Set(units.flatMap((u) => (u.allowed ?? []).map((a) => a.packageId)))].filter((id) => !catalogue.some((p) => p.id === id));
  if (listed.length > 0) catalogue.push(...(await prisma.package.findMany({ where: { id: { in: listed } } })));
  const reserved = await reservedPackageIds();
  const packages: PackageOption[] = catalogue.map((p) => ({
    id: p.id, name: p.name, maxWeightOz: p.maxWeightOz, emptyWeightOz: p.emptyWeightOz,
    lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn, costCents: p.costCents, sortOrder: p.sortOrder,
    reserved: reserved.has(p.id),
  }));

  for (const p of packages) catalogueCost.set(p.name, p.costCents ?? 0);

  if (packages.length === 0) {
    // No packages configured — assume a modest mailer so live rating still works.
    const weightOz = Math.max(0.5, +(contentWeightOz(items) + 2).toFixed(2));
    pushParcel({ lengthIn: 12, widthIn: 9, heightIn: 3, weightOz, count: 1, label: 'Default parcel', costCents: 0 });
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
      costCents: costOf(box.packageName),
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
        costCents: costOf(biggest.name),
      });
    }
  }

  return { parcels, boxes: parcels.reduce((s, p) => s + p.count, 0), weightOz: contentWeightOz(items) };
}

/**
 * Boxes claimed by a product ("ships in its own box") or by a stock pool's
 * boxes. They are packed only with what claims them; the open boxes take
 * everything else.
 */
export async function reservedPackageIds(): Promise<Set<string>> {
  const [products, pools] = await Promise.all([
    prisma.product.findMany({ where: { packageId: { not: null } }, select: { packageId: true } }),
    prisma.stockPool.findMany({ select: { boxes: true } }),
  ]);
  const ids = new Set<string>();
  for (const p of products) if (p.packageId) ids.add(p.packageId);
  for (const pool of pools) for (const b of poolBoxes(pool.boxes)) ids.add(b.packageId);
  return ids;
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

/** A table rate for a shipment: per kilogram over the whole weight, or flat per box. */
function tableRateCents(rate: { rateCents: number; perKg: boolean }, weightOz: number, boxes: number): number {
  const kg = (weightOz * 28.3495) / 1000;
  // `perKg` rows are priced per kilogram — bill at least one unit. A flat
  // row is the price of one label, so it is charged for every box.
  return rate.perKg ? Math.round(rate.rateCents * Math.max(1, kg)) : rate.rateCents * Math.max(1, boxes);
}

/** Flat/per-kg options from the ShippingRate table for a destination. */
async function tableOptions(address: QuoteAddress, weightOz: number, subtotalCents: number, boxes: number): Promise<ShippingOption[]> {
  const country = address.country || 'US';
  const zones = await prisma.shippingZone.findMany({
    where: { countries: { has: country } },
    include: { rates: true },
  });
  const out: ShippingOption[] = [];
  for (const z of zones) {
    for (const r of z.rates) {
      if (subtotalCents < r.minSubtotalCents) continue;
      if (r.maxSubtotalCents != null && subtotalCents > r.maxSubtotalCents) continue;
      out.push({
        id: r.id,
        name: r.name,
        rateCents: tableRateCents(r, weightOz, boxes),
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
  // The boxes are part of the shipping price: a 135 case goes out in a
  // $5.02 carton, and the customer pays for it with the postage.
  const packagingCents = packagingCostCents(plan.parcels);
  const withBoxes = (options: ShippingOption[]): ShippingOption[] => options.map((o) => ({ ...o, rateCents: o.rateCents + packagingCents }));

  const from = await epFromAddress();
  const canLive = !!from && !!args.address.postalCode && !!args.address.country;

  if (canLive) {
    try {
      // Rate each kind of parcel once (identical boxes share a rating).
      const rated: RatedParcel[] = [];
      for (const parcel of plan.parcels) {
        const shipment = await epCreateShipment({
          from_address: from!,
          to_address: epToAddress(args.address),
          parcel: { length: parcel.lengthIn, width: parcel.widthIn, height: parcel.heightIn, weight: parcel.weightOz },
        });
        const rates = shipment.rates ?? [];
        if (rates.length === 0) throw new Error(`carrier returned no rates for a ${parcel.label} (${parcel.weightOz} oz)`);
        rated.push({ count: parcel.count, rates: rates.map((r) => ({ carrier: r.carrier, service: r.service, cents: toCents(r.rate), days: r.delivery_days ?? null })) });
      }
      const options = aggregateLiveRates(rated);
      if (options.length > 0) return { options: withBoxes(options), weightOz, boxes: plan.boxes, packagingCents };
      return {
        options: withBoxes(await tableOptions(args.address, weightOz, subtotalCents, plan.boxes)),
        weightOz,
        boxes: plan.boxes,
        packagingCents,
        liveError: 'no carrier service could take every box in this order',
      };
    } catch (e: any) {
      // Never block checkout on a carrier outage — fall back to the table.
      return {
        options: withBoxes(await tableOptions(args.address, weightOz, subtotalCents, plan.boxes)),
        weightOz,
        boxes: plan.boxes,
        packagingCents,
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
    options: withBoxes(await tableOptions(args.address, weightOz, subtotalCents, plan.boxes)),
    weightOz,
    boxes: plan.boxes,
    packagingCents,
    liveError,
  };
}

export interface RatedParcel {
  /** How many boxes of this kind ship. */
  count: number;
  rates: { carrier: string; service: string; cents: number; days: number | null }[];
}

export const BEST_PER_BOX_ID = `${LIVE_PREFIX}best:per-box`;

/**
 * Turn per-box carrier rates into the options a customer can pick.
 *
 * One option per carrier service that can take EVERY box, priced as the sum
 * over boxes — that is what buying one label per box costs. When the boxes
 * would be cheaper on different services (a carton on FedEx, a sleeve on
 * USPS), or no single service can take them all, a "best rate per box"
 * option sums the cheapest rate of each box, so a multi-box order is never
 * thrown back to the flat table just because the carriers disagree.
 */
export function aggregateLiveRates(parcels: RatedParcel[]): ShippingOption[] {
  const perService = new Map<string, { carrier: string; service: string; cents: number; days: number | null; parcels: number }>();
  let bestCents = 0;
  let bestDays: number | null = null;
  for (const parcel of parcels) {
    let cheapest: RatedParcel['rates'][number] | null = null;
    for (const r of parcel.rates) {
      // Identify by carrier+service, not the EasyPost rate id: quotes are
      // re-run at order time and EasyPost shipments/rate ids rotate, so a
      // stable id keeps the customer's choice resolvable.
      const key = `${LIVE_PREFIX}${r.carrier}:${r.service}`;
      const cur = perService.get(key) ?? { carrier: r.carrier, service: r.service, cents: 0, days: null, parcels: 0 };
      cur.cents += r.cents * parcel.count;
      cur.parcels += 1;
      if (r.days) cur.days = Math.max(cur.days ?? 0, r.days);
      perService.set(key, cur);
      if (!cheapest || r.cents < cheapest.cents) cheapest = r;
    }
    if (!cheapest) return [];
    bestCents += cheapest.cents * parcel.count;
    if (cheapest.days) bestDays = Math.max(bestDays ?? 0, cheapest.days);
  }
  const options: ShippingOption[] = [...perService.entries()]
    .filter(([, v]) => v.parcels === parcels.length)
    .map(([id, v]) => ({
      id,
      name: `${v.carrier} ${v.service}`.trim(),
      rateCents: v.cents,
      estimatedDays: v.days ? `${v.days} days` : null,
      source: 'live' as const,
      carrier: v.carrier,
      service: v.service,
    }));
  const cheapestSingle = options.reduce((m, o) => Math.min(m, o.rateCents), Number.POSITIVE_INFINITY);
  if (parcels.length > 1 && bestCents < cheapestSingle) {
    options.push({
      id: BEST_PER_BOX_ID,
      name: 'Best available rate per box',
      rateCents: bestCents,
      estimatedDays: bestDays ? `${bestDays} days` : null,
      source: 'live',
      carrier: null,
      service: null,
    });
  }
  return options.sort((a, b) => a.rateCents - b.rateCents);
}

/** Package.costCents over every box in the plan. */
function packagingCostCents(parcels: Parcel[]): number {
  return parcels.reduce((sum, p) => sum + Math.max(0, p.costCents) * p.count, 0);
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
  const plan = await planShipment(args.items);
  return {
    cents: tableRateCents(rate, plan.weightOz, plan.boxes) + packagingCostCents(plan.parcels),
    name: rate.name,
  };
}
