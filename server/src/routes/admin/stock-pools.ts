/**
 * Shared stock: one physical pile sold through several listings.
 *
 *   GET    /admin/stock-pools          pools with their listings
 *   POST   /admin/stock-pools          { key, name, units, boxes? }
 *   PUT    /admin/stock-pools/:id      { name?, units?, boxes? }   boxes: [{ packageId, maxUnits }]
 *   DELETE /admin/stock-pools/:id      listings fall back to their own stock
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

const poolSelect = {
  id: true, key: true, name: true, units: true, boxes: true, updatedAt: true,
  products: { select: { id: true, slug: true, name: true, unitsPerItem: true, active: true }, orderBy: { unitsPerItem: 'asc' as const } },
};

router.get('/', async (_req, res) => {
  const pools = await prisma.stockPool.findMany({ orderBy: { name: 'asc' }, select: poolSelect });
  res.json({ pools });
});

// The boxes the pile ships in, each with how many units it holds. Checked
// against the package list so a deleted box cannot linger in the rule.
const boxesSchema = z.array(z.object({ packageId: z.string().min(1), maxUnits: z.number().int().min(1) })).max(20);
async function checkBoxes(boxes: z.infer<typeof boxesSchema>) {
  const ids = [...new Set(boxes.map((b) => b.packageId))];
  if (ids.length !== boxes.length) throw new HttpError(400, 'Each box can be listed once.');
  const found = await prisma.package.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(400, 'One of those boxes no longer exists.');
  return boxes;
}

const createSchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes'),
  name: z.string().min(1).max(120),
  units: z.number().int().min(0).default(0),
  boxes: boxesSchema.optional(),
});
router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  if (await prisma.stockPool.findUnique({ where: { key: data.key } })) throw new HttpError(409, 'A pool with that key already exists');
  const pool = await prisma.stockPool.create({
    data: { key: data.key, name: data.name, units: data.units, boxes: data.boxes ? await checkBoxes(data.boxes) : undefined },
    select: poolSelect,
  });
  res.json({ pool });
});

const updateSchema = z.object({ name: z.string().min(1).max(120).optional(), units: z.number().int().min(0).optional(), boxes: boxesSchema.optional() });
router.put('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const pool = await prisma.stockPool.update({
    where: { id: String(req.params.id) },
    data: { name: data.name, units: data.units, boxes: data.boxes ? await checkBoxes(data.boxes) : undefined },
    select: poolSelect,
  }).catch(() => null);
  if (!pool) throw new HttpError(404, 'Pool not found');
  res.json({ pool });
});

router.delete('/:id', async (req, res) => {
  await prisma.stockPool.delete({ where: { id: String(req.params.id) } }).catch(() => undefined);
  res.json({ ok: true });
});

export default router;
