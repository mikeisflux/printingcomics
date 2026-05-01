/**
 * Creates a PayPal Order (intent CAPTURE) for an already-persisted local
 * Order, returning the PayPal approve URL the integrator should redirect
 * the payer to. Mirrors `createPaypalOrder` (the storefront cart-driven
 * flow), but works against an Order that the API integrator submitted.
 *
 * Capture happens via the existing checkout/paypal/return flow + the
 * PayPal webhook — both already mark the Order as PAID and fire partner
 * webhooks.
 *
 * Idempotent on the Payment row: if a PENDING paypal Payment already
 * exists for the order, we tear it down before minting a fresh PayPal
 * order so the link the partner gets is always live.
 */
import { prisma } from '../../../db.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';

export interface CreatePaypalApprovalForOrderInput {
  orderId: string;
  /** Optional override of the configured PayPal return URL (per-partner success page). */
  returnUrl?: string;
  /** Optional override of the configured PayPal cancel URL. */
  cancelUrl?: string;
  /** Brief description shown on the PayPal approval screen. */
  description?: string;
}

export interface CreatePaypalApprovalResult {
  paypalOrderId: string;
  approveUrl: string;
  expiresAt: Date;
  amountCents: number;
}

const APPROVAL_TTL_MS = 3 * 60 * 60 * 1000; // PayPal approval URLs expire in ~3h

export async function createPaypalApprovalForOrder(
  input: CreatePaypalApprovalForOrderInput,
): Promise<CreatePaypalApprovalResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
  });
  if (!order) throw new Error(`Order ${input.orderId} not found`);
  if (order.totalCents <= 0) throw new Error(`Order ${order.number} has zero total — nothing to charge`);
  if (order.paymentStatus === 'CAPTURED') {
    throw new Error(`Order ${order.number} is already paid`);
  }

  // Drop any prior PENDING paypal Payment rows so we don't accumulate
  // approval-URL clutter. CAPTURED rows stay untouched (audit trail).
  await prisma.payment.deleteMany({
    where: { orderId: order.id, provider: 'paypal', status: 'PENDING' },
  });

  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();
  const amountStr = (order.totalCents / 100).toFixed(2);

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        custom_id: order.id,
        invoice_id: order.number,
        description: input.description ?? `Printing Comics order ${order.number}`,
        amount: {
          currency_code: 'USD',
          value: amountStr,
          breakdown: {
            item_total: { currency_code: 'USD', value: (order.subtotalCents / 100).toFixed(2) },
            shipping:   { currency_code: 'USD', value: (order.shippingCents / 100).toFixed(2) },
            tax_total:  { currency_code: 'USD', value: (order.taxCents / 100).toFixed(2) },
            discount:   { currency_code: 'USD', value: (order.discountCents / 100).toFixed(2) },
          },
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          user_action: 'PAY_NOW',
          return_url:
            input.returnUrl ??
            process.env.PAYPAL_RETURN_URL ??
            'http://localhost:5173/checkout/paypal/return',
          cancel_url:
            input.cancelUrl ??
            process.env.PAYPAL_CANCEL_URL ??
            'http://localhost:5173/checkout',
        },
      },
    },
  };

  const res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `${order.id}-${Date.now()}`,
    },
    body: JSON.stringify(orderPayload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`PayPal order creation failed: ${errBody}`);
  }

  const paypalOrder = (await res.json()) as {
    id: string;
    links?: { href: string; rel: string; method: string }[];
  };
  const approveLink = paypalOrder.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  if (!approveLink?.href) {
    throw new Error('PayPal did not return an approval URL');
  }

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'paypal',
      providerRef: paypalOrder.id,
      amountCents: order.totalCents,
      status: 'PENDING',
    },
  });

  return {
    paypalOrderId: paypalOrder.id,
    approveUrl: approveLink.href,
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    amountCents: order.totalCents,
  };
}
