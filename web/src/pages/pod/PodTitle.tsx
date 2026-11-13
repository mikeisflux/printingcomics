/**
 * /print-on-demand/catalog/:key — one title in the catalog.
 */
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Store } from 'lucide-react';
import { useSeo } from '../../lib/seo';
import { useAuth } from '../../store/auth';
import { money, dateShort, FORMAT_LABELS } from '../../lib/pod';
import { CoverArt, CoverCard, Empty, Pill, useLoad } from '../../components/pod/ui';
import type { PublicListing } from './PodCatalog';

interface Resp { listing: PublicListing; cycle: { id: string; name: string; slug: string; status: string; catalogDate: string; focDate: string; inStoreDate: string } | null; more: PublicListing[] }

export function PodTitle() {
  const { key = '' } = useParams();
  const { data, error } = useLoad<Resp>(`/pod/catalog/${encodeURIComponent(key)}`, [key]);
  const { user } = useAuth();
  const l = data?.listing;
  useSeo(l ? { title: `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''} by ${l.partner.name} — Print On Demand`, description: (l.synopsis || l.description || `${l.title} from ${l.partner.name}, in the Printing Comics Print On Demand catalog.`).slice(0, 160) } : null, [l?.id]);

  if (error) return <div className="pod container" style={{ padding: '3rem 1.25rem' }}><Empty title="That title is not in the catalog" body={error} action={<Link to="/print-on-demand/catalog" className="pbtn primary">Back to the catalog</Link>} /></div>;
  if (!l) return <div className="pod container" style={{ padding: '3rem 1.25rem' }}><p className="dim">Loading…</p></div>;
  const name = `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}`;
  return (
    <div className="pod">
      <section className="container" style={{ padding: '1.5rem 1.25rem 3rem' }}>
        <Link to="/print-on-demand/catalog" className="pbtn ghost xs" style={{ marginBottom: '1.25rem' }}><ArrowLeft size={14} /> Catalog</Link>
        <div className="split" style={{ gridTemplateColumns: 'minmax(260px, 380px) 1fr' }}>
          <div className="rise"><CoverArt url={l.coverImageUrl} title={name} className="cover-hero" /></div>
          <div className="rise rise-1">
            <div className="row" style={{ marginBottom: '.5rem' }}>
              <Pill tone="violet" >{FORMAT_LABELS[l.format] ?? l.format}</Pill>
              {l.coverDescription && <Pill tone="slate" >{l.coverDescription}</Pill>}
              {l.incentiveRatio && <Pill tone="rose">{l.incentiveRatio} retailer incentive</Pill>}
              {l.ageRating && <Pill tone="teal" >{l.ageRating}</Pill>}
            </div>
            <h1 className="display-lg">{name}</h1>
            <p className="dim" style={{ fontSize: '1.05rem', margin: '.4rem 0 0' }}>{l.seriesName && l.seriesName !== l.title ? `${l.seriesName} · ` : ''}by <Link to={`/print-on-demand/publishers/${l.partner.slug}`} style={{ fontWeight: 600 }}>{l.partner.name}</Link></p>
            <div className="row" style={{ margin: '1.25rem 0', gap: '1rem' }}>
              <div className="display-md mono">{money(l.msrpCents)}</div><span className="dim">cover price</span>
            </div>
            <div className="row" style={{ gap: '.75rem', marginBottom: '1.5rem' }}>
              {l.productSlug && <Link to={`/product/${l.productSlug}`} className="pbtn primary"><ShoppingCart size={16} /> Buy a copy</Link>}
              {user?.retailer ? <Link to="/retailer/catalog" className="pbtn hot"><Store size={16} /> Order wholesale</Link> : <Link to="/print-on-demand/apply?as=retailer" className="pbtn soft"><Store size={16} /> Comic shop? Order at wholesale</Link>}
            </div>
            {(l.synopsis || l.description) && <div className="panel" style={{ marginBottom: '1rem' }}>{l.synopsis && <p style={{ margin: 0, fontSize: '1.02rem', lineHeight: 1.6 }}>{l.synopsis}</p>}{l.description && l.description !== l.synopsis && <p className="dim" style={{ margin: l.synopsis ? '.75rem 0 0' : 0, whiteSpace: 'pre-wrap' }}>{l.description}</p>}</div>}
            <dl className="spec panel">
              {l.writer && <><dt>Writer</dt><dd>{l.writer}</dd></>}
              {l.artist && <><dt>Artist</dt><dd>{l.artist}</dd></>}
              {l.coverArtist && <><dt>Cover artist</dt><dd>{l.coverArtist}</dd></>}
              {l.pageCount && <><dt>Pages</dt><dd>{l.pageCount}</dd></>}
              {l.trimWidthIn && l.trimHeightIn && <><dt>Trim</dt><dd>{l.trimWidthIn} × {l.trimHeightIn} in</dd></>}
              {l.interiorColor && <><dt>Interior</dt><dd>{l.interiorColor === 'bw' ? 'Black & white' : 'Full colour'}</dd></>}
              {l.genres.length > 0 && <><dt>Genres</dt><dd>{l.genres.join(', ')}</dd></>}
              <dt>Catalog id</dt><dd><span className="key">{l.catalogKey}</span></dd>
              {data?.cycle && <><dt>Catalog</dt><dd>{data.cycle.name} · FOC {dateShort(data.cycle.focDate)} · in store {dateShort(data.cycle.inStoreDate)}</dd></>}
            </dl>
          </div>
        </div>
        {data && data.more.length > 0 && (
          <section style={{ marginTop: '3rem' }}>
            <div className="section-head"><div><div className="eyebrow">More from</div><h2 className="display-md">{l.partner.name}</h2></div><Link to={`/print-on-demand/publishers/${l.partner.slug}`} className="pbtn ghost sm">Publisher page</Link></div>
            <div className="cover-grid">{data.more.map((m) => <CoverCard key={m.id} to={`/print-on-demand/catalog/${encodeURIComponent(m.catalogKey)}`} url={m.coverImageUrl} title={`${m.title}${m.issueNumber ? ` #${m.issueNumber}` : ''}`} sub={m.coverDescription ?? ''} price={money(m.msrpCents)} />)}</div>
          </section>
        )}
      </section>
    </div>
  );
}
