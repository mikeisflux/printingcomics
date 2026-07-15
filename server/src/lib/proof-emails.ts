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

const btn = (href: string, label: string) =>
  `<p style="margin:1.5rem 0"><a href="${href}" style="background:#C61A22;color:#fff;padding:.75rem 1.3rem;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">${label}</a></p>`;

const wrap = (inner: string, name: string) =>
  `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;color:#1a1a1a;line-height:1.5">${inner}<p style="margin-top:2rem;color:#666;font-size:.9rem">— ${esc(name)}</p></div>`;

async function logEvent(orderId: string, message: string) {
  await prisma.orderStatusEvent.create({ data: { orderId, kind: 'email', message } }).catch(() => undefined);
}

/** Resilient send — never throws (Mailgun may be unconfigured); logs outcome. */
async function trySend(orderId: string, args: Parameters<typeof sendEmail>[0], okMsg: string) {
  try {
    const { providerRef } = await sendEmail(args);
    await logEvent(orderId, `${okMsg}${providerRef ? ` (${providerRef})` : ''}`);
  } catch (e: any) {
    await logEvent(orderId, `Email failed: ${e?.message ?? 'unknown error'}`);
  }
}

export async function sendProofReadyEmail(proofId: string) {
  const proof = await prisma.proof.findUnique({ where: { id: proofId }, include: { order: true } });
  if (!proof) return;
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const link = `${base}/proof/${proof.token}`;
  const html = wrap(
    `<h2 style="color:#C61A22">Your proof is ready to review</h2>
     <p>We've prepared a proof for order <strong>${esc(proof.order.number)}</strong>. Please review it carefully and approve it — <strong>nothing goes to print until you approve.</strong></p>
     ${proof.message ? `<p style="border-left:3px solid #C61A22;padding:.25rem 1rem;color:#333">${esc(proof.message)}</p>` : ''}
     ${btn(link, 'Review your proof')}
     <p style="color:#666;font-size:.85rem">Or paste this link into your browser:<br>${link}</p>`,
    name,
  );
  await trySend(
    proof.orderId,
    { to: { email: proof.order.email }, subject: `Proof ready for approval — order ${proof.order.number}`, html, tags: [`order:${proof.order.number}`, 'proof-ready'] },
    `Proof v${proof.version} emailed to ${proof.order.email}`,
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
     <p style="color:#666;font-size:.85rem">Or paste this link into your browser:<br>${link}</p>`,
    name,
  );
  await trySend(
    mr.orderId,
    { to: { email: mr.order.email }, subject: `Action needed: updated files for order ${mr.order.number}`, html, tags: [`order:${mr.order.number}`, 'media-request'] },
    `Media request emailed to ${mr.order.email}`,
  );
}

export async function sendProofApprovedEmail(proofId: string) {
  const proof = await prisma.proof.findUnique({ where: { id: proofId }, include: { order: true } });
  if (!proof) return;
  const name = await storeName();
  const html = wrap(
    `<h2 style="color:#C61A22">Proof approved — thank you!</h2>
     <p>Your proof for order <strong>${esc(proof.order.number)}</strong> is approved, and your order is now cleared for production.</p>
     <p style="color:#666;font-size:.85rem">Approved by ${esc(proof.approvedName ?? proof.order.email)}.</p>`,
    name,
  );
  await trySend(
    proof.orderId,
    { to: { email: proof.order.email }, subject: `Proof approved — order ${proof.order.number}`, html, tags: [`order:${proof.order.number}`, 'proof-approved'] },
    `Proof v${proof.version} approval confirmation sent`,
  );
}

/** Notify the store's own inbox when a customer requests changes or uploads. */
export async function notifyStaff(orderId: string, subject: string, body: string) {
  const to = (await getSetting<string>('store.email')) || (await getSetting<string>('contact.inboundEmail'));
  if (!to) { await logEvent(orderId, `(no store email set to notify: ${subject})`); return; }
  const name = await storeName();
  await trySend(orderId, { to: { email: to }, subject, html: wrap(`<p>${esc(body)}</p>`, name), tags: [`order-staff`] }, `Staff notified: ${subject}`);
}
