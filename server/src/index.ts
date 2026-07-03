// Express 5 forwards async rejections from handlers/middleware to the error
// handler natively — no express-async-errors patch needed.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

import { config } from './config.js';
import { attachSession } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { botBlockerGate } from './middleware/botblocker.js';
import { cleanupExpiredData } from './lib/bot-blocker.js';
import { startCampaignScheduler } from './lib/email-send.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import checkoutRoutes from './routes/checkout.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin/index.js';
import configRoutes from './routes/config.js';
import uploadRoutes from './routes/uploads.js';
import newsletterRoutes from './routes/newsletter.js';
import accountRoutes from './routes/account.js';
import contactRoutes from './routes/contact.js';
import aiRoutes from './routes/ai.js';
import publicRoutes from './routes/public.js';
import mailgunWebhookRoutes from './routes/webhooks/mailgun.js';
import paypalWebhookRoutes from './routes/webhooks/paypal.js';
import easypostWebhookRoutes from './routes/webhooks/easypost.js';
import v1Routes from './routes/v1/index.js';

const app = express();

// Trust X-Forwarded-For if behind a reverse proxy
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: config.webOrigins,
    credentials: true,
  }),
);
app.use(cookieParser());
// JSON body limit stays modest — large files flow through multer (multipart),
// not JSON. If you truly need a 2 GB JSON payload, bump this too.
// Capture the raw body string so the API-key middleware can verify HMAC
// signatures byte-for-byte (JSON re-serialization isn't stable enough).
app.use(
  express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString('utf8');
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(attachSession);

// Bot blocker — rejects requests from banned IPs.
app.use(botBlockerGate);

app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.use('/api/config', configRoutes);
app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20 }), authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/webhooks/mailgun', mailgunWebhookRoutes);
app.use('/api/webhooks/paypal', paypalWebhookRoutes);
app.use('/api/webhooks/easypost', easypostWebhookRoutes);
app.use('/api/admin', adminRoutes);

// Public, key-authenticated developer API (orders, catalog, pricing,
// shipping). Heavier rate limit since integrators may bulk-submit orders.
app.use(
  '/api/v1',
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // Per-key limiting when the key is on the request, falling back to IP.
    keyGenerator: (req: any) => req.apiKey?.id ?? req.ip,
  }),
  v1Routes,
);

// Partner-uploaded print files require ?t=<accessToken>. The token is
// sha256(filename + JWT_SECRET) so leaked filenames alone can't be enumerated.
// Authenticated admins skip the check (so the admin UI can preview without
// chasing tokens).
app.use('/uploads/partner', async (req, res, next) => {
  const isAdmin = req.session?.role === 'ADMIN' || req.session?.role === 'STAFF';
  if (isAdmin) return next();
  const filename = path.basename(req.path);
  const token = String(req.query.t ?? '');
  if (!token || !filename) return res.status(403).json({ error: 'Missing access token' });
  const { prisma: db } = await import('./db.js');
  const media = await db.mediaFile.findUnique({ where: { filename } });
  if (!media || !media.accessToken || media.accessToken !== token) {
    return res.status(403).json({ error: 'Invalid access token' });
  }
  next();
});

// Public: serve uploaded email attachments (behind auth check in routes)
app.use('/uploads', express.static(path.resolve(process.env.UPLOADS_DIR ?? './uploads')));

app.use(notFound);
app.use(errorHandler);

// Run bot-blocker cleanup periodically (every 6 hours).
setInterval(() => {
  void cleanupExpiredData();
}, 6 * 60 * 60 * 1000);

// Poll for scheduled email campaigns every minute.
startCampaignScheduler(60_000);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[pc-server] listening on http://localhost:${config.port}`);
});
