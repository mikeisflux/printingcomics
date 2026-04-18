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
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(attachSession);

// Bot blocker — rejects requests from banned IPs.
app.use(botBlockerGate);

app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.use('/api/config', configRoutes);
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }), authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/admin', adminRoutes);

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
