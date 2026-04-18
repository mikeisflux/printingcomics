import { Router } from 'express';
import { recordClick, recordOpen } from '../lib/smtp.js';

const router = Router();

// 1×1 transparent GIF — 43 bytes. We serve this for the open-tracking pixel.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

router.get('/open', async (req, res) => {
  const t = typeof req.query.t === 'string' ? req.query.t : '';
  if (t) {
    try { await recordOpen(t); } catch { /* swallow */ }
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).end(PIXEL);
});

router.get('/click', async (req, res) => {
  const t = typeof req.query.t === 'string' ? req.query.t : '';
  const u = typeof req.query.u === 'string' ? req.query.u : '';
  if (!u) return res.status(400).send('Missing url');
  // Only allow absolute http(s) URLs — don't become an open redirector.
  if (!/^https?:\/\//i.test(u)) return res.status(400).send('Invalid url');
  if (t) {
    try { await recordClick(t, u); } catch { /* swallow */ }
  }
  res.redirect(302, u);
});

export default router;
