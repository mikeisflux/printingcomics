/**
 * Server-side PDF page previews.
 *
 * Print-production PDFs — CMYK, transparency groups, JPEG 2000 images, spot
 * colours — are exactly what comic artwork exports contain, and the PDF
 * engines built into Chrome and Edge render many of them as solid black
 * pages. The downloaded file is fine; only the browser's rendering is wrong.
 * So nothing on the site embeds a PDF in the browser any more. Pages are
 * rasterised here with poppler (`pdftoppm`, which handles CMYK and
 * transparency through Little CMS) and served as PNGs.
 *
 * Renders are cached on disk under <uploads>/previews/<mediaId>/ so each
 * page is rendered once. Requires `poppler-utils` on the server:
 *
 *     sudo apt install -y poppler-utils
 */
import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { r2SignedUrl } from './r2.js';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const PREVIEW_DIR = path.join(UPLOADS_DIR, 'previews');
/** 110 dpi puts a 6.625×10.25" comic page at ~730×1130 px — sharp on screen, quick to render. */
const DPI = Number(process.env.PDF_PREVIEW_DPI ?? 110);
const MAX_PAGES = 400;

// ---------------------------------------------------------------------------
// poppler
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[], timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out after ${timeoutMs / 1000}s`)); }, timeoutMs);
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

let popplerChecked: Promise<string | null> | null = null;
/** null when poppler is usable; otherwise the reason it isn't. */
export function popplerProblem(): Promise<string | null> {
  if (!popplerChecked) {
    popplerChecked = run('pdftoppm', ['-v'], 10_000)
      .then((r) => (r.code === 0 || /pdftoppm version/.test(r.stderr + r.stdout)) ? null : `pdftoppm exited ${r.code}`)
      .catch((e: any) => (e?.code === 'ENOENT'
        ? 'poppler-utils is not installed on the server (sudo apt install -y poppler-utils)'
        : `pdftoppm failed: ${e?.message ?? e}`));
  }
  return popplerChecked;
}

export async function pageCount(pdfPath: string): Promise<number> {
  const r = await run('pdfinfo', [pdfPath], 30_000);
  const m = /^Pages:\s+(\d+)/m.exec(r.stdout);
  if (!m) throw new Error(`Could not read the page count${r.stderr ? `: ${r.stderr.trim().split('\n')[0]}` : ''}`);
  return Number(m[1]);
}

export async function renderPage(pdfPath: string, page: number, outPng: string): Promise<void> {
  // -singlefile writes exactly <prefix>.png; without it poppler appends a
  // zero-padded page number we would have to guess at.
  const prefix = outPng.replace(/\.png$/, '');
  const r = await run('pdftoppm', ['-png', '-r', String(DPI), '-f', String(page), '-l', String(page), '-singlefile', pdfPath, prefix], 120_000);
  if (r.code !== 0) throw new Error(`pdftoppm failed on page ${page}: ${r.stderr.trim().split('\n')[0] || `exit ${r.code}`}`);
  await fs.access(outPng);
}

// ---------------------------------------------------------------------------
// Source bytes: local disk, R2 (signed), or a public URL
// ---------------------------------------------------------------------------

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not fetch the file (${res.status})`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
}

/** A readable local path for the media's bytes, plus a cleanup for temp copies. */
async function sourceFile(media: { id: string; url: string; filename: string }): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const none = async () => undefined;
  if (media.url.startsWith('/uploads/')) {
    const rel = media.url.replace(/^\/uploads\//, '').split('?')[0]!;
    const subdir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    for (const c of [path.join(UPLOADS_DIR, rel), path.join(UPLOADS_DIR, decodeURIComponent(rel)), path.join(UPLOADS_DIR, subdir, media.filename)]) {
      try { await fs.access(c); return { path: c, cleanup: none }; } catch { /* next */ }
    }
    throw new HttpError(404, 'The file is no longer on disk.');
  }
  const url = media.url.startsWith('/api/files/')
    ? await r2SignedUrl(media.url.replace(/^\/api\/files\//, '').split('?')[0]!, 600)
    : media.url;
  if (!url) throw new HttpError(503, 'File storage is not configured.');
  const tmp = path.join(os.tmpdir(), `pc-preview-${media.id}-${Date.now()}.pdf`);
  await download(url, tmp);
  return { path: tmp, cleanup: () => fs.unlink(tmp).catch(() => undefined) };
}

// ---------------------------------------------------------------------------
// Cache + public API
// ---------------------------------------------------------------------------

interface Meta { pages: number; dpi: number; renderedAt: string }

function cacheDir(mediaId: string) { return path.join(PREVIEW_DIR, mediaId); }
function pagePath(mediaId: string, page: number) { return path.join(cacheDir(mediaId), `p${page}.png`); }

async function readMeta(mediaId: string): Promise<Meta | null> {
  try { return JSON.parse(await fs.readFile(path.join(cacheDir(mediaId), 'meta.json'), 'utf8')) as Meta; } catch { return null; }
}

// Two requests for the same page at once (a browser prefetching) must not
// both spawn poppler; the second waits for the first.
const inflight = new Map<string, Promise<unknown>>();
function single<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export interface PreviewInfo {
  kind: 'pdf' | 'image' | 'other';
  available: boolean;
  reason: string | null;
  pages: number;
}

/** What can be previewed for this media, rendering page 1 to learn the page count if needed. */
export async function previewInfo(mediaId: string): Promise<PreviewInfo> {
  const media = await prisma.mediaFile.findUnique({ where: { id: mediaId }, select: { id: true, url: true, filename: true, mimeType: true } });
  if (!media) throw new HttpError(404, 'File not found');
  if (media.mimeType.startsWith('image/')) return { kind: 'image', available: true, reason: null, pages: 1 };
  if (media.mimeType !== 'application/pdf') return { kind: 'other', available: false, reason: 'Only PDFs and images can be previewed.', pages: 0 };

  const problem = await popplerProblem();
  if (problem) return { kind: 'pdf', available: false, reason: problem, pages: 0 };

  const meta = await readMeta(mediaId);
  if (meta) return { kind: 'pdf', available: true, reason: null, pages: meta.pages };

  try {
    await previewPage(mediaId, 1); // populates meta as a side effect
    const m = await readMeta(mediaId);
    return { kind: 'pdf', available: true, reason: null, pages: m?.pages ?? 1 };
  } catch (e: any) {
    return { kind: 'pdf', available: false, reason: e?.message ?? 'Could not render this PDF.', pages: 0 };
  }
}

/** Absolute path to the PNG for one page, rendering (and caching) it if needed. */
export async function previewPage(mediaId: string, page: number): Promise<string> {
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) throw new HttpError(400, 'Bad page number');
  const out = pagePath(mediaId, page);
  try { await fs.access(out); return out; } catch { /* render */ }

  return single(`${mediaId}:${page}`, async () => {
    try { await fs.access(out); return out; } catch { /* still missing */ }
    const problem = await popplerProblem();
    if (problem) throw new HttpError(503, problem);

    const media = await prisma.mediaFile.findUnique({ where: { id: mediaId }, select: { id: true, url: true, filename: true, mimeType: true } });
    if (!media) throw new HttpError(404, 'File not found');
    if (media.mimeType !== 'application/pdf') throw new HttpError(400, 'Not a PDF');

    await fs.mkdir(cacheDir(mediaId), { recursive: true });
    const src = await sourceFile(media);
    try {
      let meta = await readMeta(mediaId);
      if (!meta) {
        meta = { pages: await pageCount(src.path), dpi: DPI, renderedAt: new Date().toISOString() };
        await fs.writeFile(path.join(cacheDir(mediaId), 'meta.json'), JSON.stringify(meta));
      }
      if (page > meta.pages) throw new HttpError(404, `This PDF has ${meta.pages} page${meta.pages === 1 ? '' : 's'}.`);
      await renderPage(src.path, page, out);
      return out;
    } finally {
      await src.cleanup();
    }
  });
}

/** Drop cached renders (call when a media file is replaced or deleted). */
export async function dropPreviews(mediaId: string): Promise<void> {
  await fs.rm(cacheDir(mediaId), { recursive: true, force: true }).catch(() => undefined);
}
