import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

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

/** True when any line item asked for a PDF or hard-copy proof. */
export function itemsRequestProof(items: Array<{ options?: unknown }>): boolean {
  return items.some((i) => {
    const o = i.options as Record<string, unknown> | null;
    return !!o && (isProofRequested(o['pdf_proof']) || isProofRequested(o['hard_copy_proof']));
  });
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
