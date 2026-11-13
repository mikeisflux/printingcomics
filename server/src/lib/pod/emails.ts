/**
 * Distribution mail: publishers hear about reviews and purchase orders,
 * shops hear about their account and orders, staff hear about new
 * applications and submissions.
 */
import { prisma } from '../../db.js';
import { sendEmail } from '../mailgun.js';
import { baseUrl, btn, esc, storeName, wrap } from '../proof-emails.js';
import { magicLink } from '../customer-accounts.js';
import { getPodSettings } from './settings.js';
import { getSetting } from '../settings.js';
import { LISTING_STATUS_LABELS, type ListingStatusKey } from './catalog.js';

export interface MailResult { sent: boolean; to?: string; error?: string }

async function trySend(args: Parameters<typeof sendEmail>[0]): Promise<MailResult> {
  try {
    await sendEmail({ trackClicks: false, ...args });
    return { sent: true, to: args.to.email };
  } catch (e: any) {
    return { sent: false, to: args.to.email, error: e?.message ?? String(e) };
  }
}

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function staffAddress(): Promise<string | null> {
  const s = await getPodSettings();
  return s.notifyEmail || ((await getSetting<string>('store.email', '')) || null);
}

/** A publisher's listing changed state at review. */
export async function sendListingStatusEmail(listingId: string, to: ListingStatusKey, note?: string | null): Promise<MailResult> {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { partner: { include: { members: { select: { email: true, firstName: true }, take: 1 } } }, cycle: true } });
  if (!l) return { sent: false, error: 'Listing not found' };
  const email = l.partner.contactEmail || l.partner.members[0]?.email;
  if (!email) return { sent: false, error: 'The publisher has no contact email' };
  const name = await storeName();
  const base = await baseUrl();
  const label = LISTING_STATUS_LABELS[to];
  const lead = to === 'APPROVED' ? `Good news — <strong>${esc(l.title)}</strong> is approved${l.cycle ? ` for the ${esc(l.cycle.name)} catalog` : ''}.`
    : to === 'CHANGES_REQUESTED' ? `We need a few changes to <strong>${esc(l.title)}</strong> before it can go in the catalog.`
    : to === 'REJECTED' ? `We were not able to accept <strong>${esc(l.title)}</strong> for the catalog.`
    : to === 'LIVE' ? `<strong>${esc(l.title)}</strong> is live in the ${esc(l.cycle?.name ?? '')} catalog and open for retailer orders.`
    : `<strong>${esc(l.title)}</strong> is now ${esc(label.toLowerCase())}.`;
  const html = wrap(`
    <h2 style="margin:0 0 .5rem">${esc(label)}: ${esc(l.title)}</h2>
    <p>${lead}</p>
    ${note ? `<blockquote style="border-left:3px solid #1e74fc;margin:1rem 0;padding:.5rem 1rem;background:#f4f7fb">${esc(note).replace(/\n/g, '<br>')}</blockquote>` : ''}
    <p style="margin-top:1.5rem">${btn(`${base}/partner/listings/${l.id}`, 'Open the listing')}</p>
    <p style="color:#666;font-size:.9rem">Catalog id ${esc(l.catalogKey)} · ${esc(l.partner.name)}</p>
  `, name);
  return trySend({ to: { email }, subject: `${label}: ${l.title} — ${name} Distribution`, html, tags: ['pod-listing'] });
}

/** Staff: a publisher submitted a listing for review. */
export async function notifyStaffListingSubmitted(listingId: string): Promise<MailResult> {
  const to = await staffAddress();
  if (!to) return { sent: false, error: 'No staff address' };
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { partner: { select: { name: true } } } });
  if (!l) return { sent: false, error: 'Listing not found' };
  const base = await baseUrl();
  const html = wrap(`<h2 style="margin:0 0 .5rem">New listing to review</h2><p><strong>${esc(l.title)}</strong> from ${esc(l.partner.name)} (${esc(l.catalogKey)}) is waiting for review.</p><p>${btn(`${base}/admin/pod/listings/${l.id}`, 'Review it')}</p>`, await storeName());
  return trySend({ to: { email: to }, subject: `Listing to review: ${l.title} (${l.partner.name})`, html, tags: ['pod-staff'] });
}

/** Staff: a shop applied. */
export async function notifyStaffRetailerApplied(retailerId: string): Promise<MailResult> {
  const to = await staffAddress();
  if (!to) return { sent: false, error: 'No staff address' };
  const r = await prisma.retailer.findUnique({ where: { id: retailerId } });
  if (!r) return { sent: false, error: 'Retailer not found' };
  const base = await baseUrl();
  const html = wrap(`<h2 style="margin:0 0 .5rem">Retailer application</h2><p><strong>${esc(r.name)}</strong> (${esc(r.contactName ?? '')}, ${esc(r.contactEmail)}) applied for a wholesale account.</p>${r.applicationMessage ? `<blockquote style="border-left:3px solid #1e74fc;margin:1rem 0;padding:.5rem 1rem;background:#f4f7fb">${esc(r.applicationMessage)}</blockquote>` : ''}<p>${btn(`${base}/admin/pod/retailers/${r.id}`, 'Review the application')}</p>`, await storeName());
  return trySend({ to: { email: to }, subject: `Retailer application: ${r.name}`, html, tags: ['pod-staff'] });
}

/** A shop was approved: its first login comes by magic link. */
export async function sendRetailerApprovedEmail(retailerId: string, userId: string): Promise<MailResult> {
  const r = await prisma.retailer.findUnique({ where: { id: retailerId } });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordSetAt: true } });
  if (!r || !u) return { sent: false, error: 'Retailer or account not found' };
  const name = await storeName();
  const link = await magicLink(userId, '/retailer');
  const s = await getPodSettings();
  const tiers = s.tiers.map((t) => `<li><strong>${esc(t.name)}</strong> — ${(t.discountBps / 100).toFixed(0)}% off cover price${t.minCents ? ` on orders from ${money(t.minCents)} at cover` : ''}</li>`).join('');
  const html = wrap(`
    <h2 style="margin:0 0 .5rem">Welcome to ${esc(name)} wholesale</h2>
    <p><strong>${esc(r.name)}</strong> is approved to order from the ${esc(s.programName)} catalog.</p>
    <ul>${tiers}</ul>
    <p>${btn(link, u.passwordSetAt ? 'Open the retailer portal' : 'Set your password and start ordering')}</p>
    <p style="color:#666;font-size:.9rem">${esc(s.retailerTerms)}</p>
  `, name);
  return trySend({ to: { email: u.email }, subject: `Your wholesale account is open — ${name}`, html, tags: ['pod-retailer'] });
}

/** A publisher's member was invited to the partner portal. */
export async function sendPartnerPortalInviteEmail(partnerId: string, userId: string): Promise<MailResult> {
  const p = await prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true } });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordSetAt: true } });
  if (!p || !u) return { sent: false, error: 'Partner or account not found' };
  const name = await storeName();
  const link = await magicLink(userId, '/partner');
  const html = wrap(`<h2 style="margin:0 0 .5rem">Your publisher portal</h2><p>You can now list <strong>${esc(p.name)}</strong> titles with ${esc(name)} Distribution, upload print files, and follow sales and payouts.</p><p>${btn(link, u.passwordSetAt ? 'Open the publisher portal' : 'Set your password and get started')}</p>`, name);
  return trySend({ to: { email: u.email }, subject: `Your ${name} publisher portal`, html, tags: ['pod-partner'] });
}

/** A shop placed an order: what they bought, at what tier, what happens at FOC. */
export async function sendRetailerOrderEmail(orderId: string): Promise<MailResult> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, cycle: true, retailer: true } });
  if (!o) return { sent: false, error: 'Order not found' };
  const name = await storeName();
  const base = await baseUrl();
  const s = await getPodSettings();
  const w = (o.wholesale ?? {}) as { tierName?: string; msrpSubtotalCents?: number };
  const rows = o.items.map((it) => `<tr><td style="padding:.35rem .5rem;border-bottom:1px solid #eee">${esc(it.name)}</td><td style="padding:.35rem .5rem;border-bottom:1px solid #eee;text-align:right">${it.quantity}</td><td style="padding:.35rem .5rem;border-bottom:1px solid #eee;text-align:right">${money(it.unitPriceCents)}</td><td style="padding:.35rem .5rem;border-bottom:1px solid #eee;text-align:right">${money(it.totalCents)}</td></tr>`).join('');
  const html = wrap(`
    <h2 style="margin:0 0 .5rem">Order ${esc(o.number)} received</h2>
    <p>Thanks, ${esc(o.retailer?.name ?? '')}. Your ${esc(o.cycle?.name ?? '')} order is in${w.tierName ? ` at <strong>${esc(w.tierName)}</strong>` : ''}. You can change it until the final order cutoff${o.cycle ? ` on ${o.cycle.focDate.toISOString().slice(0, 10)}` : ''}; after that we invoice and print.</p>
    <table style="border-collapse:collapse;width:100%"><thead><tr><th align="left" style="padding:.35rem .5rem">Title</th><th align="right" style="padding:.35rem .5rem">Qty</th><th align="right" style="padding:.35rem .5rem">Wholesale</th><th align="right" style="padding:.35rem .5rem">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="text-align:right;font-size:1.1rem"><strong>Subtotal ${money(o.subtotalCents)}</strong>${o.shippingCents ? `<br>Shipping ${money(o.shippingCents)}` : '<br><span style="color:#666;font-size:.9rem">Shipping billed at cost when it ships</span>'}</p>
    <p>${btn(`${base}/retailer/orders/${o.number}`, 'View the order')}</p>
    <p style="color:#666;font-size:.9rem">${esc(s.retailerTerms)}</p>
  `, name);
  return trySend({ to: { email: o.email }, subject: `Order ${o.number} received — ${name} wholesale`, html, tags: ['pod-retailer'] });
}

/** A purchase order went to the publisher who ships it. */
export async function sendPurchaseOrderEmail(purchaseOrderId: string): Promise<MailResult> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { partner: { include: { members: { select: { email: true }, take: 1 } } }, cycle: true } });
  if (!po) return { sent: false, error: 'Purchase order not found' };
  const email = po.partner.contactEmail || po.partner.members[0]?.email;
  if (!email) return { sent: false, error: 'The publisher has no contact email' };
  const name = await storeName();
  const base = await baseUrl();
  const lines = (po.lines as { catalogKey: string; title: string; quantity: number }[]).map((l) => `<tr><td style="padding:.35rem .5rem;border-bottom:1px solid #eee">${esc(l.catalogKey)}</td><td style="padding:.35rem .5rem;border-bottom:1px solid #eee">${esc(l.title)}</td><td style="padding:.35rem .5rem;border-bottom:1px solid #eee;text-align:right">${l.quantity}</td></tr>`).join('');
  const html = wrap(`
    <h2 style="margin:0 0 .5rem">Purchase order ${esc(po.number)}</h2>
    <p>${esc(po.cycle.name)} closed at FOC. Please ship the copies below; ship-to addresses are on the order in your portal.</p>
    <table style="border-collapse:collapse;width:100%"><thead><tr><th align="left" style="padding:.35rem .5rem">Catalog id</th><th align="left" style="padding:.35rem .5rem">Title</th><th align="right" style="padding:.35rem .5rem">Copies</th></tr></thead><tbody>${lines}</tbody></table>
    <p style="text-align:right"><strong>${po.unitsTotal} copies · wholesale ${money(po.wholesaleCents)} · net to you ${money(po.netCents)}</strong></p>
    <p>${btn(`${base}/partner/purchase-orders/${po.id}`, 'Open the purchase order')}</p>
  `, name);
  return trySend({ to: { email }, subject: `Purchase order ${po.number} — ${po.cycle.name}`, html, tags: ['pod-partner'] });
}

/** A payout statement was issued. */
export async function sendStatementEmail(statementId: string): Promise<MailResult> {
  const s = await prisma.payoutStatement.findUnique({ where: { id: statementId }, include: { partner: { include: { members: { select: { email: true }, take: 1 } } } } });
  if (!s) return { sent: false, error: 'Statement not found' };
  const email = s.partner.contactEmail || s.partner.members[0]?.email;
  if (!email) return { sent: false, error: 'The publisher has no contact email' };
  const name = await storeName();
  const base = await baseUrl();
  const html = wrap(`
    <h2 style="margin:0 0 .5rem">Payout statement ${esc(s.number)}</h2>
    <p>${s.periodStart.toISOString().slice(0, 10)} to ${s.periodEnd.toISOString().slice(0, 10)}</p>
    <table style="width:100%;max-width:420px"><tr><td>Wholesale sales</td><td align="right">${money(s.grossCents)}</td></tr><tr><td>Commission</td><td align="right">${money(s.commissionCents)}</td></tr><tr><td>Printing</td><td align="right">${money(s.printingCents)}</td></tr>${s.creditsCents ? `<tr><td>Return credits</td><td align="right">${money(s.creditsCents)}</td></tr>` : ''}${s.adjustmentCents ? `<tr><td>Adjustments</td><td align="right">${money(s.adjustmentCents)}</td></tr>` : ''}<tr><td style="padding-top:.5rem;font-weight:700">Net payout</td><td align="right" style="padding-top:.5rem;font-weight:700">${money(s.netCents)}</td></tr></table>
    <p>${btn(`${base}/partner/statements/${s.id}`, 'See the statement')}</p>
  `, name);
  return trySend({ to: { email }, subject: `Payout statement ${s.number} — ${name}`, html, tags: ['pod-partner'] });
}
