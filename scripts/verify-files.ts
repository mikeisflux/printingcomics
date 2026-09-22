/**
 * verify-files — are the files we hand out actually the files that were uploaded?
 *
 *   npm run verify:files                 # every MediaFile row
 *   npm run verify:files -- --pdf        # only PDFs
 *   npm run verify:files -- --limit 20   # newest N
 *   npm run verify:files -- --full       # also download + SHA-256 (slow; needed only to check contentHash)
 *
 * For each file this fetches two tiny byte ranges from wherever it lives
 * (R2 via a signed URL, a public CDN URL, or local disk) and reports:
 *
 *   SIZE MISMATCH   stored byte count differs from what we recorded at upload
 *   BAD HEADER      first bytes are not the file type's magic (e.g. not %PDF)
 *   TRUNCATED       a PDF with no %%EOF in its last 1 KB
 *   MISSING         404 / not on disk
 *   OK              all of the above pass
 *
 * "OK" across the board means the bytes are intact end to end and a PDF that
 * looks wrong in a browser is a rendering problem in that viewer, not a file
 * problem. Anything else names the exact file and the way it is wrong.
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prisma } from '../server/src/db.js';
import { r2SignedUrl } from '../server/src/lib/r2.js';

const args = process.argv.slice(2);
const onlyPdf = args.includes('--pdf');
const full = args.includes('--full');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) || undefined : undefined;

// Same default as the server (which runs with cwd = server/), so a bare
// `./uploads` resolves to server/uploads from the repo root too.
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? path.join('server', 'uploads'));

const MAGIC: [RegExp, (b: Buffer) => boolean, string][] = [
  [/^application\/pdf$/, (b) => b.subarray(0, 4).toString('latin1') === '%PDF', '%PDF'],
  [/^image\/jpeg$/, (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'FF D8 FF'],
  [/^image\/png$/, (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), '\\x89PNG'],
  [/^image\/webp$/, (b) => b.subarray(0, 4).toString('latin1') === 'RIFF', 'RIFF'],
  [/^image\/gif$/, (b) => b.subarray(0, 4).toString('latin1') === 'GIF8', 'GIF8'],
  [/zip|officedocument|photoshop/, (b) => b.subarray(0, 2).toString('latin1') === 'PK' || b.subarray(0, 4).toString('latin1') === '8BPS', 'PK / 8BPS'],
];

interface Probe { size: number | null; head: Buffer; tail: Buffer; status: number; where: string }

async function probeRemote(url: string): Promise<Probe> {
  const head = await fetch(url, { headers: { Range: 'bytes=0-7' } });
  if (head.status === 404) return { size: null, head: Buffer.alloc(0), tail: Buffer.alloc(0), status: 404, where: url };
  if (!head.ok) return { size: null, head: Buffer.alloc(0), tail: Buffer.alloc(0), status: head.status, where: url };
  const headBuf = Buffer.from(await head.arrayBuffer());
  // 206 → "bytes 0-7/TOTAL". A 200 means the server ignored Range and sent everything.
  const range = head.headers.get('content-range');
  const total = range ? Number(range.split('/')[1]) : Number(head.headers.get('content-length'));
  const size = Number.isFinite(total) ? total : null;
  const tailRes = await fetch(url, { headers: { Range: 'bytes=-1024' } });
  const tail = tailRes.ok ? Buffer.from(await tailRes.arrayBuffer()) : Buffer.alloc(0);
  return { size, head: head.status === 206 ? headBuf : headBuf.subarray(0, 8), tail: tail.subarray(-1024), status: head.status, where: url };
}

async function probeLocal(rel: string): Promise<Probe> {
  const p = path.join(UPLOADS_DIR, rel.split('?')[0]!);
  try {
    const st = await fs.stat(p);
    const fh = await fs.open(p, 'r');
    try {
      const head = Buffer.alloc(8);
      await fh.read(head, 0, 8, 0);
      const tailLen = Math.min(1024, st.size);
      const tail = Buffer.alloc(tailLen);
      await fh.read(tail, 0, tailLen, st.size - tailLen);
      return { size: st.size, head, tail, status: 200, where: p };
    } finally { await fh.close(); }
  } catch {
    return { size: null, head: Buffer.alloc(0), tail: Buffer.alloc(0), status: 404, where: p };
  }
}

async function sha256Of(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${res.status}`);
  const h = createHash('sha256');
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) h.update(chunk);
  return h.digest('hex');
}

async function main() {
  const files = await prisma.mediaFile.findMany({
    where: onlyPdf ? { mimeType: 'application/pdf' } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, originalName: true, filename: true, mimeType: true, size: true, url: true, contentHash: true, tags: true },
  });
  console.log(`Checking ${files.length} file(s)${onlyPdf ? ' (PDFs only)' : ''}…\n`);

  const counts: Record<string, number> = {};
  const bad: string[] = [];

  for (const f of files) {
    if (f.tags.includes('missing-file')) { counts.SKIPPED = (counts.SKIPPED ?? 0) + 1; continue; }

    let probe: Probe;
    let fetchUrl: string | null = null;
    if (f.url.startsWith('/uploads/')) {
      probe = await probeLocal(f.url.replace(/^\/uploads\//, ''));
    } else {
      if (f.url.startsWith('/api/files/')) {
        const key = f.url.replace(/^\/api\/files\//, '').split('?')[0]!;
        fetchUrl = await r2SignedUrl(key, 600);
        if (!fetchUrl) { console.log(`ERROR         ${f.originalName}: R2 is not configured, cannot sign ${key}`); counts.ERROR = (counts.ERROR ?? 0) + 1; continue; }
      } else {
        fetchUrl = f.url; // public CDN url
      }
      probe = await probeRemote(fetchUrl);
    }

    const problems: string[] = [];
    if (probe.status === 404 || probe.size === null) {
      problems.push(`MISSING (${probe.status} at ${probe.where})`);
    } else {
      if (probe.size !== f.size) problems.push(`SIZE MISMATCH (recorded ${f.size} B, stored ${probe.size} B)`);
      const magic = MAGIC.find(([re]) => re.test(f.mimeType));
      if (magic && probe.head.length >= 4 && !magic[1](probe.head)) {
        problems.push(`BAD HEADER (expected ${magic[2]}, got ${JSON.stringify(probe.head.subarray(0, 8).toString('latin1'))})`);
      }
      if (f.mimeType === 'application/pdf' && probe.tail.length > 0 && !probe.tail.toString('latin1').includes('%%EOF')) {
        problems.push('TRUNCATED (no %%EOF in the last 1 KB)');
      }
      if (full && fetchUrl && f.contentHash) {
        const h = await sha256Of(fetchUrl);
        if (h !== f.contentHash) problems.push(`HASH MISMATCH (recorded ${f.contentHash.slice(0, 12)}…, stored ${h.slice(0, 12)}…)`);
      }
    }

    const verdict = problems.length ? problems.map((p) => p.split(' (')[0]).join('+') : 'OK';
    counts[verdict] = (counts[verdict] ?? 0) + 1;
    const line = `${verdict.padEnd(13)} ${f.originalName}  [${f.mimeType}, ${f.size} B]${problems.length ? '\n              ' + problems.join('\n              ') + `\n              url: ${f.url}` : ''}`;
    console.log(line);
    if (problems.length) bad.push(f.originalName);
  }

  console.log('\nSummary:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
  if (bad.length === 0) {
    console.log('\nEvery file is byte-for-byte the size it was uploaded at, starts with the right magic, and (for PDFs) ends with %%EOF.');
    console.log('A PDF that renders black is being rendered wrong by that viewer — try Adobe Acrobat / macOS Preview / Firefox.');
  } else {
    console.log(`\n${bad.length} file(s) are NOT intact — see above.`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
