import { prisma } from '../../../db.js';
import { HttpError } from '../../../middleware/error.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';
import { paypalHttpError, paypalNetworkError } from './errors.js';
import { sendOrderConfirmationEmail } from '../../order-emails.js';
import { dispatchPartnerWebhook } from '../../partners.js';

export interface CaptureResult {
  orderId: string;
  orderNumber: string;
  paypalCaptureId: string;
  status: string;
}

/**
 * Captures a previously-approved PayPal order. Called after buyer approves
 * on PayPal's checkout page and lands back on the return URL.
 *
 * Uses CAS (compare-and-set) via updateMany to prevent double-capture on
 * concurrent callbacks (browser return + webhook can race).
 *
 * Every PayPal failure surfaces as an HttpError with the buyer-facing reason
 * (a declined card is a 402 "card declined", not a 500) and the full PayPal
 * body goes to the log under `[paypal] capture failed`.
 */
export async function capturePaypalOrder(paypalOrderId: string): Promise<CaptureResult> {
  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture_${paypalOrderId}`,
      },
    });
  } catch (e) {
    throw paypalNetworkError('capture', e);
  }

  if (!res.ok) throw await paypalHttpError(res, 'capture');

  const data = (await res.json()) as any;
  const status: string = data.status;
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  const captureId: string = capture?.id ?? paypalOrderId;
  const captureStatus: string | undefined = capture?.status;
  const customId: string | undefined = data.purchase_units?.[0]?.custom_id;

  const payment = await prisma.payment.findFirst({
    where: { providerRef: paypalOrderId },
    include: { order: true },
  });
  if (!payment) {
    console.error('[paypal] capture succeeded at PayPal but no local payment row matches', { paypalOrderId, captureId });
    throw new HttpError(404, 'Payment went through but we could not match it to an order. Please contact us with this reference: ' + captureId);
  }

  // A card capture can come back COMPLETED at the order level while the
  // capture itself is PENDING (bank review). Treat that as paid — PayPal will
  // send PAYMENT.CAPTURE.DENIED if it falls through — but keep the status so
  // an admin can see why a refund is refused until it settles.
  if (status === 'COMPLETED') {
    // CAS: only mark PAID once.
    const cas = await prisma.order.updateMany({
      where: { id: payment.orderId, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'CAPTURED', status: 'PAID' },
    });
    if (cas.count > 0) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CAPTURED',
          providerRef: captureId,
          rawPayload: data,
        },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'payment',
          fromStatus: 'PENDING',
          toStatus: 'CAPTURED',
          message: `PayPal capture ${captureId} completed${captureStatus && captureStatus !== 'COMPLETED' ? ` (capture status: ${captureStatus})` : ''}`,
        },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'status',
          fromStatus: 'PENDING',
          toStatus: 'PAID',
          message: 'Order marked PAID after successful capture',
        },
      });
      // Fire confirmation email. Failures are logged as events by the lib.
      void sendOrderConfirmationEmail(payment.orderId);
      // If this order was submitted by a partner, fire order.paid so the
      // partner's system learns about the capture without polling.
      if (payment.order.partnerId) {
        const refreshed = await prisma.order.findUnique({
          where: { id: payment.orderId },
          select: {
            id: true, number: true, status: true, paymentStatus: true,
            externalRef: true, totalCents: true, projectId: true,
            shippingMethod: true, trackingNumber: true,
          },
        });
        if (refreshed) {
          void dispatchPartnerWebhook({
            partnerId: payment.order.partnerId,
            event: 'order.paid',
            orderId: refreshed.id,
            payload: refreshed,
          }).catch(() => undefined);
        }
      }
    } else if (payment.status === 'CAPTURED' && payment.providerRef === paypalOrderId) {
      // The webhook flipped the order first but only knew the PayPal order
      // id. Store the real capture id so a refund targets the right thing.
      await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: captureId, rawPayload: data } });
    }
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', rawPayload: data },
    });
    console.error('[paypal] capture returned non-COMPLETED status', { paypalOrderId, status, captureStatus });
    throw new HttpError(402, `PayPal did not complete the payment (status ${status}). No charge was made — please try again.`, {
      issue: status, stage: 'capture',
    });
  }

  return {
    orderId: customId ?? payment.orderId,
    orderNumber: payment.order.number,
    paypalCaptureId: captureId,
    status,
  };
}
