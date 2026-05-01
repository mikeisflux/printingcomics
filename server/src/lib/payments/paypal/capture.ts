import { prisma } from '../../../db.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';
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
 */
export async function capturePaypalOrder(paypalOrderId: string): Promise<CaptureResult> {
  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();

  const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `capture_${paypalOrderId}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`PayPal capture failed: ${errBody}`);
  }

  const data = (await res.json()) as any;
  const status: string = data.status;
  const captureId: string = data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? paypalOrderId;
  const customId: string | undefined = data.purchase_units?.[0]?.custom_id;

  const payment = await prisma.payment.findFirst({
    where: { providerRef: paypalOrderId },
    include: { order: true },
  });
  if (!payment) throw new Error(`No local payment found for PayPal order ${paypalOrderId}`);

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
          message: `PayPal capture ${captureId} completed`,
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
    }
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', rawPayload: data },
    });
  }

  return {
    orderId: customId ?? payment.orderId,
    orderNumber: payment.order.number,
    paypalCaptureId: captureId,
    status,
  };
}
