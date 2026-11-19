/**
 * Shipping a wholesale order is shared work: we ship the titles we print or
 * hold, the publisher ships theirs from the purchase order. Each side records
 * a Shipment on the shop's order for its own lines; the order is SHIPPED
 * once every line has one, and the shop gets the tracking email then.
 */
import { prisma } from '../../db.js';
import type { Actor } from './events.js';
import { notifyRetailerSystem } from './integration.js';

/** The publisher shipped a purchase order: a shipment lands on every shop order that holds its lines. */
export async function recordPublisherShipment(purchaseOrderId: string, how: { carrier: string | null; trackingCode: string | null }, actor: Actor): Promise<{ ordersShipped: number; ordersWaiting: number }> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { id: true, number: true, cycleId: true, lines: true } });
  if (!po) return { ordersShipped: 0, ordersWaiting: 0 };
  const listingIds = ((po.lines as { listingId: string }[]) ?? []).map((l) => l.listingId);
  if (!listingIds.length) return { ordersShipped: 0, ordersWaiting: 0 };
  const orders = await prisma.order.findMany({
    where: { cycleId: po.cycleId, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] }, items: { some: { listingId: { in: listingIds } } } },
    include: { items: { select: { id: true, listingId: true, quantity: true, shipmentItems: { select: { id: true } } } } },
  });
  let ordersShipped = 0;
  let ordersWaiting = 0;
  for (const o of orders) {
    const mine = o.items.filter((it) => it.listingId && listingIds.includes(it.listingId) && it.shipmentItems.length === 0);
    if (mine.length === 0) continue;
    await prisma.shipment.create({ data: { orderId: o.id, carrier: how.carrier ?? 'Publisher', service: `Purchase order ${po.number}`, trackingCode: how.trackingCode, status: 'SHIPPED', items: { create: mine.map((it) => ({ orderItemId: it.id, quantity: it.quantity })) } } });
    await prisma.orderStatusEvent.create({ data: { orderId: o.id, kind: 'tracking', message: `${mine.length} line(s) shipped by the publisher (${po.number})${how.trackingCode ? ` · ${how.trackingCode}` : ''}`, actorId: actor.id, actorName: actor.name } });
    notifyRetailerSystem(o.retailerId, 'shipment.created', o.id);
    const done = await markShippedWhenComplete(o.id, how.trackingCode);
    if (done) ordersShipped++; else ordersWaiting++;
    void done;
  }
  return { ordersShipped, ordersWaiting };
}

/**
 * SHIPPED once every line on the order has a shipment. The order's tracking
 * number is the newest one recorded; the shop's tracking email goes then.
 */
export async function markShippedWhenComplete(orderId: string, trackingCode: string | null, opts: { notify?: boolean } = {}): Promise<{ mail: { sent: boolean; error?: string } | null } | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { select: { id: true, shipmentItems: { select: { id: true } } } } } });
  if (!o || o.status === 'CANCELLED' || o.status === 'REFUNDED' || o.status === 'SHIPPED' || o.status === 'DELIVERED') return null;
  if (o.items.some((it) => it.shipmentItems.length === 0)) return null;
  await prisma.order.update({ where: { id: o.id }, data: { status: 'SHIPPED', trackingNumber: trackingCode ?? o.trackingNumber, events: { create: { kind: 'status', fromStatus: o.status, toStatus: 'SHIPPED', message: 'Every line has shipped' } } } });
  notifyRetailerSystem(o.retailerId, 'order.shipped', o.id);
  if (opts.notify === false) return { mail: null };
  const { sendShippingNotificationEmail } = await import('../order-emails.js');
  const mail = await sendShippingNotificationEmail(o.id).then((sent) => (sent ? { sent: true } : { sent: false, error: 'no tracking number to send' })).catch((e: any) => ({ sent: false, error: e?.message }));
  return { mail };
}
