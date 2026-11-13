/**
 * Retailer returns and damage claims. A shop asks to return copies from a
 * paid wholesale order (within the tier's allowance); staff approve with a
 * credit, which becomes store credit on the shop's next order and a
 * RETURN_CREDIT charge on the publisher's ledger.
 */
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { getPodSettings } from './settings.js';
import { nextNumber, recordPodEvent, type Actor } from './events.js';

export const RETURN_REASONS = [
  { key: 'damaged', label: 'Arrived damaged' },
  { key: 'misprint', label: 'Printing defect' },
  { key: 'wrong_item', label: 'Wrong title or cover shipped' },
  { key: 'short', label: 'Short shipped (fewer copies than invoiced)' },
  { key: 'unsold', label: 'Unsold copies (within allowance)' },
  { key: 'other', label: 'Other' },
];

export async function returnAllowance(retailerId: string, orderId: string) {
  const s = await getPodSettings();
  const order = await prisma.order.findFirst({ where: { id: orderId, retailerId }, select: { wholesale: true, items: { select: { quantity: true } } } });
  if (!order) throw new HttpError(404, 'Order not found');
  const w = (order.wholesale ?? {}) as { tierIndex?: number };
  const allowance = s.returnAllowanceByTier[(w.tierIndex ?? 1) - 1] ?? s.returnAllowanceByTier[0] ?? 0;
  const used = await prisma.retailerReturn.aggregate({ where: { orderId, status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED', 'CREDITED'] } }, _sum: { quantity: true } });
  return { allowance, used: used._sum.quantity ?? 0, remaining: Math.max(0, allowance - (used._sum.quantity ?? 0)) };
}

export async function requestReturn(args: { retailerId: string; orderId: string; orderItemId: string; quantity: number; kind: 'return' | 'damage'; reason: string }, actor: Actor) {
  const item = await prisma.orderItem.findFirst({ where: { id: args.orderItemId, orderId: args.orderId, order: { retailerId: args.retailerId } }, include: { order: { select: { paymentStatus: true, status: true } }, listing: { select: { id: true, partnerId: true, title: true } } } });
  if (!item || !item.listing) throw new HttpError(404, 'That line is not on one of your orders');
  if (item.order.status === 'CANCELLED') throw new HttpError(400, 'That order was cancelled');
  if (!Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > item.quantity) throw new HttpError(400, `Enter between 1 and ${item.quantity} copies`);
  const already = await prisma.retailerReturn.aggregate({ where: { orderId: args.orderId, listingId: item.listing.id, status: { not: 'REJECTED' } }, _sum: { quantity: true } });
  if ((already._sum.quantity ?? 0) + args.quantity > item.quantity) throw new HttpError(400, `Only ${item.quantity - (already._sum.quantity ?? 0)} copies of this title can still be claimed`);
  if (args.kind === 'return') {
    const a = await returnAllowance(args.retailerId, args.orderId);
    if (args.quantity > a.remaining) throw new HttpError(400, `Your tier allows ${a.allowance} returned copies on this order; ${a.used} already claimed.`);
  }
  const r = await prisma.retailerReturn.create({ data: {
    number: await nextNumber('PS', () => prisma.retailerReturn.count(), async (n) => !!(await prisma.retailerReturn.findUnique({ where: { number: n.replace('PS-', 'RT-') }, select: { id: true } }))).then((n) => n.replace('PS-', 'RT-')),
    retailerId: args.retailerId, orderId: args.orderId, listingId: item.listing.id, kind: args.kind, quantity: args.quantity, unitCreditCents: item.unitPriceCents, creditCents: item.unitPriceCents * args.quantity, reason: args.reason.trim(),
  } });
  await recordPodEvent('retailer', args.retailerId, 'return-requested', `${r.number}: ${args.quantity} × ${item.listing.title} (${args.kind}) — ${args.reason.trim()}`, actor);
  return r;
}

export async function decideReturn(id: string, decision: { status: 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'CREDITED'; creditCents?: number | null; note?: string | null }, actor: Actor) {
  const r = await prisma.retailerReturn.findUnique({ where: { id }, include: { listing: { select: { partnerId: true, title: true, catalogKey: true } }, order: { select: { cycleId: true, number: true } } } });
  if (!r) throw new HttpError(404, 'Return not found');
  const credit = decision.creditCents ?? r.creditCents;
  const now = new Date();
  if (decision.status === 'CREDITED' && r.status === 'CREDITED') throw new HttpError(400, 'Already credited');
  await prisma.$transaction(async (tx) => {
    await tx.retailerReturn.update({ where: { id }, data: { status: decision.status, creditCents: credit, reviewNote: decision.note ?? r.reviewNote, decidedAt: decision.status === 'APPROVED' || decision.status === 'REJECTED' ? now : r.decidedAt, receivedAt: decision.status === 'RECEIVED' ? now : r.receivedAt } });
    if (decision.status === 'CREDITED') {
      await tx.retailer.update({ where: { id: r.retailerId }, data: { creditCents: { increment: credit } } });
      if (r.listing && credit) {
        await tx.partnerLedgerEntry.create({ data: { partnerId: r.listing.partnerId, kind: 'RETURN_CREDIT', amountCents: -credit, description: `${r.number}: ${r.quantity} × ${r.listing.title} credited to the shop (order ${r.order.number})`, cycleId: r.order.cycleId, listingId: r.listingId, orderId: r.orderId, actorName: actor.name } });
      }
    }
  });
  await recordPodEvent('retailer', r.retailerId, `return-${decision.status.toLowerCase()}`, `${r.number}${decision.note ? ` — ${decision.note}` : ''}${decision.status === 'CREDITED' ? ` · $${(credit / 100).toFixed(2)} store credit` : ''}`, actor);
  return prisma.retailerReturn.findUnique({ where: { id } });
}
