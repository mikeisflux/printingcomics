import { randomInt } from 'node:crypto';
import { prisma } from '../../../db.js';
import { evaluateCoupon, incrementCouponUsage } from '../../coupons.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';

export interface CreatePaypalOrderInput {
  cartId: string;
  email: string;
  userId?: string;
  shippingAddress: any;
  billingAddress: any;
  shippingMethodId?: string;
  couponCode?: string;
  notes?: string;
}

export interface CreatePaypalOrderResult {
  paypalOrderId: string;
  orderNumber: string;
  approveUrl: string | null;
}

async function computeTotals(cartId: string, couponCode?: string, shippingMethodId?: string, taxRegion?: string, taxCountry?: string) {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: { items: { include: { product: true, variant: true } } },
  });
  if (!cart || cart.items.length === 0) throw new Error('Cart is empty');

  const subtotal = cart.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  // Discount codes stack on top of the site-wide discount, which is already
  // baked into each line's unitPriceCents (see routes/cart.ts).
  const couponEval = await evaluateCoupon(couponCode, subtotal);
  const discount = couponEval.discountCents;
  const coupon = couponEval.ok ? couponEval.coupon : null;

  let shipping = 0;
  let shippingMethodName: string | undefined;
  if (shippingMethodId) {
    const rate = await prisma.shippingRate.findUnique({ where: { id: shippingMethodId } });
    if (rate) {
      shipping = rate.rateCents;
      shippingMethodName = rate.name;
    }
  }

  let tax = 0;
  if (taxRegion) {
    const rate = await prisma.taxRate.findFirst({
      where: { region: taxRegion, country: taxCountry ?? 'US' },
    });
    if (rate) tax = Math.floor(((subtotal - discount) * rate.rateBps) / 10_000);
  }

  const total = subtotal - discount + tax + shipping;
  return { cart, subtotal, discount, tax, shipping, total, shippingMethodName, coupon };
}

/**
 * Creates a PayPal order via /v2/checkout/orders and a local pending Order row.
 * We use CAPTURE intent (immediate charge on approval) — no authorization holds.
 */
export async function createPaypalOrder(input: CreatePaypalOrderInput): Promise<CreatePaypalOrderResult> {
  const config = await getPayPalConfig();

  const totals = await computeTotals(
    input.cartId,
    input.couponCode,
    input.shippingMethodId,
    input.shippingAddress?.region,
    input.shippingAddress?.country,
  );

  // Pre-create the local Order in PENDING state — ties the PayPal order to a
  // row we own, so webhook + capture callbacks can reconcile.
  const number = `PC-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`;

  // Link any customer-uploaded print files (referenced by URL in the cart-item
  // options) to their order item, so staff can download them from the order.
  const uploadUrlRe = /\/uploads\/customer\/[A-Za-z0-9._-]+/g;
  const itemUploadIds = new Map<string, string[]>();
  for (const ci of totals.cart.items) {
    const opts = ci.options as Record<string, unknown> | null;
    if (!opts) continue;
    const urls = new Set<string>();
    for (const v of Object.values(opts)) {
      if (typeof v === 'string') for (const m of v.matchAll(uploadUrlRe)) urls.add(m[0]);
    }
    if (urls.size === 0) continue;
    const medias = await prisma.mediaFile.findMany({ where: { url: { in: [...urls] } }, select: { id: true } });
    if (medias.length) itemUploadIds.set(ci.id, medias.map((m) => m.id));
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number,
        userId: input.userId,
        email: input.email.toLowerCase(),
        subtotalCents: totals.subtotal,
        discountCents: totals.discount,
        taxCents: totals.tax,
        shippingCents: totals.shipping,
        totalCents: totals.total,
        shippingAddress: input.shippingAddress as any,
        billingAddress: input.billingAddress as any,
        shippingMethod: totals.shippingMethodName,
        notes: input.notes,
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
        provider: 'paypal',
        amountCents: totals.total,
        status: 'PENDING',
      },
    });
    return created;
  });

  const accessToken = await getPayPalAccessToken();
  const amountStr = (totals.total / 100).toFixed(2);

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        custom_id: order.id,
        invoice_id: order.number,
        description: `Printing Comics order ${order.number}`,
        amount: {
          currency_code: 'USD',
          value: amountStr,
          breakdown: {
            item_total: { currency_code: 'USD', value: (totals.subtotal / 100).toFixed(2) },
            shipping:   { currency_code: 'USD', value: (totals.shipping / 100).toFixed(2) },
            tax_total:  { currency_code: 'USD', value: (totals.tax / 100).toFixed(2) },
            discount:   { currency_code: 'USD', value: (totals.discount / 100).toFixed(2) },
          },
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          user_action: 'PAY_NOW',
          return_url: process.env.PAYPAL_RETURN_URL ?? 'http://localhost:5173/checkout/paypal/return',
          cancel_url: process.env.PAYPAL_CANCEL_URL ?? 'http://localhost:5173/checkout',
        },
      },
    },
  };

  const res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': order.id,
    },
    body: JSON.stringify(orderPayload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    // Clean up the order we just created
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    throw new Error(`PayPal order creation failed: ${errBody}`);
  }

  const paypalOrder = (await res.json()) as { id: string; links?: { href: string; rel: string; method: string }[] };
  const approveLink = paypalOrder.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');

  // Store PayPal order id on the payment row
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { providerRef: paypalOrder.id },
  });

  // Count the redemption now that the PayPal order exists. (Abandoned
  // approvals are rare; counting at capture would require persisting the code
  // on the order.)
  if (totals.coupon) await incrementCouponUsage(totals.coupon.id);

  return {
    paypalOrderId: paypalOrder.id,
    orderNumber: order.number,
    approveUrl: approveLink?.href ?? null,
  };
}
