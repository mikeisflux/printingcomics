import { Router } from 'express';
import { getPaypalConfig } from '../lib/settings.js';

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

export default router;
