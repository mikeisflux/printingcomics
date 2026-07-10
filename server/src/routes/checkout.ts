import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { evaluateCoupon } from '../lib/coupons.js';
import { createPaypalOrder, capturePaypalOrder } from '../lib/payments/paypal/index.js';

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

async function findCart(req: any) {
  const userId = req.session?.sub as string | undefined;
  if (userId) {
    return prisma.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  }
  if (req.sessionKey) {
    return prisma.cart.findUnique({ where: { sessionKey: req.sessionKey } });
  }
  return null;
}

// ---- Quote shipping + tax (no PayPal interaction) ----
router.post('/quote', async (req, res) => {
  const { shippingAddress } = z.object({ shippingAddress: addressSchema }).parse(req.body);
  const cart = await findCart(req);
  if (!cart) throw new HttpError(400, 'No cart');

  const zones = await prisma.shippingZone.findMany({
    where: { countries: { has: shippingAddress.country } },
    include: { rates: true },
  });
  const options = zones[0]?.rates ?? [];

  const items = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
  const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  const taxRate = await prisma.taxRate.findFirst({
    where: { region: shippingAddress.region, country: shippingAddress.country },
  });
  const taxCents = taxRate ? Math.floor((subtotal * taxRate.rateBps) / 10_000) : 0;

  res.json({
    subtotalCents: subtotal,
    taxCents,
    shippingOptions: options.map((o) => ({
      id: o.id, name: o.name, rateCents: o.rateCents, estimatedDays: o.estimatedDays,
    })),
  });
});

// ---- Validate a discount code against the current cart ----
// Lets checkout preview the discount before the buyer commits to payment.
router.post('/validate-coupon', async (req, res) => {
  const { code } = z.object({ code: z.string().min(1).max(64) }).parse(req.body);
  const cart = await findCart(req);
  if (!cart) throw new HttpError(400, 'No cart');

  const items = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
  const subtotalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  const result = await evaluateCoupon(code, subtotalCents);
  res.json({
    ok: result.ok,
    code: result.coupon?.code ?? code.trim().toUpperCase(),
    description: result.coupon?.description ?? null,
    discountCents: result.discountCents,
    subtotalCents,
    reason: result.ok ? null : result.reason,
  });
});

// ---- Create a PayPal order ----
const createSchema = z.object({
  email: z.string().email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  // Either an opaque shippingMethodId from the getQuote flow, or a
  // ShippingRate.id picked directly on the checkout page.
  shippingMethodId: z.string().optional(),
  shippingRateId: z.string().optional().nullable(),
  couponCode: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

router.post('/paypal/create', async (req, res) => {
  const data = createSchema.parse(req.body);
  const cart = await findCart(req);
  if (!cart) throw new HttpError(400, 'No cart');

  // shippingMethodId and shippingRateId both reference ShippingRate.id in
  // the new flow — just forward whichever is set.
  const shippingMethodId = data.shippingRateId ?? data.shippingMethodId;

  const result = await createPaypalOrder({
    cartId: cart.id,
    userId: req.session?.sub,
    email: data.email,
    shippingAddress: data.shippingAddress,
    billingAddress: data.billingAddress,
    shippingMethodId: shippingMethodId ?? undefined,
    couponCode: data.couponCode,
    notes: data.notes,
  });

  // Empty the cart now — the local order owns the line items.
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  res.json(result);
});

// ---- Capture after buyer approves on PayPal ----
router.post('/paypal/capture/:paypalOrderId', async (req, res) => {
  const result = await capturePaypalOrder(req.params.paypalOrderId);
  res.json(result);
});

export default router;
