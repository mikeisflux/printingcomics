/**
 * One report for a print PDF: every rule as a line with pass / fail / info,
 * the way the public File Checker (/resources/file-check) shows it and the
 * way the upload refusal explains itself. The same two inspections drive
 * both — page geometry (lib/print-specs.ts) and flatness, images, fonts and
 * version (lib/pdf-inspect.ts).
 */
import { inspectPdfContent, MAX_PDF_VERSION, MIN_IMAGE_PPI, TARGET_IMAGE_PPI, type ContentInspection, type ContentProblem } from './pdf-inspect.js';
import { BLEED_IN, inches, inspectPrintPdf, pageSizeFor, type Inspection, type TrimSpec } from './print-specs.js';
import type { PrintFileKind } from './print-files.js';
import { readPdfPages } from './pod/preflight.js';

export type CheckStatus = 'pass' | 'fail' | 'info';
export interface FileCheck { id: string; label: string; status: CheckStatus; detail: string; reason?: string }
export interface FileCheckReport {
  ok: boolean;
  headline: string;
  pages: number | null;
  pageSize: string | null;
  version: string | null;
  checks: FileCheck[];
  /** Reason keys from lib/file-requests.ts for everything that failed. */
  reasons: string[];
}

export const FLAT_FILE_HELP = '/resources/file-prep#flat';

const first = <T extends { reason: string }>(xs: T[], reason: string) => xs.find((x) => x.reason === reason);

/** Turn the two inspections into the checklist. `content` may be null when only geometry was checked. */
export function buildReport(args: {
  kind: PrintFileKind;
  spec: TrimSpec | null;
  expectedPages: number | null;
  pages: number | null;
  encrypted: boolean;
  size: Inspection | null;
  content: ContentInspection | null;
  opened: boolean;
}): FileCheckReport {
  const { kind, spec, expectedPages, pages, size, content } = args;
  const checks: FileCheck[] = [];
  const sp = size?.problems ?? [];
  const cp = content?.problems ?? [];

  checks.push(args.opened
    ? { id: 'opens', label: 'Opens as a PDF', status: 'pass', detail: `${pages ?? '?'} page${pages === 1 ? '' : 's'}.` }
    : { id: 'opens', label: 'Opens as a PDF', status: 'fail', detail: 'The file could not be opened as a PDF. Re-export it from your design app (a flattened PDF/X-3 export is ideal).', reason: 'corrupted' });
  if (!args.opened) return finish(checks, pages, null, content?.version ?? null);

  checks.push(args.encrypted
    ? { id: 'locked', label: 'Not password-protected', status: 'fail', detail: 'The PDF is encrypted or locked. Export it without security.', reason: 'password_protected' }
    : { id: 'locked', label: 'Not password-protected', status: 'pass', detail: 'No password or restrictions.' });

  // --- page count ---
  if (kind === 'cover') {
    const ok = pages === 4;
    checks.push({ id: 'pages', label: 'Cover PDF has exactly 4 pages', status: ok ? 'pass' : 'fail', detail: ok ? 'Front cover, inside front, inside back, back cover.' : `${pages} page${pages === 1 ? '' : 's'}. The Cover PDF is exactly 4 single pages: front cover, inside front cover, inside back cover, back cover.`, reason: ok ? undefined : 'cover_order' });
  } else if (kind === 'interior') {
    if (expectedPages) {
      const ok = pages === expectedPages;
      checks.push({ id: 'pages', label: `Interior has ${expectedPages} pages`, status: ok ? 'pass' : 'fail', detail: ok ? `${pages} pages, as ordered.` : `${pages} page${pages === 1 ? '' : 's'}; the book is ordered with ${expectedPages}. ${pages !== null && pages < expectedPages ? `Add the ${expectedPages - pages} missing page${expectedPages - pages === 1 ? '' : 's'}` : 'Remove the extra pages (covers belong in the Cover PDF)'}, or change the page count on the order.`, reason: ok ? undefined : 'page_count' });
    } else {
      const ok = pages !== null && pages > 0 && pages % 4 === 0;
      checks.push({ id: 'pages', label: 'Interior page count is a multiple of 4', status: ok ? 'pass' : pages !== null && pages % 2 === 0 ? 'info' : 'fail', detail: ok ? `${pages} pages binds as a saddle-stitched comic.` : pages !== null && pages % 2 === 0 ? `${pages} pages: fine for a perfect-bound graphic novel, but a saddle-stitched comic needs a multiple of 4.` : `${pages} page${pages === 1 ? '' : 's'} will not bind. Add or remove pages so the total is a multiple of 4 (comics) or 2 (perfect-bound).`, reason: ok ? undefined : 'page_count' });
    }
  } else {
    checks.push({ id: 'pages', label: 'One page of artwork', status: pages === 1 ? 'pass' : 'info', detail: pages === 1 ? 'One page.' : `${pages} pages. A print is one page per file; send one PDF per print.` });
  }

  // --- geometry ---
  if (spec && size) {
    const expected = inches(pageSizeFor(spec));
    const wrong = first(sp, 'wrong_size') ?? first(sp, 'crop_marks');
    checks.push(wrong
      ? { id: 'size', label: `Page size is ${expected}`, status: 'fail', detail: wrong.detail, reason: wrong.reason }
      : { id: 'size', label: `Page size is ${expected}`, status: first(sp, 'no_bleed') || first(sp, 'wrong_orientation') || first(sp, 'spreads') ? 'fail' : 'pass', detail: first(sp, 'no_bleed')?.detail ?? first(sp, 'wrong_orientation')?.detail ?? first(sp, 'spreads')?.detail ?? `Every page is ${size.sizeIn ? inches(size.sizeIn) : expected}: the ${spec.label} trim of ${inches({ w: spec.trimW, h: spec.trimH })} plus ${BLEED_IN}″ bleed on every side.`, reason: (first(sp, 'no_bleed') ?? first(sp, 'wrong_orientation') ?? first(sp, 'spreads'))?.reason });
    const bleed = first(sp, 'no_bleed');
    checks.push(bleed
      ? { id: 'bleed', label: `Includes ${BLEED_IN}″ bleed`, status: 'fail', detail: bleed.detail, reason: 'no_bleed' }
      : { id: 'bleed', label: `Includes ${BLEED_IN}″ bleed`, status: wrong ? 'info' : 'pass', detail: wrong ? 'Checked once the page size is right.' : `The page size includes ${BLEED_IN}″ of bleed. Make sure art that touches an edge runs all the way out to it.` });
    const orient = first(sp, 'wrong_orientation') ?? first(sp, 'spreads');
    checks.push(orient
      ? { id: 'single', label: kind === 'artwork' ? 'Single page, no spreads' : 'Upright single pages, no spreads', status: 'fail', detail: orient.detail, reason: orient.reason }
      : { id: 'single', label: kind === 'artwork' ? 'Single page, no spreads' : 'Upright single pages, no spreads', status: 'pass', detail: kind === 'artwork' ? 'One page, not imposed.' : 'Every page is a single upright page.' });
    const mixed = first(sp, 'mixed_page_sizes');
    checks.push(mixed
      ? { id: 'consistent', label: 'Every page is the same size', status: 'fail', detail: mixed.detail, reason: 'mixed_page_sizes' }
      : { id: 'consistent', label: 'Every page is the same size', status: 'pass', detail: 'All pages measure the same.' });
  } else if (size) {
    checks.push({ id: 'size', label: 'Page size', status: 'info', detail: `Pages measure ${size.sizeIn ? inches(size.sizeIn) : 'unknown'}. Pick the format above to check them against a trim size.` });
  }

  // --- flatness and content ---
  if (content) {
    const line = (id: string, label: string, reason: string, passDetail: string, infoWhen?: boolean, infoDetail?: string) => {
      const p = first(cp, reason);
      checks.push(p
        ? { id, label, status: 'fail', detail: p.detail, reason }
        : { id, label, status: infoWhen ? 'info' : 'pass', detail: infoWhen ? (infoDetail ?? passDetail) : passDetail });
    };
    line('version', `PDF version ${MAX_PDF_VERSION} or lower (PDF/X-3)`, 'pdf_version', `PDF ${content.version ?? '1.4'}.`);
    line('color', 'RGB color, no CMYK or spot', 'color_mode', 'No CMYK or spot color found: the Fiery RIP converts from RGB and uses the full gamut of the press.');
    line('transparency', 'No live transparency', 'transparency', 'No soft masks, transparency groups, blend modes or partial opacity.');
    line('masks', 'No masks over the art', 'masks', 'No stencil masks or image masks.');
    line('wrappers', 'Content drawn directly on each page', 'page_wrappers', 'Pages are not wrapped in a form with a clipping mask.');
    line('resources', 'Every page can render', 'corrupted', 'Every drawn resource is present in the file.');
    line('resolution', `Images at ${TARGET_IMAGE_PPI} ppi (minimum ${MIN_IMAGE_PPI})`, 'low_resolution', content.images ? `${content.images} image${content.images === 1 ? '' : 's'}, all at ${MIN_IMAGE_PPI} ppi or better at the printed size.` : 'No raster images.', content.images === 0, 'No raster images in the file.');
    line('image-format', 'Images are 8-bit, no JPEG 2000 or JBIG2', 'image_format', content.images ? 'Every image is 8 bits per channel in ordinary JPEG or Flate compression.' : 'No raster images.', content.images === 0, 'No raster images in the file.');
    line('fonts', 'Fonts embedded or outlined', 'fonts', content.fonts ? `${content.fonts} font${content.fonts === 1 ? '' : 's'}, all embedded.` : 'No fonts (text is outlined or the pages are images).', content.fonts === 0, 'No fonts in the file: text is outlined, or the pages are images.');
  }
  checks.push({ id: 'manual', label: 'The art itself', status: 'info', detail: 'Page order, art reaching the bleed, text inside the safe area and overall quality are confirmed by a person at prepress; the checks above are the ones a file can fail on its own.' });

  return finish(checks, pages, size?.sizeIn ? inches(size.sizeIn) : null, content?.version ?? null);
}

function finish(checks: FileCheck[], pages: number | null, pageSize: string | null, version: string | null): FileCheckReport {
  const failed = checks.filter((c) => c.status === 'fail');
  return {
    ok: failed.length === 0,
    headline: failed.length === 0 ? 'Print-ready: every automatic check passed' : `${failed.length} thing${failed.length === 1 ? '' : 's'} to fix before this file can print`,
    pages, pageSize, version, checks,
    reasons: [...new Set(failed.map((c) => c.reason).filter((r): r is string => !!r))],
  };
}

/** Run every inspection on a file and build the report. Never stores anything. */
export async function checkPrintFile(pdfPath: string, args: { kind: PrintFileKind; spec: TrimSpec | null; expectedPages: number | null }): Promise<FileCheckReport> {
  let read: Awaited<ReturnType<typeof readPdfPages>>;
  try { read = await readPdfPages(pdfPath); } catch {
    return buildReport({ ...args, pages: null, encrypted: false, size: null, content: null, opened: false });
  }
  const size = args.spec ? await inspectPrintPdf(pdfPath, args.kind, args.spec) : { pages: read.pageCount, sizeIn: read.sizes[0] ?? null, expected: { w: 0, h: 0 }, problems: [] as Inspection['problems'] };
  const content = read.encrypted ? null : await inspectPdfContent(pdfPath);
  return buildReport({ ...args, pages: read.pageCount, encrypted: read.encrypted, size, content, opened: true });
}

/** The sentence a refused upload reads: the first few failures, then where to read how to fix them. */
export function describeContentRefusal(fileLabel: string, fileName: string, problems: ContentProblem[]): string {
  const lead = problems.slice(0, 3).map((p) => p.detail).join(' ');
  const more = problems.length > 3 ? ` (${problems.length - 3} more issue${problems.length - 3 === 1 ? '' : 's'} in the full report.)` : '';
  return `The ${fileLabel} was not accepted: “${fileName}” is not a flat print file. ${lead}${more} Export a flattened PDF in RGB (the PDF/X-3 preset, PDF 1.3/1.4) with fonts embedded, or rasterize each page to a flat ${TARGET_IMAGE_PPI} ppi sRGB image, then run it through our File Checker before uploading again.`;
}
