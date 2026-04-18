/**
 * Configurator pricing.
 *
 * Unit price formula lifted from Comix Wellspring's discount log spreadsheets:
 *
 *   unitCents = (baseCents + sum(modifier upgrades) + pagesUpgradeCents)
 *                × (1 − qtyDiscountBps/10000)
 *
 * Everything is stored in `Product.pricingConfig` (Json) so both the server
 * and the storefront can compute the same answer. A mirror of this file
 * lives at web/src/lib/pricing.ts; keep them in sync.
 */

export interface QtyTier {
  qty: number;
  discountBps: number; // basis points: 7500 = 75%
}

export interface ModifierOption {
  label: string;
  cents: number;
}

export interface ModifierDef {
  /** Stable key matching what the cart stores in `options`. */
  key: string;
  values: Record<string, number>; // label → cents per book
}

export interface PagesPricing {
  /** Number of pages that carries no extra charge. */
  baseline: number;
  /** Cents added per +4 pages beyond baseline, keyed by "color:paper". */
  perFourPagesCents: Record<string, number>;
  /** Which options to look at to resolve the color:paper key. */
  colorKey?: string;
  paperKey?: string;
  pagesKey?: string; // selected option that holds the numeric page count
}

export interface PricingConfig {
  baseCents: number;
  qtyTiers: QtyTier[];
  modifiers: ModifierDef[];
  pages?: PagesPricing;
}

export interface PricingInputs {
  quantity: number;
  /** User's selections: option key → value label (or number for pages). */
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

  // Pick the best qty tier whose qty <= quantity.
  const sortedTiers = [...config.qtyTiers].sort((a, b) => a.qty - b.qty);
  let discountBps = 0;
  for (const t of sortedTiers) {
    if (inputs.quantity >= t.qty) discountBps = t.discountBps;
  }

  const unitCents = Math.round(combinedListCents * (1 - discountBps / 10000));
  const totalCents = unitCents * inputs.quantity;

  return { baseCents: config.baseCents, modifierCents, pagesCents, combinedListCents, discountBps, unitCents, totalCents };
}
