import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { evaluateCoupon } from '../lib/coupons.js';
import { quoteShipping } from '../lib/shipping-quote.js';
import { createPaypalOrder, capturePaypalOrder } from '../lib/payments/paypal/index.js';
import { ensureCustomerAccount } from '../lib/customer-accounts.js';
import { placeFreeOrder } from '../lib/checkout-order.js';
import { orderViewToken } from '../lib/order-view.js';

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

  // Rate the real parcel: weigh the cart and ask the carrier. (Previously this
  // listed flat table rates, so 50 books quoted the same as one.)
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: { select: { name: true, weightGrams: true, pricingConfig: true, package: true, unitLengthIn: true, unitWidthIn: true, unitHeightIn: true, unitsPerItem: true, stockPool: { select: { boxes: true } } } } },
  });
  const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  const quote = await quoteShipping({
    items: items.map((i) => ({
      quantity: i.quantity,
      options: i.options,
      product: i.product,
    })),
    address: shippingAddress,
    subtotalCents: subtotal,
  });

  const taxRate = await prisma.taxRate.findFirst({
    where: { region: shippingAddress.region, country: shippingAddress.country },
  });
  const taxCents = taxRate ? Math.floor((subtotal * taxRate.rateBps) / 10_000) : 0;

  res.json({
    subtotalCents: subtotal,
    taxCents,
    shippingOptions: quote.options,
    shipmentWeightOz: Math.round(quote.weightOz * 100) / 100,
    boxes: quote.boxes,
  });
});

// ---- Validate a discount code against the current cart ----
// Lets checkout preview the discount before the buyer commits to payment.
// `shippingCents` is the rate the buyer has picked so far, so the preview can
// show what the code takes off shipping too (a 100% code: all of it).
router.post('/validate-coupon', async (req, res) => {
  const { code, shippingCents } = z.object({
    code: z.string().min(1).max(64),
    shippingCents: z.number().int().min(0).max(1_000_000).optional(),
  }).parse(req.body);
  const cart = await findCart(req);
  if (!cart) throw new HttpError(400, 'No cart');

  const items = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
  const subtotalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  const result = await evaluateCoupon(code, subtotalCents, { shippingCents: shippingCents ?? 0 });
  res.json({
    ok: result.ok,
    code: result.coupon?.code ?? code.trim().toUpperCase(),
    description: result.coupon?.description ?? null,
    discountCents: result.discountCents,
    shippingDiscountCents: result.shippingDiscountCents,
    appliesToShipping: result.coupon?.appliesToShipping ?? false,
    subtotalCents,
    shippingCents: shippingCents ?? 0,
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

type CreateBody = z.infer<typeof createSchema>;

/** The checkout input every placement path shares, with the buyer's account resolved. */
async function checkoutInput(req: any, data: CreateBody) {
  const cart = await findCart(req);
  if (!cart) throw new HttpError(400, 'No cart');

  // shippingMethodId and shippingRateId both reference ShippingRate.id in
  // the new flow — just forward whichever is set.
  const shippingMethodId = data.shippingRateId ?? data.shippingMethodId;

  // Every order belongs to an account: a guest gets one made for their email
  // right here (signed in later through emailed links until they choose a
  // password), so orders, proofs and file requests all live in one place.
  const userId = (req.session?.sub as string | undefined)
    ?? (await ensureCustomerAccount(data.email, { firstName: data.shippingAddress.firstName, lastName: data.shippingAddress.lastName })).id;

  return {
    cart,
    input: {
      cartId: cart.id,
      userId,
      email: data.email,
      shippingAddress: data.shippingAddress,
      billingAddress: data.billingAddress,
      shippingMethodId: shippingMethodId ?? undefined,
      couponCode: data.couponCode,
      notes: data.notes,
    },
  };
}

router.post('/paypal/create', async (req, res) => {
  const data = createSchema.parse(req.body);
  const { input } = await checkoutInput(req, data);
  const result = await createPaypalOrder(input);

  // The cart is deliberately NOT emptied here. The PayPal SDK calls this
  // endpoint afresh on every click of the Pay button, so emptying the cart
  // before the buyer has actually paid meant one declined card, closed popup
  // or failed 3-D Secure prompt left them with an empty cart and a 500 on
  // every retry. The order row already holds its own copy of the lines; the
  // cart is cleared once the capture succeeds below.
  res.json(result);
});

// ---- Place an order with nothing to pay ----
// A discount code that covers the goods and the shipping leaves $0.00: PayPal
// refuses such an order, so it is placed here, PAID from the start. The total
// is recomputed server-side; a cart with a balance is refused.
router.post('/free', async (req, res) => {
  const data = createSchema.parse(req.body);
  const { cart, input } = await checkoutInput(req, data);
  const result = await placeFreeOrder(input);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  res.json({ ...result, viewToken: orderViewToken(result.orderId) });
});

// ---- Capture after buyer approves on PayPal ----
router.post('/paypal/capture/:paypalOrderId', async (req, res) => {
  const result = await capturePaypalOrder(req.params.paypalOrderId);

  // COMPLETED: paid. PENDING: PayPal accepted the checkout but is still
  // holding the money — the order exists and must not be placed twice, so the
  // cart is cleared either way. A declined capture throws before this point.
  if (result.status === 'COMPLETED' || result.status === 'PENDING') {
    const cart = await findCart(req);
    if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  res.json({ ...result, viewToken: orderViewToken(result.orderId) });
});

export default router;
