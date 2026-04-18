import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { refundPaypalCapture } from '../../lib/payments/paypal/index.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

router.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const where: any = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { items: true, _count: { select: { payments: true } } },
  });
  res.json({ orders });
});

router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: true,
      payments: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
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

// Refund the full or partial capture amount via PayPal.
const refundSchema = z.object({
  amountCents: z.number().int().min(1).optional(),
  note: z.string().max(255).optional(),
});

router.post('/:id/refund', async (req, res) => {
  const data = refundSchema.parse(req.body);
  const payment = await prisma.payment.findFirst({
    where: { orderId: req.params.id, provider: 'paypal', status: 'CAPTURED' },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment?.providerRef) throw new HttpError(400, 'No captured PayPal payment to refund.');
  const result = await refundPaypalCapture({
    captureId: payment.providerRef,
    amountCents: data.amountCents,
    note: data.note,
  });
  res.json({ refund: result });
});

export default router;
