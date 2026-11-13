/**
 * /api/admin/pod — the Print On Demand section: publisher listings and their
 * review, catalog cycles (publish, FOC lock, reopen, close), retailers,
 * production orders, purchase orders, payouts, and the program settings.
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
import { deleteListingFile, isFileKind, listingUpload, rerunPreflight, restoreListingFileVersion, storeListingFile, storePublisherAsset } from '../../lib/pod/files.js';
import { assignBarcode, barcodeSvg, expandBlock, loadBlock, normalizeBarcode, releaseBarcode } from '../../lib/pod/barcodes.js';
import { RETURN_REASONS, decideReturn } from '../../lib/pod/returns.js';
import { parseCsv } from '../../lib/pod/csv.js';
import { markOrderPaid, orderPayLink } from '../../lib/manual-order.js';
import { sendPayRequestEmail } from '../../lib/order-emails.js';
import { FILE_KIND_LABELS } from '../../lib/pod/present.js';
import { actorOf, numbering, podEvents, recordPodEvent, slugify } from '../../lib/pod/events.js';
import { catalogCsv } from '../../lib/pod/csv.js';
import { promises as fsp } from 'node:fs';
import { LEDGER_LABELS, generateStatement, issueStatement, ledgerSummary, markStatementPaid, voidStatement } from '../../lib/pod/payouts.js';
import { notifyStaffListingSubmitted, sendListingStatusEmail, sendPartnerPortalInviteEmail, sendPurchaseOrderEmail, sendRetailerApprovedEmail, sendStatementEmail } from '../../lib/pod/emails.js';
import { ensureCustomerAccount } from '../../lib/customer-accounts.js';
import { PAYMENT_METHODS } from '../../lib/manual-order.js';
import { sendPartnerPortalInviteEmail as inviteMail } from '../../lib/pod/emails.js';
void inviteMail;

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
  const [publisherApplications, unpaidOrders, toShip, returnsOpen, filesToReview] = await Promise.all([
    prisma.partnerApplication.count({ where: { platform: 'publisher', status: 'PENDING' } }),
    prisma.order.count({ where: { source: 'retailer', paymentStatus: 'PENDING', status: { notIn: ['CANCELLED', 'REFUNDED'] } } }),
    prisma.order.count({ where: { source: 'retailer', status: 'PAID' } }),
    prisma.retailerReturn.count({ where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } } }),
    prisma.listingFile.count({ where: { reviewStatus: 'uploaded', kind: { in: ['cover', 'interior'] }, listing: { status: { in: ['SUBMITTED', 'APPROVED', 'LIVE'] } } } }),
  ]);
  res.json({
    counts: { toReview, changes, live, retailersPending, retailersActive, productionOpen: prodOpen, purchaseOrdersOpen: posOpen, statementsDraft, publishers: partners, owedCents: unpaid._sum.amountCents ?? 0, retailerOrders30: retailerOrders._count._all, retailerSales30Cents: retailerOrders._sum.subtotalCents ?? 0, publisherApplications, unpaidOrders, toShip, returnsOpen, filesToReview },
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

const publisherInclude = {
  logo: { select: { id: true, url: true } },
  members: { select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true, passwordSetAt: true } },
  _count: { select: { listings: true, members: true, purchaseOrders: true, barcodes: true } },
} satisfies Prisma.PartnerInclude;

async function publisherView(id: string) {
  const p = await prisma.partner.findUnique({ where: { id }, include: publisherInclude });
  if (!p) throw new HttpError(404, 'Publisher not found');
  const [byStatus, sold, owed] = await Promise.all([
    prisma.listing.groupBy({ by: ['status'], where: { partnerId: id }, _count: { _all: true } }),
    prisma.orderItem.aggregate({ where: { listing: { partnerId: id }, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true, totalCents: true } }),
    prisma.partnerLedgerEntry.aggregate({ where: { partnerId: id, statementId: null, kind: { not: 'PAYOUT' } }, _sum: { amountCents: true } }),
  ]);
  const { webhookSecret, ...safe } = p;
  void webhookSecret;
  return { ...safe, listingsByStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), listingCount: p._count.listings, memberCount: p._count.members, unitsSold: sold._sum.quantity ?? 0, wholesaleCents: sold._sum.totalCents ?? 0, owedCents: owed._sum.amountCents ?? 0 };
}

const publisherBody = z.object({
  name: str(160).optional(), contactName: opt(120), contactEmail: z.string().trim().email().nullable().optional(), website: opt(200), phone: opt(40), bio: opt(2000), printerInfo: opt(500),
  payoutMethod: opt(60), payoutDetails: opt(500), notes: opt(5000), commissionBps: z.coerce.number().int().min(0).max(9999).nullable().optional(), color: opt(20),
  address: z.object({ line1: opt(200), line2: opt(200), city: opt(100), region: opt(100), postalCode: opt(20), country: opt(2) }).partial().nullable().optional(),
});

router.post('/publishers', async (req, res) => {
  const body = publisherBody.extend({ name: str(160), inviteEmail: z.string().trim().email().nullable().optional() }).parse(req.body);
  let slug = slugify(body.name);
  for (let i = 2; await prisma.partner.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(body.name)}-${i}`;
  const { inviteEmail, address, ...rest } = body;
  const p = await prisma.partner.create({ data: { ...rest, address: address ?? undefined, slug, platform: 'publisher', status: 'ACTIVE', createdById: req.session?.sub ?? null } });
  await recordPodEvent('listing', p.id, 'publisher-created', body.name, actorOf(req));
  let mail: Awaited<ReturnType<typeof sendPartnerPortalInviteEmail>> | null = null;
  if (inviteEmail) {
    const user = await ensureCustomerAccount(inviteEmail, { firstName: body.contactName?.split(' ')[0], lastName: body.contactName?.split(' ').slice(1).join(' ') });
    if (!user.partnerId || user.partnerId === p.id) { await prisma.user.update({ where: { id: user.id }, data: { partnerId: p.id } }); mail = await sendPartnerPortalInviteEmail(p.id, user.id); }
  }
  res.status(201).json({ publisher: await publisherView(p.id), mail });
});

router.get('/publishers/:id', async (req, res) => {
  const publisher = await publisherView(req.params.id);
  const [listings, ledger, assets, barcodes, events] = await Promise.all([
    prisma.listing.findMany({ where: { partnerId: publisher.id }, include: listingInclude, orderBy: { updatedAt: 'desc' }, take: 100 }),
    ledgerSummary(publisher.id),
    prisma.publisherAsset.findMany({ where: { partnerId: publisher.id }, orderBy: { createdAt: 'desc' }, include: { media: { select: { id: true, url: true, originalName: true, size: true, mimeType: true } } } }),
    prisma.barcode.groupBy({ by: ['status'], where: { partnerId: publisher.id }, _count: { _all: true } }),
    prisma.podEvent.findMany({ where: { OR: [{ subjectType: 'listing', subjectId: publisher.id }, { subjectType: 'listing', subjectId: { in: (await prisma.listing.findMany({ where: { partnerId: publisher.id }, select: { id: true } })).map((l) => l.id) } }] }, orderBy: { createdAt: 'desc' }, take: 60 }),
  ]);
  res.json({ publisher, listings: listings.map((l) => presentListing(l, 'staff')), ledger, assets, barcodes: Object.fromEntries(barcodes.map((b) => [b.status, b._count._all])), events });
});

router.patch('/publishers/:id', async (req, res) => {
  const body = publisherBody.parse(req.body);
  const { address, ...rest } = body;
  const p = await prisma.partner.update({ where: { id: req.params.id }, data: { ...rest, ...(address === undefined ? {} : { address: address === null ? Prisma.DbNull : address }) }, select: { id: true } });
  await recordPodEvent('listing', p.id, 'publisher-edited', Object.keys(body).join(', '), actorOf(req));
  res.json({ publisher: await publisherView(p.id) });
});

for (const [action, status] of [['suspend', 'SUSPENDED'], ['restore', 'ACTIVE'], ['archive', 'ARCHIVED']] as const) {
  router.post(`/publishers/:id/${action}`, async (req, res) => {
    const id = String(req.params.id);
    await prisma.partner.update({ where: { id }, data: { status } });
    await recordPodEvent('listing', id, `publisher-${action}`, null, actorOf(req));
    res.json({ publisher: await publisherView(id) });
  });
}

router.delete('/publishers/:id/members/:userId', async (req, res) => {
  await prisma.user.updateMany({ where: { id: String(req.params.userId), partnerId: String(req.params.id) }, data: { partnerId: null } });
  res.json({ publisher: await publisherView(String(req.params.id)) });
});

router.post('/publishers/:id/assets', listingUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received');
  const kind = ['logo', 'marketing', 'press', 'other'].includes(String(req.body?.kind)) ? String(req.body.kind) : 'marketing';
  const asset = await storePublisherAsset({ partnerId: String(req.params.id), kind, title: req.body?.title ? String(req.body.title) : null, file: req.file, actor: actorOf(req), uploaderId: req.session?.sub });
  res.status(201).json({ asset });
});

router.delete('/publishers/:id/assets/:assetId', async (req, res) => {
  const a = await prisma.publisherAsset.findUnique({ where: { id: String(req.params.assetId) }, include: { media: true, partner: { select: { logoId: true } } } });
  if (!a || a.partnerId !== String(req.params.id)) throw new HttpError(404, 'Asset not found');
  await prisma.publisherAsset.delete({ where: { id: a.id } });
  if (a.partner.logoId === a.mediaFileId) await prisma.partner.update({ where: { id: a.partnerId }, data: { logoId: null } });
  const { deleteStored } = await import('../../lib/storage.js');
  await deleteStored(a.media).catch(() => undefined);
  await prisma.mediaFile.delete({ where: { id: a.mediaFileId } }).catch(() => undefined);
  res.json({ ok: true });
});

/** Publisher applications (PartnerApplication rows tagged platform "publisher"). */
router.get('/publishers/applications/list', async (_req, res) => {
  const rows = await prisma.partnerApplication.findMany({ where: { platform: 'publisher' }, orderBy: { createdAt: 'desc' }, take: 200, include: { partner: { select: { id: true, name: true } } } });
  res.json({ applications: rows, pending: rows.filter((r) => r.status === 'PENDING').length });
});

router.post('/publishers/applications/:appId/approve', async (req, res) => {
  const app = await prisma.partnerApplication.findUnique({ where: { id: String(req.params.appId) } });
  if (!app) throw new HttpError(404, 'Application not found');
  if (app.status !== 'PENDING') throw new HttpError(400, 'Already decided');
  const body = z.object({ commissionBps: z.coerce.number().int().min(0).max(9999).nullable().optional(), note: opt(1000) }).parse(req.body ?? {});
  let slug = slugify(app.name);
  for (let i = 2; await prisma.partner.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(app.name)}-${i}`;
  const p = await prisma.partner.create({ data: { slug, name: app.name, platform: 'publisher', status: 'ACTIVE', contactEmail: app.contactEmail, contactName: app.contactName, website: app.website, commissionBps: body.commissionBps ?? null, notes: app.message, createdById: req.session?.sub ?? null } });
  const user = await ensureCustomerAccount(app.contactEmail, { firstName: app.contactName.split(' ')[0], lastName: app.contactName.split(' ').slice(1).join(' ') });
  if (!user.partnerId) await prisma.user.update({ where: { id: user.id }, data: { partnerId: p.id } });
  const mail = await sendPartnerPortalInviteEmail(p.id, user.id);
  await prisma.partnerApplication.update({ where: { id: app.id }, data: { status: 'APPROVED', reviewerId: req.session?.sub ?? null, reviewNotes: body.note ?? null, reviewedAt: new Date(), partnerId: p.id } });
  await recordPodEvent('listing', p.id, 'publisher-approved', `Application approved; ${mail.sent ? `portal invite sent to ${mail.to}` : `invite email failed (${mail.error})`}`, actorOf(req));
  res.json({ publisher: await publisherView(p.id), mail });
});

router.post('/publishers/applications/:appId/decline', async (req, res) => {
  const body = z.object({ note: opt(1000) }).parse(req.body ?? {});
  await prisma.partnerApplication.update({ where: { id: String(req.params.appId) }, data: { status: 'REJECTED', reviewerId: req.session?.sub ?? null, reviewNotes: body.note ?? null, reviewedAt: new Date() } });
  res.json({ ok: true });
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
  fulfillment: z.enum(['PRINTED_BY_US', 'PARTNER_SHIPS', 'CONSIGNMENT']).optional(),
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
  const f = await deleteListingFile(req.params.fileId, actorOf(req));
  res.json({ listing: presentListing((await loadListing(f.listingId))!, 'staff') });
});

router.post('/listings/:id/files/:fileId/restore', async (req, res) => {
  const row = await restoreListingFileVersion(req.params.fileId, actorOf(req));
  res.json({ file: { id: row.id, version: row.version }, listing: presentListing((await loadListing(row.listingId))!, 'staff') });
});

router.post('/listings/:id/inventory', async (req, res) => {
  const body = z.object({ delta: num.int().optional(), damagedDelta: num.int().optional(), incomingDelta: num.int().optional(), reorderLevel: num.int().min(0).nullable().optional(), location: opt(120), reason: str(300) }).parse(req.body);
  const l = await prisma.listing.findUnique({ where: { id: req.params.id }, select: { id: true, inventoryUnits: true, inventoryDamaged: true, inventoryIncoming: true, productId: true } });
  if (!l) throw new HttpError(404, 'Listing not found');
  const delta = body.delta ?? 0;
  const units = Math.max(0, l.inventoryUnits + delta);
  const damaged = Math.max(0, l.inventoryDamaged + (body.damagedDelta ?? 0));
  const incoming = Math.max(0, l.inventoryIncoming + (body.incomingDelta ?? 0));
  await prisma.listing.update({ where: { id: l.id }, data: { inventoryUnits: units, inventoryDamaged: damaged, inventoryIncoming: incoming, ...(body.reorderLevel !== undefined ? { inventoryReorderLevel: body.reorderLevel ?? 0 } : {}), ...(body.location !== undefined ? { inventoryLocation: body.location } : {}) } });
  if (l.productId) await syncListingProduct(l.id);
  await recordPodEvent('listing', l.id, 'inventory', `${delta >= 0 ? '+' : ''}${delta} copies${body.damagedDelta ? `, ${body.damagedDelta >= 0 ? '+' : ''}${body.damagedDelta} damaged` : ''}${body.incomingDelta ? `, ${body.incomingDelta >= 0 ? '+' : ''}${body.incomingDelta} incoming` : ''} → ${units} on hand — ${body.reason}`, actorOf(req));
  res.json({ listing: presentListing((await loadListing(l.id))!, 'staff') });
});

router.post('/listings/:id/barcode', async (req, res) => {
  const body = z.object({ barcodeId: str(40).nullable().optional() }).parse(req.body ?? {});
  await assignBarcode(req.params.id, actorOf(req), body.barcodeId);
  res.json({ listing: presentListing((await loadListing(req.params.id))!, 'staff') });
});

/** Bulk-create DRAFT listings for a publisher from a CSV (the catalog export layout, or any sheet with these headers). */
router.post('/listings/import', listingUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received');
  const partnerId = String(req.body?.partnerId ?? '');
  const cycleId = req.body?.cycleId ? String(req.body.cycleId) : null;
  const dryRun = String(req.body?.dryRun ?? '') === '1';
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true } });
  if (!partner) { await fsp.unlink(req.file.path).catch(() => undefined); throw new HttpError(400, 'Pick the publisher the rows belong to'); }
  const text = await fsp.readFile(req.file.path, 'utf8');
  await fsp.unlink(req.file.path).catch(() => undefined);
  const rows = parseCsv(text);
  if (rows.length < 2) throw new HttpError(400, 'The sheet has no data rows');
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const header = rows[0]!.map(norm);
  const col = (...names: string[]) => { const i = header.findIndex((h) => names.map(norm).includes(h)); return i; };
  const C = { title: col('Title'), series: col('Series', 'Series Name'), seriesCode: col('Series Code'), issue: col('Issue', 'Issue Number'), cover: col('Cover', 'Cover Description'), upc: col('UPC', 'Barcode / UPC / EAN', 'Barcode'), format: col('Format', 'Book Format'), pages: col('Pages', 'Page Count'), color: col('Color', 'Color / B&W'), trim: col('Trim'), width: col('Width'), height: col('Height'), price: col('MSRP', 'Price'), writer: col('Writer'), artist: col('Artist'), coverArtist: col('Cover Artist'), rating: col('Rating', 'Media Rating / Age Range'), incentive: col('Incentive', 'Incentive Ratio'), description: col('Description', 'Description of Issue /book'), synopsis: col('Synopsis', 'Brief Synopsis of Book'), fulfillment: col('Fulfillment') };
  if (C.title < 0) throw new HttpError(400, 'The sheet needs a Title column');
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const problems: string[] = [];
  const created: { row: number; title: string; catalogKey: string }[] = [];
  const preview: { row: number; title: string; msrpCents: number; pageCount: number | null; problems: string[] }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const title = get(r, C.title);
    if (!title) continue;
    const rowProblems: string[] = [];
    const msrpCents = Math.round(Number(get(r, C.price).replace(/[^0-9.]/g, '')) * 100) || 0;
    if (!msrpCents) rowProblems.push('no cover price');
    const pageCount = Number(get(r, C.pages)) || null;
    let w = Number(get(r, C.width)) || null; let h = Number(get(r, C.height)) || null;
    const trim = get(r, C.trim); const tm = /([\d.]+)\s*[x×]\s*([\d.]+)/i.exec(trim); if (tm && !w) { w = Number(tm[1]); h = Number(tm[2]); }
    const fmtRaw = get(r, C.format).toLowerCase();
    const format = /graphic|trade|tpb|novel/.test(fmtRaw) ? 'graphic_novel' : /magazine/.test(fmtRaw) ? 'magazine' : /zine/.test(fmtRaw) ? 'zine' : 'comic';
    const colorRaw = get(r, C.color).toLowerCase();
    const interiorColor = /b\s*&\s*w|black|grey|gray|bw/.test(colorRaw) ? 'bw' : colorRaw ? 'color' : null;
    const fulRaw = get(r, C.fulfillment).toLowerCase();
    const fulfillment = /publisher|ships|partner/.test(fulRaw) ? 'PARTNER_SHIPS' : /consign|stock|inventory/.test(fulRaw) ? 'CONSIGNMENT' : 'PRINTED_BY_US';
    preview.push({ row: i + 1, title, msrpCents, pageCount, problems: rowProblems });
    if (dryRun) continue;
    try {
      const upc = get(r, C.upc).replace(/\D/g, '') || null;
      const catalogKey = await uniqueCatalogKey(deriveCatalogKey({ seriesCode: get(r, C.seriesCode), upc, title }));
      const l = await prisma.listing.create({ data: {
        partnerId, cycleId, catalogKey, title, seriesName: get(r, C.series) || null, seriesCode: get(r, C.seriesCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || null, issueNumber: get(r, C.issue) || null,
        coverDescription: get(r, C.cover) || null, upc, format, pageCount, trimWidthIn: w, trimHeightIn: h, interiorColor, msrpCents, writer: get(r, C.writer) || null, artist: get(r, C.artist) || null, coverArtist: get(r, C.coverArtist) || null,
        ageRating: get(r, C.rating) || null, incentiveRatio: get(r, C.incentive) || null, description: get(r, C.description) || null, synopsis: get(r, C.synopsis) || null, fulfillment, status: 'DRAFT', createdById: req.session?.sub ?? null,
      } });
      await recordPodEvent('listing', l.id, 'created', `Imported from ${req.file.originalname} (row ${i + 1}) by staff`, actorOf(req));
      created.push({ row: i + 1, title, catalogKey });
    } catch (e: any) { problems.push(`Row ${i + 1}: ${e?.message ?? e}`); }
  }
  res.json({ dryRun, publisher: partner.name, rows: preview.length, created, preview: preview.slice(0, 200), problems });
});

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

const cycleBody = z.object({
  name: str(120), catalogDate: date, focDate: date, inStoreDate: date,
  publisherOpen: z.boolean().optional(), retailerOpen: z.boolean().optional(), notes: opt(5000),
  catalogPdfUrl: opt(500), catalogCoverUrl: opt(500),
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

router.post('/cycles/:id/catalog-file', listingUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received');
  const c = await prisma.catalogCycle.findUnique({ where: { id: String(req.params.id) } });
  if (!c) { await fsp.unlink(req.file.path).catch(() => undefined); throw new HttpError(404, 'Cycle not found'); }
  const kind = req.body?.kind === 'cover' ? 'cover' : 'pdf';
  const { publishUpload } = await import('../../lib/storage.js');
  const stored = await publishUpload({ subdir: 'pod', filename: req.file.filename, localPath: req.file.path, contentType: req.file.mimetype, originalName: req.file.originalname });
  await prisma.mediaFile.create({ data: { filename: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, url: stored.url, folder: '/pod/catalogs', tags: ['pod-catalog', `cycle:${c.id}`, `kind:${kind}`], uploaderId: req.session?.sub } });
  await prisma.catalogCycle.update({ where: { id: c.id }, data: kind === 'cover' ? { catalogCoverUrl: stored.url } : { catalogPdfUrl: stored.url } });
  await recordPodEvent('cycle', c.id, 'catalog-file', `${kind === 'cover' ? 'Catalog cover' : 'Catalog PDF'} uploaded: ${req.file.originalname}`, actorOf(req));
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
  res.json({ settings: await getPodSettings(), formats: FORMATS, catalogEligible: [...CATALOG_ELIGIBLE], returnReasons: RETURN_REASONS });
});

router.put('/settings', async (req, res) => {
  res.json({ settings: await savePodSettings(req.body?.settings ?? req.body) });
});

/** Re-send the "listing submitted" nudge to staff (used from the queue). */
router.post('/listings/:id/nudge', async (req, res) => {
  res.json({ mail: await notifyStaffListingSubmitted(req.params.id) });
});

// ---------------------------------------------------------------------------
// Retailer orders (the wholesale orders, inside the section so a POD admin
// can work them without the store's Orders area)
// ---------------------------------------------------------------------------

const podOrderSelect = {
  id: true, number: true, email: true, status: true, paymentStatus: true, subtotalCents: true, shippingCents: true, taxCents: true, discountCents: true, totalCents: true, createdAt: true, updatedAt: true, notes: true, shippingMethod: true, shippingAddress: true, wholesale: true,
  retailer: { select: { id: true, name: true, contactEmail: true, creditCents: true } }, cycle: { select: { id: true, name: true, focDate: true, inStoreDate: true, status: true } },
  items: { select: { id: true, name: true, quantity: true, unitPriceCents: true, totalCents: true, options: true, wholesale: true, listing: { select: { id: true, catalogKey: true, partner: { select: { name: true } } } } } },
  shipments: { select: { id: true, carrier: true, service: true, trackingCode: true, status: true, createdAt: true } },
  payments: { select: { id: true, provider: true, status: true, amountCents: true, createdAt: true } },
  events: { orderBy: { createdAt: 'desc' as const }, take: 50, select: { id: true, kind: true, message: true, actorName: true, createdAt: true, fromStatus: true, toStatus: true } },
  retailerReturns: { select: { id: true, number: true, status: true, quantity: true, creditCents: true, kind: true } },
} satisfies Prisma.OrderSelect;

router.get('/orders', async (req, res) => {
  const where: Prisma.OrderWhereInput = { source: 'retailer' };
  const st = String(req.query.status ?? '');
  if (st === 'unpaid') { where.paymentStatus = 'PENDING'; where.status = { notIn: ['CANCELLED', 'REFUNDED'] }; }
  else if (st === 'paid') where.paymentStatus = 'CAPTURED';
  else if (st) where.status = st as never;
  if (req.query.cycleId) where.cycleId = String(req.query.cycleId);
  if (req.query.retailerId) where.retailerId = String(req.query.retailerId);
  const q = String(req.query.q ?? '').trim();
  if (q) where.OR = [{ number: { contains: q, mode: 'insensitive' } }, { retailer: { name: { contains: q, mode: 'insensitive' } } }, { email: { contains: q, mode: 'insensitive' } }];
  const rows = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, number: true, status: true, paymentStatus: true, subtotalCents: true, shippingCents: true, totalCents: true, createdAt: true, wholesale: true, retailer: { select: { id: true, name: true } }, cycle: { select: { id: true, name: true } }, _count: { select: { items: true, shipments: true } } } });
  const totals = await prisma.order.aggregate({ where: { source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } }, _sum: { subtotalCents: true }, _count: { _all: true } });
  const unpaid = await prisma.order.aggregate({ where: { source: 'retailer', paymentStatus: 'PENDING', status: { notIn: ['CANCELLED', 'REFUNDED'] } }, _sum: { totalCents: true }, _count: { _all: true } });
  res.json({ orders: rows, totals: { count: totals._count._all, wholesaleCents: totals._sum.subtotalCents ?? 0, unpaidCount: unpaid._count._all, unpaidCents: unpaid._sum.totalCents ?? 0 } });
});

router.get('/orders/:id', async (req, res) => {
  const o = await prisma.order.findFirst({ where: { id: req.params.id, source: 'retailer' }, select: podOrderSelect });
  if (!o) throw new HttpError(404, 'Order not found');
  res.json({ order: o, payLink: o.paymentStatus === 'PENDING' && o.totalCents > 0 ? await orderPayLink(o.id, o.number) : null, paymentMethods: PAYMENT_METHODS });
});

/** Shipping billed later: set the real cost once packed (before the invoice goes out). */
router.post('/orders/:id/shipping', async (req, res) => {
  const body = z.object({ cents: num.int().min(0), note: opt(300) }).parse(req.body);
  const o = await prisma.order.findFirst({ where: { id: req.params.id, source: 'retailer' }, select: { id: true, shippingCents: true, subtotalCents: true, taxCents: true, discountCents: true, paymentStatus: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.paymentStatus === 'CAPTURED') throw new HttpError(400, 'This order is already paid; add a separate adjustment instead');
  await prisma.order.update({ where: { id: o.id }, data: { shippingCents: body.cents, totalCents: o.subtotalCents - o.discountCents + o.taxCents + body.cents, shippingMethod: body.note ?? 'Wholesale shipping', events: { create: { kind: 'note', message: `Shipping set to $${(body.cents / 100).toFixed(2)}${body.note ? ` (${body.note})` : ''} by ${actorOf(req).name}`, actorName: actorOf(req).name } } } });
  res.json({ order: await prisma.order.findUnique({ where: { id: o.id }, select: podOrderSelect }) });
});

router.post('/orders/:id/mark-paid', async (req, res) => {
  const body = z.object({ provider: str(40), reference: opt(120) }).parse(req.body);
  await markOrderPaid(req.params.id, body, { userId: req.session?.sub ?? null, email: req.session?.email ?? null, name: actorOf(req).name });
  res.json({ order: await prisma.order.findUnique({ where: { id: req.params.id }, select: podOrderSelect }) });
});

router.post('/orders/:id/pay-link', async (req, res) => {
  const o = await prisma.order.findFirst({ where: { id: req.params.id, source: 'retailer' }, select: { id: true, number: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  const url = await orderPayLink(o.id, o.number);
  const mail = req.body?.send === false ? null : await sendPayRequestEmail(o.id, url);
  res.json({ url, mail });
});

router.post('/orders/:id/cancel', async (req, res) => {
  const body = z.object({ reason: opt(300) }).parse(req.body ?? {});
  const o = await prisma.order.findFirst({ where: { id: req.params.id, source: 'retailer' }, select: { id: true, status: true, paymentStatus: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.paymentStatus === 'CAPTURED') throw new HttpError(400, 'Refund a paid order from the store Orders area');
  await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED', events: { create: { kind: 'status', fromStatus: o.status, toStatus: 'CANCELLED', message: body.reason ?? 'Canceled by staff', actorName: actorOf(req).name } } } });
  res.json({ order: await prisma.order.findUnique({ where: { id: o.id }, select: podOrderSelect }) });
});

// ---------------------------------------------------------------------------
// Returns & damages
// ---------------------------------------------------------------------------

const returnInclude = { retailer: { select: { id: true, name: true } }, order: { select: { id: true, number: true, cycle: { select: { name: true } } } }, listing: { select: { id: true, title: true, catalogKey: true, partner: { select: { id: true, name: true } } } } } satisfies Prisma.RetailerReturnInclude;

router.get('/returns', async (req, res) => {
  const where: Prisma.RetailerReturnWhereInput = {};
  const st = String(req.query.status ?? '');
  if (st === 'open') where.status = { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] };
  else if (st) where.status = st as never;
  const rows = await prisma.retailerReturn.findMany({ where, include: returnInclude, orderBy: { createdAt: 'desc' }, take: 300 });
  const counts = await prisma.retailerReturn.groupBy({ by: ['status'], _count: { _all: true } });
  res.json({ returns: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), reasons: RETURN_REASONS });
});

router.post('/returns/:id/decide', async (req, res) => {
  const body = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED', 'CREDITED']), creditCents: num.int().min(0).nullable().optional(), note: opt(1000) }).parse(req.body);
  await decideReturn(req.params.id, body, actorOf(req));
  res.json({ return: await prisma.retailerReturn.findUnique({ where: { id: req.params.id }, include: returnInclude }) });
});

// ---------------------------------------------------------------------------
// Files: every file on every listing, for the file desk
// ---------------------------------------------------------------------------

router.get('/files', async (req, res) => {
  const where: Prisma.ListingFileWhereInput = {};
  if (req.query.kind) where.kind = String(req.query.kind);
  if (req.query.status) where.reviewStatus = String(req.query.status);
  if (req.query.partnerId) where.listing = { partnerId: String(req.query.partnerId) };
  if (req.query.listingId) where.listingId = String(req.query.listingId);
  const q = String(req.query.q ?? '').trim();
  if (q) where.OR = [{ media: { originalName: { contains: q, mode: 'insensitive' } } }, { listing: { title: { contains: q, mode: 'insensitive' } } }, { listing: { catalogKey: { contains: q, mode: 'insensitive' } } }];
  const current = String(req.query.current ?? '1') === '1';
  const rows = await prisma.listingFile.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500, include: { media: { select: { id: true, url: true, originalName: true, size: true, mimeType: true, createdAt: true } }, listing: { select: { id: true, title: true, issueNumber: true, catalogKey: true, status: true, partner: { select: { id: true, name: true } } } } } });
  // Mark which rows are the current version of their kind.
  const newest = new Map<string, number>();
  const all = await prisma.listingFile.groupBy({ by: ['listingId', 'kind'], _max: { version: true } });
  for (const g of all) newest.set(`${g.listingId}:${g.kind}`, g._max?.version ?? 0);
  const files = rows.map((f) => ({ ...f, kindLabel: FILE_KIND_LABELS[f.kind as keyof typeof FILE_KIND_LABELS] ?? f.kind, isCurrent: newest.get(`${f.listingId}:${f.kind}`) === f.version })).filter((f) => !current || f.isCurrent);
  const [count, bytes, byKind, byStatus, assets] = await Promise.all([
    prisma.listingFile.count(), prisma.mediaFile.aggregate({ where: { folder: { startsWith: '/pod' } }, _sum: { size: true }, _count: { _all: true } }),
    prisma.listingFile.groupBy({ by: ['kind'], _count: { _all: true } }), prisma.listingFile.groupBy({ by: ['reviewStatus'], _count: { _all: true } }), prisma.publisherAsset.count(),
  ]);
  res.json({ files, stats: { versions: count, mediaFiles: bytes._count._all, bytes: bytes._sum.size ?? 0, byKind: Object.fromEntries(byKind.map((b) => [b.kind, b._count._all])), byStatus: Object.fromEntries(byStatus.map((b) => [b.reviewStatus, b._count._all])), assets } });
});

router.post('/files/bulk', async (req, res) => {
  const body = z.object({ ids: z.array(str(40)).min(1).max(200), action: z.enum(['approve', 'reject', 'reset', 'delete', 'preflight']), note: opt(500) }).parse(req.body);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of body.ids) {
    try {
      if (body.action === 'delete') await deleteListingFile(id, actorOf(req));
      else if (body.action === 'preflight') await rerunPreflight(id);
      else {
        const f = await prisma.listingFile.update({ where: { id }, data: { reviewStatus: body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'uploaded', note: body.note ?? undefined } });
        await recordPodEvent('listing', f.listingId, 'file-review', `${f.kind} v${f.version} ${f.reviewStatus}${body.note ? ` — ${body.note}` : ''} (bulk)`, actorOf(req));
      }
      results.push({ id, ok: true });
    } catch (e: any) { results.push({ id, ok: false, error: e?.message ?? String(e) }); }
  }
  res.json({ results });
});

router.get('/assets', async (req, res) => {
  const where: Prisma.PublisherAssetWhereInput = {};
  if (req.query.partnerId) where.partnerId = String(req.query.partnerId);
  if (req.query.kind) where.kind = String(req.query.kind);
  const rows = await prisma.publisherAsset.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: { media: { select: { id: true, url: true, originalName: true, size: true, mimeType: true } }, partner: { select: { id: true, name: true } } } });
  res.json({ assets: rows });
});

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------

router.get('/barcodes', async (req, res) => {
  const where: Prisma.BarcodeWhereInput = {};
  if (req.query.status) where.status = String(req.query.status) as never;
  if (req.query.partnerId) where.partnerId = String(req.query.partnerId);
  if (req.query.block) where.block = String(req.query.block);
  const q = String(req.query.q ?? '').trim();
  if (q) where.OR = [{ code: { contains: q } }, { block: { contains: q, mode: 'insensitive' } }, { listing: { title: { contains: q, mode: 'insensitive' } } }];
  const rows = await prisma.barcode.findMany({ where, orderBy: [{ status: 'asc' }, { code: 'asc' }], take: 500, include: { partner: { select: { id: true, name: true } }, listing: { select: { id: true, title: true, issueNumber: true, catalogKey: true } } } });
  const [counts, blocks] = await Promise.all([prisma.barcode.groupBy({ by: ['status'], _count: { _all: true } }), prisma.barcode.groupBy({ by: ['block'], _count: { _all: true } })]);
  res.json({ barcodes: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), blocks: blocks.map((b) => ({ block: b.block, count: b._count._all })) });
});

router.post('/barcodes/blocks', async (req, res) => {
  const body = z.object({ mode: z.enum(['range', 'list']), prefix: opt(12), start: num.int().min(0).optional(), count: num.int().min(1).max(10_000).optional(), symbology: z.enum(['UPC-A', 'EAN-13']).default('UPC-A'), codes: opt(200_000), block: opt(80), partnerId: str(40).nullable().optional(), notes: opt(500) }).parse(req.body);
  const codes = body.mode === 'range'
    ? expandBlock({ prefix: body.prefix ?? '', start: body.start ?? 0, count: body.count ?? 0, symbology: body.symbology })
    : (body.codes ?? '').split(/[\s,;]+/).filter(Boolean);
  if (!codes.length) throw new HttpError(400, 'No codes to load');
  const r = await loadBlock({ codes, block: body.block ?? null, partnerId: body.partnerId ?? null, notes: body.notes ?? null }, actorOf(req));
  res.status(201).json(r);
});

router.post('/barcodes/preview', async (req, res) => {
  const body = z.object({ prefix: opt(12), start: num.int().min(0), count: num.int().min(1).max(10_000), symbology: z.enum(['UPC-A', 'EAN-13']).default('UPC-A') }).parse(req.body);
  const codes = expandBlock({ prefix: body.prefix ?? '', start: body.start, count: Math.min(body.count, 5), symbology: body.symbology });
  const last = expandBlock({ prefix: body.prefix ?? '', start: body.start + body.count - 1, count: 1, symbology: body.symbology });
  res.json({ first: codes, last: last[0], count: body.count });
});

router.post('/barcodes/:id/reserve', async (req, res) => {
  const body = z.object({ partnerId: str(40).nullable() }).parse(req.body);
  const b = await prisma.barcode.findUnique({ where: { id: req.params.id } });
  if (!b) throw new HttpError(404, 'Barcode not found');
  if (b.status === 'ASSIGNED') throw new HttpError(400, 'Release it from its listing first');
  await prisma.barcode.update({ where: { id: b.id }, data: { partnerId: body.partnerId, status: body.partnerId ? 'RESERVED' : 'AVAILABLE' } });
  res.json({ ok: true });
});

router.post('/barcodes/reserve-bulk', async (req, res) => {
  const body = z.object({ partnerId: str(40), count: num.int().min(1).max(1000), block: opt(80) }).parse(req.body);
  const free = await prisma.barcode.findMany({ where: { status: 'AVAILABLE', ...(body.block ? { block: body.block } : {}) }, orderBy: { code: 'asc' }, take: body.count, select: { id: true } });
  if (free.length < body.count) throw new HttpError(409, `Only ${free.length} free codes${body.block ? ` in ${body.block}` : ''}`);
  await prisma.barcode.updateMany({ where: { id: { in: free.map((f) => f.id) } }, data: { partnerId: body.partnerId, status: 'RESERVED' } });
  await recordPodEvent('listing', body.partnerId, 'barcodes-reserved', `${free.length} codes reserved`, actorOf(req));
  res.json({ reserved: free.length });
});

router.post('/barcodes/:id/release', async (req, res) => { res.json({ barcode: await releaseBarcode(req.params.id, actorOf(req), false) }); });
router.post('/barcodes/:id/retire', async (req, res) => { res.json({ barcode: await releaseBarcode(req.params.id, actorOf(req), true) }); });
router.post('/barcodes/:id/assign', async (req, res) => {
  const body = z.object({ listingId: str(40) }).parse(req.body);
  await assignBarcode(body.listingId, actorOf(req), req.params.id);
  res.json({ listing: presentListing((await loadListing(body.listingId))!, 'staff') });
});
router.get('/barcodes/:code.svg', async (req, res) => {
  const { code } = normalizeBarcode(String(req.params.code));
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(barcodeSvg(code));
});

// ---------------------------------------------------------------------------
// Analytics & activity
// ---------------------------------------------------------------------------

router.get('/analytics', async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
  const since = new Date(Date.now() - days * 86_400_000);
  const live: Prisma.OrderWhereInput = { source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] } };
  const [byCycle, byPublisher, byRetailer, byTitle, daily, listings, retailers] = await Promise.all([
    prisma.order.groupBy({ by: ['cycleId'], where: live, _sum: { subtotalCents: true }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ['listingId'], where: { order: live, listingId: { not: null } }, _sum: { quantity: true, totalCents: true } }),
    prisma.order.groupBy({ by: ['retailerId'], where: live, _sum: { subtotalCents: true }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ['listingId'], where: { order: { ...live, createdAt: { gte: since } }, listingId: { not: null } }, _sum: { quantity: true, totalCents: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 15 }),
    prisma.order.findMany({ where: { ...live, createdAt: { gte: since } }, select: { createdAt: true, subtotalCents: true } }),
    prisma.listing.findMany({ where: { id: { in: [] } } }).then(() => prisma.listing.findMany({ select: { id: true, title: true, issueNumber: true, catalogKey: true, partnerId: true, partner: { select: { name: true } } } })),
    prisma.retailer.findMany({ select: { id: true, name: true } }),
  ]);
  const cycles = await prisma.catalogCycle.findMany({ select: { id: true, name: true, catalogDate: true } });
  const lmap = new Map(listings.map((l) => [l.id, l]));
  const pub = new Map<string, { name: string; units: number; wholesaleCents: number; titles: number }>();
  for (const r of byPublisher) { const l = lmap.get(r.listingId!); if (!l) continue; const p = pub.get(l.partnerId) ?? { name: l.partner.name, units: 0, wholesaleCents: 0, titles: 0 }; p.units += r._sum?.quantity ?? 0; p.wholesaleCents += r._sum?.totalCents ?? 0; p.titles++; pub.set(l.partnerId, p); }
  const byDay = new Map<string, { orders: number; cents: number }>();
  for (const o of daily) { const k = o.createdAt.toISOString().slice(0, 10); const d = byDay.get(k) ?? { orders: 0, cents: 0 }; d.orders++; d.cents += o.subtotalCents; byDay.set(k, d); }
  const series: { date: string; orders: number; cents: number }[] = [];
  for (let i = days - 1; i >= 0; i--) { const k = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10); series.push({ date: k, ...(byDay.get(k) ?? { orders: 0, cents: 0 }) }); }
  const ledger = await prisma.partnerLedgerEntry.groupBy({ by: ['kind'], _sum: { amountCents: true } });
  res.json({
    days,
    cycles: byCycle.map((c) => ({ id: c.cycleId, name: cycles.find((x) => x.id === c.cycleId)?.name ?? '—', catalogDate: cycles.find((x) => x.id === c.cycleId)?.catalogDate ?? null, orders: (c._count as { _all: number })._all, wholesaleCents: c._sum?.subtotalCents ?? 0 })).sort((a, b) => String(b.catalogDate).localeCompare(String(a.catalogDate))),
    publishers: [...pub.entries()].map(([id, p]) => ({ id, ...p })).sort((a, b) => b.wholesaleCents - a.wholesaleCents),
    retailers: byRetailer.map((r) => ({ id: r.retailerId, name: retailers.find((x) => x.id === r.retailerId)?.name ?? '—', orders: (r._count as { _all: number })._all, wholesaleCents: r._sum?.subtotalCents ?? 0 })).sort((a, b) => b.wholesaleCents - a.wholesaleCents),
    topTitles: byTitle.map((t) => { const l = lmap.get(t.listingId!); return { id: t.listingId, title: l ? `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}` : '—', catalogKey: l?.catalogKey, publisher: l?.partner.name, units: t._sum?.quantity ?? 0, wholesaleCents: t._sum?.totalCents ?? 0 }; }),
    series,
    money: Object.fromEntries(ledger.map((l) => [l.kind, l._sum.amountCents ?? 0])),
  });
});

router.get('/activity', async (req, res) => {
  const where: Prisma.PodEventWhereInput = {};
  if (req.query.subjectType) where.subjectType = String(req.query.subjectType);
  if (req.query.subjectId) where.subjectId = String(req.query.subjectId);
  const q = String(req.query.q ?? '').trim();
  if (q) where.OR = [{ message: { contains: q, mode: 'insensitive' } }, { actorName: { contains: q, mode: 'insensitive' } }, { kind: { contains: q, mode: 'insensitive' } }];
  const rows = await prisma.podEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(1000, Number(req.query.take) || 200) });
  res.json({ events: rows });
});

// ---------------------------------------------------------------------------
// Inventory (consignment stock)
// ---------------------------------------------------------------------------

router.get('/inventory', async (_req, res) => {
  const rows = await prisma.listing.findMany({ where: { OR: [{ fulfillment: 'CONSIGNMENT' }, { inventoryUnits: { gt: 0 } }, { inventoryIncoming: { gt: 0 } }] }, orderBy: [{ partner: { name: 'asc' } }, { title: 'asc' }], select: { id: true, title: true, issueNumber: true, catalogKey: true, status: true, fulfillment: true, weightOz: true, inventoryUnits: true, inventoryDamaged: true, inventoryIncoming: true, inventoryReorderLevel: true, inventoryLocation: true, partner: { select: { id: true, name: true } }, coverImage: { select: { url: true } } } });
  // Reserved = ordered in open (published, not yet locked) cycles.
  const reserved = await prisma.orderItem.groupBy({ by: ['listingId'], where: { listingId: { in: rows.map((r) => r.id) }, order: { source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] }, cycle: { status: 'PUBLISHED' } } }, _sum: { quantity: true } });
  const rmap = new Map(reserved.map((x) => [x.listingId!, x._sum?.quantity ?? 0]));
  res.json({ inventory: rows.map((r) => ({ ...r, reserved: rmap.get(r.id) ?? 0, available: Math.max(0, r.inventoryUnits - (rmap.get(r.id) ?? 0)), low: r.inventoryReorderLevel > 0 && r.inventoryUnits <= r.inventoryReorderLevel })) });
});

// ---------------------------------------------------------------------------
// Fulfillment: paid wholesale orders waiting to ship, weights, tracking, CSV
// ---------------------------------------------------------------------------

async function pendingShipments() {
  const orders = await prisma.order.findMany({ where: { source: 'retailer', status: { in: ['PAID', 'IN_PRODUCTION'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, number: true, status: true, paymentStatus: true, createdAt: true, shippingAddress: true, retailer: { select: { id: true, name: true, contactEmail: true, phone: true } }, cycle: { select: { name: true, inStoreDate: true } }, items: { select: { id: true, name: true, quantity: true, listing: { select: { weightOz: true, pageCount: true, fulfillment: true } } } }, shipments: { select: { id: true, trackingCode: true, carrier: true, createdAt: true } } } });
  return orders.map((o) => {
    const units = o.items.reduce((s2, i) => s2 + i.quantity, 0);
    const weightOz = o.items.reduce((s2, i) => s2 + i.quantity * (i.listing?.weightOz ?? (i.listing?.pageCount ? 1.5 + i.listing.pageCount * 0.08 : 3)), 0);
    return { ...o, units, weightOz: Math.round(weightOz * 10) / 10, weightLb: Math.round((weightOz / 16) * 100) / 100, publisherShipsLines: o.items.filter((i) => i.listing?.fulfillment === 'PARTNER_SHIPS').length };
  });
}

router.get('/fulfillment', async (_req, res) => {
  const rows = await pendingShipments();
  const shipped = await prisma.shipment.findMany({ where: { order: { source: 'retailer' } }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { id: true, number: true, retailer: { select: { name: true } } } } } });
  res.json({ pending: rows, recentShipments: shipped });
});

router.get('/fulfillment/export.csv', async (_req, res) => {
  const rows = await pendingShipments();
  const { csvEscape } = await import('../../lib/pod/csv.js');
  const head = ['Order', 'Ship to name', 'Company', 'Street 1', 'Street 2', 'City', 'State', 'ZIP', 'Country', 'Phone', 'Email', 'Units', 'Weight (oz)', 'Weight (lb)', 'Catalog'];
  const lines = [head.join(',')];
  for (const o of rows) { const a = (o.shippingAddress ?? {}) as Record<string, string>; lines.push([o.number, `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim(), a.company ?? o.retailer?.name ?? '', a.line1 ?? '', a.line2 ?? '', a.city ?? '', a.region ?? '', a.postalCode ?? '', a.country ?? 'US', a.phone ?? o.retailer?.phone ?? '', o.retailer?.contactEmail ?? '', o.units, o.weightOz, o.weightLb, o.cycle?.name ?? ''].map(csvEscape).join(',')); }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wholesale-shipments.csv"');
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
});

router.post('/fulfillment/:orderId/ship', async (req, res) => {
  const body = z.object({ carrier: str(40), service: opt(60), trackingCode: opt(80), weightOz: num.min(0).nullable().optional(), notify: z.boolean().optional() }).parse(req.body);
  const o = await prisma.order.findFirst({ where: { id: req.params.orderId, source: 'retailer' }, include: { items: { select: { id: true, quantity: true } } } });
  if (!o) throw new HttpError(404, 'Order not found');
  const shipment = await prisma.shipment.create({ data: { orderId: o.id, carrier: body.carrier, service: body.service ?? null, trackingCode: body.trackingCode ?? null, weightOz: body.weightOz ?? null, status: 'SHIPPED', items: { create: o.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })) } } });
  await prisma.order.update({ where: { id: o.id }, data: { status: 'SHIPPED', trackingNumber: body.trackingCode ?? o.trackingNumber, events: { create: { kind: 'tracking', fromStatus: o.status, toStatus: 'SHIPPED', message: `Shipped via ${body.carrier}${body.trackingCode ? ` · ${body.trackingCode}` : ''} by ${actorOf(req).name}`, actorName: actorOf(req).name } } } });
  let mail: { sent: boolean; error?: string } | null = null;
  if (body.notify !== false) { const { sendShippingNotificationEmail } = await import('../../lib/order-emails.js'); mail = await sendShippingNotificationEmail(o.id).then(() => ({ sent: true })).catch((e: any) => ({ sent: false, error: e?.message })); }
  res.status(201).json({ shipment, mail });
});

// ---------------------------------------------------------------------------
// Team notes on production runs (shared with the preflight desk)
// ---------------------------------------------------------------------------

router.post('/production/:id/notes', async (req, res) => {
  const body = z.object({ text: str(2000) }).parse(req.body);
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!po) throw new HttpError(404, 'Production order not found');
  await recordPodEvent('production', po.id, 'note', body.text, actorOf(req));
  res.status(201).json({ events: await podEvents('production', po.id) });
});

export default router;
