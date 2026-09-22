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
import { publishUpload } from '../../lib/storage.js';
import { proofToken, PRODUCTION_STATUSES, proofBlocksProduction, purgeOrderArtwork, proofReviewUrl, proofSlotLabel, computeOrderProofStatus, itemTitle, PROOF_PRODUCT_SLUG } from '../../lib/proofs.js';
import { sendProofReadyEmail, sendProofsReadyEmail, sendMediaRequestEmail } from '../../lib/proof-emails.js';
import { requestReviewForOrder } from '../../lib/reviews.js';
import { previewAdjustment, createAdjustment, cancelAdjustment, adjustmentPayUrl, optionKey } from '../../lib/order-adjustments.js';
import { backfillOrderUploads } from '../../lib/order-files.js';
import { sendAdjustmentRequestEmail } from '../../lib/order-emails.js';
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

  // "Abandoned" = a storefront checkout that was created but never paid (a
  // PayPal order was minted, the buyer never completed on PayPal). These are
  // hidden by default so the list shows only real, committed orders. They stay
  // reachable via the "Abandoned (unpaid)" status filter.
  const ABANDONED = { status: 'PENDING', paymentStatus: 'PENDING', partnerId: null, apiKeyId: null };
  if (status === 'ABANDONED') {
    Object.assign(where, ABANDONED);
  } else if (status) {
    where.status = status;
  } else {
    where.NOT = ABANDONED;
  }

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
  // Orders placed after uploads moved to R2 never got their file links
  // (see lib/order-files.ts). Repair on view so staff always see the files.
  await backfillOrderUploads(req.params.id).catch((e: any) =>
    console.warn('[admin-orders] upload backfill failed:', e?.message ?? e),
  );
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
        include: {
          media: { select: { id: true, originalName: true, url: true, size: true, mimeType: true } },
          orderItem: { select: { id: true, name: true, options: true } },
        },
      },
      mediaRequests: { orderBy: { createdAt: 'desc' } },
      adjustments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order });
});

// ---- Post-order item changes + "pay the difference" requests ----
const optionValue = z.union([z.string(), z.number(), z.boolean()]);
const changesSchema = z.array(z.object({
  orderItemId: z.string().min(1),
  options: z.record(z.string(), optionValue),
})).min(1);

router.post('/:id/adjustments/preview', async (req, res) => {
  const { changes } = z.object({ changes: changesSchema }).parse(req.body);
  res.json({ preview: await previewAdjustment(req.params.id, changes) });
});

router.post('/:id/adjustments', async (req, res) => {
  const { changes, note, send } = z.object({
    changes: changesSchema,
    note: z.string().max(1000).optional(),
    send: z.boolean().optional().default(true),
  }).parse(req.body);
  const actor = req.session as { sub?: string; name?: string; email?: string } | undefined;
  const result = await createAdjustment({
    orderId: req.params.id,
    changes,
    note,
    actorId: actor?.sub,
    actorName: actor?.name ?? actor?.email,
  });
  if (!result.applied && send && result.adjustment) void sendAdjustmentRequestEmail(result.adjustment.id);
  res.json(result);
});

router.post('/:id/adjustments/:adjId/resend', async (req, res) => {
  const adj = await prisma.orderAdjustment.findFirst({ where: { id: req.params.adjId, orderId: req.params.id } });
  if (!adj) throw new HttpError(404, 'Adjustment not found');
  if (adj.status !== 'pending') throw new HttpError(409, 'Only a pending payment request can be re-sent.');
  await sendAdjustmentRequestEmail(adj.id);
  res.json({ ok: true, payUrl: await adjustmentPayUrl(adj.token) });
});

router.post('/:id/adjustments/:adjId/cancel', async (req, res) => {
  await cancelAdjustment(req.params.id, req.params.adjId, req.session?.sub);
  res.json({ ok: true });
});

// ---- Rename: change a free-text option (the "Title of Comic") on one line ----
// Text fields never affect price, so there is nothing to reprice or bill —
// they are edited in place. Priced selections go through the adjustment flow
// above. Titles must be unique within the order: they are how staff, the
// proof queue and the customer's proof emails tell twelve identical
// "Comic Book — Standard" lines apart.
const textSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(200),
});

router.patch('/:id/items/:itemId/text', async (req, res) => {
  const { key, value } = textSchema.parse(req.body);
  const orderId = String(req.params.id);
  const item = await prisma.orderItem.findFirst({
    where: { id: String(req.params.itemId), orderId },
    include: { product: { select: { options: { select: { name: true, internalKey: true, type: true, required: true } } } } },
  });
  if (!item) throw new HttpError(404, 'Order item not found');

  const opt = item.product.options.find((o) => optionKey(o) === key);
  if (!opt) throw new HttpError(400, 'That option does not exist on this product.');
  if (opt.type !== 'TEXT') throw new HttpError(400, `${opt.name} affects the price — change it with "Edit options" so the difference can be billed.`);

  const next = value.trim();
  if (!next && opt.required) throw new HttpError(400, `${opt.name} cannot be blank.`);

  if (key === 'title' && next) {
    const siblings = await prisma.orderItem.findMany({
      where: { orderId, id: { not: item.id }, product: { slug: { not: PROOF_PRODUCT_SLUG } } },
      select: { name: true, options: true },
    });
    const clash = siblings.find((s) => itemTitle(s).toLowerCase() === next.toLowerCase());
    if (clash) throw new HttpError(409, `Another item on this order is already titled “${next}”. Each book needs its own title — add the issue, volume or cover to tell them apart.`);
  }

  const before = (item.options && typeof item.options === 'object' && !Array.isArray(item.options))
    ? { ...(item.options as Record<string, unknown>) }
    : {};
  const previous = typeof before[key] === 'string' ? (before[key] as string).trim() : '';
  if (previous === next) { res.json({ item: { id: item.id, options: before } }); return; }

  const after = { ...before };
  if (next) after[key] = next; else delete after[key];

  const actor = req.session as { sub?: string; name?: string; email?: string } | undefined;
  const [updated] = await prisma.$transaction([
    prisma.orderItem.update({ where: { id: item.id }, data: { options: after as object }, select: { id: true, options: true } }),
    prisma.orderStatusEvent.create({
      data: {
        orderId,
        kind: 'note',
        message: `${opt.name} changed ${previous ? `from “${previous}” ` : ''}to “${next || '(blank)'}” — ${item.name} × ${item.quantity}`,
        actorId: actor?.sub,
        actorName: actor?.name ?? actor?.email,
      },
    }),
  ]);
  res.json({ item: updated });
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
      // Fulfilled — purge the proofs and the creator's uploaded print files.
      void purgeOrderArtwork(order.id).catch(() => undefined);
    }
    if (data.status === 'CANCELLED' && before.status !== 'CANCELLED') {
      void sendOrderCancelledEmail(order.id);
    }
    if (data.status === 'DELIVERED' && before.status !== 'DELIVERED') {
      // Ask for a review. Idempotent per order and never throws, so it can't
      // interfere with the status change itself.
      void requestReviewForOrder(order.id);
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
  // null arrives when the admin UI's prompt parses to NaN and JSON turns it
  // into null — treat that as "full refund", not a validation failure.
  amountCents: z.number().int().min(1).optional().nullable().transform((v) => v ?? undefined),
  note: z.string().max(255).optional().nullable().transform((v) => v || undefined),
});

router.post('/:id/refund', async (req, res) => {
  const data = refundSchema.parse(req.body);
  const payment = await prisma.payment.findFirst({
    where: { orderId: req.params.id, provider: 'paypal', status: 'CAPTURED' },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) {
    // Say which state it's actually in — "no captured payment" on its own
    // sent people to the logs.
    const latest = await prisma.payment.findFirst({ where: { orderId: req.params.id }, orderBy: { createdAt: 'desc' } });
    throw new HttpError(
      409,
      latest
        ? `This order's latest payment is ${latest.status} (${latest.provider}) — only a CAPTURED PayPal payment can be refunded.`
        : 'This order has no payment on record to refund.',
    );
  }
  const result = await refundPaypalCapture({
    paymentId: payment.id,
    amountCents: data.amountCents,
    note: data.note,
  });
  await prisma.orderStatusEvent.create({
    data: {
      orderId: req.params.id,
      kind: 'payment',
      message: `Refunded $${(result.refundedCents / 100).toFixed(2)} via PayPal (${result.refundId}, ${result.status})${data.note ? ` — ${data.note}` : ''}`,
      actorId: req.session?.sub,
    },
  });
  res.json({ refund: result });
});

// ---- Delete an order (for clearing abandoned/unpaid checkouts) ----
router.delete('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { payments: { select: { status: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  // Guard: never silently delete a real, paid order — those are financial
  // records. Use cancel/refund instead.
  const everPaid = order.paymentStatus === 'CAPTURED' || order.payments.some((p) => p.status === 'CAPTURED');
  if (everPaid) {
    throw new HttpError(409, 'This order has a captured payment — cancel or refund it instead of deleting.');
  }

  // Remove the creator's uploaded files + any proofs from disk, then delete the
  // order. Payments, items, events, shipments, proofs and media requests all
  // cascade away with the order row.
  await purgeOrderArtwork(order.id);
  await prisma.order.delete({ where: { id: order.id } });
  res.json({ ok: true });
});

// ---- Proofing: upload a PDF proof for the customer to approve ----
// Proofs are per line item + kind ("cover"/"interior" for books, "artwork"
// for prints). orderItemId/kind in the form data pick the slot; omitting both
// creates a legacy order-level proof. Each slot versions independently.
router.post('/:id/proof', proofUpload.single('file'), async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (!order) throw new HttpError(404, 'Order not found');
  const f = req.file;
  if (!f) throw new HttpError(400, 'No proof file received');
  const rawMessage = req.body?.message;
  const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : undefined;

  const rawItemId = req.body?.orderItemId;
  const orderItemId = typeof rawItemId === 'string' && rawItemId.trim() ? rawItemId.trim() : null;
  const rawKind = req.body?.kind;
  const kind = typeof rawKind === 'string' && rawKind.trim() ? rawKind.trim() : null;
  if (kind && !['cover', 'interior', 'artwork'].includes(kind)) {
    throw new HttpError(400, 'kind must be "cover", "interior" or "artwork"');
  }
  let itemName: string | null = null;
  let slotLabel = proofSlotLabel(kind, null);
  if (orderItemId) {
    const item = await prisma.orderItem.findFirst({ where: { id: orderItemId, orderId: order.id }, select: { name: true, options: true } });
    if (!item) throw new HttpError(400, 'orderItemId does not belong to this order');
    itemName = item.name;
    slotLabel = proofSlotLabel(kind, item);
  }

  const stored = await publishUpload({
    subdir: 'proofs', filename: f.filename, localPath: f.path,
    contentType: f.mimetype, originalName: f.originalname,
  });
  const media = await prisma.mediaFile.create({
    data: {
      filename: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      url: stored.url,
      folder: '/proofs',
      tags: ['proof', `order:${order.number}`],
      uploaderId: req.session?.sub,
    },
  });
  // Version within this slot — each item×kind re-proofs independently.
  const version = (await prisma.proof.count({ where: { orderId: order.id, orderItemId, kind } })) + 1;
  const proof = await prisma.proof.create({
    data: { orderId: order.id, orderItemId, kind, mediaFileId: media.id, version, token: proofToken(), message, status: 'pending' },
  });
  const orderProofStatus = await computeOrderProofStatus(order.id);
  await prisma.orderStatusEvent.create({
    data: { orderId: order.id, kind: 'status', message: `${slotLabel} v${version} uploaded and emailed for approval` },
  });
  const email = await sendProofReadyEmail(proof.id);

  if (order.partnerId) {
    const reviewUrl = await proofReviewUrl(proof.token);
    void dispatchPartnerWebhook({
      partnerId: order.partnerId,
      event: 'proof.ready',
      orderId: order.id,
      // token + reviewUrl let the partner surface the approval on their own
      // site. Only whoever holds this token (the creator) can approve.
      payload: {
        orderId: order.id,
        number: order.number,
        orderItemId,
        itemName,
        kind,
        proofVersion: version,
        status: 'awaiting_approval',
        orderProofStatus,
        token: proof.token,
        reviewUrl,
        fileUrl: media.url,
      },
    }).catch(() => undefined);
  }
  res.json({ ok: true, proof, email });
});

// ---- Proofing: batch upload — one file per slot, ONE email to the customer ----
// Multipart: `files` (repeated) + `assignments` (JSON array aligned by index:
// [{ orderItemId, kind }]) + optional shared `message`. Creates every proof,
// recomputes the aggregate once, and emails a single summary with all review
// links, so multi-item orders don't spam the customer proof-by-proof.
router.post('/:id/proofs/batch', proofUpload.array('files', 20), async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (!order) throw new HttpError(404, 'Order not found');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new HttpError(400, 'No proof files received');

  let assignments: Array<{ orderItemId?: string | null; kind?: string | null }>;
  try {
    assignments = JSON.parse(String(req.body?.assignments ?? '[]'));
  } catch {
    throw new HttpError(400, 'assignments must be a JSON array');
  }
  if (!Array.isArray(assignments) || assignments.length !== files.length) {
    throw new HttpError(400, 'assignments must have one entry per file');
  }
  const rawMessage = req.body?.message;
  const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : undefined;

  const items = await prisma.orderItem.findMany({ where: { orderId: order.id }, select: { id: true, name: true, options: true } });
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const a of assignments) {
    if (a.kind && !['cover', 'interior', 'artwork'].includes(a.kind)) {
      throw new HttpError(400, 'kind must be "cover", "interior" or "artwork"');
    }
    if (a.orderItemId && !itemName.has(a.orderItemId)) {
      throw new HttpError(400, 'orderItemId does not belong to this order');
    }
  }

  const created: Array<{ id: string; token: string; version: number; orderItemId: string | null; kind: string | null; fileUrl: string }> = [];
  const summaries: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const orderItemId = assignments[i]!.orderItemId ?? null;
    const kind = assignments[i]!.kind ?? null;
    const stored = await publishUpload({
      subdir: 'proofs', filename: f.filename, localPath: f.path,
      contentType: f.mimetype, originalName: f.originalname,
    });
    const media = await prisma.mediaFile.create({
      data: {
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url: stored.url,
        folder: '/proofs',
        tags: ['proof', `order:${order.number}`],
        uploaderId: req.session?.sub,
      },
    });
    const version = (await prisma.proof.count({ where: { orderId: order.id, orderItemId, kind } })) + 1;
    const proof = await prisma.proof.create({
      data: { orderId: order.id, orderItemId, kind, mediaFileId: media.id, version, token: proofToken(), message, status: 'pending' },
    });
    created.push({ id: proof.id, token: proof.token, version, orderItemId, kind, fileUrl: media.url });
    summaries.push(`${proofSlotLabel(kind, orderItemId ? itemById.get(orderItemId) : null)} v${version}`);
  }

  const orderProofStatus = await computeOrderProofStatus(order.id);
  await prisma.orderStatusEvent.create({
    data: { orderId: order.id, kind: 'status', message: `${created.length} proof(s) uploaded and emailed for approval: ${summaries.join('; ')}` },
  });
  const email = await sendProofsReadyEmail(created.map((c) => c.id));

  if (order.partnerId) {
    for (const c of created) {
      const reviewUrl = await proofReviewUrl(c.token);
      void dispatchPartnerWebhook({
        partnerId: order.partnerId,
        event: 'proof.ready',
        orderId: order.id,
        payload: {
          orderId: order.id,
          number: order.number,
          orderItemId: c.orderItemId,
          itemName: c.orderItemId ? itemName.get(c.orderItemId) ?? null : null,
          kind: c.kind,
          proofVersion: c.version,
          status: 'awaiting_approval',
          orderProofStatus,
          token: c.token,
          reviewUrl,
          fileUrl: c.fileUrl,
        },
      }).catch(() => undefined);
    }
  }
  res.json({ ok: true, count: created.length, orderProofStatus, email });
});

// ---- Proofing: delete a proof uploaded in error ----
// Removes the Proof row + its PDF from disk, kills the customer's review link,
// and recomputes the order's aggregate proof status.
router.delete('/:id/proof/:proofId', async (req, res) => {
  const orderId = String(req.params.id);
  const proof = await prisma.proof.findFirst({
    where: { id: String(req.params.proofId), orderId },
    include: { media: true, orderItem: { select: { name: true, options: true } } },
  });
  if (!proof) throw new HttpError(404, 'Proof not found');
  const slotLabel = proofSlotLabel(proof.kind, proof.orderItem);

  await prisma.proof.delete({ where: { id: proof.id } });
  if (proof.media?.url?.startsWith('/uploads/')) {
    await fs.unlink(path.join(UPLOADS_DIR, proof.media.url.replace(/^\/uploads\//, ''))).catch(() => undefined);
  }
  await prisma.mediaFile.delete({ where: { id: proof.mediaFileId } }).catch(() => undefined);
  const orderProofStatus = await computeOrderProofStatus(orderId);
  await prisma.orderStatusEvent.create({
    data: { orderId, kind: 'status', message: `Deleted ${slotLabel} v${proof.version} (file: ${proof.media?.originalName ?? 'unknown'})` },
  });
  res.json({ ok: true, orderProofStatus });
});

// ---- Proofing: re-send the current proof emails to the customer ----
// Same tokens, same review links — this just puts a fresh, working email in
// their inbox. Useful when the original never arrived, was deleted, or (as
// happened here) went out while click-tracking was rewriting the links.
router.post('/:id/proofs/resend', async (req, res) => {
  const orderId = String(req.params.id);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, email: true } });
  if (!order) throw new HttpError(404, 'Order not found');

  const proofs = await prisma.proof.findMany({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, orderItemId: true, kind: true, version: true, status: true },
  });
  if (proofs.length === 0) throw new HttpError(400, 'No proofs have been uploaded for this order yet.');

  // Latest version per slot — never re-send a superseded proof.
  const latestBySlot = new Map<string, (typeof proofs)[number]>();
  for (const p of proofs) latestBySlot.set(`${p.orderItemId ?? 'order'}:${p.kind ?? 'artwork'}`, p);

  // Only what still needs a decision; an approved slot doesn't need chasing.
  const outstanding = [...latestBySlot.values()].filter((p) => p.status !== 'approved');
  if (outstanding.length === 0) {
    throw new HttpError(400, 'Every proof on this order is already approved — nothing to re-send.');
  }

  const email = await sendProofsReadyEmail(outstanding.map((p) => p.id));
  await prisma.orderStatusEvent.create({
    data: {
      orderId,
      kind: 'email',
      message: email.sent
        ? `Re-sent ${outstanding.length} proof link(s) to ${email.to ?? order.email}`
        : `Failed to re-send proof links: ${email.error ?? 'unknown error'}`,
    },
  });
  if (!email.sent) throw new HttpError(502, `Could not send the email: ${email.error ?? 'unknown error'}`);
  res.json({ ok: true, count: outstanding.length, to: email.to ?? order.email });
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
