import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { priceForQuantity, type VolumeTier } from '../lib/money.js';
import { computePricing, type PricingConfig } from '../lib/pricing.js';
import { getSetting } from '../lib/settings.js';
import { HARD_COPY_PROOF_FEE_CENTS, isProofRequested, getOrCreateProofProduct, PROOF_PRODUCT_SLUG, itemTitle } from '../lib/proofs.js';
import { optionKey } from '../lib/order-adjustments.js';
import { assertInStock, isTracked, unitsAlreadyInCart } from '../lib/inventory.js';
import { isProd } from '../config.js';

const router = Router();

const CART_COOKIE = 'pc_cart_key';

function ensureCartKey(req: Request, res: Response): string {
  const existing = req.cookies?.[CART_COOKIE];
  if (existing) return existing;
  const key = randomBytes(24).toString('hex');
  res.cookie(CART_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 24 * 60 * 60 * 1000,
  });
  req.sessionKey = key;
  return key;
}

async function getOrCreateCart(req: Request, res: Response) {
  const userId = req.session?.sub;
  if (userId) {
    const existing = await prisma.cart.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return existing;
    return prisma.cart.create({ data: { userId } });
  }
  const key = ensureCartKey(req, res);
  const existing = await prisma.cart.findUnique({ where: { sessionKey: key } });
  if (existing) return existing;
  return prisma.cart.create({ data: { sessionKey: key } });
}

async function loadCartFull(cartId: string) {
  return prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              options: { include: { values: true } },
              categories: { select: { category: { select: { slug: true } } } },
            },
          },
          variant: true,
        },
      },
    },
  });
}

router.get('/', async (req, res) => {
  const cart = await getOrCreateCart(req, res);
  const full = await loadCartFull(cart.id);
  res.json({ cart: full });
});

const addSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(10_000),
  options: z.record(z.string(), z.string()).optional(),
});

type TitleOption = { name: string; internalKey: string | null; type: string; required: boolean };

/**
 * Every required upload (the Cover PDF and the Interior PDF of a book, the
 * artwork of a print) must be in place before the line goes in the cart —
 * a book cannot be printed without them, and a missing one used to surface
 * only when staff opened the order.
 */
function guardUploads(options: Record<string, string> | undefined, productOptions: TitleOption[]): void {
  const missing = productOptions
    .filter((o) => o.type === 'UPLOAD' && o.required)
    .filter((o) => !/^(https?:\/\/|\/(uploads|api\/files)\/)/.test((options?.[optionKey(o)] ?? '').trim()))
    .map((o) => o.name);
  if (missing.length === 0) return;
  throw new HttpError(400, missing.length === 1
    ? `Please upload the ${missing[0]} before adding this to your cart.`
    : `Please upload the ${missing.slice(0, -1).join(', ')} and the ${missing[missing.length - 1]} before adding this to your cart.`);
}

/**
 * Every book needs its own title. The title is the only thing that tells
 * two lines of the same product apart — on the order, in the proof queue
 * and in the customer's proof emails. One customer once titled twelve
 * different books identically and every proof came back ambiguous, so a
 * blank or repeated title is refused here, whatever the browser allowed.
 * Returns the options with the title trimmed. `exceptItemId` is the line
 * being edited (it may keep its own title).
 */
async function guardTitle(cartId: string, options: Record<string, string> | undefined, productOptions: TitleOption[], exceptItemId?: string) {
  const titleOpt = productOptions.find((o) => o.type === 'TEXT' && optionKey(o) === 'title');
  if (!titleOpt) return options;
  const title = (options?.['title'] ?? '').trim();
  if (!title && titleOpt.required) {
    throw new HttpError(400, `Please give this book a title (${titleOpt.name}) so we can tell it apart from the others in your order.`);
  }
  if (!title) return options;
  const inCart = await prisma.cartItem.findMany({
    where: { cartId, ...(exceptItemId ? { id: { not: exceptItemId } } : {}) },
    select: { options: true, product: { select: { slug: true } } },
  });
  const clash = inCart.find((it) => it.product.slug !== PROOF_PRODUCT_SLUG && itemTitle(it).toLowerCase() === title.toLowerCase());
  if (clash) {
    throw new HttpError(400, `You already have “${title}” in your cart. Each book needs its own title — add the issue number, volume or cover type (for example “${title} — Raised Metal cover”), or change the quantity of the one already in your cart instead.`);
  }
  return { ...(options ?? {}), title };
}

/** Same coercion the pricing engine expects: integer-looking strings become numbers. */
function pricingInputs(options: Record<string, string> | null | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(options ?? {})) {
    const n = Number(v);
    out[k] = Number.isFinite(n) && !Number.isNaN(n) && typeof v === 'string' && v.trim().match(/^-?\d+$/) ? n : v;
  }
  return out;
}

/**
 * Hard-copy proof: a separate, server-priced line — one printed copy of THIS
 * book (single-copy price, no volume discount) plus a flat proof fee. Kept in
 * step with the book line: created when the toggle is on, repriced when the
 * book changes, removed when the toggle goes off.
 */
async function syncProofLine(cartId: string, itemId: string, product: { id: string; name: string; priceCents: number; volumeTiers: unknown; pricingConfig: unknown }, options: Record<string, string> | undefined, siteDiscountBps: number) {
  const existing = await prisma.cartItem.findFirst({ where: { cartId, options: { path: ['proof_for_item'], equals: itemId } } });
  if (!isProofRequested(options?.['hard_copy_proof'])) {
    if (existing) await prisma.cartItem.delete({ where: { id: existing.id } });
    return;
  }
  const cfg = product.pricingConfig as PricingConfig | null;
  const isConfigurator = !!(cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers));
  const singleCopyCents = isConfigurator
    ? computePricing(cfg!, { quantity: 1, options: pricingInputs(options), siteDiscountBps }).unitCents
    : priceForQuantity(product.priceCents, 1, product.volumeTiers as VolumeTier[] | null);
  const unitPriceCents = singleCopyCents + HARD_COPY_PROOF_FEE_CENTS;
  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { unitPriceCents, options: { proof_kind: 'hard-copy', proof_for_item: itemId, book: product.name } } });
    return;
  }
  const proofProduct = await getOrCreateProofProduct();
  await prisma.cartItem.create({
    data: { cartId, productId: proofProduct.id, quantity: 1, unitPriceCents, options: { proof_kind: 'hard-copy', proof_for_item: itemId, book: product.name } },
  });
}

router.post('/items', async (req, res) => {
  const data = addSchema.parse(req.body);
  const cart = await getOrCreateCart(req, res);

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    include: { variants: true, stockPool: true, options: { select: { name: true, internalKey: true, type: true, required: true } } },
  });
  if (!product || !product.active) throw new HttpError(404, 'Product not found');
  if (data.quantity < product.minQuantity) {
    throw new HttpError(400, `Minimum quantity is ${product.minQuantity}`);
  }

  data.options = await guardTitle(cart.id, data.options, product.options);
  guardUploads(data.options, product.options);

  let unitPriceCents = product.priceCents;
  let variantId: string | undefined = data.variantId;
  let variant: (typeof product.variants)[number] | undefined;
  if (data.variantId) {
    variant = product.variants.find((v) => v.id === data.variantId);
    if (!variant || !variant.active) throw new HttpError(400, 'Invalid variant');
    unitPriceCents = variant.priceCents;
    variantId = variant.id;
  }

  // Shelf goods sell from stock (backorder sells ahead of it). Count what the
  // cart already holds against the same stock so two adds cannot outrun it.
  if (isTracked(product) && !product.backorder) {
    assertInStock(product, data.quantity, variant ?? null, await unitsAlreadyInCart(cart.id, product, variantId));
  }

  // Configurator products (with pricingConfig) compute unit price from
  // selections instead of base+variant+volume.
  const cfg = product.pricingConfig as PricingConfig | null;
  const isConfigurator = !!(cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers));
  const siteDiscountBps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;
  const optionInputs = pricingInputs(data.options);
  const baseUnit = unitPriceCents;
  if (isConfigurator) {
    unitPriceCents = computePricing(cfg!, { quantity: data.quantity, options: optionInputs, siteDiscountBps }).unitCents;
  } else {
    unitPriceCents = priceForQuantity(baseUnit, data.quantity, product.volumeTiers as VolumeTier[] | null);
  }

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId: product.id,
      variantId,
      quantity: data.quantity,
      options: data.options ?? undefined,
      unitPriceCents,
    },
  });

  await syncProofLine(cart.id, item.id, product, data.options, siteDiscountBps);

  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  const full = await loadCartFull(cart.id);
  res.json({ cart: full, addedItemId: item.id });
});

const updateSchema = z.object({
  quantity: z.number().int().min(1).max(10_000).optional(),
  // Editing a configured book from the cart: the full new set of selections,
  // and the product when the trim size was changed in the configurator.
  options: z.record(z.string(), z.string()).optional(),
  productId: z.string().optional(),
});

const editProductInclude = {
  stockPool: true,
  options: { select: { name: true, internalKey: true, type: true, required: true } },
} as const;

router.patch('/items/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const cart = await getOrCreateCart(req, res);
  const item = await prisma.cartItem.findFirst({
    where: { id: req.params.id, cartId: cart.id },
    include: { product: { include: editProductInclude }, variant: true },
  });
  if (!item) throw new HttpError(404, 'Cart item not found');
  if (item.product.slug === PROOF_PRODUCT_SLUG && (data.options || data.productId)) throw new HttpError(400, 'Edit the book this proof belongs to instead.');

  // Switching product (another trim size) only makes sense together with a
  // fresh set of selections; the old variant, if any, no longer applies.
  const switching = !!data.productId && data.productId !== item.productId;
  if (switching && data.options === undefined) throw new HttpError(400, 'Send the new selections along with the new product.');
  const product = switching
    ? await prisma.product.findUnique({ where: { id: data.productId! }, include: editProductInclude })
    : item.product;
  if (!product || !product.active) throw new HttpError(404, 'Product not found');
  const variant = switching ? null : item.variant;

  const quantity = data.quantity ?? item.quantity;
  if (quantity < product.minQuantity) throw new HttpError(400, `Minimum quantity is ${product.minQuantity}`);
  const options = data.options !== undefined
    ? await guardTitle(cart.id, data.options, product.options, item.id)
    : ((item.options as Record<string, string> | null) ?? undefined);
  if (data.options !== undefined) guardUploads(options, product.options);

  assertInStock(product, quantity, variant, await unitsAlreadyInCart(cart.id, product, variant?.id, item.id));

  const baseCents = variant?.priceCents ?? product.priceCents;
  let unitPriceCents: number;
  const cfg = product.pricingConfig as PricingConfig | null;
  const siteDiscountBps = Number(await getSetting<number | string>('pricing.siteDiscountBps', 0)) || 0;
  if (product.slug === PROOF_PRODUCT_SLUG) {
    // Proof lines carry a fixed, server-computed price — never recompute.
    unitPriceCents = item.unitPriceCents;
  } else if (cfg && typeof cfg === 'object' && Array.isArray(cfg.qtyTiers)) {
    unitPriceCents = computePricing(cfg, { quantity, options: pricingInputs(options), siteDiscountBps }).unitCents;
  } else {
    unitPriceCents = priceForQuantity(baseCents, quantity, product.volumeTiers as VolumeTier[] | null);
  }

  await prisma.cartItem.update({
    where: { id: item.id },
    data: {
      quantity,
      unitPriceCents,
      ...(data.options !== undefined ? { options: options ?? {} } : {}),
      ...(switching ? { productId: product.id, variantId: null } : {}),
    },
  });
  if (data.options !== undefined && product.slug !== PROOF_PRODUCT_SLUG) {
    await syncProofLine(cart.id, item.id, product, options, siteDiscountBps);
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  const full = await loadCartFull(cart.id);
  res.json({ cart: full });
});

router.delete('/items/:id', async (req, res) => {
  const cart = await getOrCreateCart(req, res);
  await prisma.cartItem.deleteMany({ where: { id: req.params.id, cartId: cart.id } });
  // Also drop any hard-copy-proof line attached to this book line.
  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id, options: { path: ['proof_for_item'], equals: req.params.id } },
  });
  const full = await loadCartFull(cart.id);
  res.json({ cart: full });
});

export default router;
