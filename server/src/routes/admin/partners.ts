/**
 * Admin endpoints for managing Partners — first-class records for the
 * crowdfunding platforms / publishers that submit print orders via the
 * public /api/v1 endpoints.
 *
 * A partner aggregates: API keys, orders submitted by those keys, partner
 * staff (User accounts tagged with partnerId), webhook config + delivery
 * log, and an in-app activity feed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { hashPassword } from '../../lib/password.js';
import { mintApiKey, isValidScope, API_SCOPES } from '../../lib/api-keys.js';
import {
  uniquePartnerSlug,
  mintWebhookSecret,
  dispatchPartnerWebhook,
  replayWebhookDelivery,
  PARTNER_WEBHOOK_EVENTS,
  fingerprintWebhookSecret,
} from '../../lib/partners.js';

const router = Router();

// ---- Helpers -------------------------------------------------------------

async function logEvent(
  partnerId: string,
  kind: string,
  message: string,
  req: any,
  metadata?: Record<string, unknown>,
) {
  const actor = req.session?.sub
    ? await prisma.user.findUnique({
        where: { id: req.session.sub },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : null;
  const actorName = actor
    ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() || actor.email
    : undefined;
  await prisma.partnerEvent.create({
    data: {
      partnerId,
      kind,
      message,
      actorId: actor?.id,
      actorName,
      metadata: metadata ? (metadata as object) : undefined,
    },
  });
}

function partnerSummary(p: any) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    platform: p.platform,
    status: p.status,
    contactEmail: p.contactEmail,
    contactName: p.contactName,
    website: p.website,
    color: p.color,
    notes: p.notes,
    webhookUrl: p.webhookUrl,
    webhookSecretFingerprint: p.webhookSecret ? fingerprintWebhookSecret(p.webhookSecret) : null,
    rateLimitPerMinute: p.rateLimitPerMinute,
    monthlyOrderCap: p.monthlyOrderCap,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---- List partners + dashboard counts ------------------------------------

router.get('/', async (req, res) => {
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const q = (req.query.q as string | undefined)?.trim();
  const where: any = {};
  if (status === 'ACTIVE' || status === 'SUSPENDED' || status === 'ARCHIVED') {
    where.status = status;
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { contactEmail: { contains: q, mode: 'insensitive' } },
      { platform: { contains: q, mode: 'insensitive' } },
    ];
  }

  const partners = await prisma.partner.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { apiKeys: true, members: true, orders: true } },
    },
  });

  // Aggregate revenue + recent activity in a single SQL pass to avoid N+1.
  const stats = await prisma.$queryRaw<
    {
      partner_id: string;
      paid_orders: bigint;
      paid_revenue_cents: bigint;
      last_order_at: Date | null;
    }[]
  >`
    SELECT "partnerId" AS partner_id,
           COUNT(*) FILTER (WHERE "paymentStatus" = 'CAPTURED')::bigint AS paid_orders,
           COALESCE(SUM("totalCents") FILTER (WHERE "paymentStatus" = 'CAPTURED'), 0)::bigint AS paid_revenue_cents,
           MAX("createdAt") AS last_order_at
    FROM "Order"
    WHERE "partnerId" IS NOT NULL
    GROUP BY "partnerId"
  `;
  const statsByPartner = new Map(stats.map((s) => [s.partner_id, s]));

  // Counts by status (drives the page-header pills).
  const [activeCount, suspendedCount, archivedCount] = await Promise.all([
    prisma.partner.count({ where: { status: 'ACTIVE' } }),
    prisma.partner.count({ where: { status: 'SUSPENDED' } }),
    prisma.partner.count({ where: { status: 'ARCHIVED' } }),
  ]);

  res.json({
    counts: { active: activeCount, suspended: suspendedCount, archived: archivedCount },
    partners: partners.map((p) => {
      const s = statsByPartner.get(p.id);
      return {
        ...partnerSummary(p),
        apiKeyCount: p._count.apiKeys,
        memberCount: p._count.members,
        orderCount: p._count.orders,
        paidOrderCount: s ? Number(s.paid_orders) : 0,
        paidRevenueCents: s ? Number(s.paid_revenue_cents) : 0,
        lastOrderAt: s?.last_order_at ?? null,
      };
    }),
  });
});

// ---- Create partner ------------------------------------------------------

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).optional(),
  platform: z.string().max(60).optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().max(120).optional(),
  website: z.string().url().optional(),
  color: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  webhookUrl: z.string().url().optional(),
  rateLimitPerMinute: z.number().int().positive().max(10_000).optional(),
  monthlyOrderCap: z.number().int().positive().max(1_000_000).optional(),
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  const slug = await uniquePartnerSlug(data.slug ?? data.name);
  const partner = await prisma.partner.create({
    data: {
      slug,
      name: data.name,
      platform: data.platform,
      contactEmail: data.contactEmail?.toLowerCase(),
      contactName: data.contactName,
      website: data.website,
      color: data.color,
      notes: data.notes,
      webhookUrl: data.webhookUrl,
      // Always mint a webhook secret up-front so the integrator has something
      // to verify with, even if they don't configure a URL right away.
      webhookSecret: mintWebhookSecret(),
      rateLimitPerMinute: data.rateLimitPerMinute,
      monthlyOrderCap: data.monthlyOrderCap,
      createdById: (req.session?.sub as string | undefined) ?? null,
    },
  });
  await logEvent(partner.id, 'created', `Partner created`, req);
  res.status(201).json({ partner: partnerSummary(partner) });
});

// ---- Read partner detail -------------------------------------------------

router.get('/:id', async (req, res) => {
  const partner = await prisma.partner.findUnique({
    where: { id: req.params.id },
    include: {
      apiKeys: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, prefix: true, scopes: true, active: true,
          revokedAt: true, lastUsedAt: true, createdAt: true, notes: true,
        },
      },
      members: {
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { orders: true, webhookDeliveries: true } },
    },
  });
  if (!partner) throw new HttpError(404, 'Partner not found');

  const stats = await prisma.order.aggregate({
    where: { partnerId: partner.id },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
  const paidStats = await prisma.order.aggregate({
    where: { partnerId: partner.id, paymentStatus: 'CAPTURED' },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
  const cancelled = await prisma.order.count({
    where: { partnerId: partner.id, status: 'CANCELLED' },
  });
  const lastOrder = await prisma.order.findFirst({
    where: { partnerId: partner.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, createdAt: true, status: true, totalCents: true },
  });

  res.json({
    partner: partnerSummary(partner),
    apiKeys: partner.apiKeys,
    members: partner.members,
    stats: {
      totalOrders: stats._count._all,
      totalRevenueCents: Number(stats._sum.totalCents ?? 0),
      paidOrders: paidStats._count._all,
      paidRevenueCents: Number(paidStats._sum.totalCents ?? 0),
      cancelledOrders: cancelled,
      webhookDeliveries: partner._count.webhookDeliveries,
      lastOrder,
    },
    availableScopes: API_SCOPES,
    webhookEvents: PARTNER_WEBHOOK_EVENTS,
  });
});

// ---- Update partner ------------------------------------------------------

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  platform: z.string().max(60).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  website: z.string().url().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  rateLimitPerMinute: z.number().int().positive().max(10_000).nullable().optional(),
  monthlyOrderCap: z.number().int().positive().max(1_000_000).nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Partner not found');

  const partner = await prisma.partner.update({
    where: { id: existing.id },
    data: {
      name: data.name ?? undefined,
      platform: data.platform === null ? null : data.platform ?? undefined,
      contactEmail:
        data.contactEmail === null ? null : data.contactEmail?.toLowerCase() ?? undefined,
      contactName: data.contactName === null ? null : data.contactName ?? undefined,
      website: data.website === null ? null : data.website ?? undefined,
      color: data.color === null ? null : data.color ?? undefined,
      notes: data.notes === null ? null : data.notes ?? undefined,
      webhookUrl: data.webhookUrl === null ? null : data.webhookUrl ?? undefined,
      rateLimitPerMinute:
        data.rateLimitPerMinute === null ? null : data.rateLimitPerMinute ?? undefined,
      monthlyOrderCap:
        data.monthlyOrderCap === null ? null : data.monthlyOrderCap ?? undefined,
    },
  });
  await logEvent(partner.id, 'updated', 'Partner profile updated', req);
  res.json({ partner: partnerSummary(partner) });
});

// ---- Suspend / restore / archive ----------------------------------------

router.post('/:id/suspend', async (req, res) => {
  const reason = (req.body?.reason as string | undefined)?.slice(0, 500);
  const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Partner not found');
  if (existing.status === 'SUSPENDED') return res.json({ partner: partnerSummary(existing) });
  const partner = await prisma.partner.update({
    where: { id: existing.id },
    data: { status: 'SUSPENDED' },
  });
  await logEvent(partner.id, 'suspended', reason ? `Suspended: ${reason}` : 'Suspended', req);
  res.json({ partner: partnerSummary(partner) });
});

router.post('/:id/restore', async (req, res) => {
  const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Partner not found');
  const partner = await prisma.partner.update({
    where: { id: existing.id },
    data: { status: 'ACTIVE' },
  });
  await logEvent(partner.id, 'restored', 'Status set to ACTIVE', req);
  res.json({ partner: partnerSummary(partner) });
});

router.post('/:id/archive', async (req, res) => {
  const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Partner not found');
  const partner = await prisma.partner.update({
    where: { id: existing.id },
    data: { status: 'ARCHIVED' },
  });
  // Auto-revoke every active key when archiving — protects against keys
  // continuing to flow if status is restored later by mistake.
  await prisma.apiKey.updateMany({
    where: { partnerId: partner.id, active: true },
    data: { active: false, revokedAt: new Date() },
  });
  await logEvent(partner.id, 'updated', 'Archived (all keys revoked)', req);
  res.json({ partner: partnerSummary(partner) });
});

// ---- API keys (scoped to this partner) -----------------------------------

const createKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).default([...API_SCOPES]),
  notes: z.string().max(2000).optional(),
});

router.post('/:id/api-keys', async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  if (partner.status === 'ARCHIVED') {
    throw new HttpError(409, 'Cannot mint keys for an archived partner — restore it first.');
  }
  const data = createKeySchema.parse(req.body);
  for (const s of data.scopes) {
    if (!isValidScope(s)) throw new HttpError(400, `Unknown scope: ${s}`);
  }
  const minted = mintApiKey();
  const created = await prisma.apiKey.create({
    data: {
      name: data.name,
      prefix: minted.prefix,
      keyHash: minted.keyHash,
      scopes: data.scopes,
      notes: data.notes,
      partnerId: partner.id,
      createdById: (req.session?.sub as string | undefined) ?? null,
    },
  });
  await logEvent(partner.id, 'key_minted', `Key "${data.name}" minted`, req, {
    apiKeyId: created.id,
    prefix: created.prefix,
  });
  res.status(201).json({
    apiKey: {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      scopes: created.scopes,
      active: created.active,
      createdAt: created.createdAt,
    },
    secret: minted.rawKey,
  });
});

router.post('/:id/api-keys/:keyId/revoke', async (req, res) => {
  const key = await prisma.apiKey.findFirst({
    where: { id: req.params.keyId, partnerId: req.params.id },
  });
  if (!key) throw new HttpError(404, 'API key not found for this partner');
  const updated = await prisma.apiKey.update({
    where: { id: key.id },
    data: { active: false, revokedAt: key.revokedAt ?? new Date() },
  });
  await logEvent(req.params.id, 'key_revoked', `Key "${key.name}" revoked`, req, {
    apiKeyId: key.id,
    prefix: key.prefix,
  });
  res.json({ apiKey: { id: updated.id, active: updated.active, revokedAt: updated.revokedAt } });
});

router.post('/:id/api-keys/:keyId/restore', async (req, res) => {
  const key = await prisma.apiKey.findFirst({
    where: { id: req.params.keyId, partnerId: req.params.id },
  });
  if (!key) throw new HttpError(404, 'API key not found for this partner');
  const updated = await prisma.apiKey.update({
    where: { id: key.id },
    data: { active: true, revokedAt: null },
  });
  await logEvent(req.params.id, 'key_minted', `Key "${key.name}" restored`, req, {
    apiKeyId: key.id,
  });
  res.json({ apiKey: { id: updated.id, active: updated.active, revokedAt: updated.revokedAt } });
});

// Adopt an existing standalone key into this partner.
const adoptSchema = z.object({ apiKeyId: z.string().min(1) });
router.post('/:id/api-keys/adopt', async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  const data = adoptSchema.parse(req.body);
  const existing = await prisma.apiKey.findUnique({ where: { id: data.apiKeyId } });
  if (!existing) throw new HttpError(404, 'API key not found');
  if (existing.partnerId && existing.partnerId !== partner.id) {
    throw new HttpError(409, 'Key already belongs to a different partner');
  }
  const updated = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { partnerId: partner.id },
  });
  await logEvent(partner.id, 'key_minted', `Adopted existing key "${updated.name}"`, req, {
    apiKeyId: updated.id,
  });
  res.json({ apiKey: { id: updated.id, name: updated.name, partnerId: updated.partnerId } });
});

// ---- Members (partner staff users) ---------------------------------------

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  role: z.enum(['CUSTOMER', 'STAFF']).default('CUSTOMER'),
  password: z.string().min(8).optional(),
});

// Add a user to the partner. Creates a new account if none exists for the
// email; otherwise tags the existing user with this partnerId.
router.post('/:id/members', async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  const data = inviteSchema.parse(req.body);
  const email = data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  let user;
  if (existing) {
    if (existing.partnerId && existing.partnerId !== partner.id) {
      throw new HttpError(
        409,
        `User ${email} is already a member of another partner — remove them there first.`,
      );
    }
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { partnerId: partner.id },
    });
  } else {
    if (!data.password || data.password.length < 8) {
      throw new HttpError(400, 'A password (min 8 chars) is required to invite a new user.');
    }
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(data.password),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        partnerId: partner.id,
      },
    });
  }
  await logEvent(partner.id, 'member_added', `Added ${email} as partner contact`, req, {
    userId: user.id,
  });
  res.status(201).json({
    member: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.userId, partnerId: req.params.id },
  });
  if (!user) throw new HttpError(404, 'Member not found for this partner');
  await prisma.user.update({ where: { id: user.id }, data: { partnerId: null } });
  await logEvent(req.params.id, 'member_removed', `Removed ${user.email}`, req, {
    userId: user.id,
  });
  res.json({ ok: true });
});

// ---- Orders --------------------------------------------------------------

router.get('/:id/orders', async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const status = req.query.status as string | undefined;
  const where: any = { partnerId: partner.id };
  if (status) where.status = status;
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      number: true,
      externalRef: true,
      email: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
      shippingMethod: true,
      trackingNumber: true,
      createdAt: true,
      apiKey: { select: { id: true, name: true, prefix: true } },
    },
  });
  res.json({ orders });
});

// ---- Webhooks ------------------------------------------------------------

router.get('/:id/webhook-deliveries', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const deliveries = await prisma.partnerWebhookDelivery.findMany({
    where: { partnerId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, event: true, orderId: true, url: true, attempts: true,
      statusCode: true, error: true, succeeded: true, createdAt: true,
      deliveredAt: true,
    },
  });
  res.json({ deliveries });
});

router.get('/:id/webhook-deliveries/:deliveryId', async (req, res) => {
  const delivery = await prisma.partnerWebhookDelivery.findFirst({
    where: { id: req.params.deliveryId, partnerId: req.params.id },
  });
  if (!delivery) throw new HttpError(404, 'Delivery not found');
  res.json({ delivery });
});

// Cycle the webhook secret. Returns the new secret exactly once.
router.post('/:id/webhook-secret/rotate', async (req, res) => {
  const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Partner not found');
  const secret = mintWebhookSecret();
  const partner = await prisma.partner.update({
    where: { id: existing.id },
    data: { webhookSecret: secret },
  });
  await logEvent(partner.id, 'updated', 'Webhook secret rotated', req);
  res.json({
    partner: partnerSummary(partner),
    secret,
  });
});

// One-time reveal of the current webhook secret.
router.get('/:id/webhook-secret', async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  res.json({ secret: partner.webhookSecret ?? null });
});

// Send a synthetic ping so the integrator can confirm wiring.
router.post('/:id/webhook-test', async (req, res) => {
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  const result = await dispatchPartnerWebhook({
    partnerId: partner.id,
    event: 'ping',
    payload: {
      message: 'This is a test ping from the Printing Comics admin panel.',
      partnerSlug: partner.slug,
      partnerName: partner.name,
    },
  });
  await logEvent(partner.id, 'webhook_test', 'Sent test ping', req, { deliveryId: result.id });
  res.json({ delivery: result });
});

router.post('/:id/webhook-deliveries/:deliveryId/replay', async (req, res) => {
  const delivery = await replayWebhookDelivery(req.params.deliveryId);
  if (!delivery || delivery.partnerId !== req.params.id) {
    throw new HttpError(404, 'Delivery not found');
  }
  await logEvent(req.params.id, 'webhook_test', `Replayed delivery ${delivery.id}`, req);
  res.json({ delivery });
});

// ---- Activity feed -------------------------------------------------------

router.get('/:id/events', async (req, res) => {
  const events = await prisma.partnerEvent.findMany({
    where: { partnerId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ events });
});

const noteSchema = z.object({ message: z.string().min(1).max(2000) });
router.post('/:id/notes', async (req, res) => {
  const data = noteSchema.parse(req.body);
  const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
  if (!partner) throw new HttpError(404, 'Partner not found');
  await logEvent(partner.id, 'note', data.message, req);
  res.status(201).json({ ok: true });
});

export default router;
