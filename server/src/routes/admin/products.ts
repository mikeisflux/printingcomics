import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

const volumeTierSchema = z.object({
  minQty: z.number().int().min(1),
  pricePerUnitCents: z.number().int().min(0),
});

const productWriteSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  hasVariants: z.boolean().optional(),
  sku: z.string().optional(),
  stock: z.number().int().min(0).optional(),
  madeToOrder: z.boolean().optional(),
  active: z.boolean().optional(),
  minQuantity: z.number().int().min(1).optional(),
  weightGrams: z.number().int().min(0).optional(),
  volumeTiers: z.array(volumeTierSchema).optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  categoryIds: z.array(z.string()).optional(),
  images: z
    .array(z.object({ url: z.string().url(), alt: z.string().optional() }))
    .optional(),
});

router.get('/', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const products = await prisma.product.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
  });
  res.json({ products });
});

router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: true,
      options: { include: { values: true } },
      categories: { include: { category: true } },
    },
  });
  if (!product) throw new HttpError(404, 'Not found');
  res.json({ product });
});

router.post('/', async (req, res) => {
  const data = productWriteSchema.parse(req.body);
  const { categoryIds, images, ...rest } = data;
  const product = await prisma.product.create({
    data: {
      ...rest,
      volumeTiers: rest.volumeTiers ?? undefined,
      categories: categoryIds
        ? { create: categoryIds.map((id) => ({ category: { connect: { id } } })) }
        : undefined,
      images: images ? { create: images.map((img, i) => ({ ...img, sortOrder: i })) } : undefined,
    },
  });
  res.json({ product });
});

router.put('/:id', async (req, res) => {
  const data = productWriteSchema.parse(req.body);
  const { categoryIds, images, ...rest } = data;
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: req.params.id },
      data: { ...rest, volumeTiers: rest.volumeTiers ?? undefined },
    });
    if (categoryIds) {
      await tx.productCategory.deleteMany({ where: { productId: req.params.id } });
      await tx.productCategory.createMany({
        data: categoryIds.map((id) => ({ productId: req.params.id, categoryId: id })),
      });
    }
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: req.params.id } });
      await tx.productImage.createMany({
        data: images.map((img, i) => ({ ...img, productId: req.params.id, sortOrder: i })),
      });
    }
  });
  const full = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { images: true, variants: true, categories: { include: { category: true } } },
  });
  res.json({ product: full });
});

router.delete('/:id', async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Variant sub-routes
const variantWriteSchema = z.object({
  sku: z.string().optional(),
  label: z.string().min(1),
  priceCents: z.number().int().min(0),
  stock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

router.post('/:id/variants', async (req, res) => {
  const data = variantWriteSchema.parse(req.body);
  const variant = await prisma.productVariant.create({
    data: { ...data, productId: req.params.id },
  });
  res.json({ variant });
});

router.put('/:id/variants/:variantId', async (req, res) => {
  const data = variantWriteSchema.parse(req.body);
  const variant = await prisma.productVariant.update({
    where: { id: req.params.variantId },
    data,
  });
  res.json({ variant });
});

router.delete('/:id/variants/:variantId', async (req, res) => {
  await prisma.productVariant.delete({ where: { id: req.params.variantId } });
  res.json({ ok: true });
});

export default router;
