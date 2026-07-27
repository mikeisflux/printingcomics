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

export interface WeighableItem {
  name?: string;
  options?: unknown;
  product?: {
    name?: string | null;
    weightGrams?: number | null;
    pricingConfig?: unknown;
  } | null;
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
