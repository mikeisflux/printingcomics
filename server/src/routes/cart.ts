import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { priceForQuantity, type VolumeTier } from '../lib/money.js';
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
          product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
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
  options: z.record(z.string()).optional(),
});

router.post('/items', async (req, res) => {
  const data = addSchema.parse(req.body);
  const cart = await getOrCreateCart(req, res);

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    include: { variants: true },
  });
  if (!product || !product.active) throw new HttpError(404, 'Product not found');
  if (data.quantity < product.minQuantity) {
    throw new HttpError(400, `Minimum quantity is ${product.minQuantity}`);
  }

  let unitPriceCents = product.priceCents;
  let variantId: string | undefined = data.variantId;
  if (data.variantId) {
    const variant = product.variants.find((v) => v.id === data.variantId);
    if (!variant || !variant.active) throw new HttpError(400, 'Invalid variant');
    unitPriceCents = variant.priceCents;
    variantId = variant.id;
  }

  unitPriceCents = priceForQuantity(unitPriceCents, data.quantity, product.volumeTiers as VolumeTier[] | null);

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

  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  const full = await loadCartFull(cart.id);
  res.json({ cart: full, addedItemId: item.id });
});

const updateSchema = z.object({ quantity: z.number().int().min(1).max(10_000) });

router.patch('/items/:id', async (req, res) => {
  const { quantity } = updateSchema.parse(req.body);
  const cart = await getOrCreateCart(req, res);
  const item = await prisma.cartItem.findFirst({
    where: { id: req.params.id, cartId: cart.id },
    include: { product: true, variant: true },
  });
  if (!item) throw new HttpError(404, 'Cart item not found');

  const baseCents = item.variant?.priceCents ?? item.product.priceCents;
  const unitPriceCents = priceForQuantity(baseCents, quantity, item.product.volumeTiers as VolumeTier[] | null);

  await prisma.cartItem.update({
    where: { id: item.id },
    data: { quantity, unitPriceCents },
  });
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  const full = await loadCartFull(cart.id);
  res.json({ cart: full });
});

router.delete('/items/:id', async (req, res) => {
  const cart = await getOrCreateCart(req, res);
  await prisma.cartItem.deleteMany({ where: { id: req.params.id, cartId: cart.id } });
  const full = await loadCartFull(cart.id);
  res.json({ cart: full });
});

export default router;
