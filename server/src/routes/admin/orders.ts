import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { refundPaypalCapture } from '../../lib/payments/paypal/index.js';
import { HttpError } from '../../middleware/error.js';
import {
  sendOrderConfirmationEmail,
  sendShippingNotificationEmail,
  sendOrderCancelledEmail,
} from '../../lib/order-emails.js';

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
      items: {
        include: {
          product: {
            select: {
              slug: true,
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
              options: { include: { values: true } },
            },
          },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order });
});

const updateSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  paymentStatus: z.enum(['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED']).optional(),
  trackingNumber: z.string().optional(),
  shippingMethod: z.string().optional(),
  notes: z.string().optional(),
});

router.patch('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const before = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'Order not found');

  const order = await prisma.order.update({ where: { id: req.params.id }, data });

  // Get admin actor info for event log.
  const actor = req.session?.sub
    ? await prisma.user.findUnique({
        where: { id: req.session.sub },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : null;
  const actorName = actor ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() || actor.email : undefined;

  // Log every changed field as its own event.
  if (data.status && data.status !== before.status) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'status',
        fromStatus: before.status,
        toStatus: data.status,
        message: `Status changed from ${before.status} to ${data.status}`,
        actorId: actor?.id,
        actorName,
      },
    });
  }
  if (data.paymentStatus && data.paymentStatus !== before.paymentStatus) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'payment',
        fromStatus: before.paymentStatus,
        toStatus: data.paymentStatus,
        message: `Payment status changed from ${before.paymentStatus} to ${data.paymentStatus}`,
        actorId: actor?.id,
        actorName,
      },
    });
  }
  if (data.trackingNumber !== undefined && data.trackingNumber !== before.trackingNumber) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'tracking',
        message: data.trackingNumber
          ? `Tracking number set: ${data.trackingNumber}`
          : 'Tracking number cleared',
        actorId: actor?.id,
        actorName,
      },
    });
  }
  if (data.notes !== undefined && data.notes !== before.notes) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'note',
        message: 'Internal notes updated',
        actorId: actor?.id,
        actorName,
      },
    });
  }

  // Fire transactional emails on key transitions.
  const statusChanged = data.status && data.status !== before.status;
  if (statusChanged) {
    if (data.status === 'PAID' && before.status !== 'PAID') {
      // Fire-and-forget confirmation email. The checkout flow may have already
      // sent one; admin marking an order paid manually triggers a fresh one.
      void sendOrderConfirmationEmail(order.id);
    }
    if (data.status === 'SHIPPED' && before.status !== 'SHIPPED') {
      void sendShippingNotificationEmail(order.id);
    }
    if (data.status === 'CANCELLED' && before.status !== 'CANCELLED') {
      void sendOrderCancelledEmail(order.id);
    }
  }

  res.json({ order });
});

// Add a free-form timeline note visible to the customer.
const eventSchema = z.object({
  message: z.string().min(1).max(2000),
  kind: z.enum(['note', 'status', 'payment', 'tracking', 'email']).optional(),
});
router.post('/:id/events', async (req, res) => {
  const data = eventSchema.parse(req.body);
  const actor = req.session?.sub
    ? await prisma.user.findUnique({
        where: { id: req.session.sub },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : null;
  const actorName = actor ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() || actor.email : undefined;

  const event = await prisma.orderStatusEvent.create({
    data: {
      orderId: req.params.id,
      kind: data.kind ?? 'note',
      message: data.message,
      actorId: actor?.id,
      actorName,
    },
  });
  res.json({ event });
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
  await prisma.orderStatusEvent.create({
    data: {
      orderId: req.params.id,
      kind: 'payment',
      message: `Refunded ${data.amountCents ? `$${(data.amountCents / 100).toFixed(2)}` : 'full amount'}${data.note ? ` — ${data.note}` : ''}`,
      actorId: req.session?.sub,
    },
  });
  res.json({ refund: result });
});

export default router;
