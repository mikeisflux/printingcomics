export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === 'string' ? Number(dollars) : dollars;
  if (!Number.isFinite(n)) throw new Error('Invalid dollar amount');
  return Math.round(n * 100);
}

export interface VolumeTier {
  minQty: number;
  pricePerUnitCents: number;
}

/** Returns the best (lowest) per-unit price for a given quantity from volume tiers, or basePrice. */
export function priceForQuantity(basePriceCents: number, qty: number, tiers?: VolumeTier[] | null): number {
  if (!tiers || tiers.length === 0) return basePriceCents;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let price = basePriceCents;
  for (const tier of sorted) {
    if (qty >= tier.minQty) price = tier.pricePerUnitCents;
  }
  return price;
}
