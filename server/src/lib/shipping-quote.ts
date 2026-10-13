/**
 * Shipping quotes for the storefront checkout.
 *
 * Historically checkout just listed every ShippingRate row for the
 * destination country — a flat price, so a 50-book order shipped for the same
 * $9.95 as a single comic. This module rates the ACTUAL parcels:
 *
 *   1. Weigh the cart (see shipping-weight.ts — art prints by size, books
 *      estimated from trim size / page count / stock).
 *   2. Pack it into boxes with the same packer fulfillment's Auto-pack uses
 *      (auto-pack.ts): every active Package is a candidate, units are placed
 *      by footprint, thickness and weight, products with their own box get it,
 *      a pool's packs are counted together into the pool's boxes.
 *   3. Ask EasyPost for live rates on every box and return them.
 *   4. If EasyPost isn't configured or errors, fall back to the ShippingRate
 *      table — now honoring its `perKg` flag so the fallback still scales
 *      with weight instead of being flat.
 *
 * What the customer pays is the label price EasyPost bills us (its `rate` —
 * never the carrier's retail counter price), summed over the boxes, plus the
 * boxes themselves, adjusted by the shipping settings (see getShippingPricing).
 * Every option carries a breakdown of how that number was built, and the one
 * the customer pays for is kept on the order so staff can match the labels
 * they buy against what was charged.
 *
 * Rate ids are opaque to the client. `resolveShippingSelection` re-derives the
 * price server-side at order-create time so a tampered or stale id can never
 * set the shipping charge.
 */
import { prisma } from '../db.js';
import { getEasyPostConfig, getShippingPricing } from './settings.js';
import { epCreateShipment, type EpAddress, type EpRate } from './easypost.js';
import {
  contentWeightOz, perUnitWeightGrams, unitDimensionsIn, allowedBoxesFor, poolBoxes, effectivePoolBoxes,
  GRAMS_PER_OZ, type WeighableItem, type PoolBoxRules,
} from './shipping-weight.js';
import { autoPack, type PackageOption, type UnitToPack } from './auto-pack.js';
import { carrierDisplayName, serviceDisplayName, methodDisplayName } from './carriers.js';

export interface QuoteAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

/** One box of a quote and what the carrier charges for one of them. */
export interface QuotedBox {
  label: string;
  count: number;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** EasyPost's codes for the rate on this box; null for a table rate. */
  carrier: string | null;
  service: string | null;
  carrierName: string | null;
  serviceName: string | null;
  /** The label price EasyPost bills us for ONE of these boxes. */
  cents: number;
  /** The carrier's counter price for the same label, when EasyPost reports it. */
  retailCents: number | null;
  days: number | null;
  /** What one of these boxes costs us (Package.costCents). */
  boxCents: number;
}

/** How an option's price was built. Kept on the order as `shippingQuote`. */
export interface QuoteBreakdown {
  boxes: QuotedBox[];
  /** The label prices summed over every box — what we pay EasyPost. */
  carrierCents: number;
  /** The boxes, when the setting charges them (0 otherwise). */
  packagingCents: number;
  /** The shipping.rateAdjustBps setting that applied (0 = charged at cost). */
  adjustBps: number;
  adjustCents: number;
  totalCents: number;
}

export interface ShippingOption {
  id: string;
  name: string;
  rateCents: number;
  estimatedDays?: string | null;
  source: 'live' | 'table';
  carrier?: string | null;
  service?: string | null;
  breakdown?: QuoteBreakdown;
}

export interface ShippingQuote {
  options: ShippingOption[];
  weightOz: number;
  boxes: number;
  /** The boxes themselves (Package.costCents × boxes); in every option's price when the setting is on. */
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
 * Box rules by pool: the boxes typed on the pool, else the ones its listings
 * imply (see effectivePoolBoxes). Loaded once per quote.
 */
export async function loadPoolBoxRules(): Promise<PoolBoxRules> {
  const pools = await prisma.stockPool.findMany({
    select: { id: true, boxes: true, products: { select: { packageId: true, unitsPerItem: true } } },
  });
  const rules: PoolBoxRules = new Map();
  for (const pool of pools) {
    const boxes = effectivePoolBoxes(pool);
    if (boxes.length > 0) rules.set(pool.id, boxes);
  }
  return rules;
}

/**
 * Split the cart across boxes — the same packing fulfillment's Auto-pack
 * does, so the quote prices the boxes that will actually ship. Every active
 * Package is a candidate: units are packed by footprint, thickness and
 * weight into the fewest boxes, each shrunk to the smallest box that holds
 * it. A pool with boxes of its own (mailers: 50 to the 24×24×4, 135 to the
 * 24×20×10; Comic Armor: two 100-packs to the 200 box) is packed by count
 * into those; products that name their own box get parcels of that box
 * only. A unit no box can take ships on its own in the largest box, so it is
 * still rated rather than dropped.
 */
export async function planShipment(items: QuoteItem[]): Promise<{ parcels: Parcel[]; boxes: number; weightOz: number }> {
  const parcels: Parcel[] = [];
  const pushParcel = (p: Parcel) => {
    const same = parcels.find((x) => x.label === p.label && Math.abs(x.weightOz - p.weightOz) < 0.01);
    if (same) same.count += p.count; else parcels.push(p);
  };
  const costOf = (name: string) => catalogueCost.get(name) ?? 0;
  const catalogueCost = new Map<string, number>();

  const rules = await loadPoolBoxRules();
  const units: UnitToPack[] = [];
  items.forEach((item, idx) => {
    const qty = Math.max(0, Math.floor(item.quantity ?? 0));
    if (qty === 0) return;
    // A weightless line still takes room: never pack 1000 of it into one mailer.
    const weightOz = Math.max(0.1, perUnitWeightGrams(item) / GRAMS_PER_OZ);
    // A pile with boxes of its own (mailers: 50 to the small box, 135 to the
    // big one) is packed by count; otherwise by the product's box and size.
    const allowed = allowedBoxesFor(item, rules);
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
 * Boxes claimed by a product ("ships in its own box") or by a pool's box
 * rule. They are packed only with what claims them; the open boxes take
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

/** The boxes of a plan as they appear in a breakdown, before any carrier is known. */
function boxesOf(parcels: Parcel[]): QuotedBox[] {
  return parcels.map((p) => ({
    label: p.label, count: p.count, weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn,
    carrier: null, service: null, carrierName: null, serviceName: null, cents: 0, retailCents: null, days: null, boxCents: p.costCents,
  }));
}

/** Flat/per-kg options from the ShippingRate table for a destination. */
async function tableOptions(address: QuoteAddress, weightOz: number, subtotalCents: number, parcels: Parcel[]): Promise<ShippingOption[]> {
  const country = address.country || 'US';
  const boxes = Math.max(1, parcels.reduce((s, p) => s + p.count, 0));
  const zones = await prisma.shippingZone.findMany({
    where: { countries: { has: country } },
    include: { rates: true },
  });
  const out: ShippingOption[] = [];
  for (const z of zones) {
    for (const r of z.rates) {
      if (subtotalCents < r.minSubtotalCents) continue;
      if (r.maxSubtotalCents != null && subtotalCents > r.maxSubtotalCents) continue;
      const cents = tableRateCents(r, weightOz, boxes);
      out.push({
        id: r.id,
        name: r.name,
        rateCents: cents,
        estimatedDays: r.estimatedDays,
        source: 'table',
        breakdown: { boxes: boxesOf(parcels), carrierCents: cents, packagingCents: 0, adjustBps: 0, adjustCents: 0, totalCents: cents },
      });
    }
  }
  return out.sort((a, b) => a.rateCents - b.rateCents);
}

export interface ShippingPricing {
  /** Applied to the carrier part of live rates: 0 = at cost, 500 = +5%, -500 = 5% under. */
  rateAdjustBps: number;
  /** Add Package.costCents of every box to the price. */
  chargeBoxCost: boolean;
}

/**
 * Turn what the carrier charges into what the customer pays: the summed
 * label prices, adjusted by the setting (live rates only — a table rate is
 * the price the admin typed), plus the boxes when the setting charges them.
 * The breakdown records every part.
 */
export function priceOption(o: ShippingOption, pricing: ShippingPricing, packagingCents: number): ShippingOption {
  const carrierCents = o.breakdown?.carrierCents ?? o.rateCents;
  const adjustBps = o.source === 'live' ? pricing.rateAdjustBps : 0;
  const adjustCents = Math.round((carrierCents * adjustBps) / 10_000);
  const boxes = pricing.chargeBoxCost ? packagingCents : 0;
  const totalCents = Math.max(0, carrierCents + adjustCents + boxes);
  return {
    ...o,
    rateCents: totalCents,
    breakdown: { boxes: o.breakdown?.boxes ?? [], carrierCents, packagingCents: boxes, adjustBps, adjustCents, totalCents },
  };
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
  // $5.02 carton, and the customer pays for it with the postage (unless the
  // shipping settings say otherwise).
  const packagingCents = packagingCostCents(plan.parcels);
  const pricing = await getShippingPricing();
  const priced = (options: ShippingOption[]): ShippingOption[] => options.map((o) => priceOption(o, pricing, packagingCents)).sort((a, b) => a.rateCents - b.rateCents);
  const charged = pricing.chargeBoxCost ? packagingCents : 0;

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
        rated.push({ parcel, rates: rates.map(fromEpRate) });
      }
      const options = aggregateLiveRates(rated);
      if (options.length > 0) return { options: priced(options), weightOz, boxes: plan.boxes, packagingCents: charged };
      return {
        options: priced(await tableOptions(args.address, weightOz, subtotalCents, plan.parcels)),
        weightOz,
        boxes: plan.boxes,
        packagingCents: charged,
        liveError: 'no carrier service could take every box in this order',
      };
    } catch (e: any) {
      // Never block checkout on a carrier outage — fall back to the table.
      return {
        options: priced(await tableOptions(args.address, weightOz, subtotalCents, plan.parcels)),
        weightOz,
        boxes: plan.boxes,
        packagingCents: charged,
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
    options: priced(await tableOptions(args.address, weightOz, subtotalCents, plan.parcels)),
    weightOz,
    boxes: plan.boxes,
    packagingCents: charged,
    liveError,
  };
}

export interface ParcelRate {
  carrier: string;
  service: string;
  /** What EasyPost bills for this label (its `rate`), in cents. */
  cents: number;
  /** The carrier's counter price, when reported. */
  retailCents: number | null;
  days: number | null;
}

export interface RatedParcel {
  parcel: Parcel;
  rates: ParcelRate[];
}

/** An EasyPost rate as the quote sees it: the billed price, never the retail one. */
export function fromEpRate(r: EpRate): ParcelRate {
  return {
    carrier: r.carrier,
    service: r.service,
    cents: toCents(r.rate),
    retailCents: r.retail_rate ? toCents(r.retail_rate) : null,
    days: r.delivery_days ?? r.est_delivery_days ?? null,
  };
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
 *
 * Prices here are the carrier part only; `priceOption` adds the boxes and
 * the adjustment. Should EasyPost list one service twice for a box, the
 * cheaper listing counts and the other is ignored, never summed.
 */
export function aggregateLiveRates(parcels: RatedParcel[]): ShippingOption[] {
  type Entry = { carrier: string; service: string; cents: number; days: number | null; boxes: QuotedBox[] };
  const perService = new Map<string, Entry>();
  const bestBoxes: QuotedBox[] = [];
  let bestCents = 0;
  let bestDays: number | null = null;

  const quoted = (p: Parcel, r: ParcelRate): QuotedBox => ({
    label: p.label, count: p.count, weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn,
    carrier: r.carrier, service: r.service, carrierName: carrierDisplayName(r.carrier), serviceName: serviceDisplayName(r.carrier, r.service),
    cents: r.cents, retailCents: r.retailCents, days: r.days, boxCents: p.costCents,
  });

  for (const { parcel, rates } of parcels) {
    // Identify by carrier+service, not the EasyPost rate id: quotes are
    // re-run at order time and EasyPost shipments/rate ids rotate, so a
    // stable id keeps the customer's choice resolvable.
    const cheapestByKey = new Map<string, ParcelRate>();
    for (const r of rates) {
      const key = `${LIVE_PREFIX}${r.carrier}:${r.service}`;
      const cur = cheapestByKey.get(key);
      if (!cur || r.cents < cur.cents) cheapestByKey.set(key, r);
    }
    let cheapest: ParcelRate | null = null;
    for (const [key, r] of cheapestByKey) {
      const cur = perService.get(key) ?? { carrier: r.carrier, service: r.service, cents: 0, days: null, boxes: [] };
      cur.cents += r.cents * parcel.count;
      cur.boxes.push(quoted(parcel, r));
      if (r.days) cur.days = Math.max(cur.days ?? 0, r.days);
      perService.set(key, cur);
      if (!cheapest || r.cents < cheapest.cents) cheapest = r;
    }
    if (!cheapest) return [];
    bestCents += cheapest.cents * parcel.count;
    bestBoxes.push(quoted(parcel, cheapest));
    if (cheapest.days) bestDays = Math.max(bestDays ?? 0, cheapest.days);
  }

  const options: ShippingOption[] = [...perService.entries()]
    .filter(([, v]) => v.boxes.length === parcels.length)
    .map(([id, v]) => ({
      id,
      name: methodDisplayName(v.carrier, v.service),
      rateCents: v.cents,
      estimatedDays: v.days ? `${v.days} days` : null,
      source: 'live' as const,
      carrier: v.carrier,
      service: v.service,
      breakdown: { boxes: v.boxes, carrierCents: v.cents, packagingCents: 0, adjustBps: 0, adjustCents: 0, totalCents: v.cents },
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
      breakdown: { boxes: bestBoxes, carrierCents: bestCents, packagingCents: 0, adjustBps: 0, adjustCents: 0, totalCents: bestCents },
    });
  }
  return options.sort((a, b) => a.rateCents - b.rateCents);
}

/** Package.costCents over every box in the plan. */
export function packagingCostCents(parcels: Parcel[]): number {
  return parcels.reduce((sum, p) => sum + Math.max(0, p.costCents) * p.count, 0);
}

export interface ResolvedShipping {
  cents: number;
  name: string | null;
  /** The option actually priced (the cheapest current one when the chosen service is gone). */
  optionId: string | null;
  breakdown: QuoteBreakdown | null;
}

/**
 * Re-derive the price for a selected shipping option. NEVER trust a price sent
 * by the client — this is what the order is actually charged.
 *
 * Live ids re-rate the same parcels and match the carrier+service, so a stale
 * EasyPost shipment (they expire) still resolves to a current price instead of
 * silently charging zero.
 */
export async function resolveShippingSelection(args: {
  optionId?: string | null;
  items: QuoteItem[];
  address: QuoteAddress;
  subtotalCents?: number;
}): Promise<ResolvedShipping> {
  const none: ResolvedShipping = { cents: 0, name: null, optionId: null, breakdown: null };
  if (!args.optionId) return none;

  const pick = (o: ShippingOption): ResolvedShipping => ({ cents: o.rateCents, name: o.name, optionId: o.id, breakdown: o.breakdown ?? null });

  if (args.optionId.startsWith(LIVE_PREFIX)) {
    // Re-rate now; the customer is charged the current price for the carrier +
    // service they chose, never a client-supplied number.
    const quote = await quoteShipping({ items: args.items, address: args.address, subtotalCents: args.subtotalCents });
    const exact = quote.options.find((o) => o.id === args.optionId);
    if (exact) return pick(exact);
    // That service is no longer offered for this parcel — fall back to the
    // cheapest current option rather than shipping for free.
    const cheapest = quote.options[0];
    return cheapest ? pick(cheapest) : none;
  }

  const rate = await prisma.shippingRate.findUnique({ where: { id: args.optionId } });
  if (!rate) return none;
  const plan = await planShipment(args.items);
  const pricing = await getShippingPricing();
  const cents = tableRateCents(rate, plan.weightOz, plan.boxes);
  return pick(priceOption({
    id: rate.id, name: rate.name, rateCents: cents, estimatedDays: rate.estimatedDays, source: 'table',
    breakdown: { boxes: boxesOf(plan.parcels), carrierCents: cents, packagingCents: 0, adjustBps: 0, adjustCents: 0, totalCents: cents },
  }, pricing, packagingCostCents(plan.parcels)));
}
