/**
 * Public, key-authenticated API used by integrators (crowdfunding platforms,
 * etc.) to submit print orders and read catalog/pricing/shipping data.
 *
 * Auth: pass an API key minted in /admin/developers/api-keys via either
 *   Authorization: Bearer pc_live_…
 *   X-Api-Key: pc_live_…
 *
 * See /developers (storefront) for the full reference.
 */
import { Router } from 'express';
import catalog from './catalog.js';
import pricing from './pricing.js';
import shipping from './shipping.js';
import orders from './orders.js';
import uploads from './uploads.js';
import partnerApplications from './partner-applications.js';
import { requireApiKey } from '../../middleware/api-key.js';

const router = Router();

// Lightweight auth probe — verifies the key works and returns the scopes.
router.get('/me', requireApiKey(), (req, res) => {
  res.json({ apiKey: req.apiKey });
});

router.use('/catalog', catalog);
router.use('/pricing', pricing);
router.use('/shipping', shipping);
router.use('/orders', orders);
router.use('/uploads', uploads);
// Public, unauthenticated — submit a partner API access request.
router.use('/partner-applications', partnerApplications);

export default router;
