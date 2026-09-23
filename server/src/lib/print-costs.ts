/**
 * What it costs US to print an order — paper, press clicks, metal plates,
 * adhesive and per-book add-ons — from the same option snapshot each order
 * line already carries. Admin-only: nothing here is ever sent to a customer.
 *
 * The model, per book:
 *   interior   ceil(pages / pagesPerSheet) sheets of the interior stock, each
 *              printed both sides: clicksPerSide × 2 clicks at the colour or
 *              grayscale click rate.
 *   cover      1 sheet of the cover stock (Self Cover → the interior stock),
 *              printed on coverSidesPrinted sides.
 *   metal      a "Metal Covers" / "Raised Metal" / "Glow-in-the-Dark Metal"
 *              book is an ordinary 80# uncoated-cover book with a metal plate
 *              stuck on top: the paper cover and its clicks are counted as
 *              usual (on the stock mapped for metal.paperCoverType), plus one
 *              plate — a 300×600 mm sublimation sheet yields a fixed number of
 *              comic-size plates — plus adhesive (a roll is bought by the
 *              foot; each plate uses a set length), plus any per-piece extra.
 *   add-ons    flat cents per book keyed "Cover: <type>", "Lamination: <style>",
 *              "UV: <style>", "Foil: <colour>". Unknown keys cost 0 and are
 *              listed as notes, so glow / foil pricing can be filled in later.
 *   spoilage   spoilagePct extra on every consumable.
 *
 * Metal art prints use the plate model with their own yields; every other
 * product (paper prints, mailers, Comic Armor…) is a flat per-unit cost.
 *
 * Every number lives in the `costs.print` setting (Settings → Print costs).
 * Costs are in cents; fractional cents are fine (a sheet is 7.79¢).
 */
import { prisma } from '../db.js';
import { getSetting, setSetting } from './settings.js';
import { PROOF_PRODUCT_SLUG, itemTitle } from './proofs.js';

export type SheetSize = '11x17' | '12x18';
export const SHEET_SIZES: SheetSize[] = ['11x17', '12x18'];

export interface PaperStock {
  /** Vendor item code, e.g. "279498". */
  code: string;
  name: string;
  sheet: SheetSize;
  /** Direct per-sheet cost; when null it is derived from cartonCents / sheetsPerCarton. */
  costPerSheetCents: number | null;
  cartonCents: number | null;
  sheetsPerCarton: number | null;
}

/** option label → sheet size → stock code */
export type StockMap = Record<string, Partial<Record<SheetSize, string>>>;

export interface PrintCostConfig {
  version: 1;
  clicks: { colorCents: number; grayscaleCents: number; perSide: Record<SheetSize, number> };
  coverSidesPrinted: 1 | 2;
  spoilagePct: number;
  pagesPerSheet: number;
  /** Book trim (product slug segment: a5 / standard / magazine / letter) → sheet it prints on. */
  sheetSizeByTrim: Record<string, SheetSize>;
  stocks: PaperStock[];
  interiorStock: StockMap;
  coverStock: StockMap;
  metal: {
    sheetCostCents: number;
    /** Cover Type labels that get a metal plate. */
    coverTypes: string[];
    /** The paper cover a metal book is built on (a Cover Type label, mapped in coverStock). */
    paperCoverType: string;
    yields: { comicCover: number; tradingCard: number; print11x17: number; printComic: number };
    /** Sublimation transfer paper, ink… per plate. */
    extraPerPieceCents: number;
    adhesive: { rollCents: number; rollFeet: number; feetPerPiece: number };
  };
  addOnCents: Record<string, number>;
  /** Flat per-unit cost for products the sheet model does not cover, by product slug. */
  productUnitCents: Record<string, number>;
}

export const COST_SETTING_KEY = 'costs.print';

export const DEFAULT_PRINT_COSTS: PrintCostConfig = {
  version: 1,
  clicks: { colorCents: 4.5, grayscaleCents: 4.5, perSide: { '11x17': 2, '12x18': 2 } },
  coverSidesPrinted: 2,
  spoilagePct: 0,
  pagesPerSheet: 4,
  sheetSizeByTrim: { a5: '11x17', standard: '11x17', magazine: '11x17', letter: '12x18' },
  stocks: [
    { code: '279498', name: '11X17-80-31M-L-WHITE — 80# text, long grain', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '279652', name: '11X17-100-39M-L-WHITE — 100# text, long grain', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '279656', name: '17X11-80-58M-S-WHITE — 80# cover, short grain', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '2868', name: '17X11-80-58M-WHITE — 80# cover', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '2289D', name: '17X11-100-72M-WHITE — 100# cover', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '279661', name: '18X12-100-83M-S-WHITE — 100# cover, short grain', sheet: '12x18', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '2DT121711C', name: '17X11-12PT-69M-WHITE — 12pt cover', sheet: '11x17', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
    { code: '2DT141812C', name: '18X12-14PT-90M-WHITE — 14pt cover', sheet: '12x18', costPerSheetCents: null, cartonCents: null, sheetsPerCarton: null },
  ],
  interiorStock: { Gloss: { '11x17': '279498' } },
  coverStock: { 'Standard Gloss': { '11x17': '279656' } },
  metal: {
    sheetCostCents: 156,
    coverTypes: ['Metal Covers', 'Raised Metal', 'Glow-in-the-Dark Metal'],
    paperCoverType: 'Standard Matte',
    yields: { comicCover: 3, tradingCard: 30, print11x17: 1, printComic: 3 },
    extraPerPieceCents: 0,
    adhesive: { rollCents: 1400, rollFeet: 33, feetPerPiece: 1 },
  },
  addOnCents: {},
  productUnitCents: {},
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function isSheet(v: unknown): v is SheetSize {
  return v === '11x17' || v === '12x18';
}
function stockMap(v: unknown): StockMap {
  const out: StockMap = {};
  if (!v || typeof v !== 'object') return out;
  for (const [label, bySize] of Object.entries(v as Record<string, unknown>)) {
    if (!bySize || typeof bySize !== 'object') continue;
    const m: Partial<Record<SheetSize, string>> = {};
    for (const [size, code] of Object.entries(bySize as Record<string, unknown>)) {
      if (isSheet(size) && typeof code === 'string' && code) m[size] = code;
    }
    out[label] = m;
  }
  return out;
}
function centsMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    const n = numOrNull(c);
    if (n !== null) out[k] = n;
  }
  return out;
}

/** Coerce whatever was stored (or posted) into a complete, well-typed config. */
export function normalizePrintCosts(raw: unknown): PrintCostConfig {
  const d = DEFAULT_PRINT_COSTS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const clicks = r.clicks ?? {};
  const metal = r.metal ?? {};
  const sheetSizeByTrim: Record<string, SheetSize> = { ...d.sheetSizeByTrim };
  for (const [k, v] of Object.entries(r.sheetSizeByTrim ?? {})) if (isSheet(v)) sheetSizeByTrim[k] = v;
  const stocks: PaperStock[] = Array.isArray(r.stocks)
    ? r.stocks
      .filter((s: any) => s && typeof s.code === 'string' && s.code.trim())
      .map((s: any) => ({
        code: String(s.code).trim(),
        name: typeof s.name === 'string' ? s.name : '',
        sheet: isSheet(s.sheet) ? s.sheet : '11x17',
        costPerSheetCents: numOrNull(s.costPerSheetCents),
        cartonCents: numOrNull(s.cartonCents),
        sheetsPerCarton: numOrNull(s.sheetsPerCarton),
      }))
    : d.stocks;
  return {
    version: 1,
    clicks: {
      colorCents: num(clicks.colorCents, d.clicks.colorCents),
      grayscaleCents: num(clicks.grayscaleCents, d.clicks.grayscaleCents),
      perSide: { '11x17': num(clicks.perSide?.['11x17'], 2), '12x18': num(clicks.perSide?.['12x18'], 2) },
    },
    coverSidesPrinted: r.coverSidesPrinted === 1 ? 1 : 2,
    spoilagePct: Math.max(0, num(r.spoilagePct, 0)),
    pagesPerSheet: Math.max(1, num(r.pagesPerSheet, 4)),
    sheetSizeByTrim,
    stocks,
    interiorStock: r.interiorStock ? stockMap(r.interiorStock) : d.interiorStock,
    coverStock: r.coverStock ? stockMap(r.coverStock) : d.coverStock,
    metal: {
      sheetCostCents: num(metal.sheetCostCents, d.metal.sheetCostCents),
      coverTypes: Array.isArray(metal.coverTypes) ? metal.coverTypes.filter((x: unknown) => typeof x === 'string') : d.metal.coverTypes,
      paperCoverType: typeof metal.paperCoverType === 'string' ? metal.paperCoverType : d.metal.paperCoverType,
      yields: {
        comicCover: Math.max(1, num(metal.yields?.comicCover, d.metal.yields.comicCover)),
        tradingCard: Math.max(1, num(metal.yields?.tradingCard, d.metal.yields.tradingCard)),
        print11x17: Math.max(1, num(metal.yields?.print11x17, d.metal.yields.print11x17)),
        printComic: Math.max(1, num(metal.yields?.printComic, d.metal.yields.printComic)),
      },
      extraPerPieceCents: num(metal.extraPerPieceCents, 0),
      adhesive: {
        rollCents: num(metal.adhesive?.rollCents, d.metal.adhesive.rollCents),
        rollFeet: Math.max(0.01, num(metal.adhesive?.rollFeet, d.metal.adhesive.rollFeet)),
        feetPerPiece: Math.max(0, num(metal.adhesive?.feetPerPiece, d.metal.adhesive.feetPerPiece)),
      },
    },
    addOnCents: centsMap(r.addOnCents),
    productUnitCents: centsMap(r.productUnitCents),
  };
}

export async function loadPrintCosts(): Promise<PrintCostConfig> {
  return normalizePrintCosts(await getSetting<unknown>(COST_SETTING_KEY, null));
}

export async function savePrintCosts(raw: unknown): Promise<PrintCostConfig> {
  const cfg = normalizePrintCosts(raw);
  await setSetting(COST_SETTING_KEY, cfg as unknown as object);
  return cfg;
}

/** Per-sheet cost of a stock, from the direct figure or carton ÷ sheets. */
export function sheetCents(s: PaperStock): number | null {
  if (s.costPerSheetCents !== null && s.costPerSheetCents > 0) return s.costPerSheetCents;
  if (s.cartonCents && s.sheetsPerCarton) return s.cartonCents / s.sheetsPerCarton;
  return null;
}

export function metalPieceCents(cfg: PrintCostConfig, perSheet: number): number {
  const a = cfg.metal.adhesive;
  const adhesive = a.rollFeet > 0 ? (a.rollCents / a.rollFeet) * a.feetPerPiece : 0;
  return cfg.metal.sheetCostCents / Math.max(1, perSheet) + cfg.metal.extraPerPieceCents + adhesive;
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export interface CostLine {
  label: string;
  qty: number;
  unit: 'sheet' | 'click' | 'plate' | 'book' | 'unit';
  unitCents: number;
  cents: number;
}

export interface ItemCostEstimate {
  orderItemId: string;
  name: string;
  title: string;
  quantity: number;
  /** ok = fully costed; partial = some inputs missing; none = nothing known. */
  status: 'ok' | 'partial' | 'none';
  /** Cost of ONE unit, in (fractional) cents. */
  perUnitCents: number;
  totalCents: number;
  /** Per one unit. */
  lines: CostLine[];
  /** Inputs that would make this line complete. */
  missing: string[];
  /** Things that cost 0 only because nobody set a figure yet. */
  notes: string[];
}

export interface OrderCostEstimate {
  items: ItemCostEstimate[];
  materialsCents: number;
  goodsCents: number;
  marginCents: number;
  marginPct: number | null;
  complete: boolean;
  missing: string[];
  notes: string[];
}

export interface CostableItem {
  id: string;
  name: string;
  quantity: number;
  options: unknown;
  product: { slug: string; name: string; pricingConfig: unknown };
}

const BOOK_SLUG = /^(comic|graphic-novel)-([a-z0-9]+)-size$/;

function opt(options: unknown, key: string): string {
  const v = (options as Record<string, unknown> | null | undefined)?.[key];
  return v === null || v === undefined ? '' : String(v).trim();
}

function findStock(cfg: PrintCostConfig, code: string | undefined): PaperStock | undefined {
  return code ? cfg.stocks.find((s) => s.code === code) : undefined;
}

interface Resolved { stock?: PaperStock; cents?: number; missing?: string }

/** Which stock (and what it costs per sheet) prints `label` on `sheet`. */
function resolve(cfg: PrintCostConfig, map: StockMap, role: 'interior' | 'cover', label: string, sheet: SheetSize): Resolved {
  if (!label) return { missing: `${role} paper selection` };
  const code = map[label]?.[sheet];
  const stock = findStock(cfg, code);
  if (!stock) return { missing: `which stock prints "${label}" ${role}s on ${sheet}` };
  const cents = sheetCents(stock);
  if (cents === null) return { stock, missing: `per-sheet cost for ${stock.code}` };
  return { stock, cents };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function estimateBook(item: CostableItem, trim: string, cfg: PrintCostConfig): { lines: CostLine[]; missing: string[]; notes: string[] } {
  const lines: CostLine[] = [];
  const missing: string[] = [];
  const notes: string[] = [];
  const o = item.options;
  const sheet = cfg.sheetSizeByTrim[trim] ?? '11x17';
  const waste = 1 + cfg.spoilagePct / 100;
  const perSide = cfg.clicks.perSide[sheet] ?? 2;
  const grayscale = /gray|grey|b&w|black/i.test(opt(o, 'interior_color'));
  const clickCents = grayscale ? cfg.clicks.grayscaleCents : cfg.clicks.colorCents;

  // Interior
  const pages = parseInt(opt(o, 'interior_pages'), 10);
  const interiorPaper = opt(o, 'interior_paper');
  const interior = resolve(cfg, cfg.interiorStock, 'interior', interiorPaper, sheet);
  if (!pages) {
    missing.push('page count');
  } else {
    const sheets = r2(Math.ceil(pages / cfg.pagesPerSheet) * waste);
    if (interior.cents !== undefined) {
      lines.push({ label: `Interior paper — ${interior.stock!.code} (${pages} pages → ${sheets} × ${sheet})`, qty: sheets, unit: 'sheet', unitCents: interior.cents, cents: sheets * interior.cents });
    } else missing.push(interior.missing!);
    const clicks = r2(sheets * perSide * 2);
    lines.push({ label: `Interior clicks (${sheets} sheets × ${perSide} × 2 sides${grayscale ? ', grayscale' : ''})`, qty: clicks, unit: 'click', unitCents: clickCents, cents: clicks * clickCents });
  }

  // Cover
  const coverType = opt(o, 'cover_paper');
  const isMetal = cfg.metal.coverTypes.includes(coverType);
  const selfCover = /self/i.test(coverType);
  const coverSheets = r2(1 * waste);
  if (!coverType) {
    missing.push('cover selection');
  } else {
    const paperLabel = isMetal ? cfg.metal.paperCoverType : coverType;
    const cover = selfCover
      ? resolve(cfg, cfg.interiorStock, 'interior', interiorPaper, sheet)
      : resolve(cfg, cfg.coverStock, 'cover', paperLabel, sheet);
    if (cover.cents !== undefined) {
      lines.push({ label: `Cover paper — ${cover.stock!.code}${isMetal ? ` (${paperLabel} under the metal)` : selfCover ? ' (self cover, interior stock)' : ''}`, qty: coverSheets, unit: 'sheet', unitCents: cover.cents, cents: coverSheets * cover.cents });
    } else missing.push(cover.missing!);
    const coverClicks = r2(coverSheets * perSide * cfg.coverSidesPrinted);
    lines.push({ label: `Cover clicks (${perSide} × ${cfg.coverSidesPrinted} side${cfg.coverSidesPrinted === 1 ? '' : 's'})`, qty: coverClicks, unit: 'click', unitCents: cfg.clicks.colorCents, cents: coverClicks * cfg.clicks.colorCents });
    if (isMetal) {
      const y = cfg.metal.yields.comicCover;
      const piece = metalPieceCents(cfg, y);
      const qty = r2(1 * waste);
      lines.push({ label: `Metal plate — ${coverType} (1 of ${y} per sheet, + adhesive)`, qty, unit: 'plate', unitCents: piece, cents: qty * piece });
    }
    // Special covers may carry a flat extra (raised layer, glow ink…).
    if (!/^standard|^self/i.test(coverType)) {
      const key = `Cover: ${coverType}`;
      const c = cfg.addOnCents[key];
      if (c) lines.push({ label: key, qty: 1, unit: 'book', unitCents: c, cents: c });
      else notes.push(`no add-on cost set for "${key}"`);
    }
  }

  // Embellishments
  const emb = opt(o, 'embellishment');
  const pairs: [string, string][] = [
    ['Lamination', opt(o, 'lamination')],
    ['UV', opt(o, 'uv')],
    ['Foil', opt(o, 'foil')],
  ];
  for (const [kind, value] of pairs) {
    if (!value || /^none$/i.test(value)) continue;
    if (emb && !/^none$/i.test(emb) && emb.toLowerCase() !== kind.toLowerCase()) continue; // a stale value from another choice
    const key = `${kind}: ${value}`;
    const c = cfg.addOnCents[key] ?? cfg.addOnCents[kind];
    if (c) lines.push({ label: key, qty: 1, unit: 'book', unitCents: c, cents: c });
    else notes.push(`no add-on cost set for "${key}"`);
  }

  return { lines, missing, notes };
}

function estimateMetalPrint(item: CostableItem, cfg: PrintCostConfig): { lines: CostLine[]; missing: string[]; notes: string[] } {
  const size = opt(item.options, 'print_size');
  const full = /11\s*[x×]\s*17/i.test(size);
  const y = full ? cfg.metal.yields.print11x17 : cfg.metal.yields.printComic;
  const piece = metalPieceCents(cfg, y);
  const qty = r2(1 + cfg.spoilagePct / 100);
  const lines: CostLine[] = [{ label: `Metal plate — ${size || 'print'} (1 of ${y} per sheet, + adhesive)`, qty, unit: 'plate', unitCents: piece, cents: qty * piece }];
  const notes: string[] = [];
  const extra = cfg.productUnitCents[item.product.slug];
  if (extra) lines.push({ label: `Extra per print — ${item.product.name}`, qty: 1, unit: 'unit', unitCents: extra, cents: extra });
  return { lines, missing: [], notes };
}

export function estimateItem(item: CostableItem, cfg: PrintCostConfig): ItemCostEstimate {
  const slug = item.product.slug;
  let est: { lines: CostLine[]; missing: string[]; notes: string[] };
  const book = BOOK_SLUG.exec(slug);
  if (book) est = estimateBook(item, book[2]!, cfg);
  else if (/^art-print-metal/.test(slug)) est = estimateMetalPrint(item, cfg);
  else {
    const c = cfg.productUnitCents[slug];
    est = c
      ? { lines: [{ label: `Unit cost — ${item.product.name}`, qty: 1, unit: 'unit', unitCents: c, cents: c }], missing: [], notes: [] }
      : { lines: [], missing: [`per-unit cost for ${item.product.name}`], notes: [] };
  }
  const perUnitCents = est.lines.reduce((s, l) => s + l.cents, 0);
  const status: ItemCostEstimate['status'] = est.missing.length === 0 ? 'ok' : est.lines.length > 0 ? 'partial' : 'none';
  return {
    orderItemId: item.id,
    name: item.name,
    title: itemTitle(item),
    quantity: item.quantity,
    status,
    perUnitCents,
    totalCents: perUnitCents * item.quantity,
    lines: est.lines,
    missing: est.missing,
    notes: est.notes,
  };
}

export function estimateOrder(
  order: { subtotalCents: number; discountCents: number; items: CostableItem[] },
  cfg: PrintCostConfig,
): OrderCostEstimate {
  const items = order.items
    .filter((i) => i.product.slug !== PROOF_PRODUCT_SLUG)
    .map((i) => estimateItem(i, cfg));
  const materialsCents = items.reduce((s, i) => s + i.totalCents, 0);
  const goodsCents = order.subtotalCents - order.discountCents;
  const marginCents = goodsCents - materialsCents;
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    items,
    materialsCents,
    goodsCents,
    marginCents,
    marginPct: goodsCents > 0 ? (marginCents / goodsCents) * 100 : null,
    complete: items.every((i) => i.status === 'ok'),
    missing: uniq(items.flatMap((i) => i.missing)),
    notes: uniq(items.flatMap((i) => i.notes)),
  };
}

export async function estimateOrderCosts(orderId: string): Promise<OrderCostEstimate | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      subtotalCents: true,
      discountCents: true,
      items: { select: { id: true, name: true, quantity: true, options: true, product: { select: { slug: true, name: true, pricingConfig: true } } } },
    },
  });
  if (!order) return null;
  return estimateOrder(order, await loadPrintCosts());
}

// ---------------------------------------------------------------------------
// Reference lists for the settings screen (what the mapping tables offer)
// ---------------------------------------------------------------------------

export interface PrintCostRefs {
  trims: { key: string; name: string }[];
  interiorPapers: string[];
  coverTypes: string[];
  /** Add-on keys the estimate will look up: "Cover: Raised Metal", "Lamination: Gloss", … */
  addOnKeys: string[];
  /** Products costed per unit (everything that is not a book or a metal print). */
  products: { slug: string; name: string }[];
}

export async function printCostRefs(): Promise<PrintCostRefs> {
  const products = await prisma.product.findMany({
    where: { active: true, slug: { not: PROOF_PRODUCT_SLUG } },
    select: { slug: true, name: true, options: { select: { name: true, values: { select: { label: true }, orderBy: { sortOrder: 'asc' } } } } },
    orderBy: { name: 'asc' },
  });
  const trims = new Map<string, string>();
  const interior = new Set<string>();
  const covers = new Set<string>();
  const addOns = new Set<string>();
  const others: { slug: string; name: string }[] = [];
  for (const p of products) {
    const m = BOOK_SLUG.exec(p.slug);
    if (m) {
      const trim = m[2]!;
      if (!trims.has(trim)) trims.set(trim, p.name.replace(/^.*?—\s*/, ''));
      for (const o of p.options) {
        const labels = o.values.map((v) => v.label);
        if (o.name === 'Interior Paper') labels.forEach((l) => interior.add(l));
        if (o.name === 'Cover Type') labels.forEach((l) => { covers.add(l); if (!/^standard|^self/i.test(l)) addOns.add(`Cover: ${l}`); });
        if (o.name === 'Lamination Style') labels.forEach((l) => addOns.add(`Lamination: ${l}`));
        if (o.name === 'UV Style') labels.forEach((l) => addOns.add(`UV: ${l}`));
        if (o.name === 'Foil Cover') labels.forEach((l) => addOns.add(`Foil: ${l}`));
      }
    } else if (!/^art-print-metal/.test(p.slug)) {
      others.push({ slug: p.slug, name: p.name });
    }
  }
  const order = ['a5', 'standard', 'magazine', 'letter'];
  return {
    trims: [...trims.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([key, name]) => ({ key, name })),
    interiorPapers: [...interior],
    coverTypes: [...covers],
    addOnKeys: [...addOns],
    products: others,
  };
}
