import { prisma } from '../db.js';
import { purgeOrderArtwork } from './proofs.js';

/** Abandoned checkouts older than this are auto-deleted. Override with env. */
const TTL_HOURS = Number(process.env.ABANDONED_ORDER_TTL_HOURS ?? 24);

/**
 * Delete abandoned storefront checkouts — a PayPal order was minted but never
 * paid, no partner / API key — older than `hours`. These are the PENDING/PENDING
 * rows the Orders list hides by default. Returns the count deleted; individual
 * failures are swallowed so one bad row can't stall the sweep.
 */
export async function purgeAbandonedOrders(hours = TTL_HOURS): Promise<number> {
  if (!(hours > 0)) return 0;
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const orders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: 'PENDING',
      partnerId: null,
      apiKeyId: null,
      createdAt: { lt: cutoff },
      payments: { none: { status: 'CAPTURED' } },
    },
    select: { id: true },
    take: 1000,
  });
  let deleted = 0;
  for (const o of orders) {
    try {
      await purgeOrderArtwork(o.id); // remove any uploaded files/proofs from disk
      await prisma.order.delete({ where: { id: o.id } }); // cascades items/payments/events/…
      deleted++;
    } catch (e: any) {
      console.warn(`[abandoned-cleanup] failed to delete order ${o.id}:`, e?.message ?? e);
    }
  }
  return deleted;
}

let started = false;
/** Start the daily sweep: an initial run ~2 min after boot, then every 24 h. */
export function startAbandonedOrderCleanup(): void {
  if (started) return;
  started = true;
  const run = () => {
    void purgeAbandonedOrders()
      .then((n) => { if (n > 0) console.log(`[abandoned-cleanup] deleted ${n} abandoned order(s)`); })
      .catch((e) => console.warn('[abandoned-cleanup] sweep failed:', e?.message ?? e));
  };
  // Run shortly after startup (so a restart still triggers a sweep), then daily.
  setTimeout(run, 2 * 60_000);
  setInterval(run, 24 * 60 * 60 * 1000);
}
