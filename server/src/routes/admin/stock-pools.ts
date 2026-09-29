/**
 * Shared stock: one physical pile sold through several listings.
 *
 *   GET    /admin/stock-pools          pools with their listings
 *   POST   /admin/stock-pools          { key, name, units }
 *   PUT    /admin/stock-pools/:id      { name?, units? }
 *   DELETE /admin/stock-pools/:id      listings fall back to their own stock
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

const poolSelect = {
  id: true, key: true, name: true, units: true, updatedAt: true,
  products: { select: { id: true, slug: true, name: true, unitsPerItem: true, active: true }, orderBy: { unitsPerItem: 'asc' as const } },
};

router.get('/', async (_req, res) => {
  const pools = await prisma.stockPool.findMany({ orderBy: { name: 'asc' }, select: poolSelect });
  res.json({ pools });
});

const createSchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes'),
  name: z.string().min(1).max(120),
  units: z.number().int().min(0).default(0),
});
router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  if (await prisma.stockPool.findUnique({ where: { key: data.key } })) throw new HttpError(409, 'A pool with that key already exists');
  const pool = await prisma.stockPool.create({ data, select: poolSelect });
  res.json({ pool });
});

const updateSchema = z.object({ name: z.string().min(1).max(120).optional(), units: z.number().int().min(0).optional() });
router.put('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const pool = await prisma.stockPool.update({ where: { id: String(req.params.id) }, data, select: poolSelect }).catch(() => null);
  if (!pool) throw new HttpError(404, 'Pool not found');
  res.json({ pool });
});

router.delete('/:id', async (req, res) => {
  await prisma.stockPool.delete({ where: { id: String(req.params.id) } }).catch(() => undefined);
  res.json({ ok: true });
});

export default router;
