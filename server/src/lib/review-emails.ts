import { prisma } from '../db.js';
import { sendEmail } from './mailgun.js';
import { getSetting } from './settings.js';

async function storeName(): Promise<string> {
  return (await getSetting<string>('store.name')) ?? 'Printing Comics';
}
async function baseUrl(): Promise<string> {
  const u = (await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || 'https://printingcomics.com';
  return u.replace(/\/$/, '');
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

const wrap = (inner: string, name: string) =>
  `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;color:#1a1a1a;line-height:1.5">${inner}<p style="margin-top:2rem;color:#666;font-size:.9rem">— ${esc(name)}</p></div>`;

/** One-click star row: each star deep-links to the form with that rating. */
function stars(link: string): string {
  const cells = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${link}?rating=${n}" style="text-decoration:none;font-size:2rem;color:#f5a623;padding:0 .15rem" title="${n} star${n > 1 ? 's' : ''}">★</a>`,
    )
    .join('');
  return `<p style="margin:1.25rem 0;text-align:center">${cells}</p>`;
}

export interface EmailResult { sent: boolean; to?: string; error?: string }

export async function sendReviewRequestEmail(reviewId: string): Promise<EmailResult> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { order: { select: { number: true } } },
  });
  if (!review) return { sent: false, error: 'review not found' };

  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const link = `${base}/review/${review.token}`;
  const first = (review.customerName ?? '').trim().split(/\s+/)[0];

  const html = wrap(
    `<h2 style="color:#C61A22">How did we do?</h2>
     <p>${first ? `Hi ${esc(first)}, y` : 'Y'}our order${review.order ? ` <strong>${esc(review.order.number)}</strong>` : ''} has been delivered — we'd love to know how it turned out.</p>
     <p>Tap a star to leave a quick review. It takes about thirty seconds, and it genuinely helps other creators decide who to print with.</p>
     ${stars(link)}
     <p style="text-align:center"><a href="${link}" style="background:#C61A22;color:#fff;padding:.75rem 1.3rem;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">Write a review</a></p>
     <p style="color:#666;font-size:.85rem">Or paste this link into your browser:<br><a href="${link}" style="color:#666;word-break:break-all">${link}</a></p>
     <p style="color:#666;font-size:.85rem">If something went wrong, reply to this email instead — we'd rather fix it than read about it.</p>`,
    name,
  );

  try {
    // Never click-track: a rewritten link that breaks kills the review.
    const { providerRef } = await sendEmail({
      to: { email: review.email, name: review.customerName ?? undefined },
      subject: `How did your order turn out?`,
      html,
      tags: ['review-request', ...(review.order ? [`order:${review.order.number}`] : [])],
      trackClicks: false,
    });
    void providerRef;
    return { sent: true, to: review.email };
  } catch (e: any) {
    return { sent: false, to: review.email, error: e?.message ?? 'unknown error' };
  }
}

/** Optional thank-you once staff approve a review. */
export async function sendReviewApprovedEmail(reviewId: string): Promise<EmailResult> {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return { sent: false, error: 'review not found' };
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const html = wrap(
    `<h2 style="color:#C61A22">Thanks for the review!</h2>
     <p>Your review is now live on our site${review.reply ? ' — we left you a reply, too' : ''}. We really appreciate you taking the time.</p>
     ${review.reply ? `<blockquote style="border-left:3px solid #C61A22;margin:1rem 0;padding:.25rem 1rem;color:#333">${esc(review.reply)}</blockquote>` : ''}
     <p><a href="${base}" style="color:#C61A22;font-weight:600">Visit the shop →</a></p>`,
    name,
  );
  try {
    await sendEmail({
      to: { email: review.email, name: review.customerName ?? undefined },
      subject: 'Your review is live — thank you',
      html,
      tags: ['review-approved'],
      trackClicks: false,
    });
    return { sent: true, to: review.email };
  } catch (e: any) {
    return { sent: false, to: review.email, error: e?.message ?? 'unknown error' };
  }
}
