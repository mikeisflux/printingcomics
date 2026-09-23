/**
 * What happens when a customer decides on a proof or sends corrected files —
 * shared by the account pages (signed-in) and the older emailed links
 * (tokenised), so both paths record exactly the same thing.
 */
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { computeOrderProofStatus, proofSlotLabel } from './proofs.js';
import { sendProofApprovedEmail, notifyStaff } from './proof-emails.js';
import { dispatchPartnerWebhook } from './partners.js';
import { publishUpload } from './storage.js';

/** The terms a customer accepts when approving a proof. Shown verbatim on the review page. */
export const APPROVAL_TERMS =
  'By approving this proof I confirm I have reviewed it in full and that the artwork, spelling, layout, colors, and dimensions are correct and approved for printing. I understand that once approved I accept responsibility for the final printed output, and that Printing Comics is responsible only for manufacturing defects and physical damage — backed by the Printing Comics 100% Damage Replacement Guarantee: if an order arrives damaged or defective, we will reprint or replace it at no cost.';

const decisionInclude = {
  media: true,
  orderItem: { select: { name: true, options: true } },
  order: { include: { items: { select: { name: true, quantity: true } } } },
} as const;

/**
 * The newest version in the proof's slot (same order line + kind) — the one
 * any decision applies to. Staff re-upload after change requests and
 * customers routinely open the oldest email; without this they would approve
 * a superseded proof.
 */
export async function latestProofInSlot(proofId: string) {
  const proof = await prisma.proof.findUnique({ where: { id: proofId }, select: { orderId: true, orderItemId: true, kind: true } });
  if (!proof) return null;
  const latest = await prisma.proof.findFirst({
    where: { orderId: proof.orderId, orderItemId: proof.orderItemId, kind: proof.kind },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return prisma.proof.findUnique({ where: { id: latest?.id ?? proofId }, include: decisionInclude });
}

export type DecisionProof = NonNullable<Awaited<ReturnType<typeof latestProofInSlot>>>;

export async function approveProof(proof: DecisionProof, name: string, via: string): Promise<{ orderProofStatus: string | null; already: boolean }> {
  if (proof.status === 'approved') return { orderProofStatus: proof.order.proofStatus, already: true };
  const slotLabel = proofSlotLabel(proof.kind, proof.orderItem);
  await prisma.$transaction([
    prisma.proof.update({
      where: { id: proof.id },
      data: { status: 'approved', approvedName: name, approvedTermsAt: new Date(), decidedAt: new Date() },
    }),
    prisma.orderStatusEvent.create({
      data: { orderId: proof.orderId, kind: 'status', message: `${slotLabel} v${proof.version} APPROVED by ${name} via ${via} (accepted output-responsibility terms)` },
    }),
  ]);
  // The order only clears when EVERY required slot is approved.
  const orderProofStatus = await computeOrderProofStatus(proof.orderId);
  await sendProofApprovedEmail(proof.id);
  if (proof.order.partnerId) {
    void dispatchPartnerWebhook({
      partnerId: proof.order.partnerId,
      event: 'proof.approved',
      orderId: proof.orderId,
      payload: {
        orderId: proof.orderId, number: proof.order.number, orderItemId: proof.orderItemId,
        itemName: proof.orderItem?.name ?? null, kind: proof.kind, proofVersion: proof.version,
        status: 'approved', orderProofStatus, approvedName: name,
      },
    }).catch(() => undefined);
  }
  return { orderProofStatus, already: false };
}

export async function requestProofChanges(proof: DecisionProof, note: string, via: string): Promise<{ orderProofStatus: string | null }> {
  const slotLabel = proofSlotLabel(proof.kind, proof.orderItem);
  await prisma.$transaction([
    prisma.proof.update({ where: { id: proof.id }, data: { status: 'changes_requested', decisionNote: note, decidedAt: new Date() } }),
    prisma.orderStatusEvent.create({
      data: { orderId: proof.orderId, kind: 'status', message: `Customer requested changes on ${slotLabel} v${proof.version} via ${via}: ${note}` },
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
        orderId: proof.orderId, number: proof.order.number, orderItemId: proof.orderItemId,
        itemName: proof.orderItem?.name ?? null, kind: proof.kind, proofVersion: proof.version,
        status: 'changes_requested', orderProofStatus, note,
      },
    }).catch(() => undefined);
  }
  return { orderProofStatus };
}

/** Store the customer's corrected files against the request's order and close it. */
export async function fulfilMediaRequest(
  requestId: string,
  files: Express.Multer.File[],
  uploaderId: string | null,
): Promise<{ count: number }> {
  const mr = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    include: { order: { include: { items: { take: 1 } } } },
  });
  if (!mr) throw new HttpError(404, 'Request not found');
  if (files.length === 0) throw new HttpError(400, 'No files received');
  const firstItem = mr.order.items[0];
  for (const f of files) {
    const stored = await publishUpload({
      subdir: 'customer', filename: f.filename, localPath: f.path,
      contentType: f.mimetype, originalName: f.originalname,
    });
    const media = await prisma.mediaFile.create({
      data: {
        filename: f.filename, originalName: f.originalname, mimeType: f.mimetype, size: f.size,
        url: stored.url, folder: '/customer-uploads', uploaderId: uploaderId ?? undefined,
        tags: ['customer-upload', 'corrected', `order:${mr.order.number}`],
      },
    });
    if (firstItem) await prisma.orderItemFile.create({ data: { orderItemId: firstItem.id, mediaFileId: media.id, purpose: 'corrected' } });
  }
  await prisma.mediaRequest.update({ where: { id: mr.id }, data: { status: 'fulfilled', fulfilledAt: new Date() } });
  await prisma.orderStatusEvent.create({ data: { orderId: mr.orderId, kind: 'status', message: `Customer uploaded ${files.length} corrected file(s)` } });
  await notifyStaff(mr.orderId, `Corrected files uploaded — order ${mr.order.number}`, `The customer uploaded ${files.length} corrected file(s) for order ${mr.order.number}.`);
  return { count: files.length };
}
