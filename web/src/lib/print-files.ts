/**
 * The customer-facing wording for print files — mirrors
 * server/src/lib/print-files.ts (keep the two in step).
 */
export type PrintFileKind = 'cover' | 'interior' | 'artwork';

export const PRINT_FILE_LABELS: Record<PrintFileKind, string> = {
  cover: 'Cover PDF',
  interior: 'Interior PDF',
  artwork: 'Print-ready PDF',
};

/** Configurator option keys that are one of the print-file slots. */
export const PRINT_FILE_KIND_BY_OPTION_KEY: Record<string, PrintFileKind> = {
  cover_pdf: 'cover',
  interior_pdf: 'interior',
  upload: 'artwork',
};

/**
 * The page size a product's files must be — mirrors server/src/lib/print-specs.ts:
 * the trim plus 0.125″ bleed on every side, as the templates are built.
 */
export const BLEED_IN = 0.125;
export interface TrimSpec { key: string; label: string; trimW: number; trimH: number; templateUrl: string | null }
export const TRIMS: Record<string, TrimSpec> = {
  'a5': { key: 'a5', label: 'A5', trimW: 5.8, trimH: 8.3, templateUrl: '/templates/template-a5.pdf' },
  'standard': { key: 'standard', label: 'Standard Comic', trimW: 6.625, trimH: 10.25, templateUrl: '/templates/template-standard.pdf' },
  'magazine': { key: 'magazine', label: 'Magazine', trimW: 8, trimH: 10.5, templateUrl: '/templates/template-magazine.pdf' },
  'letter': { key: 'letter', label: 'US Letter', trimW: 8.5, trimH: 11, templateUrl: '/templates/template-letter.pdf' },
  'art-print': { key: 'art-print', label: 'Art Print', trimW: 11, trimH: 17, templateUrl: '/templates/template-art-print.pdf' },
  'trading-card': { key: 'trading-card', label: 'Trading Card', trimW: 2.5, trimH: 3.5, templateUrl: '/templates/template-trading-card.pdf' },
};
const r3 = (n: number) => Number(n.toFixed(3));
export const inches = (w: number, h: number) => `${r3(w)} × ${r3(h)} in`;
export function parseDimensions(text: string | null | undefined): { w: number; h: number } | null {
  const m = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*["”]?\s*[×x]\s*(\d+(?:\.\d+)?)/i);
  return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? { w: Number(m[1]), h: Number(m[2]) } : null;
}
const near = (a: number, b: number) => Math.abs(a - b) <= 0.04;

/** Which size this product's files must be, given the chosen print size (art prints). Null when unknown. */
export function trimSpecFor(product: { slug?: string | null; name?: string | null; pricingConfig?: unknown } | null | undefined, printSize?: string | null): TrimSpec | null {
  const slug = (product?.slug ?? '').toLowerCase();
  const name = (product?.name ?? '').toLowerCase();
  const book = slug.match(/^(?:comic|graphic-novel)-([a-z0-9]+)-size$/);
  if (book && TRIMS[book[1]!]) return TRIMS[book[1]!]!;
  const cfg = product?.pricingConfig as { kind?: string } | null | undefined;
  if (cfg?.kind === 'print' || /art-print|art print/.test(`${slug} ${name}`)) {
    const d = parseDimensions(printSize);
    if (d) return Object.values(TRIMS).find((t) => near(t.trimW, d.w) && near(t.trimH, d.h)) ?? { key: 'custom', label: inches(d.w, d.h), trimW: d.w, trimH: d.h, templateUrl: null };
    return TRIMS['art-print']!;
  }
  const s = `${slug} ${name}`;
  if (/trading.?card/.test(s)) return TRIMS['trading-card']!;
  if (/\ba5\b/.test(s)) return TRIMS['a5']!;
  if (/magazine/.test(s)) return TRIMS['magazine']!;
  if (/letter/.test(s)) return TRIMS['letter']!;
  if (/standard/.test(s)) return TRIMS['standard']!;
  return null;
}

/** "6.875 × 10.5 in — the Standard Comic trim of 6.625 × 10.25 in plus 0.125″ bleed on every side" */
export function pageSizeSentence(spec: TrimSpec): string {
  return `${inches(spec.trimW + 2 * BLEED_IN, spec.trimH + 2 * BLEED_IN)} — the ${spec.label} trim of ${inches(spec.trimW, spec.trimH)} plus ${BLEED_IN}″ bleed on every side`;
}

export function printFileInstructions(kind: PrintFileKind, expectedPages: number | null, spec?: TrimSpec | null): string[] {
  const size = spec ? `Every page ${pageSizeSentence(spec)}. A file at any other size is refused on upload.` : null;
  switch (kind) {
    case 'cover':
      return [
        'One PDF with exactly 4 pages, in this order: 1 front cover · 2 inside front cover · 3 inside back cover · 4 back cover.',
        'No interior pages in this file. If nothing prints on a page (an inside cover, say), leave it blank — it still counts as a page.',
        size ?? 'Trim size of the book plus 0.125″ bleed on every side.',
        'Single upright pages, CMYK, fonts embedded or outlined.',
      ];
    case 'interior':
      return [
        `One PDF with ${expectedPages ? `all ${expectedPages}` : 'every'} interior page${expectedPages === 1 ? '' : 's'} in reading order — every page between the inside front cover and the inside back cover.`,
        'Do not include the front cover, inside covers or back cover. They go in the Cover PDF.',
        size ?? 'Trim size plus 0.125″ bleed on every side.',
        'Single pages, not spreads. CMYK, fonts embedded or outlined.',
      ];
    case 'artwork':
      return [
        size ? `One print-ready PDF. ${size}` : 'One print-ready PDF at the ordered size, with 0.125″ bleed on every side.',
        'CMYK, 300 DPI, flattened, fonts embedded or outlined.',
      ];
  }
}

/** A one-line summary of what the slot must hold, for the label row. */
export function printFileSummary(kind: PrintFileKind, expectedPages: number | null): string {
  if (kind === 'cover') return '4 pages: front cover, inside front, inside back, back cover';
  if (kind === 'interior') return expectedPages ? `${expectedPages} pages, interior only` : 'all interior pages, no covers';
  return 'one PDF, print-ready';
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A refusal from the server, with whatever it attached (the page-size check adds the template to download). */
export class UploadError extends Error {
  constructor(message: string, public details?: { code?: string; templateUrl?: string | null; templateLabel?: string | null; templatesPage?: string | null; measured?: { w: number; h: number } | null; expected?: { w: number; h: number } | null } | null) {
    super(message);
  }
}

/** Upload one file with progress; resolves with the parsed JSON body or rejects with the server's message. */
export function uploadWithProgress<T>(url: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new UploadError(body?.error ?? body?.message ?? (xhr.status === 413 ? 'That file is too large to upload.' : xhr.statusText || 'Upload failed'), body?.details && typeof body.details === 'object' ? body.details : null));
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection and try again.'));
    xhr.send(form);
  });
}
