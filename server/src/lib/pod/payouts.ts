/**
 * Publisher payouts. The ledger holds one row per money event; a statement
 * sweeps a partner's unassigned rows (optionally one cycle's) into an
 * immutable snapshot that is issued, then marked paid.
 */
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { numbering, recordPodEvent, type Actor } from './events.js';

export const LEDGER_LABELS: Record<string, string> = {
  SALE: 'Wholesale sales', COMMISSION: 'Commission', PRINTING: 'Printing', RETURN_CREDIT: 'Return credits', PAYOUT: 'Payout', ADJUSTMENT: 'Adjustment',
};

export interface LedgerSummary { grossCents: number; commissionCents: number; printingCents: number; creditsCents: number; adjustmentCents: number; payoutsCents: number; netCents: number; unassignedCents: number }

export async function ledgerSummary(partnerId: string): Promise<LedgerSummary> {
  const rows = await prisma.partnerLedgerEntry.groupBy({ by: ['kind'], where: { partnerId }, _sum: { amountCents: true } });
  const by = (k: string) => rows.find((r) => r.kind === k)?._sum.amountCents ?? 0;
  const unassigned = await prisma.partnerLedgerEntry.aggregate({ where: { partnerId, statementId: null, kind: { not: 'PAYOUT' } }, _sum: { amountCents: true } });
  const grossCents = by('SALE');
  const commissionCents = by('COMMISSION');
  const printingCents = by('PRINTING');
  const creditsCents = by('RETURN_CREDIT');
  const adjustmentCents = by('ADJUSTMENT');
  const payoutsCents = by('PAYOUT');
  return { grossCents, commissionCents, printingCents, creditsCents, adjustmentCents, payoutsCents, netCents: grossCents + commissionCents + printingCents + creditsCents + adjustmentCents + payoutsCents, unassignedCents: unassigned._sum.amountCents ?? 0 };
}

export async function generateStatement(args: { partnerId: string; cycleId?: string | null; periodStart?: Date | null; periodEnd?: Date | null; notes?: string | null }, actor: Actor) {
  const where: Prisma.PartnerLedgerEntryWhereInput = { partnerId: args.partnerId, statementId: null, kind: { not: 'PAYOUT' } };
  if (args.cycleId) where.cycleId = args.cycleId;
  if (args.periodStart || args.periodEnd) where.createdAt = { ...(args.periodStart ? { gte: args.periodStart } : {}), ...(args.periodEnd ? { lte: args.periodEnd } : {}) };
  const entries = await prisma.partnerLedgerEntry.findMany({ where, orderBy: { createdAt: 'asc' }, include: { listing: { select: { catalogKey: true, title: true } }, cycle: { select: { name: true } } } });
  if (!entries.length) throw new HttpError(400, 'Nothing to put on a statement: every ledger entry for this publisher is already on one.');
  const sum = (k: string) => entries.filter((e) => e.kind === k).reduce((s, e) => s + e.amountCents, 0);
  const grossCents = sum('SALE');
  const commissionCents = sum('COMMISSION');
  const printingCents = sum('PRINTING');
  const creditsCents = sum('RETURN_CREDIT');
  const adjustmentCents = sum('ADJUSTMENT');
  const netCents = grossCents + commissionCents + printingCents + creditsCents + adjustmentCents;
  const dates = entries.map((e) => e.createdAt.getTime());
  const statement = await prisma.payoutStatement.create({ data: {
    number: await numbering.statement(), partnerId: args.partnerId, cycleId: args.cycleId ?? null,
    periodStart: args.periodStart ?? new Date(Math.min(...dates)), periodEnd: args.periodEnd ?? new Date(Math.max(...dates)),
    lines: entries.map((e) => ({ id: e.id, kind: e.kind, amountCents: e.amountCents, description: e.description, catalogKey: e.listing?.catalogKey ?? null, title: e.listing?.title ?? null, cycle: e.cycle?.name ?? null, at: e.createdAt.toISOString() })) as unknown as Prisma.InputJsonValue,
    grossCents, commissionCents, printingCents, creditsCents, adjustmentCents, netCents, notes: args.notes ?? null,
  } });
  await prisma.partnerLedgerEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { statementId: statement.id } });
  await recordPodEvent('statement', statement.id, 'created', `${entries.length} ledger entries, net ${(netCents / 100).toFixed(2)}`, actor);
  return statement;
}

export async function issueStatement(id: string, actor: Actor) {
  const s = await prisma.payoutStatement.findUnique({ where: { id } });
  if (!s) throw new HttpError(404, 'Statement not found');
  if (s.status !== 'DRAFT') throw new HttpError(400, 'Only a draft statement can be issued');
  const out = await prisma.payoutStatement.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } });
  await recordPodEvent('statement', id, 'issued', null, actor);
  return out;
}

export async function markStatementPaid(id: string, args: { method: string; reference?: string | null; paidAt?: Date | null }, actor: Actor) {
  const s = await prisma.payoutStatement.findUnique({ where: { id } });
  if (!s) throw new HttpError(404, 'Statement not found');
  if (s.status !== 'ISSUED' && s.status !== 'DRAFT') throw new HttpError(400, `A ${s.status.toLowerCase()} statement cannot be marked paid`);
  const paidAt = args.paidAt ?? new Date();
  const out = await prisma.$transaction(async (tx) => {
    const u = await tx.payoutStatement.update({ where: { id }, data: { status: 'PAID', paidAt, issuedAt: s.issuedAt ?? paidAt, paymentMethod: args.method, paymentRef: args.reference ?? null } });
    if (s.netCents !== 0) {
      await tx.partnerLedgerEntry.create({ data: { partnerId: s.partnerId, kind: 'PAYOUT', amountCents: -s.netCents, description: `Payout for statement ${s.number}${args.reference ? ` (${args.reference})` : ''}`, cycleId: s.cycleId, statementId: id, actorName: actor.name } });
    }
    return u;
  });
  await recordPodEvent('statement', id, 'paid', `${args.method}${args.reference ? ` · ${args.reference}` : ''}`, actor);
  return out;
}

export async function voidStatement(id: string, actor: Actor) {
  const s = await prisma.payoutStatement.findUnique({ where: { id } });
  if (!s) throw new HttpError(404, 'Statement not found');
  if (s.status === 'PAID') throw new HttpError(400, 'A paid statement cannot be voided');
  await prisma.$transaction([
    prisma.partnerLedgerEntry.updateMany({ where: { statementId: id }, data: { statementId: null } }),
    prisma.payoutStatement.update({ where: { id }, data: { status: 'VOID' } }),
  ]);
  await recordPodEvent('statement', id, 'voided', 'Ledger entries released', actor);
}
