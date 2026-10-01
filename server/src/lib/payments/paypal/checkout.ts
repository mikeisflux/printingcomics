import { prisma } from '../../../db.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';
import { paypalHttpError, paypalNetworkError } from './errors.js';
import { HttpError } from '../../../middleware/error.js';
import { computeCartTotals, createOrderFromCart, newOrderNumber, type CheckoutInput } from '../../checkout-order.js';

export type CreatePaypalOrderInput = CheckoutInput;

export interface CreatePaypalOrderResult {
  paypalOrderId: string;
  orderNumber: string;
  approveUrl: string | null;
}

/**
 * Creates a PayPal order via /v2/checkout/orders and a local pending Order row.
 * We use CAPTURE intent (immediate charge on approval) — no authorization holds.
 */
export async function createPaypalOrder(input: CreatePaypalOrderInput): Promise<CreatePaypalOrderResult> {
  // The cart, the code and the total are checked before PayPal comes into
  // it, so a bad code or an order with nothing to pay gets its own message.
  const totals = await computeCartTotals(input);
  if (totals.total <= 0) {
    // PayPal refuses a $0 order; the checkout page places these without a payment.
    throw new HttpError(400, 'There is nothing to pay on this order — use the "Place order" button instead of PayPal.');
  }

  const config = await getPayPalConfig();

  // Pre-create the local Order in PENDING state — ties the PayPal order to a
  // row we own, so webhook + capture callbacks can reconcile.
  const order = await createOrderFromCart(totals, input, {
    number: newOrderNumber(),
    status: 'PENDING',
    paymentStatus: 'PENDING',
    payment: { provider: 'paypal', amountCents: totals.total, status: 'PENDING' },
  });

  // From here on the local Order row already exists. If ANY step fails we must
  // remove it: a payment error would otherwise leave a phantom PENDING order
  // that looks exactly like an abandoned cart, and ~24h later the abandoned-
  // order sweep deletes it AND purges the customer's uploaded artwork. That is
  // precisely how three customer files were lost during a PayPal outage.
  let accessToken: string;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (e) {
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    throw e;
  }
  const amountStr = (totals.total / 100).toFixed(2);

  // PayPal checks item_total + tax_total + shipping − discount = value, so the
  // shipping figure is what the customer actually pays for it (the code's
  // share already taken off) and the discount is the goods discount only.
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

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': order.id,
      },
      body: JSON.stringify(orderPayload),
    });
  } catch (e) {
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    throw paypalNetworkError('order creation', e);
  }

  if (!res.ok) {
    // Clean up the order we just created, then surface PayPal's actual reason.
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    throw await paypalHttpError(res, 'order creation');
  }

  const paypalOrder = (await res.json()) as { id: string; links?: { href: string; rel: string; method: string }[] };
  const approveLink = paypalOrder.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');

  // Store PayPal order id on the payment row
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { providerRef: paypalOrder.id },
  });

  // The discount code is counted as used when the order is paid (see
  // lib/paid-order.ts), not here: the PayPal button calls this afresh on every
  // click, so counting now burned one-use codes on a closed popup.

  return {
    paypalOrderId: paypalOrder.id,
    orderNumber: order.number,
    approveUrl: approveLink?.href ?? null,
  };
}
