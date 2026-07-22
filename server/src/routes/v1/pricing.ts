/**
 * /api/v1/pricing/quote — server-side price calculation. Integrators send
 * the product slug + quantity + selected options; we return the exact unit
 * and total price the storefront would charge, including configurator
 * page-count math, qty-tier discounts, and option modifiers.
 *
 * The same computation pipeline used for cart adds (see routes/cart.ts) so
 * external systems can stay in sync without re-implementing the formula.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { requireApiKey } from '../../middleware/api-key.js';
import { computePricing, canonicalizeOptionValues, type PricingConfig } from '../../lib/pricing.js';
import { priceForQuantity, type VolumeTier } from '../../lib/money.js';
import { getSetting } from '../../lib/settings.js';
import { evaluateCoupon } from '../../lib/coupons.js';
import { isProofRequested, HARD_COPY_PROOF_FEE_CENTS } from '../../lib/proofs.js';

const router = Router();

router.use(requireApiKey('pricing:read'));

const lineSchema = z.object({
  productSlug: z.string().optional(),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(100_000),
  options: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const quoteSchema = z.object({
  items: z.array(lineSchema).min(1),
  shippingRateId: z.string().optional(),
  shippingAddress: z
    .object({
      country: z.string().default('US'),
      region: z.string().optional(),
    })
    .optional(),
  couponCode: z.string().optional(),
});

router.post('/quote', async (req, res) => {
  const data = quoteSchema.parse(req.body);
  const siteDiscountBps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;

  const lines: Array<{
    productSlug: string;
    productName: string;
    quantity: number;
    options: Record<string, string | number>;
    unitPriceCents: number;
    totalCents: number;
    breakdown?: any;
  }> = [];

  let subtotal = 0;

  for (const line of data.items) {
    if (!line.productSlug && !line.productId) {
      throw new HttpError(400, 'Each line must specify productSlug or productId');
    }
    const product = await prisma.product.findUnique({
      where: line.productSlug ? { slug: line.productSlug } : { id: line.productId! },
      include: { variants: true },
    });
    if (!product || !product.active) throw new HttpError(404, `Product not found: ${line.productSlug ?? line.productId}`);
    if (line.quantity < product.minQuantity) {
      throw new HttpError(400, `Minimum quantity for ${product.slug} is ${product.minQuantity}`);
    }

    let unitPriceCents = product.priceCents;
    if (line.variantId) {
      const variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant || !variant.active) throw new HttpError(400, `Invalid variant for ${product.slug}`);
      unitPriceCents = variant.priceCents;
    }
    const baseCents = unitPriceCents;

    const cfg = product.pricingConfig as PricingConfig | null;
    const optionInputs: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(line.options ?? {})) {
      if (typeof v === 'number') {
        optionInputs[k] = v;
      } else {
        const trimmed = v.trim();
        const isInt = /^-?\d+$/.test(trimmed);
        optionInputs[k] = isInt ? Number(trimmed) : v;
      }
    }
    // Match the order path: resolve loose size labels to canonical keys so the
    // quote reflects the size the caller meant (e.g. "comic" → the comic price).
    if (cfg && typeof cfg === 'object' && Array.isArray(cfg.modifiers)) {
      Object.assign(optionInputs, canonicalizeOptionValues(cfg, optionInputs));
    }

    let breakdown: any = undefined;
    if (cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers)) {
      const b = computePricing(cfg, { quantity: line.quantity, options: optionInputs, siteDiscountBps });
      unitPriceCents = b.unitCents;
      breakdown = b;
    } else {
      unitPriceCents = priceForQuantity(unitPriceCents, line.quantity, product.volumeTiers as VolumeTier[] | null);
    }

    const totalCents = unitPriceCents * line.quantity;
    subtotal += totalCents;

    lines.push({
      productSlug: product.slug,
      productName: product.name,
      quantity: line.quantity,
      options: optionInputs,
      unitPriceCents,
      totalCents,
      breakdown,
    });

    // Hard-copy proof: one printed copy of this book (single-copy price, no
    // volume discount) + a $19.95 fee. Mirrors order creation so the quoted
    // total matches what we'll actually charge. (PDF proof is free.)
    if (isProofRequested(line.options?.['hard_copy_proof'])) {
      const singleCopy = cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers)
        ? computePricing(cfg, { quantity: 1, options: optionInputs, siteDiscountBps }).unitCents
        : priceForQuantity(baseCents, 1, product.volumeTiers as VolumeTier[] | null);
      const proofUnit = singleCopy + HARD_COPY_PROOF_FEE_CENTS;
      subtotal += proofUnit;
      lines.push({
        productSlug: 'hard-copy-proof',
        productName: `Hard-Copy Proof — ${product.name}`,
        quantity: 1,
        options: { proof_kind: 'hard-copy', book: product.name },
        unitPriceCents: proofUnit,
        totalCents: proofUnit,
      });
    }
  }

  // Coupon — stacks on top of the site-wide discount already baked into each unit price.
  const couponEval = await evaluateCoupon(data.couponCode, subtotal);
  const discount = couponEval.discountCents;
  const couponInfo = couponEval.ok && couponEval.coupon
    ? { code: couponEval.coupon.code, description: couponEval.coupon.description, discountCents: discount }
    : null;

  // Shipping
  let shippingCents = 0;
  let shippingMethod: { id: string; name: string; estimatedDays: string | null } | null = null;
  let shippingOptions: Array<{ id: string; name: string; rateCents: number; estimatedDays: string | null }> = [];
  if (data.shippingRateId) {
    const rate = await prisma.shippingRate.findUnique({ where: { id: data.shippingRateId } });
    if (!rate) throw new HttpError(400, 'Invalid shippingRateId');
    shippingCents = rate.rateCents;
    shippingMethod = { id: rate.id, name: rate.name, estimatedDays: rate.estimatedDays ?? null };
  } else if (data.shippingAddress?.country) {
    const zones = await prisma.shippingZone.findMany({
      where: { countries: { has: data.shippingAddress.country } },
      include: { rates: true },
    });
    shippingOptions = (zones[0]?.rates ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      rateCents: r.rateCents,
      estimatedDays: r.estimatedDays ?? null,
    }));
  }

  // Tax
  let taxCents = 0;
  if (data.shippingAddress?.region) {
    const taxRate = await prisma.taxRate.findFirst({
      where: {
        region: data.shippingAddress.region,
        country: data.shippingAddress.country ?? 'US',
      },
    });
    if (taxRate) {
      taxCents = Math.floor(((subtotal - discount) * taxRate.rateBps) / 10_000);
    }
  }

  const totalCents = subtotal - discount + shippingCents + taxCents;

  res.json({
    items: lines,
    subtotalCents: subtotal,
    discountCents: discount,
    coupon: couponInfo,
    shippingCents,
    shippingMethod,
    shippingOptions,
    taxCents,
    totalCents,
    currency: 'USD',
  });
});

export default router;
