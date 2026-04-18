import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional(),
});

router.get('/', async (req, res) => {
  const { category, q, limit, cursor } = listQuery.parse(req.query);

  const where: any = { active: true };
  if (q) where.name = { contains: q, mode: 'insensitive' };
  if (category) where.categories = { some: { category: { slug: category } } };

  const products = await prisma.product.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      categories: { include: { category: true } },
    },
  });

  const hasMore = products.length > limit;
  const slice = hasMore ? products.slice(0, limit) : products;

  res.json({
    products: slice.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      priceCents: p.priceCents,
      hasVariants: p.hasVariants,
      image: p.images[0]?.url ?? null,
      categories: p.categories.map((pc) => pc.category.slug),
    })),
    nextCursor: hasMore ? slice[slice.length - 1]?.id : null,
  });
});

router.get('/:slug', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { where: { active: true }, orderBy: { priceCents: 'asc' } },
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      },
      categories: { include: { category: true } },
    },
  });
  if (!product || !product.active) throw new HttpError(404, 'Product not found');
  res.json({ product });
});

router.get('/_meta/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ categories });
});

export default router;
