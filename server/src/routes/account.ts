import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

const router = Router();

// Profile

const profileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(32).optional(),
});

router.put('/profile', requireAuth, async (req, res) => {
  const data = profileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.session!.sub },
    data: {
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      phone: data.phone ?? null,
    },
    select: { id: true, email: true, role: true, firstName: true, lastName: true, phone: true },
  });
  res.json({ user });
});

// Password change

const pwSchema = z.object({
  // Optional: an account created at checkout has no password yet, and its
  // owner (signed in through an emailed link) is choosing the first one.
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(200),
});

router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = pwSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.session!.sub } });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.passwordSetAt !== null) {
    if (!currentPassword) throw new HttpError(400, 'Enter your current password');
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new HttpError(400, 'Current password is incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordSetAt: new Date() },
  });
  res.json({ ok: true });
});

// Addresses

const addressSchema = z.object({
  label: z.string().max(80).optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().max(120).optional().nullable(),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2).max(2).default('US'),
  phone: z.string().max(32).optional().nullable(),
  isDefault: z.boolean().optional(),
});

router.get('/addresses', requireAuth, async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.session!.sub },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ addresses });
});

router.post('/addresses', requireAuth, async (req, res) => {
  const data = addressSchema.parse(req.body);
  const { isDefault, ...rest } = data;
  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.session!.sub },
      data: { isDefault: false },
    });
  }
  const address = await prisma.address.create({
    data: {
      ...rest,
      label: rest.label ?? null,
      company: rest.company ?? null,
      line2: rest.line2 ?? null,
      phone: rest.phone ?? null,
      isDefault: isDefault ?? false,
      userId: req.session!.sub,
    },
  });
  res.json({ address });
});

router.put('/addresses/:id', requireAuth, async (req, res) => {
  const data = addressSchema.parse(req.body);
  const existing = await prisma.address.findFirst({
    where: { id: String(req.params.id), userId: req.session!.sub },
  });
  if (!existing) throw new HttpError(404, 'Address not found');
  if (data.isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.session!.sub },
      data: { isDefault: false },
    });
  }
  const { isDefault, ...rest } = data;
  const address = await prisma.address.update({
    where: { id: existing.id },
    data: {
      ...rest,
      label: rest.label ?? null,
      company: rest.company ?? null,
      line2: rest.line2 ?? null,
      phone: rest.phone ?? null,
      isDefault: isDefault ?? false,
    },
  });
  res.json({ address });
});

router.delete('/addresses/:id', requireAuth, async (req, res) => {
  const existing = await prisma.address.findFirst({
    where: { id: String(req.params.id), userId: req.session!.sub },
  });
  if (!existing) throw new HttpError(404, 'Address not found');
  await prisma.address.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;

// ---------------------------------------------------------------------------
// Proofs and file requests — the customer's side of proofing, in the account
// ---------------------------------------------------------------------------
// Every order placed with the account's email belongs to it (attached here on
// each visit, so an order placed as a guest before the account existed shows
// up too). Decisions go through lib/proof-decisions.ts, the same code the
// older emailed links use.

import { attachOrdersToUser } from '../lib/customer-accounts.js';
import { itemTitle, proofKindLabel, proofSlotLabel } from '../lib/proofs.js';
import { APPROVAL_TERMS, approveProof, fulfilMediaRequest, latestProofInSlot, requestProofChanges } from '../lib/proof-decisions.js';
import { customerUpload } from './proofs.js';

async function claimOrders(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (me) await attachOrdersToUser(userId, me.email);
}

router.get('/proofs', requireAuth, async (req, res) => {
  const userId = req.session!.sub;
  await claimOrders(userId);
  const orders = await prisma.order.findMany({
    where: { userId, OR: [{ proofs: { some: {} } }, { mediaRequests: { some: {} } }, { proofStatus: { not: null } }] },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, name: true, quantity: true, options: true } },
      proofs: {
        orderBy: { createdAt: 'desc' },
        include: { media: { select: { id: true, url: true, originalName: true } }, orderItem: { select: { name: true, options: true } } },
      },
      mediaRequests: { orderBy: { createdAt: 'desc' } },
    },
  });
  const out = orders.map((o) => {
    // Newest version per slot is the one to act on.
    const latest = new Map<string, (typeof o.proofs)[number]>();
    for (const p of o.proofs) {
      const key = `${p.orderItemId ?? 'order'}:${p.kind ?? 'artwork'}`;
      if (!latest.has(key)) latest.set(key, p);
    }
    // Pending first, then cover before interior, in the order's item order.
    const kindRank = (k: string | null) => ({ cover: 0, interior: 1, artwork: 2 } as Record<string, number>)[k ?? 'artwork'] ?? 3;
    const itemRank = new Map(o.items.map((i, idx) => [i.id, idx]));
    const proofs = [...latest.values()]
      .sort((a, b) =>
        ((a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
        || ((itemRank.get(a.orderItemId ?? '') ?? 99) - (itemRank.get(b.orderItemId ?? '') ?? 99))
        || (kindRank(a.kind) - kindRank(b.kind)))
      .map((p) => ({
        id: p.id, version: p.version, status: p.status, kind: p.kind,
        kindLabel: proofKindLabel(p.kind),
        slotLabel: proofSlotLabel(p.kind, p.orderItem),
        itemTitle: itemTitle(p.orderItem),
        itemName: p.orderItem?.name ?? null,
        message: p.message, decisionNote: p.decisionNote, approvedName: p.approvedName,
        decidedAt: p.decidedAt, createdAt: p.createdAt,
        mediaId: p.media.id, fileUrl: p.media.url, fileName: p.media.originalName,
      }));
    return {
      id: o.id, number: o.number, status: o.status, proofStatus: o.proofStatus, createdAt: o.createdAt,
      items: o.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, title: itemTitle(i) })),
      proofs,
      pendingProofs: proofs.filter((p) => p.status === 'pending').length,
      /** A proof was asked for but staff have not uploaded one yet. */
      awaitingUpload: proofs.length === 0 && o.proofStatus === 'requested',
      mediaRequests: o.mediaRequests.map((m) => ({ id: m.id, message: m.message, status: m.status, createdAt: m.createdAt, fulfilledAt: m.fulfilledAt })),
    };
  });
  res.json({
    orders: out,
    terms: APPROVAL_TERMS,
    pendingProofs: out.reduce((s, o) => s + o.pendingProofs, 0),
    openRequests: out.reduce((s, o) => s + o.mediaRequests.filter((m) => m.status === 'open').length, 0),
  });
});

/** Just the numbers, for the badge in the header and account nav. */
router.get('/proofs/count', requireAuth, async (req, res) => {
  const userId = req.session!.sub;
  await claimOrders(userId);
  const orders = await prisma.order.findMany({
    where: { userId, OR: [{ proofs: { some: { status: 'pending' } } }, { mediaRequests: { some: { status: 'open' } } }] },
    select: { proofs: { select: { orderItemId: true, kind: true, status: true, version: true, createdAt: true }, orderBy: { createdAt: 'desc' } }, mediaRequests: { where: { status: 'open' }, select: { id: true } } },
  });
  let pendingProofs = 0;
  let openRequests = 0;
  for (const o of orders) {
    const seen = new Set<string>();
    for (const p of o.proofs) {
      const key = `${p.orderItemId ?? 'order'}:${p.kind ?? 'artwork'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (p.status === 'pending') pendingProofs++;
    }
    openRequests += o.mediaRequests.length;
  }
  res.json({ pendingProofs, openRequests });
});

async function ownedProof(userId: string, proofId: string) {
  const owned = await prisma.proof.findFirst({ where: { id: proofId, order: { userId } }, select: { id: true } });
  if (!owned) throw new HttpError(404, 'Proof not found');
  const proof = await latestProofInSlot(owned.id);
  if (!proof) throw new HttpError(404, 'Proof not found');
  return proof;
}

const approveSchema = z.object({ name: z.string().min(1).max(120), acceptTerms: z.literal(true) });
router.post('/proofs/:id/approve', requireAuth, async (req, res) => {
  const { name } = approveSchema.parse(req.body);
  const proof = await ownedProof(req.session!.sub, String(req.params.id));
  res.json({ ok: true, proofId: proof.id, ...(await approveProof(proof, name, 'account')) });
});

const changesSchema = z.object({ note: z.string().min(1).max(2000) });
router.post('/proofs/:id/changes', requireAuth, async (req, res) => {
  const { note } = changesSchema.parse(req.body);
  const proof = await ownedProof(req.session!.sub, String(req.params.id));
  res.json({ ok: true, proofId: proof.id, ...(await requestProofChanges(proof, note, 'account')) });
});

router.post('/media-requests/:id/upload', requireAuth, customerUpload.any(), async (req, res) => {
  const mr = await prisma.mediaRequest.findFirst({ where: { id: String(req.params.id), order: { userId: req.session!.sub } }, select: { id: true } });
  if (!mr) throw new HttpError(404, 'Request not found');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.json({ ok: true, ...(await fulfilMediaRequest(mr.id, files, req.session!.sub)) });
});

// ---- First-time setup: name + password for an account created at checkout ----
const setupSchema = z.object({
  password: z.string().min(8).max(200),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
});

router.post('/setup', requireAuth, async (req, res) => {
  const data = setupSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.session!.sub } });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.passwordSetAt !== null) throw new HttpError(409, 'This account already has a password — change it under Password.');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(data.password),
      passwordSetAt: new Date(),
      firstName: data.firstName?.trim() || user.firstName,
      lastName: data.lastName?.trim() || user.lastName,
    },
    select: { id: true, email: true, role: true, firstName: true, lastName: true, phone: true },
  });
  res.json({ user: { ...updated, hasPassword: true } });
});
