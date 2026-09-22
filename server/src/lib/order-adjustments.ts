/**
 * Order adjustments — staff change an item's selections after the order is
 * paid (cover stock, interior paper, page count …), the order is repriced
 * through the real pricing engine, and the customer gets a link to pay the
 * difference. The change is applied to the order only once that balance is
 * captured; a change that lowers the price is applied immediately and the
 * credit is left for staff to refund.
 *
 * Repricing keeps the customer's original deal: the new selections are priced
 * at list, then scaled by the same ratio the customer actually paid vs list on
 * the original line (which is how the site-wide promo, if any, reached them).
 * So the delta reflects the option change and nothing else — not a promo that
 * has since started or ended, not a price-list revision.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { getSetting } from './settings.js';
import { computePricing, canonicalizeOptionValues, type PricingConfig } from './pricing.js';
import { getPayPalAccessToken, getPayPalConfig } from './payments/paypal/config.js';
import { paypalHttpError, paypalNetworkError } from './payments/paypal/errors.js';
import { sendAdjustmentPaidEmail } from './order-emails.js';

export type OptionValue = string | number | boolean;
export type OptionMap = Record<string, OptionValue>;

export interface ItemChangeInput {
  orderItemId: string;
  /** Full or partial option map; keys are the product option keys (internalKey). */
  options: OptionMap;
}

export interface ItemChange {
  orderItemId: string;
  itemName: string;
  quantity: number;
  before: { options: OptionMap; unitPriceCents: number; totalCents: number };
  after: { options: OptionMap; unitPriceCents: number; totalCents: number };
  /** Only the keys whose value actually changed, with human labels. */
  diff: { key: string; label: string; from: string; to: string }[];
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface AdjustmentPreview {
  changes: ItemChange[];
  before: Totals;
  after: Totals;
  /** after.total − before.total. Positive = the customer owes this. */
  amountCents: number;
}

/** Links stay valid this long; after that the customer has to ask for a new one. */
const PAY_LINK_TTL_DAYS = 14;

// ---------------------------------------------------------------------------
// Option helpers — mirror the storefront exactly
// ---------------------------------------------------------------------------

type ProductOptionRow = {
  id: string; name: string; internalKey: string | null; type: string; required: boolean;
  values: { label: string }[];
};

/** Same key the storefront stores selections under (Product.tsx keyOf). */
export function optionKey(opt: { internalKey: string | null; name: string }): string {
  if (opt.internalKey) return opt.internalKey;
  return opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Same coercion the cart applies before pricing: integer-looking strings become numbers. */
function toPricingInputs(options: OptionMap): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(options)) {
    if (typeof v === 'number') out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 'true' : 'false';
    else out[k] = /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  }
  return out;
}

function display(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function isConfigurator(cfg: unknown): cfg is PricingConfig {
  return !!(cfg && typeof cfg === 'object' && Array.isArray((cfg as PricingConfig).qtyTiers));
}

/** List price per unit for these selections — after quantity tiers, before any site promo. */
function listUnitCents(cfg: PricingConfig, quantity: number, options: OptionMap): number {
  const canon = canonicalizeOptionValues(cfg, toPricingInputs(options));
  return computePricing(cfg, { quantity, options: canon, siteDiscountBps: 0 }).unitCents;
}

/**
 * Reject a selection the storefront would never have produced: a choice-type
 * option set to a value that isn't one of its values, or a required one
 * cleared. Free-text, numbers, toggles and uploads pass through.
 */
function validateOptions(productOptions: ProductOptionRow[], options: OptionMap): void {
  const byKey = new Map(productOptions.map((o) => [optionKey(o), o]));
  for (const [key, value] of Object.entries(options)) {
    const opt = byKey.get(key);
    if (!opt) continue; // legacy / free-form key — leave it alone
    const choice = opt.type === 'SELECT' || opt.type === 'RADIO' || opt.type === 'TILES';
    if (!choice) continue;
    const labels = opt.values.map((v) => v.label);
    if (value === '' || value === null || value === undefined) {
      if (opt.required) throw new HttpError(400, `"${opt.name}" is required.`);
      continue;
    }
    if (!labels.includes(String(value))) {
      throw new HttpError(400, `"${display(value)}" is not one of the choices for "${opt.name}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export async function repriceUnit(
  item: { quantity: number; unitPriceCents: number; options: unknown },
  cfg: unknown,
  newOptions: OptionMap,
): Promise<number> {
  // Flat-priced / variant goods: selections never priced them, so nothing to redo.
  if (!isConfigurator(cfg)) return item.unitPriceCents;

  const oldOptions = (item.options ?? {}) as OptionMap;
  const oldList = listUnitCents(cfg, item.quantity, oldOptions);
  const newList = listUnitCents(cfg, item.quantity, newOptions);

  // The customer's effective rate on the original line. Capped at 1 — if the
  // price list has since dropped below what they paid, the new selection is
  // charged at today's list rather than marked up to match an old price.
  let ratio: number;
  if (oldList > 0) {
    ratio = Math.min(1, item.unitPriceCents / oldList);
  } else {
    const bps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;
    ratio = cfg.ignoreSiteDiscount ? 1 : 1 - bps / 10_000;
  }
  return Math.round(newList * ratio);
}

async function taxFor(
  order: { shippingAddress: unknown; subtotalCents: number; discountCents: number; taxCents: number },
  taxableCents: number,
): Promise<number> {
  // An order that was never taxed stays untaxed: the delta is about the
  // option change, not about a rate that was added since.
  if (order.taxCents <= 0) return 0;
  const addr = (order.shippingAddress ?? {}) as { region?: string; country?: string };
  const rate = await prisma.taxRate.findFirst({
    where: { region: addr.region ?? '', country: addr.country ?? 'US' },
  });
  if (rate) return Math.floor((taxableCents * rate.rateBps) / 10_000);
  const oldBase = order.subtotalCents - order.discountCents;
  return oldBase > 0 ? Math.round(taxableCents * (order.taxCents / oldBase)) : 0;
}

export async function previewAdjustment(orderId: string, inputs: ItemChangeInput[]): Promise<AdjustmentPreview> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: { pricingConfig: true, options: { include: { values: { select: { label: true } } } } },
          },
        },
      },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  if (inputs.length === 0) throw new HttpError(400, 'No changes given.');

  const changes: ItemChange[] = [];
  const newTotals = new Map<string, number>(); // orderItemId -> new line total

  for (const input of inputs) {
    const item = order.items.find((i) => i.id === input.orderItemId);
    if (!item) throw new HttpError(404, `Order item ${input.orderItemId} is not on this order.`);

    const before = (item.options ?? {}) as OptionMap;
    const after: OptionMap = { ...before, ...input.options };
    validateOptions(item.product.options as ProductOptionRow[], after);

    const labelOf = new Map(item.product.options.map((o) => [optionKey(o), o.name]));
    const diff: ItemChange['diff'] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const from = before[key];
      const to = after[key];
      if (display(from) !== display(to)) {
        diff.push({ key, label: labelOf.get(key) ?? key, from: display(from), to: display(to) });
      }
    }

    const unit = await repriceUnit(item, item.product.pricingConfig, after);
    const total = unit * item.quantity;
    newTotals.set(item.id, total);
    changes.push({
      orderItemId: item.id,
      itemName: item.name,
      quantity: item.quantity,
      before: { options: before, unitPriceCents: item.unitPriceCents, totalCents: item.totalCents },
      after: { options: after, unitPriceCents: unit, totalCents: total },
      diff,
    });
  }

  const subtotalAfter = order.items.reduce((s, i) => s + (newTotals.get(i.id) ?? i.totalCents), 0);
  const taxAfter = await taxFor(order, subtotalAfter - order.discountCents);

  const before: Totals = {
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxCents: order.taxCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
  };
  const after: Totals = {
    subtotalCents: subtotalAfter,
    discountCents: order.discountCents,
    taxCents: taxAfter,
    shippingCents: order.shippingCents,
    totalCents: subtotalAfter - order.discountCents + taxAfter + order.shippingCents,
  };

  return { changes, before, after, amountCents: after.totalCents - before.totalCents };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function adjustmentPayUrl(token: string): Promise<string | null> {
  const u = (await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || '';
  const base = u.replace(/\/$/, '');
  return base ? `${base}/pay/${token}` : null;
}

function fmt(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Apply the stored changes to the order. Idempotent via CAS on status, so the
 * browser's capture callback and the PayPal webhook can both call it.
 */
async function applyAdjustment(adjustmentId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const adj = await tx.orderAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adj) throw new HttpError(404, 'Adjustment not found');
    const cas = await tx.orderAdjustment.updateMany({
      where: { id: adj.id, status: { in: ['pending', 'paid'] } },
      data: { status: 'applied', appliedAt: new Date() },
    });
    if (cas.count === 0) return false;

    const changes = adj.changes as unknown as ItemChange[];
    const totals = adj.totals as unknown as { before: Totals; after: Totals };
    for (const c of changes) {
      await tx.orderItem.update({
        where: { id: c.orderItemId },
        data: { options: c.after.options as object, unitPriceCents: c.after.unitPriceCents, totalCents: c.after.totalCents },
      });
    }
    await tx.order.update({
      where: { id: adj.orderId },
      data: {
        subtotalCents: totals.after.subtotalCents,
        taxCents: totals.after.taxCents,
        totalCents: totals.after.totalCents,
      },
    });
    await tx.orderStatusEvent.create({
      data: {
        orderId: adj.orderId,
        kind: 'note',
        message: `Order updated: ${changes.map((c) => `${c.itemName} — ${c.diff.map((d) => `${d.label}: ${d.from} → ${d.to}`).join(', ')}`).join('; ')}. New total ${fmt(totals.after.totalCents)}.`,
      },
    });
    return true;
  });
}

export interface CreateAdjustmentInput {
  orderId: string;
  changes: ItemChangeInput[];
  note?: string;
  actorId?: string;
  actorName?: string;
}

export async function createAdjustment(input: CreateAdjustmentInput) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true, number: true, paymentStatus: true, status: true } });
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.paymentStatus !== 'CAPTURED') {
    throw new HttpError(409, `Only a paid order can be adjusted this way — this one is ${order.paymentStatus}.`);
  }
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    throw new HttpError(409, `This order is ${order.status}.`);
  }
  const open = await prisma.orderAdjustment.findFirst({ where: { orderId: order.id, status: 'pending' } });
  if (open) throw new HttpError(409, 'There is already a payment request waiting on this order — cancel it before making another change.');

  const preview = await previewAdjustment(order.id, input.changes);
  if (preview.changes.every((c) => c.diff.length === 0)) throw new HttpError(400, 'Nothing changed.');

  const owes = preview.amountCents > 0;
  const adj = await prisma.orderAdjustment.create({
    data: {
      orderId: order.id,
      token: randomBytes(24).toString('hex'),
      status: owes ? 'pending' : 'paid',
      amountCents: preview.amountCents,
      note: input.note?.trim() || null,
      changes: preview.changes as unknown as object,
      totals: { before: preview.before, after: preview.after } as unknown as object,
      expiresAt: new Date(Date.now() + PAY_LINK_TTL_DAYS * 86_400_000),
      createdById: input.actorId ?? null,
    },
  });

  const summary = preview.changes
    .map((c) => `${c.itemName}: ${c.diff.map((d) => `${d.label} ${d.from} → ${d.to}`).join(', ')}`)
    .join('; ');

  if (!owes) {
    // Same price or cheaper: nothing to collect, so it takes effect now. A
    // credit is recorded for staff to refund — we never move money back
    // without a person deciding to.
    await applyAdjustment(adj.id);
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'note',
        actorId: input.actorId,
        actorName: input.actorName,
        message:
          preview.amountCents < 0
            ? `Change applied; customer is owed ${fmt(preview.amountCents)} — refund it from the Payments panel. (${summary})`
            : `Change applied at no difference in price. (${summary})`,
      },
    });
    return { adjustment: await prisma.orderAdjustment.findUnique({ where: { id: adj.id } }), payUrl: null, applied: true };
  }

  await prisma.orderStatusEvent.create({
    data: {
      orderId: order.id,
      kind: 'payment',
      actorId: input.actorId,
      actorName: input.actorName,
      message: `Payment of ${fmt(preview.amountCents)} requested for a change to the order${input.note ? ` — ${input.note.trim()}` : ''}. (${summary})`,
    },
  });
  return { adjustment: adj, payUrl: await adjustmentPayUrl(adj.token), applied: false };
}

export async function cancelAdjustment(orderId: string, adjustmentId: string, actorId?: string) {
  const cas = await prisma.orderAdjustment.updateMany({
    where: { id: adjustmentId, orderId, status: 'pending' },
    data: { status: 'cancelled' },
  });
  if (cas.count === 0) throw new HttpError(409, 'Only a pending payment request can be cancelled.');
  await prisma.orderStatusEvent.create({
    data: { orderId, kind: 'note', actorId, message: 'Payment request cancelled; the order is unchanged.' },
  });
}

// ---------------------------------------------------------------------------
// Customer-facing: pay the balance
// ---------------------------------------------------------------------------

export async function loadAdjustmentForCustomer(token: string) {
  const adj = await prisma.orderAdjustment.findUnique({
    where: { token },
    include: { order: { select: { number: true, email: true } } },
  });
  if (!adj) throw new HttpError(404, 'This payment link is not valid.');
  const expired = adj.status === 'pending' && adj.expiresAt < new Date();
  return {
    status: expired ? 'expired' : adj.status,
    amountCents: adj.amountCents,
    note: adj.note,
    changes: (adj.changes as unknown as ItemChange[]).map((c) => ({
      itemName: c.itemName,
      quantity: c.quantity,
      diff: c.diff,
      beforeTotalCents: c.before.totalCents,
      afterTotalCents: c.after.totalCents,
    })),
    totals: adj.totals as unknown as { before: Totals; after: Totals },
    orderNumber: adj.order.number,
    paidAt: adj.paidAt,
    expiresAt: adj.expiresAt,
  };
}

export async function createAdjustmentPaypalOrder(token: string): Promise<{ paypalOrderId: string }> {
  const adj = await prisma.orderAdjustment.findUnique({ where: { token }, include: { order: { select: { id: true, number: true } } } });
  if (!adj) throw new HttpError(404, 'This payment link is not valid.');
  if (adj.status !== 'pending') throw new HttpError(409, adj.status === 'cancelled' ? 'This payment request was cancelled.' : 'This balance has already been paid.');
  if (adj.expiresAt < new Date()) throw new HttpError(410, 'This payment link has expired — please ask us for a new one.');
  if (adj.amountCents <= 0) throw new HttpError(409, 'There is nothing to pay on this request.');

  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();
  const amount = (adj.amountCents / 100).toFixed(2);

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `adj_${adj.id}_${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: adj.id,
            invoice_id: `${adj.order.number}-ADJ-${adj.id.slice(-6).toUpperCase()}`,
            description: `Balance for order ${adj.order.number} (change to your order)`,
            amount: { currency_code: 'USD', value: amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
              user_action: 'PAY_NOW',
            },
          },
        },
      }),
    });
  } catch (e) {
    throw paypalNetworkError('balance order creation', e);
  }
  if (!res.ok) throw await paypalHttpError(res, 'balance order creation');
  const paypalOrder = (await res.json()) as { id: string };

  // One PENDING payment row per request; re-point it if the customer comes
  // back after an approval expired rather than piling up rows.
  const payment = adj.paymentId
    ? await prisma.payment.update({ where: { id: adj.paymentId }, data: { providerRef: paypalOrder.id, status: 'PENDING' } })
    : await prisma.payment.create({
        data: { orderId: adj.order.id, provider: 'paypal', providerRef: paypalOrder.id, amountCents: adj.amountCents, status: 'PENDING' },
      });
  await prisma.orderAdjustment.update({ where: { id: adj.id }, data: { paypalOrderId: paypalOrder.id, paymentId: payment.id } });

  return { paypalOrderId: paypalOrder.id };
}

/**
 * Mark the balance paid and apply the change. Safe to call twice (capture
 * callback + webhook): the first caller wins, the second sees `applied`.
 */
export async function settleAdjustment(adjustmentId: string, captureId: string, rawPayload: unknown): Promise<void> {
  const adj = await prisma.orderAdjustment.findUnique({ where: { id: adjustmentId } });
  if (!adj || adj.status === 'applied') return;

  if (adj.paymentId) {
    await prisma.payment.update({
      where: { id: adj.paymentId },
      data: { status: 'CAPTURED', providerRef: captureId, rawPayload: rawPayload as object },
    });
  }
  await prisma.orderAdjustment.updateMany({ where: { id: adj.id, status: 'pending' }, data: { status: 'paid', paidAt: new Date() } });
  await prisma.orderStatusEvent.create({
    data: {
      orderId: adj.orderId,
      kind: 'payment',
      message: `Balance of ${fmt(adj.amountCents)} paid via PayPal (capture ${captureId}).`,
    },
  });
  const applied = await applyAdjustment(adj.id);
  if (applied) void sendAdjustmentPaidEmail(adj.id);
}

export async function captureAdjustmentPayment(token: string, paypalOrderId: string) {
  const adj = await prisma.orderAdjustment.findUnique({ where: { token }, include: { order: { select: { number: true } } } });
  if (!adj) throw new HttpError(404, 'This payment link is not valid.');
  if (adj.status === 'paid' || adj.status === 'applied') {
    return { ok: true, orderNumber: adj.order.number, amountCents: adj.amountCents, alreadyPaid: true };
  }
  if (adj.status !== 'pending') throw new HttpError(409, 'This payment request is no longer open.');
  if (adj.paypalOrderId !== paypalOrderId) throw new HttpError(400, 'That PayPal order does not belong to this payment request.');

  const config = await getPayPalConfig();
  const accessToken = await getPayPalAccessToken();
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture_${paypalOrderId}`,
      },
    });
  } catch (e) {
    throw paypalNetworkError('balance capture', e);
  }
  if (!res.ok) throw await paypalHttpError(res, 'balance capture');

  const data = (await res.json()) as any;
  if (data.status !== 'COMPLETED') {
    if (adj.paymentId) await prisma.payment.update({ where: { id: adj.paymentId }, data: { status: 'FAILED', rawPayload: data } });
    throw new HttpError(402, `PayPal did not complete the payment (status ${data.status}). No charge was made — please try again.`);
  }
  const captureId: string = data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? paypalOrderId;
  await settleAdjustment(adj.id, captureId, data);
  return { ok: true, orderNumber: adj.order.number, amountCents: adj.amountCents, alreadyPaid: false };
}
