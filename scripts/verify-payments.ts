/**
 * verify-payments — does every order we call paid have a completed PayPal
 * capture behind it, and does every unpaid one really lack one?
 *
 *   npm run verify:payments                  # report: orders from the last 30 days
 *   npm run verify:payments -- --days 90     # look further back
 *   npm run verify:payments -- --fix         # also correct our records to match PayPal
 *   npm run verify:payments -- --order PC-MUBQ5GLF-9956 --fix   # one order
 *
 * For each order it asks PayPal for the capture (or the checkout order, if
 * the capture never happened) and prints our status next to PayPal's. With
 * --fix, orders are set to match: a completed capture → PAID/CAPTURED, a
 * pending one → PENDING, none or declined → CANCELLED/FAILED. Nothing about
 * money moves; this only edits our own records, and every change is written
 * to the order's timeline. Partner / API orders are skipped — they are not
 * paid through PayPal.
 */
import 'dotenv/config';
import { prisma } from '../server/src/db.js';
import { verifyOrderPayment, describeVerdict } from '../server/src/lib/payments/paypal/verify.js';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 30 : 30;
const orderIdx = args.indexOf('--order');
const only = orderIdx >= 0 ? args[orderIdx + 1] : undefined;

async function main() {
  const orders = await prisma.order.findMany({
    where: only
      ? { number: only }
      : { partnerId: null, apiKeyId: null, createdAt: { gte: new Date(Date.now() - days * 86_400_000) }, payments: { some: { provider: 'paypal', providerRef: { not: null } } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, email: true, status: true, paymentStatus: true, totalCents: true, createdAt: true },
  });
  console.log(`Checking ${orders.length} order(s) against PayPal${fix ? ' and fixing mismatches' : ''}…\n`);

  let mismatches = 0;
  for (const o of orders) {
    const r = await verifyOrderPayment(o.id, { fix, actorName: 'verify-payments script' });
    const agrees =
      (r.verdict === 'paid' && r.before.paymentStatus === 'CAPTURED') ||
      (r.verdict === 'refunded' && r.before.paymentStatus === 'REFUNDED') ||
      ((r.verdict === 'unpaid' || r.verdict === 'pending') && r.before.paymentStatus !== 'CAPTURED');
    if (!agrees) mismatches++;
    const flag = r.verdict === 'unknown' ? '?' : agrees ? 'OK ' : '!! ';
    console.log(`${flag} ${o.number}  $${(o.totalCents / 100).toFixed(2)}  ${o.email}`);
    console.log(`     ours: ${r.before.status} / ${r.before.paymentStatus}   paypal: ${r.verdict.toUpperCase()} — ${r.note}`);
    if (r.changed) console.log(`     fixed → ${r.after.status} / ${r.after.paymentStatus}`);
    else if (!agrees && !fix) console.log(`     ${describeVerdict(r)}  (re-run with --fix to correct it)`);
  }

  console.log(`\n${orders.length} checked, ${mismatches} mismatch(es)${fix && mismatches ? ' corrected' : ''}.`);
  if (mismatches && !fix) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
