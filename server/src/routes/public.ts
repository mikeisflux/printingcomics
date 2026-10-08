import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { loadPage } from '../lib/seo-content.js';
import seoPublic from './seo-public.js';

const router = Router();

// sitemap.xml and robots.txt moved to the site root (routes/seo-public.ts);
// the old /api/public/… addresses keep working.
router.use(seoPublic);

/** The copy of a search-landing page, with its live product cards. */
router.get('/pages/:slug', async (req, res) => {
  const page = await loadPage(String(req.params.slug));
  if (!page) throw new HttpError(404, 'Page not found');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ page });
});


/** Public shipping rates endpoint — customer's country + postal code in, available rates out. */
router.get('/shipping/rates', async (req, res) => {
  const country = (req.query.country as string | undefined)?.toUpperCase() ?? 'US';
  const zones = await prisma.shippingZone.findMany({
    include: { rates: true },
  });
  const match = zones.find((z) => z.countries.includes(country)) ?? zones.find((z) => z.countries.includes('*'));
  res.json({
    rates: (match?.rates ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      rateCents: r.rateCents,
      estimatedDays: r.estimatedDays,
    })),
  });
});

export default router;
