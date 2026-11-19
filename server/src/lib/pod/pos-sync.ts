/**
 * The shop's live POS link: connect (credentials encrypted at rest), test,
 * and push. Two pushes happen on their own: the titles a shop orders are
 * created in its POS (zero stock) so pre-orders can be taken, and when a
 * box ships the copies are received into stock with the wholesale cost.
 * Every push is logged per shipment so a box is never received twice.
 */
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { getSetting, setSetting } from '../settings.js';
import { recordPodEvent, type Actor } from './events.js';
import { orderDocument } from './integration.js';
import type { PosLine } from './pos-files.js';
import { LightspeedRAdapter, type LightspeedRSecrets } from './pos-connect/lightspeed-r.js';
import { LightspeedXAdapter, type LightspeedXSecrets } from './pos-connect/lightspeed-x.js';
import { ShopifyAdapter, type ShopifySecrets } from './pos-connect/shopify.js';
import type { PosAdapter, PosConnectionInput, PosKind, PosLineResult } from './pos-connect/types.js';

export const POS_KINDS: PosKind[] = ['lightspeed_x', 'lightspeed_r', 'shopify'];
export const POS_KIND_LABELS: Record<PosKind, string> = { shopify: 'Shopify / Shopify POS', lightspeed_x: 'Lightspeed Retail (X-Series)', lightspeed_r: 'Lightspeed Retail (R-Series)' };

// ---------------------------------------------------------------------------
// Our own app credentials (for the Connect buttons): admin settings
// ---------------------------------------------------------------------------

export interface PosAppSettings { shopify: { clientId: string; clientSecret: string }; lightspeedR: { clientId: string; clientSecret: string } }
const APPS_KEY = 'pod.posApps';

export async function getPosApps(): Promise<PosAppSettings> {
  const raw = (await getSetting<Record<string, { clientId?: string; clientSecret?: string }>>(APPS_KEY)) ?? {};
  const read = (k: string) => ({ clientId: String(raw[k]?.clientId ?? ''), clientSecret: raw[k]?.clientSecret ? safeDecrypt(raw[k]!.clientSecret!) : '' });
  return { shopify: read('shopify'), lightspeedR: read('lightspeedR') };
}
function safeDecrypt(v: string): string { try { return decryptSecret(v); } catch { return ''; } }
export async function savePosApps(input: { shopify?: { clientId?: string; clientSecret?: string | null }; lightspeedR?: { clientId?: string; clientSecret?: string | null } }): Promise<PosAppSettings> {
  const cur = (await getSetting<Record<string, { clientId?: string; clientSecret?: string }>>(APPS_KEY)) ?? {};
  for (const k of ['shopify', 'lightspeedR'] as const) {
    const i = input[k]; if (!i) continue;
    const prev = cur[k] ?? {};
    cur[k] = { clientId: (i.clientId ?? prev.clientId ?? '').trim(), clientSecret: i.clientSecret === undefined ? prev.clientSecret : i.clientSecret ? encryptSecret(i.clientSecret.trim()) : undefined };
  }
  await setSetting(APPS_KEY, cur);
  return getPosApps();
}
/** What the admin page shows: ids in full, secrets only as "set". */
export async function posAppsView() {
  const a = await getPosApps();
  return { shopify: { clientId: a.shopify.clientId, hasSecret: Boolean(a.shopify.clientSecret) }, lightspeedR: { clientId: a.lightspeedR.clientId, hasSecret: Boolean(a.lightspeedR.clientSecret) } };
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export async function connectPos(retailerId: string, input: PosConnectionInput, actor: Actor) {
  const data = { kind: input.kind, mode: input.mode, shop: input.shop, secrets: encryptSecret(JSON.stringify(input.secrets)), locationId: input.locationId, locationName: null as string | null, status: 'connected', lastError: null as string | null };
  const c = await prisma.retailerPosConnection.upsert({ where: { retailerId }, create: { retailerId, ...data }, update: data });
  // Prove it works and learn the locations before anyone relies on it.
  const t = await testPos(retailerId);
  if (!t.ok) {
    await prisma.retailerPosConnection.update({ where: { id: c.id }, data: { status: 'error', lastError: t.error ?? 'The store did not answer' } });
    throw new HttpError(400, `Connected, but the store did not answer: ${t.error ?? 'no details'}. Check the credentials and try again.`);
  }
  const location = (input.locationId ? t.locations.find((l) => l.id === input.locationId) : undefined) ?? t.locations[0] ?? null;
  await prisma.retailerPosConnection.update({ where: { id: c.id }, data: { locationId: location?.id ?? null, locationName: location?.name ?? null } });
  await recordPodEvent('retailer', retailerId, 'pos-connected', `${POS_KIND_LABELS[input.kind]} connected (${t.account})`, actor);
  return posView(retailerId);
}

export async function disconnectPos(retailerId: string, actor: Actor) {
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId } });
  if (c) { await prisma.retailerPosConnection.delete({ where: { id: c.id } }); await recordPodEvent('retailer', retailerId, 'pos-disconnected', `${POS_KIND_LABELS[c.kind as PosKind] ?? c.kind} disconnected`, actor); }
  return posView(retailerId);
}

export async function setPosOptions(retailerId: string, opts: { locationId?: string | null; syncShipments?: boolean; syncOrders?: boolean }) {
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId } });
  if (!c) throw new HttpError(404, 'No point of sale is connected');
  let locationName = c.locationName;
  if (opts.locationId !== undefined && opts.locationId !== c.locationId) {
    const t = await testPos(retailerId);
    const l = t.locations.find((x) => x.id === opts.locationId);
    if (!l) throw new HttpError(400, 'That location is not one the store lists');
    locationName = l.name;
  }
  await prisma.retailerPosConnection.update({ where: { id: c.id }, data: { ...(opts.locationId !== undefined ? { locationId: opts.locationId, locationName } : {}), ...(opts.syncShipments !== undefined ? { syncShipments: opts.syncShipments } : {}), ...(opts.syncOrders !== undefined ? { syncOrders: opts.syncOrders } : {}) } });
  return posView(retailerId);
}

async function adapterFor(c: { kind: string; mode: string; shop: string; secrets: string }): Promise<PosAdapter> {
  const secrets = JSON.parse(decryptSecret(c.secrets)) as Record<string, unknown>;
  if (c.kind === 'shopify') return new ShopifyAdapter(c.shop, c.mode as 'oauth' | 'client_credentials' | 'token', secrets as ShopifySecrets);
  if (c.kind === 'lightspeed_x') return new LightspeedXAdapter(c.shop, secrets as unknown as LightspeedXSecrets);
  if (c.kind === 'lightspeed_r') {
    const apps = await getPosApps();
    return new LightspeedRAdapter(c.shop, { ...(secrets as unknown as LightspeedRSecrets), clientId: apps.lightspeedR.clientId, clientSecret: apps.lightspeedR.clientSecret });
  }
  throw new HttpError(400, `Unknown point of sale: ${c.kind}`);
}

/** Renewed tokens go back into the row so the next call does not renew again. */
async function keepSecrets(connectionId: string, adapter: PosAdapter) {
  const upd = adapter.updatedSecrets();
  if (upd) await prisma.retailerPosConnection.update({ where: { id: connectionId }, data: { secrets: encryptSecret(JSON.stringify(upd)) } }).catch(() => undefined);
}

export async function testPos(retailerId: string) {
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId } });
  if (!c) throw new HttpError(404, 'No point of sale is connected');
  const adapter = await adapterFor(c);
  const t = await adapter.test();
  await keepSecrets(c.id, adapter);
  await prisma.retailerPosConnection.update({ where: { id: c.id }, data: { status: t.ok ? 'connected' : 'error', lastError: t.ok ? null : t.error ?? 'failed' } });
  await prisma.retailerPosSync.create({ data: { connectionId: c.id, retailerId, kind: 'test', succeeded: t.ok, summary: t.ok ? `Connected to ${t.account}; ${t.locations.length} location(s)` : `Could not connect: ${t.error}`, detail: { locations: t.locations } as object } });
  return t;
}

/** The connection as the portal shows it: no secrets, the recent log. */
export async function posView(retailerId: string) {
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId } });
  const syncs = await prisma.retailerPosSync.findMany({ where: { retailerId }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, kind: true, orderId: true, succeeded: true, summary: true, detail: true, createdAt: true } });
  const apps = await getPosApps();
  return {
    connection: c ? { kind: c.kind, mode: c.mode, shop: c.shop, locationId: c.locationId, locationName: c.locationName, syncShipments: c.syncShipments, syncOrders: c.syncOrders, status: c.status, lastError: c.lastError, lastSyncAt: c.lastSyncAt, createdAt: c.createdAt } : null,
    kinds: POS_KINDS.map((k) => ({ key: k, label: POS_KIND_LABELS[k] })),
    // Connect buttons only for the systems we hold app credentials for.
    oauth: { shopify: Boolean(apps.shopify.clientId && apps.shopify.clientSecret), lightspeed_r: Boolean(apps.lightspeedR.clientId && apps.lightspeedR.clientSecret) },
    syncs,
  };
}

// ---------------------------------------------------------------------------
// Pushes
// ---------------------------------------------------------------------------

function summarize(results: PosLineResult[], receive: boolean): { ok: boolean; summary: string } {
  const ok = results.filter((r) => r.ok); const bad = results.filter((r) => !r.ok);
  const copies = ok.reduce((a, r) => a + r.received, 0);
  const created = ok.filter((r) => r.action === 'created').length;
  const parts = [`${ok.length} of ${results.length} title(s) ${receive ? 'received' : 'in place'}`, created ? `${created} created` : '', receive ? `${copies} copies into stock` : ''].filter(Boolean);
  if (bad.length) parts.push(`${bad.length} failed: ${bad.map((b) => `${b.catalogKey} (${b.error})`).join('; ').slice(0, 400)}`);
  return { ok: bad.length === 0, summary: parts.join(' · ') };
}

async function runPush(retailerId: string, lines: PosLine[], args: { kind: 'shipment' | 'order' | 'catalog'; orderId: string | null; shipmentId: string | null; receive: boolean; reference: string }): Promise<{ ok: boolean; summary: string } | null> {
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId } });
  if (!c) return null;
  if (!c.locationId) { await prisma.retailerPosSync.create({ data: { connectionId: c.id, retailerId, kind: args.kind, orderId: args.orderId, shipmentId: args.shipmentId, succeeded: false, summary: 'No location picked for stock; choose one under POS & integrations' } }); return { ok: false, summary: 'no location' }; }
  let result: { ok: boolean; summary: string }; let detail: unknown = null;
  try {
    const adapter = await adapterFor(c);
    const results = await adapter.push(lines, { locationId: c.locationId, receive: args.receive, reference: args.reference });
    await keepSecrets(c.id, adapter);
    result = summarize(results, args.receive); detail = results;
  } catch (e: any) { result = { ok: false, summary: `Push failed: ${(e?.message ?? String(e)).slice(0, 300)}` }; }
  await prisma.retailerPosSync.create({ data: { connectionId: c.id, retailerId, kind: args.kind, orderId: args.orderId, shipmentId: args.shipmentId, succeeded: result.ok, summary: result.summary, detail: detail as object | undefined } });
  await prisma.retailerPosConnection.update({ where: { id: c.id }, data: { lastSyncAt: new Date(), status: result.ok ? 'connected' : 'error', lastError: result.ok ? null : result.summary } });
  return result;
}

/** A box shipped: its lines, with the copies in that box, go into stock. Once per shipment. */
export async function syncShipmentToPos(shipmentId: string): Promise<{ ok: boolean; summary: string } | null> {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { select: { id: true, number: true, retailerId: true, source: true } }, items: { select: { orderItemId: true, quantity: true } } } });
  if (!s || s.order.source !== 'retailer' || !s.order.retailerId) return null;
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId: s.order.retailerId } });
  if (!c || !c.syncShipments) return null;
  if (await prisma.retailerPosSync.findFirst({ where: { shipmentId, succeeded: true } })) return null;
  const doc = await orderDocument(s.order.retailerId, s.order.number);
  // Only this box's lines, at this box's quantities.
  const qtyByItem = new Map(s.items.map((i) => [i.orderItemId, i.quantity]));
  const items = await prisma.orderItem.findMany({ where: { orderId: s.order.id }, select: { id: true, listing: { select: { catalogKey: true } }, options: true } });
  const keyOf = new Map(items.map((i) => [i.id, i.listing?.catalogKey ?? (i.options as { catalogKey?: string } | null)?.catalogKey ?? '']));
  const lines: PosLine[] = [];
  for (const [itemId, qty] of qtyByItem) {
    const key = keyOf.get(itemId); const base = doc.lines.find((l) => l.catalogKey === key);
    if (base && qty > 0) lines.push({ ...base, quantity: qty, totalCents: qty * base.unitCents });
  }
  if (!lines.length) return null;
  return runPush(s.order.retailerId, lines, { kind: 'shipment', orderId: s.order.id, shipmentId, receive: true, reference: `${s.order.number}/${s.trackingCode ?? shipmentId.slice(-6)}` });
}

/** The shop ordered: the titles exist in its POS (no stock yet) so pre-orders can be taken against them. */
export async function syncOrderToPos(orderId: string): Promise<{ ok: boolean; summary: string } | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, retailerId: true, source: true } });
  if (!o || o.source !== 'retailer' || !o.retailerId) return null;
  const c = await prisma.retailerPosConnection.findUnique({ where: { retailerId: o.retailerId } });
  if (!c || !c.syncOrders) return null;
  const doc = await orderDocument(o.retailerId, o.number);
  return runPush(o.retailerId, doc.lines.map((l) => ({ ...l, quantity: 0, totalCents: 0 })), { kind: 'order', orderId: o.id, shipmentId: null, receive: false, reference: o.number });
}

/** Staff or the shop ask for an order to be pushed again (every shipment on it, those not yet received). */
export async function syncOrderShipmentsToPos(retailerId: string, orderNumber: string): Promise<{ ok: boolean; summary: string }[]> {
  const o = await prisma.order.findFirst({ where: { number: orderNumber, retailerId, source: 'retailer' }, select: { id: true, shipments: { select: { id: true } } } });
  if (!o) throw new HttpError(404, 'Order not found');
  const out: { ok: boolean; summary: string }[] = [];
  if (!o.shipments.length) { const r = await syncOrderToPos(o.id); if (r) out.push(r); return out; }
  for (const s of o.shipments) { const r = await syncShipmentToPos(s.id); if (r) out.push(r); }
  if (!out.length) out.push({ ok: true, summary: 'Every shipment on this order was already received into the POS' });
  return out;
}

/** Fire-and-forget hooks for the fulfillment and order paths. */
export function posAfterShipment(shipmentId: string): void { void syncShipmentToPos(shipmentId).catch((e: any) => console.warn('[pos] shipment sync failed:', e?.message ?? e)); }
export function posAfterOrder(orderId: string): void { void syncOrderToPos(orderId).catch((e: any) => console.warn('[pos] order sync failed:', e?.message ?? e)); }
