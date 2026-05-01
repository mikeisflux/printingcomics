import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hashPassword } from '../../lib/password.js';

const router = Router();

router.get('/', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const partnerFilter = req.query.partner as string | undefined;
  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (partnerFilter === 'any') {
    where.partnerId = { not: null };
  } else if (partnerFilter === 'none') {
    where.partnerId = null;
  } else if (partnerFilter) {
    where.partnerId = partnerFilter;
  }
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, createdAt: true,
      partner: { select: { id: true, slug: true, name: true, color: true } },
      _count: { select: { orders: true } },
    },
  });
  res.json({ users });
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true,
      addresses: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, totalCents: true, createdAt: true },
      },
      partner: { select: { id: true, slug: true, name: true, status: true, color: true } },
    },
  });
  res.json({ user });
});

const updateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
  newPassword: z.string().min(8).optional(),
});

router.patch('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const { newPassword, ...rest } = data;
  const updateData: any = { ...rest };
  if (newPassword) updateData.passwordHash = await hashPassword(newPassword);
  const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData });
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

export default router;
