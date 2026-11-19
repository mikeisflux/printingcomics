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

export async function uniqueCatalogKey(wanted: string, exceptId?: string, skip = 0): Promise<string> {
  let key = wanted;
  let seen = 0;
  for (let i = 2; i < 100; i++) {
    const row = await prisma.listing.findUnique({ where: { catalogKey: key }, select: { id: true } });
    // `skip` lets a caller that lost a race (P2002) move past the key that was just taken.
    if ((!row || row.id === exceptId) && seen++ >= skip) return key;
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
  const slug = 'distribution';
  const found = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (found) return found.id;
  const c = await prisma.category.create({ data: { slug, name: 'Distribution', description: 'Comics and graphic novels from independent publishers, printed to order.' } });
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

/** After a staff edit: the snapshot shops order from follows the listing while its cycle is open or locked. */
export async function refreshSnapshot(listingId: string): Promise<boolean> {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { partner: { select: { id: true, name: true, slug: true } }, coverImage: true, cycle: { select: { id: true, status: true } } } });
  if (!l?.cycle || !['PUBLISHED', 'FOC_LOCKED'].includes(l.cycle.status)) return false;
  const item = await prisma.catalogCycleItem.findFirst({ where: { cycleId: l.cycle.id, listingId: l.id }, orderBy: { version: 'desc' } });
  if (!item) return false;
  await prisma.catalogCycleItem.update({ where: { id: item.id }, data: { snapshot: listingSnapshot(l) as unknown as Prisma.InputJsonValue } });
  return true;
}

/**
 * The newest snapshot of each listing in a cycle. A listing that has since
 * been rejected, withdrawn or archived is left out, so shops cannot order a
 * title that was pulled; pass `includePulled` to see everything.
 */
export async function cycleItems(cycleId: string, opts: { includePulled?: boolean } = {}): Promise<ListingSnapshot[]> {
  const items = await prisma.catalogCycleItem.findMany({ where: { cycleId }, orderBy: [{ listingId: 'asc' }, { version: 'desc' }] });
  const live = opts.includePulled ? null : new Set((await prisma.listing.findMany({ where: { id: { in: [...new Set(items.map((i) => i.listingId))] }, status: { in: [...CATALOG_ELIGIBLE] } }, select: { id: true } })).map((l) => l.id));
  const seen = new Set<string>();
  const out: ListingSnapshot[] = [];
  for (const it of items) {
    if (seen.has(it.listingId)) continue;
    seen.add(it.listingId);
    if (live && !live.has(it.listingId)) continue;
    out.push(it.snapshot as unknown as ListingSnapshot);
  }
  return out.sort((a, b) => a.partner.name.localeCompare(b.partner.name) || a.title.localeCompare(b.title));
}

export function snapshotsAsTitles(items: ListingSnapshot[]): WholesaleTitle[] {
  return items.map((s) => ({ id: s.listingId, catalogKey: s.catalogKey, title: s.title, msrpCents: s.msrpCents, partnerId: s.partner.id, seriesName: s.seriesName, issueNumber: s.issueNumber, incentiveRatio: s.incentiveRatio, incentiveQualifierKey: s.incentiveQualifierKey, reorderable: s.reorderable }));
}

interface LockSummary { productionOrders: number; purchaseOrders: number; ledgerEntries: number; units: number }

type LockListing = Prisma.ListingGetPayload<{ include: { partner: true } }>;
type PoLine = { listingId: string; catalogKey: string; title: string; quantity: number; wholesaleCents: number; shipTo: unknown[] };

const sum = (rows: { amountCents: number }[]) => rows.reduce((a, r) => a + r.amountCents, 0);

/**
 * Bring one listing's raised units and ledger in line with what the shops
 * have ordered in a cycle. Called per listing at FOC lock, and again (with
 * negative deltas) when an order is cancelled after the lock. Everything is
 * posted as a difference against what was already raised, so running it
 * twice changes nothing and a reopen that adds orders adds exactly the new
 * copies and the new money. Returns what it added to the summary.
 */
export async function applyListingDelta(args: {
  cycle: { id: string; name: string; inStoreDate: Date };
  listing: LockListing;
  /** What the shops have ordered now: copies and wholesale money, in total. */
  orderedUnits: number;
  orderedWholesaleCents: number;
  /** Where the copies go (for the publisher's purchase order). */
  shipTo: { retailerName: string; qty: number; address: unknown; orderNumber: string }[];
  settings: PodSettings;
  actor: Actor;
  summary: LockSummary;
}): Promise<void> {
  const { cycle, listing: l, settings, actor, summary } = args;
  const cycleId = cycle.id;
  const item = await prisma.catalogCycleItem.findFirst({ where: { cycleId, listingId: l.id }, orderBy: { version: 'desc' } });
  // Not in the published catalog: shops could not have ordered it, and
  // without a snapshot row to remember what was raised a lock would raise it
  // again every time. Nothing to do.
  if (!item) return;
  const raised = item.raisedUnits;
  const deltaUnits = args.orderedUnits - raised;
  const postedSale = sum(await prisma.partnerLedgerEntry.findMany({ where: { cycleId, listingId: l.id, kind: 'SALE' }, select: { amountCents: true } }));
  const deltaSale = args.orderedWholesaleCents - postedSale;
  if (deltaUnits === 0 && deltaSale === 0) return;

  const bps = l.partner.commissionBps ?? (l.fulfillment === 'PRINTED_BY_US' ? settings.commissionBpsPrintedByUs : l.fulfillment === 'CONSIGNMENT' ? settings.commissionBpsConsignment : settings.commissionBpsPartnerShips);
  const tag = deltaUnits >= 0 ? `${args.orderedUnits} × wholesale` : `${-deltaUnits} copies canceled`;
  const changedPos = new Set<string>();

  await prisma.$transaction(async (tx) => {
    if (deltaSale !== 0) {
      const commission = Math.round((deltaSale * bps) / 10_000);
      await tx.partnerLedgerEntry.createMany({ data: [
        { partnerId: l.partnerId, kind: 'SALE', amountCents: deltaSale, description: `${l.catalogKey} ${l.title}: ${tag} (${cycle.name})`, cycleId, listingId: l.id, actorName: actor.name, ref: `sale:${cycleId}:${l.id}` },
        { partnerId: l.partnerId, kind: 'COMMISSION', amountCents: -commission, description: `${l.catalogKey}: ${(bps / 100).toFixed(bps % 100 ? 2 : 0)}% commission${deltaUnits < 0 ? ' reversed' : ''} (${cycle.name})`, cycleId, listingId: l.id, actorName: actor.name, ref: `commission:${cycleId}:${l.id}` },
      ] });
      summary.ledgerEntries += 2;
    }

    if (l.fulfillment === 'CONSIGNMENT') {
      // We ship from the publisher's consigned stock; nothing to print or send out.
      if (deltaUnits > 0) {
        const pull = Math.min(deltaUnits, Math.max(0, l.inventoryUnits));
        await tx.listing.update({ where: { id: l.id }, data: { inventoryUnits: { decrement: pull } } });
        await tx.catalogCycleItem.update({ where: { id: item.id }, data: { pulledUnits: { increment: pull } } });
        await tx.podEvent.create({ data: { subjectType: 'listing', subjectId: l.id, kind: 'inventory', message: `${pull} copies pulled from consignment stock for ${cycle.name}${deltaUnits > pull ? ` — SHORT by ${deltaUnits - pull}` : ''}`, actorId: actor.id, actorName: actor.name } });
        // The storefront sells from the same shelf.
        if (l.productId) await tx.product.update({ where: { id: l.productId }, data: { stock: Math.max(0, l.inventoryUnits - pull) } }).catch(() => undefined);
      } else if (deltaUnits < 0) {
        // Only copies that were actually pulled go back: a short pull took fewer than were raised.
        const back = Math.min(-deltaUnits, Math.max(0, item.pulledUnits));
        if (back > 0) {
          await tx.listing.update({ where: { id: l.id }, data: { inventoryUnits: { increment: back } } });
          await tx.catalogCycleItem.update({ where: { id: item.id }, data: { pulledUnits: { decrement: back } } });
          await tx.podEvent.create({ data: { subjectType: 'listing', subjectId: l.id, kind: 'inventory', message: `${back} copies returned to consignment stock (order canceled in ${cycle.name})`, actorId: actor.id, actorName: actor.name } });
          if (l.productId) await tx.product.update({ where: { id: l.productId }, data: { stock: { increment: back } } }).catch(() => undefined);
        }
      }
      summary.units += Math.max(0, deltaUnits);
    } else if (l.fulfillment === 'PRINTED_BY_US') {
      // One run per listing per cycle. A publisher's own print order may have
      // raised it first; the shops' copies join that run.
      let run = await tx.productionOrder.findFirst({ where: { cycleId, listingId: l.id, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'asc' } });
      const newRetailerQty = Math.max(0, (run?.retailerQty ?? 0) + deltaUnits);
      if (!run && deltaUnits > 0) {
        const cost = await estimatePrintCost(l, deltaUnits);
        run = await tx.productionOrder.create({ data: {
          number: await numbering.production(), cycleId, listingId: l.id, retailerQty: deltaUnits, partnerAddOnQty: 0, totalQty: deltaUnits,
          printUnitCents: cost?.unitCents ?? null, printTotalCents: cost?.totalCents ?? null, status: 'FILES_NEEDED', deadline: cycle.inStoreDate,
          notes: `Raised at FOC lock for ${cycle.name}.`,
        } });
        await tx.podEvent.create({ data: { subjectType: 'production', subjectId: run.id, kind: 'created', message: `Raised at FOC lock for ${cycle.name}: ${deltaUnits} copies`, actorId: actor.id, actorName: actor.name } });
        summary.productionOrders++;
      } else if (run && deltaUnits !== 0) {
        const total = newRetailerQty + run.partnerAddOnQty;
        const cost = total > 0 ? await estimatePrintCost(l, total) : null;
        run = await tx.productionOrder.update({ where: { id: run.id }, data: { retailerQty: newRetailerQty, totalQty: total, printUnitCents: cost?.unitCents ?? run.printUnitCents, printTotalCents: cost?.totalCents ?? run.printTotalCents } });
        await tx.podEvent.create({ data: { subjectType: 'production', subjectId: run.id, kind: deltaUnits > 0 ? 'add-on' : 'reduced', message: deltaUnits > 0 ? `${deltaUnits} retailer copies added at FOC lock (now ${total})` : `${-deltaUnits} retailer copies canceled (now ${total})`, actorId: actor.id, actorName: actor.name } });
      }
      if (run) {
        // The publisher pays for the shops' copies: post the difference between what those copies cost now and what was charged so far.
        const target = newRetailerQty > 0 ? (await estimatePrintCost(l, newRetailerQty))?.totalCents ?? 0 : 0;
        const charged = -sum(await tx.partnerLedgerEntry.findMany({ where: { ref: `printing:${run.id}:retailer` }, select: { amountCents: true } }));
        const deltaPrinting = target - charged;
        if (deltaPrinting !== 0) {
          await tx.partnerLedgerEntry.create({ data: { partnerId: l.partnerId, kind: 'PRINTING', amountCents: -deltaPrinting, description: deltaPrinting > 0 ? `${l.catalogKey}: printing ${newRetailerQty} copies (${run.number})` : `${l.catalogKey}: printing charge reduced to ${newRetailerQty} copies (${run.number})`, cycleId, listingId: l.id, actorName: actor.name, ref: `printing:${run.id}:retailer` } });
          summary.ledgerEntries++;
        }
      }
      summary.units += Math.max(0, deltaUnits);
    } else {
      // The publisher ships: the copies go on a purchase order to them.
      const open = await tx.purchaseOrder.findFirst({ where: { cycleId, partnerId: l.partnerId, status: { in: ['DRAFT', 'SENT', 'ACKNOWLEDGED'] } }, orderBy: { createdAt: 'desc' } });
      const line: PoLine = { listingId: l.id, catalogKey: l.catalogKey, title: l.title, quantity: args.orderedUnits, wholesaleCents: args.orderedWholesaleCents, shipTo: args.shipTo };
      const poBps = l.partner.commissionBps ?? settings.commissionBpsPartnerShips;
      if (open) {
        const lines = ((open.lines as unknown as PoLine[]) ?? []).filter((x) => x.listingId !== l.id);
        if (args.orderedUnits > 0) lines.push(line);
        const unitsTotal = lines.reduce((a, x) => a + x.quantity, 0);
        const wholesaleCents = lines.reduce((a, x) => a + x.wholesaleCents, 0);
        const commissionCents = Math.round((wholesaleCents * poBps) / 10_000);
        await tx.purchaseOrder.update({ where: { id: open.id }, data: { lines: lines as unknown as Prisma.InputJsonValue, unitsTotal, wholesaleCents, commissionCents, netCents: wholesaleCents - commissionCents } });
        await tx.podEvent.create({ data: { subjectType: 'purchase_order', subjectId: open.id, kind: 'updated', message: `${l.catalogKey}: ${deltaUnits > 0 ? `${deltaUnits} copies added` : `${-deltaUnits} copies canceled`} (now ${args.orderedUnits})`, actorId: actor.id, actorName: actor.name } });
        // The publisher already has this purchase order in hand: they get the changed one.
        if (open.status === 'SENT' || open.status === 'ACKNOWLEDGED') changedPos.add(open.id);
      } else if (args.orderedUnits > 0 && deltaUnits > 0) {
        const commissionCents = Math.round((line.wholesaleCents * poBps) / 10_000);
        const po = await tx.purchaseOrder.create({ data: {
          number: await numbering.purchaseOrder(), cycleId, partnerId: l.partnerId, status: 'DRAFT',
          lines: [line] as unknown as Prisma.InputJsonValue, unitsTotal: line.quantity, wholesaleCents: line.wholesaleCents, commissionCents, netCents: line.wholesaleCents - commissionCents,
        } });
        await tx.podEvent.create({ data: { subjectType: 'purchase_order', subjectId: po.id, kind: 'created', message: `Raised at FOC lock for ${cycle.name}`, actorId: actor.id, actorName: actor.name } });
        summary.purchaseOrders++;
      }
      summary.units += Math.max(0, deltaUnits);
    }

    await tx.catalogCycleItem.update({ where: { id: item.id }, data: { raisedUnits: args.orderedUnits } });
  });
  for (const poId of changedPos) {
    const { sendPurchaseOrderEmail } = await import('./emails.js');
    const mail = await sendPurchaseOrderEmail(poId, { changed: true }).catch((e: any) => ({ sent: false, to: '', error: e?.message ?? String(e) } as const));
    await recordPodEvent('purchase_order', poId, 'resent', mail.sent ? `Changed purchase order emailed to ${mail.to}` : `Changed; email failed (${mail.error})`, actor);
  }
}

/**
 * A run that is cancelled no longer covers the shops' copies it was raised
 * for: those count as not raised again, so the next lock raises a fresh run
 * for them. Bringing a cancelled run back takes them back on.
 */
export async function adjustRaisedForRun(run: { cycleId: string | null; listingId: string; retailerQty: number }, direction: 'cancel' | 'restore'): Promise<void> {
  if (!run.cycleId || run.retailerQty <= 0) return;
  const item = await prisma.catalogCycleItem.findFirst({ where: { cycleId: run.cycleId, listingId: run.listingId }, orderBy: { version: 'desc' } });
  if (!item) return;
  const next = direction === 'cancel' ? Math.max(0, item.raisedUnits - run.retailerQty) : item.raisedUnits + run.retailerQty;
  await prisma.catalogCycleItem.update({ where: { id: item.id }, data: { raisedUnits: next } });
}

/**
 * Move a listing to another catalog. Its snapshot in the old catalog goes
 * with it, so the old catalog stops showing a title no lock there would
 * ever raise — unless shops have already ordered it from the old catalog,
 * in which case it stays put.
 */
export async function moveListingCycle(listingId: string, toCycleId: string | null): Promise<void> {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, select: { cycleId: true, cycle: { select: { name: true, status: true, lockedAt: true } } } });
  if (!l || l.cycleId === toCycleId) return;
  if (l.cycleId && l.cycle) {
    const locked = l.cycle.status === 'FOC_LOCKED' || l.cycle.status === 'CLOSED' || Boolean(l.cycle.lockedAt);
    if (!locked) {
      // Still open for ordering: orders placed there would never be raised
      // (a lock works from the listing's cycle), so the title stays put.
      const ordered = await prisma.orderItem.count({ where: { listingId, order: { cycleId: l.cycleId, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } } } });
      if (ordered > 0) throw new HttpError(400, `Shops have already ordered this title from ${l.cycle.name}; it stays in that catalog until it locks.`);
      await prisma.catalogCycleItem.deleteMany({ where: { cycleId: l.cycleId, listingId } });
    }
    // A locked or closed catalog keeps its snapshot: it is the record of what
    // was sold and raised there, and the title can go on to the next catalog.
  }
  await prisma.listing.update({ where: { id: listingId }, data: { cycleId: toCycleId } });
}

/** Copies and wholesale money per listing across a cycle's live retailer orders. */
async function tallyCycleOrders(cycleId: string) {
  const orders = await prisma.order.findMany({
    where: { cycleId, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } },
    include: { items: { where: { listingId: { not: null } } }, retailer: { select: { id: true, name: true } } },
  });
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
  return { orders, tally };
}

/**
 * Final order cutoff. Ordering closes; every retailer line in the cycle is
 * tallied per listing; PRINTED_BY_US listings get a production order (and
 * printing is charged against the publisher), PARTNER_SHIPS listings go on
 * a purchase order to the publisher; wholesale revenue and commission land
 * in the ledger. Every amount is posted as a difference against what was
 * already raised, so running it again — including after a reopen that let
 * more orders in — adds only what is new. Listings pulled from the catalog
 * (rejected, archived) are skipped.
 */
export async function lockCycle(cycleId: string, actor: Actor): Promise<LockSummary> {
  const cycle = await prisma.catalogCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new HttpError(404, 'Cycle not found');
  if (cycle.status !== 'PUBLISHED' && cycle.status !== 'FOC_LOCKED') throw new HttpError(400, 'Only a published cycle can be locked');
  const settings = await getPodSettings();
  const { tally } = await tallyCycleOrders(cycleId);
  const listings = await prisma.listing.findMany({ where: { cycleId, status: { in: [...CATALOG_ELIGIBLE] } }, include: { partner: true } });
  const summary: LockSummary = { productionOrders: 0, purchaseOrders: 0, ledgerEntries: 0, units: 0 };
  for (const l of listings) {
    const t = tally.get(l.id);
    await applyListingDelta({ cycle, listing: l, orderedUnits: t?.qty ?? 0, orderedWholesaleCents: t?.wholesaleCents ?? 0, shipTo: t?.shipTo ?? [], settings, actor, summary });
  }
  await prisma.catalogCycle.update({ where: { id: cycleId }, data: { status: 'FOC_LOCKED', retailerOpen: false, focOverrideOpen: false, lockedAt: cycle.lockedAt ?? new Date() } });
  await recordPodEvent('cycle', cycleId, 'locked', `FOC locked: ${summary.productionOrders} production order(s), ${summary.purchaseOrders} purchase order(s), ${summary.units} units`, actor);
  return summary;
}

/**
 * Cancel a wholesale order, whoever asks: the shop's store credit goes back,
 * and when the cycle has already been locked the copies and money raised
 * for its lines are taken back out of the runs, purchase orders and ledger.
 */
export async function cancelRetailerOrder(orderId: string, actor: Actor, args: { by: 'retailer' | 'staff'; reason?: string | null; refund?: { method: string; reference?: string | null } | null }): Promise<void> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, cycle: true, retailer: { select: { id: true } } } });
  if (!o || o.source !== 'retailer' || !o.retailer) throw new HttpError(404, 'Order not found');
  if (o.status === 'CANCELLED' || o.status === 'REFUNDED') return;
  // A paid order is voided: staff say how the money went back (PayPal
  // refund, check, store credit…) and the order is recorded as refunded;
  // everything raised for it unwinds the same way as a cancel.
  if (o.paymentStatus === 'CAPTURED' && (args.by !== 'staff' || !args.refund)) throw new HttpError(400, 'This order is paid. To void it, record how the money was refunded.');
  const refund = o.paymentStatus === 'CAPTURED' ? args.refund! : null;
  const to = refund ? 'REFUNDED' : 'CANCELLED';
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: o.id }, data: { status: to, ...(refund ? { paymentStatus: 'REFUNDED' } : {}), events: { create: { kind: 'status', fromStatus: o.status, toStatus: to, message: args.by === 'retailer' ? 'Canceled by the retailer before FOC' : (args.reason ?? (refund ? 'Voided by staff' : 'Canceled by staff')), actorId: actor.id, actorName: actor.name } } } });
    if (refund) {
      await tx.payment.updateMany({ where: { orderId: o.id, status: 'CAPTURED' }, data: { status: 'REFUNDED' } });
      await tx.orderStatusEvent.create({ data: { orderId: o.id, kind: 'payment', fromStatus: 'CAPTURED', toStatus: 'REFUNDED', actorId: actor.id, actorName: actor.name, message: `Refunded ${(o.totalCents / 100).toFixed(2)} by ${refund.method}${refund.reference ? ` (${refund.reference})` : ''}` } });
    }
  });
  const prev = ((o.wholesale ?? {}) as { creditApplied?: number }).creditApplied ?? 0;
  if (prev) await prisma.retailer.update({ where: { id: o.retailer.id }, data: { creditCents: { increment: prev } } });
  // Anything raised at lock for these lines comes back out.
  if (o.cycle && (o.cycle.status === 'FOC_LOCKED' || o.cycle.status === 'CLOSED' || o.cycle.lockedAt)) {
    const settings = await getPodSettings();
    const { tally } = await tallyCycleOrders(o.cycle.id);
    const summary: LockSummary = { productionOrders: 0, purchaseOrders: 0, ledgerEntries: 0, units: 0 };
    const listingIds = [...new Set(o.items.map((it) => it.listingId).filter((x): x is string => !!x))];
    const listings = await prisma.listing.findMany({ where: { id: { in: listingIds } }, include: { partner: true } });
    for (const l of listings) {
      const t = tally.get(l.id);
      await applyListingDelta({ cycle: o.cycle, listing: l, orderedUnits: t?.qty ?? 0, orderedWholesaleCents: t?.wholesaleCents ?? 0, shipTo: t?.shipTo ?? [], settings, actor, summary });
    }
    if (summary.ledgerEntries) await recordPodEvent('cycle', o.cycle.id, 'adjusted', `Order ${o.number} ${refund ? 'voided' : 'canceled'} after FOC: ${summary.ledgerEntries} ledger entr${summary.ledgerEntries === 1 ? 'y' : 'ies'} reversed`, actor);
  }
  const { notifyRetailerSystem } = await import('./integration.js');
  notifyRetailerSystem(o.retailer.id, 'order.canceled', o.id);
}

/**
 * Bring a run's printing charges in line with its quantities: the shops'
 * copies and the publisher's add-on copies are each priced at their own
 * quantity and the difference from what was charged so far is posted. A
 * cancelled run charges nothing, so every earlier charge is reversed.
 */
export async function reconcileRunPrinting(runId: string, actor: Actor): Promise<number> {
  const run = await prisma.productionOrder.findUnique({ where: { id: runId }, include: { listing: true } });
  if (!run) throw new HttpError(404, 'Production order not found');
  const l = run.listing;
  const cancelled = run.status === 'CANCELLED';
  let posted = 0;
  for (const part of ['retailer', 'addon'] as const) {
    const qty = part === 'retailer' ? run.retailerQty : run.partnerAddOnQty;
    const target = cancelled || qty <= 0 ? 0 : (await estimatePrintCost(l, qty))?.totalCents ?? 0;
    const ref = `printing:${run.id}:${part}`;
    const charged = -sum(await prisma.partnerLedgerEntry.findMany({ where: { ref }, select: { amountCents: true } }));
    const delta = target - charged;
    if (delta === 0) continue;
    await prisma.partnerLedgerEntry.create({ data: { partnerId: l.partnerId, kind: 'PRINTING', amountCents: -delta, description: cancelled ? `${l.catalogKey}: printing charge reversed, run ${run.number} canceled` : `${l.catalogKey}: printing ${qty} ${part === 'retailer' ? 'retailer' : 'publisher'} copies (${run.number})${delta < 0 ? ' — reduced' : ''}`, cycleId: run.cycleId, listingId: l.id, actorName: actor.name, ref } });
    posted++;
  }
  return posted;
}

/**
 * A purchase order the publisher will not fill: the wholesale revenue and
 * commission raised for its lines come back out of the ledger, and the
 * copies count as not raised, so a later lock raises them afresh.
 */
export async function cancelPurchaseOrder(poId: string, actor: Actor): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { partner: true, cycle: true } });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (po.status === 'CANCELLED') return;
  const settings = await getPodSettings();
  const bps = po.partner.commissionBps ?? settings.commissionBpsPartnerShips;
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'CANCELLED' } });
    for (const line of (po.lines as unknown as PoLine[]) ?? []) {
      if (!line.wholesaleCents) continue;
      const commission = Math.round((line.wholesaleCents * bps) / 10_000);
      await tx.partnerLedgerEntry.createMany({ data: [
        { partnerId: po.partnerId, kind: 'SALE', amountCents: -line.wholesaleCents, description: `${line.catalogKey}: ${line.quantity} copies — purchase order ${po.number} canceled (${po.cycle.name})`, cycleId: po.cycleId, listingId: line.listingId, actorName: actor.name, ref: `sale:${po.cycleId}:${line.listingId}` },
        { partnerId: po.partnerId, kind: 'COMMISSION', amountCents: commission, description: `${line.catalogKey}: commission reversed, ${po.number} canceled`, cycleId: po.cycleId, listingId: line.listingId, actorName: actor.name, ref: `commission:${po.cycleId}:${line.listingId}` },
      ] });
      await tx.catalogCycleItem.updateMany({ where: { cycleId: po.cycleId, listingId: line.listingId }, data: { raisedUnits: 0 } });
    }
  });
  await recordPodEvent('purchase_order', po.id, 'canceled', `Canceled; ${po.unitsTotal} copies and ${(po.wholesaleCents / 100).toFixed(2)} wholesale taken back out of the ledger`, actor);
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
