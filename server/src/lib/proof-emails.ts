import { prisma } from '../db.js';
import { sendEmail } from './mailgun.js';
import { getSetting } from './settings.js';
import { proofSlotLabel } from './proofs.js';
import { ensureCustomerAccount, magicLink } from './customer-accounts.js';

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

/**
 * ONE email per batch of proofs, with ONE link: the customer's account, where
 * every proof for the order is reviewed and approved in one place. The link
 * signs them in (accounts made at checkout have no password yet), so there
 * is nothing to remember and no per-proof link to lose track of.
 */
export async function sendProofsReadyEmail(proofIds: string[]): Promise<EmailResult> {
  if (proofIds.length === 0) return { sent: false, error: 'no proofs' };
  const proofs = await prisma.proof.findMany({
    where: { id: { in: proofIds } },
    include: { order: true, orderItem: { select: { name: true, options: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (proofs.length === 0) return { sent: false, error: 'no proofs' };
  const order = proofs[0]!.order;
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const account = await ensureCustomerAccount(order.email);
  const link = await magicLink(account.id, `/account/proofs?order=${encodeURIComponent(order.number)}`);
  const n = proofs.length;
  const rows = proofs.map((p) => `<li style="margin:.35rem 0">${esc(proofSlotLabel(p.kind, p.orderItem))} <span style="color:#888">(v${p.version})</span></li>`).join('');
  const note = proofs.find((p) => p.message)?.message;
  const html = wrap(
    `<h2 style="color:#C61A22">${n === 1 ? 'Your proof is' : `${n} proofs are`} ready for your approval</h2>
     <p>Order <strong>${esc(order.number)}</strong> has ${n === 1 ? 'a proof' : `${n} proofs`} waiting for you. Review and approve ${n === 1 ? 'it' : 'each one'} in your account — <strong>nothing goes to print until every proof on the order is approved.</strong></p>
     <ul style="padding-left:1.1rem;margin:.75rem 0">${rows}</ul>
     ${note ? `<p style="border-left:3px solid #C61A22;padding:.25rem 1rem;color:#333">${esc(note)}</p>` : ''}
     ${btn(link, n === 1 ? 'Review & approve your proof' : 'Review & approve your proofs')}
     <p style="color:#666;font-size:.85rem">This link signs you in to your account, where all your orders and proofs live. You can also sign in any time at <a href="${base}/account/proofs" style="color:#666">${base}/account/proofs</a>${account.passwordSetAt ? '' : ' — set a password under Account → Password whenever you like'}.</p>`,
    name,
  );
  return trySend(
    order.id,
    { to: { email: order.email }, subject: `${n === 1 ? 'Proof' : `${n} proofs`} ready for your approval — order ${order.number}`, html, tags: [`order:${order.number}`, 'proof-ready'] },
    `${n} proof${n === 1 ? '' : 's'} emailed to ${order.email} (account link)`,
  );
}

export async function sendProofReadyEmail(proofId: string): Promise<EmailResult> {
  return sendProofsReadyEmail([proofId]);
}

export async function sendMediaRequestEmail(requestId: string) {
  const mr = await prisma.mediaRequest.findUnique({ where: { id: requestId }, include: { order: true } });
  if (!mr) return;
  const name = await storeName();
  const account = await ensureCustomerAccount(mr.order.email);
  const link = await magicLink(account.id, `/account/proofs?order=${encodeURIComponent(mr.order.number)}`);
  const html = wrap(
    `<h2 style="color:#C61A22">We need updated files for your order</h2>
     <p>For order <strong>${esc(mr.order.number)}</strong>, our team needs corrected artwork from you:</p>
     <blockquote style="border-left:3px solid #C61A22;margin:1rem 0;padding:.25rem 1rem;color:#333">${esc(mr.message)}</blockquote>
     ${btn(link, 'Upload the files in your account')}
     <p style="color:#666;font-size:.85rem">The link signs you in; the upload box is on your order under Proofs &amp; files.</p>`,
    name,
  );
  await trySend(
    mr.orderId,
    { to: { email: mr.order.email }, subject: `Action needed: updated files for order ${mr.order.number}`, html, tags: [`order:${mr.order.number}`, 'media-request'] },
    `Media request emailed to ${mr.order.email} (account link)`,
  );
}

/**
 * One confirmation, when the LAST proof on the order is approved. Approving
 * a single proof of several used to send an email each time; the account
 * page already shows each decision, so only the milestone is worth an email.
 */
export async function sendProofApprovedEmail(proofId: string): Promise<EmailResult> {
  const proof = await prisma.proof.findUnique({
    where: { id: proofId },
    include: { order: true, orderItem: { select: { name: true, options: true } } },
  });
  if (!proof) return { sent: false, error: 'proof not found' };
  if (proof.order.proofStatus !== 'approved') return { sent: false, error: 'order not fully approved yet' };
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const html = wrap(
    `<h2 style="color:#C61A22">All proofs approved — thank you!</h2>
     <p>Every proof on order <strong>${esc(proof.order.number)}</strong> is approved and the order is cleared for production. We'll email you again when it ships.</p>
     <p style="color:#666;font-size:.85rem">Last approval: ${esc(proofSlotLabel(proof.kind, proof.orderItem))} by ${esc(proof.approvedName ?? proof.order.email)}. Everything is in your account at <a href="${base}/account/orders" style="color:#666">${base}/account/orders</a>.</p>`,
    name,
  );
  return trySend(
    proof.orderId,
    { to: { email: proof.order.email }, subject: `All proofs approved — order ${proof.order.number} is cleared for production`, html, tags: [`order:${proof.order.number}`, 'proof-approved'] },
    'All-proofs-approved confirmation sent',
  );
}

/** Notify the store's own inbox when a customer requests changes or uploads. */
export async function notifyStaff(orderId: string, subject: string, body: string) {
  const to = (await getSetting<string>('store.email')) || (await getSetting<string>('contact.inboundEmail'));
  if (!to) { await logEvent(orderId, `(no store email set to notify: ${subject})`); return; }
  const name = await storeName();
  await trySend(orderId, { to: { email: to }, subject, html: wrap(`<p>${esc(body)}</p>`, name), tags: [`order-staff`] }, `Staff notified: ${subject}`);
}
