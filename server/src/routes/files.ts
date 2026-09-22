/**
 * Stable URLs for stored files.
 *
 * A private R2 bucket can only be read through time-limited signed URLs. If we
 * persisted one of those on the MediaFile it would go dead a few days later —
 * breaking proof links in already-sent emails and every admin download. So the
 * database holds a permanent `/api/files/<subdir>/<name>` URL and this route
 * mints a fresh signature per request and redirects to it.
 *
 * Falls back to the local file when R2 isn't in play, so the same URL works
 * before, during, and after migration.
 */
import { Router } from 'express';
import path from 'node:path';
import { prisma } from '../db.js';
import { isR2Enabled, r2PublicUrl, r2SignedUrl } from '../lib/r2.js';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');

/** `attachment; filename="…"; filename*=UTF-8''…` for any original name. */
function attachmentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, "'");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

const router = Router();

router.get(/^\/(.+)$/, async (req, res) => {
  const key = decodeURIComponent(String((req.params as unknown as string[])[0] ?? '')).replace(/^\/+/, '');
  if (!key || key.includes('..')) return res.status(400).json({ error: 'Bad file path' });

  const filename = path.basename(key);

  // Partner uploads stay capability-gated exactly as they are on local disk:
  // the ?t= token must match, unless an admin/staff session is making the call.
  if (key.startsWith('partner/')) {
    const isStaff = req.session?.role === 'ADMIN' || req.session?.role === 'STAFF';
    if (!isStaff) {
      const media = await prisma.mediaFile.findUnique({ where: { filename }, select: { accessToken: true } });
      const token = String(req.query.t ?? '');
      if (!media?.accessToken || media.accessToken !== token) {
        return res.status(403).json({ error: 'Invalid access token' });
      }
    }
  }

  // ?download=1 — save to disk, never open in the browser. An <a download>
  // attribute cannot do this on its own: it is ignored across the redirect to
  // R2, and the stored object says "inline", so Chrome opened PDFs in its own
  // viewer (which renders print PDFs as black pages) when people clicked
  // "download". The bytes are the untouched original either way; only the
  // disposition changes, and the customer's original filename comes back.
  const wantsDownload = req.query.download === '1' || req.query.download === 'true';
  const originalName = wantsDownload
    ? (await prisma.mediaFile.findUnique({ where: { filename }, select: { originalName: true } }))?.originalName ?? filename
    : filename;

  if (await isR2Enabled()) {
    const url = wantsDownload
      ? await r2SignedUrl(key, 3600, { contentDisposition: attachmentDisposition(originalName) })
      : (await r2PublicUrl(key)) ?? (await r2SignedUrl(key, 3600));
    if (url) {
      // Short-lived redirect: the signature expires, the /api/files URL doesn't.
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.redirect(302, url);
    }
  }

  // Not on R2 (or R2 unavailable) — the local copy.
  if (wantsDownload) {
    const abs = path.join(UPLOADS_DIR, key);
    if (!abs.startsWith(UPLOADS_DIR + path.sep)) return res.status(400).json({ error: 'Bad file path' });
    return res.download(abs, originalName, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'File not found' }); });
  }
  return res.redirect(302, `/uploads/${key}${req.query.t ? `?t=${req.query.t}` : ''}`);
});

export default router;
