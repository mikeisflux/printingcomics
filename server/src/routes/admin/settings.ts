import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const settings = await prisma.setting.findMany();
  const map: Record<string, unknown> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json({ settings: map });
});

const writeSchema = z.object({ key: z.string().min(1), value: z.any() });

router.put('/', async (req, res) => {
  const { key, value } = writeSchema.parse(req.body);
  const s = await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  res.json({ setting: s });
});

// Shipping zones + rates
router.get('/shipping', async (_req, res) => {
  const zones = await prisma.shippingZone.findMany({ include: { rates: true } });
  res.json({ zones });
});

const zoneSchema = z.object({ name: z.string().min(1), countries: z.array(z.string()) });
router.post('/shipping/zones', async (req, res) => {
  const data = zoneSchema.parse(req.body);
  const zone = await prisma.shippingZone.create({ data });
  res.json({ zone });
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
  const rate = await prisma.shippingRate.create({ data });
  res.json({ rate });
});

// Tax rates
router.get('/taxes', async (_req, res) => {
  const taxes = await prisma.taxRate.findMany();
  res.json({ taxes });
});

const taxSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  country: z.string().default('US'),
  rateBps: z.number().int().min(0).max(10_000),
});
router.post('/taxes', async (req, res) => {
  const data = taxSchema.parse(req.body);
  const tax = await prisma.taxRate.create({ data });
  res.json({ tax });
});

// Coupons
router.get('/coupons', async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ coupons });
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
  const coupon = await prisma.coupon.create({
    data: { ...data, expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined },
  });
  res.json({ coupon });
});

export default router;
