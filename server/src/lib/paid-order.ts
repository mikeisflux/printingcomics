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
export async function settlePaidOrder(orderId: string): Promise<void> {
  await consumeStockForOrder(orderId).catch((e: any) => console.warn('[inventory] consume failed:', e?.message ?? e));
  await redeemCouponForOrder(orderId).catch((e: any) => console.warn('[coupons] redeem failed:', e?.message ?? e));
}
