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
import { computePricing, type PricingConfig } from '../../lib/pricing.js';
import { priceForQuantity, type VolumeTier } from '../../lib/money.js';
import { dispatchPartnerWebhook } from '../../lib/partners.js';

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

const itemSchema = z.object({
  productSlug: z.string().optional(),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(100_000),
  options: z.record(z.union([z.string(), z.number()])).optional(),
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
});

router.post('/', requireApiKey('orders:write'), async (req, res) => {
  const data = createSchema.parse(req.body);
  const apiKeyId = req.apiKey!.id;

  // Idempotency check — same (apiKey, externalRef) returns the prior order.
  if (data.externalRef) {
    const existing = await prisma.order.findFirst({
      where: { apiKeyId, externalRef: data.externalRef },
      include: { items: true },
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
    if (cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers)) {
      unitPriceCents = computePricing(cfg, { quantity: line.quantity, options: optionInputs }).unitCents;
    } else {
      unitPriceCents = priceForQuantity(unitPriceCents, line.quantity, product.volumeTiers as VolumeTier[] | null);
    }

    subtotal += unitPriceCents * line.quantity;
    resolved.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name + (variant ? ` — ${variant.label}` : ''),
      quantity: line.quantity,
      options: optionInputs,
      unitPriceCents,
    });
  }

  // ---- Coupon ----
  let discount = 0;
  if (data.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: data.couponCode.toUpperCase() } });
    if (coupon && coupon.active && subtotal >= coupon.minSubtotalCents) {
      if (coupon.percentOffBps) discount += Math.floor((subtotal * coupon.percentOffBps) / 10_000);
      if (coupon.amountOffCents) discount += coupon.amountOffCents;
      discount = Math.min(discount, subtotal);
    }
  }

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
      partnerId: req.apiKey!.partnerId ?? null,
      externalRef: data.externalRef ?? null,
      items: {
        create: resolved.map((r) => ({
          productId: r.productId,
          variantId: r.variantId ?? undefined,
          name: r.name,
          options: r.options as any,
          quantity: r.quantity,
          unitPriceCents: r.unitPriceCents,
          totalCents: r.unitPriceCents * r.quantity,
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
    include: { items: true },
  });

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

  // Fire-and-forget webhook delivery to the partner. Failures are persisted
  // to PartnerWebhookDelivery so the admin can replay them — they do not
  // fail the order creation.
  if (req.apiKey!.partnerId) {
    void dispatchPartnerWebhook({
      partnerId: req.apiKey!.partnerId,
      event: 'order.created',
      orderId: order.id,
      payload: serializeOrder(order),
    }).catch(() => undefined);
    if (data.markAsPaid) {
      void dispatchPartnerWebhook({
        partnerId: req.apiKey!.partnerId,
        event: 'order.paid',
        orderId: order.id,
        payload: serializeOrder(order),
      }).catch(() => undefined);
    }
  }

  res.status(201).json({ order: serializeOrder(order), idempotent: false });
});

// ---- Read ----

router.get('/', requireApiKey('orders:read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const orders = await prisma.order.findMany({
    where: { apiKeyId: req.apiKey!.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { items: true },
  });
  res.json({ orders: orders.map(serializeOrder) });
});

router.get('/:idOrNumber', requireApiKey('orders:read'), async (req, res) => {
  const order = await loadApiOrder(String(req.params.idOrNumber), req.apiKey!.id);
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order: serializeOrder(order) });
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
    include: { items: true },
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

// ---- Helpers ----

async function loadApiOrder(idOrNumber: string, apiKeyId: string) {
  return prisma.order.findFirst({
    where: {
      apiKeyId,
      OR: [{ id: idOrNumber }, { number: idOrNumber }, { externalRef: idOrNumber }],
    },
    include: { items: true },
  });
}

function serializeOrder(o: any) {
  return {
    id: o.id,
    number: o.number,
    externalRef: o.externalRef,
    status: o.status,
    paymentStatus: o.paymentStatus,
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
    })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export default router;
