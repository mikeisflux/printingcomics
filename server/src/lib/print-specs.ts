/**
 * The page size every print PDF must be, and the inspection that enforces it.
 *
 * Our templates (/resources/templates) are built at the trim size plus 0.125"
 * bleed on every side, so a Standard Comic page is 6.875 × 10.5 in, an A5
 * page 6.05 × 8.55, an 11 × 17 art print 11.25 × 17.25. A file is read with
 * poppler's pdfinfo the moment it is uploaded and every page is measured:
 * anything that is not the template size — no bleed, the wrong trim, a
 * spread, a page turned sideways, printer's marks, pages of mixed sizes — is
 * refused on the spot with a message that names the size we measured, the
 * size we need, and the template that is already set up that way.
 *
 * The reason keys match the "Request new file" list (lib/file-requests.ts),
 * so the automatic refusal and a staff request read the same way.
 */
import { readPdfPages } from './pod/preflight.js';
import type { PrintFileKind } from './print-files.js';

export const BLEED_IN = 0.125;
/** Rounding slack: a PDF written in points is rarely exact to the thousandth. */
export const SIZE_TOLERANCE_IN = 0.04;

export interface TrimSpec {
  key: string;
  /** "Standard Comic", "A5", "Art Print"… */
  label: string;
  trimW: number;
  trimH: number;
  /** Which template on /resources/templates matches, when one does. */
  template: { label: string; path: string } | null;
}

export const TRIMS: Record<string, TrimSpec> = {
  'a5': { key: 'a5', label: 'A5', trimW: 5.8, trimH: 8.3, template: { label: 'A5 (5.8 × 8.3 in)', path: '/templates/template-a5.pdf' } },
  'standard': { key: 'standard', label: 'Standard Comic', trimW: 6.625, trimH: 10.25, template: { label: 'Standard Comic (6.625 × 10.25 in)', path: '/templates/template-standard.pdf' } },
  'magazine': { key: 'magazine', label: 'Magazine', trimW: 8, trimH: 10.5, template: { label: 'Magazine (8 × 10.5 in)', path: '/templates/template-magazine.pdf' } },
  'letter': { key: 'letter', label: 'US Letter', trimW: 8.5, trimH: 11, template: { label: 'US Letter (8.5 × 11 in)', path: '/templates/template-letter.pdf' } },
  'art-print': { key: 'art-print', label: 'Art Print', trimW: 11, trimH: 17, template: { label: 'Art Print (11 × 17 in)', path: '/templates/template-art-print.pdf' } },
  'trading-card': { key: 'trading-card', label: 'Trading Card', trimW: 2.5, trimH: 3.5, template: { label: 'Trading Card (2.5 × 3.5 in)', path: '/templates/template-trading-card.pdf' } },
};

/** The finished page: trim plus bleed on every side. */
export function pageSizeFor(spec: TrimSpec): { w: number; h: number } {
  return { w: spec.trimW + 2 * BLEED_IN, h: spec.trimH + 2 * BLEED_IN };
}

const r3 = (n: number) => Number(n.toFixed(3));
export const inches = (s: { w: number; h: number }) => `${r3(s.w)} × ${r3(s.h)} in`;

/** "11×17", "Comic (6.625 × 10.25)", 'Standard (6.625" × 10.25")' → width and height. */
export function parseDimensions(text: string | null | undefined): { w: number; h: number } | null {
  const m = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*["”]?\s*[×x]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

const near = (a: number, b: number, tol = SIZE_TOLERANCE_IN) => Math.abs(a - b) <= tol;

/** The named trim whose dimensions these are, if any. */
function trimByDimensions(d: { w: number; h: number }): TrimSpec | null {
  return Object.values(TRIMS).find((t) => near(t.trimW, d.w) && near(t.trimH, d.h)) ?? null;
}

type SpecItem = {
  options?: unknown;
  product?: { slug?: string | null; name?: string | null; pricingConfig?: unknown } | null;
};

/**
 * What size this line's files must be. Books carry the trim in the product
 * slug (comic-standard-size, graphic-novel-a5-size); art prints carry it in
 * the chosen print_size ("11×17", "Comic (6.625 × 10.25)"); anything else is
 * matched by name. Null when we cannot tell, and then the size is not checked.
 */
export function trimSpecFor(item: SpecItem | null | undefined): TrimSpec | null {
  const slug = (item?.product?.slug ?? '').toLowerCase();
  const name = (item?.product?.name ?? '').toLowerCase();
  const options = (item?.options && typeof item.options === 'object' ? item.options : {}) as Record<string, unknown>;
  const cfg = item?.product?.pricingConfig as { kind?: string } | null | undefined;

  const book = slug.match(/^(?:comic|graphic-novel)-([a-z0-9]+)-size$/);
  if (book && TRIMS[book[1]!]) return TRIMS[book[1]!]!;

  if (cfg?.kind === 'print' || /art-print|art print/.test(`${slug} ${name}`)) {
    const chosen = typeof options['print_size'] === 'string' ? (options['print_size'] as string) : '';
    const d = parseDimensions(chosen);
    if (d) return trimByDimensions(d) ?? { key: 'custom', label: `${r3(d.w)} × ${r3(d.h)} in`, trimW: d.w, trimH: d.h, template: null };
    // The 11 × 17 sheet is the default size for every substrate (see seed-cws.ts).
    return TRIMS['art-print']!;
  }

  const s = `${slug} ${name}`;
  if (/trading.?card/.test(s)) return TRIMS['trading-card']!;
  if (/\ba5\b/.test(s)) return TRIMS['a5']!;
  if (/magazine/.test(s)) return TRIMS['magazine']!;
  if (/letter/.test(s)) return TRIMS['letter']!;
  if (/standard/.test(s)) return TRIMS['standard']!;
  const named = parseDimensions(name);
  return named ? trimByDimensions(named) : null;
}

export interface SizeProblem {
  /** A key from FILE_REQUEST_REASONS. */
  reason: 'wrong_size' | 'no_bleed' | 'mixed_page_sizes' | 'wrong_orientation' | 'spreads' | 'crop_marks' | 'password_protected';
  detail: string;
}

export interface Inspection {
  pages: number;
  /** The first page's size; what the file "is" when every page agrees. */
  sizeIn: { w: number; h: number } | null;
  expected: { w: number; h: number };
  problems: SizeProblem[];
}

const pageList = (ns: number[]) => `page${ns.length === 1 ? '' : 's'} ${ns.slice(0, 8).join(', ')}${ns.length > 8 ? '…' : ''}`;

/**
 * Measure every page against the spec. Covers and interiors must be upright
 * single pages at exactly trim + bleed; artwork (a print) may be turned
 * landscape, since a poster can hang either way.
 */
export async function inspectPrintPdf(pdfPath: string, kind: PrintFileKind, spec: TrimSpec): Promise<Inspection> {
  const expected = pageSizeFor(spec);
  const trim = { w: spec.trimW, h: spec.trimH };
  const read = await readPdfPages(pdfPath);
  const problems: SizeProblem[] = [];
  if (read.encrypted) problems.push({ reason: 'password_protected', detail: 'The PDF is password-protected or locked.' });
  const sizes = read.sizes;
  const first = sizes[0] ?? null;
  if (!first) return { pages: read.pageCount, sizeIn: null, expected, problems };

  const same = (a: { w: number; h: number }, b: { w: number; h: number }) => near(a.w, b.w) && near(a.h, b.h);
  const flipped = (s: { w: number; h: number }) => ({ w: s.h, h: s.w });
  const landscapeOk = kind === 'artwork';
  const isExpected = (s: { w: number; h: number }) => same(s, expected) || (landscapeOk && same(s, flipped(expected)));
  const isTrimOnly = (s: { w: number; h: number }) => same(s, trim) || (landscapeOk && same(s, flipped(trim)));

  // Pages that disagree with the first page.
  const mixed = sizes.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => !same(s, first));
  if (mixed.length) {
    problems.push({ reason: 'mixed_page_sizes', detail: `Page 1 is ${inches(first)}, but ${pageList(mixed.map((m) => m.n))} measure${mixed.length === 1 ? 's' : ''} ${inches(mixed[0]!.s)}.` });
  }

  // Classify the distinct sizes present, worst first.
  const distinct: { w: number; h: number }[] = [];
  for (const s of sizes) if (!distinct.some((d) => same(d, s))) distinct.push(s);
  for (const s of distinct) {
    if (isExpected(s)) continue;
    if (isTrimOnly(s)) {
      problems.push({ reason: 'no_bleed', detail: `Pages measure ${inches(s)} — the bare ${spec.label} trim with no bleed. The page must be ${inches(expected)}: ${BLEED_IN}″ of bleed on every side.` });
    } else if (!landscapeOk && (same(s, flipped(expected)) || same(s, flipped(trim)))) {
      problems.push({ reason: 'wrong_orientation', detail: `Pages measure ${inches(s)} — the right size turned sideways. Export every page upright (portrait) at ${inches(expected)}.` });
    } else if (kind !== 'artwork' && near(s.w, 2 * expected.w, 0.3) && near(s.h, expected.h, 0.3)) {
      problems.push({ reason: 'spreads', detail: `Pages measure ${inches(s)} — two pages side by side. Export single pages at ${inches(expected)}.` });
    } else if (kind !== 'artwork' && near(s.w, 2 * trim.w + 2 * BLEED_IN, 0.3) && near(s.h, expected.h, 0.3)) {
      problems.push({ reason: 'spreads', detail: `Pages measure ${inches(s)} — a two-page spread with bleed. Export single pages at ${inches(expected)}.` });
    } else if (s.w > expected.w + 0.2 && s.w < expected.w + 1.6 && s.h > expected.h + 0.2 && s.h < expected.h + 1.6) {
      problems.push({ reason: 'crop_marks', detail: `Pages measure ${inches(s)} — larger than ${inches(expected)} by about the room printer's marks take. Export without crop marks or page information, so the page is just the art at ${inches(expected)}.` });
    } else {
      problems.push({ reason: 'wrong_size', detail: `Pages measure ${inches(s)}; the ${spec.label} page must be ${inches(expected)} (${inches(trim)} trim plus ${BLEED_IN}″ bleed on every side).` });
    }
  }
  return { pages: read.pageCount, sizeIn: first, expected, problems };
}

/** The sentence the customer reads when a file is refused for its size. */
export function describeSizeRefusal(args: { fileLabel: string; fileName: string; spec: TrimSpec; inspection: Inspection }): string {
  const { fileLabel, fileName, spec, inspection } = args;
  const expected = inches(inspection.expected);
  const lead = inspection.problems.find((p) => p.reason !== 'mixed_page_sizes' && p.reason !== 'password_protected') ?? inspection.problems[0]!;
  const mixed = inspection.problems.find((p) => p.reason === 'mixed_page_sizes');
  const what = lead.reason === 'password_protected'
    ? `“${fileName}” is password-protected or locked, so it cannot be checked or printed. Remove the password and any restrictions, export again and upload that.`
    : `${lead.detail}${mixed && lead !== mixed ? ` ${mixed.detail}` : ''}`;
  const template = spec.template ? ` Our ${spec.template.label} template is already set up at that size — download it from the Templates page.` : '';
  return `The ${fileLabel} was not accepted: every page must be ${expected} — the ${spec.label} trim (${inches({ w: spec.trimW, h: spec.trimH })}) plus ${BLEED_IN}″ bleed on every side. ${what}${template}`;
}
