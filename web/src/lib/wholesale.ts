/**
 * Retailer wholesale maths for the live basket. Mirrors
 * server/src/lib/pod/wholesale.ts — keep the two in step. The server
 * re-prices every order; this only keeps the screen honest while typing.
 */
export interface RetailerTier { name: string; minCents: number; discountBps: number }

export interface TierPick { index: number; tier: RetailerTier; next: RetailerTier | null; toNextCents: number; forced: boolean; progress: number }

export function pickTier(tiers: RetailerTier[], msrpSubtotalCents: number, forcedIndex?: number | null): TierPick {
  const sorted = [...tiers].sort((a, b) => a.minCents - b.minCents);
  if (forcedIndex != null && sorted[forcedIndex - 1]) {
    const index = forcedIndex - 1;
    return { index, tier: sorted[index]!, next: null, toNextCents: 0, forced: true, progress: 1 };
  }
  let index = 0;
  for (let i = 0; i < sorted.length; i++) if (msrpSubtotalCents >= sorted[i]!.minCents) index = i;
  const tier = sorted[index]!;
  const next = sorted[index + 1] ?? null;
  const span = next ? next.minCents - tier.minCents : 1;
  const progress = next ? Math.min(1, Math.max(0, (msrpSubtotalCents - tier.minCents) / span)) : 1;
  return { index, tier, next, toNextCents: next ? Math.max(0, next.minCents - msrpSubtotalCents) : 0, forced: false, progress };
}

export const wholesaleUnit = (msrpCents: number, discountBps: number) => Math.round((msrpCents * (10_000 - discountBps)) / 10_000);

export interface BasketTitle { listingId: string; catalogKey: string; title: string; msrpCents: number; incentiveRatio?: string | null }

export function priceBasket(quantities: Record<string, number>, titles: BasketTitle[], tiers: RetailerTier[], forcedTier?: number | null) {
  const byId = new Map(titles.map((t) => [t.listingId, t]));
  const lines = Object.entries(quantities).filter(([id, q]) => q > 0 && byId.has(id)).map(([id, q]) => ({ title: byId.get(id)!, quantity: q }));
  const msrpSubtotalCents = lines.reduce((s, l) => s + l.title.msrpCents * l.quantity, 0);
  const tier = pickTier(tiers, msrpSubtotalCents, forcedTier);
  const priced = lines.map((l) => { const unit = wholesaleUnit(l.title.msrpCents, tier.tier.discountBps); return { ...l, unitCents: unit, totalCents: unit * l.quantity }; });
  const subtotalCents = priced.reduce((s, l) => s + l.totalCents, 0);
  return { lines: priced, msrpSubtotalCents, subtotalCents, savingsCents: msrpSubtotalCents - subtotalCents, tier, units: priced.reduce((s, l) => s + l.quantity, 0) };
}
