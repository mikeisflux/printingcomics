/**
 * The emailed-link side of proofing. Every proof email now points at the
 * customer's account (see lib/proof-emails.ts), which is where reviewing
 * lives; these tokenised routes keep every older email working and record
 * decisions through the same lib/proof-decisions.ts code as the account.
 */
import { Router } from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { proofKindLabel, proofSlotLabel } from '../lib/proofs.js';
import { APPROVAL_TERMS, approveProof, fulfilMediaRequest, latestProofInSlot, requestProofChanges } from '../lib/proof-decisions.js';
import { ensureCustomerAccount } from '../lib/customer-accounts.js';
import { hashPassword } from '../lib/password.js';
import { startSession } from '../lib/session-cookie.js';

export { APPROVAL_TERMS };

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const CUSTOMER_DIR = path.join(UPLOADS_DIR, 'customer');
await fs.mkdir(CUSTOMER_DIR, { recursive: true }).catch(() => undefined);
export const customerUpload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, CUSTOMER_DIR),
    filename: (_r, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/** Resolve a review token to the newest proof in its slot. */
async function resolveActiveProof(token: string) {
  const proof = await prisma.proof.findUnique({ where: { token }, select: { id: true } });
  if (!proof) return null;
  return latestProofInSlot(proof.id);
}

// ---------------- Proof review (customer, tokenized) ----------------
router.get('/proof/:token', async (req, res) => {
  const proof = await resolveActiveProof(String(req.params.token));
  if (!proof) throw new HttpError(404, 'Proof not found');
  res.json({
    proof: {
      id: proof.id,
      version: proof.version,
      status: proof.status,
      kind: proof.kind,
      kindLabel: proofKindLabel(proof.kind),
      slotLabel: proofSlotLabel(proof.kind, proof.orderItem),
      itemName: proof.orderItem?.name ?? null,
      token: proof.token,
      message: proof.message,
      decisionNote: proof.decisionNote,
      approvedName: proof.approvedName,
      decidedAt: proof.decidedAt,
      mediaId: proof.media.id,
      fileUrl: proof.media.url,
      fileName: proof.media.originalName,
    },
    order: { number: proof.order.number, items: proof.order.items },
    terms: APPROVAL_TERMS,
  });
});

const approveSchema = z.object({ name: z.string().min(1).max(120), acceptTerms: z.literal(true) });
router.post('/proof/:token/approve', async (req, res) => {
  const proof = await resolveActiveProof(String(req.params.token));
  if (!proof) throw new HttpError(404, 'Proof not found');
  const { name } = approveSchema.parse(req.body);
  const r = await approveProof(proof, name, 'email link');
  res.json({ ok: true, ...r });
});

const changesSchema = z.object({ note: z.string().min(1).max(2000) });
router.post('/proof/:token/changes', async (req, res) => {
  const proof = await resolveActiveProof(String(req.params.token));
  if (!proof) throw new HttpError(404, 'Proof not found');
  const { note } = changesSchema.parse(req.body);
  res.json({ ok: true, ...(await requestProofChanges(proof, note, 'email link')) });
});

// ---------------- Corrected-media upload (customer, tokenized) ----------------
router.get('/media-request/:token', async (req, res) => {
  const mr = await prisma.mediaRequest.findUnique({
    where: { token: req.params.token },
    include: { order: { select: { number: true } } },
  });
  if (!mr) throw new HttpError(404, 'Request not found');
  res.json({ mediaRequest: { id: mr.id, message: mr.message, status: mr.status, orderNumber: mr.order.number } });
});

router.post('/media-request/:token/upload', customerUpload.any(), async (req, res) => {
  const mr = await prisma.mediaRequest.findUnique({ where: { token: String(req.params.token) }, select: { id: true } });
  if (!mr) throw new HttpError(404, 'Request not found');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const r = await fulfilMediaRequest(mr.id, files, req.session?.sub ?? null);
  res.json({ ok: true, ...r });
});

export default router;

// ---------------- Older proof links: set up the account to view ----------------
// A /proof/<token> link from an older email proves the visitor has the order's
// inbox. Instead of showing the proof on its own page, it walks them into
// their account: create a password if the account never had one, otherwise
// sign in. The proofs are then reviewed where every other proof lives.

router.get('/proof/:token/access', async (req, res) => {
  const proof = await prisma.proof.findUnique({
    where: { token: String(req.params.token) },
    select: { order: { select: { id: true, number: true, email: true } } },
  });
  if (!proof) throw new HttpError(404, 'Proof not found');
  const user = await ensureCustomerAccount(proof.order.email);
  res.json({
    orderNumber: proof.order.number,
    email: user.email,
    hasPassword: user.passwordSetAt !== null,
    signedInAsOwner: req.session?.sub === user.id,
    next: `/account/proofs?order=${encodeURIComponent(proof.order.number)}`,
  });
});

const setupSchema = z.object({
  password: z.string().min(8).max(200),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
});
router.post('/proof/:token/setup', async (req, res) => {
  const data = setupSchema.parse(req.body);
  const proof = await prisma.proof.findUnique({
    where: { token: String(req.params.token) },
    select: { order: { select: { id: true, number: true, email: true } } },
  });
  if (!proof) throw new HttpError(404, 'Proof not found');
  const user = await ensureCustomerAccount(proof.order.email);
  if (user.passwordSetAt !== null) throw new HttpError(409, 'This account already has a password — sign in with it.');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(data.password),
      passwordSetAt: new Date(),
      firstName: data.firstName?.trim() || user.firstName,
      lastName: data.lastName?.trim() || user.lastName,
    },
  });
  await prisma.orderStatusEvent.create({ data: { orderId: proof.order.id, kind: 'note', message: `Customer created their account from a proof link (${updated.email})` } });
  startSession(res, updated);
  res.json({ ok: true, next: `/account/proofs?order=${encodeURIComponent(proof.order.number)}` });
});
