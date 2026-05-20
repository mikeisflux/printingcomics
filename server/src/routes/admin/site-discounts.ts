import { Router } from 'express';
import { z } from 'zod';
import { getSetting, setSetting, deleteSetting } from '../../lib/settings.js';

const router = Router();

router.get('/', async (_req, res) => {
  const raw = await getSetting<number | string>('pricing.siteDiscountBps', 0);
  const bps = Math.max(0, Math.min(9999, Number(raw) || 0));
  res.json({ discountBps: bps, discountPct: bps / 100 });
});

const bodySchema = z.object({
  discountPct: z.number().min(0).max(99.99),
});

router.put('/', async (req, res) => {
  const { discountPct } = bodySchema.parse(req.body);
  const bps = Math.round(discountPct * 100);
  if (bps === 0) {
    await deleteSetting('pricing.siteDiscountBps');
  } else {
    await setSetting('pricing.siteDiscountBps', bps);
  }
  res.json({ ok: true, discountBps: bps, discountPct });
});

export default router;
