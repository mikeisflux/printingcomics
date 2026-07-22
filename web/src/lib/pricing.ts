/**
 * Client-side mirror of server/src/lib/pricing.ts. Keep in sync — both sides
 * compute the same unit price; the server is authoritative at add-to-cart.
 */

export interface QtyTier { qty: number; discountBps: number; }
export interface ModifierDef { key: string; values: Record<string, number>; }
export interface PageTier {
  pages: number;
  cents: number;
}
export interface PagesPricing {
  /** Exact per-book page-upgrade cost per page count, keyed by "color:paper".
   *  Lifted verbatim from the discount-log spreadsheet — never recomputed. */
  tiers: Record<string, PageTier[]>;
  colorKey?: string;
  paperKey?: string;
  pagesKey?: string;
}
export interface PricingConfig {
  baseCents: number;
  qtyTiers: QtyTier[];
  modifiers: ModifierDef[];
  pages?: PagesPricing;
  kind?: string;
  ignoreSiteDiscount?: boolean;
}
export interface PricingInputs {
  quantity: number;
  options: Record<string, string | number>;
  siteDiscountBps?: number;
}
export interface PricingBreakdown {
  baseCents: number;
  modifierCents: Record<string, number>;
  pagesCents: number;
  combinedListCents: number;
  discountBps: number;
  siteDiscountBps: number;
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
      const tier = config.pages.tiers?.[key]?.find((t) => t.pages === pagesSelected);
      pagesCents = tier?.cents ?? 0;
    }
  }

  const combinedListCents = config.baseCents + modifierTotal + pagesCents;

  const sortedTiers = [...config.qtyTiers].sort((a, b) => a.qty - b.qty);
  let discountBps = 0;
  for (const t of sortedTiers) if (inputs.quantity >= t.qty) discountBps = t.discountBps;

  const siteDiscountBps = config.ignoreSiteDiscount ? 0 : (inputs.siteDiscountBps ?? 0);
  const unitCents = Math.round(
    combinedListCents * (1 - discountBps / 10000) * (1 - siteDiscountBps / 10000),
  );
  const totalCents = unitCents * inputs.quantity;

  return { baseCents: config.baseCents, modifierCents, pagesCents, combinedListCents, discountBps, siteDiscountBps, unitCents, totalCents };
}

/**
 * Resolve loosely-typed option values to a config's canonical modifier keys.
 * Mirror of the server helper — pricing matches modifier values by exact
 * label, so `"11x17"` resolves to `"11×17"`. Additive only: fills in when
 * there's no exact match and exactly one value matches under normalization
 * (unify ×/x, drop spaces/quotes/parens) or as a unique prefix. The storefront
 * sends exact labels, so this is a no-op there.
 */
export function canonicalizeOptionValues(
  config: PricingConfig,
  options: Record<string, string | number>,
): Record<string, string | number> {
  const norm = (s: string) => s.toLowerCase().replace(/[×✕]/g, 'x').replace(/["'()]/g, '').replace(/\s+/g, '');
  const out = { ...options };
  for (const mod of config.modifiers) {
    const v = out[mod.key];
    if (typeof v !== 'string') continue;
    if (v in mod.values) continue;
    const target = norm(v);
    if (!target) continue;
    const keys = Object.keys(mod.values);
    const matches = keys.filter((k) => {
      const nk = norm(k);
      return nk === target || nk.startsWith(target) || target.startsWith(nk);
    });
    if (matches.length === 1) out[mod.key] = matches[0]!;
  }
  return out;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
