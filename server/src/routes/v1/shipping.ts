/**
 * /api/v1/shipping/* — exposes the same shipping zones/rates the storefront
 * uses so integrators can pick a method before submitting an order.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireApiKey } from '../../middleware/api-key.js';

const router = Router();

router.use(requireApiKey('shipping:read'));

const ratesQuery = z.object({
  country: z.string().default('US'),
});

router.get('/rates', async (req, res) => {
  const { country } = ratesQuery.parse(req.query);
  const zones = await prisma.shippingZone.findMany({
    where: { countries: { has: country } },
    include: { rates: true },
  });
  const rates = zones.flatMap((z) =>
    z.rates.map((r) => ({
      id: r.id,
      zoneName: z.name,
      name: r.name,
      rateCents: r.rateCents,
      perKg: r.perKg,
      minSubtotalCents: r.minSubtotalCents,
      maxSubtotalCents: r.maxSubtotalCents,
      estimatedDays: r.estimatedDays,
    })),
  );
  res.json({ country, rates });
});

router.get('/zones', async (_req, res) => {
  const zones = await prisma.shippingZone.findMany({
    include: { rates: true },
    orderBy: { name: 'asc' },
  });
  res.json({
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      countries: z.countries,
      rates: z.rates.map((r) => ({
        id: r.id,
        name: r.name,
        rateCents: r.rateCents,
        estimatedDays: r.estimatedDays,
      })),
    })),
  });
});

export default router;
