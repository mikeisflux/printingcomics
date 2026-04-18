import { Router } from 'express';
import { prisma } from '../../db.js';
import { ssFetchShipment } from '../../lib/shipstation.js';
import { sendShippingNotificationEmail } from '../../lib/order-emails.js';

const router = Router();

/**
 * ShipStation webhook receiver.
 *   POST /api/webhooks/shipstation
 *
 * ShipStation POSTs a tiny envelope:
 *   { "resource_url": "...", "resource_type": "SHIP_NOTIFY" | "ORDER_NOTIFY" | ... }
 *
 * For SHIP_NOTIFY we GET the resource_url (which returns a paged shipments
 * list filtered to just-shipped items) and update the matching local Order
 * with tracking + carrier + ship date, then transition status to SHIPPED
 * (which fires the customer email via the admin order PATCH path).
 *
 * Webhook is unsigned by ShipStation v1 — verify by source IP at the proxy
 * if you want stronger auth.
 */
router.post('/', async (req, res) => {
  const body = req.body as { resource_url?: string; resource_type?: string };
  if (!body?.resource_url || !body?.resource_type) {
    return res.status(400).json({ error: 'Missing resource_url / resource_type' });
  }

  if (body.resource_type !== 'SHIP_NOTIFY' && body.resource_type !== 'ITEM_SHIP_NOTIFY') {
    // Acknowledge other event types (ORDER_NOTIFY etc.) without acting.
    return res.status(200).json({ ok: true, ignored: body.resource_type });
  }

  let payload: any;
  try {
    payload = await ssFetchShipment(body.resource_url);
  } catch (e: any) {
    console.warn('[shipstation-webhook] failed to fetch shipment:', e.message);
    return res.status(200).json({ ok: true, note: 'fetch failed' });
  }

  const shipments: any[] = Array.isArray(payload?.shipments) ? payload.shipments : [];
  for (const s of shipments) {
    const orderNumber: string | undefined = s.orderNumber;
    const trackingNumber: string | undefined = s.trackingNumber;
    const carrierCode: string | undefined = s.carrierCode;
    const serviceCode: string | undefined = s.serviceCode;

    if (!orderNumber) continue;

    const local = await prisma.order.findUnique({ where: { number: orderNumber } });
    if (!local) {
      console.warn(`[shipstation-webhook] no local order ${orderNumber}`);
      continue;
    }

    const updated = await prisma.order.update({
      where: { id: local.id },
      data: {
        trackingNumber: trackingNumber ?? local.trackingNumber,
        shippingMethod: serviceCode
          ? `${carrierCode ?? ''} ${serviceCode}`.trim()
          : local.shippingMethod,
        status: 'SHIPPED',
      },
    });

    await prisma.orderStatusEvent.create({
      data: {
        orderId: local.id,
        kind: 'fulfillment',
        fromStatus: local.status,
        toStatus: 'SHIPPED',
        message: `Shipped via ShipStation (${carrierCode ?? '?'} / ${serviceCode ?? '?'})${trackingNumber ? ` — tracking ${trackingNumber}` : ''}`,
      },
    });

    if (updated.trackingNumber) void sendShippingNotificationEmail(updated.id);
  }

  res.status(200).json({ ok: true, processed: shipments.length });
});

export default router;
