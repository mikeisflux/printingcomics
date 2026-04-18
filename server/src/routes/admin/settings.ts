import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import {
  deleteSetting,
  invalidateSettingsCache,
  listAllSettings,
  setSetting,
  SECRET_KEYS,
} from '../../lib/settings.js';

const router = Router();

router.get('/', async (_req, res) => {
  const settings = await listAllSettings();
  res.json({ settings, secretKeys: [...SECRET_KEYS] });
});

const writeSchema = z.object({ key: z.string().min(1), value: z.any() });

router.put('/', async (req, res) => {
  const { key, value } = writeSchema.parse(req.body);
  // Ignore writes that try to mask (••••) a secret — those are the mask values
  // from list responses, not real credential updates.
  if (SECRET_KEYS.has(key) && typeof value === 'string' && /^[•]+/.test(value)) {
    return res.json({ ok: true, skipped: true });
  }
  await setSetting(key, value);
  res.json({ ok: true });
});

// Bulk update
const bulkSchema = z.object({ entries: z.array(z.object({ key: z.string(), value: z.any() })) });
router.put('/bulk', async (req, res) => {
  const { entries } = bulkSchema.parse(req.body);
  for (const e of entries) {
    if (SECRET_KEYS.has(e.key) && typeof e.value === 'string' && /^[•]+/.test(e.value)) continue;
    await setSetting(e.key, e.value);
  }
  res.json({ ok: true });
});

router.delete('/:key', async (req, res) => {
  await deleteSetting(req.params.key);
  res.json({ ok: true });
});

router.post('/refresh', async (_req, res) => {
  invalidateSettingsCache();
  res.json({ ok: true });
});

// -------- Shipping zones + rates (kept from prior version) --------
router.get('/shipping', async (_req, res) => {
  const zones = await prisma.shippingZone.findMany({ include: { rates: true } });
  res.json({ zones });
});

const zoneSchema = z.object({ name: z.string().min(1), countries: z.array(z.string()) });
router.post('/shipping/zones', async (req, res) => {
  const data = zoneSchema.parse(req.body);
  res.json({ zone: await prisma.shippingZone.create({ data }) });
});

const rateSchema = z.object({
  zoneId: z.string(),
  name: z.string().min(1),
  rateCents: z.number().int().min(0),
  perKg: z.boolean().optional(),
  minSubtotalCents: z.number().int().min(0).optional(),
  maxSubtotalCents: z.number().int().min(0).optional(),
  estimatedDays: z.string().optional(),
});
router.post('/shipping/rates', async (req, res) => {
  const data = rateSchema.parse(req.body);
  res.json({ rate: await prisma.shippingRate.create({ data }) });
});

router.delete('/shipping/rates/:id', async (req, res) => {
  await prisma.shippingRate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.delete('/shipping/zones/:id', async (req, res) => {
  await prisma.shippingZone.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// -------- Tax rates --------
router.get('/taxes', async (_req, res) => {
  res.json({ taxes: await prisma.taxRate.findMany() });
});

const taxSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  country: z.string().default('US'),
  rateBps: z.number().int().min(0).max(10_000),
});
router.post('/taxes', async (req, res) => {
  res.json({ tax: await prisma.taxRate.create({ data: taxSchema.parse(req.body) }) });
});

router.delete('/taxes/:id', async (req, res) => {
  await prisma.taxRate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// -------- Coupons --------
router.get('/coupons', async (_req, res) => {
  res.json({ coupons: await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }) });
});

const couponSchema = z.object({
  code: z.string().min(1).transform((s) => s.toUpperCase()),
  description: z.string().optional(),
  percentOffBps: z.number().int().min(0).max(10_000).nullable().optional(),
  amountOffCents: z.number().int().min(0).nullable().optional(),
  minSubtotalCents: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(0).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
});
router.post('/coupons', async (req, res) => {
  const data = couponSchema.parse(req.body);
  res.json({
    coupon: await prisma.coupon.create({
      data: { ...data, expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined },
    }),
  });
});

router.delete('/coupons/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
