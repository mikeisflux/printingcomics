import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

// ---- List ----
router.get('/', async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ coupons });
});

const baseSchema = z.object({
  code: z.string().min(1).max(64).transform((s) => s.trim().toUpperCase()),
  description: z.string().max(200).nullable().optional(),
  percentOffBps: z.number().int().min(0).max(10_000).nullable().optional(),
  amountOffCents: z.number().int().min(0).nullable().optional(),
  minSubtotalCents: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  // Accepts a date ("2026-12-31") or full ISO string; empty/null clears it.
  expiresAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

function parseExpiry(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined; // leave unchanged
  if (v === null || v.trim() === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid expiry date.');
  return d;
}

// ---- Create ----
router.post('/', async (req, res) => {
  const data = baseSchema.parse(req.body);
  if (!data.percentOffBps && !data.amountOffCents) {
    throw new HttpError(400, 'Set a percent-off or amount-off value.');
  }
  const clash = await prisma.coupon.findUnique({ where: { code: data.code } });
  if (clash) throw new HttpError(409, `A code named ${data.code} already exists.`);

  const coupon = await prisma.coupon.create({
    data: {
      code: data.code,
      description: data.description ?? null,
      percentOffBps: data.percentOffBps ?? null,
      amountOffCents: data.amountOffCents ?? null,
      minSubtotalCents: data.minSubtotalCents ?? 0,
      usageLimit: data.usageLimit ?? null,
      expiresAt: parseExpiry(data.expiresAt) ?? null,
      active: data.active ?? true,
    },
  });
  res.status(201).json({ coupon });
});

// ---- Update ----
const updateSchema = baseSchema.partial();

router.put('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Coupon not found');

  // Never allow a coupon with no discount value.
  const nextPct = data.percentOffBps !== undefined ? data.percentOffBps : existing.percentOffBps;
  const nextAmt = data.amountOffCents !== undefined ? data.amountOffCents : existing.amountOffCents;
  if (!nextPct && !nextAmt) throw new HttpError(400, 'Set a percent-off or amount-off value.');

  if (data.code && data.code !== existing.code) {
    const clash = await prisma.coupon.findUnique({ where: { code: data.code } });
    if (clash) throw new HttpError(409, `A code named ${data.code} already exists.`);
  }

  const expiresAt = parseExpiry(data.expiresAt);

  const coupon = await prisma.coupon.update({
    where: { id: existing.id },
    data: {
      code: data.code ?? undefined,
      description: data.description === undefined ? undefined : data.description,
      percentOffBps: data.percentOffBps === undefined ? undefined : data.percentOffBps,
      amountOffCents: data.amountOffCents === undefined ? undefined : data.amountOffCents,
      minSubtotalCents: data.minSubtotalCents === undefined ? undefined : data.minSubtotalCents,
      usageLimit: data.usageLimit === undefined ? undefined : data.usageLimit,
      expiresAt: expiresAt === undefined ? undefined : expiresAt,
      active: data.active === undefined ? undefined : data.active,
    },
  });
  res.json({ coupon });
});

// ---- Delete ----
router.delete('/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
