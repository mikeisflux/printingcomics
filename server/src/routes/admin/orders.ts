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
import { dispatchPartnerWebhook } from '../../lib/partners.js';
import { proofToken, PRODUCTION_STATUSES, proofBlocksProduction } from '../../lib/proofs.js';
import { sendProofReadyEmail, sendMediaRequestEmail } from '../../lib/proof-emails.js';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const PROOF_DIR = path.join(UPLOADS_DIR, 'proofs');
await fs.mkdir(PROOF_DIR, { recursive: true }).catch(() => undefined);
const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, PROOF_DIR),
    filename: (_r, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

router.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const partnerFilter = req.query.partner as string | undefined;
  const where: any = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { externalRef: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (partnerFilter === 'any') where.partnerId = { not: null };
  else if (partnerFilter === 'none') where.partnerId = null;
  else if (partnerFilter) where.partnerId = partnerFilter;
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      items: true,
      _count: { select: { payments: true } },
      partner: { select: { id: true, slug: true, name: true, color: true } },
    },
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
          files: {
            include: {
              media: {
                select: {
                  id: true, originalName: true, mimeType: true, size: true,
                  url: true, contentHash: true, createdAt: true,
                },
              },
            },
          },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
      apiKey: { select: { id: true, name: true, prefix: true } },
      partner: { select: { id: true, slug: true, name: true, color: true, status: true } },
      project: { select: { id: true, externalProjectId: true, title: true, creatorName: true, creatorEmail: true, status: true } },
      proofs: {
        orderBy: { createdAt: 'desc' },
        include: { media: { select: { id: true, originalName: true, url: true, size: true, mimeType: true } } },
      },
      mediaRequests: { orderBy: { createdAt: 'desc' } },
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

  // Proof gate: block moving into production/shipping until the proof is approved.
  if (data.status && PRODUCTION_STATUSES.has(data.status) && proofBlocksProduction(before.proofStatus)) {
    throw new HttpError(
      400,
      `This order is awaiting proof approval — it can't move to ${data.status} until the customer approves the proof.`,
    );
  }

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

  // Forward order status transitions to the partner's webhook (if any).
  if (statusChanged && before.partnerId) {
    const eventName: string | null = (() => {
      switch (data.status) {
        case 'PAID': return 'order.paid';
        case 'IN_PRODUCTION': return 'order.in_production';
        case 'SHIPPED': return 'order.shipped';
        case 'DELIVERED': return 'order.delivered';
        case 'CANCELLED': return 'order.cancelled';
        case 'REFUNDED': return 'order.refunded';
        default: return null;
      }
    })();
    if (eventName) {
      void dispatchPartnerWebhook({
        partnerId: before.partnerId,
        event: eventName,
        orderId: order.id,
        payload: {
          id: order.id,
          number: order.number,
          status: order.status,
          paymentStatus: order.paymentStatus,
          trackingNumber: order.trackingNumber,
          shippingMethod: order.shippingMethod,
          totalCents: order.totalCents,
          externalRef: order.externalRef,
        },
      }).catch(() => undefined);
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

// ---- Proofing: upload a PDF proof for the customer to approve ----
router.post('/:id/proof', proofUpload.single('file'), async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (!order) throw new HttpError(404, 'Order not found');
  const f = req.file;
  if (!f) throw new HttpError(400, 'No proof file received');
  const rawMessage = req.body?.message;
  const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : undefined;

  const media = await prisma.mediaFile.create({
    data: {
      filename: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      url: `/uploads/proofs/${f.filename}`,
      folder: '/proofs',
      tags: ['proof', `order:${order.number}`],
      uploaderId: req.session?.sub,
    },
  });
  const version = (await prisma.proof.count({ where: { orderId: order.id } })) + 1;
  const proof = await prisma.proof.create({
    data: { orderId: order.id, mediaFileId: media.id, version, token: proofToken(), message, status: 'pending' },
  });
  await prisma.order.update({ where: { id: order.id }, data: { proofStatus: 'awaiting_approval' } });
  await prisma.orderStatusEvent.create({
    data: { orderId: order.id, kind: 'status', message: `Proof v${version} uploaded and emailed for approval` },
  });
  await sendProofReadyEmail(proof.id);

  if (order.partnerId) {
    void dispatchPartnerWebhook({
      partnerId: order.partnerId,
      event: 'proof.ready',
      orderId: order.id,
      payload: { orderId: order.id, number: order.number, proofVersion: version, status: 'awaiting_approval' },
    }).catch(() => undefined);
  }
  res.json({ ok: true, proof });
});

// ---- Proofing: request additional / corrected media from the customer ----
const requestMediaSchema = z.object({ message: z.string().min(1).max(2000) });
router.post('/:id/request-media', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw new HttpError(404, 'Order not found');
  const { message } = requestMediaSchema.parse(req.body);
  const mr = await prisma.mediaRequest.create({
    data: { orderId: order.id, message, token: proofToken(), status: 'open' },
  });
  await prisma.orderStatusEvent.create({
    data: { orderId: order.id, kind: 'status', message: 'Requested additional media from the customer' },
  });
  await sendMediaRequestEmail(mr.id);
  res.json({ ok: true, mediaRequest: mr });
});

export default router;
