import { Router } from 'express';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';

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

const quoteSchema = z.object({
  shippingAddress: addressSchema,
  shippingMethod: z.string().optional(),
});

async function computeTotals(opts: {
  cartId: string;
  shipping?: { rateCents: number; name: string };
  taxRegion?: string;
  taxCountry?: string;
  couponCode?: string;
}) {
  const cart = await prisma.cart.findUnique({
    where: { id: opts.cartId },
    include: { items: { include: { product: true, variant: true } } },
  });
  if (!cart || cart.items.length === 0) throw new HttpError(400, 'Cart is empty');

  const subtotal = cart.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  let discount = 0;
  if (opts.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: opts.couponCode.toUpperCase() } });
    if (coupon && coupon.active && subtotal >= coupon.minSubtotalCents) {
      if (coupon.percentOffBps) discount += Math.floor((subtotal * coupon.percentOffBps) / 10_000);
      if (coupon.amountOffCents) discount += coupon.amountOffCents;
      discount = Math.min(discount, subtotal);
    }
  }

  let tax = 0;
  if (opts.taxRegion) {
    const rate = await prisma.taxRate.findFirst({
      where: { region: opts.taxRegion, country: opts.taxCountry ?? 'US' },
    });
    if (rate) tax = Math.floor(((subtotal - discount) * rate.rateBps) / 10_000);
  }

  const shipping = opts.shipping?.rateCents ?? 0;
  const total = subtotal - discount + tax + shipping;
  return { cart, subtotal, discount, tax, shipping, total };
}

router.post('/quote', async (req, res) => {
  const { shippingAddress } = quoteSchema.parse(req.body);
  // Use sessionKey or user to find cart
  const userId = req.session?.sub;
  const cart = userId
    ? await prisma.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } })
    : req.sessionKey
      ? await prisma.cart.findUnique({ where: { sessionKey: req.sessionKey } })
      : null;
  if (!cart) throw new HttpError(400, 'No cart');

  // Find best shipping option matching the country.
  const zones = await prisma.shippingZone.findMany({
    where: { countries: { has: shippingAddress.country } },
    include: { rates: true },
  });
  const firstZone = zones[0];
  const options = firstZone?.rates ?? [];

  const baseTotals = await computeTotals({
    cartId: cart.id,
    taxRegion: shippingAddress.region,
    taxCountry: shippingAddress.country,
  });

  res.json({
    subtotalCents: baseTotals.subtotal,
    taxCents: baseTotals.tax,
    shippingOptions: options.map((o) => ({
      id: o.id,
      name: o.name,
      rateCents: o.rateCents,
      estimatedDays: o.estimatedDays,
    })),
  });
});

const placeSchema = z.object({
  email: z.string().email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  shippingMethodId: z.string().optional(),
  couponCode: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

router.post('/place', async (req, res) => {
  const data = placeSchema.parse(req.body);

  const userId = req.session?.sub;
  const cart = userId
    ? await prisma.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } })
    : req.sessionKey
      ? await prisma.cart.findUnique({ where: { sessionKey: req.sessionKey } })
      : null;
  if (!cart) throw new HttpError(400, 'No cart');

  let shipping: { rateCents: number; name: string } | undefined;
  if (data.shippingMethodId) {
    const rate = await prisma.shippingRate.findUnique({ where: { id: data.shippingMethodId } });
    if (rate) shipping = { rateCents: rate.rateCents, name: rate.name };
  }

  const totals = await computeTotals({
    cartId: cart.id,
    shipping,
    taxRegion: data.shippingAddress.region,
    taxCountry: data.shippingAddress.country,
    couponCode: data.couponCode,
  });

  // Generate a human-readable order number.
  const number = `PC-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number,
        userId,
        email: data.email.toLowerCase(),
        subtotalCents: totals.subtotal,
        discountCents: totals.discount,
        taxCents: totals.tax,
        shippingCents: totals.shipping,
        totalCents: totals.total,
        shippingAddress: data.shippingAddress as any,
        billingAddress: data.billingAddress as any,
        shippingMethod: shipping?.name,
        notes: data.notes,
        items: {
          create: totals.cart.items.map((ci) => ({
            productId: ci.productId,
            variantId: ci.variantId,
            name: ci.product.name + (ci.variant ? ` — ${ci.variant.label}` : ''),
            options: ci.options ?? undefined,
            quantity: ci.quantity,
            unitPriceCents: ci.unitPriceCents,
            totalCents: ci.unitPriceCents * ci.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // Empty the cart.
    await tx.cartItem.deleteMany({ where: { cartId: totals.cart.id } });

    // Stripe integration would create a PaymentIntent here and return a client_secret.
    await tx.payment.create({
      data: {
        orderId: created.id,
        provider: 'stripe',
        amountCents: totals.total,
        status: 'PENDING',
      },
    });
    return created;
  });

  res.json({ order });
});

export default router;
