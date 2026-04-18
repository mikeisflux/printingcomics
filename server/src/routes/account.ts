import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

const router = Router();

// Profile

const profileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(32).optional(),
});

router.put('/profile', requireAuth, async (req, res) => {
  const data = profileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.session!.sub },
    data: {
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      phone: data.phone ?? null,
    },
    select: { id: true, email: true, role: true, firstName: true, lastName: true, phone: true },
  });
  res.json({ user });
});

// Password change

const pwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = pwSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.session!.sub } });
  if (!user) throw new HttpError(404, 'User not found');
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(400, 'Current password is incorrect');
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.json({ ok: true });
});

// Addresses

const addressSchema = z.object({
  label: z.string().max(80).optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().max(120).optional().nullable(),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2).max(2).default('US'),
  phone: z.string().max(32).optional().nullable(),
  isDefault: z.boolean().optional(),
});

router.get('/addresses', requireAuth, async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.session!.sub },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ addresses });
});

router.post('/addresses', requireAuth, async (req, res) => {
  const data = addressSchema.parse(req.body);
  const { isDefault, ...rest } = data;
  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.session!.sub },
      data: { isDefault: false },
    });
  }
  const address = await prisma.address.create({
    data: {
      ...rest,
      label: rest.label ?? null,
      company: rest.company ?? null,
      line2: rest.line2 ?? null,
      phone: rest.phone ?? null,
      isDefault: isDefault ?? false,
      userId: req.session!.sub,
    },
  });
  res.json({ address });
});

router.put('/addresses/:id', requireAuth, async (req, res) => {
  const data = addressSchema.parse(req.body);
  const existing = await prisma.address.findFirst({
    where: { id: req.params.id, userId: req.session!.sub },
  });
  if (!existing) throw new HttpError(404, 'Address not found');
  if (data.isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.session!.sub },
      data: { isDefault: false },
    });
  }
  const { isDefault, ...rest } = data;
  const address = await prisma.address.update({
    where: { id: existing.id },
    data: {
      ...rest,
      label: rest.label ?? null,
      company: rest.company ?? null,
      line2: rest.line2 ?? null,
      phone: rest.phone ?? null,
      isDefault: isDefault ?? false,
    },
  });
  res.json({ address });
});

router.delete('/addresses/:id', requireAuth, async (req, res) => {
  const existing = await prisma.address.findFirst({
    where: { id: req.params.id, userId: req.session!.sub },
  });
  if (!existing) throw new HttpError(404, 'Address not found');
  await prisma.address.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
