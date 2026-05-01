/**
 * /api/v1/projects — partners track each creator's campaign as a separate
 * Project record. Every API order can carry a `projectId` (the partner's
 * platform-side identifier — Kickstarter slug, Indiegogo campaign id, etc.)
 * which auto-upserts to a PartnerProject under the calling partner.
 *
 * Manual create/list/update is also exposed so partners can pre-register
 * projects, attach creator contacts, mark them complete, etc.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { requireApiKey } from '../../middleware/api-key.js';

const router = Router();

function requirePartner(req: any): string {
  const partnerId = req.apiKey?.partnerId as string | undefined;
  if (!partnerId) {
    throw new HttpError(
      403,
      'This endpoint requires a key attached to a partner. Standalone keys can submit orders directly without a project.',
    );
  }
  return partnerId;
}

function serialize(p: any, opts?: { includeStats?: boolean }) {
  const base = {
    id: p.id,
    externalProjectId: p.externalProjectId,
    title: p.title,
    url: p.url,
    creatorName: p.creatorName,
    creatorEmail: p.creatorEmail,
    status: p.status,
    notes: p.notes,
    metadata: p.metadata ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
  if (opts?.includeStats && p._count) {
    return {
      ...base,
      orderCount: p._count.orders,
    };
  }
  return base;
}

// List the partner's projects.
router.get('/', requireApiKey('projects:read'), async (req, res) => {
  const partnerId = requirePartner(req);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const status = req.query.status as string | undefined;
  const where: any = { partnerId };
  if (status) where.status = status;
  if (req.query.creatorEmail) {
    where.creatorEmail = String(req.query.creatorEmail).toLowerCase();
  }
  const projects = await prisma.partnerProject.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { _count: { select: { orders: true } } },
  });
  res.json({ projects: projects.map((p) => serialize(p, { includeStats: true })) });
});

const createSchema = z.object({
  externalProjectId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  url: z.string().url().optional(),
  creatorName: z.string().max(120).optional(),
  creatorEmail: z.string().email().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).default('active'),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Create or upsert by (partnerId, externalProjectId).
router.post('/', requireApiKey('projects:write'), async (req, res) => {
  const partnerId = requirePartner(req);
  const data = createSchema.parse(req.body);
  const project = await prisma.partnerProject.upsert({
    where: {
      partnerId_externalProjectId: {
        partnerId,
        externalProjectId: data.externalProjectId,
      },
    },
    create: {
      partnerId,
      externalProjectId: data.externalProjectId,
      title: data.title,
      url: data.url,
      creatorName: data.creatorName,
      creatorEmail: data.creatorEmail?.toLowerCase(),
      status: data.status,
      notes: data.notes,
      metadata: data.metadata as object | undefined,
    },
    update: {
      title: data.title,
      url: data.url,
      creatorName: data.creatorName,
      creatorEmail: data.creatorEmail?.toLowerCase(),
      status: data.status,
      notes: data.notes,
      metadata: data.metadata as object | undefined,
    },
  });
  res.status(201).json({ project: serialize(project) });
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  url: z.string().url().nullable().optional(),
  creatorName: z.string().max(120).nullable().optional(),
  creatorEmail: z.string().email().nullable().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

// Look up by our id OR by externalProjectId — partner can reference whichever.
async function loadProject(req: any) {
  const partnerId = requirePartner(req);
  const idOrExternal = String(req.params.id);
  return prisma.partnerProject.findFirst({
    where: {
      partnerId,
      OR: [{ id: idOrExternal }, { externalProjectId: idOrExternal }],
    },
    include: { _count: { select: { orders: true } } },
  });
}

router.get('/:id', requireApiKey('projects:read'), async (req, res) => {
  const project = await loadProject(req);
  if (!project) throw new HttpError(404, 'Project not found');

  // Surface a brief order roll-up so partners don't have to call /orders too.
  const orders = await prisma.order.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, number: true, externalRef: true, status: true,
      paymentStatus: true, totalCents: true, trackingNumber: true,
      shippingMethod: true, createdAt: true,
    },
  });
  const totals = await prisma.order.aggregate({
    where: { projectId: project.id },
    _sum: { totalCents: true },
    _count: { _all: true },
  });
  const paid = await prisma.order.aggregate({
    where: { projectId: project.id, paymentStatus: 'CAPTURED' },
    _sum: { totalCents: true },
    _count: { _all: true },
  });

  res.json({
    project: serialize(project, { includeStats: true }),
    orders,
    totals: {
      totalOrders: totals._count._all,
      totalCents: Number(totals._sum.totalCents ?? 0),
      paidOrders: paid._count._all,
      paidCents: Number(paid._sum.totalCents ?? 0),
    },
  });
});

router.patch('/:id', requireApiKey('projects:write'), async (req, res) => {
  const project = await loadProject(req);
  if (!project) throw new HttpError(404, 'Project not found');
  const data = updateSchema.parse(req.body);
  const updated = await prisma.partnerProject.update({
    where: { id: project.id },
    data: {
      title: data.title ?? undefined,
      url: data.url === null ? null : data.url ?? undefined,
      creatorName: data.creatorName === null ? null : data.creatorName ?? undefined,
      creatorEmail:
        data.creatorEmail === null ? null : data.creatorEmail?.toLowerCase() ?? undefined,
      status: data.status ?? undefined,
      notes: data.notes === null ? null : data.notes ?? undefined,
      metadata: data.metadata === null ? undefined : (data.metadata as object | undefined),
    },
  });
  res.json({ project: serialize(updated) });
});

export default router;
