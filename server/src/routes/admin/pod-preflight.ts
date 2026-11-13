/**
 * /api/admin/pod/preflight — the production-file desk. Open to the
 * `preflight` permission as well as `pod`. Nothing here carries a price,
 * a quantity ordered by a shop, or a publisher's money: it is the job, the
 * files, the checks and the deadline.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { hasPermission } from '../../lib/permissions.js';
import { rerunPreflight } from '../../lib/pod/files.js';
import { actorOf, podEvents, recordPodEvent } from '../../lib/pod/events.js';
import { FILE_KIND_LABELS, type FileKind } from '../../lib/pod/present.js';

const router = Router();

export function requirePreflightOrPod(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  if (!hasPermission(req.session, 'preflight') && !hasPermission(req.session, 'pod')) {
    return res.status(403).json({ error: 'Your account does not have access to Preflight. Ask an admin to grant it under Users & access.', permission: 'preflight' });
  }
  next();
}
router.use(requirePreflightOrPod);

const jobInclude = {
  listing: { select: { id: true, catalogKey: true, title: true, issueNumber: true, coverDescription: true, format: true, pageCount: true, trimWidthIn: true, trimHeightIn: true, interiorColor: true, status: true, partner: { select: { name: true } }, files: { orderBy: [{ kind: 'asc' }, { version: 'desc' }], include: { media: { select: { id: true, url: true, originalName: true, size: true, createdAt: true } } } } } },
  cycle: { select: { name: true, inStoreDate: true } },
} satisfies Prisma.ProductionOrderInclude;
type Job = Prisma.ProductionOrderGetPayload<{ include: typeof jobInclude }>;

/** The job as preflight sees it: files, checks, deadline. No money, no quantities. */
function jobView(po: Job) {
  const newest: Record<string, (typeof po.listing.files)[number]> = {};
  for (const f of po.listing.files) if (!newest[f.kind]) newest[f.kind] = f;
  const { files, partner, ...listing } = po.listing;
  void files;
  return {
    id: po.id, number: po.number, status: po.status, deadline: po.deadline, notes: po.notes, createdAt: po.createdAt, cycle: po.cycle,
    listing: { ...listing, publisher: partner.name },
    files: (['cover', 'interior'] as FileKind[]).map((k) => {
      const f = newest[k];
      return f ? { id: f.id, kind: k, kindLabel: FILE_KIND_LABELS[k], version: f.version, reviewStatus: f.reviewStatus, note: f.note, preflight: f.preflight, createdAt: f.createdAt, media: f.media } : { id: null, kind: k, kindLabel: FILE_KIND_LABELS[k], missing: true };
    }),
  };
}

router.get('/me/activity', async (req, res) => {
  const rows = await prisma.podEvent.findMany({ where: { actorId: req.session!.sub }, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ events: rows });
});

router.get('/', async (req, res) => {
  const status = String(req.query.status ?? 'open');
  const where: Prisma.ProductionOrderWhereInput = status === 'open' ? { status: { in: ['FILES_NEEDED', 'PREFLIGHT', 'APPROVED'] } } : status === 'all' ? {} : { status: status as never };
  const rows = await prisma.productionOrder.findMany({ where, include: jobInclude, orderBy: [{ deadline: 'asc' }, { number: 'asc' }] });
  const counts = await prisma.productionOrder.groupBy({ by: ['status'], _count: { _all: true } });
  res.json({ jobs: rows.map(jobView), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

router.get('/:id', async (req, res) => {
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, include: jobInclude });
  if (!po) throw new HttpError(404, 'Job not found');
  const events = (await podEvents('production', po.id)).filter((e) => !/\$|cents|copies|retailer/i.test(e.message ?? ''));
  res.json({ job: jobView(po), events });
});

router.post('/:id/files/:fileId/review', async (req, res) => {
  const body = z.object({ status: z.enum(['approved', 'rejected', 'uploaded']), note: z.string().trim().max(1000).nullable().optional() }).parse(req.body);
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, select: { id: true, listingId: true } });
  if (!po) throw new HttpError(404, 'Job not found');
  const f = await prisma.listingFile.findUnique({ where: { id: req.params.fileId } });
  if (!f || f.listingId !== po.listingId) throw new HttpError(404, 'File not found');
  await prisma.listingFile.update({ where: { id: f.id }, data: { reviewStatus: body.status, note: body.note ?? f.note } });
  await recordPodEvent('listing', f.listingId, 'file-review', `${f.kind} v${f.version} ${body.status}${body.note ? ` — ${body.note}` : ''}`, actorOf(req));
  await recordPodEvent('production', po.id, 'file-review', `${f.kind} ${body.status}`, actorOf(req));
  // Both print files approved → the job is approved for press.
  const files = await prisma.listingFile.findMany({ where: { listingId: po.listingId, kind: { in: ['cover', 'interior'] } }, orderBy: { version: 'desc' } });
  const newest = new Map<string, (typeof files)[number]>();
  for (const x of files) if (!newest.has(x.kind)) newest.set(x.kind, x);
  const allApproved = newest.size === 2 && [...newest.values()].every((x) => x.reviewStatus === 'approved');
  const anyRejected = [...newest.values()].some((x) => x.reviewStatus === 'rejected');
  const next = allApproved ? 'APPROVED' : anyRejected ? 'FILES_NEEDED' : 'PREFLIGHT';
  const cur = await prisma.productionOrder.findUnique({ where: { id: po.id }, select: { status: true } });
  if (cur && ['FILES_NEEDED', 'PREFLIGHT', 'APPROVED'].includes(cur.status) && cur.status !== next) {
    await prisma.productionOrder.update({ where: { id: po.id }, data: { status: next } });
    await recordPodEvent('production', po.id, 'status', `${cur.status} → ${next}`, actorOf(req));
  }
  const full = await prisma.productionOrder.findUnique({ where: { id: po.id }, include: jobInclude });
  res.json({ job: jobView(full!) });
});

router.post('/:id/files/:fileId/preflight', async (req, res) => {
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, select: { listingId: true } });
  if (!po) throw new HttpError(404, 'Job not found');
  const result = await rerunPreflight(req.params.fileId);
  const full = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, include: jobInclude });
  res.json({ preflight: result, job: jobView(full!) });
});

router.post('/:id/status', async (req, res) => {
  const body = z.object({ status: z.enum(['PREFLIGHT', 'APPROVED', 'FILES_NEEDED']), note: z.string().trim().max(1000).nullable().optional() }).parse(req.body);
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id } });
  if (!po) throw new HttpError(404, 'Job not found');
  if (!['FILES_NEEDED', 'PREFLIGHT', 'APPROVED'].includes(po.status)) throw new HttpError(400, `A ${po.status.toLowerCase().replace('_', ' ')} job is past preflight`);
  await prisma.productionOrder.update({ where: { id: po.id }, data: { status: body.status } });
  await recordPodEvent('production', po.id, 'status', `${po.status} → ${body.status}${body.note ? ` — ${body.note}` : ''}`, actorOf(req));
  const full = await prisma.productionOrder.findUnique({ where: { id: po.id }, include: jobInclude });
  res.json({ job: jobView(full!) });
});

router.post('/:id/notes', async (req, res) => {
  const body = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body);
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!po) throw new HttpError(404, 'Job not found');
  await recordPodEvent('production', po.id, 'note', body.text, actorOf(req));
  res.status(201).json({ events: (await podEvents('production', po.id)).filter((e) => !/\$|cents|copies|retailer/i.test(e.message ?? '')) });
});

/** Record that someone opened a production file (who looked at what, when). */
router.post('/:id/files/:fileId/opened', async (req, res) => {
  const po = await prisma.productionOrder.findUnique({ where: { id: req.params.id }, select: { id: true } });
  const f = await prisma.listingFile.findUnique({ where: { id: req.params.fileId }, select: { kind: true, version: true } });
  if (!po || !f) throw new HttpError(404, 'Not found');
  await recordPodEvent('production', po.id, 'file-opened', `${f.kind} v${f.version} opened`, actorOf(req));
  res.json({ ok: true });
});

export default router;
