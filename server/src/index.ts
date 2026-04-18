import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { attachSession } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import checkoutRoutes from './routes/checkout.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin/index.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: config.webOrigins,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(attachSession);

// Global modest rate limit; auth routes get a tighter limit below.
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }), authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[pc-server] listening on http://localhost:${config.port}`);
});
