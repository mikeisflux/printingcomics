import { Router, raw } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../../db.js';
import { getSetting } from '../../lib/settings.js';
import { sendShippingNotificationEmail } from '../../lib/order-emails.js';

/**
 * EasyPost webhook receiver.
 *
 * EasyPost signs webhook bodies with HMAC-SHA256 using a secret you configure
 * per-webhook in their dashboard. The signature is sent as `X-Hmac-Signature`,
 * hex-encoded, and computed over the **raw** request body using the Unicode
 * NFKD-normalized secret. We verify before trusting anything.
 *
 *   Docs: https://docs.easypost.com/docs/webhooks
 *
 * Interesting events (we act on these; others are logged and ignored):
 *   - tracker.updated   — status moved (pre_transit → in_transit → delivered)
 *   - tracker.created   — first tracker ping (often comes with purchase)
 */

const router = Router();

router.post(
  '/',
  raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    const secret = (await getSetting<string>('easypost.webhookSecret')) || '';
    const rawBody: Buffer = req.body as Buffer;
    const signature = (req.headers['x-hmac-signature'] as string | undefined) ?? '';

    if (secret) {
      const normalized = secret.normalize('NFKD');
      const expected = crypto.createHmac('sha256', normalized).update(rawBody).digest('hex');
      const ok = signature.length > 0 && signature.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!ok) {
        return res.status(401).json({ error: 'invalid signature' });
      }
    }

    let payload: any;
    try { payload = JSON.parse(rawBody.toString('utf8')); }
    catch { return res.status(400).json({ error: 'invalid json' }); }

    const description: string = payload?.description ?? '';
    const result = payload?.result ?? {};

    try {
      if (description === 'tracker.updated' || description === 'tracker.created') {
        await handleTrackerEvent(result);
      }
    } catch (e: any) {
      console.warn('[easypost-webhook] handler failed:', e.message);
    }
    res.json({ ok: true });
  },
);

async function handleTrackerEvent(tracker: any) {
  const shipmentId: string | undefined = tracker?.shipment_id;
  const status: string = String(tracker?.status ?? '').toLowerCase();
  const trackingCode: string | null = tracker?.tracking_code ?? null;
  if (!shipmentId) return;

  const order = await prisma.order.findFirst({
    where: { epShipmentId: shipmentId },
    select: { id: true, status: true, trackingNumber: true },
  });
  if (!order) return;

  let newStatus = order.status;
  if (status === 'delivered') newStatus = 'DELIVERED';
  else if (status === 'in_transit' || status === 'out_for_delivery' || status === 'pre_transit') newStatus = 'SHIPPED';

  const patch: Record<string, unknown> = {};
  if (trackingCode && trackingCode !== order.trackingNumber) patch.trackingNumber = trackingCode;
  if (newStatus !== order.status) patch.status = newStatus;
  if (Object.keys(patch).length === 0) return;

  await prisma.order.update({ where: { id: order.id }, data: patch });
  await prisma.orderStatusEvent.create({
    data: {
      orderId: order.id,
      kind: 'fulfillment',
      fromStatus: order.status,
      toStatus: (patch.status as string | undefined) ?? order.status,
      message: `EasyPost tracker: ${status}${trackingCode ? ` — ${trackingCode}` : ''}`,
    },
  });
  if (patch.status === 'SHIPPED' && trackingCode) {
    void sendShippingNotificationEmail(order.id);
  }
}

export default router;
