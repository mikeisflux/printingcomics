/**
 * /print-on-demand/publishers/:slug — a publisher's public page: logo, bio,
 * every live title.
 */
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSeo } from '../../lib/seo';
import { money } from '../../lib/pod';
import { Avatar, CoverCard, Empty, useLoad } from '../../components/pod/ui';
import type { PublicListing } from './PodCatalog';

export function PodPublisherPage() {
  const { slug = '' } = useParams();
  const { data, error } = useLoad<{ publisher: { id: string; name: string; slug: string; website: string | null; bio: string | null; logoUrl: string | null }; listings: PublicListing[] }>(`/pod/publishers/${encodeURIComponent(slug)}`, [slug]);
  const p = data?.publisher;
  useSeo(p ? { title: `${p.name} — Print On Demand — Printing Comics`, description: (p.bio ?? `${p.name} titles in the Printing Comics Print On Demand catalog.`).slice(0, 160) } : null, [p?.id]);
  if (error) return <div className="pod container" style={{ padding: '3rem 1.25rem' }}><Empty title="Publisher not found" action={<Link to="/print-on-demand/catalog" className="pbtn primary">Catalog</Link>} /></div>;
  if (!p) return <div className="pod container" style={{ padding: '3rem 1.25rem' }}><p className="dim">Loading…</p></div>;
  return (
    <div className="pod">
      <section className="hero-dark" style={{ padding: '3rem 0 2rem' }}><div className="grain" /><div className="container">
        <Link to="/print-on-demand/catalog" className="pbtn ghost xs" style={{ marginBottom: '1rem' }}><ArrowLeft size={14} /> Catalog</Link>
        <div className="row" style={{ gap: '1.25rem', alignItems: 'center' }}>{p.logoUrl ? <img src={p.logoUrl} alt="" style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 16, background: '#fff', padding: 8 }} /> : <Avatar name={p.name} lg />}<div><div className="eyebrow">Publisher</div><h1 className="display-lg">{p.name}</h1>{p.website && <a href={p.website} target="_blank" rel="noreferrer" className="chip" style={{ marginTop: '.4rem' }}>{p.website.replace(/^https?:\/\//, '')}</a>}</div></div>
        {p.bio && <p className="lead" style={{ marginTop: '1rem' }}>{p.bio}</p>}
      </div></section>
      <section className="container" style={{ padding: '1.5rem 1.25rem 3rem' }}>
        {data.listings.length === 0 ? <Empty title="Nothing live right now" body="Their next titles appear with the next catalog." /> : <div className="cover-grid">{data.listings.map((l) => <CoverCard key={l.id} to={`/print-on-demand/catalog/${encodeURIComponent(l.catalogKey)}`} url={l.coverImageUrl} title={`${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}`} sub={l.coverDescription ?? ''} price={money(l.msrpCents)} />)}</div>}
      </section>
    </div>
  );
}
