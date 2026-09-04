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
      backorder: p.backorder,
      backorderEta: p.backorderEta,
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

/** Products that share at least one category with the given product. */
router.get('/:slug/related', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { categories: true },
  });
  if (!product) throw new HttpError(404, 'Product not found');
  const categoryIds = product.categories.map((pc) => pc.categoryId);
  const related = await prisma.product.findMany({
    where: {
      active: true,
      id: { not: product.id },
      categories: { some: { categoryId: { in: categoryIds } } },
    },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    take: 6,
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    related: related.map((p) => ({
      id: p.id, slug: p.slug, name: p.name,
      priceCents: p.priceCents, hasVariants: p.hasVariants,
      image: p.images[0]?.url ?? null,
    })),
  });
});

router.get('/_meta/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json({ categories });
});

router.get('/_meta/categories/:slug', async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { slug: req.params.slug },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw new HttpError(404, 'Category not found');
  res.json({ category });
});

/**
 * Returns every active product in a category with the FULL configurator
 * payload (options + values + pricingConfig + images). Used by the
 * /shop/:category page to render the unified configurator where the
 * different products are presented as a single "Choose your size" tile.
 */
router.get('/_meta/categories/:slug/configure', async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { slug: req.params.slug },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw new HttpError(404, 'Category not found');

  const products = await prisma.product.findMany({
    where: {
      active: true,
      categories: { some: { categoryId: category.id } },
    },
    orderBy: { priceCents: 'asc' },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  res.json({ category, products });
});

export default router;
