import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';

const router = Router();

const schema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  heroImageUrl: z.string().optional(),
  iconUrl: z.string().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

router.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json({ categories });
});

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const category = await prisma.category.create({ data });
  res.json({ category });
});

router.put('/:id', async (req, res) => {
  const data = schema.parse(req.body);
  const category = await prisma.category.update({ where: { id: req.params.id }, data });
  res.json({ category });
});

router.delete('/:id', async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
