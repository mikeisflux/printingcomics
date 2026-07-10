import { prisma } from '../db.js';

export type Coupon = NonNullable<Awaited<ReturnType<typeof prisma.coupon.findUnique>>>;

export interface CouponEvaluation {
  /** True when the code is valid for this subtotal and yields a discount. */
  ok: boolean;
  /** The coupon row, if the code matched one (even when otherwise invalid). */
  coupon: Coupon | null;
  /** Discount to subtract from the subtotal, in cents (0 when not ok). */
  discountCents: number;
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
 */
export async function evaluateCoupon(
  code: string | null | undefined,
  subtotalCents: number,
  now: Date = new Date(),
): Promise<CouponEvaluation> {
  const trimmed = code?.trim();
  if (!trimmed) {
    return { ok: false, coupon: null, discountCents: 0, reason: 'Enter a code.' };
  }

  const coupon = await prisma.coupon.findUnique({ where: { code: trimmed.toUpperCase() } });
  if (!coupon) {
    return { ok: false, coupon: null, discountCents: 0, reason: 'That code isn’t valid.' };
  }
  if (!coupon.active) {
    return { ok: false, coupon, discountCents: 0, reason: 'That code is no longer active.' };
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, coupon, discountCents: 0, reason: 'That code has expired.' };
  }
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, coupon, discountCents: 0, reason: 'That code has reached its usage limit.' };
  }
  if (subtotalCents < coupon.minSubtotalCents) {
    const min = (coupon.minSubtotalCents / 100).toFixed(2);
    return {
      ok: false,
      coupon,
      discountCents: 0,
      reason: `Order subtotal must be at least $${min} to use this code.`,
    };
  }

  let discount = 0;
  if (coupon.percentOffBps) discount += Math.floor((subtotalCents * coupon.percentOffBps) / 10_000);
  if (coupon.amountOffCents) discount += coupon.amountOffCents;
  discount = Math.min(discount, subtotalCents);

  if (discount <= 0) {
    return { ok: false, coupon, discountCents: 0, reason: 'That code has no discount value.' };
  }

  return { ok: true, coupon, discountCents: discount };
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
