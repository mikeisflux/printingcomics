import { Router } from 'express';
import { prisma } from '../db.js';
import { getSetting } from '../lib/settings.js';

const router = Router();

/** Dynamic sitemap.xml — includes static pages + every active product + category. */
router.get('/sitemap.xml', async (_req, res) => {
  const base = ((await getSetting<string>('store.publicUrl')) ?? 'https://printingcomics.com').replace(/\/$/, '');

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
      select: { slug: true },
    }),
  ]);

  const staticPaths = [
    '/', '/shop', '/crowdfunding', '/about', '/terms', '/contact',
    '/sample-pack',
    '/resources/make-a-comic', '/resources/file-prep', '/resources/templates', '/resources/faq',
  ];

  const urls: { loc: string; lastmod?: string; priority?: number }[] = [
    ...staticPaths.map((p) => ({ loc: base + p, priority: p === '/' ? 1.0 : 0.7 })),
    ...categories.map((c) => ({ loc: `${base}/shop/${c.slug}`, priority: 0.9 })),
    ...products.map((p) => ({
      loc: `${base}/product/${p.slug}`,
      lastmod: p.updatedAt.toISOString(),
      priority: 0.8,
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => [
      '  <url>',
      `    <loc>${u.loc}</loc>`,
      u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
      u.priority ? `    <priority>${u.priority.toFixed(1)}</priority>` : null,
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
  ].join('\n');

  res.type('application/xml').send(xml);
});

router.get('/robots.txt', async (_req, res) => {
  const base = ((await getSetting<string>('store.publicUrl')) ?? 'https://printingcomics.com').replace(/\/$/, '');
  const policy = (await getSetting<string>('seo.robotsPolicy')) ?? 'index';
  const body = policy === 'noindex'
    ? `User-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart\n\nSitemap: ${base}/sitemap.xml\n`;
  res.type('text/plain').send(body);
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
