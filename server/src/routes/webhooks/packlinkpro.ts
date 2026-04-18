import { Router } from 'express';
import { prisma } from '../../db.js';
import { getPacklinkConfig } from '../../lib/settings.js';
import { sendShippingNotificationEmail } from '../../lib/order-emails.js';

const router = Router();

/**
 * Packlink Pro webhook receiver.
 *   POST /api/webhooks/packlinkpro
 *
 * Packlink delivers a JSON payload when a shipment state changes:
 *   {
 *     "event": "shipment.state_changed" | "shipment.tracking_updated" | ...,
 *     "reference": "PL-ABC123",
 *     "state": "SHIPPED" | "DELIVERED" | ...,
 *     "tracking_code": "...",
 *     "carrier_name": "...",
 *     "service_name": "...",
 *     "additional_data": { "order_number": "PC-00042" }
 *   }
 *
 * Verify with a shared secret passed as ?token=<secret> (configured in
 * admin → settings → Packlink Pro → Webhook secret). Packlink doesn't
 * sign payloads by default so a pre-shared token is the standard trick.
 */
router.post('/', async (req, res) => {
  const cfg = await getPacklinkConfig();
  if (cfg.webhookSecret) {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (token !== cfg.webhookSecret) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }
  }

  const body = req.body as {
    event?: string;
    reference?: string;
    state?: string;
    tracking_code?: string;
    carrier_tracking_code?: string;
    carrier_name?: string;
    service_name?: string;
    additional_data?: { order_number?: string };
  };

  const orderNumber = body.additional_data?.order_number;
  if (!orderNumber) {
    return res.status(200).json({ ok: true, note: 'no order_number in payload' });
  }

  const local = await prisma.order.findUnique({ where: { number: orderNumber } });
  if (!local) return res.status(200).json({ ok: true, note: `no local order ${orderNumber}` });

  const state = (body.state ?? '').toUpperCase();
  const isShipped = state === 'SHIPPED' || state === 'IN_TRANSIT' || state === 'DELIVERED';
  const tracking = body.carrier_tracking_code ?? body.tracking_code;

  const patch: Record<string, unknown> = {};
  if (tracking) patch.trackingNumber = tracking;
  if (body.carrier_name || body.service_name) {
    patch.shippingMethod = [body.carrier_name, body.service_name].filter(Boolean).join(' ');
  }
  if (isShipped && local.status !== 'SHIPPED') {
    patch.status = state === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED';
  }

  if (Object.keys(patch).length > 0) {
    const updated = await prisma.order.update({ where: { id: local.id }, data: patch });
    await prisma.orderStatusEvent.create({
      data: {
        orderId: local.id,
        kind: 'fulfillment',
        fromStatus: local.status,
        toStatus: (patch.status as string | undefined) ?? local.status,
        message: `Packlink Pro: ${state || body.event || 'update'}${tracking ? ` — tracking ${tracking}` : ''}`,
      },
    });
    if (patch.status === 'SHIPPED' && updated.trackingNumber) {
      void sendShippingNotificationEmail(updated.id);
    }
  }

  res.status(200).json({ ok: true });
});

export default router;
