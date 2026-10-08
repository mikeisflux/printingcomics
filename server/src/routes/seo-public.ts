/**
 * What search engines and shopping feeds fetch directly, served at the
 * site root (nginx hands these to the API): sitemap.xml, robots.txt and the
 * Google Merchant Center feed of the shelf products.
 */
import { Router } from 'express';
import { prisma } from '../db.js';
import { getSetting } from '../lib/settings.js';
import { PAGES } from '../lib/seo-content.js';
import { absolute, availabilityOf, escapeHtml, siteBase, summarize, type SeoProduct } from '../lib/seo.js';

const router = Router();

/** Dynamic sitemap.xml — the search-landing pages, static pages, every active product and category. */
router.get('/sitemap.xml', async (_req, res) => {
  const base = await siteBase();
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  const staticPaths = [
    '/', '/shop', '/crowdfunding', '/about', '/terms', '/contact', '/sample-pack',
    '/resources/make-a-comic', '/resources/file-prep', '/resources/templates', '/resources/faq',
  ];
  const urls: { loc: string; lastmod?: string; priority?: number; changefreq?: string }[] = [
    ...staticPaths.map((p) => ({ loc: base + p, priority: p === '/' ? 1.0 : 0.6, changefreq: 'monthly' })),
    // The pages built for search come right after the home page.
    ...Object.values(PAGES).map((p) => ({ loc: base + p.path, lastmod: p.lastReviewed, priority: 0.9, changefreq: 'weekly' })),
    ...categories.map((c) => ({ loc: `${base}/shop/${c.slug}`, lastmod: c.updatedAt.toISOString().slice(0, 10), priority: c.slug === 'shipping-supplies' ? 0.9 : 0.8, changefreq: 'weekly' })),
    ...products.map((p) => ({
      loc: `${base}/product/${p.slug}`,
      lastmod: p.updatedAt.toISOString().slice(0, 10),
      priority: /^(t-mailer|comic-armor)-/.test(p.slug) ? 0.9 : 0.7,
      changefreq: 'weekly',
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => [
      '  <url>',
      `    <loc>${escapeHtml(u.loc)}</loc>`,
      u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
      u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
      u.priority ? `    <priority>${u.priority.toFixed(1)}</priority>` : null,
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
  ].join('\n');

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(xml);
});

router.get('/robots.txt', async (_req, res) => {
  const base = await siteBase();
  const policy = (await getSetting<string>('seo.robotsPolicy')) ?? 'index';
  const body = policy === 'noindex'
    ? 'User-agent: *\nDisallow: /\n'
    : [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api',
      'Disallow: /account',
      'Disallow: /checkout',
      'Disallow: /cart',
      'Disallow: /order/',
      'Disallow: /proof/',
      'Disallow: /upload/',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('text/plain').send(body);
});

/**
 * Google Merchant Center product feed (RSS 2.0 with the g: namespace) for
 * the shelf products — mailers and Comic Armor — so they can show in Google
 * Shopping and free product listings. Submit the URL in Merchant Center.
 */
router.get('/feeds/google-shopping.xml', async (_req, res) => {
  const base = await siteBase();
  const products = await prisma.product.findMany({
    where: { active: true, madeToOrder: false },
    include: { images: { orderBy: { sortOrder: 'asc' } }, categories: { include: { category: true } }, stockPool: { select: { units: true } } },
    orderBy: { name: 'asc' },
  });
  const items = products.map((p) => {
    const sp = p as unknown as SeoProduct;
    const avail = availabilityOf(sp);
    const gAvail = avail === 'InStock' ? 'in_stock' : avail === 'BackOrder' ? 'backorder' : 'out_of_stock';
    const images = p.images.map((i) => absolute(base, i.url)!).filter(Boolean);
    const brand = p.slug.startsWith('comic-armor') ? 'Comic Armor' : 'Printing Comics';
    const category = p.categories[0]?.category.name ?? 'Shipping Supplies';
    const weightOz = p.weightGrams ? (p.weightGrams / 28.3495).toFixed(1) : null;
    return [
      '    <item>',
      `      <g:id>${escapeHtml(p.sku || p.slug)}</g:id>`,
      `      <g:title>${escapeHtml(p.seoTitle?.replace(/\s*\|\s*Printing Comics$/, '') || p.name)}</g:title>`,
      `      <g:description>${escapeHtml(summarize(p.seoDescription || p.shortDescription || p.description, 5000))}</g:description>`,
      `      <g:link>${escapeHtml(`${base}/product/${p.slug}`)}</g:link>`,
      ...(images[0] ? [`      <g:image_link>${escapeHtml(images[0])}</g:image_link>`] : []),
      ...images.slice(1, 10).map((u) => `      <g:additional_image_link>${escapeHtml(u)}</g:additional_image_link>`),
      `      <g:availability>${gAvail}</g:availability>`,
      `      <g:price>${(p.priceCents / 100).toFixed(2)} USD</g:price>`,
      `      <g:brand>${escapeHtml(brand)}</g:brand>`,
      '      <g:condition>new</g:condition>',
      '      <g:identifier_exists>no</g:identifier_exists>',
      `      <g:product_type>${escapeHtml(category)}</g:product_type>`,
      ...(weightOz ? [`      <g:shipping_weight>${weightOz} oz</g:shipping_weight>`] : []),
      '    </item>',
    ].join('\n');
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>Printing Comics — Shipping Supplies</title>',
    `    <link>${escapeHtml(base)}</link>`,
    '    <description>Comic book mailers and Comic Armor shipping sleeves from Printing Comics.</description>',
    ...items,
    '  </channel>',
    '</rss>',
  ].join('\n');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.type('application/xml').send(xml);
});

export default router;
