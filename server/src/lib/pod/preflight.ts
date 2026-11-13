/**
 * Automatic checks on a listing's print PDFs, run with poppler's `pdfinfo`
 * when the file lands: it opens, page count (and divisible by 4 for an
 * interior), every page the same size, no two-page spreads, the page size
 * is the trim or the trim plus 0.125" bleed. Fonts, colour and resolution
 * stay with a human — the result says so.
 *
 * Reasons use the same keys as the order "Request new file" list
 * (lib/file-requests.ts), so the words match everywhere.
 */
import { spawn } from 'node:child_process';

export const BLEED_IN = 0.125;
const TOLERANCE_IN = 0.04;

export type CheckStatus = 'pass' | 'fail' | 'warning' | 'manual';
export interface PreflightCheck { id: string; label: string; status: CheckStatus; detail: string; reason?: string }
export interface PreflightResult {
  status: 'ready' | 'changes_required' | 'unchecked';
  headline: string;
  pageCount: number | null;
  pageSizesIn: { w: number; h: number }[];
  failed: number;
  warnings: number;
  checks: PreflightCheck[];
  ranAt: string;
}

function run(cmd: string, args: string[], timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

const close = (a: number, b: number, tol = TOLERANCE_IN) => Math.abs(a - b) <= tol;
const pts = (n: number) => n / 72;
const fmt = (s: { w: number; h: number }) => `${s.w.toFixed(3)} × ${s.h.toFixed(3)} in`;

/** Page sizes in inches, orientation as laid out (rotation applied). */
export async function readPdfPages(pdfPath: string): Promise<{ pageCount: number; sizes: { w: number; h: number }[]; encrypted: boolean }> {
  const info = await run('pdfinfo', [pdfPath], 30_000);
  if (info.code !== 0) throw new Error(info.stderr.trim().split('\n')[0] || 'pdfinfo could not open the file');
  const pm = /^Pages:\s+(\d+)/m.exec(info.stdout);
  if (!pm) throw new Error('Could not read the page count');
  const pageCount = Number(pm[1]);
  const encrypted = /^Encrypted:\s+yes/m.test(info.stdout);
  const all = await run('pdfinfo', ['-f', '1', '-l', String(pageCount), pdfPath], 60_000);
  const sizes: { w: number; h: number }[] = [];
  const re = /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts(?:.*?)$/gm;
  const rot = new Map<number, number>();
  for (const m of all.stdout.matchAll(/^Page\s+(\d+)\s+rot:\s+(\d+)/gm)) rot.set(Number(m[1]), Number(m[2]));
  for (const m of all.stdout.matchAll(re)) {
    const n = Number(m[1]);
    let w = pts(Number(m[2]));
    let h = pts(Number(m[3]));
    const r = rot.get(n) ?? 0;
    if (r === 90 || r === 270) [w, h] = [h, w];
    sizes[n - 1] = { w, h };
  }
  return { pageCount, sizes: sizes.filter(Boolean), encrypted };
}

export interface PreflightSpec {
  kind: 'cover' | 'interior';
  trimWidthIn?: number | null;
  trimHeightIn?: number | null;
  /** Interior: the page count the listing declares. */
  declaredPages?: number | null;
  pageCountStep?: number;
}

export async function preflightPdf(pdfPath: string, spec: PreflightSpec): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const ranAt = new Date().toISOString();
  const done = (pageCount: number | null, pageSizesIn: { w: number; h: number }[]): PreflightResult => {
    const failed = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warning').length;
    return {
      status: failed ? 'changes_required' : 'ready',
      headline: failed ? 'Changes required before this file can print' : warnings ? 'Basic checks passed; prepress has notes to confirm' : 'Basic checks passed — ready for prepress review',
      pageCount, pageSizesIn, failed, warnings, checks, ranAt,
    };
  };

  let pages: Awaited<ReturnType<typeof readPdfPages>>;
  try {
    pages = await readPdfPages(pdfPath);
  } catch (e: any) {
    checks.push({ id: 'opens', label: 'PDF opens', status: 'fail', detail: e?.message || 'The file may be damaged, encrypted, or not a PDF.', reason: 'corrupted' });
    return { ...done(null, []), status: 'changes_required', headline: 'This PDF could not be checked' };
  }
  checks.push({ id: 'opens', label: 'PDF opens', status: 'pass', detail: `${pages.pageCount} page${pages.pageCount === 1 ? '' : 's'}.` });
  if (pages.encrypted) checks.push({ id: 'locked', label: 'Not password-protected', status: 'fail', detail: 'The PDF is encrypted. Export it without security so the press can open it.', reason: 'password_protected' });

  const step = spec.pageCountStep ?? 4;
  if (spec.kind === 'interior') {
    const ok = pages.pageCount > 0 && pages.pageCount % step === 0;
    checks.push({ id: 'page-step', label: `Page count is a multiple of ${step}`, status: ok ? 'pass' : 'fail', detail: ok ? `${pages.pageCount} pages binds correctly.` : `${pages.pageCount} pages will not bind. Add or remove pages so the total is a multiple of ${step}.`, reason: ok ? undefined : 'page_count' });
    if (spec.declaredPages) {
      const match = pages.pageCount === spec.declaredPages;
      checks.push({ id: 'declared-pages', label: 'Matches the listed page count', status: match ? 'pass' : 'fail', detail: match ? `Listing and PDF both say ${pages.pageCount} pages.` : `The listing says ${spec.declaredPages} pages; the PDF has ${pages.pageCount}. Fix the listing or the file.`, reason: match ? undefined : 'page_count' });
    }
  } else {
    // A cover PDF is the four cover pages as single pages, or one wrap spread.
    const ok = pages.pageCount === 4 || pages.pageCount === 1 || pages.pageCount === 2;
    checks.push({ id: 'cover-pages', label: 'Cover supplied as 4 pages or a wrap', status: ok ? 'pass' : 'fail', detail: ok ? `${pages.pageCount} page${pages.pageCount === 1 ? '' : 's'}.` : `${pages.pageCount} pages — send the four cover pages (front, inside front, inside back, back) or a single wrap spread.`, reason: ok ? undefined : 'cover_order' });
  }

  const sizes = pages.sizes;
  if (sizes.length) {
    const base = sizes[0]!;
    const mixed = sizes.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => !close(s.w, base.w) || !close(s.h, base.h));
    if (spec.kind === 'interior') {
      checks.push({ id: 'consistent', label: 'Every page is the same size', status: mixed.length ? 'fail' : 'pass', detail: mixed.length ? `Page size changes on page${mixed.length === 1 ? '' : 's'} ${mixed.slice(0, 8).map((m) => m.n).join(', ')}.` : `All ${sizes.length} pages are ${fmt(base)}.`, reason: mixed.length ? 'mixed_page_sizes' : undefined });
    }
    const tw = Number(spec.trimWidthIn);
    const th = Number(spec.trimHeightIn);
    if (tw > 0 && th > 0) {
      const isSingle = (s: { w: number; h: number }) => (close(s.w, tw) && close(s.h, th)) || (close(s.w, tw + 2 * BLEED_IN) && close(s.h, th + 2 * BLEED_IN));
      const isSpread = (s: { w: number; h: number }) => s.w >= tw * 1.8 && (close(s.h, th, 0.3) || close(s.h, th + 2 * BLEED_IN, 0.3));
      const spreads = sizes.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => isSpread(s));
      if (spec.kind === 'interior') {
        checks.push({ id: 'spreads', label: 'Interior is single pages, not spreads', status: spreads.length ? 'fail' : 'pass', detail: spreads.length ? `Two-page spreads on page${spreads.length === 1 ? '' : 's'} ${spreads.slice(0, 8).map((m) => m.n).join(', ')}. Export each page on its own.` : 'No spreads detected.', reason: spreads.length ? 'spreads' : undefined });
      }
      const wrong = sizes.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => !isSingle(s) && !(spec.kind === 'cover' && isSpread(s)));
      const wrongNotSpread = wrong.filter(({ s }) => !isSpread(s));
      checks.push({ id: 'trim', label: `Trim is ${tw} × ${th} in`, status: wrongNotSpread.length ? 'fail' : 'pass', detail: wrongNotSpread.length ? `Page${wrongNotSpread.length === 1 ? '' : 's'} ${wrongNotSpread.slice(0, 8).map((m) => m.n).join(', ')} measure ${fmt(wrongNotSpread[0]!.s)}; expected ${tw} × ${th} in (or ${(tw + 2 * BLEED_IN).toFixed(3)} × ${(th + 2 * BLEED_IN).toFixed(3)} with bleed).` : 'Every page matches the trim size.', reason: wrongNotSpread.length ? 'wrong_size' : undefined });
      const noBleed = sizes.filter((s) => close(s.w, tw) && close(s.h, th));
      if (noBleed.length === sizes.length) {
        checks.push({ id: 'bleed', label: `Includes ${BLEED_IN}" bleed`, status: 'fail', detail: `Pages are exactly trim size with no bleed. Extend artwork ${BLEED_IN}" past every trim edge and export with bleed.`, reason: 'no_bleed' });
      } else if (noBleed.length) {
        checks.push({ id: 'bleed', label: `Includes ${BLEED_IN}" bleed`, status: 'fail', detail: `${noBleed.length} page${noBleed.length === 1 ? '' : 's'} have no bleed while the rest do. Export every page with bleed.`, reason: 'no_bleed' });
      } else {
        checks.push({ id: 'bleed', label: `Includes ${BLEED_IN}" bleed`, status: 'pass', detail: 'Page size includes bleed. Prepress confirms the artwork reaches the edge.' });
      }
    } else {
      checks.push({ id: 'trim', label: 'Trim size', status: 'warning', detail: 'The listing has no trim size yet, so page dimensions were not checked.' });
    }
  }
  checks.push({ id: 'manual', label: 'Prepress review', status: 'manual', detail: 'A person confirms embedded fonts, colour setup, image resolution, flattening and that art reaches the bleed.' });
  return done(pages.pageCount, sizes);
}
