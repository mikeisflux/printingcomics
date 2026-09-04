/**
 * /api/v1/catalog/* — read-only catalog endpoints for integrators.
 *
 * Returns the same data the storefront uses, including the full configurator
 * (options, values, pricingConfig). Designed so a crowdfunding platform can
 * render its own picker without scraping the website.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { requireApiKey } from '../../middleware/api-key.js';

const router = Router();

router.use(requireApiKey('catalog:read'));

function serializeProduct(p: any, opts: { full: boolean }) {
  const base: any = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    description: p.description,
    priceCents: p.priceCents,
    minQuantity: p.minQuantity,
    weightGrams: p.weightGrams,
    // Art prints ship by size — per-size shipping weight keyed by the
    // `print_size` option value (null for products without size pricing).
    sizeWeightsGrams:
      p.pricingConfig && typeof p.pricingConfig === 'object'
        ? (p.pricingConfig.sizeWeightsGrams ?? null)
        : null,
    madeToOrder: p.madeToOrder,
    // Orderable now, but not shipping until `backorderEta`. Surface the wait
    // to your buyer — we don't hold the rest of the order for it.
    backorder: p.backorder ?? false,
    backorderEta: p.backorderEta ?? null,
    hasVariants: p.hasVariants,
    sku: p.sku,
    templateUrl: p.templateUrl,
    image: p.images?.[0]?.url ?? null,
    images: (p.images ?? []).map((img: any) => ({
      url: img.url,
      alt: img.alt,
      sortOrder: img.sortOrder,
    })),
    categories: (p.categories ?? []).map((pc: any) => ({
      slug: pc.category.slug,
      name: pc.category.name,
    })),
  };
  if (!opts.full) return base;

  return {
    ...base,
    volumeTiers: p.volumeTiers ?? null,
    pricingConfig: p.pricingConfig ?? null,
    faq: p.faq ?? null,
    variants: (p.variants ?? []).map((v: any) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      priceCents: v.priceCents,
      stock: v.stock,
      active: v.active,
    })),
    options: (p.options ?? []).map((o: any) => ({
      id: o.id,
      name: o.name,
      internalKey: o.internalKey,
      section: o.section,
      type: o.type,
      required: o.required,
      helpText: o.helpText,
      longDescription: o.longDescription,
      sortOrder: o.sortOrder,
      dependsOnOptionId: o.dependsOnOptionId,
      dependsOnValue: o.dependsOnValue,
      values: (o.values ?? []).map((v: any) => ({
        id: v.id,
        label: v.label,
        subLabel: v.subLabel,
        imageUrl: v.imageUrl,
        priceModifierCents: v.priceModifierCents,
        sortOrder: v.sortOrder,
      })),
    })),
  };
}

const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

router.get('/products', async (req, res) => {
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
    products: slice.map((p) => serializeProduct(p, { full: false })),
    nextCursor: hasMore ? slice[slice.length - 1]?.id : null,
  });
});

router.get('/products/:slug', async (req, res) => {
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
  res.json({ product: serializeProduct(product, { full: true }) });
});

router.get('/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json({
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      iconUrl: c.iconUrl,
      heroImageUrl: c.heroImageUrl,
      productCount: c._count.products,
    })),
  });
});

router.get('/categories/:slug', async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { slug: req.params.slug },
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
      categories: { include: { category: true } },
    },
  });

  res.json({
    category: {
      slug: category.slug,
      name: category.name,
      description: category.description,
    },
    products: products.map((p) => serializeProduct(p, { full: true })),
  });
});

export default router;
