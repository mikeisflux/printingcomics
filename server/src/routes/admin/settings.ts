import { Router } from 'express';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { isR2Enabled, r2Test } from '../../lib/r2.js';
import { publishUpload, UPLOADS_DIR } from '../../lib/storage.js';
import {
  deleteSetting,
  invalidateSettingsCache,
  listAllSettings,
  setSetting,
  SECRET_KEYS,
} from '../../lib/settings.js';

const router = Router();

// ---- R2 object storage ----
router.post('/r2/test', async (_req, res) => {
  const result = await r2Test();
  // `error` is the field the admin client reads on a non-2xx; without it the
  // real reason gets swallowed and shown as a generic "Request failed".
  res.status(result.ok ? 200 : 400).json({ ...result, error: result.ok ? undefined : result.message });
});

/**
 * Copy every locally-stored file up to R2 and repoint its MediaFile.url.
 *
 * TEMPORARY — one-time backfill for the switch to R2. Remove this route (and
 * the button in the admin Storage tab) once the migration has been run and
 * `remaining` reports 0.
 *
 * Safe to run repeatedly: it only touches rows whose url is still
 * `/uploads/...`, uploads before repointing, and leaves the row alone on
 * failure. Batched so a huge library can't blow the request timeout — the
 * button just calls it again until `remaining` hits 0.
 */
router.post('/r2/migrate', async (req, res) => {
  if (!(await isR2Enabled())) {
    throw new HttpError(400, 'Enable R2 and save valid credentials before migrating.');
  }
  const limit = Math.min(Number(req.body?.limit) || 10, 25);

  const pending = await prisma.mediaFile.findMany({
    where: { url: { startsWith: '/uploads/' }, NOT: { tags: { has: 'missing-file' } } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let migrated = 0;
  let missing = 0;
  const failures: { id: string; name: string; error: string }[] = [];
  for (const m of pending) {
    // `/uploads/<subdir>/<file>?query` → subdir + filename on disk
    const rel = m.url.replace(/^\/uploads\//, '').split('?')[0]!;
    const subdir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const localPath = path.join(UPLOADS_DIR, rel);
    try {
      await fs.access(localPath);
    } catch {
      // The row outlived its file (deleted from disk, or restored DB without
      // the uploads dir). Tag it so it stops being retried and stops counting
      // as "still local" — the media row is kept for audit/history.
      missing++;
      await prisma.mediaFile
        .update({ where: { id: m.id }, data: { tags: { push: 'missing-file' } } })
        .catch(() => undefined);
      failures.push({ id: m.id, name: m.originalName, error: 'file missing on disk' });
      continue;
    }
    try {
      const stored = await publishUpload({
        subdir,
        filename: m.filename,
        localPath,
        contentType: m.mimeType,
        originalName: m.originalName,
      });
      if (stored.storage !== 'r2') {
        failures.push({ id: m.id, name: m.originalName, error: stored.error ?? 'upload fell back to local' });
        continue;
      }
      await prisma.mediaFile.update({ where: { id: m.id }, data: { url: stored.url } });
      migrated++;
    } catch (e: any) {
      failures.push({ id: m.id, name: m.originalName, error: e?.message ?? 'upload failed' });
    }
  }

  const remaining = await prisma.mediaFile.count({
    where: { url: { startsWith: '/uploads/' }, NOT: { tags: { has: 'missing-file' } } },
  });
  res.json({ migrated, missing, remaining, failures, scanned: pending.length });
});

/** How many files still live on local disk (drives the migrate button's label). */
router.get('/r2/status', async (_req, res) => {
  const [local, remote] = await Promise.all([
    prisma.mediaFile.count({
      where: { url: { startsWith: '/uploads/' }, NOT: { tags: { has: 'missing-file' } } },
    }),
    prisma.mediaFile.count({ where: { url: { startsWith: 'http' } } }),
  ]);
  res.json({ enabled: await isR2Enabled(), local, remote });
});

router.get('/', async (_req, res) => {
  const settings = await listAllSettings();
  res.json({ settings, secretKeys: [...SECRET_KEYS] });
});

const writeSchema = z.object({ key: z.string().min(1), value: z.any() });

router.put('/', async (req, res) => {
  const { key, value } = writeSchema.parse(req.body);
  // Ignore writes that try to mask (••••) a secret — those are the mask values
  // from list responses, not real credential updates.
  if (SECRET_KEYS.has(key) && typeof value === 'string' && /^[•]+/.test(value)) {
    return res.json({ ok: true, skipped: true });
  }
  await setSetting(key, value);
  res.json({ ok: true });
});

// Bulk update
const bulkSchema = z.object({ entries: z.array(z.object({ key: z.string(), value: z.any() })) });
router.put('/bulk', async (req, res) => {
  const { entries } = bulkSchema.parse(req.body);
  for (const e of entries) {
    if (SECRET_KEYS.has(e.key) && typeof e.value === 'string' && /^[•]+/.test(e.value)) continue;
    await setSetting(e.key, e.value);
  }
  res.json({ ok: true });
});

router.delete('/:key', async (req, res) => {
  await deleteSetting(req.params.key);
  res.json({ ok: true });
});

router.post('/refresh', async (_req, res) => {
  invalidateSettingsCache();
  res.json({ ok: true });
});

// -------- Shipping zones + rates (kept from prior version) --------
router.get('/shipping', async (_req, res) => {
  const zones = await prisma.shippingZone.findMany({ include: { rates: true } });
  res.json({ zones });
});

const zoneSchema = z.object({ name: z.string().min(1), countries: z.array(z.string()) });
router.post('/shipping/zones', async (req, res) => {
  const data = zoneSchema.parse(req.body);
  res.json({ zone: await prisma.shippingZone.create({ data }) });
});

const rateSchema = z.object({
  zoneId: z.string(),
  name: z.string().min(1),
  rateCents: z.number().int().min(0),
  perKg: z.boolean().optional(),
  minSubtotalCents: z.number().int().min(0).optional(),
  maxSubtotalCents: z.number().int().min(0).optional(),
  estimatedDays: z.string().optional(),
});
router.post('/shipping/rates', async (req, res) => {
  const data = rateSchema.parse(req.body);
  res.json({ rate: await prisma.shippingRate.create({ data }) });
});

router.delete('/shipping/rates/:id', async (req, res) => {
  await prisma.shippingRate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.delete('/shipping/zones/:id', async (req, res) => {
  await prisma.shippingZone.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// -------- Tax rates --------
router.get('/taxes', async (_req, res) => {
  res.json({ taxes: await prisma.taxRate.findMany() });
});

const taxSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  country: z.string().default('US'),
  rateBps: z.number().int().min(0).max(10_000),
});
router.post('/taxes', async (req, res) => {
  res.json({ tax: await prisma.taxRate.create({ data: taxSchema.parse(req.body) }) });
});

router.delete('/taxes/:id', async (req, res) => {
  await prisma.taxRate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// -------- Coupons --------
router.get('/coupons', async (_req, res) => {
  res.json({ coupons: await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }) });
});

const couponSchema = z.object({
  code: z.string().min(1).transform((s) => s.toUpperCase()),
  description: z.string().optional(),
  percentOffBps: z.number().int().min(0).max(10_000).nullable().optional(),
  amountOffCents: z.number().int().min(0).nullable().optional(),
  minSubtotalCents: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(0).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
});
router.post('/coupons', async (req, res) => {
  const data = couponSchema.parse(req.body);
  res.json({
    coupon: await prisma.coupon.create({
      data: { ...data, expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined },
    }),
  });
});

router.delete('/coupons/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
