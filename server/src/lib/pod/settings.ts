/**
 * Print On Demand program settings — the retailer tier table, our
 * commission on publisher sales, how retailer shipping is charged, and the
 * words on the public page. Stored as one JSON blob under `pod.settings` so
 * staff edit it as a whole (Admin → Print on Demand → Settings).
 *
 * Wholesale pricing (MSRP × tier) is a separate world from the configurator
 * pricing engine (`lib/pricing.ts`): nothing here touches print prices.
 */
import { getSetting, setSetting } from '../settings.js';

export interface RetailerTier {
  /** "Tier I" */
  name: string;
  /** Order subtotal at MSRP (cents) from which this tier applies. */
  minCents: number;
  /** Discount off MSRP in basis points: 4000 = 40%. */
  discountBps: number;
}

export interface PodSettings {
  /** Shown on /print-on-demand and used for new applications. */
  enabled: boolean;
  programName: string;
  intro: string;
  tiers: RetailerTier[];
  /** Our commission on wholesale sales when we print and ship (bps). */
  commissionBpsPrintedByUs: number;
  /** …and when the publisher ships from a purchase order (bps). */
  commissionBpsPartnerShips: number;
  /** …and when we ship from stock the publisher consigned to us (bps). */
  commissionBpsConsignment: number;
  /** Copies a shop may return or claim damaged per order, by tier (same order as `tiers`). */
  returnAllowanceByTier: number[];
  /** Publishers may pull a barcode from the free pool onto a listing themselves. */
  publishersSelfAssignBarcodes: boolean;
  /** Retailer orders below this MSRP subtotal are refused (cents). */
  retailerMinOrderCents: number;
  /** How retailer orders are shipped: billed after packing (0 at order time) or a flat amount per order. */
  retailerShipping: { mode: 'billed_later' | 'flat'; flatCents: number };
  /** Appended to retailer confirmations and purchase orders. */
  retailerTerms: string;
  publisherTerms: string;
  /** Where applications and FOC notices go; the store email when blank. */
  notifyEmail: string;
  /** Interior page counts a listing may use (must match our press). */
  pageCountStep: number;
  minPageCount: number;
  maxPageCount: number;
}

export const DEFAULT_POD_SETTINGS: PodSettings = {
  enabled: true,
  programName: 'Print On Demand',
  intro: 'List your comics with us, sell them to comic shops at wholesale, and let us print and ship every order. No minimums, no inventory, one monthly catalog.',
  tiers: [
    { name: 'Tier I', minCents: 0, discountBps: 4000 },
    { name: 'Tier II', minCents: 10100, discountBps: 4500 },
    { name: 'Tier III', minCents: 25100, discountBps: 5000 },
  ],
  commissionBpsPrintedByUs: 500,
  commissionBpsPartnerShips: 1000,
  commissionBpsConsignment: 1500,
  returnAllowanceByTier: [2, 4, 8],
  publishersSelfAssignBarcodes: true,
  retailerMinOrderCents: 0,
  retailerShipping: { mode: 'billed_later', flatCents: 0 },
  retailerTerms: 'Orders are final at the catalog’s final order cutoff (FOC). Shipping is billed at cost when the order ships. Payment is due on invoice.',
  publisherTerms: 'Approved listings appear in the next open catalog. Wholesale sales are paid out per catalog cycle, less our commission and any printing charges.',
  notifyEmail: '',
  pageCountStep: 4,
  minPageCount: 8,
  maxPageCount: 200,
};

const KEY = 'pod.settings';

function int(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** Validate anything that claims to be settings; unknown fields are dropped. */
export function normalizePodSettings(raw: unknown): PodSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_POD_SETTINGS;
  const tiersRaw = Array.isArray(r.tiers) ? r.tiers : d.tiers;
  const tiers = tiersRaw
    .map((t) => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      return { name: String(o.name ?? '').trim() || 'Tier', minCents: int(o.minCents, 0), discountBps: int(o.discountBps, 0, 0, 9999) };
    })
    .filter((t) => t.name)
    .sort((a, b) => a.minCents - b.minCents);
  const ship = (r.retailerShipping && typeof r.retailerShipping === 'object' ? r.retailerShipping : {}) as Record<string, unknown>;
  const step = int(r.pageCountStep, d.pageCountStep, 1, 64);
  return {
    enabled: r.enabled === undefined ? d.enabled : Boolean(r.enabled),
    programName: String(r.programName ?? d.programName).trim() || d.programName,
    intro: String(r.intro ?? d.intro),
    tiers: tiers.length ? tiers : d.tiers,
    commissionBpsPrintedByUs: int(r.commissionBpsPrintedByUs, d.commissionBpsPrintedByUs, 0, 9999),
    commissionBpsPartnerShips: int(r.commissionBpsPartnerShips, d.commissionBpsPartnerShips, 0, 9999),
    commissionBpsConsignment: int(r.commissionBpsConsignment, d.commissionBpsConsignment, 0, 9999),
    returnAllowanceByTier: (Array.isArray(r.returnAllowanceByTier) ? r.returnAllowanceByTier : d.returnAllowanceByTier).map((n) => int(n, 0, 0, 10_000)),
    publishersSelfAssignBarcodes: r.publishersSelfAssignBarcodes === undefined ? d.publishersSelfAssignBarcodes : Boolean(r.publishersSelfAssignBarcodes),
    retailerMinOrderCents: int(r.retailerMinOrderCents, d.retailerMinOrderCents),
    retailerShipping: { mode: ship.mode === 'flat' ? 'flat' : 'billed_later', flatCents: int(ship.flatCents, 0) },
    retailerTerms: String(r.retailerTerms ?? d.retailerTerms),
    publisherTerms: String(r.publisherTerms ?? d.publisherTerms),
    notifyEmail: String(r.notifyEmail ?? '').trim(),
    pageCountStep: step,
    minPageCount: int(r.minPageCount, d.minPageCount, 1),
    maxPageCount: int(r.maxPageCount, d.maxPageCount, 1),
  };
}

export async function getPodSettings(): Promise<PodSettings> {
  return normalizePodSettings(await getSetting(KEY, null));
}

export async function savePodSettings(raw: unknown): Promise<PodSettings> {
  const s = normalizePodSettings(raw);
  await setSetting(KEY, s);
  return s;
}

/** The part of the settings the public page and retailers may see. */
export function publicPodSettings(s: PodSettings) {
  return {
    enabled: s.enabled,
    programName: s.programName,
    intro: s.intro,
    tiers: s.tiers,
    // Our commission is a selling point for publishers, so it is public.
    commissionBpsPrintedByUs: s.commissionBpsPrintedByUs,
    commissionBpsPartnerShips: s.commissionBpsPartnerShips,
    commissionBpsConsignment: s.commissionBpsConsignment,
    returnAllowanceByTier: s.returnAllowanceByTier,
    publishersSelfAssignBarcodes: s.publishersSelfAssignBarcodes,
    retailerMinOrderCents: s.retailerMinOrderCents,
    retailerShipping: s.retailerShipping,
    retailerTerms: s.retailerTerms,
    publisherTerms: s.publisherTerms,
    pageCountStep: s.pageCountStep,
    minPageCount: s.minPageCount,
    maxPageCount: s.maxPageCount,
  };
}
