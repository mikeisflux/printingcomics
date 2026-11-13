/**
 * /api/admin/pod — the Print On Demand section: publisher listings and their
 * review, catalog cycles (publish, FOC lock, reopen, close), retailers,
 * production orders, purchase orders, payouts, and the programme settings.
 * Everything here may show costs; the preflight router next door may not.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { getPodSettings, savePodSettings } from '../../lib/pod/settings.js';
import {
  CATALOG_ELIGIBLE, CYCLE_STATUS_LABELS, FORMATS, LISTING_STATUSES, LISTING_STATUS_LABELS, closeCycle, cycleItems, cycleOrderingOpen, deriveCatalogKey,
  estimatePrintCost, lockCycle, publishCycle, reopenCycle, setListingStatus, syncListingProduct, uniqueCatalogKey, type ListingStatusKey,
} from '../../lib/pod/catalog.js';
import { listingInclude, loadListing, presentListing } from '../../lib/pod/present.js';
import { isFileKind, listingUpload, rerunPreflight, storeListingFile } from '../../lib/pod/files.js';
import { actorOf, numbering, podEvents, recordPodEvent, slugify } from '../../lib/pod/events.js';
import { catalogCsv } from '../../lib/pod/csv.js';
import { LEDGER_LABELS, generateStatement, issueStatement, ledgerSummary, markStatementPaid, voidStatement } from '../../lib/pod/payouts.js';
import { notifyStaffListingSubmitted, sendListingStatusEmail, sendPartnerPortalInviteEmail, sendPurchaseOrderEmail, sendRetailerApprovedEmail, sendStatementEmail } from '../../lib/pod/emails.js';
import { ensureCustomerAccount } from '../../lib/customer-accounts.js';
import { PAYMENT_METHODS } from '../../lib/manual-order.js';

const router = Router();

const str = (max = 500) => z.string().trim().max(max);
const opt = (max = 500) => str(max).nullable().optional();
const num = z.coerce.number();
const date = z.coerce.date();

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

router.get('/overview', async (_req, res) => {
  const now = new Date();
  const [toReview, changes, live, cycles, retailersPending, retailersActive, prodOpen, posOpen, statementsDraft, unpaid, recentEvents, partners] = await Promise.all([
    prisma.listing.count({ where: { status: 'SUBMITTED' } }),
    prisma.listing.count({ where: { status: 'CHANGES_REQUESTED' } }),
    prisma.listing.count({ where: { status: 'LIVE' } }),
    prisma.catalogCycle.findMany({ where: { status: { notIn: ['CLOSED'] } }, orderBy: { catalogDate: 'asc' }, include: { _count: { select: { listings: true, orders: true } } } }),
    prisma.retailer.count({ where: { status: 'PENDING' } }),
    prisma.retailer.count({ where: { status: 'ACTIVE' } }),
    prisma.productionOrder.count({ where: { status: { in: ['PLANNED', 'FILES_NEEDED', 'PREFLIGHT', 'APPROVED', 'IN_PRODUCTION'] } } }),
    prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
    prisma.payoutStatement.count({ where: { status: 'DRAFT' } }),
    prisma.partnerLedgerEntry.aggregate({ where: { statementId: null, kind: { not: 'PAYOUT' } }, _sum: { amountCents: true } }),
    prisma.podEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.partner.count({ where: { listings: { some: {} } } }),
  ]);
  const retailerOrders = await prisma.order.aggregate({ where: { source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _sum: { subtotalCents: true }, _count: { _all: true } });
  res.json({
    counts: { toReview, changes, live, retailersPending, retailersActive, productionOpen: prodOpen, purchaseOrdersOpen: posOpen, statementsDraft, publishers: partners, owedCents: unpaid._sum.amountCents ?? 0, retailerOrders30: retailerOrders._count._all, retailerSales30Cents: retailerOrders._sum.subtotalCents ?? 0 },
    cycles: cycles.map((c) => ({ ...c, statusLabel: CYCLE_STATUS_LABELS[c.status], orderingOpen: cycleOrderingOpen(c, now), listingCount: c._count.listings, orderCount: c._count.orders })),
    recentEvents,
  });
});

/** Publishers (partners with listings or the publisher platform tag), for pickers. */
router.get('/publishers', async (_req, res) => {
  const partners = await prisma.partner.findMany({
    where: { status: { not: 'ARCHIVED' } }, orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, platform: true, contactEmail: true, commissionBps: true, status: true, _count: { select: { listings: true, members: true } } },
  });
  res.json({ publishers: partners.map((p) => ({ ...p, listingCount: p._count.listings, memberCount: p._count.members })) });
});

router.patch('/publishers/:id', async (req, res) => {
  const body = z.object({ commissionBps: z.coerce.number().int().min(0).max(9999).nullable() }).parse(req.body);
  const p = await prisma.partner.update({ where: { id: req.params.id }, data: { commissionBps: body.commissionBps }, select: { id: true, commissionBps: true } });
  res.json({ publisher: p });
});

/** Give a publisher's contact a portal login (creates the account if new). */
router.post('/publishers/:id/invite', async (req, res) => {
  const body = z.object({ email: z.string().trim().email(), firstName: opt(80), lastName: opt(80) }).parse(req.body);
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  const user = await ensureCustomerAccount(body.email, { firstName: body.firstName, lastName: body.lastName });
  if (user.partnerId && user.partnerId !== partner.id) throw new HttpError(409, 'That account already belongs to another partner');
  await prisma.user.update({ where: { id: user.id }, data: { partnerId: partner.id } });
  const mail = await sendPartnerPortalInviteEmail(partner.id, user.id);
  await recordPodEvent('listing', partner.id, 'invite', `${body.email} invited to the publisher portal`, actorOf(req));
  res.json({ ok: true, userId: user.id, mail });
});

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

const listingBody = z.object({
  partnerId: str(40).optional(),
  cycleId: str(40).nullable().optional(),
  title: str(200),
  seriesName: opt(200), seriesCode: opt(12), issueNumber: opt(20), coverDescription: opt(200), variantNumber: opt(20), upc: opt(20),
  format: z.enum(FORMATS).optional(), seriesType: opt(40), frequency: opt(40), language: opt(40), ageRating: opt(40),
  pageCount: num.int().min(1).max(2000).nullable().optional(),
  trimWidthIn: num.min(1).max(30).nullable().optional(), trimHeightIn: num.min(1).max(30).nullable().optional(),
  interiorColor: z.enum(['color', 'bw']).nullable().optional(), weightOz: num.min(0).nullable().optional(),
  msrpCents: num.int().min(0).optional(),
  description: opt(5000), synopsis: opt(5000), writer: opt(200), artist: opt(200), coverArtist: opt(200),
  genres: z.array(str(40)).max(10).optional(), bisac: z.array(str(20)).max(5).optional(),
  incentiveRatio: opt(20), incentiveQualifierKey: opt(40), reorderable: z.boolean().optional(),
  fulfillment: z.enum(['PRINTED_BY_US', 'PARTNER_SHIPS']).optional(),
  catalogKey: opt(40),
});

function listingData(b: z.infer<typeof listingBody>): Prisma.ListingUncheckedUpdateInput {
  const { partnerId, catalogKey, ...rest } = b;
  void partnerId; void catalogKey;
  return rest as Prisma.ListingUncheckedUpdateInput;
}

router.get('/listings', async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  const where: Prisma.ListingWhereInput = {};
  if (status && (LISTING_STATUSES as readonly string[]).includes(status)) where.status = status as ListingStatusKey;
  if (status === 'queue') where.status = { in: ['SUBMITTED', 'CHANGES_REQUESTED'] };
  if (req.query.partnerId) where.partnerId = String(req.query.partnerId);
  if (req.query.cycleId) where.cycleId = String(req.query.cycleId);
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { catalogKey: { contains: q, mode: 'insensitive' } }, { upc: { contains: q } }, { partner: { name: { contains: q, mode: 'insensitive' } } }];
  const [rows, counts] = await Promise.all([
    prisma.listing.findMany({ where, include: listingInclude, orderBy: [{ updatedAt: 'desc' }], take: 300 }),
    prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({ listings: rows.map((l) => presentListing(l, 'staff')), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), statuses: LISTING_STATUSES.map((s) => ({ key: s, label: LISTING_STATUS_LABELS[s] })) });
});

router.post('/listings', async (req, res) => {
  const body = listingBody.parse(req.body);
  if (!body.partnerId) throw new HttpError(400, 'Pick the publisher');
  const partner = await prisma.partner.findUnique({ where: { id: body.partnerId }, select: { id: true } });
  if (!partner) throw new HttpError(404, 'Publisher not found');
  const catalogKey = await uniqueCatalogKey(body.catalogKey || deriveCatalogKey(body));
  const l = await prisma.listing.create({ data: { ...(listingData(body) as Prisma.ListingUncheckedCreateInput), partnerId: body.partnerId, catalogKey, title: body.title, createdById: req.session?.sub ?? null } });
  await recordPodEvent('listing', l.id, 'created', 'Created by staff', actorOf(req));
  res.status(201).json({ listing: presentListing((await loadListing(l.id))!, 'staff') });
});

router.get('/listings/:id', async (req, res) => {
  const l = await loadListing(req.params.id);
  if (!l) throw new HttpError(404, 'Listing not found');
  const [events, production, orderLines, cost] = await Promise.all([
    podEvents('listing', l.id),
    prisma.productionOrder.findMany({ where: { listingId: l.id }, orderBy: { createdAt: 'desc' }, include: { cycle: { select: { name: true } } } }),
    prisma.orderItem.aggregate({ where: { listingId: l.id, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true, totalCents: true } }),
    estimatePrintCost(l, 100),
  ]);
  res.json({ listing: presentListing(l, 'staff'), events, production, sales: { units: orderLines._sum.quantity ?? 0, wholesaleCents: orderLines._sum.totalCents ?? 0 }, printCostPer100: cost });
});

router.patch('/listings/:id', async (req, res) => {
  const body = listingBody.partial().parse(req.body);
  const l = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!l) throw new HttpError(404, 'Listing not found');
  const data = listingData(body as z.infer<typeof listingBody>);
  if (body.catalogKey && body.catalogKey !== l.catalogKey) data.catalogKey = await uniqueCatalogKey(body.catalogKey, l.id);
  if (body.partnerId && body.partnerId !== l.partnerId) data.partnerId = body.partnerId;
  await prisma.listing.update({ where: { id: l.id }, data });
  if (l.productId) await syncListingProduct(l.id);
  await recordPodEvent('listing', l.id, 'edited', `Staff edited ${Object.keys(body).filter((k) => k !== 'partnerId').join(', ')}`, actorOf(req));
  res.json({ listing: presentListing((await loadListing(l.id))!, 'staff') });
});

const decision = z.object({ note: opt(2000), email: z.boolean().optional() });
for (const [action, to] of [['approve', 'APPROVED'], ['changes', 'CHANGES_REQUESTED'], ['reject', 'REJECTED'], ['archive', 'ARCHIVED'], ['schedule', 'SCHEDULED'], ['reopen', 'DRAFT']] as const) {
  router.post(`/listings/:id/${action}`, async (req, res) => {
    const body = decision.parse(req.body ?? {});
    if ((to === 'CHANGES_REQUESTED' || to === 'REJECTED') && !body.note) throw new HttpError(400, 'Tell the publisher why');
    const id = String(req.params.id);
    const l = await prisma.listing.findUnique({ where: { id }, select: { id: true, cycleId: true, cycle: { select: { status: true } } } });
    if (!l) throw new HttpError(404, 'Listing not found');
    let target: ListingStatusKey = to;
    // Approving into an already-published cycle takes it live straight away.
    if (to === 'APPROVED' && l.cycle && (l.cycle.status === 'PUBLISHED')) target = 'LIVE';
    await setListingStatus(l.id, target, actorOf(req), body.note);
    if (target === 'LIVE' && l.cycleId) {
      const full = await prisma.listing.findUnique({ where: { id: l.id }, include: { partner: { select: { id: true, name: true, slug: true } }, coverImage: true } });
      const cycle = await prisma.catalogCycle.findUnique({ where: { id: l.cycleId }, select: { version: true } });
      const { listingSnapshot } = await import('../../lib/pod/catalog.js');
      if (full && cycle) await prisma.catalogCycleItem.upsert({ where: { cycleId_listingId_version: { cycleId: l.cycleId, listingId: l.id, version: Math.max(1, cycle.version) } }, create: { cycleId: l.cycleId, listingId: l.id, version: Math.max(1, cycle.version), snapshot: listingSnapshot(full) as unknown as Prisma.InputJsonValue }, update: { snapshot: listingSnapshot(full) as unknown as Prisma.InputJsonValue } });
    }
    const mail = body.email === false || to === 'ARCHIVED' || to === 'DRAFT' ? null : await sendListingStatusEmail(l.id, target, body.note);
    res.json({ listing: presentListing((await loadListing(l.id))!, 'staff'), mail });
  });
}

router.post('/listings/:id/files', listingUpload.single('file'), async (req, res) => {
  const kind = req.body?.kind;
  if (!isFileKind(kind)) throw new HttpError(400, 'Which file is this? cover, interior, cover_image or extra');
  if (!req.file) throw new HttpError(400, 'No file received');
  const id = String(req.params.id);
  const { row, preflight } = await storeListingFile({ listingId: id, kind, file: req.file, actor: actorOf(req), uploaderId: req.session?.sub });
  if (kind === 'cover_image') await prisma.listing.findUnique({ where: { id }, select: { productId: true } }).then((l) => l?.productId && syncListingProduct(id));
  res.status(201).json({ file: { id: row.id, version: row.version }, preflight, listing: presentListing((await loadListing(id))!, 'staff') });
});

router.post('/listings/:id/files/:fileId/review', async (req, res) => {
  const body = z.object({ status: z.enum(['approved', 'rejected', 'uploaded']), note: opt(1000) }).parse(req.body);
  const f = await prisma.listingFile.findUnique({ where: { id: req.params.fileId } });
  if (!f || f.listingId !== req.params.id) throw new HttpError(404, 'File not found');
  await prisma.listingFile.update({ where: { id: f.id }, data: { reviewStatus: body.status, note: body.note ?? f.note } });
  await recordPodEvent('listing', f.listingId, 'file-review', `${f.kind} v${f.version} ${body.status}${body.note ? ` — ${body.note}` : ''}`, actorOf(req));
  res.json({ listing: presentListing((await loadListing(f.listingId))!, 'staff') });
});

router.post('/listings/:id/files/:fileId/preflight', async (req, res) => {
  const result = await rerunPreflight(req.params.fileId);
  res.json({ preflight: result, listing: presentListing((await loadListing(req.params.id))!, 'staff') });
});

router.delete('/listings/:id/files/:fileId', async (req, res) => {
  const f = await prisma.listingFile.findUnique({ where: { id: req.params.fileId } });
  if (!f || f.listingId !== req.params.id) throw new HttpError(404, 'File not found');
  await prisma.listingFile.delete({ where: { id: f.id } });
  await recordPodEvent('listing', f.listingId, 'file-removed', `${f.kind} v${f.version} removed`, actorOf(req));
  res.json({ listing: presentListing((await loadListing(f.listingId))!, 'staff') });
});

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

const cycleBody = z.object({
  name: str(120), catalogDate: date, focDate: date, inStoreDate: date,
  publisherOpen: z.boolean().optional(), retailerOpen: z.boolean().optional(), notes: opt(5000),
});

async function cycleView(id: string) {
  const c = await prisma.catalogCycle.findUnique({ where: { id }, include: { _count: { select: { listings: true, orders: true, productionOrders: true, purchaseOrders: true } } } });
  if (!c) throw new HttpError(404, 'Cycle not found');
  const byStatus = await prisma.listing.groupBy({ by: ['status'], where: { cycleId: id }, _count: { _all: true } });
  const orders = await prisma.order.aggregate({ where: { cycleId: id, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } }, _sum: { subtotalCents: true }, _count: { _all: true } });
  const units = await prisma.orderItem.aggregate({ where: { order: { cycleId: id, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true } });
  return {
    ...c, statusLabel: CYCLE_STATUS_LABELS[c.status], orderingOpen: cycleOrderingOpen(c),
    listingCount: c._count.listings, orderCount: orders._count._all, orderedUnits: units._sum.quantity ?? 0, wholesaleCents: orders._sum.subtotalCents ?? 0,
    productionOrderCount: c._count.productionOrders, purchaseOrderCount: c._count.purchaseOrders,
    listingsByStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  };
}

router.get('/cycles', async (_req, res) => {
  const rows = await prisma.catalogCycle.findMany({ orderBy: { catalogDate: 'desc' }, select: { id: true } });
  res.json({ cycles: await Promise.all(rows.map((r) => cycleView(r.id))) });
});

router.post('/cycles', async (req, res) => {
  const body = cycleBody.parse(req.body);
  if (!(body.catalogDate <= body.focDate && body.focDate <= body.inStoreDate)) throw new HttpError(400, 'Dates run catalog → FOC → in store');
  let slug = slugify(body.name);
  for (let i = 2; await prisma.catalogCycle.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(body.name)}-${i}`;
  const c = await prisma.catalogCycle.create({ data: { ...body, slug, status: body.publisherOpen === false ? 'DRAFT' : 'OPEN' } });
  await recordPodEvent('cycle', c.id, 'created', body.name, actorOf(req));
  res.status(201).json({ cycle: await cycleView(c.id) });
});

router.get('/cycles/:id', async (req, res) => {
  const cycle = await cycleView(req.params.id);
  const [listings, events, items, orders, production, purchaseOrders] = await Promise.all([
    prisma.listing.findMany({ where: { cycleId: cycle.id }, include: listingInclude, orderBy: [{ partner: { name: 'asc' } }, { title: 'asc' }] }),
    podEvents('cycle', cycle.id),
    cycleItems(cycle.id),
    prisma.order.findMany({ where: { cycleId: cycle.id, source: 'retailer' }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, paymentStatus: true, subtotalCents: true, totalCents: true, createdAt: true, retailer: { select: { id: true, name: true } }, wholesale: true, _count: { select: { items: true } } } }),
    prisma.productionOrder.findMany({ where: { cycleId: cycle.id }, include: { listing: { select: { title: true, catalogKey: true, partner: { select: { name: true } } } } }, orderBy: { number: 'asc' } }),
    prisma.purchaseOrder.findMany({ where: { cycleId: cycle.id }, include: { partner: { select: { name: true } } }, orderBy: { number: 'asc' } }),
  ]);
  const unitsByListing = await prisma.orderItem.groupBy({ by: ['listingId'], where: { order: { cycleId: cycle.id, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true, totalCents: true } });
  const units = Object.fromEntries(unitsByListing.map((u) => [u.listingId!, { units: u._sum.quantity ?? 0, wholesaleCents: u._sum.totalCents ?? 0 }]));
  res.json({ cycle, listings: listings.map((l) => ({ ...presentListing(l, 'staff'), ordered: units[l.id] ?? { units: 0, wholesaleCents: 0 } })), snapshotCount: items.length, events, orders, production, purchaseOrders });
});

router.patch('/cycles/:id', async (req, res) => {
  const body = cycleBody.partial().extend({ focOverrideOpen: z.boolean().optional() }).parse(req.body);
  const c = await prisma.catalogCycle.findUnique({ where: { id: req.params.id } });
  if (!c) throw new HttpError(404, 'Cycle not found');
  const next = { ...c, ...body };
  if (!(next.catalogDate <= next.focDate && next.focDate <= next.inStoreDate)) throw new HttpError(400, 'Dates run catalog → FOC → in store');
  const data: Prisma.CatalogCycleUpdateInput = { ...body };
  if (c.status === 'DRAFT' && body.publisherOpen === true) data.status = 'OPEN';
  if (c.status === 'OPEN' && body.publisherOpen === false) data.status = 'DRAFT';
  await prisma.catalogCycle.update({ where: { id: c.id }, data });
  await recordPodEvent('cycle', c.id, 'edited', Object.keys(body).join(', '), actorOf(req));
  res.json({ cycle: await cycleView(c.id) });
});

router.post('/cycles/:id/publish', async (req, res) => {
  const r = await publishCycle(req.params.id, actorOf(req));
  res.json({ ...r, cycle: await cycleView(req.params.id) });
});
router.post('/cycles/:id/lock', async (req, res) => {
  const r = await lockCycle(req.params.id, actorOf(req));
  res.json({ summary: r, cycle: await cycleView(req.params.id) });
});
router.post('/cycles/:id/reopen', async (req, res) => {
  await reopenCycle(req.params.id, actorOf(req));
  res.json({ cycle: await cycleView(req.params.id) });
});
router.post('/cycles/:id/close', async (req, res) => {
  await closeCycle(req.params.id, actorOf(req));
  res.json({ cycle: await cycleView(req.params.id) });
});

router.get('/cycles/:id/catalog.csv', async (req, res) => {
  const c = await prisma.catalogCycle.findUnique({ where: { id: req.params.id } });
  if (!c) throw new HttpError(404, 'Cycle not found');
  const items = await cycleItems(c.id);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const csv = catalogCsv(items.map((s) => ({
    catalogKey: s.catalogKey, upc: s.upc, title: s.title, seriesName: s.seriesName, issueNumber: s.issueNumber, coverDescription: s.coverDescription, publisher: s.partner.name,
    format: s.format, pageCount: s.pageCount, interiorColor: s.interiorColor, trim: s.trimWidthIn && s.trimHeightIn ? `${s.trimWidthIn} x ${s.trimHeightIn}` : '', msrpCents: s.msrpCents,
    writer: s.writer, artist: s.artist, coverArtist: s.coverArtist, ageRating: s.ageRating, incentiveRatio: s.incentiveRatio, description: s.synopsis ?? s.description,
    catalogDate: d(c.catalogDate), focDate: d(c.focDate), inStoreDate: d(c.inStoreDate),
  })));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${c.slug}-catalog.csv"`);
  res.send(csv);
});

// ---------------------------------------------------------------------------
// Retailers
// ---------------------------------------------------------------------------

const addressBody = z.object({ line1: opt(200), line2: opt(200), city: opt(100), region: opt(100), postalCode: opt(20), country: opt(2) }).partial();
const retailerBody = z.object({
  name: str(160), contactName: opt(120), contactEmail: z.string().trim().email(), phone: opt(40), website: opt(200), address: addressBody.nullable().optional(),
  tierOverride: num.int().min(1).max(10).nullable().optional(), resaleCertNumber: opt(80), resaleCertState: opt(40), resaleCertExpires: date.nullable().optional(),
  resaleCertStatus: z.enum(['not_submitted', 'submitted', 'approved', 'rejected']).optional(), taxExempt: z.boolean().optional(), notes: opt(5000),
});

const retailerInclude = { members: { select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true, passwordSetAt: true } }, resaleCert: { select: { id: true, url: true, originalName: true } }, _count: { select: { orders: true } } } satisfies Prisma.RetailerInclude;

router.get('/retailers', async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  const where: Prisma.RetailerWhereInput = {};
  if (['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) where.status = status as never;
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { contactEmail: { contains: q, mode: 'insensitive' } }, { contactName: { contains: q, mode: 'insensitive' } }];
  const [rows, counts] = await Promise.all([
    prisma.retailer.findMany({ where, include: retailerInclude, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
    prisma.retailer.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const spend = await prisma.order.groupBy({ by: ['retailerId'], where: { source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } }, _sum: { subtotalCents: true } });
  const spendBy = Object.fromEntries(spend.map((s) => [s.retailerId!, s._sum.subtotalCents ?? 0]));
  res.json({ retailers: rows.map((r) => ({ ...r, orderCount: r._count.orders, wholesaleCents: spendBy[r.id] ?? 0 })), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

router.post('/retailers', async (req, res) => {
  const body = retailerBody.parse(req.body);
  let slug = slugify(body.name);
  for (let i = 2; await prisma.retailer.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(body.name)}-${i}`;
  const r = await prisma.retailer.create({ data: { ...body, address: body.address ?? undefined, slug, status: 'ACTIVE' } });
  await recordPodEvent('retailer', r.id, 'created', 'Created by staff', actorOf(req));
  res.status(201).json({ retailer: await prisma.retailer.findUnique({ where: { id: r.id }, include: retailerInclude }) });
});

router.get('/retailers/:id', async (req, res) => {
  const r = await prisma.retailer.findUnique({ where: { id: req.params.id }, include: retailerInclude });
  if (!r) throw new HttpError(404, 'Retailer not found');
  const [orders, events] = await Promise.all([
    prisma.order.findMany({ where: { retailerId: r.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, paymentStatus: true, subtotalCents: true, totalCents: true, createdAt: true, cycle: { select: { name: true } }, wholesale: true, _count: { select: { items: true } } } }),
    podEvents('retailer', r.id),
  ]);
  res.json({ retailer: { ...r, orderCount: r._count.orders }, orders, events });
});

router.patch('/retailers/:id', async (req, res) => {
  const body = retailerBody.partial().parse(req.body);
  const r = await prisma.retailer.update({ where: { id: req.params.id }, data: { ...body, address: body.address === null ? Prisma.DbNull : body.address } });
  await recordPodEvent('retailer', r.id, 'edited', Object.keys(body).join(', '), actorOf(req));
  res.json({ retailer: await prisma.retailer.findUnique({ where: { id: r.id }, include: retailerInclude }) });
});

router.post('/retailers/:id/approve', async (req, res) => {
  const r = await prisma.retailer.findUnique({ where: { id: req.params.id }, include: { members: { select: { id: true } } } });
  if (!r) throw new HttpError(404, 'Retailer not found');
  await prisma.retailer.update({ where: { id: r.id }, data: { status: 'ACTIVE' } });
  let userId = r.members[0]?.id ?? null;
  if (!userId) {
    const user = await ensureCustomerAccount(r.contactEmail, { firstName: r.contactName?.split(' ')[0], lastName: r.contactName?.split(' ').slice(1).join(' ') });
    if (user.retailerId && user.retailerId !== r.id) throw new HttpError(409, 'That email already belongs to another retailer account');
    await prisma.user.update({ where: { id: user.id }, data: { retailerId: r.id } });
    userId = user.id;
  }
  const mail = await sendRetailerApprovedEmail(r.id, userId);
  await recordPodEvent('retailer', r.id, 'approved', mail.sent ? `Welcome email sent to ${mail.to}` : `Approved; email not sent (${mail.error})`, actorOf(req));
  res.json({ retailer: await prisma.retailer.findUnique({ where: { id: r.id }, include: retailerInclude }), mail });
});

for (const [action, status] of [['suspend', 'SUSPENDED'], ['restore', 'ACTIVE'], ['archive', 'ARCHIVED'], ['decline', 'ARCHIVED']] as const) {
  router.post(`/retailers/:id/${action}`, async (req, res) => {
    const r = await prisma.retailer.update({ where: { id: String(req.params.id) }, data: { status } });
    await recordPodEvent('retailer', r.id, action, null, actorOf(req));
    res.json({ retailer: await prisma.retailer.findUnique({ where: { id: r.id }, include: retailerInclude }) });
  });
}

router.post('/retailers/:id/members', async (req, res) => {
  const body = z.object({ email: z.string().trim().email(), firstName: opt(80), lastName: opt(80) }).parse(req.body);
  const r = await prisma.retailer.findUnique({ where: { id: req.params.id } });
  if (!r) throw new HttpError(404, 'Retailer not found');
  const user = await ensureCustomerAccount(body.email, { firstName: body.firstName, lastName: body.lastName });
  if (user.retailerId && user.retailerId !== r.id) throw new HttpError(409, 'That account already belongs to another retailer');
  await prisma.user.update({ where: { id: user.id }, data: { retailerId: r.id } });
  const mail = r.status === 'ACTIVE' ? await sendRetailerApprovedEmail(r.id, user.id) : null;
  await recordPodEvent('retailer', r.id, 'member', `${body.email} added`, actorOf(req));
  res.json({ retailer: await prisma.retailer.findUnique({ where: { id: r.id }, include: retailerInclude }), mail });
});

router.delete('/retailers/:id/members/:userId', async (req, res) => {
  await prisma.user.updateMany({ where: { id: req.params.userId, retailerId: req.params.id }, data: { retailerId: null } });
  res.json({ retailer: await prisma.retailer.findUnique({ where: { id: req.params.id }, include: retailerInclude }) });
});

// ---------------------------------------------------------------------------
// Production orders
// ---------------------------------------------------------------------------

const productionInclude = { listing: { include: { partner: { select: { id: true, name: true } }, files: { orderBy: { version: 'desc' }, include: { media: { select: { id: true, url: true, originalName: true, size: true } } } } } }, cycle: { select: { id: true, name: true, inStoreDate: true } }, order: { select: { id: true, number: true, status: true } } } satisfies Prisma.ProductionOrderInclude;

router.get('/production', async (req, res) => {
  const status = String(req.query.status ?? '');
  const where: Prisma.ProductionOrderWhereInput = {};
  if (status === 'open') where.status = { in: ['PLANNED', 'FILES_NEEDED', 'PREFLIGHT', 'APPROVED', 'IN_PRODUCTION'] };
  else if (status) where.status = status as never;
  if (req.query.cycleId) where.cycleId = String(req.query.cycleId);
  const rows = await prisma.productionOrder.findMany({ where, include: productionInclude, orderBy: [{ deadline: 'asc' }, { number: 'asc' }] });
  const counts = await prisma.productionOrder.groupBy({ by: ['status'], _count: { _all: true } });
  res.json({ production: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

router.post('/production', async (req, res) => {
  const body = z.object({ listingId: str(40), cycleId: str(40).nullable().optional(), retailerQty: num.int().min(0).optional(), partnerAddOnQty: num.int().min(0).optional(), deadline: date.nullable().optional(), notes: opt(2000) }).parse(req.body);
  const l = await prisma.listing.findUnique({ where: { id: body.listingId } });
  if (!l) throw new HttpError(404, 'Listing not found');
  const totalQty = (body.retailerQty ?? 0) + (body.partnerAddOnQty ?? 0);
  if (totalQty < 1) throw new HttpError(400, 'How many copies?');
  const cost = await estimatePrintCost(l, totalQty);
  const po = await prisma.productionOrder.create({ data: { number: await numbering.production(), listingId: l.id, cycleId: body.cycleId ?? l.cycleId, retailerQty: body.retailerQty ?? 0, partnerAddOnQty: body.partnerAddOnQty ?? 0, totalQty, printUnitCents: cost?.unitCents ?? null, printTotalCents: cost?.totalCents ?? null, deadline: body.deadline ?? null, notes: body.notes ?? null, status: 'FILES_NEEDED' } });
  if (body.partnerAddOnQty && cost) {
    const addOn = await estimatePrintCost(l, body.partnerAddOnQty);
    if (addOn) await prisma.partnerLedgerEntry.create({ data: { partnerId: l.partnerId, kind: 'PRINTING', amountCents: -addOn.totalCents, description: `${l.catalogKey}: ${body.partnerAddOnQty} publisher copies (${po.number})`, cycleId: po.cycleId, listingId: l.id, actorName: actorOf(req).name } });
  }
  await recordPodEvent('production', po.id, 'created', `Created by staff: ${totalQty} copies`, actorOf(req));
  res.status(201).json({ production: await prisma.productionOrder.findUnique({ where: { id: po.id }, include: productionInclude }) });
});

router.get('/production/:id', async (req, res) => {
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, include: productionInclude });
  if (!po) throw new HttpError(404, 'Production order not found');
  res.json({ production: po, events: await podEvents('production', po.id) });
});

router.patch('/production/:id', async (req, res) => {
  const body = z.object({ status: z.enum(['PLANNED', 'FILES_NEEDED', 'PREFLIGHT', 'APPROVED', 'IN_PRODUCTION', 'DONE', 'CANCELLED']).optional(), deadline: date.nullable().optional(), notes: opt(2000), internalNotes: opt(5000), retailerQty: num.int().min(0).optional(), partnerAddOnQty: num.int().min(0).optional() }).parse(req.body);
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, include: { listing: true } });
  if (!po) throw new HttpError(404, 'Production order not found');
  const retailerQty = body.retailerQty ?? po.retailerQty;
  const partnerAddOnQty = body.partnerAddOnQty ?? po.partnerAddOnQty;
  const totalQty = retailerQty + partnerAddOnQty;
  const cost = totalQty !== po.totalQty ? await estimatePrintCost(po.listing, totalQty) : null;
  await prisma.productionOrder.update({ where: { id: po.id }, data: { ...body, retailerQty, partnerAddOnQty, totalQty, ...(cost ? { printUnitCents: cost.unitCents, printTotalCents: cost.totalCents } : {}) } });
  if (body.status && body.status !== po.status) await recordPodEvent('production', po.id, 'status', `${po.status} → ${body.status}`, actorOf(req));
  else await recordPodEvent('production', po.id, 'edited', Object.keys(body).join(', '), actorOf(req));
  res.json({ production: await prisma.productionOrder.findUnique({ where: { id: po.id }, include: productionInclude }) });
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

const purchaseInclude = { partner: { select: { id: true, name: true, contactEmail: true } }, cycle: { select: { id: true, name: true, inStoreDate: true } } } satisfies Prisma.PurchaseOrderInclude;

router.get('/purchase-orders', async (req, res) => {
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (req.query.status === 'open') where.status = { in: ['DRAFT', 'SENT', 'ACKNOWLEDGED'] };
  else if (req.query.status) where.status = String(req.query.status) as never;
  const rows = await prisma.purchaseOrder.findMany({ where, include: purchaseInclude, orderBy: { number: 'desc' } });
  res.json({ purchaseOrders: rows });
});

router.get('/purchase-orders/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: purchaseInclude });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  res.json({ purchaseOrder: po, events: await podEvents('purchase_order', po.id) });
});

router.post('/purchase-orders/:id/send', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  const mail = await sendPurchaseOrderEmail(po.id);
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: po.status === 'DRAFT' ? 'SENT' : po.status, sentAt: po.sentAt ?? new Date() } });
  await recordPodEvent('purchase_order', po.id, 'sent', mail.sent ? `Emailed to ${mail.to}` : `Marked sent; email failed (${mail.error})`, actorOf(req));
  res.json({ purchaseOrder: await prisma.purchaseOrder.findUnique({ where: { id: po.id }, include: purchaseInclude }), mail });
});

router.patch('/purchase-orders/:id', async (req, res) => {
  const body = z.object({ status: z.enum(['DRAFT', 'SENT', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED']).optional(), notes: opt(5000) }).parse(req.body);
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  const data: Prisma.PurchaseOrderUpdateInput = { ...body };
  if (body.status === 'ACKNOWLEDGED') data.acknowledgedAt = new Date();
  if (body.status === 'FULFILLED') data.fulfilledAt = new Date();
  await prisma.purchaseOrder.update({ where: { id: po.id }, data });
  if (body.status && body.status !== po.status) await recordPodEvent('purchase_order', po.id, 'status', `${po.status} → ${body.status}`, actorOf(req));
  res.json({ purchaseOrder: await prisma.purchaseOrder.findUnique({ where: { id: po.id }, include: purchaseInclude }) });
});

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

router.get('/payouts', async (_req, res) => {
  const partners = await prisma.partner.findMany({ where: { OR: [{ listings: { some: {} } }, { ledgerEntries: { some: {} } }] }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, contactEmail: true, commissionBps: true } });
  const rows = await Promise.all(partners.map(async (p) => ({ ...p, summary: await ledgerSummary(p.id) })));
  const statements = await prisma.payoutStatement.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { partner: { select: { id: true, name: true } }, cycle: { select: { name: true } } } });
  res.json({ partners: rows, statements, paymentMethods: PAYMENT_METHODS, kinds: LEDGER_LABELS });
});

router.get('/payouts/:partnerId/ledger', async (req, res) => {
  const entries = await prisma.partnerLedgerEntry.findMany({ where: { partnerId: req.params.partnerId }, orderBy: { createdAt: 'desc' }, take: 500, include: { listing: { select: { catalogKey: true, title: true } }, cycle: { select: { name: true } }, statement: { select: { id: true, number: true, status: true } } } });
  res.json({ entries, summary: await ledgerSummary(req.params.partnerId) });
});

router.post('/payouts/:partnerId/ledger', async (req, res) => {
  const body = z.object({ amountCents: num.int(), description: str(300), cycleId: str(40).nullable().optional(), listingId: str(40).nullable().optional() }).parse(req.body);
  if (!body.amountCents) throw new HttpError(400, 'An adjustment needs an amount');
  const e = await prisma.partnerLedgerEntry.create({ data: { partnerId: req.params.partnerId, kind: 'ADJUSTMENT', amountCents: body.amountCents, description: body.description, cycleId: body.cycleId ?? null, listingId: body.listingId ?? null, actorName: actorOf(req).name } });
  res.status(201).json({ entry: e, summary: await ledgerSummary(req.params.partnerId) });
});

router.post('/payouts/statements', async (req, res) => {
  const body = z.object({ partnerId: str(40), cycleId: str(40).nullable().optional(), periodStart: date.nullable().optional(), periodEnd: date.nullable().optional(), notes: opt(2000) }).parse(req.body);
  const s = await generateStatement(body, actorOf(req));
  res.status(201).json({ statement: s });
});

async function statementView(id: string) {
  const s = await prisma.payoutStatement.findUnique({ where: { id }, include: { partner: { select: { id: true, name: true, contactEmail: true } }, cycle: { select: { id: true, name: true } } } });
  if (!s) throw new HttpError(404, 'Statement not found');
  return s;
}

router.get('/payouts/statements/:id', async (req, res) => {
  res.json({ statement: await statementView(req.params.id), events: await podEvents('statement', req.params.id) });
});
router.post('/payouts/statements/:id/issue', async (req, res) => {
  await issueStatement(req.params.id, actorOf(req));
  const mail = req.body?.email === false ? null : await sendStatementEmail(req.params.id);
  res.json({ statement: await statementView(req.params.id), mail });
});
router.post('/payouts/statements/:id/mark-paid', async (req, res) => {
  const body = z.object({ method: str(40), reference: opt(120), paidAt: date.nullable().optional() }).parse(req.body);
  await markStatementPaid(req.params.id, body, actorOf(req));
  res.json({ statement: await statementView(req.params.id) });
});
router.post('/payouts/statements/:id/void', async (req, res) => {
  await voidStatement(req.params.id, actorOf(req));
  res.json({ statement: await statementView(req.params.id) });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

router.get('/settings', async (_req, res) => {
  res.json({ settings: await getPodSettings(), formats: FORMATS, catalogEligible: [...CATALOG_ELIGIBLE] });
});

router.put('/settings', async (req, res) => {
  res.json({ settings: await savePodSettings(req.body?.settings ?? req.body) });
});

/** Re-send the "listing submitted" nudge to staff (used from the queue). */
router.post('/listings/:id/nudge', async (req, res) => {
  res.json({ mail: await notifyStaffListingSubmitted(req.params.id) });
});

export default router;
