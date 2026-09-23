/**
 * Ask PayPal what actually happened to an order's money, and make our order
 * agree with it.
 *
 * An order is only "paid" when PayPal holds a COMPLETED capture for it. A
 * capture can sit PENDING (eCheck clearing, risk review, a receiving
 * preference that needs the account holder to accept it) and later be
 * DENIED — and during an outage our own records can drift from PayPal's.
 * This looks each payment reference up (a capture id, or the checkout order
 * id from before capture), reads the capture status, and, with `fix`, sets
 * the order's status to match:
 *
 *   COMPLETED            → paymentStatus CAPTURED, status PAID (if still pending)
 *   PENDING              → paymentStatus PENDING, status PENDING (not paid yet)
 *   REFUNDED             → paymentStatus REFUNDED, status REFUNDED
 *   DECLINED / no capture → paymentStatus FAILED, status CANCELLED
 *                          (only while the order is PENDING/PAID — a shipped
 *                          order with a reversed payment is a human's call)
 *
 * Every change is written to the order timeline.
 */
import { prisma } from '../../../db.js';
import { HttpError } from '../../../middleware/error.js';
import { getPayPalAccessToken, getPayPalConfig } from './config.js';

export type CaptureState = 'COMPLETED' | 'PENDING' | 'DECLINED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED' | 'NONE' | 'UNKNOWN';

export interface PaypalPaymentFacts {
  paymentId: string;
  localStatus: string;
  providerRef: string;
  captureId: string | null;
  captureStatus: CaptureState;
  /** PayPal's status_details.reason, or the checkout order's status when nothing was captured. */
  reason: string | null;
  amountCents: number | null;
}

export type Verdict = 'paid' | 'pending' | 'unpaid' | 'refunded' | 'unknown';

export interface VerifyResult {
  orderId: string;
  number: string;
  verdict: Verdict;
  before: { status: string; paymentStatus: string };
  after: { status: string; paymentStatus: string };
  changed: boolean;
  payments: PaypalPaymentFacts[];
  note: string;
}

function normalize(s: unknown): CaptureState {
  switch (String(s ?? '').toUpperCase()) {
    case 'COMPLETED': return 'COMPLETED';
    case 'PENDING': return 'PENDING';
    case 'DECLINED': return 'DECLINED';
    case 'REFUNDED': return 'REFUNDED';
    case 'PARTIALLY_REFUNDED': return 'PARTIALLY_REFUNDED';
    case 'FAILED': return 'FAILED';
    default: return 'UNKNOWN';
  }
}

function cents(amount: { value?: string } | undefined): number | null {
  const v = Number(amount?.value);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

async function paypalGet(path: string): Promise<{ status: number; body: any } | null> {
  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();
  try {
    const res = await fetch(`${config.baseUrl}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    return null;
  }
}

/** What PayPal holds for one of our payment references. */
export async function lookupPaypalPayment(p: { id: string; status: string; providerRef: string }): Promise<PaypalPaymentFacts> {
  const base = { paymentId: p.id, localStatus: p.status, providerRef: p.providerRef };
  // After capture the reference is the capture id.
  const cap = await paypalGet(`/v2/payments/captures/${encodeURIComponent(p.providerRef)}`);
  if (cap?.status === 200 && cap.body?.id) {
    return { ...base, captureId: cap.body.id, captureStatus: normalize(cap.body.status), reason: cap.body.status_details?.reason ?? null, amountCents: cents(cap.body.amount) };
  }
  // Before capture (or when the webhook never told us the capture id) it is the checkout order id.
  const ord = await paypalGet(`/v2/checkout/orders/${encodeURIComponent(p.providerRef)}`);
  if (ord?.status === 200 && ord.body?.id) {
    const capture = ord.body.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) return { ...base, captureId: null, captureStatus: 'NONE', reason: `checkout order is ${ord.body.status ?? 'unknown'}, nothing captured`, amountCents: null };
    return { ...base, captureId: capture.id ?? null, captureStatus: normalize(capture.status), reason: capture.status_details?.reason ?? null, amountCents: cents(capture.amount) };
  }
  if (cap?.status === 404 && ord?.status === 404) {
    return { ...base, captureId: null, captureStatus: 'NONE', reason: 'PayPal has no record of this reference', amountCents: null };
  }
  return { ...base, captureId: null, captureStatus: 'UNKNOWN', reason: `PayPal could not be checked (${cap?.status ?? 'network'} / ${ord?.status ?? 'network'})`, amountCents: null };
}

function verdictOf(facts: PaypalPaymentFacts[]): Verdict {
  const states = facts.map((f) => f.captureStatus);
  if (states.some((s) => s === 'COMPLETED' || s === 'PARTIALLY_REFUNDED')) return 'paid';
  if (states.some((s) => s === 'REFUNDED')) return 'refunded';
  if (states.some((s) => s === 'PENDING')) return 'pending';
  if (states.length > 0 && states.every((s) => s === 'UNKNOWN')) return 'unknown';
  return 'unpaid';
}

export async function verifyOrderPayment(orderId: string, opts: { fix: boolean; actorName?: string | null }): Promise<VerifyResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: 'desc' }, include: { adjustment: { select: { id: true } } } } },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  // Balance payments for post-order changes are not what makes the order paid.
  const candidates = order.payments.filter((p) => p.provider === 'paypal' && p.providerRef && !p.adjustment);
  const facts: PaypalPaymentFacts[] = [];
  for (const p of candidates) facts.push(await lookupPaypalPayment({ id: p.id, status: p.status, providerRef: p.providerRef! }));
  const verdict = candidates.length === 0 ? 'unpaid' : verdictOf(facts);

  const before = { status: order.status, paymentStatus: order.paymentStatus };
  const after = { ...before };
  const notes: string[] = [];
  const describe = (f: PaypalPaymentFacts) => `${f.captureId ?? f.providerRef} is ${f.captureStatus}${f.reason ? ` (${f.reason})` : ''}`;

  if (candidates.length === 0) notes.push('no PayPal payment was ever started for this order');
  else notes.push(...facts.map(describe));

  if (opts.fix) {
    const winner = facts.find((f) => f.captureStatus === 'COMPLETED' || f.captureStatus === 'PARTIALLY_REFUNDED');
    if (verdict === 'paid' && winner) {
      if (order.paymentStatus !== 'CAPTURED') after.paymentStatus = 'CAPTURED';
      if (order.status === 'PENDING' || order.status === 'CANCELLED') after.status = 'PAID';
      await prisma.payment.update({ where: { id: winner.paymentId }, data: { status: 'CAPTURED', providerRef: winner.captureId ?? winner.providerRef } });
    } else if (verdict === 'refunded') {
      after.paymentStatus = 'REFUNDED';
      after.status = 'REFUNDED';
      for (const f of facts) if (f.captureStatus === 'REFUNDED') await prisma.payment.update({ where: { id: f.paymentId }, data: { status: 'REFUNDED' } });
    } else if (verdict === 'pending') {
      after.paymentStatus = 'PENDING';
      if (order.status === 'PAID') after.status = 'PENDING';
      for (const f of facts) if (f.captureStatus === 'PENDING') await prisma.payment.update({ where: { id: f.paymentId }, data: { status: 'PENDING', providerRef: f.captureId ?? f.providerRef } });
    } else if (verdict === 'unpaid') {
      after.paymentStatus = 'FAILED';
      if (order.status === 'PENDING' || order.status === 'PAID') after.status = 'CANCELLED';
      for (const f of facts) if (f.captureStatus !== 'UNKNOWN') await prisma.payment.update({ where: { id: f.paymentId }, data: { status: 'FAILED' } });
    }
    // 'unknown' changes nothing: PayPal could not be reached.
  }

  const changed = after.status !== before.status || after.paymentStatus !== before.paymentStatus;
  if (changed) {
    await prisma.order.update({ where: { id: order.id }, data: { status: after.status as any, paymentStatus: after.paymentStatus as any } });
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'payment',
        fromStatus: before.paymentStatus,
        toStatus: after.paymentStatus,
        actorName: opts.actorName ?? 'PayPal check',
        message: `Checked with PayPal: ${notes.join('; ')} → order ${after.status} / payment ${after.paymentStatus}`,
      },
    });
  }

  return { orderId: order.id, number: order.number, verdict, before, after, changed, payments: facts, note: notes.join('; ') };
}

/** Plain-language summary for a toast or a terminal line. */
export function describeVerdict(r: VerifyResult): string {
  const where = r.changed ? ` Order set to ${r.after.status} / ${r.after.paymentStatus}.` : r.before.paymentStatus === 'CAPTURED' && r.verdict === 'paid' ? ' Matches our records.' : '';
  switch (r.verdict) {
    case 'paid': return `PayPal holds a completed capture — this order IS paid.${where}`;
    case 'pending': return `PayPal is still holding the payment as PENDING — the money has not arrived.${where}`;
    case 'refunded': return `PayPal shows the payment refunded.${where}`;
    case 'unpaid': return `PayPal has no completed payment for this order — it was NOT paid.${where}`;
    default: return `PayPal could not be reached; nothing changed. (${r.note})`;
  }
}
