import { prisma } from '../../../db.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';

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
