import { prisma } from '../../../db.js';
import { HttpError } from '../../../middleware/error.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';
import { paypalHttpError, paypalNetworkError } from './errors.js';

export interface RefundInput {
  /** Our Payment row. The PayPal capture id is resolved from it, not trusted blindly. */
  paymentId: string;
  amountCents?: number;
  note?: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
  refundedCents: number;
  captureId: string;
}

/**
 * The capture id, from whichever payload shape we stored:
 *  - the sync capture response  → purchase_units[0].payments.captures[0].id
 *  - a PAYMENT.CAPTURE.* webhook → resource.id (the resource IS the capture)
 */
function captureIdFromPayload(raw: unknown): string | null {
  const r = raw as any;
  if (!r || typeof r !== 'object') return null;
  const fromOrder = r.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (typeof fromOrder === 'string') return fromOrder;
  if (r.supplementary_data?.related_ids?.order_id && typeof r.id === 'string') return r.id;
  return null;
}

/** Ask PayPal which capture belongs to a checkout order id. */
async function lookupCaptureId(paypalOrderId: string): Promise<string | null> {
  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();
  const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as any;
  return captureIdFromPayload(data);
}

async function postRefund(captureId: string, input: RefundInput): Promise<Response> {
  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();

  const body: Record<string, unknown> = {};
  if (input.note) body.note_to_payer = input.note;
  if (input.amountCents && input.amountCents > 0) {
    body.amount = { value: (input.amountCents / 100).toFixed(2), currency_code: 'USD' };
  }

  try {
    return await fetch(`${config.baseUrl}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `refund_${captureId}_${Date.now()}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw paypalNetworkError('refund', e);
  }
}

/**
 * Refunds a prior PayPal capture via `POST /v2/payments/captures/{id}/refund`.
 * Omit `amountCents` to issue a full refund.
 *
 * `providerRef` is normally the capture id, but a payment that was flipped to
 * CAPTURED by the webhook before the browser's capture call finished only
 * ever had the PayPal *order* id stored. Refunding against that 404s. So the
 * capture id is taken from the stored payload first, and on RESOURCE_NOT_FOUND
 * we ask PayPal for the order's capture and retry once — then persist the
 * right id so the next refund doesn't repeat the dance.
 */
export async function refundPaypalCapture(input: RefundInput): Promise<RefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw new HttpError(404, 'Payment record not found.');
  if (payment.provider !== 'paypal') throw new HttpError(400, `Only PayPal payments can be refunded here (this one is ${payment.provider}).`);
  if (payment.status === 'REFUNDED') throw new HttpError(409, 'This payment has already been refunded.');
  if (payment.status !== 'CAPTURED') throw new HttpError(409, `This payment is ${payment.status}, not captured — there is nothing to refund yet.`);
  if (input.amountCents && input.amountCents > payment.amountCents) {
    throw new HttpError(422, `Refund of $${(input.amountCents / 100).toFixed(2)} is more than the $${(payment.amountCents / 100).toFixed(2)} that was captured.`);
  }

  let captureId = captureIdFromPayload(payment.rawPayload) ?? payment.providerRef;
  if (!captureId) throw new HttpError(400, 'This payment has no PayPal reference to refund against.');

  let res = await postRefund(captureId, input);

  if (res.status === 404 && payment.providerRef) {
    // providerRef was probably the checkout order id. Resolve and retry once.
    await res.text().catch(() => undefined);
    const resolved = await lookupCaptureId(payment.providerRef);
    if (resolved && resolved !== captureId) {
      console.warn('[paypal] refund: providerRef was an order id, resolved capture', { paymentId: payment.id, was: captureId, now: resolved });
      captureId = resolved;
      await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: resolved } });
      res = await postRefund(captureId, input);
    } else {
      throw new HttpError(404, `PayPal has no capture matching ${captureId}. Refund it from the PayPal dashboard and mark the order refunded here.`, {
        issue: 'RESOURCE_NOT_FOUND', stage: 'refund',
      });
    }
  }

  if (!res.ok) throw await paypalHttpError(res, 'refund');

  const data = (await res.json()) as any;
  const refundedCents = input.amountCents ?? Math.round(Number(data.amount?.value ?? 0) * 100);
  const refundId: string = data.id;
  const status: string = data.status;

  // A partial refund leaves the payment captured; only a full one flips it.
  const fullyRefunded = refundedCents >= payment.amountCents;
  await prisma.payment.update({
    where: { id: payment.id },
    data: fullyRefunded ? { status: 'REFUNDED', rawPayload: data } : { rawPayload: data },
  });
  if (fullyRefunded) {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'REFUNDED', status: 'REFUNDED' },
    });
  }

  return { refundId, status, refundedCents, captureId };
}
