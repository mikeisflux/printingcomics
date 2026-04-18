import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  const orders = await prisma.order.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { items: true },
  });
  res.json({ orders });
});

router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true, payments: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });
  res.json({ order });
});

const updateSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  paymentStatus: z.enum(['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED']).optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
});

router.patch('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const order = await prisma.order.update({ where: { id: req.params.id }, data });
  res.json({ order });
});

export default router;
