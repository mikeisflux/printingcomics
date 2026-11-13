import { Router } from 'express';
import dashboard from './dashboard.js';
import products from './products.js';
import orders from './orders.js';
import users from './users.js';
import categories from './categories.js';
import settings from './settings.js';
import seo from './seo.js';
import email from './email.js';
import security from './security.js';
import backup from './backup.js';
import media from './media.js';
import fulfillment from './fulfillment.js';
import apiKeys from './api-keys.js';
import partners from './partners.js';
import siteDiscounts from './site-discounts.js';
import coupons from './coupons.js';
import reviews from './reviews.js';
import costs from './costs.js';
import stockPools from './stock-pools.js';
import pod from './pod.js';
import podPreflight from './pod-preflight.js';
import { requireAdmin, requirePermission } from '../../middleware/auth.js';
import { hasPermission, PERMISSION_KEYS } from '../../lib/permissions.js';

const router = Router();
router.use(requireAdmin);

// Each area needs its permission (admins have all; see lib/permissions.ts).
// The dashboard is open to any staff account; the users router checks its
// own routes (reading customers vs. managing accounts).
// The store dashboard shows revenue; an account that only holds Print on
// Demand (or Preflight) lives in that section and does not get it.
router.use('/dashboard', (req, res, next) => {
  const general = PERMISSION_KEYS.filter((k) => k !== 'pod' && k !== 'preflight');
  if (!general.some((k) => hasPermission(req.session, k))) return res.status(403).json({ error: 'Your account is limited to Distribution.', permission: 'orders' });
  next();
}, dashboard);
router.use('/products', requirePermission('products'), products);
router.use('/orders', requirePermission('orders'), orders);
router.use('/users', users);
router.use('/categories', requirePermission('products'), categories);
router.use('/settings', requirePermission('settings'), settings);
router.use('/seo', requirePermission('marketing'), seo);
router.use('/email', requirePermission('email'), email);
router.use('/security', requirePermission('settings'), security);
router.use('/backup', requirePermission('settings'), backup);
router.use('/media', requirePermission('products'), media);
router.use('/fulfillment', requirePermission('fulfillment'), fulfillment);
router.use('/api-keys', requirePermission('partners'), apiKeys);
router.use('/partners', requirePermission('partners'), partners);
router.use('/site-discounts', requirePermission('marketing'), siteDiscounts);
router.use('/coupons', requirePermission('marketing'), coupons);
router.use('/reviews', requirePermission('marketing'), reviews);
router.use('/costs', requirePermission('products'), costs);
router.use('/stock-pools', requirePermission('products'), stockPools);
// Preflight first: it has its own guard (pod OR preflight) and must not be
// swallowed by the pod router's permission check.
router.use('/pod/preflight', podPreflight);
router.use('/pod', requirePermission('pod'), pod);

export default router;
