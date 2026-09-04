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
  backorder: z.boolean().optional(),
  // The editor sends `yyyy-mm-dd` (or '' to clear). Anchor bare dates at noon
  // UTC so they read as the same calendar day across US timezones. Omitting
  // the field leaves the stored value alone; sending '' or null clears it.
  backorderEta: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (!v) return null;
      const d = new Date(v.includes('T') ? v : `${v}T12:00:00Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    }),
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

// --- Bulk actions ---
const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['activate', 'deactivate', 'delete', 'assign-categories']),
  categoryIds: z.array(z.string()).optional(),
});

router.post('/bulk', async (req, res) => {
  const { ids, action, categoryIds } = bulkSchema.parse(req.body);

  if (action === 'activate' || action === 'deactivate') {
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { active: action === 'activate' },
    });
    res.json({ ok: true, affected: ids.length });
    return;
  }

  if (action === 'delete') {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    res.json({ ok: true, affected: ids.length });
    return;
  }

  if (action === 'assign-categories') {
    if (!categoryIds) throw new HttpError(400, 'categoryIds required');
    await prisma.$transaction(async (tx) => {
      await tx.productCategory.deleteMany({ where: { productId: { in: ids } } });
      const rows = ids.flatMap((productId) => categoryIds.map((categoryId) => ({ productId, categoryId })));
      if (rows.length) await tx.productCategory.createMany({ data: rows });
    });
    res.json({ ok: true, affected: ids.length });
    return;
  }

  throw new HttpError(400, 'Unknown action');
});

// --- Configurator options ---
const OPTION_TYPES = ['TILES', 'RADIO', 'SELECT', 'TOGGLE', 'TEXT', 'NUMBER', 'UPLOAD', 'CONFIRM'] as const;

const optionValueWriteSchema = z.object({
  label: z.string().min(1),
  subLabel: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  priceModifierCents: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
});

const optionWriteSchema = z.object({
  name: z.string().min(1),
  internalKey: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  type: z.enum(OPTION_TYPES).optional(),
  required: z.boolean().optional(),
  helpText: z.string().optional().nullable(),
  longDescription: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  dependsOnOptionId: z.string().optional().nullable(),
  dependsOnValue: z.string().optional().nullable(),
  values: z.array(optionValueWriteSchema).optional(),
});

router.post('/:id/options', async (req, res) => {
  const data = optionWriteSchema.parse(req.body);
  const { values, ...rest } = data;
  const option = await prisma.productOption.create({
    data: {
      ...rest,
      productId: req.params.id,
      values: values ? { create: values.map((v, i) => ({ ...v, sortOrder: v.sortOrder ?? i })) } : undefined,
    },
    include: { values: true },
  });
  res.json({ option });
});

router.put('/:id/options/:optionId', async (req, res) => {
  const data = optionWriteSchema.partial().parse(req.body);
  const { values, ...rest } = data;
  const option = await prisma.productOption.update({
    where: { id: req.params.optionId },
    data: rest,
    include: { values: true },
  });
  res.json({ option });
});

router.delete('/:id/options/:optionId', async (req, res) => {
  await prisma.productOption.delete({ where: { id: req.params.optionId } });
  res.json({ ok: true });
});

router.post('/:id/options/:optionId/values', async (req, res) => {
  const data = optionValueWriteSchema.parse(req.body);
  const value = await prisma.productOptionValue.create({
    data: { ...data, optionId: req.params.optionId },
  });
  res.json({ value });
});

router.put('/:id/options/:optionId/values/:valueId', async (req, res) => {
  const data = optionValueWriteSchema.partial().parse(req.body);
  const value = await prisma.productOptionValue.update({
    where: { id: req.params.valueId },
    data,
  });
  res.json({ value });
});

router.delete('/:id/options/:optionId/values/:valueId', async (req, res) => {
  await prisma.productOptionValue.delete({ where: { id: req.params.valueId } });
  res.json({ ok: true });
});

// --- Pricing config JSON blob ---
router.put('/:id/pricing-config', async (req, res) => {
  const cfg = req.body?.pricingConfig ?? null;
  await prisma.product.update({
    where: { id: req.params.id },
    data: { pricingConfig: cfg },
  });
  res.json({ ok: true });
});

// --- FAQ JSON (array of {q, a}) ---
router.put('/:id/faq', async (req, res) => {
  const faq = req.body?.faq ?? null;
  await prisma.product.update({
    where: { id: req.params.id },
    data: { faq },
  });
  res.json({ ok: true });
});

// --- Template URL (PDF download link on product page) ---
router.put('/:id/template', async (req, res) => {
  const templateUrl = typeof req.body?.templateUrl === 'string' ? req.body.templateUrl : null;
  await prisma.product.update({
    where: { id: req.params.id },
    data: { templateUrl },
  });
  res.json({ ok: true });
});

export default router;
