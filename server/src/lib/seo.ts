/**
 * Search-engine plumbing shared by the page shell (what a crawler gets on
 * first load), the sitemap, the shopping feed and the admin SEO tools:
 * the site's public base URL, HTML escaping, and the JSON-LD objects for
 * products, pages, breadcrumbs and FAQs.
 */
import { getSetting } from './settings.js';

export const DEFAULT_BASE = 'https://printingcomics.com';
export const SITE_NAME = 'Printing Comics';
export const DEFAULT_TITLE = 'Printing Comics — Custom Comic & Graphic Novel Printing';
export const DEFAULT_DESCRIPTION = 'High-quality custom printing for comics, graphic novels and trade paperbacks, plus comic book mailers and Comic Armor shipping sleeves. Short runs and bulk orders.';
export const DEFAULT_IMAGE = '/og-image.png';

export async function siteBase(): Promise<string> {
  const v = (await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || DEFAULT_BASE;
  return v.replace(/\/$/, '');
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON-LD inside a <script> must never close it early. */
export function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

export function absolute(base: string, url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return base + (url.startsWith('/') ? url : `/${url}`);
}

/** Plain text for a description: first paragraph, no markup, trimmed to a sensible length. */
export function summarize(text: string | null | undefined, max = 158): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
}

export interface SeoProduct {
  slug: string;
  name: string;
  sku?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  priceCents: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  madeToOrder?: boolean;
  backorder?: boolean;
  stock?: number;
  trackStock?: boolean;
  stockPool?: { units: number } | null;
  unitsPerItem?: number;
  weightGrams?: number;
  images?: { url: string; alt?: string | null }[];
  faq?: unknown;
  categories?: { category: { slug: string; name: string } }[];
}

/** schema.org availability for a listing, from the same stock rules the cart uses. */
export function availabilityOf(p: SeoProduct): 'InStock' | 'BackOrder' | 'OutOfStock' | 'MadeToOrder' {
  if (p.madeToOrder !== false) return 'InStock';
  if (p.backorder) return 'BackOrder';
  if (p.stockPool) return Math.floor(Math.max(0, p.stockPool.units) / Math.max(1, p.unitsPerItem ?? 1)) > 0 ? 'InStock' : 'OutOfStock';
  if (p.trackStock) return (p.stock ?? 0) > 0 ? 'InStock' : 'OutOfStock';
  return 'InStock';
}

export function faqEntries(raw: unknown): { q: string; a: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is { q: string; a: string } => !!f && typeof (f as any).q === 'string' && typeof (f as any).a === 'string');
}

export function productJsonLd(base: string, p: SeoProduct) {
  const images = (p.images ?? []).map((i) => absolute(base, i.url)).filter(Boolean);
  const brand = p.slug.startsWith('comic-armor') ? 'Comic Armor' : SITE_NAME;
  const availability = availabilityOf(p);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(images.length ? { image: images } : {}),
    description: summarize(p.seoDescription || p.shortDescription || p.description, 300),
    ...(p.sku ? { sku: p.sku } : {}),
    brand: { '@type': 'Brand', name: brand },
    url: `${base}/product/${p.slug}`,
    offers: {
      '@type': 'Offer',
      url: `${base}/product/${p.slug}`,
      priceCurrency: 'USD',
      price: (p.priceCents / 100).toFixed(2),
      availability: `https://schema.org/${availability === 'MadeToOrder' ? 'InStock' : availability}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
    },
  };
}

export function faqJsonLd(entries: { q: string; a: string }[]) {
  if (entries.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function breadcrumbJsonLd(base: string, crumbs: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.path })),
  };
}

export function itemListJsonLd(base: string, name: string, products: SeoProduct[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/product/${p.slug}`, name: p.name })),
  };
}

export function organizationJsonLd(base: string) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: base,
      logo: `${base}/favicon.png`,
      sameAs: [],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: base,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${base}/shop?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

export interface PageHead {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
  type?: 'website' | 'product' | 'article';
  noindex?: boolean;
  jsonLd?: unknown[];
}
