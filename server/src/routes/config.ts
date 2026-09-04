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

/**
 * Storefront config for the Shipping Supplies (Comic Armor) landing page.
 * The hero video lives in Settings so it can be swapped without a deploy.
 */
const COMIC_ARMOR_VIDEO = 'https://www.youtube.com/watch?v=m5qpEu0waaU';

router.get('/shipping-supplies', async (_req, res) => {
  // Defaults to the Comic Armor demo so the page ships with its video.
  // Settings overrides it; clearing the field falls back here again, since
  // getSetting treats an empty string as unset.
  const url = await getSetting<string>('shippingSupplies.heroVideoUrl', COMIC_ARMOR_VIDEO);
  res.json({ heroVideoUrl: String(url ?? '').trim() });
});

router.get('/site-discount', async (_req, res) => {
  const raw = await getSetting<number | string>('pricing.siteDiscountBps', 0);
  const bps = Math.max(0, Math.min(9999, Number(raw) || 0));
  res.json({ discountBps: bps });
});

export default router;
