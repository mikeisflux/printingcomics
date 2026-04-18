/**
 * Client-side mirror of server/src/lib/pricing.ts. Keep in sync — both sides
 * compute the same unit price; the server is authoritative at add-to-cart.
 */

export interface QtyTier { qty: number; discountBps: number; }
export interface ModifierDef { key: string; values: Record<string, number>; }
export interface PagesPricing {
  baseline: number;
  perFourPagesCents: Record<string, number>;
  colorKey?: string;
  paperKey?: string;
  pagesKey?: string;
}
export interface PricingConfig {
  baseCents: number;
  qtyTiers: QtyTier[];
  modifiers: ModifierDef[];
  pages?: PagesPricing;
}
export interface PricingInputs {
  quantity: number;
  options: Record<string, string | number>;
}
export interface PricingBreakdown {
  baseCents: number;
  modifierCents: Record<string, number>;
  pagesCents: number;
  combinedListCents: number;
  discountBps: number;
  unitCents: number;
  totalCents: number;
}

export function computePricing(config: PricingConfig, inputs: PricingInputs): PricingBreakdown {
  const modifierCents: Record<string, number> = {};
  let modifierTotal = 0;
  for (const mod of config.modifiers) {
    const selected = inputs.options[mod.key];
    if (typeof selected === 'string' && selected in mod.values) {
      const cents = mod.values[selected] ?? 0;
      modifierCents[mod.key] = cents;
      modifierTotal += cents;
    }
  }

  let pagesCents = 0;
  if (config.pages) {
    const pagesSelected = inputs.options[config.pages.pagesKey ?? 'interior_pages'];
    const paper = inputs.options[config.pages.paperKey ?? 'interior_paper'];
    const color = inputs.options[config.pages.colorKey ?? 'interior_color'];
    if (typeof pagesSelected === 'number' && typeof paper === 'string' && typeof color === 'string') {
      const key = `${color.toLowerCase().replace(/\s+/g, '')}:${paper.toLowerCase().replace(/[\s-]+/g, '')}`;
      const perFour = config.pages.perFourPagesCents[key] ?? 0;
      const extraBlocks = Math.max(0, Math.ceil((pagesSelected - config.pages.baseline) / 4));
      pagesCents = extraBlocks * perFour;
    }
  }

  const combinedListCents = config.baseCents + modifierTotal + pagesCents;

  const sortedTiers = [...config.qtyTiers].sort((a, b) => a.qty - b.qty);
  let discountBps = 0;
  for (const t of sortedTiers) if (inputs.quantity >= t.qty) discountBps = t.discountBps;

  const unitCents = Math.round(combinedListCents * (1 - discountBps / 10000));
  const totalCents = unitCents * inputs.quantity;

  return { baseCents: config.baseCents, modifierCents, pagesCents, combinedListCents, discountBps, unitCents, totalCents };
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
