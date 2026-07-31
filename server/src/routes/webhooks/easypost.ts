import { Router, raw } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../../db.js';
import { requestReviewForOrder } from '../../lib/reviews.js';
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
  const easypostShipmentId: string | undefined = tracker?.shipment_id;
  const status: string = String(tracker?.status ?? '').toLowerCase();
  const trackingCode: string | null = tracker?.tracking_code ?? null;
  if (!easypostShipmentId) return;

  const shipment = await prisma.shipment.findUnique({
    where: { easypostId: easypostShipmentId },
    include: { order: { include: { shipments: true } } },
  });
  if (!shipment) return;

  // Update this Shipment row.
  let newShipmentStatus = shipment.status;
  if (status === 'delivered') newShipmentStatus = 'DELIVERED';
  else if (status === 'in_transit' || status === 'out_for_delivery' || status === 'pre_transit') newShipmentStatus = 'IN_TRANSIT';

  const shipmentPatch: Record<string, unknown> = {};
  if (trackingCode && trackingCode !== shipment.trackingCode) shipmentPatch.trackingCode = trackingCode;
  if (newShipmentStatus !== shipment.status) shipmentPatch.status = newShipmentStatus;
  if (Object.keys(shipmentPatch).length > 0) {
    await prisma.shipment.update({ where: { id: shipment.id }, data: shipmentPatch });
  }

  // Aggregate up to the order. If every shipment on the order is DELIVERED,
  // mark the order DELIVERED. Otherwise if any shipment is IN_TRANSIT /
  // PURCHASED and the order isn't already shipped, flip it to SHIPPED.
  const allShipments = shipment.order.shipments.map((s) =>
    s.id === shipment.id ? { ...s, ...shipmentPatch } : s,
  );
  const nonTerminal = allShipments.filter((s) => s.status !== 'REFUNDED' && s.status !== 'VOIDED');
  let newOrderStatus = shipment.order.status;
  if (nonTerminal.length > 0 && nonTerminal.every((s) => s.status === 'DELIVERED')) {
    newOrderStatus = 'DELIVERED';
  } else if (nonTerminal.some((s) => s.status === 'IN_TRANSIT' || s.status === 'PURCHASED') && shipment.order.status !== 'DELIVERED') {
    newOrderStatus = 'SHIPPED';
  }

  const orderPatch: Record<string, unknown> = {};
  if (trackingCode && trackingCode !== shipment.order.trackingNumber) orderPatch.trackingNumber = trackingCode;
  if (newOrderStatus !== shipment.order.status) orderPatch.status = newOrderStatus;

  if (Object.keys(orderPatch).length > 0) {
    await prisma.order.update({ where: { id: shipment.orderId }, data: orderPatch });
  }

  // Carrier confirmed delivery — ask the customer for a review. This is the
  // path real deliveries take (the admin status dropdown is the manual
  // fallback). Idempotent per order, and never throws.
  if (newOrderStatus === 'DELIVERED' && shipment.order.status !== 'DELIVERED') {
    void requestReviewForOrder(shipment.orderId);
  }

  await prisma.orderStatusEvent.create({
    data: {
      orderId: shipment.orderId,
      kind: 'fulfillment',
      fromStatus: shipment.order.status,
      toStatus: (orderPatch.status as string | undefined) ?? shipment.order.status,
      message: `EasyPost tracker for shipment ${shipment.id}: ${status}${trackingCode ? ` — ${trackingCode}` : ''}`,
    },
  });

  if (orderPatch.status === 'SHIPPED' && trackingCode) {
    void sendShippingNotificationEmail(shipment.orderId);
  }
}

export default router;
