/**
 * /api/pod — the customer-facing side of Print On Demand:
 *   public:   the programme page, the live catalog, the two application forms
 *   /partner: a publisher's listings, files, purchase orders and statements
 *   /retailer: a shop's catalog at wholesale, basket preview, orders, CSV
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ListingStatusKey } from '../lib/pod/catalog.js';
import { getPodSettings, publicPodSettings } from '../lib/pod/settings.js';
import { CYCLE_STATUS_LABELS, FORMATS, LISTING_STATUS_LABELS, PARTNER_EDITABLE, currentPublisherCycle, currentRetailerCycle, cycleItems, cycleOrderingOpen, deriveCatalogKey, priceRetailerBasket, setListingStatus, uniqueCatalogKey } from '../lib/pod/catalog.js';
import { listingInclude, loadListing, presentListing, presentPublicListing } from '../lib/pod/present.js';
import { isFileKind, listingUpload, storeListingFile } from '../lib/pod/files.js';
import { actorOf, podEvents, recordPodEvent, slugify } from '../lib/pod/events.js';
import { catalogCsv, parseOrderForm } from '../lib/pod/csv.js';
import { pickTier, wholesaleUnit } from '../lib/pod/wholesale.js';
import { ledgerSummary } from '../lib/pod/payouts.js';
import { notifyStaffListingSubmitted, notifyStaffRetailerApplied, sendRetailerOrderEmail } from '../lib/pod/emails.js';
import { newOrderNumber } from '../lib/checkout-order.js';
import { clientIp } from '../middleware/botblocker.js';

const router = Router();
const str = (max = 500) => z.string().trim().max(max);
const opt = (max = 500) => str(max).nullable().optional();
const num = z.coerce.number();
const applyLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

router.get('/', async (_req, res) => {
  const s = await getPodSettings();
  const [cycle, nextCycle, live, publishers, retailers] = await Promise.all([
    currentRetailerCycle(),
    prisma.catalogCycle.findFirst({ where: { status: { in: ['OPEN', 'DRAFT'] }, publisherOpen: true }, orderBy: { catalogDate: 'asc' } }),
    prisma.listing.count({ where: { status: 'LIVE' } }),
    prisma.partner.count({ where: { listings: { some: { status: { in: ['LIVE', 'APPROVED', 'SCHEDULED'] } } } } }),
    prisma.retailer.count({ where: { status: 'ACTIVE' } }),
  ]);
  const featured = cycle ? (await cycleItems(cycle.id)).filter((i) => i.coverImageUrl).slice(0, 12) : [];
  res.json({
    settings: publicPodSettings(s),
    cycle: cycle ? { id: cycle.id, slug: cycle.slug, name: cycle.name, catalogDate: cycle.catalogDate, focDate: cycle.focDate, inStoreDate: cycle.inStoreDate, orderingOpen: cycleOrderingOpen(cycle) } : null,
    nextCycle: nextCycle ? { id: nextCycle.id, name: nextCycle.name, catalogDate: nextCycle.catalogDate, focDate: nextCycle.focDate, inStoreDate: nextCycle.inStoreDate } : null,
    stats: { live, publishers, retailers },
    featured: featured.map((f) => ({ listingId: f.listingId, catalogKey: f.catalogKey, title: f.title, issueNumber: f.issueNumber, publisher: f.partner.name, msrpCents: f.msrpCents, coverImageUrl: f.coverImageUrl, productId: f.productId })),
  });
});

router.get('/catalog', async (req, res) => {
  const cycleSlug = String(req.query.cycle ?? '');
  const cycles = await prisma.catalogCycle.findMany({ where: { status: { in: ['PUBLISHED', 'FOC_LOCKED', 'CLOSED'] }, publishedAt: { not: null } }, orderBy: { catalogDate: 'desc' }, take: 12 });
  const cycle = (cycleSlug ? cycles.find((c) => c.slug === cycleSlug) : null) ?? (await currentRetailerCycle()) ?? cycles[0] ?? null;
  if (!cycle) return res.json({ cycle: null, cycles: [], listings: [] });
  const items = await cycleItems(cycle.id);
  const rows = await prisma.listing.findMany({ where: { id: { in: items.map((i) => i.listingId) }, status: 'LIVE' }, include: listingInclude });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const listings = items.filter((i) => byId.has(i.listingId)).map((i) => presentPublicListing(byId.get(i.listingId)!));
  res.json({
    cycle: { id: cycle.id, slug: cycle.slug, name: cycle.name, status: cycle.status, statusLabel: CYCLE_STATUS_LABELS[cycle.status], catalogDate: cycle.catalogDate, focDate: cycle.focDate, inStoreDate: cycle.inStoreDate, orderingOpen: cycleOrderingOpen(cycle) },
    cycles: cycles.map((c) => ({ id: c.id, slug: c.slug, name: c.name, status: c.status, catalogDate: c.catalogDate, focDate: c.focDate, inStoreDate: c.inStoreDate })),
    listings,
  });
});

router.get('/catalog/:key', async (req, res) => {
  const l = await prisma.listing.findFirst({ where: { catalogKey: req.params.key, status: 'LIVE' }, include: listingInclude });
  if (!l) throw new HttpError(404, 'Not in the catalog');
  const siblings = await prisma.listing.findMany({ where: { partnerId: l.partnerId, status: 'LIVE', id: { not: l.id } }, include: listingInclude, take: 8, orderBy: { title: 'asc' } });
  res.json({ listing: presentPublicListing(l), cycle: l.cycle, more: siblings.map(presentPublicListing) });
});

router.post('/apply/publisher', applyLimiter, async (req, res) => {
  const body = z.object({ name: str(160), contactName: str(120), contactEmail: z.string().trim().email(), website: opt(200), titles: opt(2000), message: opt(4000), fulfillment: z.enum(['PRINTED_BY_US', 'PARTNER_SHIPS', 'BOTH']).optional() }).parse(req.body);
  const app = await prisma.partnerApplication.create({ data: {
    name: body.name, contactName: body.contactName, contactEmail: body.contactEmail, platform: 'publisher', website: body.website ?? null, scopes: ['pod'],
    message: [body.message, body.titles ? `Titles: ${body.titles}` : null, body.fulfillment ? `Fulfillment: ${body.fulfillment}` : null].filter(Boolean).join('\n\n') || null,
    ipAddress: clientIp(req), userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  } });
  res.status(201).json({ ok: true, id: app.id });
});

router.post('/apply/retailer', applyLimiter, async (req, res) => {
  const body = z.object({
    name: str(160), contactName: str(120), contactEmail: z.string().trim().email(), phone: opt(40), website: opt(200),
    address: z.object({ line1: str(200), line2: opt(200), city: str(100), region: str(100), postalCode: str(20), country: str(2).default('US') }),
    resaleCertNumber: opt(80), resaleCertState: opt(40), message: opt(4000),
  }).parse(req.body);
  const existing = await prisma.retailer.findFirst({ where: { contactEmail: { equals: body.contactEmail, mode: 'insensitive' }, status: { not: 'ARCHIVED' } } });
  if (existing) throw new HttpError(409, 'There is already an application or account for that email. Sign in, or write to us.');
  let slug = slugify(body.name);
  for (let i = 2; await prisma.retailer.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(body.name)}-${i}`;
  const r = await prisma.retailer.create({ data: { slug, name: body.name, contactName: body.contactName, contactEmail: body.contactEmail.toLowerCase(), phone: body.phone ?? null, website: body.website ?? null, address: body.address, resaleCertNumber: body.resaleCertNumber ?? null, resaleCertState: body.resaleCertState ?? null, resaleCertStatus: body.resaleCertNumber ? 'submitted' : 'not_submitted', applicationMessage: body.message ?? null, status: 'PENDING' } });
  await recordPodEvent('retailer', r.id, 'applied', `${body.contactName} <${body.contactEmail}>`, null);
  void notifyStaffRetailerApplied(r.id);
  res.status(201).json({ ok: true, id: r.id });
});

// ---------------------------------------------------------------------------
// Partner (publisher) portal
// ---------------------------------------------------------------------------

async function requirePartner(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  const u = await prisma.user.findUnique({ where: { id: req.session.sub }, select: { partnerId: true, partner: { select: { status: true } } } });
  if (!u?.partnerId) return res.status(403).json({ error: 'This account is not attached to a publisher. Apply on the Print On Demand page or ask us to add you.' });
  if (u.partner?.status !== 'ACTIVE') return res.status(403).json({ error: 'This publisher account is on hold. Write to us to sort it out.' });
  (req as Request & { partnerId: string }).partnerId = u.partnerId;
  next();
}
const partnerId = (req: Request) => (req as Request & { partnerId: string }).partnerId;

const partner = Router();
partner.use(requireAuth, requirePartner);

partner.get('/me', async (req, res) => {
  const pid = partnerId(req);
  const [p, counts, cycle, settings, summary, poOpen, statements] = await Promise.all([
    prisma.partner.findUnique({ where: { id: pid }, select: { id: true, name: true, slug: true, contactEmail: true, website: true, commissionBps: true } }),
    prisma.listing.groupBy({ by: ['status'], where: { partnerId: pid }, _count: { _all: true } }),
    currentPublisherCycle(),
    getPodSettings(),
    ledgerSummary(pid),
    prisma.purchaseOrder.count({ where: { partnerId: pid, status: { in: ['SENT', 'ACKNOWLEDGED'] } } }),
    prisma.payoutStatement.findMany({ where: { partnerId: pid, status: { in: ['ISSUED', 'PAID'] } }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, number: true, status: true, netCents: true, issuedAt: true, paidAt: true } }),
  ]);
  const units = await prisma.orderItem.aggregate({ where: { listing: { partnerId: pid }, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true, totalCents: true } });
  res.json({
    partner: { ...p, commissionBpsPrintedByUs: p?.commissionBps ?? settings.commissionBpsPrintedByUs, commissionBpsPartnerShips: p?.commissionBps ?? settings.commissionBpsPartnerShips },
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    openCycle: cycle ? { id: cycle.id, name: cycle.name, catalogDate: cycle.catalogDate, focDate: cycle.focDate, inStoreDate: cycle.inStoreDate } : null,
    settings: publicPodSettings(settings),
    sales: { units: units._sum.quantity ?? 0, wholesaleCents: units._sum.totalCents ?? 0, owedCents: summary.unassignedCents, paidCents: -summary.payoutsCents },
    purchaseOrdersOpen: poOpen, statements,
  });
});

partner.get('/cycles', async (_req, res) => {
  const cycles = await prisma.catalogCycle.findMany({ where: { status: { in: ['DRAFT', 'OPEN'] }, publisherOpen: true }, orderBy: { catalogDate: 'asc' }, select: { id: true, name: true, catalogDate: true, focDate: true, inStoreDate: true } });
  res.json({ cycles });
});

partner.get('/listings', async (req, res) => {
  const rows = await prisma.listing.findMany({ where: { partnerId: partnerId(req) }, include: listingInclude, orderBy: { updatedAt: 'desc' } });
  const sold = await prisma.orderItem.groupBy({ by: ['listingId'], where: { listing: { partnerId: partnerId(req) }, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true } });
  const soldBy = Object.fromEntries(sold.map((s) => [s.listingId!, s._sum.quantity ?? 0]));
  res.json({ listings: rows.map((l) => ({ ...presentListing(l, 'partner'), unitsSold: soldBy[l.id] ?? 0 })), statuses: Object.entries(LISTING_STATUS_LABELS).map(([key, label]) => ({ key, label })) });
});

const partnerListingBody = z.object({
  cycleId: str(40).nullable().optional(),
  title: str(200), seriesName: opt(200), seriesCode: opt(12), issueNumber: opt(20), coverDescription: opt(200), variantNumber: opt(20), upc: opt(20),
  format: z.enum(FORMATS).optional(), seriesType: opt(40), frequency: opt(40), language: opt(40), ageRating: opt(40),
  pageCount: num.int().min(1).max(2000).nullable().optional(), trimWidthIn: num.min(1).max(30).nullable().optional(), trimHeightIn: num.min(1).max(30).nullable().optional(),
  interiorColor: z.enum(['color', 'bw']).nullable().optional(), weightOz: num.min(0).nullable().optional(), msrpCents: num.int().min(0).optional(),
  description: opt(5000), synopsis: opt(5000), writer: opt(200), artist: opt(200), coverArtist: opt(200), genres: z.array(str(40)).max(10).optional(),
  incentiveRatio: opt(20), incentiveQualifierKey: opt(40), reorderable: z.boolean().optional(), fulfillment: z.enum(['PRINTED_BY_US', 'PARTNER_SHIPS']).optional(),
});

async function ownListing(req: Request) {
  const l = await loadListing(String(req.params.id));
  if (!l || l.partnerId !== partnerId(req)) throw new HttpError(404, 'Listing not found');
  return l;
}

partner.post('/listings', async (req, res) => {
  const body = partnerListingBody.parse(req.body);
  if (body.cycleId) {
    const c = await prisma.catalogCycle.findUnique({ where: { id: body.cycleId } });
    if (!c || !c.publisherOpen || !['DRAFT', 'OPEN'].includes(c.status)) throw new HttpError(400, 'That catalog is not open to new listings');
  }
  const catalogKey = await uniqueCatalogKey(deriveCatalogKey(body));
  const l = await prisma.listing.create({ data: { ...(body as Prisma.ListingUncheckedCreateInput), partnerId: partnerId(req), catalogKey, title: body.title, createdById: req.session!.sub } });
  await recordPodEvent('listing', l.id, 'created', 'Created by the publisher', actorOf(req));
  res.status(201).json({ listing: presentListing((await loadListing(l.id))!, 'partner') });
});

partner.get('/listings/:id', async (req, res) => {
  const l = await ownListing(req);
  const sold = await prisma.orderItem.aggregate({ where: { listingId: l.id, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, _sum: { quantity: true, totalCents: true } });
  res.json({ listing: presentListing(l, 'partner'), events: (await podEvents('listing', l.id)).filter((e) => e.kind !== 'edited' || e.actorId === req.session!.sub), sales: { units: sold._sum.quantity ?? 0, wholesaleCents: sold._sum.totalCents ?? 0 }, editable: PARTNER_EDITABLE.has(l.status as never) });
});

partner.patch('/listings/:id', async (req, res) => {
  const l = await ownListing(req);
  if (!PARTNER_EDITABLE.has(l.status as never)) throw new HttpError(400, `A ${LISTING_STATUS_LABELS[l.status as ListingStatusKey].toLowerCase()} listing cannot be edited. Ask us if something needs to change.`);
  const body = partnerListingBody.partial().parse(req.body);
  if (body.cycleId) {
    const c = await prisma.catalogCycle.findUnique({ where: { id: body.cycleId } });
    if (!c || !c.publisherOpen || !['DRAFT', 'OPEN'].includes(c.status)) throw new HttpError(400, 'That catalog is not open to new listings');
  }
  await prisma.listing.update({ where: { id: l.id }, data: body as Prisma.ListingUncheckedUpdateInput });
  if ((body.seriesCode !== undefined || body.upc !== undefined) && l.status === 'DRAFT') {
    const fresh = await prisma.listing.findUnique({ where: { id: l.id } });
    const wanted = deriveCatalogKey(fresh!);
    if (wanted !== l.catalogKey) await prisma.listing.update({ where: { id: l.id }, data: { catalogKey: await uniqueCatalogKey(wanted, l.id) } });
  }
  await recordPodEvent('listing', l.id, 'edited', `Publisher edited ${Object.keys(body).join(', ')}`, actorOf(req));
  res.json({ listing: presentListing((await loadListing(l.id))!, 'partner') });
});

partner.post('/listings/:id/submit', async (req, res) => {
  const l = await ownListing(req);
  if (!PARTNER_EDITABLE.has(l.status as never)) throw new HttpError(400, 'This listing is already in review');
  const problems: string[] = [];
  if (!l.title) problems.push('a title');
  if (!l.msrpCents) problems.push('a cover price');
  if (!l.pageCount) problems.push('the page count');
  if (!l.trimWidthIn || !l.trimHeightIn) problems.push('the trim size');
  if (!l.cycleId) problems.push('a catalog to go in');
  if (!l.files.some((f) => f.kind === 'cover_image')) problems.push('a cover image');
  if (l.fulfillment === 'PRINTED_BY_US') {
    if (!l.files.some((f) => f.kind === 'cover')) problems.push('the cover PDF');
    if (!l.files.some((f) => f.kind === 'interior')) problems.push('the interior PDF');
  }
  if (problems.length) throw new HttpError(400, `Before it can be reviewed the listing needs ${problems.join(', ')}.`);
  await setListingStatus(l.id, 'SUBMITTED', actorOf(req));
  void notifyStaffListingSubmitted(l.id);
  res.json({ listing: presentListing((await loadListing(l.id))!, 'partner') });
});

partner.post('/listings/:id/withdraw', async (req, res) => {
  const l = await ownListing(req);
  if (l.status !== 'SUBMITTED') throw new HttpError(400, 'Only a listing waiting for review can be withdrawn');
  await setListingStatus(l.id, 'DRAFT', actorOf(req));
  res.json({ listing: presentListing((await loadListing(l.id))!, 'partner') });
});

partner.post('/listings/:id/files', listingUpload.single('file'), async (req, res) => {
  const l = await ownListing(req);
  const kind = req.body?.kind;
  if (!isFileKind(kind)) throw new HttpError(400, 'Which file is this?');
  if (!req.file) throw new HttpError(400, 'No file received');
  if (!PARTNER_EDITABLE.has(l.status as never) && kind !== 'extra' && !(l.status === 'APPROVED' || l.status === 'LIVE')) throw new HttpError(400, 'This listing is in review; files can be replaced once it is approved or sent back');
  const { row, preflight } = await storeListingFile({ listingId: l.id, kind, file: req.file, actor: actorOf(req), uploaderId: req.session!.sub });
  if ((l.status === 'APPROVED' || l.status === 'LIVE') && (kind === 'cover' || kind === 'interior')) {
    await prisma.productionOrder.updateMany({ where: { listingId: l.id, status: { in: ['FILES_NEEDED', 'APPROVED'] } }, data: { status: 'PREFLIGHT' } });
  }
  res.status(201).json({ file: { id: row.id, version: row.version }, preflight, listing: presentListing((await loadListing(l.id))!, 'partner') });
});

partner.get('/purchase-orders', async (req, res) => {
  const rows = await prisma.purchaseOrder.findMany({ where: { partnerId: partnerId(req), status: { not: 'DRAFT' } }, orderBy: { number: 'desc' }, include: { cycle: { select: { name: true, inStoreDate: true } } } });
  res.json({ purchaseOrders: rows.map((po) => ({ ...po, lines: (po.lines as { shipTo?: { retailerName?: string }[] }[]).map((l) => ({ ...l, shipTo: (l.shipTo ?? []).map((s) => ({ ...s, retailerName: undefined })) })) })) });
});
partner.get('/purchase-orders/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { cycle: { select: { name: true, inStoreDate: true } } } });
  if (!po || po.partnerId !== partnerId(req) || po.status === 'DRAFT') throw new HttpError(404, 'Purchase order not found');
  // Ship-to addresses, but not which shop is which.
  const lines = (po.lines as { shipTo?: { retailerName?: string; orderNumber?: string }[] }[]).map((l) => ({ ...l, shipTo: (l.shipTo ?? []).map((s) => ({ ...s, retailerName: undefined, orderNumber: undefined })) }));
  res.json({ purchaseOrder: { ...po, lines } });
});
partner.post('/purchase-orders/:id/acknowledge', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po || po.partnerId !== partnerId(req)) throw new HttpError(404, 'Purchase order not found');
  if (po.status === 'SENT') await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } });
  await recordPodEvent('purchase_order', po.id, 'acknowledged', 'By the publisher', actorOf(req));
  res.json({ ok: true });
});
partner.post('/purchase-orders/:id/shipped', async (req, res) => {
  const body = z.object({ note: opt(1000) }).parse(req.body ?? {});
  const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!po || po.partnerId !== partnerId(req)) throw new HttpError(404, 'Purchase order not found');
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'FULFILLED', fulfilledAt: new Date(), notes: body.note ? `${po.notes ? `${po.notes}\n` : ''}Publisher: ${body.note}` : po.notes } });
  await recordPodEvent('purchase_order', po.id, 'fulfilled', body.note ?? 'Shipped by the publisher', actorOf(req));
  res.json({ ok: true });
});

partner.get('/statements', async (req, res) => {
  const [statements, summary, entries] = await Promise.all([
    prisma.payoutStatement.findMany({ where: { partnerId: partnerId(req), status: { in: ['ISSUED', 'PAID'] } }, orderBy: { createdAt: 'desc' }, include: { cycle: { select: { name: true } } } }),
    ledgerSummary(partnerId(req)),
    prisma.partnerLedgerEntry.findMany({ where: { partnerId: partnerId(req), statementId: null, kind: { not: 'PAYOUT' } }, orderBy: { createdAt: 'desc' }, take: 100, include: { listing: { select: { catalogKey: true, title: true } }, cycle: { select: { name: true } } } }),
  ]);
  res.json({ statements, summary, pending: entries });
});
partner.get('/statements/:id', async (req, res) => {
  const s = await prisma.payoutStatement.findUnique({ where: { id: req.params.id }, include: { cycle: { select: { name: true } } } });
  if (!s || s.partnerId !== partnerId(req) || s.status === 'DRAFT' || s.status === 'VOID') throw new HttpError(404, 'Statement not found');
  res.json({ statement: s });
});

router.use('/partner', partner);

// ---------------------------------------------------------------------------
// Retailer portal
// ---------------------------------------------------------------------------

async function requireRetailer(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  const u = await prisma.user.findUnique({ where: { id: req.session.sub }, select: { retailerId: true, retailer: true } });
  if (!u?.retailerId || !u.retailer) return res.status(403).json({ error: 'This account is not a retailer account. Apply on the Print On Demand page.' });
  if (u.retailer.status === 'PENDING') return res.status(403).json({ error: 'Your application is being reviewed. We will email you when ordering opens.', pending: true });
  if (u.retailer.status !== 'ACTIVE') return res.status(403).json({ error: 'This retailer account is on hold. Write to us to sort it out.' });
  (req as Request & { retailer: typeof u.retailer }).retailer = u.retailer;
  next();
}
type RetailerRow = Prisma.RetailerGetPayload<Record<string, never>>;
const retailerOf = (req: Request) => (req as Request & { retailer: RetailerRow }).retailer;

const retailer = Router();
retailer.use(requireAuth, requireRetailer);

retailer.get('/me', async (req, res) => {
  const r = retailerOf(req);
  const s = await getPodSettings();
  const cycle = await currentRetailerCycle();
  const spend = await prisma.order.aggregate({ where: { retailerId: r.id, status: { notIn: ['CANCELLED', 'REFUNDED'] } }, _sum: { subtotalCents: true }, _count: { _all: true } });
  const open = cycle ? await prisma.order.findFirst({ where: { retailerId: r.id, cycleId: cycle.id, status: { notIn: ['CANCELLED', 'REFUNDED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, subtotalCents: true, wholesale: true, items: { select: { listingId: true, quantity: true } } } }) : null;
  res.json({
    retailer: { id: r.id, name: r.name, contactName: r.contactName, contactEmail: r.contactEmail, phone: r.phone, address: r.address, tierOverride: r.tierOverride, resaleCertStatus: r.resaleCertStatus, taxExempt: r.taxExempt },
    settings: publicPodSettings(s),
    cycle: cycle ? { id: cycle.id, slug: cycle.slug, name: cycle.name, catalogDate: cycle.catalogDate, focDate: cycle.focDate, inStoreDate: cycle.inStoreDate, orderingOpen: cycleOrderingOpen(cycle) } : null,
    totals: { orders: spend._count._all, wholesaleCents: spend._sum.subtotalCents ?? 0 },
    openOrder: open,
  });
});

/** The current catalog with this shop's wholesale price on every row. */
retailer.get('/catalog', async (req, res) => {
  const r = retailerOf(req);
  const s = await getPodSettings();
  const cycleId = String(req.query.cycle ?? '');
  const cycle = cycleId ? await prisma.catalogCycle.findUnique({ where: { id: cycleId } }) : await currentRetailerCycle();
  if (!cycle) return res.json({ cycle: null, listings: [], tiers: s.tiers });
  const items = await cycleItems(cycle.id);
  const base = pickTier(s.tiers, 0, r.tierOverride);
  res.json({
    cycle: { id: cycle.id, slug: cycle.slug, name: cycle.name, catalogDate: cycle.catalogDate, focDate: cycle.focDate, inStoreDate: cycle.inStoreDate, orderingOpen: cycleOrderingOpen(cycle), status: cycle.status },
    tiers: s.tiers, forcedTier: r.tierOverride,
    listings: items.map((i) => ({ ...i, baseWholesaleCents: wholesaleUnit(i.msrpCents, base.tier.discountBps) })),
  });
});

retailer.get('/catalog.csv', async (req, res) => {
  const r = retailerOf(req);
  const s = await getPodSettings();
  const cycle = await currentRetailerCycle();
  if (!cycle) throw new HttpError(404, 'No catalog is open for ordering right now');
  const items = await cycleItems(cycle.id);
  const tier = pickTier(s.tiers, 0, r.tierOverride);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const csv = catalogCsv(items.map((i) => ({
    catalogKey: i.catalogKey, upc: i.upc, title: i.title, seriesName: i.seriesName, issueNumber: i.issueNumber, coverDescription: i.coverDescription, publisher: i.partner.name, format: i.format, pageCount: i.pageCount, interiorColor: i.interiorColor,
    trim: i.trimWidthIn && i.trimHeightIn ? `${i.trimWidthIn} x ${i.trimHeightIn}` : '', msrpCents: i.msrpCents, writer: i.writer, artist: i.artist, coverArtist: i.coverArtist, ageRating: i.ageRating, incentiveRatio: i.incentiveRatio, description: i.synopsis ?? i.description,
    catalogDate: d(cycle.catalogDate), focDate: d(cycle.focDate), inStoreDate: d(cycle.inStoreDate),
  })), { discountBps: tier.tier.discountBps, tierName: tier.tier.name });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${cycle.slug}-order-form.csv"`);
  res.send(csv);
});

const basketBody = z.object({ cycleId: str(40).optional(), quantities: z.record(z.string(), z.coerce.number().int().min(0).max(100_000)) });

retailer.post('/basket/preview', async (req, res) => {
  const r = retailerOf(req);
  const body = basketBody.parse(req.body);
  const cycle = body.cycleId ? await prisma.catalogCycle.findUnique({ where: { id: body.cycleId } }) : await currentRetailerCycle();
  if (!cycle) throw new HttpError(400, 'No catalog is open for ordering');
  const { pricing } = await priceRetailerBasket(cycle.id, body.quantities, r);
  res.json({ pricing, cycleId: cycle.id, orderingOpen: cycleOrderingOpen(cycle) });
});

/** Turn an uploaded order form into quantities (catalog id or UPC → listing). */
retailer.post('/basket/upload', listingUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received');
  const { promises: fs } = await import('node:fs');
  const text = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => undefined);
  const parsed = parseOrderForm(text);
  const cycle = await currentRetailerCycle();
  if (!cycle) throw new HttpError(400, 'No catalog is open for ordering');
  const items = await cycleItems(cycle.id);
  const byKey = new Map<string, string>();
  for (const i of items) { byKey.set(i.catalogKey.toLowerCase(), i.listingId); if (i.upc) byKey.set(i.upc.replace(/\D/g, ''), i.listingId); }
  const quantities: Record<string, number> = {};
  const problems = [...parsed.problems];
  for (const l of parsed.lines) {
    const id = byKey.get(l.ref.toLowerCase()) ?? byKey.get(l.ref.replace(/\D/g, ''));
    if (!id) { problems.push(`Row ${l.line}: "${l.ref}" is not in the ${cycle.name} catalog.`); continue; }
    quantities[id] = (quantities[id] ?? 0) + l.quantity;
  }
  res.json({ quantities, matched: Object.keys(quantities).length, problems });
});

/** Place (or replace) the shop's order in the open cycle. One order per shop per cycle; re-placing replaces the lines. */
retailer.post('/orders', async (req, res) => {
  const r = retailerOf(req);
  const body = basketBody.extend({ notes: opt(2000), poNumber: opt(60) }).parse(req.body);
  const s = await getPodSettings();
  const cycle = body.cycleId ? await prisma.catalogCycle.findUnique({ where: { id: body.cycleId } }) : await currentRetailerCycle();
  if (!cycle || !cycleOrderingOpen(cycle)) throw new HttpError(400, 'Ordering is closed for this catalog');
  const { pricing, items } = await priceRetailerBasket(cycle.id, body.quantities, r, s);
  if (!pricing.lines.length) throw new HttpError(400, 'The order is empty');
  if (pricing.problems.length) throw new HttpError(400, pricing.problems.join(' '));
  const byId = new Map(items.map((i) => [i.listingId, i]));
  const listings = await prisma.listing.findMany({ where: { id: { in: pricing.lines.map((l) => l.listingId) } }, select: { id: true, productId: true, status: true } });
  const productOf = new Map(listings.map((l) => [l.id, l.productId]));
  for (const l of pricing.lines) if (!productOf.get(l.listingId)) throw new HttpError(400, `${l.title} is not available right now`);
  const user = await prisma.user.findUnique({ where: { id: req.session!.sub }, select: { email: true, firstName: true, lastName: true } });
  const addr = (r.address ?? {}) as Record<string, string>;
  const shippingAddress = { firstName: user?.firstName ?? r.contactName?.split(' ')[0] ?? '', lastName: user?.lastName ?? r.contactName?.split(' ').slice(1).join(' ') ?? '', company: r.name, line1: addr.line1 ?? '', line2: addr.line2 ?? '', city: addr.city ?? '', region: addr.region ?? '', postalCode: addr.postalCode ?? '', country: addr.country ?? 'US', phone: r.phone ?? '' };
  const shippingCents = s.retailerShipping.mode === 'flat' ? s.retailerShipping.flatCents : 0;
  const wholesale = { tierName: pricing.tier.tier.name, tierIndex: pricing.tier.index + 1, discountBps: pricing.tier.tier.discountBps, msrpSubtotalCents: pricing.msrpSubtotalCents, savingsCents: pricing.savingsCents, poNumber: body.poNumber ?? null, forced: pricing.tier.forced };
  const existing = await prisma.order.findFirst({ where: { retailerId: r.id, cycleId: cycle.id, source: 'retailer', status: { notIn: ['CANCELLED', 'REFUNDED'] }, paymentStatus: 'PENDING' } });
  const lineItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = pricing.lines.map((l) => { const snap = byId.get(l.listingId)!; return { productId: productOf.get(l.listingId)!, listingId: l.listingId, name: `${snap.title}${snap.issueNumber ? ` #${snap.issueNumber}` : ''}${snap.coverDescription && !/^main/i.test(snap.coverDescription) ? ` (${snap.coverDescription})` : ''}`, options: { catalogKey: snap.catalogKey, publisher: snap.partner.name }, quantity: l.quantity, unitPriceCents: l.unitCents, totalCents: l.totalCents, wholesale: { msrpCents: l.msrpCents, discountBps: l.discountBps, tierName: pricing.tier.tier.name, incentive: l.incentive ?? null } as unknown as Prisma.InputJsonValue }; });
  const data: Omit<Prisma.OrderUncheckedCreateInput, 'number'> = {
    email: user?.email ?? r.contactEmail, userId: req.session!.sub, status: 'PENDING' as const, paymentStatus: 'PENDING' as const,
    subtotalCents: pricing.subtotalCents, shippingCents, taxCents: 0, discountCents: 0, totalCents: pricing.subtotalCents + shippingCents,
    shippingAddress, billingAddress: shippingAddress, shippingMethod: s.retailerShipping.mode === 'flat' ? 'Flat wholesale shipping' : 'Billed at cost when shipped',
    notes: body.notes ?? null, source: 'retailer', retailerId: r.id, cycleId: cycle.id,
    wholesale: wholesale as unknown as Prisma.InputJsonValue,
    items: { create: lineItems },
  };
  let order;
  if (existing) {
    await prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
    order = await prisma.order.update({ where: { id: existing.id }, data: { ...data, events: { create: { kind: 'note', message: `Order replaced by the retailer before FOC: ${pricing.lines.length} lines, ${pricing.lines.reduce((s2, l) => s2 + l.quantity, 0)} copies`, actorName: user?.email } } } });
  } else {
    order = await prisma.order.create({ data: { ...data, number: newOrderNumber(), events: { create: { kind: 'status', toStatus: 'PENDING', message: `Wholesale order placed in ${cycle.name} at ${pricing.tier.tier.name}`, actorName: user?.email } } } });
  }
  const mail = await sendRetailerOrderEmail(order.id);
  res.status(existing ? 200 : 201).json({ order: { id: order.id, number: order.number, subtotalCents: order.subtotalCents, totalCents: order.totalCents }, replaced: Boolean(existing), mail });
});

retailer.get('/orders', async (req, res) => {
  const rows = await prisma.order.findMany({ where: { retailerId: retailerOf(req).id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, paymentStatus: true, subtotalCents: true, shippingCents: true, totalCents: true, createdAt: true, wholesale: true, cycle: { select: { id: true, name: true, focDate: true, inStoreDate: true, status: true } }, _count: { select: { items: true } }, shipments: { select: { trackingCode: true, carrier: true, createdAt: true } } } });
  res.json({ orders: rows });
});

retailer.get('/orders/:number', async (req, res) => {
  const o = await prisma.order.findFirst({ where: { number: req.params.number, retailerId: retailerOf(req).id }, include: { items: true, cycle: true, shipments: true, events: { orderBy: { createdAt: 'desc' }, where: { kind: { in: ['status', 'tracking', 'fulfillment', 'payment'] } } } } });
  if (!o) throw new HttpError(404, 'Order not found');
  const editable = o.cycle ? cycleOrderingOpen(o.cycle) && o.paymentStatus === 'PENDING' && o.status === 'PENDING' : false;
  res.json({ order: o, editable });
});

retailer.post('/orders/:number/cancel', async (req, res) => {
  const o = await prisma.order.findFirst({ where: { number: req.params.number, retailerId: retailerOf(req).id }, include: { cycle: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  if (!o.cycle || !cycleOrderingOpen(o.cycle) || o.paymentStatus !== 'PENDING') throw new HttpError(400, 'This order is past FOC and cannot be cancelled online. Write to us.');
  await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED', events: { create: { kind: 'status', fromStatus: o.status, toStatus: 'CANCELLED', message: 'Cancelled by the retailer before FOC', actorName: req.session!.email } } } });
  res.json({ ok: true });
});

router.use('/retailer', retailer);

export default router;
