import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { sendProofApprovedEmail, notifyStaff } from '../lib/proof-emails.js';
import { computeOrderProofStatus, proofKindLabel, proofSlotLabel } from '../lib/proofs.js';
import { dispatchPartnerWebhook } from '../lib/partners.js';
import { publishUpload } from '../lib/storage.js';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const CUSTOMER_DIR = path.join(UPLOADS_DIR, 'customer');
await fs.mkdir(CUSTOMER_DIR, { recursive: true }).catch(() => undefined);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, CUSTOMER_DIR),
    filename: (_r, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

/** The terms a customer accepts when approving a proof. Returned by the API so
 *  the review page shows exactly what gets recorded. */
export const APPROVAL_TERMS =
  'By approving this proof I confirm I have reviewed it in full and that the artwork, spelling, layout, colors, and dimensions are correct and approved for printing. I understand that once approved I accept responsibility for the final printed output, and that Printing Comics is responsible only for manufacturing defects and physical damage — backed by the Printing Comics 100% Damage Replacement Guarantee: if an order arrives damaged or defective, we will reprint or replace it at no cost.';

/**
 * Resolve a review token to the proof the customer should actually be acting
 * on: the NEWEST version in that slot (same order item + kind).
 *
 * Staff re-upload after a change request, and each upload emails a new link —
 * but customers routinely click the oldest email they can find. Without this
 * they'd review, and approve, a superseded proof. Returning the current
 * version also means older emails keep working instead of dead-ending.
 */
async function resolveActiveProof(token: string) {
  const proof = await prisma.proof.findUnique({
    where: { token },
    select: { id: true, orderId: true, orderItemId: true, kind: true },
  });
  if (!proof) return null;
  const latest = await prisma.proof.findFirst({
    where: { orderId: proof.orderId, orderItemId: proof.orderItemId, kind: proof.kind },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return prisma.proof.findUnique({
    where: { id: latest?.id ?? proof.id },
    include: {
      media: true,
      orderItem: { select: { name: true, options: true } },
      order: { include: { items: { select: { name: true, quantity: true } } } },
    },
  });
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
      // Full slot label including the customer's own title, so an order with
      // two lines of the same product is unambiguous.
      slotLabel: proofSlotLabel(proof.kind, proof.orderItem),
      itemName: proof.orderItem?.name ?? null,
      // Present when the link was for an older version we forwarded from.
      token: proof.token,
      message: proof.message,
      decisionNote: proof.decisionNote,
      approvedName: proof.approvedName,
      decidedAt: proof.decidedAt,
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
  if (proof.status === 'approved') return res.json({ ok: true, already: true });
  const { name } = approveSchema.parse(req.body);
  const slotLabel = proofSlotLabel(proof.kind, proof.orderItem);

  await prisma.$transaction([
    prisma.proof.update({
      where: { id: proof.id },
      data: { status: 'approved', approvedName: name, approvedTermsAt: new Date(), decidedAt: new Date() },
    }),
    prisma.orderStatusEvent.create({
      data: { orderId: proof.orderId, kind: 'status', message: `${slotLabel} v${proof.version} APPROVED by ${name} (accepted output-responsibility terms)` },
    }),
  ]);
  // Aggregate: the order only clears when EVERY required proof slot is approved.
  const orderProofStatus = await computeOrderProofStatus(proof.orderId);
  await sendProofApprovedEmail(proof.id);
  if (proof.order.partnerId) {
    void dispatchPartnerWebhook({
      partnerId: proof.order.partnerId,
      event: 'proof.approved',
      orderId: proof.orderId,
      payload: {
        orderId: proof.orderId,
        number: proof.order.number,
        orderItemId: proof.orderItemId,
        itemName: proof.orderItem?.name ?? null,
        kind: proof.kind,
        proofVersion: proof.version,
        status: 'approved',
        orderProofStatus,
        approvedName: name,
      },
    }).catch(() => undefined);
  }
  res.json({ ok: true, orderProofStatus });
});

const changesSchema = z.object({ note: z.string().min(1).max(2000) });
router.post('/proof/:token/changes', async (req, res) => {
  const proof = await resolveActiveProof(String(req.params.token));
  if (!proof) throw new HttpError(404, 'Proof not found');
  const { note } = changesSchema.parse(req.body);
  const slotLabel = proofSlotLabel(proof.kind, proof.orderItem);

  await prisma.$transaction([
    prisma.proof.update({ where: { id: proof.id }, data: { status: 'changes_requested', decisionNote: note, decidedAt: new Date() } }),
    prisma.orderStatusEvent.create({
      data: { orderId: proof.orderId, kind: 'status', message: `Customer requested changes on ${slotLabel} v${proof.version}: ${note}` },
    }),
  ]);
  const orderProofStatus = await computeOrderProofStatus(proof.orderId);
  await notifyStaff(proof.orderId, `Proof changes requested — order ${proof.order.number}`, `The customer requested changes on ${slotLabel} v${proof.version} for order ${proof.order.number}: ${note}`);
  if (proof.order.partnerId) {
    void dispatchPartnerWebhook({
      partnerId: proof.order.partnerId,
      event: 'proof.changes_requested',
      orderId: proof.orderId,
      payload: {
        orderId: proof.orderId,
        number: proof.order.number,
        orderItemId: proof.orderItemId,
        itemName: proof.orderItem?.name ?? null,
        kind: proof.kind,
        proofVersion: proof.version,
        status: 'changes_requested',
        orderProofStatus,
        note,
      },
    }).catch(() => undefined);
  }
  res.json({ ok: true, orderProofStatus });
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

router.post('/media-request/:token/upload', upload.any(), async (req, res) => {
  const mr = await prisma.mediaRequest.findUnique({
    where: { token: String(req.params.token) },
    include: { order: { include: { items: { take: 1 } } } },
  });
  if (!mr) throw new HttpError(404, 'Request not found');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new HttpError(400, 'No files received');

  const firstItem = mr.order.items[0];
  for (const f of files) {
    const stored = await publishUpload({
      subdir: 'customer',
      filename: f.filename,
      localPath: f.path,
      contentType: f.mimetype,
      originalName: f.originalname,
    });
    const media = await prisma.mediaFile.create({
      data: {
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url: stored.url,
        folder: '/customer-uploads',
        tags: ['customer-upload', 'corrected', `order:${mr.order.number}`],
      },
    });
    if (firstItem) {
      await prisma.orderItemFile.create({ data: { orderItemId: firstItem.id, mediaFileId: media.id, purpose: 'corrected' } });
    }
  }
  await prisma.mediaRequest.update({ where: { id: mr.id }, data: { status: 'fulfilled', fulfilledAt: new Date() } });
  await prisma.orderStatusEvent.create({ data: { orderId: mr.orderId, kind: 'status', message: `Customer uploaded ${files.length} corrected file(s)` } });
  await notifyStaff(mr.orderId, `Corrected files uploaded — order ${mr.order.number}`, `The customer uploaded ${files.length} corrected file(s) for order ${mr.order.number}.`);
  res.json({ ok: true, count: files.length });
});

export default router;
