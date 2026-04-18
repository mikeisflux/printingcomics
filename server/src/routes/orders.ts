import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.session!.sub },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, number: true, status: true, paymentStatus: true,
      totalCents: true, createdAt: true,
    },
  });
  res.json({ orders });
});

router.get('/:number', requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { number: req.params.number, userId: req.session!.sub },
    include: { items: true, payments: true },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order });
});

export default router;
