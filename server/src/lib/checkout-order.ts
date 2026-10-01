/**
 * Turning a cart into an order: the totals every checkout path agrees on, the
 * order row itself, and the one path that needs no payment provider — an
 * order with nothing to pay (a 100% discount code, shipping included).
 *
 * The PayPal checkout (lib/payments/paypal/checkout.ts) builds on the same
 * totals and the same order row, then takes the balance through PayPal.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { assertCartInStock } from './inventory.js';
import { evaluateCoupon, type Coupon } from './coupons.js';
import { itemsRequestProof } from './proofs.js';
import { resolveShippingSelection } from './shipping-quote.js';
import { uploadUrlsInOptions } from './order-files.js';
import { settlePaidOrder } from './paid-order.js';
import { sendOrderConfirmationEmail } from './order-emails.js';

export interface CheckoutInput {
  cartId: string;
  email: string;
  userId?: string;
  shippingAddress: any;
  billingAddress: any;
  shippingMethodId?: string;
  couponCode?: string;
  notes?: string;
}

export type CartForCheckout = NonNullable<Awaited<ReturnType<typeof loadCart>>>;

export interface CartTotals {
  cart: CartForCheckout;
  subtotal: number;
  /** Off the goods. */
  discount: number;
  /** The carrier's price for the chosen method, before any code. */
  shippingList: number;
  /** Off the shipping charge. */
  shippingDiscount: number;
  /** Shipping actually charged (list minus the code's share). */
  shipping: number;
  tax: number;
  total: number;
  shippingMethodName?: string;
  coupon: Coupon | null;
}

async function loadCart(cartId: string) {
  return prisma.cart.findUnique({
    where: { id: cartId },
    include: { items: { include: { product: { include: { stockPool: true, package: true } }, variant: true } } },
  });
}

export function newOrderNumber(): string {
  return `PC-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`;
}

export async function computeCartTotals(input: Pick<CheckoutInput, 'cartId' | 'couponCode' | 'shippingMethodId' | 'shippingAddress'>): Promise<CartTotals> {
  const cart = await loadCart(input.cartId);
  if (!cart || cart.items.length === 0) {
    throw new HttpError(400, 'Your cart is empty. Add something to it and come back to checkout.');
  }

  assertCartInStock(cart.items);

  const subtotal = cart.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const address = input.shippingAddress;

  // Re-derive shipping from the cart's real weight — never trust a price sent
  // by the browser, and resolve live carrier rates (which aren't rows in the
  // ShippingRate table) instead of silently charging zero.
  let shippingList = 0;
  let shippingMethodName: string | undefined;
  if (input.shippingMethodId) {
    const resolved = await resolveShippingSelection({
      optionId: input.shippingMethodId,
      items: cart.items.map((i) => ({ quantity: i.quantity, options: i.options, product: i.product })),
      address: {
        line1: address?.line1,
        line2: address?.line2,
        city: address?.city,
        region: address?.region,
        postalCode: address?.postalCode,
        country: address?.country ?? 'US',
      },
      subtotalCents: subtotal,
    });
    shippingList = resolved.cents;
    shippingMethodName = resolved.name ?? undefined;
  }

  // Discount codes stack on top of the site-wide discount, which is already
  // baked into each line's unitPriceCents (see routes/cart.ts). A code the
  // customer applied but that no longer works (used up, expired) is an error
  // here, not a silent full-price charge: the page told them it was applied.
  const couponEval = await evaluateCoupon(input.couponCode, subtotal, { shippingCents: shippingList });
  if (input.couponCode?.trim() && !couponEval.ok) {
    throw new HttpError(400, `Discount code ${input.couponCode.trim().toUpperCase()}: ${couponEval.reason ?? 'not valid.'} Remove it to continue without a discount.`);
  }
  const discount = couponEval.discountCents;
  const shippingDiscount = couponEval.shippingDiscountCents;
  const shipping = shippingList - shippingDiscount;
  const coupon = couponEval.ok ? couponEval.coupon : null;

  let tax = 0;
  if (address?.region) {
    const rate = await prisma.taxRate.findFirst({ where: { region: address.region, country: address.country ?? 'US' } });
    if (rate) tax = Math.floor(((subtotal - discount) * rate.rateBps) / 10_000);
  }

  const total = subtotal - discount + tax + shipping;
  return { cart, subtotal, discount, shippingList, shippingDiscount, shipping, tax, total, shippingMethodName, coupon };
}

export interface OrderPlacement {
  number: string;
  status: 'PENDING' | 'PAID';
  paymentStatus: 'PENDING' | 'CAPTURED';
  payment: { provider: string; providerRef?: string | null; amountCents: number; status: 'PENDING' | 'CAPTURED' };
}

/** The order row (with its lines, files and payment) for a cart's totals. */
export async function createOrderFromCart(totals: CartTotals, input: CheckoutInput, placement: OrderPlacement) {
  // Link any customer-uploaded print files (referenced by URL in the cart-item
  // options) to their order item, so staff can open them from the order.
  // Matched by URL shape so it works for local, R2 and CDN-hosted uploads
  // alike — the old `/uploads/customer/` regex silently linked nothing once
  // uploads moved to R2.
  const itemUploadIds = new Map<string, string[]>();
  for (const ci of totals.cart.items) {
    const urls = uploadUrlsInOptions(ci.options);
    if (urls.length === 0) continue;
    const medias = await prisma.mediaFile.findMany({ where: { url: { in: urls } }, select: { id: true } });
    if (medias.length) itemUploadIds.set(ci.id, medias.map((m) => m.id));
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number: placement.number,
        userId: input.userId,
        email: input.email.toLowerCase(),
        status: placement.status,
        paymentStatus: placement.paymentStatus,
        subtotalCents: totals.subtotal,
        discountCents: totals.discount,
        couponCode: totals.coupon?.code ?? null,
        taxCents: totals.tax,
        shippingCents: totals.shipping,
        totalCents: totals.total,
        shippingAddress: input.shippingAddress as any,
        billingAddress: input.billingAddress as any,
        shippingMethod: totals.shippingMethodName,
        notes: input.notes,
        // If any book asked for a PDF or hard-copy proof, the order can't go to
        // production until staff upload a proof and the customer approves it.
        proofStatus: itemsRequestProof(totals.cart.items) ? 'requested' : null,
        items: {
          create: totals.cart.items.map((ci) => {
            const uploadIds = itemUploadIds.get(ci.id) ?? [];
            return {
              productId: ci.productId,
              variantId: ci.variantId,
              name: ci.product.name + (ci.variant ? ` — ${ci.variant.label}` : ''),
              options: ci.options ?? undefined,
              quantity: ci.quantity,
              unitPriceCents: ci.unitPriceCents,
              totalCents: ci.unitPriceCents * ci.quantity,
              files: uploadIds.length
                ? { create: uploadIds.map((mediaFileId) => ({ mediaFileId, purpose: 'artwork' })) }
                : undefined,
            };
          }),
        },
      },
    });

    await tx.payment.create({
      data: {
        orderId: created.id,
        provider: placement.payment.provider,
        providerRef: placement.payment.providerRef ?? null,
        amountCents: placement.payment.amountCents,
        status: placement.payment.status,
      },
    });
    return created;
  });
}

/**
 * Place an order that has nothing to pay — a discount code covered the
 * goods and the shipping. PayPal refuses a $0 order, and asking for a card
 * to charge nothing would be absurd, so the order is written PAID straight
 * away, stock and the code's redemption are settled, and the confirmation
 * goes out exactly as it would after a capture. The server recomputes the
 * total: a cart with a balance is refused and sent back to PayPal.
 */
export async function placeFreeOrder(input: CheckoutInput): Promise<{ orderId: string; orderNumber: string }> {
  const totals = await computeCartTotals(input);
  if (totals.total > 0) {
    throw new HttpError(400, `There is $${(totals.total / 100).toFixed(2)} to pay on this order — please pay with PayPal or a card.`);
  }

  const code = totals.coupon?.code ?? null;
  const order = await createOrderFromCart(totals, input, {
    number: newOrderNumber(),
    status: 'PAID',
    paymentStatus: 'CAPTURED',
    payment: { provider: code ? 'coupon' : 'none', providerRef: code, amountCents: 0, status: 'CAPTURED' },
  });

  const covered = totals.shippingList > 0 ? 'the full amount, shipping included' : 'the full amount';
  await prisma.orderStatusEvent.createMany({
    data: [
      {
        orderId: order.id, kind: 'payment', fromStatus: 'PENDING', toStatus: 'CAPTURED',
        message: code ? `No payment needed — code ${code} covered ${covered}` : 'No payment needed — the order total was $0.00',
      },
      { orderId: order.id, kind: 'status', fromStatus: 'PENDING', toStatus: 'PAID', message: 'Order placed with nothing to pay' },
    ],
  });

  await settlePaidOrder(order.id);
  void sendOrderConfirmationEmail(order.id);

  return { orderId: order.id, orderNumber: order.number };
}
