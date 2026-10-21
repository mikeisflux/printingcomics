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
import { requireAdmin, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

// Each area needs its permission (admins have all; see lib/permissions.ts).
// The dashboard is open to any staff account; the users router checks its
// own routes (reading customers vs. managing accounts).
router.use('/dashboard', dashboard);
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

export default router;
