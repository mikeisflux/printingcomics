/**
 * Looks inside a print PDF for everything that is not flat painted content:
 * live transparency (soft masks, transparency groups, blend modes, partial
 * opacity), masks over the art (stencil masks, image /Mask entries), pages
 * wrapped in a single form XObject, images below print resolution or in a
 * format the press cannot take (16-bit, JPEG 2000, JBIG2), fonts that are not
 * embedded, a PDF version above 1.4, and pages that draw resources the file
 * does not contain (the "renders blank in another viewer" case).
 *
 * The object dictionaries are read straight from the file — including the
 * ones packed into compressed object streams — so a "/SMask" hidden inside
 * an ObjStm is found just the same. Stream bodies (image data, content) are
 * skipped except where needed: object streams, and page content streams for
 * the Do-operator checks. poppler's pdfimages and pdffonts supply the image
 * resolution and font embedding facts.
 *
 * Reason keys match the "Request new file" list (lib/file-requests.ts).
 */
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';

export type ContentReason = 'transparency' | 'masks' | 'page_wrappers' | 'low_resolution' | 'image_format' | 'fonts' | 'pdf_version' | 'corrupted' | 'color_mode';
export interface ContentProblem { reason: ContentReason; detail: string }
export interface ContentInspection {
  problems: ContentProblem[];
  version: string | null;
  pages: number;
  images: number;
  fonts: number;
}

export const MIN_IMAGE_PPI = 250;
export const TARGET_IMAGE_PPI = 300;
export const MAX_PDF_VERSION = 1.4;

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
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

// ---------------------------------------------------------------------------
// A small reader for the PDF object structure.
// ---------------------------------------------------------------------------

interface PdfObject { num: number; dict: string; stream: { start: number; end: number } | null }

interface Structure {
  path: string;
  objects: Map<number, PdfObject>;
  /** Every dictionary text in the file (top-level objects and those inside object streams). */
  dictTexts: { num: number; text: string }[];
}

/** A stream body we are willing to inflate: object streams and page content, never image data. */
const MAX_DECODE_BYTES = 64 * 1024 * 1024;

const isDelim = (c: string) => /[\s<>\[\]\/(){}%]/.test(c);

/** The value after `/Key` in a dictionary: a balanced `<< >>` or `[ ]`, a reference "n g R", or a single token. */
export function dictValue(text: string, key: string): string | null {
  const re = new RegExp(`/${key}(?=[\\s<>\\[\\]/(){}%])`, 'g');
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text.startsWith('<<', i)) {
      let depth = 0;
      for (let j = i; j < text.length - 1; j++) {
        if (text.startsWith('<<', j)) { depth++; j++; } else if (text.startsWith('>>', j)) { depth--; j++; if (depth === 0) return text.slice(i, j + 1); }
      }
      return null;
    }
    if (text[i] === '[') {
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '[') depth++; else if (text[j] === ']') { depth--; if (depth === 0) return text.slice(i, j + 1); }
      }
      return null;
    }
    const ref = /^(\d+)\s+(\d+)\s+R\b/.exec(text.slice(i, i + 40));
    if (ref) return `${ref[1]} ${ref[2]} R`;
    let j = i;
    if (text[j] === '/') j++;
    while (j < text.length && !isDelim(text[j]!)) j++;
    return text.slice(i, j);
  }
  return null;
}

const refNum = (v: string | null) => { const m = v ? /^(\d+)\s+\d+\s+R$/.exec(v.trim()) : null; return m ? Number(m[1]) : null; };

/** PNG predictors (Predictor >= 10) as used by Flate streams with DecodeParms. */
function unpredict(data: Buffer, predictor: number, columns: number, colors: number, bpc: number): Buffer {
  if (predictor < 10) return data; // TIFF predictor 2 is not used for the streams we read
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)]!;
    const row = Buffer.from(data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1)));
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let x = row[i]!;
      if (ft === 1) x = (x + a) & 0xff;
      else if (ft === 2) x = (x + b) & 0xff;
      else if (ft === 3) x = (x + Math.floor((a + b) / 2)) & 0xff;
      else if (ft === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); x = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff; }
      row[i] = x;
    }
    row.copy(out, r * rowLen);
    prev = row;
  }
  return out;
}

/** Read one stream body from disk (never the whole file). */
async function readBody(s: Structure, range: { start: number; end: number }): Promise<Buffer | null> {
  const len = range.end - range.start;
  if (len <= 0 || len > MAX_DECODE_BYTES) return null;
  const fh = await fs.open(s.path, 'r');
  try {
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, range.start);
    return buf;
  } finally { await fh.close(); }
}

/** Decode a stream's bytes when its filters are ones we can undo (none, or Flate); null otherwise. */
async function decodeStream(s: Structure, obj: PdfObject): Promise<Buffer | null> {
  if (!obj.stream) return null;
  const filter = dictValue(obj.dict, 'Filter');
  const filters = !filter ? [] : filter.startsWith('[') ? (filter.match(/\/\w+/g) ?? []) : [filter];
  if (filters.some((f) => f !== '/FlateDecode' && f !== '/Fl')) return null;
  const raw = await readBody(s, obj.stream);
  if (!raw) return null;
  if (filters.length === 0) return raw;
  let out: Buffer;
  try { out = zlib.inflateSync(raw); } catch { try { out = zlib.inflateSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch { return null; } }
  const parms = dictValue(obj.dict, 'DecodeParms');
  if (parms && parms.startsWith('<<')) {
    const predictor = Number(dictValue(parms, 'Predictor') ?? 1);
    if (predictor > 1) out = unpredict(out, predictor, Number(dictValue(parms, 'Columns') ?? 1), Number(dictValue(parms, 'Colors') ?? 1), Number(dictValue(parms, 'BitsPerComponent') ?? 8));
  }
  return out;
}

/** Index of the `stream` keyword that opens a stream body in `data` from `from`, or -1 (ignores `endstream`). */
function findStreamKeyword(data: Buffer, from: number): number {
  let pos = from;
  for (;;) {
    const i = data.indexOf('stream', pos, 'latin1');
    if (i < 0) return -1;
    const before = i > 0 ? data[i - 1]! : 0x20;
    const after = data[i + 6];
    if (before !== 0x64 /* d */ && (after === undefined || after === 0x0d || after === 0x0a)) return i;
    pos = i + 6;
  }
}

/**
 * Read the object structure in chunks, keeping only the text between streams
 * (dictionaries are small; a 5 GB file is almost entirely stream bodies).
 * Stream bodies are remembered by offset and read back only when needed.
 */
export async function readStructure(pdfPath: string): Promise<Structure> {
  const fh = await fs.open(pdfPath, 'r');
  const parts: string[] = [];
  const bodies: { start: number; end: number }[] = [];
  const CHUNK = 4 * 1024 * 1024;
  const KEEP = 16; // enough to carry a split keyword across chunks
  let carry = Buffer.alloc(0);
  let base = 0; // file offset of carry[0]
  let inStream = false;
  let streamStart = 0;
  let textBytes = 0;
  try {
    for (;;) {
      const chunk = Buffer.alloc(CHUNK);
      const { bytesRead } = await fh.read(chunk, 0, CHUNK, base + carry.length);
      const data = bytesRead > 0 ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : carry;
      const last = bytesRead === 0;
      let p = 0;
      for (;;) {
        if (!inStream) {
          const i = findStreamKeyword(data, p);
          if (i < 0 || (!last && i > data.length - KEEP)) {
            const cut = last ? data.length : Math.max(p, data.length - KEEP);
            if (cut > p) { parts.push(data.toString('latin1', p, cut)); textBytes += cut - p; }
            carry = Buffer.from(data.subarray(cut)); base += cut; break;
          }
          parts.push(data.toString('latin1', p, i));
          textBytes += i - p;
          let d = i + 6;
          if (data[d] === 0x0d) d++;
          if (data[d] === 0x0a) d++;
          streamStart = base + d;
          inStream = true;
          p = d;
        } else {
          const e = data.indexOf('endstream', p, 'latin1');
          if (e < 0) {
            const cut = last ? data.length : Math.max(p, data.length - KEEP);
            carry = Buffer.from(data.subarray(cut)); base += cut; break;
          }
          let end = base + e;
          // trailing EOL before `endstream` is not part of the data
          if (data[e - 1] === 0x0a) end--;
          if (end - 1 - base >= 0 && data[end - 1 - base] === 0x0d) end--;
          parts.push(`\u0001STREAM#${bodies.length}\u0001`);
          bodies.push({ start: streamStart, end });
          inStream = false;
          p = e + 9;
        }
        if (textBytes > 256 * 1024 * 1024) throw new Error('PDF structure too large to inspect');
      }
      if (last) break;
    }
  } finally { await fh.close(); }

  const text = parts.join('');
  const objects = new Map<number, PdfObject>();
  const dictTexts: { num: number; text: string }[] = [];
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text))) {
    const end = text.indexOf('endobj', m.index);
    const body = text.slice(m.index + m[0].length, end < 0 ? undefined : end);
    const marker = /\u0001STREAM#(\d+)\u0001/.exec(body);
    const dict = marker ? body.slice(0, marker.index) : body;
    const obj: PdfObject = { num: Number(m[1]), dict: dict.trim(), stream: marker ? bodies[Number(marker[1])]! : null };
    objects.set(obj.num, obj);
    dictTexts.push({ num: obj.num, text: obj.dict });
    if (end >= 0) re.lastIndex = end + 6;
  }
  const s: Structure = { path: pdfPath, objects, dictTexts };
  // Objects packed into object streams.
  for (const obj of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm\b/.test(obj.dict)) continue;
    const data = await decodeStream(s, obj);
    if (!data) continue;
    const n = Number(dictValue(obj.dict, 'N') ?? 0);
    const first = Number(dictValue(obj.dict, 'First') ?? 0);
    const txt = data.toString('latin1');
    const header = txt.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = header[i * 2];
      const off = header[i * 2 + 1];
      const next = i + 1 < n ? header[(i + 1) * 2 + 1] : undefined;
      if (num === undefined || off === undefined) break;
      const body = txt.slice(first + off, next === undefined ? undefined : first + next).trim();
      if (!objects.has(num)) objects.set(num, { num, dict: body, stream: null });
      dictTexts.push({ num, text: body });
    }
  }
  return s;
}

/** The page objects in reading order (Catalog → Pages → Kids), falling back to file order. */
function pageObjects(s: Structure): PdfObject[] {
  const catalog = [...s.objects.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const out: PdfObject[] = [];
  const seen = new Set<number>();
  const walk = (num: number | null, depth: number) => {
    if (num === null || seen.has(num) || depth > 64) return;
    seen.add(num);
    const o = s.objects.get(num);
    if (!o) return;
    if (/\/Type\s*\/Pages\b/.test(o.dict) || dictValue(o.dict, 'Kids')) {
      const kids = dictValue(o.dict, 'Kids') ?? '';
      for (const k of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(k[1]), depth + 1);
    } else if (/\/Type\s*\/Page\b/.test(o.dict)) out.push(o);
  };
  if (catalog) walk(refNum(dictValue(catalog.dict, 'Pages')), 0);
  if (out.length === 0) for (const o of s.objects.values()) if (/\/Type\s*\/Page\b(?!s)/.test(o.dict)) out.push(o);
  return out;
}

/** A page's resource dictionary text, following references and the Parent chain. */
function resourcesOf(s: Structure, page: PdfObject): string {
  let o: PdfObject | undefined = page;
  for (let i = 0; o && i < 64; i++) {
    const v = dictValue(o.dict, 'Resources');
    if (v) {
      const n = refNum(v);
      const text = n !== null ? s.objects.get(n)?.dict ?? '' : v;
      if (text) return text;
    }
    const parent = refNum(dictValue(o.dict, 'Parent'));
    o = parent !== null ? s.objects.get(parent) : undefined;
  }
  return '';
}

/** Names declared under a resource category (/XObject, /Font…), with the object each points at. */
function resourceNames(s: Structure, resources: string, category: string): Map<string, PdfObject | null> {
  let v = dictValue(resources, category);
  const n = refNum(v);
  if (n !== null) v = s.objects.get(n)?.dict ?? null;
  const names = new Map<string, PdfObject | null>();
  if (!v) return names;
  for (const m of v.matchAll(/\/([^\s<>\[\]\/(){}%]+)\s+(?:(\d+)\s+\d+\s+R|<<)/g)) names.set(m[1]!, m[2] ? s.objects.get(Number(m[2])) ?? null : null);
  return names;
}

async function pageContent(s: Structure, page: PdfObject): Promise<string | null> {
  const v = dictValue(page.dict, 'Contents');
  if (!v) return '';
  const nums = v.startsWith('[') ? [...v.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1])) : refNum(v) !== null ? [refNum(v)!] : [];
  const chunks: string[] = [];
  for (const n of nums) {
    const o = s.objects.get(n);
    if (!o) return null;
    const data = await decodeStream(s, o);
    if (!data) return null;
    chunks.push(data.toString('latin1'));
  }
  return chunks.join('\n');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: (number | string)[]) => xs.slice(0, 6).join(', ') + (xs.length > 6 ? '…' : '');

// ---------------------------------------------------------------------------
// The inspection.
// ---------------------------------------------------------------------------

export async function inspectPdfContent(pdfPath: string): Promise<ContentInspection> {
  const problems: ContentProblem[] = [];

  // --- version ---
  let version: string | null = null;
  let pages = 0;
  try {
    const info = await run('pdfinfo', [pdfPath], 30_000);
    version = /^PDF version:\s+([\d.]+)/m.exec(info.stdout)?.[1] ?? null;
    pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] ?? 0);
  } catch { /* the size check has already opened the file */ }
  if (version && Number(version) > MAX_PDF_VERSION) {
    problems.push({ reason: 'pdf_version', detail: `The file is PDF ${version}. Export as PDF/X-1a:2003 (PDF 1.3 or 1.4), which has no transparency by definition.` });
  }

  // --- the object dictionaries: transparency, masks, CMYK and spot color ---
  const s = await readStructure(pdfPath);
  let softMasks = 0; let groups = 0; let alphaObjs = 0; let stencils = 0; let imageMasks = 0;
  let cmykObjs = 0; let spotObjs = 0;
  const blendModes = new Map<string, number>();
  // The PDF/X output intent names a press profile; that one CMYK profile is not content.
  const outputProfiles = new Set<number>();
  for (const { text } of s.dictTexts) for (const m of text.matchAll(/\/DestOutputProfile\s+(\d+)\s+\d+\s+R/g)) outputProfiles.add(Number(m[1]));
  for (const { num, text } of s.dictTexts) {
    const iccProfile = /\/N\s+\d/.test(text) && /\/Alternate\b/.test(text) && !/\/Subtype\s*\/Image\b/.test(text);
    if (iccProfile) {
      if (/\/N\s+4\b/.test(text) && !outputProfiles.has(num)) cmykObjs++;
    } else if (/\/DeviceCMYK\b/.test(text)) cmykObjs++;
    if (/\/Separation\b|\/DeviceN\b/.test(text) && !/\/Type\s*\/OutputIntent\b/.test(text)) spotObjs++;
    if (/\/SMask(?![A-Za-z])\s*(?!\/None\b)(?:\d+\s+\d+\s+R|<<)/.test(text)) softMasks++;
    if (/\/S\s*\/Transparency\b/.test(text)) groups++;
    for (const bm of text.matchAll(/\/BM\s*(\/[A-Za-z]+|\[[^\]]*\])/g)) {
      for (const name of bm[1]!.match(/\/[A-Za-z]+/g) ?? []) {
        if (name !== '/Normal' && name !== '/Compatible') blendModes.set(name.slice(1), (blendModes.get(name.slice(1)) ?? 0) + 1);
      }
    }
    let alpha = false;
    for (const a of text.matchAll(/\/(?:CA|ca)\s+(\d*\.?\d+)/g)) if (Number(a[1]) < 1) alpha = true;
    if (alpha) alphaObjs++;
    if (/\/ImageMask\s+true\b/.test(text)) stencils++;
    if (/\/Subtype\s*\/Image\b/.test(text) && /\/Mask(?![A-Za-z])\s*(?:\d+\s+\d+\s+R|\[|<<)/.test(text)) imageMasks++;
  }
  if (softMasks || groups || blendModes.size || alphaObjs) {
    const bits: string[] = [];
    if (softMasks) bits.push(plural(softMasks, 'soft mask', 'soft masks'));
    if (groups) bits.push(plural(groups, 'transparency group'));
    if (blendModes.size) bits.push(`blend mode ${[...blendModes.keys()].join('/')} on ${plural([...blendModes.values()].reduce((a, b) => a + b, 0), 'object')}`);
    if (alphaObjs) bits.push(`opacity below 100% on ${plural(alphaObjs, 'object')}`);
    problems.push({ reason: 'transparency', detail: `Live transparency: ${bits.join(', ')}. Flatten before export so every page is plain painted content.` });
  }
  // Content streams: CMYK fills and strokes (the k / K operators) and the cs/CS of a CMYK space.
  let cmykOps = 0;
  const pageObjsForColor = pageObjects(s);
  for (const page of pageObjsForColor) {
    const content = await pageContent(s, page);
    if (!content) continue;
    const hits = content.match(/(?:[-\d.]+\s+){4}[kK](?=[\s%\/\[<(]|$)/gm);
    if (hits) cmykOps += hits.length;
  }
  if (cmykObjs || spotObjs || cmykOps) {
    const bits: string[] = [];
    if (cmykObjs) bits.push(plural(cmykObjs, 'CMYK color space or image'));
    if (cmykOps) bits.push(`CMYK fills or strokes on the pages (${plural(cmykOps, 'use')})`);
    if (spotObjs) bits.push(plural(spotObjs, 'spot (Separation/DeviceN) color'));
    problems.push({ reason: 'color_mode', detail: `Not RGB: ${bits.join(', ')}. Converting to CMYK yourself clips the colors to an offset-press gamut before we ever see them, and the Fiery then faithfully prints that smaller gamut, so the result is flat and dull. Hand us RGB and the RIP uses the full gamut of the press. Keep the document in sRGB (8-bit, profile embedded) and export in RGB.` });
  }
  if (stencils || imageMasks) {
    const bits: string[] = [];
    if (stencils) bits.push(plural(stencils, 'stencil-masked image'));
    if (imageMasks) bits.push(plural(imageMasks, 'image with a /Mask'));
    problems.push({ reason: 'masks', detail: `Masks over the art: ${bits.join(' and ')}. Composite transparent art onto its background before placing it; do not place images with a mask or an alpha channel.` });
  }

  // --- pages: wrapper groups and missing resources ---
  const pageObjs = pageObjects(s);
  const wrapped: number[] = [];
  const missing: { page: number; name: string }[] = [];
  for (let i = 0; i < pageObjs.length; i++) {
    const page = pageObjs[i]!;
    const content = await pageContent(s, page);
    if (content === null) continue; // a filter we cannot undo: leave it to the press
    const resources = resourcesOf(s, page);
    const xobjects = resourceNames(s, resources, 'XObject');
    const draws = [...content.matchAll(/\/([^\s<>\[\]\/(){}%]+)\s+Do\b/g)].map((m) => m[1]!);
    for (const name of draws) if (!xobjects.has(name)) { missing.push({ page: i + 1, name }); break; }
    // Only q/Q, cm, a clip rectangle and one Do of a *form*: the page is a wrapper around that form.
    const ops = content.replace(/%[^\n]*/g, '').match(/(?<![\w.\-/])[A-Za-z*'"]+(?![\w])/g) ?? [];
    const allowed = new Set(['q', 'Q', 'cm', 're', 'W', 'n', 'Do', 'gs']);
    const target = draws.length === 1 ? xobjects.get(draws[0]!) : undefined;
    const isForm = !!target && /\/Subtype\s*\/Form\b/.test(target.dict);
    if (isForm && ops.length > 0 && ops.every((op) => allowed.has(op))) wrapped.push(i + 1);
  }
  if (missing.length) {
    problems.push({ reason: 'corrupted', detail: `${plural(missing.length, 'page')} (${list(missing.map((m) => m.page))}) draw${missing.length === 1 ? 's' : ''} a resource the file does not contain (e.g. /${missing[0]!.name}), so ${missing.length === 1 ? 'it' : 'they'} will come up blank in some viewers. Re-export from the original document rather than splitting or merging PDFs.` });
  }
  if (wrapped.length && wrapped.length === pageObjs.length) {
    problems.push({ reason: 'page_wrappers', detail: `Every page is a wrapper around a single form (${plural(wrapped.length, 'page')}), which imports as a group with a clipping mask. Draw page content directly on the page; the page boxes already keep it in place.` });
  }

  // --- images: resolution and format (pdfimages -list) ---
  let images = 0;
  try {
    const im = await run('pdfimages', ['-list', pdfPath], 120_000);
    const low: { page: number; ppi: number }[] = [];
    const sixteen: number[] = []; const jpx: number[] = []; const jbig: number[] = []; const maskImgs: number[] = []; const cmykImgs: number[] = [];
    for (const line of im.stdout.split('\n').slice(2)) {
      const c = line.trim().split(/\s+/);
      if (c.length < 13 || !/^\d+$/.test(c[0]!)) continue;
      images++;
      const page = Number(c[0]); const type = c[2]!; const width = Number(c[3]); const height = Number(c[4]);
      const bpc = Number(c[7]); const enc = c[8]!; const xppi = Number(c[c.length - 4]); const yppi = Number(c[c.length - 3]);
      if (type === 'smask' || type === 'stencil' || type === 'mask') maskImgs.push(page);
      if (type !== 'image') continue;
      const color = c[5]!; const comp = Number(c[6]);
      if (color === 'cmyk' || color === 'sep' || color === 'devn' || (color === 'icc' && comp === 4) || (color === 'index' && comp === 4)) cmykImgs.push(page);
      if (bpc === 16) sixteen.push(page);
      if (enc === 'jpx') jpx.push(page);
      if (enc === 'jbig2') jbig.push(page);
      if (Number.isFinite(xppi) && Number.isFinite(yppi) && xppi > 0 && yppi > 0) {
        const placedW = width / xppi; const placedH = height / yppi;
        if (Math.max(placedW, placedH) >= 0.5 && Math.min(xppi, yppi) < MIN_IMAGE_PPI) low.push({ page, ppi: Math.round(Math.min(xppi, yppi)) });
      }
    }
    if (low.length) {
      const worst = Math.min(...low.map((l) => l.ppi));
      const pagesHit = [...new Set(low.map((l) => l.page))];
      problems.push({ reason: 'low_resolution', detail: `${plural(low.length, 'image')} below ${MIN_IMAGE_PPI} ppi at the printed size (lowest ${worst} ppi, on ${plural(pagesHit.length, 'page')} ${list(pagesHit)}). Print needs ${TARGET_IMAGE_PPI} ppi at placed size; re-export from the original artwork.` });
    }
    if (sixteen.length || jpx.length || jbig.length) {
      const bits: string[] = [];
      if (sixteen.length) bits.push(`16-bit images on ${plural(sixteen.length, 'page')} ${list([...new Set(sixteen)])}`);
      if (jpx.length) bits.push(`JPEG 2000 images on ${plural(jpx.length, 'page')} ${list([...new Set(jpx)])}`);
      if (jbig.length) bits.push(`JBIG2 images on ${plural(jbig.length, 'page')} ${list([...new Set(jbig)])}`);
      problems.push({ reason: 'image_format', detail: `${bits.join('; ')}. Use 8-bit CMYK or sRGB images with ordinary JPEG or Flate compression.` });
    }
    if (cmykImgs.length && !problems.some((p) => p.reason === 'color_mode')) {
      problems.push({ reason: 'color_mode', detail: `CMYK images on ${plural(new Set(cmykImgs).size, 'page')} ${list([...new Set(cmykImgs)])}. Converting to CMYK yourself clips the colors to an offset-press gamut before we ever see them, and the Fiery then faithfully prints that smaller gamut, so the result is flat and dull. Hand us RGB and the RIP uses the full gamut of the press. Keep images in sRGB (8-bit, profile embedded).` });
    }
    if (maskImgs.length && !problems.some((p) => p.reason === 'masks' || p.reason === 'transparency')) {
      problems.push({ reason: 'masks', detail: `Masked images on ${plural(new Set(maskImgs).size, 'page')} ${list([...new Set(maskImgs)])}. Composite art onto its background before placing it.` });
    }
  } catch { /* pdfimages unavailable: the dictionary scan above still ran */ }

  // --- fonts (pdffonts) ---
  let fonts = 0;
  try {
    const pf = await run('pdffonts', [pdfPath], 60_000);
    const notEmbedded: string[] = [];
    for (const line of pf.stdout.split('\n').slice(2)) {
      if (!line.trim()) continue;
      const cols = line.trim().split(/\s+/);
      if (cols.length < 7) continue;
      fonts++;
      // name type encoding emb sub uni object ID — the emb column sits 5 from the end.
      const emb = cols[cols.length - 5];
      if (emb === 'no') notEmbedded.push(cols[0]!.replace(/^[A-Z]{6}\+/, ''));
    }
    if (notEmbedded.length) {
      problems.push({ reason: 'fonts', detail: `${plural(notEmbedded.length, 'font')} not embedded (${list([...new Set(notEmbedded)])}). Embed every font or convert the type to outlines before exporting.` });
    }
  } catch { /* pdffonts unavailable */ }

  return { problems, version, pages, images, fonts };
}
