/**
 * Admin endpoints for managing developer API keys.
 *
 * The full secret key is returned ONLY by POST / (creation). All later
 * lookups expose only the prefix. Revoking is soft (sets revokedAt + active=false)
 * to preserve the audit trail on orders that were submitted with that key.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { mintApiKey, isValidScope, API_SCOPES } from '../../lib/api-keys.js';

const router = Router();

router.get('/', async (_req, res) => {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { orders: true } },
      createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  res.json({
    availableScopes: API_SCOPES,
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      active: k.active,
      revokedAt: k.revokedAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      notes: k.notes,
      orderCount: k._count.orders,
      createdBy: k.createdBy,
    })),
  });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).default([...API_SCOPES]),
  notes: z.string().max(2000).optional(),
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
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
      createdById: (req.session?.sub as string | undefined) ?? null,
    },
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
    // The plaintext key — display once, never returned again.
    secret: minted.rawKey,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  scopes: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  if (data.scopes) {
    for (const s of data.scopes) {
      if (!isValidScope(s)) throw new HttpError(400, `Unknown scope: ${s}`);
    }
  }
  const existing = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'API key not found');
  const updated = await prisma.apiKey.update({
    where: { id: existing.id },
    data: {
      name: data.name ?? undefined,
      scopes: data.scopes ?? undefined,
      notes: data.notes === null ? null : data.notes ?? undefined,
    },
  });
  res.json({
    apiKey: {
      id: updated.id,
      name: updated.name,
      prefix: updated.prefix,
      scopes: updated.scopes,
      notes: updated.notes,
      active: updated.active,
      revokedAt: updated.revokedAt,
    },
  });
});

router.post('/:id/revoke', async (req, res) => {
  const existing = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'API key not found');
  const updated = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { active: false, revokedAt: existing.revokedAt ?? new Date() },
  });
  res.json({ apiKey: { id: updated.id, active: updated.active, revokedAt: updated.revokedAt } });
});

router.post('/:id/restore', async (req, res) => {
  const existing = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'API key not found');
  const updated = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { active: true, revokedAt: null },
  });
  res.json({ apiKey: { id: updated.id, active: updated.active, revokedAt: updated.revokedAt } });
});

export default router;
