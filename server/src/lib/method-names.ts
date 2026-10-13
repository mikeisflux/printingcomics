/**
 * Orders placed before carrier names were cleaned up carry EasyPost's codes
 * in `shippingMethod` ("UPSDAP Ground", "USPS Priority"). Rewrite those to
 * the names a customer reads ("UPS Ground", "USPS Priority Mail") once, at
 * start-up; rows already in plain words are left alone. Idempotent.
 */
import { prisma } from '../db.js';
import { methodDisplayName } from './carriers.js';

const RAW_PREFIXES = ['UPSDAP ', 'FedExDefault ', 'UPS ', 'USPS ', 'FedEx '];

export async function normalizeStoredMethodNames(): Promise<number> {
  const rows = await prisma.order.findMany({
    where: { OR: RAW_PREFIXES.map((p) => ({ shippingMethod: { startsWith: p } })) },
    select: { id: true, shippingMethod: true },
  });
  let changed = 0;
  for (const row of rows) {
    const stored = row.shippingMethod ?? '';
    const space = stored.indexOf(' ');
    const carrier = stored.slice(0, space);
    const rest = stored.slice(space + 1);
    // A raw service code has no spaces ("UPSGroundsaverGreaterThan1lb",
    // "FEDEX_GROUND"); a name already in words ("3 Day Select") is kept.
    if (!rest || /\s/.test(rest)) continue;
    const name = methodDisplayName(carrier, rest);
    if (!name || name === stored) continue;
    await prisma.order.update({ where: { id: row.id }, data: { shippingMethod: name } });
    changed++;
  }
  return changed;
}
