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

  if (await isR2Enabled()) {
    const url = (await r2PublicUrl(key)) ?? (await r2SignedUrl(key, 3600));
    if (url) {
      // Short-lived redirect: the signature expires, the /api/files URL doesn't.
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.redirect(302, url);
    }
  }

  // Not on R2 (or R2 unavailable) — serve the local copy.
  return res.redirect(302, `/uploads/${key}${req.query.t ? `?t=${req.query.t}` : ''}`);
});

export default router;
