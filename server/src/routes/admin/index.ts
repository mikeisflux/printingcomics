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
import { requireAdmin } from '../../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

router.use('/dashboard', dashboard);
router.use('/products', products);
router.use('/orders', orders);
router.use('/users', users);
router.use('/categories', categories);
router.use('/settings', settings);
router.use('/seo', seo);
router.use('/email', email);
router.use('/security', security);
router.use('/backup', backup);
router.use('/media', media);

export default router;
