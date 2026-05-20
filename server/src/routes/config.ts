import { Router } from 'express';
import { getPaypalConfig, getSetting } from '../lib/settings.js';

const router = Router();

/**
 * Exposes the public pieces of the payment config to the storefront.
 * The client secret and webhook ID stay server-side.
 */
router.get('/paypal', async (_req, res) => {
  const cfg = await getPaypalConfig();
  res.json({
    clientId: cfg.clientId,
    environment: cfg.environment,
    enableCard: cfg.enableCard,
    enableButton: cfg.enableButton,
  });
});

router.get('/site-discount', async (_req, res) => {
  const raw = await getSetting<number | string>('pricing.siteDiscountBps', 0);
  const bps = Math.max(0, Math.min(9999, Number(raw) || 0));
  res.json({ discountBps: bps });
});

export default router;
