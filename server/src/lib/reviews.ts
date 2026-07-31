/**
 * Post-delivery review requests.
 *
 * When an order reaches DELIVERED we create a Review row in `invited` state
 * with an unguessable token and email the customer a link. They fill it in
 * without an account; nothing shows on the storefront until staff approve it.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { getSetting } from './settings.js';
import { sendReviewRequestEmail } from './review-emails.js';

export function reviewToken(): string {
  return randomBytes(24).toString('hex');
}

/** Absolute customer link for a review token, or null without a public URL. */
export async function reviewUrl(token: string): Promise<string | null> {
  const u = (await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || '';
  const base = u.replace(/\/$/, '');
  return base ? `${base}/review/${token}` : null;
}

/** Statuses a review can be in. */
export const REVIEW_STATUSES = ['invited', 'pending', 'approved', 'rejected'] as const;

/**
 * Ask for a review on a delivered order. Idempotent — an order only ever gets
 * one invite, so re-delivering (or a webhook firing twice) can't spam anyone.
 * Never throws: a failed review email must not disrupt order status changes.
 */
export async function requestReviewForOrder(orderId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const enabled = await getSetting<boolean | string>('reviews.autoRequest');
    // Default ON — the whole point is that it happens without staff action.
    if (enabled === false || enabled === 'false') return { sent: false, reason: 'auto-request disabled' };

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, email: true, number: true, shippingAddress: true, review: { select: { id: true } } },
    });
    if (!order) return { sent: false, reason: 'order not found' };
    if (order.review) return { sent: false, reason: 'already requested' };
    if (!order.email) return { sent: false, reason: 'order has no email' };

    const ship = order.shippingAddress as { firstName?: string; lastName?: string } | null;
    const customerName = [ship?.firstName, ship?.lastName].filter(Boolean).join(' ') || null;

    const review = await prisma.review.create({
      data: {
        orderId: order.id,
        email: order.email,
        customerName,
        token: reviewToken(),
        status: 'invited',
      },
    });

    const result = await sendReviewRequestEmail(review.id);
    await prisma.orderStatusEvent
      .create({
        data: {
          orderId: order.id,
          kind: 'email',
          message: result.sent
            ? `Review request emailed to ${order.email}`
            : `Review request could not be sent: ${result.error ?? 'unknown error'}`,
        },
      })
      .catch(() => undefined);
    return { sent: result.sent, reason: result.error };
  } catch (e: any) {
    return { sent: false, reason: e?.message ?? 'unknown error' };
  }
}

/** Approved reviews for the storefront, newest first with featured pinned. */
export async function publicReviews(limit = 12) {
  const rows = await prisma.review.findMany({
    where: { status: 'approved', rating: { not: null } },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { submittedAt: 'desc' }],
    take: Math.min(limit, 50),
    select: {
      id: true,
      customerName: true,
      rating: true,
      title: true,
      body: true,
      reply: true,
      submittedAt: true,
      featured: true,
    },
  });
  // Only ever expose a first name + last initial — never the full name or email.
  return rows.map((r) => ({ ...r, customerName: displayName(r.customerName) }));
}

/** "Jane Doe" → "Jane D." Keeps reviews personal without publishing identities. */
export function displayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Verified customer';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** Average + count across approved reviews, for storefront summary display. */
export async function reviewSummary() {
  const agg = await prisma.review.aggregate({
    where: { status: 'approved', rating: { not: null } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    count: agg._count._all,
    average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
  };
}
