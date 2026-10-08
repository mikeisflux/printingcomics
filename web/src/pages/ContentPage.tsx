import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { ResourcePage } from './resources/ResourceLayout';
import { breadcrumbs, faqSchema, useSeo } from '../lib/seo';

/**
 * A search-landing page whose words come from the API (the same words the
 * server renders for crawlers), with live product cards where the copy asks
 * for them. Used for /comic-book-mailers and the shipping guide.
 */

interface Card {
  slug: string; name: string; shortDescription: string | null; priceCents: number;
  units: number; perUnitCents: number; image: string | null; imageAlt: string | null; availability: string;
}
interface Section { heading?: string; body: string[]; steps?: { title: string; text: string }[]; products?: 'mailers' | 'armor' }
interface Page {
  slug: string; path: string; eyebrow: string; title: string; metaTitle: string; metaDescription: string; intro: string;
  sections: Section[]; faq: { q: string; a: string }[]; related: { label: string; path: string }[]; image: string;
  type: 'website' | 'article'; lastReviewed: string; products: Record<string, Card[]>;
}

function Paragraphs({ lines }: { lines: string[] }) {
  const out: ReactElement[] = [];
  let bullets: string[] = [];
  const flush = (key: number) => {
    if (bullets.length) { out.push(<ul key={`u${key}`} style={{ lineHeight: 1.7 }}>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>); bullets = []; }
  };
  lines.forEach((line, i) => {
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else { flush(i); out.push(<p key={i} style={{ lineHeight: 1.7 }}>{line}</p>); }
  });
  flush(lines.length);
  return <>{out}</>;
}

function ProductCards({ cards, line }: { cards: Card[]; line: 'mailers' | 'armor' }) {
  if (cards.length === 0) return null;
  const unit = line === 'mailers' ? 'mailer' : 'sleeve';
  return (
    <div data-testid={`cards-${line}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem', margin: '1rem 0 1.5rem' }}>
      {cards.map((c) => (
        <Link key={c.slug} to={`/product/${c.slug}`} className="admin-card" style={{ margin: 0, textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
          {c.image && <img src={c.image} alt={c.imageAlt ?? c.name} width={300} height={300} loading="lazy" decoding="async" style={{ width: '100%', height: 'auto', borderRadius: 6, aspectRatio: '1', objectFit: 'cover' }} />}
          <strong style={{ marginTop: '.5rem' }}>{c.name}</strong>
          <span className="muted" style={{ fontSize: '.85rem', flex: 1 }}>{c.units} {unit}{c.units === 1 ? '' : 's'}</span>
          <span style={{ marginTop: '.4rem' }}>
            <strong style={{ color: 'var(--brand)', fontSize: '1.1rem' }}>{formatMoney(c.priceCents)}</strong>
            <span className="muted" style={{ fontSize: '.85rem' }}> · {formatMoney(c.perUnitCents)} per {unit}</span>
          </span>
          <span style={{ fontSize: '.8rem', color: c.availability === 'InStock' ? '#166534' : '#b45309', fontWeight: 600 }}>
            {c.availability === 'InStock' ? 'In stock' : c.availability === 'BackOrder' ? 'Backorder' : 'Out of stock'}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function ContentPage({ slug }: { slug: string }) {
  const params = useParams();
  const key = slug || params.slug || '';
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(null); setError(null);
    api.get<{ page: Page }>(`/public/pages/${key}`).then((r) => setPage(r.page)).catch((e: any) => setError(e?.message ?? 'Could not load this page'));
  }, [key]);

  useSeo(page ? {
    title: page.metaTitle,
    description: page.metaDescription,
    canonical: page.path,
    image: page.image,
    type: page.type,
    jsonLd: [
      breadcrumbs([{ name: 'Home', path: '/' }, ...(page.path.startsWith('/resources/') ? [{ name: 'Resources', path: '/resources/faq' }] : []), { name: page.title, path: page.path }]),
      faqSchema(page.faq),
    ],
  } : null, [page?.slug]);

  if (error) return <div className="container" style={{ padding: '2rem 1rem' }}><div className="error">{error}</div></div>;
  if (!page) return <div className="container" style={{ padding: '2rem 1rem' }}><p className="muted">Loading…</p></div>;

  return (
    <ResourcePage eyebrow={page.eyebrow} title={page.title} intro={page.intro}>
      {page.sections.map((s, i) => (
        <section key={i} style={{ marginBottom: '2rem' }}>
          {s.heading && <h2 style={{ marginBottom: '.5rem' }}>{s.heading}</h2>}
          <Paragraphs lines={s.body} />
          {s.steps && (
            <ol style={{ lineHeight: 1.7, paddingLeft: '1.25rem' }}>
              {s.steps.map((st) => <li key={st.title} style={{ marginBottom: '.4rem' }}><strong>{st.title}.</strong> {st.text}</li>)}
            </ol>
          )}
          {s.products && <ProductCards cards={page.products[s.products] ?? []} line={s.products} />}
        </section>
      ))}

      {page.faq.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2>Frequently asked questions</h2>
          {page.faq.map((f) => (
            <details key={f.q} className="admin-card" style={{ padding: '.75rem 1rem', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 600 }}>{f.q}</summary>
              <p style={{ marginTop: '.5rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {page.related.length > 0 && (
        <nav aria-label="Related" className="admin-card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Related</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.8 }}>
            {page.related.map((r) => <li key={r.path}><Link to={r.path}>{r.label}</Link></li>)}
          </ul>
        </nav>
      )}
    </ResourcePage>
  );
}
