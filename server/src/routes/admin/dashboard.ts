import { Router } from 'express';
import { prisma } from '../../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const since14 = new Date(Date.now() - 14 * DAY_MS);
  const since24h = new Date(Date.now() - DAY_MS);

  const [
    orderCount,
    productCount,
    userCount,
    revenue30,
    revenue24,
    recentOrders,
    lowStock,
    awaitingFulfillment,
    unreadInbox,
    recentRevenue,
    topProductRows,
    topCustomerRows,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.order.aggregate({
      where: { paymentStatus: 'CAPTURED', createdAt: { gte: since30 } },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { paymentStatus: 'CAPTURED', createdAt: { gte: since24h } },
      _sum: { totalCents: true },
      _count: { _all: true },
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
    prisma.order.count({
      where: { paymentStatus: 'CAPTURED', status: { in: ['PAID', 'IN_PRODUCTION'] } },
    }),
    prisma.inboundEmail.count({ where: { handled: false } }),
    // 14-day revenue series — group by day in SQL.
    prisma.$queryRaw<{ day: Date; total_cents: bigint }[]>`
      SELECT date_trunc('day', "createdAt")::date AS day,
             COALESCE(SUM("totalCents"), 0)::bigint AS total_cents
      FROM "Order"
      WHERE "paymentStatus" = 'CAPTURED' AND "createdAt" >= ${since14}
      GROUP BY day
      ORDER BY day ASC
    `,
    // Top products by units sold (30d).
    prisma.$queryRaw<{ product_id: string; name: string; slug: string; units: bigint; revenue_cents: bigint }[]>`
      SELECT oi."productId" AS product_id, oi."name" AS name, p."slug" AS slug,
             SUM(oi."quantity")::bigint AS units,
             SUM(oi."totalCents")::bigint AS revenue_cents
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "Product" p ON p."id" = oi."productId"
      WHERE o."paymentStatus" = 'CAPTURED' AND o."createdAt" >= ${since30}
      GROUP BY oi."productId", oi."name", p."slug"
      ORDER BY units DESC
      LIMIT 5
    `,
    // Top customers by lifetime value.
    prisma.$queryRaw<{ user_id: string; email: string; name: string | null; orders: bigint; spent_cents: bigint }[]>`
      SELECT u."id" AS user_id, u."email",
             TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))) AS name,
             COUNT(o.*)::bigint AS orders,
             SUM(o."totalCents")::bigint AS spent_cents
      FROM "Order" o
      JOIN "User" u ON u."id" = o."userId"
      WHERE o."paymentStatus" = 'CAPTURED'
      GROUP BY u."id", u."email", u."firstName", u."lastName"
      ORDER BY spent_cents DESC
      LIMIT 5
    `,
  ]);

  // Densify the revenue series so every day in the window has an entry.
  const series: { day: string; totalCents: number }[] = [];
  const byDay = new Map<string, number>();
  for (const r of recentRevenue) {
    const key = r.day.toISOString().slice(0, 10);
    byDay.set(key, Number(r.total_cents));
  }
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    series.push({ day: key, totalCents: byDay.get(key) ?? 0 });
  }

  res.json({
    counts: {
      orders: orderCount,
      products: productCount,
      users: userCount,
      awaitingFulfillment,
      unreadInbox,
    },
    revenueLast30Cents: Number(revenue30._sum.totalCents ?? 0),
    revenueLast30Count: revenue30._count._all,
    revenueLast24hCents: Number(revenue24._sum.totalCents ?? 0),
    revenueLast24hCount: revenue24._count._all,
    revenueSeries14d: series,
    topProducts: topProductRows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      slug: r.slug,
      units: Number(r.units),
      revenueCents: Number(r.revenue_cents),
    })),
    topCustomers: topCustomerRows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      orders: Number(r.orders),
      spentCents: Number(r.spent_cents),
    })),
    recentOrders,
    lowStock,
  });
});

export default router;
