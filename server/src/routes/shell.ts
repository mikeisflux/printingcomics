/**
 * The page shell: the built storefront's index.html, served with the head a
 * search engine needs for THIS page — title, description, canonical,
 * Open Graph, JSON-LD — and, for the pages that matter most to search, the
 * page's words already in the body, so a crawler that does not run
 * JavaScript still reads a real page. React replaces the body on load.
 *
 * nginx hands every non-asset request here (see deploy/nginx.conf); the API
 * routes are mounted before this, so only page URLs arrive.
 */
import { Router, type Request, type Response } from 'express';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../db.js';
import {
  DEFAULT_DESCRIPTION, DEFAULT_IMAGE, DEFAULT_TITLE, SITE_NAME, absolute, breadcrumbJsonLd, escapeHtml, faqEntries, faqJsonLd,
  itemListJsonLd, jsonLdScript, organizationJsonLd, productJsonLd, siteBase, summarize, type PageHead, type SeoProduct,
} from '../lib/seo.js';
import { loadPage, PAGES, type PageProductCard } from '../lib/seo-content.js';

const router = Router();

// ---------------------------------------------------------------------------
// The built shell
// ---------------------------------------------------------------------------

const CANDIDATES = [
  process.env.WEB_DIST,
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'web/dist'),
  '/opt/printingcomics/web/dist',
  '/var/www/printingcomics/web/dist',
].filter((p): p is string => !!p);

let shellCache: { path: string; mtimeMs: number; html: string; checkedAt: number } | null = null;

export function shellPath(): string | null {
  for (const dir of CANDIDATES) if (existsSync(path.join(dir, 'index.html'))) return path.join(dir, 'index.html');
  return null;
}

async function loadShell(): Promise<string | null> {
  const file = shellPath();
  if (!file) return null;
  const now = Date.now();
  if (shellCache && shellCache.path === file && now - shellCache.checkedAt < 10_000) return shellCache.html;
  const stat = await fs.stat(file);
  if (shellCache && shellCache.path === file && shellCache.mtimeMs === stat.mtimeMs) {
    shellCache.checkedAt = now;
    return shellCache.html;
  }
  const html = await fs.readFile(file, 'utf8');
  shellCache = { path: file, mtimeMs: stat.mtimeMs, html, checkedAt: now };
  return html;
}

// ---------------------------------------------------------------------------
// Head and body injection
// ---------------------------------------------------------------------------

function headTags(base: string, h: PageHead): string {
  const image = absolute(base, h.image || DEFAULT_IMAGE)!;
  const title = escapeHtml(h.title);
  const desc = escapeHtml(h.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<link rel="canonical" href="${escapeHtml(h.canonical)}" />`,
    h.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '<meta name="robots" content="index, follow, max-image-preview:large" />',
    `<meta property="og:type" content="${h.type === 'product' ? 'product' : h.type === 'article' ? 'article' : 'website'}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:url" content="${escapeHtml(h.canonical)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:site" content="@printingcomics" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ...(h.jsonLd ?? []).filter(Boolean).map(jsonLdScript),
  ];
  return tags.join('\n    ');
}

/** Swap the shell's generic head for this page's, and seed the body. */
function render(shell: string, base: string, head: PageHead, body: string): string {
  let out = shell
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta name="description"[^>]*>\s*/gi, '')
    .replace(/<meta (?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<!-- (?:Open Graph|Twitter \/ X Card) -->\s*/g, '');
  out = out.replace('</head>', `    ${headTags(base, head)}\n  </head>`);
  if (body) out = out.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return out;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

function productCardsHtml(base: string, cards: PageProductCard[]): string {
  if (cards.length === 0) return '';
  return `<ul style="list-style:none;padding:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${cards.map((c) => `
    <li><a href="${base}/product/${escapeHtml(c.slug)}">${c.image ? `<img src="${escapeHtml(absolute(base, c.image))}" alt="${escapeHtml(c.imageAlt ?? c.name)}" width="300" height="300" loading="lazy" style="width:100%;height:auto" />` : ''}
      <strong>${escapeHtml(c.name)}</strong></a>
      ${c.shortDescription ? `<p>${escapeHtml(c.shortDescription)}</p>` : ''}
      <p><strong>${money(c.priceCents)}</strong> · ${money(c.perUnitCents)} each · ${escapeHtml(c.availability === 'InStock' ? 'In stock' : c.availability === 'BackOrder' ? 'Backorder' : 'Out of stock')}</p>
    </li>`).join('')}</ul>`;
}

function paragraphsHtml(lines: string[]): string {
  const out: string[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push(`<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`); bullets = []; } };
  for (const line of lines) {
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else { flush(); out.push(`<p>${escapeHtml(line)}</p>`); }
  }
  flush();
  return out.join('\n');
}

async function contentPageHtml(base: string, slug: string): Promise<{ head: PageHead; body: string } | null> {
  const page = await loadPage(slug);
  if (!page) return null;
  const canonical = base + page.path;
  const sections = page.sections.map((s) => `
    <section>${s.heading ? `<h2>${escapeHtml(s.heading)}</h2>` : ''}
      ${paragraphsHtml(s.body)}
      ${s.steps ? `<ol>${s.steps.map((st) => `<li><strong>${escapeHtml(st.title)}.</strong> ${escapeHtml(st.text)}</li>`).join('')}</ol>` : ''}
      ${s.products ? productCardsHtml(base, page.products[s.products] ?? []) : ''}
    </section>`).join('');
  const faq = page.faq.length ? `<section><h2>Frequently asked questions</h2>${page.faq.map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`).join('')}</section>` : '';
  const related = page.related.length ? `<nav aria-label="Related"><h2>Related</h2><ul>${page.related.map((r) => `<li><a href="${base}${escapeHtml(r.path)}">${escapeHtml(r.label)}</a></li>`).join('')}</ul></nav>` : '';
  const body = `<main class="container" style="padding:2rem 1rem;max-width:940px"><p>${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.intro)}</p>${sections}${faq}${related}</main>`;
  const allProducts = Object.values(page.products).flat();
  const jsonLd: unknown[] = [
    breadcrumbJsonLd(base, [{ name: 'Home', path: '/' }, ...(page.path.startsWith('/resources/') ? [{ name: 'Resources', path: '/resources/faq' }] : []), { name: page.title, path: page.path }]),
    faqJsonLd(page.faq),
  ];
  if (page.type === 'article') {
    jsonLd.push({
      '@context': 'https://schema.org', '@type': 'Article', headline: page.title, description: page.metaDescription,
      image: absolute(base, page.image), dateModified: page.lastReviewed, datePublished: page.lastReviewed,
      author: { '@type': 'Organization', name: SITE_NAME }, publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${base}/favicon.png` } },
      mainEntityOfPage: canonical,
    });
  } else if (allProducts.length) {
    jsonLd.push(itemListJsonLd(base, page.title, allProducts.map((c) => ({ slug: c.slug, name: c.name, priceCents: c.priceCents }))));
  }
  return {
    head: { title: `${page.metaTitle} | ${SITE_NAME}`, description: page.metaDescription, canonical, image: page.image, type: page.type, jsonLd },
    body,
  };
}

async function productPageHtml(base: string, slug: string): Promise<{ head: PageHead; body: string; status: number }> {
  const p = await prisma.product.findFirst({
    where: { slug, active: true },
    include: { images: { orderBy: { sortOrder: 'asc' } }, categories: { include: { category: true } }, stockPool: { select: { units: true } } },
  });
  if (!p) {
    return { status: 404, body: '', head: { title: `Not found | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION, canonical: `${base}/product/${encodeURIComponent(slug)}`, noindex: true } };
  }
  const sp = p as unknown as SeoProduct;
  const category = p.categories[0]?.category;
  const faq = faqEntries(p.faq);
  const title = p.seoTitle?.trim() || `${p.name} | ${SITE_NAME}`;
  const description = p.seoDescription?.trim() || summarize(p.shortDescription || p.description);
  const crumbs = [{ name: 'Home', path: '/' }, ...(category ? [{ name: category.name, path: `/shop/${category.slug}` }] : []), { name: p.name, path: `/product/${p.slug}` }];
  const body = `<main class="container" style="padding:2rem 1rem">
    <nav aria-label="Breadcrumb"><a href="${base}/">Home</a>${category ? ` › <a href="${base}/shop/${escapeHtml(category.slug)}">${escapeHtml(category.name)}</a>` : ''} › ${escapeHtml(p.name)}</nav>
    <h1>${escapeHtml(p.name)}</h1>
    ${p.images[0] ? `<img src="${escapeHtml(absolute(base, p.images[0].url))}" alt="${escapeHtml(p.images[0].alt ?? p.name)}" width="600" height="600" style="max-width:100%;height:auto" />` : ''}
    <p><strong>${money(p.priceCents)}</strong>${p.madeToOrder === false ? '' : ' — printed to order'}</p>
    ${p.shortDescription ? `<p>${escapeHtml(p.shortDescription)}</p>` : ''}
    ${(p.description ?? '').split(/\n\s*\n/).filter(Boolean).map((para) => `<p>${escapeHtml(para)}</p>`).join('')}
    ${faq.length ? `<h2>FAQ</h2>${faq.map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`).join('')}` : ''}
  </main>`;
  return {
    status: 200,
    head: {
      title, description, canonical: `${base}/product/${p.slug}`, image: p.images[0]?.url ?? null, type: 'product',
      jsonLd: [productJsonLd(base, sp), breadcrumbJsonLd(base, crumbs), faqJsonLd(faq)],
    },
    body,
  };
}

async function categoryPageHtml(base: string, slug: string): Promise<{ head: PageHead; body: string; status: number }> {
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { status: 404, body: '', head: { title: `Not found | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION, canonical: `${base}/shop/${encodeURIComponent(slug)}`, noindex: true } };
  const products = await prisma.product.findMany({
    where: { active: true, categories: { some: { categoryId: cat.id } } },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, stockPool: { select: { units: true } } },
    orderBy: { priceCents: 'asc' },
  });
  const supplies = slug === 'shipping-supplies';
  const title = supplies
    ? `Comic Armor Shipping Sleeves & Comic Book Mailers | ${SITE_NAME}`
    : `${cat.name} — Custom Printing | ${SITE_NAME}`;
  const description = supplies
    ? 'Comic Armor protective shipping sleeves and adjustable T-fold comic book mailers. Rigid, cushioned protection that gets comics, trades and graphic novels through the mail in mint condition.'
    : summarize(cat.description) || `Print ${cat.name.toLowerCase()} to order with Printing Comics: pick a trim size, paper and cover, upload your files, and get a quote with live shipping rates.`;
  const cards: PageProductCard[] = products.map((p) => ({
    slug: p.slug, name: p.name, shortDescription: p.shortDescription, priceCents: p.priceCents, units: 1, perUnitCents: p.priceCents,
    image: p.images[0]?.url ?? null, imageAlt: p.images[0]?.alt ?? null, availability: 'InStock', faq: [],
  }));
  const body = `<main class="container" style="padding:2rem 1rem"><h1>${escapeHtml(supplies ? 'Comic Armor & Comic Book Mailers' : cat.name)}</h1><p>${escapeHtml(description)}</p>${productCardsHtml(base, cards)}${supplies ? `<p><a href="${base}/comic-book-mailers">All about our comic book mailers</a> · <a href="${base}/resources/how-to-ship-comic-books">How to ship comic books</a></p>` : ''}</main>`;
  return {
    status: 200,
    head: {
      title, description, canonical: `${base}/shop/${cat.slug}`, image: cat.heroImageUrl ?? products[0]?.images[0]?.url ?? null,
      jsonLd: [breadcrumbJsonLd(base, [{ name: 'Home', path: '/' }, { name: cat.name, path: `/shop/${cat.slug}` }]), itemListJsonLd(base, cat.name, products as unknown as SeoProduct[])],
    },
    body,
  };
}

// Pages that are never for search engines.
const NOINDEX = /^\/(admin|account|cart|checkout|order|login|register|forgot-password|reset-password|proof|upload|pay)(\/|$)/;

const STATIC_META: Record<string, { title: string; description: string }> = {
  '/': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  '/shop': { title: `Shop — Comics, Graphic Novels, Prints & Shipping Supplies | ${SITE_NAME}`, description: 'Custom comic book and graphic novel printing, art prints, trading cards, comic book mailers and Comic Armor shipping sleeves.' },
  '/about': { title: `About | ${SITE_NAME}`, description: 'Printing Comics prints comics, graphic novels and trades to order for creators, publishers and crowdfunding campaigns.' },
  '/contact': { title: `Contact | ${SITE_NAME}`, description: 'Questions about a print run, a quote or an order? Get in touch with Printing Comics.' },
  '/crowdfunding': { title: `Crowdfunding Print & Fulfillment | ${SITE_NAME}`, description: 'Print and ship your Kickstarter or crowdfunded comic with Printing Comics.' },
  '/resources/make-a-comic': { title: `How to Make a Comic Book | ${SITE_NAME}`, description: 'From script to print-ready files: a guide to making a comic book.' },
  '/resources/file-prep': { title: `File Prep for Comic Printing | ${SITE_NAME}`, description: 'How to set up your cover and interior PDFs for printing: bleed, trim, resolution, color.' },
  '/resources/templates': { title: `Comic Book Templates | ${SITE_NAME}`, description: 'Free print templates for standard comic, graphic novel and trading card sizes.' },
  '/resources/faq': { title: `FAQ | ${SITE_NAME}`, description: 'Answers about printing, proofs, turnaround and shipping at Printing Comics.' },
};

export async function renderShell(req: Request, res: Response): Promise<void> {
  const shell = await loadShell();
  if (!shell) { res.status(503).type('text/plain').send('The storefront is not built yet.'); return; }
  const base = await siteBase();
  const urlPath = req.path.replace(/\/+$/, '') || '/';
  res.setHeader('Cache-Control', 'no-cache');

  let head: PageHead;
  let body = '';
  let status = 200;

  const product = urlPath.match(/^\/product\/([^/]+)$/);
  const category = urlPath.match(/^\/shop\/([^/]+)$/);
  const contentSlug = Object.values(PAGES).find((p) => p.path === urlPath)?.slug;

  if (contentSlug) {
    const page = (await contentPageHtml(base, contentSlug))!;
    head = page.head; body = page.body;
  } else if (product) {
    const page = await productPageHtml(base, decodeURIComponent(product[1]!));
    head = page.head; body = page.body; status = page.status;
  } else if (category) {
    const page = await categoryPageHtml(base, decodeURIComponent(category[1]!));
    head = page.head; body = page.body; status = page.status;
  } else {
    const meta = STATIC_META[urlPath] ?? { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
    head = { title: meta.title, description: meta.description, canonical: base + urlPath, noindex: NOINDEX.test(urlPath), jsonLd: urlPath === '/' ? organizationJsonLd(base) : [] };
  }

  res.status(status).type('html').send(render(shell, base, head, body));
}

// Express 5 has no bare "*" route; a plain middleware sees every GET.
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  // Asset-looking paths are nginx's; if one reaches us the file is missing.
  if (/\.[a-z0-9]{2,5}$/i.test(req.path) && !/\.(html?)$/i.test(req.path)) return next();
  renderShell(req, res).catch(next);
});

export default router;
