import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../db.js';
import { getSetting } from './settings.js';

/** Absolute customer review link for a proof token, or null if no public URL is set. */
export async function proofReviewUrl(token: string): Promise<string | null> {
  const u = (await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || '';
  const base = u.replace(/\/$/, '');
  return base ? `${base}/proof/${token}` : null;
}

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');

async function unlinkByUrl(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith('/uploads/')) return;
  await fs.unlink(path.join(UPLOADS_DIR, url.replace(/^\/uploads\//, ''))).catch(() => undefined);
}

/** Flat proof + shipping fee added on top of one book's single-copy price. */
export const HARD_COPY_PROOF_FEE_CENTS = 1995;
export const PROOF_PRODUCT_SLUG = 'hard-copy-proof';

/** Truthy test for the proof toggles stored as strings in cart/order options. */
export function isProofRequested(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 'on' || v === '1';
}

/** Unguessable token for a customer's no-login proof / upload link. */
export function proofToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * The hidden product that a hard-copy-proof line item hangs off of. Created on
 * first use so no seed/deploy step is required. It is not attached to any
 * category, so it never appears in the storefront catalog.
 */
export async function getOrCreateProofProduct() {
  return prisma.product.upsert({
    where: { slug: PROOF_PRODUCT_SLUG },
    update: {},
    create: {
      slug: PROOF_PRODUCT_SLUG,
      name: 'Hard-Copy Proof',
      shortDescription: 'A single printed proof copy, shipped before your full print run.',
      priceCents: 0,
      active: true,
      madeToOrder: true,
      minQuantity: 1,
    },
  });
}

/** True when THIS line item asked for a PDF or hard-copy proof. */
export function itemRequestsProof(item: { options?: unknown }): boolean {
  const o = item.options as Record<string, unknown> | null;
  return !!o && (isProofRequested(o['pdf_proof']) || isProofRequested(o['hard_copy_proof']));
}

/** True when any line item asked for a PDF or hard-copy proof. */
export function itemsRequestProof(items: Array<{ options?: unknown }>): boolean {
  return items.some(itemRequestsProof);
}

export const PROOF_KIND_LABELS: Record<string, string> = {
  cover: 'Cover proof',
  interior: 'Interior proof',
  artwork: 'Artwork proof',
};

export function proofKindLabel(kind: string | null | undefined): string {
  return (kind && PROOF_KIND_LABELS[kind]) || 'Proof';
}

type ItemWithProduct = {
  options?: unknown;
  product?: { slug?: string | null; pricingConfig?: unknown } | null;
};

/**
 * Which proof kinds an item needs. Books (comics / graphic novels — anything
 * with page-based pricing) need TWO proofs: cover + interior. Prints and
 * everything else need one artwork proof. Hard-copy-proof fee lines need none.
 */
export function proofKindsForItem(item: ItemWithProduct): string[] {
  const slug = item.product?.slug ?? '';
  if (slug === PROOF_PRODUCT_SLUG) return [];
  const cfg = item.product?.pricingConfig as { kind?: string; pages?: unknown } | null | undefined;
  if (cfg?.kind === 'print') return ['artwork'];
  if (cfg?.pages || slug.startsWith('comic-') || slug.startsWith('graphic-novel-')) return ['cover', 'interior'];
  return ['artwork'];
}

/**
 * Recompute an order's aggregate proofStatus from its per-item proof slots
 * and persist it. A slot = (orderItemId, kind); required slots come from items
 * that requested a proof, plus any slot staff voluntarily uploaded into.
 *
 *   changes_requested — any slot's latest proof has changes requested
 *   approved          — EVERY slot's latest proof is approved
 *   awaiting_approval — at least one slot has an undecided uploaded proof
 *   requested         — slots exist but nothing is uploaded yet
 *   null              — no proofing on this order
 *
 * Orders proofed before per-item slots (proofs with no orderItemId, and none
 * with one) keep the legacy behavior: the latest order-level proof decides.
 */
export async function computeOrderProofStatus(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { slug: true, pricingConfig: true } } } },
      proofs: { orderBy: { createdAt: 'asc' }, select: { orderItemId: true, kind: true, status: true } },
    },
  });
  if (!order) return null;

  let status: string | null;
  const perItem = order.proofs.filter((p) => p.orderItemId);
  if (order.proofs.length > 0 && perItem.length === 0) {
    const latest = order.proofs[order.proofs.length - 1]!;
    status = latest.status === 'pending' ? 'awaiting_approval' : latest.status;
  } else {
    // Latest proof per slot; required slots start empty (no proof yet).
    const slots = new Map<string, { status: string } | null>();
    for (const it of order.items) {
      if (!itemRequestsProof(it)) continue;
      for (const kind of proofKindsForItem(it)) slots.set(`${it.id}:${kind}`, null);
    }
    for (const p of order.proofs) {
      slots.set(`${p.orderItemId ?? 'order'}:${p.kind ?? 'artwork'}`, { status: p.status });
    }
    if (slots.size === 0) {
      status = null;
    } else {
      const latests = [...slots.values()];
      if (latests.some((l) => l?.status === 'changes_requested')) status = 'changes_requested';
      else if (latests.every((l) => l?.status === 'approved')) status = 'approved';
      else if (latests.some((l) => l !== null)) status = 'awaiting_approval';
      else status = 'requested';
    }
  }

  await prisma.order
    .update({ where: { id: orderId }, data: { proofStatus: status } })
    .catch(() => undefined);
  return status;
}

/**
 * Order statuses at which the physical order is considered "in production or
 * beyond". While a proof is required and not yet approved, transitions into
 * these are blocked.
 */
export const PRODUCTION_STATUSES = new Set(['IN_PRODUCTION', 'SHIPPED', 'DELIVERED']);

/** Is the order's proof still blocking production? */
export function proofBlocksProduction(proofStatus: string | null | undefined): boolean {
  return proofStatus === 'requested' || proofStatus === 'awaiting_approval' || proofStatus === 'changes_requested';
}

/**
 * Delete a shipped order's proofs and the creator's uploaded print files —
 * from disk and the DB. Called when an order ships so we don't retain large
 * customer artwork after fulfillment. Best-effort: individual failures are
 * swallowed so a stuck file never blocks the status change.
 */
export async function purgeOrderArtwork(orderId: string): Promise<void> {
  // Proofs first — Proof references MediaFile, so remove the Proof rows before
  // deleting their media (the relation is Restrict-on-delete).
  const proofs = await prisma.proof.findMany({ where: { orderId }, include: { media: true } });
  await prisma.proof.deleteMany({ where: { orderId } });
  for (const p of proofs) {
    await unlinkByUrl(p.media?.url);
    await prisma.mediaFile.delete({ where: { id: p.mediaFileId } }).catch(() => undefined);
  }

  // Creator-uploaded print files attached to the order's items.
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    include: { files: { include: { media: true } } },
  });
  let removedFiles = 0;
  for (const it of items) {
    for (const f of it.files) {
      const m = f.media;
      const isCreatorFile =
        !!m && (m.folder === '/customer-uploads' || m.folder === '/proofs' || (m.tags ?? []).includes('customer-upload'));
      if (!isCreatorFile) continue;
      await prisma.orderItemFile.delete({ where: { id: f.id } }).catch(() => undefined);
      await unlinkByUrl(m!.url);
      await prisma.mediaFile.delete({ where: { id: m!.id } }).catch(() => undefined);
      removedFiles++;
    }
  }

  await prisma.orderStatusEvent
    .create({
      data: {
        orderId,
        kind: 'note',
        message: `Purged ${proofs.length} proof(s) and ${removedFiles} creator file(s) after shipping`,
      },
    })
    .catch(() => undefined);
}
