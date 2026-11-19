import { consumeStockForOrder } from './inventory.js';
import { redeemCouponForOrder } from './coupons.js';

/**
 * Everything that follows an order becoming paid, whichever path got it
 * there — the browser's capture, the PayPal webhook, "check with PayPal", or
 * a $0 order placed without any payment: shelf stock comes off the pile and
 * the discount code, if one was used, counts one more redemption.
 *
 * Callers guard with the paid compare-and-set so this runs once per order.
 * Each step logs and swallows its own failure: a stock hiccup must never
 * undo a payment that already happened.
 */
/** The order status once its money arrives: PENDING becomes PAID; a wholesale order that already shipped stays shipped. */
export function paidStatusFor(status: string): string {
  return status === 'PENDING' || status === 'CANCELLED' ? 'PAID' : status;
}

/**
 * The "you paid" email for whichever kind of order this is: the storefront
 * confirmation, or the wholesale receipt for a shop. Every path that marks an
 * order paid (browser capture, PayPal webhook, staff mark-paid) sends through
 * here so a shop never gets the storefront's proofs-and-printing email.
 */
export async function sendPaidReceipt(orderId: string): Promise<void> {
  const { prisma } = await import('../db.js');
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { source: true, retailerId: true } });
  if (o?.source === 'retailer') {
    const { sendRetailerReceiptEmail } = await import('./pod/emails.js');
    const { notifyRetailerSystem } = await import('./pod/integration.js');
    notifyRetailerSystem(o.retailerId, 'order.paid', orderId);
    await sendRetailerReceiptEmail(orderId).catch((e: any) => console.warn('[pod] receipt failed:', e?.message ?? e));
  } else {
    const { sendOrderConfirmationEmail } = await import('./order-emails.js');
    await sendOrderConfirmationEmail(orderId).catch((e: any) => console.warn('[orders] confirmation failed:', e?.message ?? e));
  }
}

export async function settlePaidOrder(orderId: string): Promise<void> {
  // Wholesale orders pull consigned stock at the catalog's FOC lock (lib/pod/catalog.ts), not here.
  const { prisma } = await import('../db.js');
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { source: true } });
  if (o?.source !== 'retailer') await consumeStockForOrder(orderId).catch((e: any) => console.warn('[inventory] consume failed:', e?.message ?? e));
  await redeemCouponForOrder(orderId).catch((e: any) => console.warn('[coupons] redeem failed:', e?.message ?? e));
}
