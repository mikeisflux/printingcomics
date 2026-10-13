import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { evaluateCoupon } from '../lib/coupons.js';
import { quoteShipping, customerQuoteMessage, type ShippingOption } from '../lib/shipping-quote.js';
import { postalCodeLooksValid, regionForPostalCode } from '../lib/postal.js';
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

/** What the storefront sees of an option: name and price only. How a price was built (carrier rate, box cost, adjustment) is for the admin order page. */
const publicOption = (o: ShippingOption) => ({ id: o.id, name: o.name, rateCents: o.rateCents, estimatedDays: o.estimatedDays ?? null });

const quoteProductSelect = {
  name: true, weightGrams: true, pricingConfig: true, package: true, unitLengthIn: true, unitWidthIn: true, unitHeightIn: true,
  unitsPerItem: true, stockPoolId: true, stockPool: { select: { boxes: true } },
} as const;

// ---- Quote shipping + tax (no PayPal interaction) ----
router.post('/quote', async (req, res) => {
  const { shippingAddress } = z.object({ shippingAddress: addressSchema }).parse(req.body);
  const cart = await findCart(req);
  if (!cart) throw new HttpError(400, 'No cart');

  // Rate the real parcel: weigh the cart and ask the carrier. (Previously this
  // listed flat table rates, so 50 books quoted the same as one.)
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: { select: quoteProductSelect } },
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
    shippingOptions: quote.options.map(publicOption),
    shipmentWeightOz: Math.round(quote.weightOz * 100) / 100,
    boxes: quote.boxes,
    // Why live rates are missing, in words a shopper can act on (the full
    // reason is in the server log).
    liveError: customerQuoteMessage(quote.liveErrorKind, quote.liveErrorKind === 'address' ? quote.liveError : undefined),
  });
});

// ---- Shipping estimate from a postal code alone ----
// For the cart page, a product page, and the checkout before the address is
// complete: country + postal code (+ state/city when known) is what the
// carriers price on. Either the cart or the given lines are rated.
const estimateSchema = z.object({
  country: z.string().min(2).max(2).default('US'),
  postalCode: z.string().min(1).max(12),
  region: z.string().max(60).optional(),
  city: z.string().max(80).optional(),
  line1: z.string().max(120).optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(10_000),
    options: z.record(z.string(), z.string()).optional(),
  })).max(50).optional(),
});
router.post('/estimate', async (req, res) => {
  const data = estimateSchema.parse(req.body);
  const country = data.country.toUpperCase();
  const postalCode = data.postalCode.trim();
  if (!postalCodeLooksValid(country, postalCode)) {
    throw new HttpError(400, country === 'US' ? 'Enter a 5-digit ZIP code.' : `That does not look like a postal code for ${country}.`);
  }
  const region = data.region?.trim() || regionForPostalCode(country, postalCode) || '';

  let lines: { quantity: number; options: unknown; product: any; unitPriceCents: number }[];
  if (data.items && data.items.length > 0) {
    const products = await prisma.product.findMany({ where: { id: { in: data.items.map((i) => i.productId) } }, select: { id: true, priceCents: true, ...quoteProductSelect } });
    lines = data.items.flatMap((i) => {
      const product = products.find((p) => p.id === i.productId);
      return product ? [{ quantity: i.quantity, options: i.options ?? null, product, unitPriceCents: product.priceCents }] : [];
    });
    if (lines.length === 0) throw new HttpError(404, 'Product not found');
  } else {
    const cart = await findCart(req);
    if (!cart) throw new HttpError(400, 'No cart');
    const items = await prisma.cartItem.findMany({ where: { cartId: cart.id }, include: { product: { select: quoteProductSelect } } });
    if (items.length === 0) throw new HttpError(400, 'Your cart is empty.');
    lines = items.map((i) => ({ quantity: i.quantity, options: i.options, product: i.product, unitPriceCents: i.unitPriceCents }));
  }
  const subtotal = lines.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  const quote = await quoteShipping({
    items: lines.map((i) => ({ quantity: i.quantity, options: i.options, product: i.product })),
    address: { country, postalCode, region, city: data.city?.trim() || undefined, line1: data.line1?.trim() || undefined },
    subtotalCents: subtotal,
  });
  res.json({
    shippingOptions: quote.options.map(publicOption),
    shipmentWeightOz: Math.round(quote.weightOz * 100) / 100,
    boxes: quote.boxes,
    region: region || null,
    liveError: customerQuoteMessage(quote.liveErrorKind, quote.liveErrorKind === 'address' ? quote.liveError : undefined),
  });
});

// ---- Bulk quote: N mailers or sleeves to a postal code ----
// The cheapest set of packs that covers the quantity (packs come in fixed
// sizes, so a thousand mailers is 7 × 135 + 50 + 10), boxed by the same
// packer checkout uses — seven full cartons and one part carton — with the
// labels for every box added up. Buying it puts those packs in the cart.
const bulkSchema = z.object({
  productId: z.string(),
  units: z.number().int().min(1).max(100_000),
  country: z.string().min(2).max(2).default('US'),
  postalCode: z.string().min(1).max(12),
  region: z.string().max(60).optional(),
  city: z.string().max(80).optional(),
});

/**
 * The cheapest combination of packs giving at least `units` units — exact
 * cover first, the smallest overshoot among equal prices. Dynamic programme
 * over the unit count; packs ≤ 100k units keep it instant.
 */
export function cheapestPackCover(packs: { id: string; units: number; priceCents: number }[], units: number): Map<string, number> {
  const sized = packs.filter((p) => p.units > 0 && p.priceCents >= 0);
  if (sized.length === 0) return new Map();
  const maxPack = Math.max(...sized.map((p) => p.units));
  const top = units + maxPack;
  const best = new Array<number>(top + 1).fill(Number.POSITIVE_INFINITY);
  const pick = new Array<string | null>(top + 1).fill(null);
  best[0] = 0;
  for (let u = 1; u <= top; u++) {
    for (const p of sized) {
      if (p.units > u) continue;
      const c = best[u - p.units]! + p.priceCents;
      if (c < best[u]!) { best[u] = c; pick[u] = p.id; }
    }
  }
  let at = -1;
  for (let u = units; u <= top; u++) {
    if (best[u] === Number.POSITIVE_INFINITY) continue;
    if (at < 0 || best[u]! < best[at]!) at = u;
  }
  const out = new Map<string, number>();
  while (at > 0 && pick[at]) {
    const id = pick[at]!;
    out.set(id, (out.get(id) ?? 0) + 1);
    at -= sized.find((p) => p.id === id)!.units;
  }
  return out;
}

router.post('/bulk-quote', async (req, res) => {
  const data = bulkSchema.parse(req.body);
  const country = data.country.toUpperCase();
  const postalCode = data.postalCode.trim();
  if (!postalCodeLooksValid(country, postalCode)) {
    throw new HttpError(400, country === 'US' ? 'Enter a 5-digit ZIP code.' : `That does not look like a postal code for ${country}.`);
  }
  const region = data.region?.trim() || regionForPostalCode(country, postalCode) || '';

  const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true, active: true, stockPoolId: true } });
  if (!product || !product.active) throw new HttpError(404, 'Product not found');
  const packSelect = { id: true, slug: true, priceCents: true, ...quoteProductSelect } as const;
  // The packs that sell these units: the product's family (same pile), or just itself.
  const packs = product.stockPoolId
    ? await prisma.product.findMany({ where: { stockPoolId: product.stockPoolId, active: true }, select: packSelect, orderBy: { unitsPerItem: 'desc' } })
    : await prisma.product.findMany({ where: { id: product.id }, select: packSelect });
  const combo = cheapestPackCover(packs.map((p) => ({ id: p.id, units: Math.max(1, p.unitsPerItem), priceCents: p.priceCents })), data.units);
  const lines = packs
    .filter((p) => (combo.get(p.id) ?? 0) > 0)
    .map((p) => ({ product: p, quantity: combo.get(p.id)!, packUnits: Math.max(1, p.unitsPerItem) }))
    .sort((a, b) => b.packUnits - a.packUnits);
  if (lines.length === 0) throw new HttpError(400, 'No pack sizes are on sale for this product right now.');
  const goodsCents = lines.reduce((s, l) => s + l.product.priceCents * l.quantity, 0);
  const unitsSupplied = lines.reduce((s, l) => s + l.packUnits * l.quantity, 0);

  const quote = await quoteShipping({
    items: lines.map((l) => ({ quantity: l.quantity, options: null, product: l.product })),
    address: { country, postalCode, region, city: data.city?.trim() || undefined },
    subtotalCents: goodsCents,
  });
  // Every option packs the same boxes; list them once, without what they cost us.
  const packing = new Map<string, { box: string; count: number; lengthIn: number; widthIn: number; heightIn: number }>();
  for (const b of quote.options[0]?.breakdown?.boxes ?? []) {
    const cur = packing.get(b.label) ?? { box: b.label, count: 0, lengthIn: b.lengthIn, widthIn: b.widthIn, heightIn: b.heightIn };
    cur.count += b.count;
    packing.set(b.label, cur);
  }
  res.json({
    units: data.units,
    unitsSupplied,
    packs: lines.map((l) => ({ productId: l.product.id, slug: l.product.slug, name: l.product.name, packUnits: l.packUnits, quantity: l.quantity, unitPriceCents: l.product.priceCents, lineCents: l.product.priceCents * l.quantity })),
    goodsCents,
    packing: [...packing.values()],
    boxes: quote.boxes,
    shipmentWeightOz: Math.round(quote.weightOz * 100) / 100,
    shippingOptions: quote.options.map(publicOption),
    region: region || null,
    liveError: customerQuoteMessage(quote.liveErrorKind, quote.liveErrorKind === 'address' ? quote.liveError : undefined),
  });
});

// ---- Postal code → region (US ZIP → state) ----
router.get('/postal-lookup', (req, res) => {
  const country = String(req.query.country ?? 'US').toUpperCase();
  const postalCode = String(req.query.postalCode ?? '').trim();
  res.json({
    country,
    postalCode,
    valid: postalCodeLooksValid(country, postalCode),
    region: regionForPostalCode(country, postalCode),
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
