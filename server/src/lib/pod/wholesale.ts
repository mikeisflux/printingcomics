/**
 * Retailer wholesale pricing: MSRP × (1 − tier discount). The tier comes from
 * the order's subtotal at MSRP (or a forced tier on the retailer). Incentive
 * covers ("1:10") are earned by ordering enough of the qualifying title.
 *
 * Pure functions, mirrored in web/src/lib/wholesale.ts for the retailer cart
 * preview — keep the two in step.
 */
import type { RetailerTier } from './settings.js';

export interface WholesaleTitle {
  id: string;
  catalogKey: string;
  title: string;
  msrpCents: number;
  partnerId: string;
  seriesName?: string | null;
  issueNumber?: string | null;
  incentiveRatio?: string | null;
  incentiveQualifierKey?: string | null;
  reorderable?: boolean;
}

export interface TierPick {
  index: number;
  tier: RetailerTier;
  next: RetailerTier | null;
  /** How much more (at MSRP) reaches the next tier; 0 at the top. */
  toNextCents: number;
  forced: boolean;
}

export function pickTier(tiers: RetailerTier[], msrpSubtotalCents: number, forcedIndex?: number | null): TierPick {
  const sorted = [...tiers].sort((a, b) => a.minCents - b.minCents);
  if (forcedIndex != null && sorted[forcedIndex - 1]) {
    const index = forcedIndex - 1;
    return { index, tier: sorted[index]!, next: null, toNextCents: 0, forced: true };
  }
  let index = 0;
  for (let i = 0; i < sorted.length; i++) if (msrpSubtotalCents >= sorted[i]!.minCents) index = i;
  const next = sorted[index + 1] ?? null;
  return { index, tier: sorted[index]!, next, toNextCents: next ? Math.max(0, next.minCents - msrpSubtotalCents) : 0, forced: false };
}

/** Round half up to the cent, as a shop expects on an invoice. */
export function wholesaleUnit(msrpCents: number, discountBps: number): number {
  return Math.round((msrpCents * (10_000 - discountBps)) / 10_000);
}

export interface IncentiveRule { award: number; qualifying: number; label: string }

export function parseIncentiveRatio(ratio: string | null | undefined): IncentiveRule | null {
  const m = /\b(\d+)\s*[:/]\s*(\d+)\b/.exec(ratio ?? '');
  if (!m) return null;
  const award = Number(m[1]);
  const qualifying = Number(m[2]);
  if (award < 1 || qualifying < 1) return null;
  return { award, qualifying, label: `${award}:${qualifying}` };
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The titles whose copies earn an incentive cover: the explicit qualifier
 * when the publisher named one, else every other cover of the same series
 * and issue from the same publisher.
 */
export function qualifyingTitles(incentive: WholesaleTitle, all: WholesaleTitle[]): WholesaleTitle[] {
  if (incentive.incentiveQualifierKey) {
    return all.filter((t) => t.catalogKey === incentive.incentiveQualifierKey && t.id !== incentive.id);
  }
  const series = norm(incentive.seriesName || incentive.title).replace(/\b(cover|cvr|variant|virgin|incentive|incv|retailer|special|regular|main|homage)\b.*$/, '').trim();
  return all.filter((t) =>
    t.id !== incentive.id
    && t.partnerId === incentive.partnerId
    && !parseIncentiveRatio(t.incentiveRatio)
    && norm(t.issueNumber) === norm(incentive.issueNumber)
    && norm(t.seriesName || t.title).startsWith(series),
  );
}

export interface PricedWholesaleLine {
  listingId: string;
  catalogKey: string;
  title: string;
  quantity: number;
  msrpCents: number;
  discountBps: number;
  unitCents: number;
  totalCents: number;
  /** For incentive covers: how many this order has earned, and the problem if too many. */
  incentive?: { rule: IncentiveRule; earned: number; qualifyingQty: number; over: number };
}

export interface WholesalePricing {
  lines: PricedWholesaleLine[];
  msrpSubtotalCents: number;
  subtotalCents: number;
  savingsCents: number;
  tier: TierPick;
  problems: string[];
}

export function priceWholesale(args: {
  quantities: Record<string, number>;
  titles: WholesaleTitle[];
  tiers: RetailerTier[];
  forcedTier?: number | null;
  minOrderCents?: number;
}): WholesalePricing {
  const byId = new Map(args.titles.map((t) => [t.id, t]));
  const wanted = Object.entries(args.quantities)
    .map(([id, q]) => [id, Math.max(0, Math.floor(Number(q) || 0))] as const)
    .filter(([id, q]) => q > 0 && byId.has(id));
  const problems: string[] = [];
  const msrpSubtotalCents = wanted.reduce((s, [id, q]) => s + byId.get(id)!.msrpCents * q, 0);
  const tier = pickTier(args.tiers, msrpSubtotalCents, args.forcedTier);
  const lines: PricedWholesaleLine[] = wanted.map(([id, quantity]) => {
    const t = byId.get(id)!;
    const unitCents = wholesaleUnit(t.msrpCents, tier.tier.discountBps);
    const line: PricedWholesaleLine = { listingId: id, catalogKey: t.catalogKey, title: t.title, quantity, msrpCents: t.msrpCents, discountBps: tier.tier.discountBps, unitCents, totalCents: unitCents * quantity };
    const rule = parseIncentiveRatio(t.incentiveRatio);
    if (rule) {
      const qualifyingQty = qualifyingTitles(t, args.titles).reduce((s, q) => s + (args.quantities[q.id] ?? 0), 0);
      const earned = Math.floor(qualifyingQty / rule.qualifying) * rule.award;
      const over = Math.max(0, quantity - earned);
      line.incentive = { rule, earned, qualifyingQty, over };
      if (over > 0) problems.push(`${t.title}: ${rule.label} incentive — ${earned} earned with ${qualifyingQty} qualifying copies, ${quantity} ordered.`);
    }
    return line;
  });
  const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);
  if (args.minOrderCents && msrpSubtotalCents > 0 && msrpSubtotalCents < args.minOrderCents) {
    problems.push(`Orders start at $${(args.minOrderCents / 100).toFixed(2)} at cover price.`);
  }
  return { lines, msrpSubtotalCents, subtotalCents, savingsCents: msrpSubtotalCents - subtotalCents, tier, problems };
}
