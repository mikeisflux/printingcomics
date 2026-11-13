/**
 * The Distribution audit trail and document numbering.
 */
import type { Request } from 'express';
import { prisma } from '../../db.js';

export type PodSubject = 'listing' | 'cycle' | 'retailer' | 'production' | 'purchase_order' | 'statement';

export interface Actor { id: string | null; name: string }

export function actorOf(req: Request): Actor {
  return { id: req.session?.sub ?? null, name: req.session?.email ?? 'system' };
}

export async function recordPodEvent(subjectType: PodSubject, subjectId: string, kind: string, message: string | null, actor?: Actor | null) {
  return prisma.podEvent.create({ data: { subjectType, subjectId, kind, message, actorId: actor?.id ?? null, actorName: actor?.name ?? null } });
}

export async function podEvents(subjectType: PodSubject, subjectId: string, take = 100) {
  return prisma.podEvent.findMany({ where: { subjectType, subjectId }, orderBy: { createdAt: 'desc' }, take });
}

/** PRD-000123 style numbers: readable, sequential, unique on retry. */
export async function nextNumber(prefix: 'PRD' | 'PO' | 'PS', count: () => Promise<number>, exists: (n: string) => Promise<boolean>): Promise<string> {
  let n = (await count()) + 1;
  for (let i = 0; i < 20; i++, n++) {
    const candidate = `${prefix}-${String(n).padStart(6, '0')}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export const numbering = {
  production: () => nextNumber('PRD', () => prisma.productionOrder.count(), async (n) => !!(await prisma.productionOrder.findUnique({ where: { number: n }, select: { id: true } }))),
  purchaseOrder: () => nextNumber('PO', () => prisma.purchaseOrder.count(), async (n) => !!(await prisma.purchaseOrder.findUnique({ where: { number: n }, select: { id: true } }))),
  statement: () => nextNumber('PS', () => prisma.payoutStatement.count(), async (n) => !!(await prisma.payoutStatement.findUnique({ where: { number: n }, select: { id: true } }))),
};

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}
