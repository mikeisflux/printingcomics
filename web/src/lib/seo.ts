import { useEffect } from 'react';

/**
 * Per-page head for the storefront: title, description, canonical, social
 * tags and JSON-LD, set when a page mounts and cleared when it leaves. The
 * server renders the same head into the first HTML a crawler receives
 * (server/src/routes/shell.ts); this keeps it right as the visitor moves
 * between pages without a reload.
 */
export const SITE_NAME = 'Printing Comics';
const MANAGED = 'data-seo';

export interface SeoSpec {
  /** Full <title>; the site name is appended unless `fullTitle` is set. */
  title?: string | null;
  fullTitle?: boolean;
  description?: string | null;
  /** Path or absolute URL; defaults to the current path. */
  canonical?: string | null;
  image?: string | null;
  type?: 'website' | 'product' | 'article';
  noindex?: boolean;
  jsonLd?: unknown[];
}

function origin(): string {
  return window.location.origin;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    tag.setAttribute(MANAGED, '1');
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    tag.setAttribute(MANAGED, '1');
    document.head.appendChild(tag);
  }
  tag.href = href;
}

export function applySeo(spec: SeoSpec) {
  const title = spec.title ? (spec.fullTitle ? spec.title : `${spec.title} | ${SITE_NAME}`) : SITE_NAME;
  document.title = title;
  const canonical = spec.canonical
    ? (/^https?:\/\//.test(spec.canonical) ? spec.canonical : origin() + spec.canonical)
    : origin() + window.location.pathname.replace(/\/+$/, '') || origin() + '/';
  const image = spec.image ? (/^https?:\/\//.test(spec.image) ? spec.image : origin() + spec.image) : `${origin()}/og-image.png`;
  if (spec.description) setMeta('name', 'description', spec.description);
  setLink('canonical', canonical);
  setMeta('name', 'robots', spec.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  setMeta('property', 'og:type', spec.type === 'product' ? 'product' : spec.type === 'article' ? 'article' : 'website');
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:title', title);
  if (spec.description) setMeta('property', 'og:description', spec.description);
  setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:title', title);
  if (spec.description) setMeta('name', 'twitter:description', spec.description);
  setMeta('name', 'twitter:image', image);

  for (const el of Array.from(document.head.querySelectorAll(`script[type="application/ld+json"][${MANAGED}]`))) el.remove();
  for (const data of spec.jsonLd ?? []) {
    if (!data) continue;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(MANAGED, '1');
    script.text = JSON.stringify(data).replace(/</g, '\\u003c');
    document.head.appendChild(script);
  }
  // Whatever the server rendered for the first page is stale now.
  for (const el of Array.from(document.head.querySelectorAll(`script[type="application/ld+json"]:not([${MANAGED}])`))) el.remove();
}

export function useSeo(spec: SeoSpec | null, deps: unknown[] = []) {
  useEffect(() => {
    if (spec) applySeo(spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.title, spec?.description, spec?.canonical, spec?.image, spec?.noindex, ...deps]);
}

export function breadcrumbs(crumbs: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: origin() + c.path })),
  };
}

export function faqSchema(entries: { q: string; a: string }[] | null | undefined) {
  if (!entries?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function productSchema(p: {
  slug: string; name: string; sku?: string | null; description?: string | null; shortDescription?: string | null; seoDescription?: string | null;
  priceCents: number; images?: { url: string }[]; madeToOrder?: boolean; backorder?: boolean; inStock?: number | null;
}) {
  const availability = p.madeToOrder === false
    ? (p.backorder ? 'BackOrder' : p.inStock === 0 ? 'OutOfStock' : 'InStock')
    : 'InStock';
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.images?.length ? { image: p.images.map((i) => (/^https?:\/\//.test(i.url) ? i.url : origin() + i.url)) } : {}),
    description: (p.seoDescription || p.shortDescription || p.description || '').replace(/\s+/g, ' ').slice(0, 300),
    ...(p.sku ? { sku: p.sku } : {}),
    brand: { '@type': 'Brand', name: p.slug.startsWith('comic-armor') ? 'Comic Armor' : SITE_NAME },
    url: `${origin()}/product/${p.slug}`,
    offers: {
      '@type': 'Offer',
      url: `${origin()}/product/${p.slug}`,
      priceCurrency: 'USD',
      price: (p.priceCents / 100).toFixed(2),
      availability: `https://schema.org/${availability}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
    },
  };
}
