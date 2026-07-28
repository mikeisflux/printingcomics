import { prisma } from '../db.js';
import { sendEmail } from './mailgun.js';
import { getSetting } from './settings.js';
import { proofKindLabel } from './proofs.js';

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

const btn = (href: string, label: string) =>
  `<p style="margin:1.5rem 0"><a href="${href}" style="background:#C61A22;color:#fff;padding:.75rem 1.3rem;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">${label}</a></p>`;

const wrap = (inner: string, name: string) =>
  `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;color:#1a1a1a;line-height:1.5">${inner}<p style="margin-top:2rem;color:#666;font-size:.9rem">— ${esc(name)}</p></div>`;

async function logEvent(orderId: string, message: string) {
  await prisma.orderStatusEvent.create({ data: { orderId, kind: 'email', message } }).catch(() => undefined);
}

export interface EmailResult { sent: boolean; to?: string; error?: string }

/**
 * Resilient send — never throws (Mailgun may be unconfigured); logs the
 * outcome AND reports it back so callers can surface "emailed" vs. "FAILED"
 * in the UI instead of silently appearing to have notified the customer.
 */
async function trySend(orderId: string, args: Parameters<typeof sendEmail>[0], okMsg: string): Promise<EmailResult> {
  try {
    // Never click-track these: the proof / upload link is the entire point of
    // the email, and a bad cert on the tracking domain hard-blocks the customer.
    const { providerRef } = await sendEmail({ trackClicks: false, ...args });
    await logEvent(orderId, `${okMsg}${providerRef ? ` (${providerRef})` : ''}`);
    return { sent: true, to: args.to?.email };
  } catch (e: any) {
    const error = e?.message ?? 'unknown error';
    await logEvent(orderId, `Email failed: ${error}`);
    return { sent: false, to: args.to?.email, error };
  }
}

export async function sendProofReadyEmail(proofId: string): Promise<EmailResult> {
  const proof = await prisma.proof.findUnique({
    where: { id: proofId },
    include: { order: true, orderItem: { select: { name: true } } },
  });
  if (!proof) return { sent: false, error: 'proof not found' };
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const link = `${base}/proof/${proof.token}`;
  const slotLabel = `${proofKindLabel(proof.kind)}${proof.orderItem ? ` — ${proof.orderItem.name}` : ''}`;
  const html = wrap(
    `<h2 style="color:#C61A22">Your ${esc(proofKindLabel(proof.kind).toLowerCase())} is ready to review</h2>
     <p>We've prepared the <strong>${esc(slotLabel)}</strong> for order <strong>${esc(proof.order.number)}</strong>. Please review it carefully and approve it — <strong>nothing goes to print until every proof on your order is approved.</strong></p>
     ${proof.message ? `<p style="border-left:3px solid #C61A22;padding:.25rem 1rem;color:#333">${esc(proof.message)}</p>` : ''}
     ${btn(link, 'Review this proof')}
     <p style="color:#666;font-size:.85rem">Or paste this link into your browser:<br><a href="${link}" style="color:#666;word-break:break-all">${link}</a></p>`,
    name,
  );
  return trySend(
    proof.orderId,
    { to: { email: proof.order.email }, subject: `${slotLabel} ready for approval — order ${proof.order.number}`, html, tags: [`order:${proof.order.number}`, 'proof-ready'] },
    `${slotLabel} v${proof.version} emailed to ${proof.order.email}`,
  );
}

/**
 * One email covering several proofs uploaded together — each row links to its
 * own review page. Beats sending the customer N separate proof emails for a
 * multi-item order.
 */
export async function sendProofsReadyEmail(proofIds: string[]): Promise<EmailResult> {
  if (proofIds.length === 0) return { sent: false, error: 'no proofs' };
  if (proofIds.length === 1) return sendProofReadyEmail(proofIds[0]!);
  const proofs = await prisma.proof.findMany({
    where: { id: { in: proofIds } },
    include: { order: true, orderItem: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (proofs.length === 0) return { sent: false, error: 'no proofs' };
  const order = proofs[0]!.order;
  const [name, base] = await Promise.all([storeName(), baseUrl()]);

  const rows = proofs
    .map((p) => {
      const label = `${proofKindLabel(p.kind)}${p.orderItem ? ` — ${p.orderItem.name}` : ''}`;
      const link = `${base}/proof/${p.token}`;
      return `<li style="margin:.5rem 0"><strong>${esc(label)}</strong> (v${p.version})<br>
        <a href="${link}" style="color:#C61A22;font-weight:600">Review &amp; approve →</a></li>`;
    })
    .join('');

  const html = wrap(
    `<h2 style="color:#C61A22">Your proofs are ready to review</h2>
     <p>We've prepared <strong>${proofs.length} proofs</strong> for order <strong>${esc(order.number)}</strong>.
        Please review and approve each one — <strong>nothing goes to print until every proof is approved.</strong></p>
     ${proofs[0]!.message ? `<p style="border-left:3px solid #C61A22;padding:.25rem 1rem;color:#333">${esc(proofs[0]!.message!)}</p>` : ''}
     <ul style="padding-left:1.1rem">${rows}</ul>`,
    name,
  );
  return trySend(
    order.id,
    { to: { email: order.email }, subject: `${proofs.length} proofs ready for approval — order ${order.number}`, html, tags: [`order:${order.number}`, 'proof-ready'] },
    `${proofs.length} proofs emailed to ${order.email}`,
  );
}

export async function sendMediaRequestEmail(requestId: string) {
  const mr = await prisma.mediaRequest.findUnique({ where: { id: requestId }, include: { order: true } });
  if (!mr) return;
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const link = `${base}/upload/${mr.token}`;
  const html = wrap(
    `<h2 style="color:#C61A22">We need updated files for your order</h2>
     <p>For order <strong>${esc(mr.order.number)}</strong>, our team needs corrected artwork from you:</p>
     <blockquote style="border-left:3px solid #C61A22;margin:1rem 0;padding:.25rem 1rem;color:#333">${esc(mr.message)}</blockquote>
     ${btn(link, 'Upload corrected files')}
     <p style="color:#666;font-size:.85rem">Or paste this link into your browser:<br><a href="${link}" style="color:#666;word-break:break-all">${link}</a></p>`,
    name,
  );
  await trySend(
    mr.orderId,
    { to: { email: mr.order.email }, subject: `Action needed: updated files for order ${mr.order.number}`, html, tags: [`order:${mr.order.number}`, 'media-request'] },
    `Media request emailed to ${mr.order.email}`,
  );
}

export async function sendProofApprovedEmail(proofId: string): Promise<EmailResult> {
  const proof = await prisma.proof.findUnique({
    where: { id: proofId },
    include: { order: true, orderItem: { select: { name: true } } },
  });
  if (!proof) return { sent: false, error: 'proof not found' };
  const name = await storeName();
  const slotLabel = `${proofKindLabel(proof.kind)}${proof.orderItem ? ` — ${proof.orderItem.name}` : ''}`;
  const cleared = proof.order.proofStatus === 'approved';
  const html = wrap(
    `<h2 style="color:#C61A22">${esc(slotLabel)} approved — thank you!</h2>
     <p>Your <strong>${esc(slotLabel)}</strong> for order <strong>${esc(proof.order.number)}</strong> is approved.</p>
     <p>${cleared
       ? 'Every proof on this order is now approved — your order is cleared for production.'
       : 'We’ll send any remaining proofs for this order shortly; production starts once every proof is approved.'}</p>
     <p style="color:#666;font-size:.85rem">Approved by ${esc(proof.approvedName ?? proof.order.email)}.</p>`,
    name,
  );
  return trySend(
    proof.orderId,
    { to: { email: proof.order.email }, subject: `${slotLabel} approved — order ${proof.order.number}`, html, tags: [`order:${proof.order.number}`, 'proof-approved'] },
    `${slotLabel} v${proof.version} approval confirmation sent`,
  );
}

/** Notify the store's own inbox when a customer requests changes or uploads. */
export async function notifyStaff(orderId: string, subject: string, body: string) {
  const to = (await getSetting<string>('store.email')) || (await getSetting<string>('contact.inboundEmail'));
  if (!to) { await logEvent(orderId, `(no store email set to notify: ${subject})`); return; }
  const name = await storeName();
  await trySend(orderId, { to: { email: to }, subject, html: wrap(`<p>${esc(body)}</p>`, name), tags: [`order-staff`] }, `Staff notified: ${subject}`);
}
