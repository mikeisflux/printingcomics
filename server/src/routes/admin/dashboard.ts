import { Router } from 'express';
import { prisma } from '../../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    orderCount,
    productCount,
    userCount,
    revenueAgg,
    recentOrders,
    lowStock,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.order.aggregate({
      where: { paymentStatus: 'CAPTURED', createdAt: { gte: since } },
      _sum: { totalCents: true },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, number: true, email: true, status: true,
        paymentStatus: true, totalCents: true, createdAt: true,
      },
    }),
    prisma.product.findMany({
      where: { madeToOrder: false, stock: { lte: 5 }, active: true },
      take: 10,
      select: { id: true, slug: true, name: true, stock: true },
    }),
  ]);

  res.json({
    counts: { orders: orderCount, products: productCount, users: userCount },
    revenueLast30Cents: revenueAgg._sum.totalCents ?? 0,
    recentOrders,
    lowStock,
  });
});

export default router;
