import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.session!.sub },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, number: true, status: true, paymentStatus: true,
      totalCents: true, createdAt: true,
    },
  });
  res.json({ orders });
});

router.get('/:number', requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { number: req.params.number, userId: req.session!.sub },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              options: { include: { values: true } },
            },
          },
        },
      },
      payments: true,
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order });
});

// Reorder: creates a new cart (or merges into the user's current cart) with
// the same items & options as a past order. Returns the new cart so the
// client can redirect to /cart.
router.post('/:number/reorder', requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { number: req.params.number, userId: req.session!.sub },
    include: { items: true },
  });
  if (!order) throw new HttpError(404, 'Order not found');

  let cart = await prisma.cart.findFirst({
    where: { userId: req.session!.sub },
    orderBy: { updatedAt: 'desc' },
  });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId: req.session!.sub } });
  }

  for (const item of order.items) {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        options: item.options ?? undefined,
        unitPriceCents: item.unitPriceCents,
      },
    });
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

  res.json({ ok: true, cartId: cart.id, itemCount: order.items.length });
});

export default router;
