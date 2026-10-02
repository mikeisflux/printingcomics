/**
 * Per-unit shipping weight for an order/cart line.
 *
 * Three sources, in priority order:
 *   1. `pricingConfig.sizeWeightsGrams[<selected size>]` — art prints, where
 *      weight depends on the chosen trim size.
 *   2. `Product.weightGrams` — an explicit per-unit weight.
 *   3. A physical estimate from the configurator options — books are printed
 *      to order, so their weight is a function of trim size, page count, and
 *      paper stock rather than a fixed number. Without this a 50-book order
 *      weighs 0 and gets quoted a minimum-parcel rate.
 */

/** Grams per square metre for the interior/cover stocks we sell. */
const TEXT_GSM: Record<string, number> = {
  uncoated: 89,      // 60# uncoated text
  semigloss: 118,    // 80# silk text
  gloss: 118,        // 80# gloss text
};
const COVER_GSM: Record<string, number> = {
  selfcover: 118,        // same stock as the interior
  standardmatte: 216,    // 80# cover
  standardsemigloss: 216,
  standardgloss: 216,
  deluxegloss: 270,      // 100# cover
  premiumgloss: 270,
  sketch: 270,           // 100# sketch
  holochrome: 300,
  metalcovers: 350,
  raisedmetal: 350,
  glowinthedarkmetal: 300,
};
const DEFAULT_TEXT_GSM = 118;
const DEFAULT_COVER_GSM = 270;

/** Sheet thickness (inches) for the same stocks — how tall a stack of books gets. */
const TEXT_CALIPER_IN: Record<string, number> = {
  uncoated: 0.0050,   // 60# uncoated text
  semigloss: 0.0040,  // 80# silk text
  gloss: 0.0040,      // 80# gloss text
};
const COVER_CALIPER_IN: Record<string, number> = {
  selfcover: 0.0040,
  standardmatte: 0.0085,    // 80# cover
  standardsemigloss: 0.0085,
  standardgloss: 0.0085,
  deluxegloss: 0.0110,      // 100# cover
  premiumgloss: 0.0110,
  sketch: 0.0110,
  holochrome: 0.0120,
  metalcovers: 0.0260,      // 80# cover with the plate stuck on
  raisedmetal: 0.0300,
  glowinthedarkmetal: 0.0260,
};
const DEFAULT_TEXT_CALIPER_IN = 0.0045;
const DEFAULT_COVER_CALIPER_IN = 0.0110;
/** Folded signatures and air between sheets: a stack is a little taller than its paper. */
const STACK_BULK = 1.15;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Trim size in inches parsed from a product name, e.g. `… (6.625" × 10.25")`. */
function parseTrimInches(name: string): { w: number; h: number } | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*["”]?\s*[×x]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : null;
}

const SQ_IN_PER_SQ_M = 1550.0031;

export interface ShipsInBox {
  id: string;
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  emptyWeightOz: number;
  maxWeightOz: number | null;
}

export interface WeighableItem {
  name?: string;
  options?: unknown;
  product?: {
    name?: string | null;
    weightGrams?: number | null;
    pricingConfig?: unknown;
    /** The box this product ships in on its own (see Product.package). */
    package?: ShipsInBox | null;
    /** Packed size of one unit, when the product declares it (shelf goods). */
    unitLengthIn?: number | null;
    unitWidthIn?: number | null;
    unitHeightIn?: number | null;
    /** Loose units in one of this product (a 25-pack of mailers = 25). */
    unitsPerItem?: number | null;
    /** The pile this product sells from, with the boxes that pile ships in. */
    stockPool?: { boxes?: unknown } | null;
  } | null;
}

export interface PoolBox {
  packageId: string;
  maxUnits: number;
}

/** A stock pool's `boxes` JSON, validated: [{ packageId, maxUnits }]. */
export function poolBoxes(raw: unknown): PoolBox[] {
  if (!Array.isArray(raw)) return [];
  const out: PoolBox[] = [];
  for (const b of raw) {
    const packageId = (b as any)?.packageId;
    const maxUnits = Number((b as any)?.maxUnits);
    if (typeof packageId === 'string' && packageId && Number.isFinite(maxUnits) && maxUnits > 0) out.push({ packageId, maxUnits });
  }
  return out;
}

/**
 * The boxes one of this line may ship in and the share of each box's count
 * it takes — from its stock pool's boxes (a 25-pack of mailers takes half of
 * the box that holds 50). Null when the product has no such rule.
 */
export function allowedBoxesFor(item: WeighableItem): { packageId: string; share: number }[] | null {
  const boxes = poolBoxes(item.product?.stockPool?.boxes);
  if (boxes.length === 0) return null;
  const units = Math.max(1, item.product?.unitsPerItem ?? 1);
  return boxes.map((b) => ({ packageId: b.packageId, share: units / b.maxUnits }));
}

/**
 * Estimate a made-to-order book's weight: the interior is `pages / 2` sheets
 * of text stock, and the cover is one sheet folded around it (so twice the
 * trim area). Returns null when the line doesn't look like a book.
 */
function estimateBookGrams(item: WeighableItem): number | null {
  const opts = (item.options ?? {}) as Record<string, unknown>;
  const rawPages = opts['interior_pages'];
  const pages = typeof rawPages === 'number' ? rawPages : Number(rawPages);
  if (!Number.isFinite(pages) || pages <= 0) return null;

  const trim = parseTrimInches(String(item.product?.name ?? item.name ?? ''));
  if (!trim) return null;

  const areaM2 = (trim.w * trim.h) / SQ_IN_PER_SQ_M;
  const textGsm = TEXT_GSM[norm(String(opts['interior_paper'] ?? ''))] ?? DEFAULT_TEXT_GSM;
  const coverKey = norm(String(opts['cover_paper'] ?? ''));
  const coverGsm = COVER_GSM[coverKey] ?? DEFAULT_COVER_GSM;

  const interiorGrams = (pages / 2) * areaM2 * textGsm;
  // The cover is a single sheet folded to make front + back.
  const coverGrams = coverKey === 'selfcover' ? 0 : 2 * areaM2 * coverGsm;
  return interiorGrams + coverGrams;
}

export interface UnitDimsIn {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
}

/**
 * Footprint and thickness of one unit, for packing: the size the product
 * declares (a pack of mailers, a case of sleeves), else a book from its trim
 * size and page count (interior sheets plus the folded cover), or an art print
 * from the size it was ordered in. Null when the line's size is not known, in
 * which case only weight limits how many go in a box.
 */
export function unitDimensionsIn(item: WeighableItem): UnitDimsIn | null {
  const p = item.product;
  if (p && (p.unitLengthIn ?? 0) > 0 && (p.unitWidthIn ?? 0) > 0 && (p.unitHeightIn ?? 0) > 0) {
    return { lengthIn: p.unitLengthIn!, widthIn: p.unitWidthIn!, thicknessIn: p.unitHeightIn! };
  }
  const opts = (item.options ?? {}) as Record<string, unknown>;

  const size = opts['print_size'];
  const cfg = item.product?.pricingConfig as { sizeWeightsGrams?: Record<string, number> } | null | undefined;
  if (cfg?.sizeWeightsGrams && typeof size === 'string') {
    const trim = parseTrimInches(size);
    if (trim) return { lengthIn: trim.h, widthIn: trim.w, thicknessIn: 0.012 };
  }

  const trim = parseTrimInches(String(item.product?.name ?? item.name ?? ''));
  if (!trim) return null;
  const rawPages = opts['interior_pages'];
  const pages = typeof rawPages === 'number' ? rawPages : Number(rawPages);
  if (!Number.isFinite(pages) || pages <= 0) return null;

  const text = TEXT_CALIPER_IN[norm(String(opts['interior_paper'] ?? ''))] ?? DEFAULT_TEXT_CALIPER_IN;
  const coverKey = norm(String(opts['cover_paper'] ?? ''));
  const cover = COVER_CALIPER_IN[coverKey] ?? DEFAULT_COVER_CALIPER_IN;
  // pages/2 sheets of text; the cover wraps front and back (two plies).
  const thicknessIn = ((pages / 2) * text + (coverKey === 'selfcover' ? 0 : 2 * cover)) * STACK_BULK;
  return { lengthIn: trim.h, widthIn: trim.w, thicknessIn: +thicknessIn.toFixed(4) };
}

/** Per-unit weight in grams for a cart/order line. Never negative. */
export function perUnitWeightGrams(item: WeighableItem): number {
  const cfg = item.product?.pricingConfig as
    | { sizeWeightsGrams?: Record<string, number> }
    | null
    | undefined;
  const size = (item.options as Record<string, unknown> | null | undefined)?.['print_size'];
  if (cfg?.sizeWeightsGrams && typeof size === 'string') {
    const g = cfg.sizeWeightsGrams[size];
    if (typeof g === 'number' && g > 0) return g;
  }

  const explicit = item.product?.weightGrams ?? 0;
  if (explicit > 0) return explicit;

  return Math.max(0, estimateBookGrams(item) ?? 0);
}

export const GRAMS_PER_OZ = 28.3495;

/** Total content weight (ounces) for a set of lines, honoring quantity. */
export function contentWeightOz(items: Array<WeighableItem & { quantity: number }>): number {
  const grams = items.reduce((sum, i) => sum + perUnitWeightGrams(i) * (i.quantity ?? 0), 0);
  return grams / GRAMS_PER_OZ;
}
