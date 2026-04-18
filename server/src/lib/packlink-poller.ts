import { prisma } from '../db.js';
import { plpFetchShipment } from './packlinkpro.js';
import { sendShippingNotificationEmail } from './order-emails.js';

/**
 * Polls Packlink Pro for status updates on every order that has been pushed
 * (has plpReference set) and isn't DELIVERED or CANCELLED yet. Runs every
 * POLL_INTERVAL_MS. Packlink has no outbound webhook so this is how we
 * learn about shipped/in-transit/delivered state changes.
 */
const POLL_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
let started = false;

export function startPacklinkPoller(intervalMs = POLL_INTERVAL_MS) {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          plpReference: { not: null },
          status: { notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED'] },
        },
        select: { id: true, plpReference: true, status: true, trackingNumber: true, shippingMethod: true },
      });
      for (const order of orders) {
        if (!order.plpReference) continue;
        try {
          const sh = await plpFetchShipment(order.plpReference);
          const state = (sh.state ?? '').toUpperCase();
          const tracking = sh.carrier_tracking_code ?? sh.tracking_codes?.[0] ?? null;
          const method = [sh.carrier_name, sh.service_name].filter(Boolean).join(' ') || null;

          let newStatus = order.status;
          if (state === 'DELIVERED') newStatus = 'DELIVERED';
          else if (state === 'IN_TRANSIT' || state === 'SHIPPED' || state === 'READY_TO_SHIP') newStatus = 'SHIPPED';

          const patch: Record<string, unknown> = {};
          if (tracking && tracking !== order.trackingNumber) patch.trackingNumber = tracking;
          if (method && method !== order.shippingMethod) patch.shippingMethod = method;
          if (newStatus !== order.status) patch.status = newStatus;
          if (Object.keys(patch).length === 0) continue;

          await prisma.order.update({ where: { id: order.id }, data: patch });
          await prisma.orderStatusEvent.create({
            data: {
              orderId: order.id,
              kind: 'fulfillment',
              fromStatus: order.status,
              toStatus: (patch.status as string | undefined) ?? order.status,
              message: `Packlink poll: ${state || 'update'}${tracking ? ` — tracking ${tracking}` : ''}`,
            },
          });
          if (patch.status === 'SHIPPED' && tracking) {
            void sendShippingNotificationEmail(order.id);
          }
        } catch (e: any) {
          console.warn(`[packlink-poller] ${order.plpReference}: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.warn('[packlink-poller] tick failed:', e.message);
    }
  };

  setInterval(() => { void tick(); }, intervalMs);
  // Don't run immediately — wait one interval so env has time to load.
}
