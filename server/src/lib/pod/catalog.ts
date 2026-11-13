/**
 * Listings and catalog cycles: the workflow a publisher's book goes through
 * (draft → submitted → approved → live), the storefront Product an approved
 * listing becomes, and what happens when a cycle publishes (snapshot) and
 * locks at FOC (production orders for the books we print, purchase orders
 * for the books the publisher ships, ledger entries for the money).
 */
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { computePricing, type PricingConfig } from '../pricing.js';
import { getPodSettings, type PodSettings } from './settings.js';
import { priceWholesale, type WholesaleTitle } from './wholesale.js';
import { numbering, recordPodEvent, slugify, type Actor } from './events.js';

export const LISTING_STATUSES = ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'LIVE', 'REJECTED', 'ARCHIVED'] as const;
export type ListingStatusKey = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatusKey, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Pending review', CHANGES_REQUESTED: 'Changes requested', APPROVED: 'Approved',
  SCHEDULED: 'Scheduled', LIVE: 'Live', REJECTED: 'Rejected', ARCHIVED: 'Archived',
};

/** States a publisher may still edit in. */
export const PARTNER_EDITABLE = new Set<ListingStatusKey>(['DRAFT', 'CHANGES_REQUESTED']);
/** States that make a listing eligible for a catalog snapshot. */
export const CATALOG_ELIGIBLE = new Set<ListingStatusKey>(['APPROVED', 'SCHEDULED', 'LIVE']);

export const FORMATS = ['comic', 'graphic_novel', 'magazine', 'zine', 'other'] as const;
export const FORMAT_LABELS: Record<string, string> = { comic: 'Comic book', graphic_novel: 'Graphic novel', magazine: 'Magazine', zine: 'Zine', other: 'Other' };

/** SERIESCODE-last5(UPC); falls back to the title when either is missing. */
export function deriveCatalogKey(input: { seriesCode?: string | null; upc?: string | null; title?: string | null }): string {
  const code = (input.seriesCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const digits = (input.upc ?? '').replace(/\D/g, '');
  if (code && digits.length >= 5) return `${code}-${digits.slice(-5)}`;
  if (code) return `${code}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const t = slugify(input.title ?? 'title').toUpperCase().replace(/-/g, '').slice(0, 8) || 'TITLE';
  return `${t}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

export async function uniqueCatalogKey(wanted: string, exceptId?: string): Promise<string> {
  let key = wanted;
  for (let i = 2; i < 100; i++) {
    const row = await prisma.listing.findUnique({ where: { catalogKey: key }, select: { id: true } });
    if (!row || row.id === exceptId) return key;
    key = `${wanted}-${i}`;
  }
  throw new HttpError(409, `Catalog id ${wanted} is taken`);
}

// ---------------------------------------------------------------------------
// Print cost: what we charge the publisher per copy for a PRINTED_BY_US run,
// read from our own configurator products. Staff only; never shown outside
// /admin or the publisher's own statement line.
// ---------------------------------------------------------------------------

const TRIMS: { slug: string; w: number; h: number }[] = [
  { slug: 'standard', w: 6.625, h: 10.25 },
  { slug: 'letter', w: 8.5, h: 11 },
  { slug: 'magazine', w: 8, h: 10.5 },
  { slug: 'a5', w: 5.8, h: 8.3 },
];

export function productSlugForListing(l: { format: string; trimWidthIn: number | null; trimHeightIn: number | null }): string | null {
  const w = Number(l.trimWidthIn);
  const h = Number(l.trimHeightIn);
  if (!(w > 0 && h > 0)) return null;
  const trim = TRIMS.find((t) => Math.abs(t.w - w) <= 0.15 && Math.abs(t.h - h) <= 0.15);
  if (!trim) return null;
  return `${l.format === 'graphic_novel' ? 'graphic-novel' : 'comic'}-${trim.slug}-size`;
}

export interface PrintCost { unitCents: number; totalCents: number; productSlug: string; options: Record<string, string | number> }

export async function estimatePrintCost(l: { format: string; trimWidthIn: number | null; trimHeightIn: number | null; pageCount: number | null; interiorColor: string | null }, quantity: number): Promise<PrintCost | null> {
  const slug = productSlugForListing(l);
  if (!slug || !l.pageCount || quantity < 1) return null;
  const product = await prisma.product.findUnique({ where: { slug }, select: { pricingConfig: true } });
  if (!product?.pricingConfig) return null;
  const options: Record<string, string | number> = {
    cover_paper: 'Standard Gloss', interior_paper: 'Gloss', embellishment: 'None',
    interior_color: l.interiorColor === 'bw' ? 'Grayscale' : 'Full Color',
    interior_pages: l.pageCount,
  };
  try {
    const b = computePricing(product.pricingConfig as unknown as PricingConfig, { quantity, options });
    return { unitCents: b.unitCents, totalCents: b.totalCents, productSlug: slug, options };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The storefront product behind a listing
// ---------------------------------------------------------------------------

async function podCategoryId(): Promise<string> {
  const slug = 'print-on-demand';
  const found = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (found) return found.id;
  const c = await prisma.category.create({ data: { slug, name: 'Print On Demand', description: 'Comics and graphic novels from independent publishers, printed to order.' } });
  return c.id;
}

/** Create or refresh the Product an approved listing sells through. */
export async function syncListingProduct(listingId: string): Promise<string> {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { partner: { select: { name: true } }, coverImage: true } });
  if (!l) throw new HttpError(404, 'Listing not found');
  const name = [l.title, l.issueNumber ? `#${l.issueNumber}` : null, l.coverDescription && !/^main/i.test(l.coverDescription) ? `(${l.coverDescription})` : null].filter(Boolean).join(' ');
  const descr = [l.description, l.synopsis].filter(Boolean).join('\n\n');
  const credits = [l.writer && `Writer: ${l.writer}`, l.artist && `Artist: ${l.artist}`, l.coverArtist && `Cover: ${l.coverArtist}`].filter(Boolean).join(' · ');
  const base = {
    name,
    shortDescription: `${l.partner.name}${l.pageCount ? ` · ${l.pageCount} pages` : ''}${credits ? ` · ${credits}` : ''}`.slice(0, 250),
    description: descr || null,
    priceCents: l.msrpCents,
    active: l.status === 'LIVE',
    // A catalog book is bought like a stock item: a flat cover price, no
    // options, no customer files. (The product page treats a product with
    // no pricingConfig and no options as flat-priced.)
    madeToOrder: false,
    trackStock: l.fulfillment === 'CONSIGNMENT',
    stock: l.fulfillment === 'CONSIGNMENT' ? Math.max(0, l.inventoryUnits) : 0,
    sku: l.catalogKey,
    minQuantity: 1,
    weightGrams: l.weightOz ? Math.round(l.weightOz * 28.35) : 120,
    unitLengthIn: l.trimWidthIn ?? null,
    unitWidthIn: l.trimHeightIn ?? null,
    unitHeightIn: l.pageCount ? Math.max(0.05, l.pageCount * 0.004) : 0.1,
    pricingConfig: Prisma.DbNull,
    seoTitle: `${name} — ${l.partner.name}`,
    seoDescription: (l.synopsis || l.description || `${name} by ${l.partner.name}, printed to order.`).slice(0, 160),
  };
  let productId = l.productId;
  if (productId) {
    await prisma.product.update({ where: { id: productId }, data: base });
  } else {
    let slug = `pod-${slugify(l.catalogKey)}`;
    for (let i = 2; await prisma.product.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `pod-${slugify(l.catalogKey)}-${i}`;
    const p = await prisma.product.create({ data: { ...base, slug, categories: { create: { categoryId: await podCategoryId() } } } });
    productId = p.id;
    await prisma.listing.update({ where: { id: l.id }, data: { productId } });
  }
  if (l.coverImage) {
    const existing = await prisma.productImage.findFirst({ where: { productId, url: l.coverImage.url }, select: { id: true } });
    if (!existing) {
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.productImage.create({ data: { productId, url: l.coverImage.url, alt: name, sortOrder: 0 } });
    }
  }
  return productId;
}

// ---------------------------------------------------------------------------
// Listing status transitions
// ---------------------------------------------------------------------------

export async function setListingStatus(listingId: string, to: ListingStatusKey, actor: Actor, note?: string | null): Promise<void> {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, select: { status: true, productId: true } });
  if (!l) throw new HttpError(404, 'Listing not found');
  const now = new Date();
  const data: Prisma.ListingUpdateInput = { status: to };
  if (to === 'SUBMITTED') data.submittedAt = now;
  if (to === 'APPROVED') { data.approvedAt = now; data.reviewNote = null; }
  if (to === 'CHANGES_REQUESTED' || to === 'REJECTED') data.reviewNote = note ?? null;
  if (to === 'REJECTED') data.rejectedAt = now;
  if (to === 'LIVE') data.publishedAt = now;
  if (to === 'ARCHIVED') data.archivedAt = now;
  await prisma.listing.update({ where: { id: listingId }, data });
  if (to === 'APPROVED' || to === 'LIVE' || to === 'SCHEDULED') await syncListingProduct(listingId);
  else if (l.productId) await prisma.product.update({ where: { id: l.productId }, data: { active: false } });
  await recordPodEvent('listing', listingId, 'status', `${LISTING_STATUS_LABELS[l.status as ListingStatusKey] ?? l.status} → ${LISTING_STATUS_LABELS[to]}${note ? ` — ${note}` : ''}`, actor);
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

export const CYCLE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', OPEN: 'Open to publishers', PUBLISHED: 'Published — ordering open', FOC_LOCKED: 'FOC locked', CLOSED: 'Closed',
};

export function cycleOrderingOpen(c: { status: string; retailerOpen: boolean; focDate: Date; focOverrideOpen: boolean }, now = new Date()): boolean {
  if (c.status !== 'PUBLISHED' || !c.retailerOpen) return false;
  if (c.focOverrideOpen) return true;
  return now.getTime() <= new Date(c.focDate).setHours(23, 59, 59, 999);
}

/** The cycle shops order from right now: published, ordering open, nearest FOC first. */
export async function currentRetailerCycle() {
  const cycles = await prisma.catalogCycle.findMany({ where: { status: 'PUBLISHED' }, orderBy: { focDate: 'asc' } });
  return cycles.find((c) => cycleOrderingOpen(c)) ?? null;
}

/** The cycle publishers may attach new listings to. */
export async function currentPublisherCycle() {
  return prisma.catalogCycle.findFirst({ where: { status: { in: ['DRAFT', 'OPEN'] }, publisherOpen: true }, orderBy: { catalogDate: 'asc' } });
}

export function listingSnapshot(l: Prisma.ListingGetPayload<{ include: { partner: { select: { id: true; name: true; slug: true } }; coverImage: true } }>) {
  return {
    listingId: l.id, catalogKey: l.catalogKey, title: l.title, seriesName: l.seriesName, issueNumber: l.issueNumber, coverDescription: l.coverDescription,
    variantNumber: l.variantNumber, upc: l.upc, format: l.format, pageCount: l.pageCount, trimWidthIn: l.trimWidthIn, trimHeightIn: l.trimHeightIn,
    interiorColor: l.interiorColor, msrpCents: l.msrpCents, writer: l.writer, artist: l.artist, coverArtist: l.coverArtist, ageRating: l.ageRating,
    description: l.description, synopsis: l.synopsis, incentiveRatio: l.incentiveRatio, incentiveQualifierKey: l.incentiveQualifierKey,
    reorderable: l.reorderable, fulfillment: l.fulfillment, productId: l.productId,
    partner: { id: l.partner.id, name: l.partner.name, slug: l.partner.slug },
    coverImageUrl: l.coverImage?.url ?? null,
  };
}
export type ListingSnapshot = ReturnType<typeof listingSnapshot>;

/** Publish (or republish) a cycle: every eligible listing goes LIVE and is snapshotted at a new version. */
export async function publishCycle(cycleId: string, actor: Actor): Promise<{ version: number; count: number }> {
  const cycle = await prisma.catalogCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new HttpError(404, 'Cycle not found');
  if (cycle.status === 'CLOSED') throw new HttpError(400, 'A closed cycle cannot be published');
  const listings = await prisma.listing.findMany({
    where: { cycleId, status: { in: [...CATALOG_ELIGIBLE] } },
    include: { partner: { select: { id: true, name: true, slug: true } }, coverImage: true },
  });
  if (!listings.length) throw new HttpError(400, 'Nothing to publish: no approved listings are attached to this cycle.');
  const version = cycle.version + 1;
  await prisma.$transaction(async (tx) => {
    for (const l of listings) {
      await tx.catalogCycleItem.create({ data: { cycleId, listingId: l.id, version, snapshot: listingSnapshot(l) as unknown as Prisma.InputJsonValue } });
    }
    await tx.listing.updateMany({ where: { id: { in: listings.map((l) => l.id) }, status: { in: ['APPROVED', 'SCHEDULED'] } }, data: { status: 'LIVE', publishedAt: new Date() } });
    await tx.catalogCycle.update({ where: { id: cycleId }, data: { status: cycle.status === 'FOC_LOCKED' ? 'FOC_LOCKED' : 'PUBLISHED', version, publishedAt: cycle.publishedAt ?? new Date(), retailerOpen: cycle.status === 'FOC_LOCKED' ? cycle.retailerOpen : true } });
  });
  for (const l of listings) await syncListingProduct(l.id);
  await recordPodEvent('cycle', cycleId, 'published', `Version ${version}: ${listings.length} listing${listings.length === 1 ? '' : 's'} live`, actor);
  return { version, count: listings.length };
}

/** The newest snapshot of each listing in a cycle. */
export async function cycleItems(cycleId: string): Promise<ListingSnapshot[]> {
  const items = await prisma.catalogCycleItem.findMany({ where: { cycleId }, orderBy: [{ listingId: 'asc' }, { version: 'desc' }] });
  const seen = new Set<string>();
  const out: ListingSnapshot[] = [];
  for (const it of items) {
    if (seen.has(it.listingId)) continue;
    seen.add(it.listingId);
    out.push(it.snapshot as unknown as ListingSnapshot);
  }
  return out.sort((a, b) => a.partner.name.localeCompare(b.partner.name) || a.title.localeCompare(b.title));
}

export function snapshotsAsTitles(items: ListingSnapshot[]): WholesaleTitle[] {
  return items.map((s) => ({ id: s.listingId, catalogKey: s.catalogKey, title: s.title, msrpCents: s.msrpCents, partnerId: s.partner.id, seriesName: s.seriesName, issueNumber: s.issueNumber, incentiveRatio: s.incentiveRatio, incentiveQualifierKey: s.incentiveQualifierKey, reorderable: s.reorderable }));
}

interface LockSummary { productionOrders: number; purchaseOrders: number; ledgerEntries: number; units: number }

/**
 * Final order cutoff. Ordering closes; every retailer line in the cycle is
 * tallied per listing; PRINTED_BY_US listings get a production order (and
 * printing is charged against the publisher), PARTNER_SHIPS listings go on
 * a purchase order to the publisher; wholesale revenue and commission land
 * in the ledger. Running it again only adds what is missing.
 */
export async function lockCycle(cycleId: string, actor: Actor): Promise<LockSummary> {
  const cycle = await prisma.catalogCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new HttpError(404, 'Cycle not found');
  if (cycle.status !== 'PUBLISHED' && cycle.status !== 'FOC_LOCKED') throw new HttpError(400, 'Only a published cycle can be locked');
  const settings = await getPodSettings();
  const orders = await prisma.order.findMany({
    where: { cycleId, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
    include: { items: { where: { listingId: { not: null } } }, retailer: { select: { id: true, name: true } } },
  });
  // Tally per listing.
  const tally = new Map<string, { qty: number; wholesaleCents: number; shipTo: { retailerName: string; qty: number; address: unknown; orderNumber: string }[] }>();
  for (const o of orders) {
    for (const it of o.items) {
      const t = tally.get(it.listingId!) ?? { qty: 0, wholesaleCents: 0, shipTo: [] };
      t.qty += it.quantity;
      t.wholesaleCents += it.totalCents;
      t.shipTo.push({ retailerName: o.retailer?.name ?? o.email, qty: it.quantity, address: o.shippingAddress, orderNumber: o.number });
      tally.set(it.listingId!, t);
    }
  }
  const listings = await prisma.listing.findMany({ where: { cycleId }, include: { partner: true } });
  const summary: LockSummary = { productionOrders: 0, purchaseOrders: 0, ledgerEntries: 0, units: 0 };
  const byPartner = new Map<string, { partner: (typeof listings)[number]['partner']; lines: { listing: (typeof listings)[number]; qty: number; wholesaleCents: number; shipTo: unknown[] }[] }>();

  for (const l of listings) {
    const t = tally.get(l.id);
    const qty = t?.qty ?? 0;
    const already = await prisma.partnerLedgerEntry.findFirst({ where: { cycleId, listingId: l.id, kind: 'SALE' }, select: { id: true } });
    if (qty > 0 && !already) {
      const bps = l.partner.commissionBps ?? (l.fulfillment === 'PRINTED_BY_US' ? settings.commissionBpsPrintedByUs : l.fulfillment === 'CONSIGNMENT' ? settings.commissionBpsConsignment : settings.commissionBpsPartnerShips);
      const commission = Math.round((t!.wholesaleCents * bps) / 10_000);
      await prisma.partnerLedgerEntry.createMany({ data: [
        { partnerId: l.partnerId, kind: 'SALE', amountCents: t!.wholesaleCents, description: `${l.catalogKey} ${l.title}: ${qty} × wholesale (${cycle.name})`, cycleId, listingId: l.id, actorName: actor.name },
        { partnerId: l.partnerId, kind: 'COMMISSION', amountCents: -commission, description: `${l.catalogKey}: ${(bps / 100).toFixed(bps % 100 ? 2 : 0)}% commission (${cycle.name})`, cycleId, listingId: l.id, actorName: actor.name },
      ] });
      summary.ledgerEntries += 2;
    }
    if (l.fulfillment === 'CONSIGNMENT') {
      // We ship from the publisher's consigned stock; nothing to print or send out.
      if (qty > 0 && !already) {
        await prisma.listing.update({ where: { id: l.id }, data: { inventoryUnits: { decrement: Math.min(qty, l.inventoryUnits) } } });
        await recordPodEvent('listing', l.id, 'inventory', `${qty} copies pulled from consignment stock for ${cycle.name}${qty > l.inventoryUnits ? ` — SHORT by ${qty - l.inventoryUnits}` : ''}`, actor);
        summary.units += qty;
      }
    } else if (l.fulfillment === 'PRINTED_BY_US') {
      const existing = await prisma.productionOrder.findFirst({ where: { cycleId, listingId: l.id } });
      if (!existing && qty > 0) {
        const cost = await estimatePrintCost(l, qty);
        const po = await prisma.productionOrder.create({ data: {
          number: await numbering.production(), cycleId, listingId: l.id, retailerQty: qty, partnerAddOnQty: 0, totalQty: qty,
          printUnitCents: cost?.unitCents ?? null, printTotalCents: cost?.totalCents ?? null, status: 'FILES_NEEDED', deadline: cycle.inStoreDate,
          notes: `${orders.length} retailer order${orders.length === 1 ? '' : 's'} in ${cycle.name}.`,
        } });
        if (cost) {
          await prisma.partnerLedgerEntry.create({ data: { partnerId: l.partnerId, kind: 'PRINTING', amountCents: -cost.totalCents, description: `${l.catalogKey}: printing ${qty} copies (${po.number})`, cycleId, listingId: l.id, actorName: actor.name } });
          summary.ledgerEntries++;
        }
        await recordPodEvent('production', po.id, 'created', `Raised at FOC lock for ${cycle.name}: ${qty} copies`, actor);
        summary.productionOrders++;
        summary.units += qty;
      }
    } else if (qty > 0) {
      const g = byPartner.get(l.partnerId) ?? { partner: l.partner, lines: [] };
      g.lines.push({ listing: l, qty, wholesaleCents: t!.wholesaleCents, shipTo: t!.shipTo });
      byPartner.set(l.partnerId, g);
    }
  }
  for (const [partnerId, g] of byPartner) {
    const existing = await prisma.purchaseOrder.findFirst({ where: { cycleId, partnerId } });
    if (existing) continue;
    const bps = g.partner.commissionBps ?? settings.commissionBpsPartnerShips;
    const wholesaleCents = g.lines.reduce((s, l) => s + l.wholesaleCents, 0);
    const commissionCents = Math.round((wholesaleCents * bps) / 10_000);
    const po = await prisma.purchaseOrder.create({ data: {
      number: await numbering.purchaseOrder(), cycleId, partnerId, status: 'DRAFT',
      lines: g.lines.map((l) => ({ listingId: l.listing.id, catalogKey: l.listing.catalogKey, title: l.listing.title, quantity: l.qty, wholesaleCents: l.wholesaleCents, shipTo: l.shipTo })) as unknown as Prisma.InputJsonValue,
      unitsTotal: g.lines.reduce((s, l) => s + l.qty, 0), wholesaleCents, commissionCents, netCents: wholesaleCents - commissionCents,
    } });
    await recordPodEvent('purchase_order', po.id, 'created', `Raised at FOC lock for ${cycle.name}`, actor);
    summary.purchaseOrders++;
    summary.units += po.unitsTotal;
  }
  await prisma.catalogCycle.update({ where: { id: cycleId }, data: { status: 'FOC_LOCKED', retailerOpen: false, focOverrideOpen: false, lockedAt: cycle.lockedAt ?? new Date() } });
  await recordPodEvent('cycle', cycleId, 'locked', `FOC locked: ${summary.productionOrders} production order(s), ${summary.purchaseOrders} purchase order(s), ${summary.units} units`, actor);
  return summary;
}

export async function reopenCycle(cycleId: string, actor: Actor) {
  const cycle = await prisma.catalogCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new HttpError(404, 'Cycle not found');
  if (cycle.status === 'CLOSED') throw new HttpError(400, 'A closed cycle stays closed');
  await prisma.catalogCycle.update({ where: { id: cycleId }, data: { status: 'PUBLISHED', retailerOpen: true, focOverrideOpen: true } });
  await recordPodEvent('cycle', cycleId, 'reopened', 'Ordering reopened after FOC', actor);
}

export async function closeCycle(cycleId: string, actor: Actor) {
  await prisma.catalogCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', retailerOpen: false, publisherOpen: false, closedAt: new Date() } });
  await recordPodEvent('cycle', cycleId, 'closed', 'Cycle closed', actor);
}

/** Price a retailer's basket against a cycle's snapshot. */
export async function priceRetailerBasket(cycleId: string, quantities: Record<string, number>, retailer: { tierOverride: number | null } | null, settings?: PodSettings) {
  const s = settings ?? (await getPodSettings());
  const items = await cycleItems(cycleId);
  const titles = snapshotsAsTitles(items);
  const pricing = priceWholesale({ quantities, titles, tiers: s.tiers, forcedTier: retailer?.tierOverride ?? null, minOrderCents: s.retailerMinOrderCents });
  return { pricing, items };
}
