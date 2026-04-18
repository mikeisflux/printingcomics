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
      totalCents: true, subtotalCents: true, shippingCents: true, taxCents: true,
      trackingNumber: true, shippingMethod: true,
      createdAt: true, updatedAt: true,
      items: {
        select: {
          id: true, name: true, quantity: true,
          product: { select: { slug: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
        },
      },
    },
  });
  res.json({ orders });
});

// Account dashboard summary: totals + recent orders.
router.get('/summary', requireAuth, async (req, res) => {
  const [count, spentAgg, recent, addresses] = await Promise.all([
    prisma.order.count({ where: { userId: req.session!.sub, paymentStatus: 'CAPTURED' } }),
    prisma.order.aggregate({
      where: { userId: req.session!.sub, paymentStatus: 'CAPTURED' },
      _sum: { totalCents: true },
    }),
    prisma.order.findMany({
      where: { userId: req.session!.sub },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true, number: true, status: true, paymentStatus: true,
        totalCents: true, createdAt: true,
      },
    }),
    prisma.address.count({ where: { userId: req.session!.sub } }),
  ]);
  res.json({
    orderCount: count,
    totalSpentCents: spentAgg._sum.totalCents ?? 0,
    addressCount: addresses,
    recentOrders: recent,
  });
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
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, provider: true, providerRef: true,
          amountCents: true, status: true, createdAt: true,
        },
      },
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
