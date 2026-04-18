import { prisma } from '../../../db.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';

export interface RefundInput {
  captureId: string;
  amountCents?: number;
  note?: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
  refundedCents: number;
}

/**
 * Refunds a prior PayPal capture via `POST /v2/payments/captures/{id}/refund`.
 * Omit `amountCents` to issue a full refund.
 */
export async function refundPaypalCapture(input: RefundInput): Promise<RefundResult> {
  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();

  const body: Record<string, unknown> = {
    note_to_payer: input.note,
  };
  if (input.amountCents && input.amountCents > 0) {
    body.amount = {
      value: (input.amountCents / 100).toFixed(2),
      currency_code: 'USD',
    };
  }

  const res = await fetch(`${config.baseUrl}/v2/payments/captures/${input.captureId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `refund_${input.captureId}_${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal refund failed: ${text}`);
  }

  const data = (await res.json()) as any;
  const refundedCents = input.amountCents ?? Math.round(Number(data.amount?.value ?? 0) * 100);
  const refundId: string = data.id;
  const status: string = data.status;

  // Flip the local payment + order record.
  const payment = await prisma.payment.findFirst({ where: { providerRef: input.captureId } });
  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', rawPayload: data },
    });
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'REFUNDED', status: 'REFUNDED' },
    });
  }

  return { refundId, status, refundedCents };
}
