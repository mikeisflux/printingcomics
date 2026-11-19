/**
 * A comic shop's POS integration: the integration key that authenticates
 * /api/v1/retail and the feed URLs, the documents (invoice, shipments,
 * catalog) built from the shop's orders for its POS to import, and the
 * webhooks that tell the POS when something happened.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { getSetting } from '../settings.js';
import { cycleItems } from './catalog.js';
import { getPodSettings } from './settings.js';
import { pickTier } from './wholesale.js';
import { recordPodEvent, type Actor } from './events.js';
import type { PosDocument, PosLine } from './pos-files.js';

const KEY_PREFIX = 'pcr_';
export const hashIntegrationKey = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Mint (or replace) the shop's integration key. The raw key is returned once. */
export async function mintIntegrationKey(retailerId: string, actor: Actor): Promise<{ key: string; prefix: string }> {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const prefix = raw.slice(0, 10);
  await prisma.retailer.update({ where: { id: retailerId }, data: { integrationKeyHash: hashIntegrationKey(raw), integrationKeyPrefix: prefix, integrationKeyCreatedAt: new Date() } });
  await recordPodEvent('retailer', retailerId, 'integration-key', `Integration key ${prefix}… issued`, actor);
  return { key: raw, prefix };
}

export async function revokeIntegrationKey(retailerId: string, actor: Actor): Promise<void> {
  await prisma.retailer.update({ where: { id: retailerId }, data: { integrationKeyHash: null, integrationKeyPrefix: null, integrationKeyCreatedAt: null } });
  await recordPodEvent('retailer', retailerId, 'integration-key', 'Integration key revoked', actor);
}

/** The active shop a raw key stands for, or null. */
export async function retailerForKey(raw: string | null | undefined) {
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null;
  const r = await prisma.retailer.findFirst({ where: { integrationKeyHash: hashIntegrationKey(raw) } });
  if (!r || r.status !== 'ACTIVE') return null;
  return r;
}

export async function publicBase(): Promise<string> {
  return ((await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || 'https://printingcomics.com').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : '');
const titleOf = (l: { title: string; issueNumber: string | null; coverDescription: string | null }) =>
  `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}${l.coverDescription && !/^main/i.test(l.coverDescription) ? ` (${l.coverDescription})` : ''}`;

const orderInclude = {
  cycle: { select: { id: true, name: true, inStoreDate: true } },
  shipments: { orderBy: { createdAt: 'asc' as const }, select: { carrier: true, service: true, trackingCode: true, createdAt: true, items: { select: { orderItemId: true, quantity: true } } } },
  items: { include: { listing: { select: { upc: true, seriesName: true, issueNumber: true, coverDescription: true, format: true, pageCount: true, synopsis: true, description: true, weightOz: true, title: true, catalogKey: true, coverImage: { select: { url: true } }, partner: { select: { name: true } } } } } },
};

/** An order as the shop's POS sees it: one invoice with its shipments. */
export async function orderDocument(retailerId: string, orderNumber: string, opts: { shippedOnly?: boolean } = {}): Promise<PosDocument> {
  const o = await prisma.order.findFirst({ where: { number: orderNumber, retailerId, source: 'retailer' }, include: orderInclude });
  if (!o) throw new HttpError(404, 'Order not found');
  return documentFor(o, await publicBase(), opts);
}

type OrderWithLines = NonNullable<Awaited<ReturnType<typeof prisma.order.findFirst<{ include: typeof orderInclude }>>>>;

function documentFor(o: OrderWithLines, base: string, opts: { shippedOnly?: boolean } = {}): PosDocument {
  const w = (o.wholesale ?? {}) as { poNumber?: string | null };
  const shippedQty = new Map<string, number>();
  for (const s of o.shipments) for (const it of s.items) shippedQty.set(it.orderItemId, (shippedQty.get(it.orderItemId) ?? 0) + it.quantity);
  const lines: PosLine[] = o.items.map((it) => {
    const l = it.listing;
    const opt = (it.options ?? {}) as { catalogKey?: string; publisher?: string };
    const qty = opts.shippedOnly ? (shippedQty.get(it.id) ?? 0) : it.quantity;
    return {
      catalogKey: l?.catalogKey ?? opt.catalogKey ?? '', upc: l?.upc ?? null, title: l ? titleOf(l) : it.name, seriesName: l?.seriesName ?? null, issueNumber: l?.issueNumber ?? null, coverDescription: l?.coverDescription ?? null,
      publisher: l?.partner.name ?? opt.publisher ?? '', format: l?.format ?? 'comic', pageCount: l?.pageCount ?? null, description: l?.synopsis ?? l?.description ?? null, coverImageUrl: l?.coverImage?.url ? absolute(base, l.coverImage.url) : null, weightOz: l?.weightOz ?? null,
      quantity: qty, msrpCents: ((it.wholesale ?? {}) as { msrpCents?: number }).msrpCents ?? it.unitPriceCents, unitCents: it.unitPriceCents, totalCents: qty * it.unitPriceCents, releaseDate: d(o.cycle?.inStoreDate),
    };
  }).filter((l) => l.quantity > 0 || !opts.shippedOnly);
  return {
    number: o.number, date: d(o.shipments[0]?.createdAt ?? o.updatedAt), catalogName: o.cycle?.name ?? '', poNumber: w.poNumber ?? null,
    shipping: o.shipments.map((s) => ({ carrier: s.carrier, service: s.service, trackingCode: s.trackingCode, date: d(s.createdAt) })),
    lines,
  };
}

/** Cover image links in files must be absolute: the POS fetches them from elsewhere. */
const absolute = (base: string, url: string) => (/^https?:\/\//.test(url) ? url : `${base}${url}`);

/** Every shipment to the shop since a date, one document per order, newest first. */
export async function shipmentDocuments(retailerId: string, since: Date | null): Promise<PosDocument[]> {
  const base = await publicBase();
  const orders = await prisma.order.findMany({
    where: { retailerId, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] }, shipments: { some: since ? { createdAt: { gte: since } } : {} } },
    orderBy: { updatedAt: 'desc' }, take: 200, include: orderInclude,
  });
  return orders.map((o) => documentFor(o, base, { shippedOnly: true })).filter((doc) => doc.lines.length > 0);
}

/** A published catalog as pre-order lines at the shop's wholesale price. */
export async function catalogDocument(retailer: { tierOverride: number | null }, cycleId: string): Promise<{ cycle: { id: string; name: string; slug: string; catalogDate: string; focDate: string; inStoreDate: string }; lines: PosLine[] }> {
  const base = await publicBase();
  const cycle = await prisma.catalogCycle.findUnique({ where: { id: cycleId } });
  if (!cycle || !cycle.publishedAt) throw new HttpError(404, 'Catalog not found');
  const s = await getPodSettings();
  const items = await cycleItems(cycle.id);
  const tier = pickTier(s.tiers, 0, retailer.tierOverride);
  const lines: PosLine[] = items.map((i) => ({
    catalogKey: i.catalogKey, upc: i.upc, title: titleOf(i), seriesName: i.seriesName, issueNumber: i.issueNumber, coverDescription: i.coverDescription, publisher: i.partner.name, format: i.format, pageCount: i.pageCount,
    description: i.synopsis ?? i.description, coverImageUrl: i.coverImageUrl ? absolute(base, i.coverImageUrl) : null, weightOz: null,
    quantity: 0, msrpCents: i.msrpCents, unitCents: Math.round((i.msrpCents * (10_000 - tier.tier.discountBps)) / 10_000), totalCents: 0, releaseDate: d(cycle.inStoreDate),
  }));
  return { cycle: { id: cycle.id, name: cycle.name, slug: cycle.slug, catalogDate: d(cycle.catalogDate), focDate: d(cycle.focDate), inStoreDate: d(cycle.inStoreDate) }, lines };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type RetailerWebhookEvent = 'order.placed' | 'order.updated' | 'order.canceled' | 'invoice.ready' | 'order.paid' | 'shipment.created' | 'order.shipped' | 'ping';

export function signRetailerWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/**
 * Tell the shop's system what happened. Never throws: a dead endpoint must
 * not break the order it is about. Every attempt is logged for the shop to
 * see on its integrations page.
 */
export async function dispatchRetailerWebhook(retailerId: string, event: RetailerWebhookEvent, orderId: string | null, payload: unknown): Promise<{ succeeded: boolean; statusCode: number | null; error: string | null } | null> {
  const r = await prisma.retailer.findUnique({ where: { id: retailerId }, select: { webhookUrl: true, webhookSecret: true } });
  if (!r?.webhookUrl) return null;
  const body = JSON.stringify({ event, orderId, data: payload, sentAt: new Date().toISOString() });
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'PrintingComics-Distribution-Webhook/1.0', 'X-PC-Event': event };
  if (r.webhookSecret) headers['X-PC-Signature'] = signRetailerWebhook(r.webhookSecret, body);
  let statusCode: number | null = null; let responseBody: string | null = null; let error: string | null = null; let succeeded = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(r.webhookUrl, { method: 'POST', headers, body, signal: controller.signal });
      statusCode = res.status; responseBody = (await res.text().catch(() => '')).slice(0, 2000); succeeded = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } finally { clearTimeout(timeout); }
  } catch (e: any) { error = e?.message ? String(e.message).slice(0, 300) : 'Network error'; }
  await prisma.retailerWebhookDelivery.create({ data: { retailerId, event, orderId, url: r.webhookUrl, payload: payload as object, statusCode, responseBody, error, succeeded } }).catch(() => undefined);
  return { succeeded, statusCode, error };
}

/** The order as it goes out in a webhook: enough for a POS to act on without another call. */
export async function orderWebhookPayload(orderId: string) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!o) return null;
  const doc = documentFor(o, await publicBase());
  const w = (o.wholesale ?? {}) as { tierName?: string; poNumber?: string | null };
  return {
    number: o.number, status: o.status, paymentStatus: o.paymentStatus, catalog: o.cycle ? { id: o.cycle.id, name: o.cycle.name, inStoreDate: d(o.cycle.inStoreDate) } : null,
    poNumber: w.poNumber ?? null, tier: w.tierName ?? null, subtotalCents: o.subtotalCents, shippingCents: o.shippingCents, discountCents: o.discountCents, totalCents: o.totalCents, trackingNumber: o.trackingNumber,
    shipments: doc.shipping, lines: doc.lines.map((l) => ({ catalogKey: l.catalogKey, upc: l.upc, title: l.title, publisher: l.publisher, quantity: l.quantity, msrpCents: l.msrpCents, unitCents: l.unitCents, totalCents: l.totalCents, releaseDate: l.releaseDate })),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** Fire-and-forget: the event with the order attached. */
export function notifyRetailerSystem(retailerId: string | null | undefined, event: RetailerWebhookEvent, orderId: string): void {
  if (!retailerId) return;
  void orderWebhookPayload(orderId).then((p) => (p ? dispatchRetailerWebhook(retailerId, event, orderId, p) : null)).catch(() => undefined);
}
