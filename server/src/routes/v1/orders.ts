/**
 * /api/v1/orders — let integrators (crowdfunding platforms, etc.) submit
 * print orders without going through the storefront cart/checkout.
 *
 * Idempotency: a (apiKeyId, externalRef) tuple is unique. Re-POSTing the
 * same externalRef returns the existing order instead of creating a duplicate.
 *
 * Payment: orders default to PENDING/PENDING — the integrator is invoiced
 * (or settles out-of-band). Pass `markAsPaid: true` to flag the order as
 * paid on creation. Either way, no PayPal interaction happens.
 */
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { requireApiKey } from '../../middleware/api-key.js';
import { computePricing, canonicalizeOptionValues, type PricingConfig } from '../../lib/pricing.js';
import { priceForQuantity, type VolumeTier } from '../../lib/money.js';
import { getSetting } from '../../lib/settings.js';
import { evaluateCoupon, incrementCouponUsage } from '../../lib/coupons.js';
import { HARD_COPY_PROOF_FEE_CENTS, isProofRequested, getOrCreateProofProduct, itemsRequestProof } from '../../lib/proofs.js';
import { dispatchPartnerWebhook } from '../../lib/partners.js';
import { createPaypalApprovalForOrder } from '../../lib/payments/paypal/approval-for-order.js';

const router = Router();

const addressSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().default('US'),
  phone: z.string().optional(),
});

const itemFileSchema = z.object({
  // The MediaFile id returned by POST /api/v1/uploads.
  uploadId: z.string().min(1),
  // Optional override of the purpose tag set at upload time.
  purpose: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
});

const itemSchema = z.object({
  productSlug: z.string().optional(),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(100_000),
  options: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  // Print files for this line item — covers, interiors, etc. Each entry
  // references an upload previously POSTed to /api/v1/uploads.
  files: z.array(itemFileSchema).max(20).optional(),
});

// A project the partner has on their platform. Either pass `id` (one we
// previously returned) or `externalProjectId` (theirs) — we upsert by the
// latter under the calling partner.
const projectRefSchema = z
  .object({
    id: z.string().min(1).optional(),
    externalProjectId: z.string().min(1).max(120).optional(),
    title: z.string().max(200).optional(),
    url: z.string().url().optional(),
    creatorName: z.string().max(120).optional(),
    creatorEmail: z.string().email().optional(),
  })
  .refine((p) => p.id || p.externalProjectId, {
    message: 'project requires id or externalProjectId',
  });

const createSchema = z.object({
  externalRef: z.string().min(1).max(120).optional(),
  email: z.string().email(),
  customerName: z.string().optional(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  items: z.array(itemSchema).min(1),
  shippingRateId: z.string().optional(),
  couponCode: z.string().optional(),
  notes: z.string().max(2000).optional(),
  markAsPaid: z.boolean().optional().default(false),
  // The campaign this print run is for. Optional for backwards-compat with
  // standalone keys, but partner-attached keys are strongly encouraged to
  // include it so the order rolls up under the right creator's project.
  project: projectRefSchema.optional(),
  // Free-form shorthand: { project: { externalProjectId: 'kickstarter-…' } }.
  // Or even simpler — just `projectId` as a string, treated as externalProjectId.
  projectId: z.string().min(1).max(120).optional(),
  // When true (default) and the order is unpaid, auto-create a PayPal
  // approval link in the response so the partner can hand it to the creator.
  // Set false if you'd rather call POST /orders/:id/payment-link explicitly.
  generatePaymentLink: z.boolean().optional().default(true),
});

router.post('/', requireApiKey('orders:write'), async (req, res) => {
  const data = createSchema.parse(req.body);
  const apiKeyId = req.apiKey!.id;
  const partnerId = req.apiKey!.partnerId ?? null;

  // ---- Resolve / upsert the project (if any) -------------------------------
  // Three input shapes are accepted:
  //   project: { id }                                — direct lookup
  //   project: { externalProjectId, title?, ... }    — upsert under partner
  //   projectId: 'kickstarter-…'                     — shorthand for externalProjectId
  let projectId: string | null = null;
  const projectInput = data.project ?? (data.projectId ? { externalProjectId: data.projectId } : null);
  if (projectInput) {
    if (!partnerId) {
      throw new HttpError(
        400,
        'A project can only be associated with orders submitted by a partner-attached key.',
      );
    }
    if (projectInput.id) {
      const existing = await prisma.partnerProject.findFirst({
        where: { id: projectInput.id, partnerId },
      });
      if (!existing) throw new HttpError(404, `Project ${projectInput.id} not found for this partner`);
      projectId = existing.id;
    } else if (projectInput.externalProjectId) {
      const upserted = await prisma.partnerProject.upsert({
        where: {
          partnerId_externalProjectId: {
            partnerId,
            externalProjectId: projectInput.externalProjectId,
          },
        },
        create: {
          partnerId,
          externalProjectId: projectInput.externalProjectId,
          title: projectInput.title ?? projectInput.externalProjectId,
          url: projectInput.url,
          creatorName: projectInput.creatorName,
          creatorEmail: projectInput.creatorEmail?.toLowerCase(),
        },
        update: {
          // Only fill in fields the partner sent — never blank existing data.
          title: projectInput.title ?? undefined,
          url: projectInput.url ?? undefined,
          creatorName: projectInput.creatorName ?? undefined,
          creatorEmail: projectInput.creatorEmail?.toLowerCase() ?? undefined,
        },
      });
      projectId = upserted.id;
    }
  }

  // Idempotency check — same (apiKey, externalRef) returns the prior order.
  if (data.externalRef) {
    const existing = await prisma.order.findFirst({
      where: { apiKeyId, externalRef: data.externalRef },
      include: { items: { include: { files: { include: { media: true } } } } },
    });
    if (existing) {
      return res.status(200).json({ order: serializeOrder(existing), idempotent: true });
    }
  }

  // ---- Resolve every line item, compute prices ----
  const resolved: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    quantity: number;
    options: Record<string, string | number>;
    unitPriceCents: number;
    files: { mediaFileId: string; purpose: string | null; notes: string | null }[];
  }> = [];

  let subtotal = 0;

  for (const line of data.items) {
    if (!line.productSlug && !line.productId) {
      throw new HttpError(400, 'Each line must specify productSlug or productId');
    }
    const product = await prisma.product.findUnique({
      where: line.productSlug ? { slug: line.productSlug } : { id: line.productId! },
      include: { variants: true },
    });
    if (!product || !product.active) {
      throw new HttpError(404, `Product not found: ${line.productSlug ?? line.productId}`);
    }
    if (line.quantity < product.minQuantity) {
      throw new HttpError(400, `Minimum quantity for ${product.slug} is ${product.minQuantity}`);
    }

    let unitPriceCents = product.priceCents;
    let variant: any = null;
    if (line.variantId) {
      variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant || !variant.active) throw new HttpError(400, `Invalid variant for ${product.slug}`);
      unitPriceCents = variant.priceCents;
    }

    const cfg = product.pricingConfig as PricingConfig | null;
    const optionInputs: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(line.options ?? {})) {
      if (typeof v === 'number') {
        optionInputs[k] = v;
      } else {
        const trimmed = v.trim();
        const isInt = /^-?\d+$/.test(trimmed);
        optionInputs[k] = isInt ? Number(trimmed) : v;
      }
    }
    // Resolve loose size labels (e.g. "11x17" → "11×17") to canonical modifier
    // keys before pricing AND before we persist them — the stored option value
    // is what fulfillment reads for the per-size shipping weight.
    if (cfg && typeof cfg === 'object' && Array.isArray(cfg.modifiers)) {
      Object.assign(optionInputs, canonicalizeOptionValues(cfg, optionInputs));
    }
    if (cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers)) {
      const siteDiscountBps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;
      unitPriceCents = computePricing(cfg, { quantity: line.quantity, options: optionInputs, siteDiscountBps }).unitCents;
    } else {
      unitPriceCents = priceForQuantity(unitPriceCents, line.quantity, product.volumeTiers as VolumeTier[] | null);
    }

    // Validate referenced uploads belong to the calling key (or its partner)
    // and exist. Reject early so we don't half-create an order.
    const lineFiles: { mediaFileId: string; purpose: string | null; notes: string | null }[] = [];
    if (line.files && line.files.length) {
      for (const f of line.files) {
        const media = await prisma.mediaFile.findUnique({ where: { id: f.uploadId } });
        if (!media) {
          throw new HttpError(400, `Upload not found: ${f.uploadId}`);
        }
        const ownsByKey = media.apiKeyId === apiKeyId;
        const ownsByPartner = !!req.apiKey!.partnerId && media.partnerId === req.apiKey!.partnerId;
        if (!ownsByKey && !ownsByPartner) {
          throw new HttpError(403, `Upload ${f.uploadId} does not belong to this partner / key`);
        }
        const tagPurpose = (media.tags ?? []).find((t) => t.startsWith('purpose:'));
        const tagNote = (media.tags ?? []).find((t) => t.startsWith('note:'));
        lineFiles.push({
          mediaFileId: media.id,
          purpose: f.purpose ?? (tagPurpose ? tagPurpose.slice('purpose:'.length) : null),
          notes: f.notes ?? (tagNote ? tagNote.slice('note:'.length) : null),
        });
      }
    }

    subtotal += unitPriceCents * line.quantity;
    resolved.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name + (variant ? ` — ${variant.label}` : ''),
      quantity: line.quantity,
      options: optionInputs,
      unitPriceCents,
      files: lineFiles,
    });

    // Hard-copy proof: one printed copy of this book (single-copy price) + fee.
    if (isProofRequested(line.options?.['hard_copy_proof'])) {
      let singleCopy: number;
      if (cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers)) {
        const siteDiscountBps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;
        singleCopy = computePricing(cfg, { quantity: 1, options: optionInputs, siteDiscountBps }).unitCents;
      } else {
        const base = variant?.priceCents ?? product.priceCents;
        singleCopy = priceForQuantity(base, 1, product.volumeTiers as VolumeTier[] | null);
      }
      const proofProduct = await getOrCreateProofProduct();
      const proofUnit = singleCopy + HARD_COPY_PROOF_FEE_CENTS;
      subtotal += proofUnit;
      resolved.push({
        productId: proofProduct.id,
        variantId: null,
        name: `Hard-Copy Proof — ${product.name}`,
        quantity: 1,
        options: { proof_kind: 'hard-copy', book: product.name },
        unitPriceCents: proofUnit,
        files: [],
      });
    }
  }

  // ---- Coupon ---- (stacks on top of the site-wide discount)
  const couponEval = await evaluateCoupon(data.couponCode, subtotal);
  const discount = couponEval.discountCents;

  // ---- Shipping ----
  let shippingCents = 0;
  let shippingMethodName: string | undefined;
  if (data.shippingRateId) {
    const rate = await prisma.shippingRate.findUnique({ where: { id: data.shippingRateId } });
    if (!rate) throw new HttpError(400, 'Invalid shippingRateId');
    shippingCents = rate.rateCents;
    shippingMethodName = rate.name;
  }

  // ---- Tax ----
  let taxCents = 0;
  const taxRate = await prisma.taxRate.findFirst({
    where: {
      region: data.shippingAddress.region,
      country: data.shippingAddress.country ?? 'US',
    },
  });
  if (taxRate) {
    taxCents = Math.floor(((subtotal - discount) * taxRate.rateBps) / 10_000);
  }

  const totalCents = subtotal - discount + shippingCents + taxCents;

  // ---- Persist ----
  const number = `PCAPI-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`;

  const order = await prisma.order.create({
    data: {
      number,
      email: data.email.toLowerCase(),
      status: 'PENDING',
      paymentStatus: data.markAsPaid ? 'CAPTURED' : 'PENDING',
      subtotalCents: subtotal,
      discountCents: discount,
      taxCents,
      shippingCents,
      totalCents,
      shippingAddress: data.shippingAddress as any,
      billingAddress: (data.billingAddress ?? data.shippingAddress) as any,
      shippingMethod: shippingMethodName,
      notes: data.notes,
      source: 'api',
      apiKeyId,
      partnerId,
      projectId,
      externalRef: data.externalRef ?? null,
      proofStatus: itemsRequestProof(data.items) ? 'requested' : null,
      items: {
        create: resolved.map((r) => ({
          productId: r.productId,
          variantId: r.variantId ?? undefined,
          name: r.name,
          options: r.options as any,
          quantity: r.quantity,
          unitPriceCents: r.unitPriceCents,
          totalCents: r.unitPriceCents * r.quantity,
          files: r.files.length
            ? {
                create: r.files.map((f) => ({
                  mediaFileId: f.mediaFileId,
                  purpose: f.purpose ?? undefined,
                  notes: f.notes ?? undefined,
                })),
              }
            : undefined,
        })),
      },
      events: {
        create: {
          kind: 'status',
          message: `Order created via API by integration "${req.apiKey!.name}"${
            data.externalRef ? ` (externalRef ${data.externalRef})` : ''
          }`,
          toStatus: 'PENDING',
          actorName: `api:${req.apiKey!.prefix}`,
        },
      },
    },
    include: { items: { include: { files: { include: { media: true } } } } },
  });

  if (couponEval.ok && couponEval.coupon) await incrementCouponUsage(couponEval.coupon.id);

  if (data.markAsPaid) {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'api',
        providerRef: data.externalRef ?? null,
        amountCents: totalCents,
        status: 'CAPTURED',
      },
    });
  }

  // ---- PayPal approval link (default: auto-mint when not pre-paid) ----
  let paymentLink:
    | { provider: 'paypal'; approvalUrl: string; expiresAt: string; amountCents: number }
    | null = null;
  if (!data.markAsPaid && data.generatePaymentLink !== false && totalCents > 0) {
    try {
      const r = await createPaypalApprovalForOrder({
        orderId: order.id,
        description: `Printing Comics order ${order.number}`,
      });
      paymentLink = {
        provider: 'paypal',
        approvalUrl: r.approveUrl,
        expiresAt: r.expiresAt.toISOString(),
        amountCents: r.amountCents,
      };
      await prisma.orderStatusEvent.create({
        data: {
          orderId: order.id,
          kind: 'payment',
          message: `Payment approval link generated for partner`,
          actorName: `api:${req.apiKey!.prefix}`,
        },
      });
    } catch (e: any) {
      // Failing to mint a PayPal link doesn't kill the order — partner can
      // retry via POST /orders/:id/payment-link or pay out-of-band.
      await prisma.orderStatusEvent.create({
        data: {
          orderId: order.id,
          kind: 'payment',
          message: `Payment link generation failed: ${e?.message ?? 'unknown'}`,
          actorName: `api:${req.apiKey!.prefix}`,
        },
      });
    }
  }

  // Fire-and-forget webhook delivery to the partner. Failures are persisted
  // to PartnerWebhookDelivery so the admin can replay them — they do not
  // fail the order creation.
  if (partnerId) {
    void dispatchPartnerWebhook({
      partnerId,
      event: 'order.created',
      orderId: order.id,
      payload: serializeOrder(order),
    }).catch(() => undefined);
    if (data.markAsPaid) {
      void dispatchPartnerWebhook({
        partnerId,
        event: 'order.paid',
        orderId: order.id,
        payload: serializeOrder(order),
      }).catch(() => undefined);
    } else if (paymentLink) {
      void dispatchPartnerWebhook({
        partnerId,
        event: 'order.payment_link_created',
        orderId: order.id,
        payload: { ...serializeOrder(order), paymentLink },
      }).catch(() => undefined);
    }
  }

  res.status(201).json({
    order: serializeOrder(order),
    payment: paymentLink ?? (data.markAsPaid ? { provider: 'manual', status: 'paid' } : null),
    idempotent: false,
  });
});

// ---- Read ----

router.get('/', requireApiKey('orders:read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const orders = await prisma.order.findMany({
    where: { apiKeyId: req.apiKey!.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { items: { include: { files: { include: { media: true } } } } },
  });
  res.json({ orders: orders.map(serializeOrder) });
});

router.get('/:idOrNumber', requireApiKey('orders:read'), async (req, res) => {
  const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order: serializeOrder(order) });
});

// Proof status + the customer's review link for an order. Partners poll this
// (or subscribe to proof.* webhooks) to know when a proof is approved.
router.get('/:idOrNumber/proof', requireApiKey('orders:read'), async (req, res) => {
  const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
  if (!order) throw new HttpError(404, 'Order not found');
  const proofs = await prisma.proof.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
    include: { media: true },
  });
  const base = ((await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const latest = proofs[0];
  res.json({
    proofStatus: order.proofStatus ?? null,
    latestProof: latest
      ? {
          version: latest.version,
          status: latest.status,
          fileUrl: latest.media.url,
          // token/reviewUrl let you render the approval on your own site. Only
          // the creator (whoever holds the token) can approve — your API key
          // cannot. Approve/request-changes via the public token endpoints.
          token: latest.token,
          reviewUrl: base ? `${base}/proof/${latest.token}` : null,
          approvedName: latest.approvedName,
          decidedAt: latest.decidedAt,
          decisionNote: latest.decisionNote,
        }
      : null,
    proofs: proofs.map((p) => ({ version: p.version, status: p.status, createdAt: p.createdAt })),
  });
});

const cancelSchema = z.object({ reason: z.string().max(500).optional() });

router.post('/:idOrNumber/cancel', requireApiKey('orders:write'), async (req, res) => {
  const parsed = cancelSchema.safeParse(req.body);
  const reason = parsed.success ? parsed.data.reason : undefined;

  const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
    throw new HttpError(409, `Cannot cancel an order in status ${order.status}`);
  }
  if (order.status === 'CANCELLED') {
    return res.json({ order: serializeOrder(order), already: true });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      events: {
        create: {
          kind: 'status',
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          message: reason ? `Cancelled via API: ${reason}` : 'Cancelled via API',
          actorName: `api:${req.apiKey!.prefix}`,
        },
      },
    },
    include: { items: { include: { files: { include: { media: true } } } } },
  });

  if (req.apiKey!.partnerId) {
    void dispatchPartnerWebhook({
      partnerId: req.apiKey!.partnerId,
      event: 'order.cancelled',
      orderId: updated.id,
      payload: serializeOrder(updated),
    }).catch(() => undefined);
  }

  res.json({ order: serializeOrder(updated) });
});

// ---- Payment ----

// Look up the current payment status for an order. Returns:
//   { status: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded',
//     amountCents, provider, paidAt, latestApprovalUrl? }
router.get('/:idOrNumber/payment', requireApiKey('payments:read', 'orders:read'), async (req, res) => {
  const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
  if (!order) throw new HttpError(404, 'Order not found');

  const payments = await prisma.payment.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
  });
  const captured = payments.find((p) => p.status === 'CAPTURED');
  const pending = payments.find((p) => p.status === 'PENDING' && p.provider === 'paypal');

  let status: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
  if (order.paymentStatus === 'CAPTURED') status = 'paid';
  else if (order.paymentStatus === 'REFUNDED') status = 'refunded';
  else if (order.paymentStatus === 'FAILED') status = 'failed';
  else if (pending) status = 'pending';
  else status = 'unpaid';

  res.json({
    payment: {
      status,
      amountCents: order.totalCents,
      provider: captured?.provider ?? pending?.provider ?? null,
      providerRef: captured?.providerRef ?? pending?.providerRef ?? null,
      paidAt: captured ? captured.createdAt : null,
      // pending PayPal payments still have a live approveUrl on PayPal's side
      // — we don't store it, partners must mint a fresh one if their original
      // expired (PayPal's approval URLs are good for ~3h)
      hasPendingApproval: !!pending,
    },
  });
});

// (Re-)generate a PayPal approval URL for an unpaid order. Useful when the
// original link expired or the partner declined to auto-generate at create
// time (`generatePaymentLink: false`).
const paymentLinkSchema = z
  .object({
    returnUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .partial();

router.post(
  '/:idOrNumber/payment-link',
  requireApiKey('payments:write', 'orders:write'),
  async (req, res) => {
    const parsed = paymentLinkSchema.safeParse(req.body ?? {});
    const opts = parsed.success ? parsed.data : {};
    const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.paymentStatus === 'CAPTURED') {
      throw new HttpError(409, 'Order is already paid');
    }
    if (order.totalCents <= 0) {
      throw new HttpError(400, 'Order has zero total — nothing to charge');
    }

    const r = await createPaypalApprovalForOrder({
      orderId: order.id,
      description: `Printing Comics order ${order.number}`,
      returnUrl: opts.returnUrl,
      cancelUrl: opts.cancelUrl,
    });

    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'payment',
        message: 'Fresh PayPal approval link generated',
        actorName: `api:${req.apiKey!.prefix}`,
      },
    });

    if (req.apiKey!.partnerId) {
      void dispatchPartnerWebhook({
        partnerId: req.apiKey!.partnerId,
        event: 'order.payment_link_created',
        orderId: order.id,
        payload: {
          orderId: order.id,
          number: order.number,
          paymentLink: {
            provider: 'paypal',
            approvalUrl: r.approveUrl,
            expiresAt: r.expiresAt.toISOString(),
            amountCents: r.amountCents,
          },
        },
      }).catch(() => undefined);
    }

    res.status(201).json({
      payment: {
        provider: 'paypal',
        approvalUrl: r.approveUrl,
        expiresAt: r.expiresAt.toISOString(),
        amountCents: r.amountCents,
      },
    });
  },
);

// Mark an order paid out-of-band — e.g. partner already collected funds via
// their platform's billing and is asserting they paid us via wire/ACH.
// We DON'T charge anything here; this is just a state assertion. Admin can
// undo via the admin UI.
const markPaidSchema = z.object({
  reference: z.string().max(120).optional(),
  amountCents: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

router.post(
  '/:idOrNumber/mark-paid',
  requireApiKey('payments:write', 'orders:write'),
  async (req, res) => {
    const data = markPaidSchema.parse(req.body ?? {});
    const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.paymentStatus === 'CAPTURED') {
      return res.json({ payment: { status: 'paid', alreadyPaid: true } });
    }

    const amount = data.amountCents ?? order.totalCents;

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'CAPTURED', status: 'PAID' },
      }),
      prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'manual',
          providerRef: data.reference ?? null,
          amountCents: amount,
          status: 'CAPTURED',
        },
      }),
      prisma.orderStatusEvent.create({
        data: {
          orderId: order.id,
          kind: 'payment',
          fromStatus: order.paymentStatus,
          toStatus: 'CAPTURED',
          message: data.note
            ? `Marked paid out-of-band (${data.reference ?? 'no ref'}): ${data.note}`
            : `Marked paid out-of-band${data.reference ? ` (ref: ${data.reference})` : ''}`,
          actorName: `api:${req.apiKey!.prefix}`,
        },
      }),
    ]);

    if (req.apiKey!.partnerId) {
      const refreshed = await prisma.order.findUnique({
        where: { id: order.id },
        select: {
          id: true, number: true, status: true, paymentStatus: true,
          externalRef: true, totalCents: true, projectId: true,
        },
      });
      if (refreshed) {
        void dispatchPartnerWebhook({
          partnerId: req.apiKey!.partnerId,
          event: 'order.paid',
          orderId: refreshed.id,
          payload: refreshed,
        }).catch(() => undefined);
      }
    }

    res.json({
      payment: {
        status: 'paid',
        provider: 'manual',
        amountCents: amount,
        reference: data.reference ?? null,
      },
    });
  },
);

// ---- Helpers ----

async function loadApiOrder(idOrNumber: string, apiKeyId: string) {
  return prisma.order.findFirst({
    where: {
      apiKeyId,
      OR: [{ id: idOrNumber }, { number: idOrNumber }, { externalRef: idOrNumber }],
    },
    include: { items: { include: { files: { include: { media: true } } } } },
  });
}

function serializeOrder(o: any) {
  return {
    id: o.id,
    number: o.number,
    externalRef: o.externalRef,
    projectId: o.projectId ?? null,
    status: o.status,
    paymentStatus: o.paymentStatus,
    proofStatus: o.proofStatus ?? null,
    email: o.email,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    shippingCents: o.shippingCents,
    taxCents: o.taxCents,
    totalCents: o.totalCents,
    currency: 'USD',
    shippingAddress: o.shippingAddress,
    billingAddress: o.billingAddress,
    shippingMethod: o.shippingMethod,
    trackingNumber: o.trackingNumber ?? null,
    notes: o.notes,
    items: (o.items ?? []).map((i: any) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
      options: i.options ?? null,
      files: (i.files ?? []).map((f: any) => ({
        uploadId: f.mediaFileId,
        url: f.media?.url ?? null,
        filename: f.media?.originalName ?? null,
        size: f.media?.size ?? null,
        mimeType: f.media?.mimeType ?? null,
        contentHash: f.media?.contentHash ?? null,
        purpose: f.purpose ?? null,
        notes: f.notes ?? null,
      })),
    })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export default router;
