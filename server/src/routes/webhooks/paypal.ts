import { Router } from 'express';
import { prisma } from '../../db.js';
import { getPayPalAccessToken, getPayPalConfig } from '../../lib/payments/paypal/config.js';

const router = Router();

/**
 * PayPal verifies a webhook by re-signing the payload server-side.
 * https://developer.paypal.com/api/rest/webhooks/rest/#verify-webhook-signature
 */
async function verifySignature(headers: Record<string, string | string[] | undefined>, body: any, webhookId: string): Promise<boolean> {
  if (!webhookId) return false;
  const cfg = await getPayPalConfig();
  const token = await getPayPalAccessToken();
  const verifyBody = {
    auth_algo: header(headers, 'paypal-auth-algo'),
    cert_url: header(headers, 'paypal-cert-url'),
    transmission_id: header(headers, 'paypal-transmission-id'),
    transmission_sig: header(headers, 'paypal-transmission-sig'),
    transmission_time: header(headers, 'paypal-transmission-time'),
    webhook_id: webhookId,
    webhook_event: body,
  };
  const res = await fetch(`${cfg.baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verifyBody),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === 'SUCCESS';
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

router.post('/', async (req, res) => {
  const cfg = await getPayPalConfig();
  if (!cfg.webhookId) {
    return res.status(503).json({ error: 'PayPal webhook ID not configured in admin settings' });
  }

  const valid = await verifySignature(req.headers as any, req.body, cfg.webhookId);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const evt = req.body as { event_type?: string; resource?: any; id?: string };
  const type = evt.event_type;
  const resource = evt.resource ?? {};

  // Most events carry the capture/order id either at resource.id or
  // resource.supplementary_data.related_ids.order_id.
  const captureId: string | undefined = resource.id;
  const paypalOrderId: string | undefined =
    resource.supplementary_data?.related_ids?.order_id ?? resource.id;

  // Find our local payment record by either the capture id or the order id.
  const payment = await prisma.payment.findFirst({
    where: {
      provider: 'paypal',
      OR: [
        captureId ? { providerRef: captureId } : undefined,
        paypalOrderId ? { providerRef: paypalOrderId } : undefined,
      ].filter(Boolean) as any,
    },
    include: { order: true },
  });

  if (!payment) {
    // Don't fail — PayPal will retry. Log for diagnostic and 200.
    console.warn(`[paypal-webhook] ${type}: no local payment for capture=${captureId} order=${paypalOrderId}`);
    return res.status(200).json({ ok: true, note: 'no matching local payment' });
  }

  switch (type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      // Defensive: the synchronous capture flow already marked PAID. Re-mark
      // only if still PENDING (idempotent CAS).
      await prisma.order.updateMany({
        where: { id: payment.orderId, paymentStatus: 'PENDING' },
        data: { paymentStatus: 'CAPTURED', status: 'PAID' },
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'CAPTURED', rawPayload: resource },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'payment',
          message: `PayPal webhook confirmed capture ${captureId}`,
        },
      });
      break;
    }
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', rawPayload: resource },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'payment',
          message: `PayPal denied capture: ${resource.status_details?.reason ?? 'unknown'}`,
        },
      });
      break;
    }
    case 'PAYMENT.CAPTURE.REFUNDED': {
      const refundedAmount = Number(resource.amount?.value ?? 0);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', rawPayload: resource },
      });
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'REFUNDED', status: 'REFUNDED' },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'payment',
          message: `Refunded $${refundedAmount.toFixed(2)} via PayPal`,
        },
      });
      break;
    }
    case 'PAYMENT.CAPTURE.REVERSED': {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', rawPayload: resource },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'payment',
          message: 'PayPal reversed the capture (chargeback)',
        },
      });
      break;
    }
    case 'CUSTOMER.DISPUTE.CREATED': {
      await prisma.orderStatusEvent.create({
        data: {
          orderId: payment.orderId,
          kind: 'note',
          message: `Dispute opened by buyer: ${resource.reason ?? 'unspecified'}`,
        },
      });
      break;
    }
    default:
      // Acknowledge but no-op for events we don't act on.
      console.info(`[paypal-webhook] ignoring ${type}`);
  }

  res.status(200).json({ ok: true });
});

export default router;
