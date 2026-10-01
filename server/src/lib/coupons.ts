import { prisma } from '../db.js';

export type Coupon = NonNullable<Awaited<ReturnType<typeof prisma.coupon.findUnique>>>;

export interface CouponEvaluation {
  /** True when the code is valid for this subtotal and yields a discount. */
  ok: boolean;
  /** The coupon row, if the code matched one (even when otherwise invalid). */
  coupon: Coupon | null;
  /** Taken off the goods (the subtotal), in cents (0 when not ok). */
  discountCents: number;
  /**
   * Taken off the shipping charge, in cents (0 when not ok, when the code
   * leaves shipping alone, or when no shipping charge was given).
   */
  shippingDiscountCents: number;
  /** Human-readable reason the code was rejected (undefined when ok). */
  reason?: string;
}

/**
 * Central source of truth for discount-code rules. The cart checkout, partner
 * pricing quote, and partner order endpoints all run codes through here so
 * they agree on validity and the discount amount.
 *
 * The discount is computed against `subtotalCents`, which already reflects the
 * site-wide discount baked into each line's unit price — so a coupon always
 * stacks ON TOP of the site-wide discount.
 *
 * A code that "applies to shipping" takes the same percentage off the
 * shipping charge, or whatever is left of a fixed amount after the goods —
 * so a 100% code makes the whole order free, shipping included, and the
 * customer is never asked to pay anything.
 */
export async function evaluateCoupon(
  code: string | null | undefined,
  subtotalCents: number,
  opts: { shippingCents?: number; now?: Date } = {},
): Promise<CouponEvaluation> {
  const now = opts.now ?? new Date();
  const shippingCents = Math.max(0, opts.shippingCents ?? 0);
  const rejected = (coupon: Coupon | null, reason: string): CouponEvaluation =>
    ({ ok: false, coupon, discountCents: 0, shippingDiscountCents: 0, reason });

  const trimmed = code?.trim();
  if (!trimmed) return rejected(null, 'Enter a code.');

  const coupon = await prisma.coupon.findUnique({ where: { code: trimmed.toUpperCase() } });
  if (!coupon) return rejected(null, 'That code isn’t valid.');
  if (!coupon.active) return rejected(coupon, 'That code is no longer active.');
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) return rejected(coupon, 'That code has expired.');
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) return rejected(coupon, 'That code has reached its usage limit.');
  if (subtotalCents < coupon.minSubtotalCents) {
    const min = (coupon.minSubtotalCents / 100).toFixed(2);
    return rejected(coupon, `Order subtotal must be at least $${min} to use this code.`);
  }

  const split = splitDiscount(coupon, subtotalCents, shippingCents);
  if (split.discountCents + split.shippingDiscountCents <= 0) return rejected(coupon, 'That code has no discount value.');

  return { ok: true, coupon, ...split };
}

/** How much of a code comes off the goods and how much off shipping. */
export function splitDiscount(
  coupon: { percentOffBps: number | null; amountOffCents: number | null; appliesToShipping: boolean },
  subtotalCents: number,
  shippingCents: number,
): { discountCents: number; shippingDiscountCents: number } {
  const pct = coupon.percentOffBps ?? 0;
  const amt = coupon.amountOffCents ?? 0;

  const pctGoods = pct > 0 ? Math.floor((subtotalCents * pct) / 10_000) : 0;
  const amtGoods = Math.min(amt, Math.max(0, subtotalCents - pctGoods));
  const discountCents = Math.min(subtotalCents, pctGoods + amtGoods);

  let shippingDiscountCents = 0;
  if (coupon.appliesToShipping && shippingCents > 0) {
    const pctShip = pct > 0 ? Math.floor((shippingCents * pct) / 10_000) : 0;
    // A fixed amount pays for the goods first; what is left goes to shipping.
    const amtShip = Math.min(amt - amtGoods, Math.max(0, shippingCents - pctShip));
    shippingDiscountCents = Math.min(shippingCents, pctShip + amtShip);
  }
  return { discountCents, shippingDiscountCents };
}

/**
 * Record a successful redemption. Called once per order that actually applied
 * the coupon, so usageLimit is enforced against a live count.
 */
export async function incrementCouponUsage(couponId: string): Promise<void> {
  await prisma.coupon.update({
    where: { id: couponId },
    data: { usageCount: { increment: 1 } },
  });
}

/**
 * Count the order's discount code as used — once the order is PAID, not when
 * it is created. PayPal's button calls order creation afresh on every click,
 * so counting at creation burned a one-use code on the first closed popup
 * and silently charged full price on the retry.
 */
export async function redeemCouponForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { couponCode: true } });
  if (!order?.couponCode) return;
  await prisma.coupon.updateMany({ where: { code: order.couponCode }, data: { usageCount: { increment: 1 } } });
}
