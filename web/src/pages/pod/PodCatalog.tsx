/**
 * /print-on-demand/catalog — the public catalog for a cycle: every live
 * title at cover price. Shops see their wholesale price in their portal.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Store, ArrowRight } from 'lucide-react';
import { useSeo } from '../../lib/seo';
import { useAuth } from '../../store/auth';
import { money, dateShort, FORMAT_LABELS } from '../../lib/pod';
import { CoverCard, CycleTimeline, Empty, Pill, useLoad } from '../../components/pod/ui';

export interface PublicListing {
  id: string; catalogKey: string; title: string; seriesName: string | null; issueNumber: string | null; coverDescription: string | null; format: string; pageCount: number | null;
  trimWidthIn: number | null; trimHeightIn: number | null; interiorColor: string | null; msrpCents: number; description: string | null; synopsis: string | null; writer: string | null; artist: string | null;
  coverArtist: string | null; ageRating: string | null; genres: string[]; incentiveRatio: string | null; fulfillment: string; partner: { id: string; name: string; slug: string }; coverImageUrl: string | null; productSlug: string | null;
}
interface CatalogResp {
  cycle: { id: string; slug: string; name: string; status: string; statusLabel: string; catalogDate: string; focDate: string; inStoreDate: string; orderingOpen: boolean } | null;
  cycles: { id: string; slug: string; name: string; status: string; catalogDate: string }[];
  listings: PublicListing[];
}

export function PodCatalog() {
  const [params, setParams] = useSearchParams();
  const cycleSlug = params.get('cycle') ?? '';
  const { data, loading } = useLoad<CatalogResp>(`/pod/catalog${cycleSlug ? `?cycle=${encodeURIComponent(cycleSlug)}` : ''}`, [cycleSlug]);
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [publisher, setPublisher] = useState<string>('');
  const [format, setFormat] = useState<string>('');
  useSeo({ image: '/og-print-on-demand.png', title: `${data?.cycle ? `${data.cycle.name} — ` : ''}Print On Demand Catalog — Printing Comics`, description: 'Independent comics and graphic novels from publishers in the Printing Comics Print On Demand catalog, available to comic shops at wholesale.' }, [data?.cycle?.name]);

  const publishers = useMemo(() => Array.from(new Map((data?.listings ?? []).map((l) => [l.partner.id, l.partner])).values()).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const formats = useMemo(() => Array.from(new Set((data?.listings ?? []).map((l) => l.format))), [data]);
  const shown = useMemo(() => (data?.listings ?? []).filter((l) => {
    if (publisher && l.partner.id !== publisher) return false;
    if (format && l.format !== format) return false;
    if (q) { const t = q.toLowerCase(); return [l.title, l.seriesName, l.writer, l.artist, l.partner.name, l.catalogKey].some((x) => x?.toLowerCase().includes(t)); }
    return true;
  }), [data, publisher, format, q]);

  return (
    <div className="pod">
      <section className="hero-dark" style={{ padding: '3rem 0 2.25rem' }}>
        <div className="grain" />
        <div className="container">
          <div className="between" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="eyebrow rise"><Link to="/print-on-demand" style={{ textDecoration: 'none' }}>Print On Demand</Link> · Catalog</div>
              <h1 className="display-lg rise rise-1" style={{ marginTop: '.4rem' }}>{data?.cycle?.name ?? 'The catalog'}</h1>
              {data?.cycle && <div className="row rise rise-2" style={{ marginTop: '.6rem' }}>{data.cycle.orderingOpen ? <Pill tone="green" live>Ordering open until {dateShort(data.cycle.focDate)}</Pill> : <Pill tone="amber">{data.cycle.statusLabel}</Pill>}<span className="dim" style={{ fontSize: '.9rem' }}>{shown.length} of {data.listings.length} titles</span></div>}
            </div>
            {data && data.cycles.length > 1 && (
              <div className="seg rise rise-2" style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.14)' }}>
                {data.cycles.map((c) => <button key={c.id} className={data.cycle?.id === c.id ? 'on' : ''} style={data.cycle?.id === c.id ? { background: '#fff', color: '#0b0d14' } : { color: '#cfd2e6' }} onClick={() => setParams(c.slug === data.cycles[0]?.slug ? {} : { cycle: c.slug })}>{c.name}</button>)}
              </div>
            )}
          </div>
          {data?.cycle && <div className="rise rise-3" style={{ marginTop: '1.75rem', maxWidth: 720 }}><CycleTimeline catalogDate={data.cycle.catalogDate} focDate={data.cycle.focDate} inStoreDate={data.cycle.inStoreDate} compact /></div>}
        </div>
      </section>

      <section className="container" style={{ padding: '1.5rem 1.25rem 3rem' }}>
        {!user?.retailer && (
          <div className="notice info" style={{ marginBottom: '1.25rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="row"><Store size={18} /> Prices shown are cover price. Comic shops order at {`up to 50%`} off in the wholesale portal.</span>
            <Link to={user ? '/print-on-demand/apply?as=retailer' : '/login?redirect=/retailer'} className="pbtn soft sm">{user ? 'Open a wholesale account' : 'Retailer sign in'} <ArrowRight size={14} /></Link>
          </div>
        )}
        {user?.retailer && data?.cycle?.orderingOpen && (
          <div className="notice good" style={{ marginBottom: '1.25rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="row"><Store size={18} /> You are signed in as {user.retailer.name}. Order this catalog at wholesale.</span>
            <Link to="/retailer/catalog" className="pbtn primary sm">Go to wholesale ordering <ArrowRight size={14} /></Link>
          </div>
        )}
        <div className="toolbar" style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div className="search" style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--p-text-dim)' }} />
            <input className="inp" style={{ paddingLeft: '2.2rem' }} placeholder="Search titles, creators, publishers…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {formats.length > 1 && (
            <div className="seg">
              <button className={!format ? 'on' : ''} onClick={() => setFormat('')}>All formats</button>
              {formats.map((f) => <button key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{FORMAT_LABELS[f] ?? f}</button>)}
            </div>
          )}
        </div>
        {publishers.length > 1 && (
          <div className="row" style={{ marginBottom: '1.25rem' }}>
            <button className={`chip${!publisher ? ' on' : ''}`} onClick={() => setPublisher('')} style={{ cursor: 'pointer' }}>All publishers</button>
            {publishers.map((p) => <button key={p.id} className={`chip${publisher === p.id ? ' on' : ''}`} onClick={() => setPublisher(publisher === p.id ? '' : p.id)} style={{ cursor: 'pointer' }}>{p.name}</button>)}
          </div>
        )}
        {data && data.listings.length > 0 && !q && !publisher && !format && (
          <div style={{ marginBottom: '1.5rem' }}><div className="section-head" style={{ marginBottom: '.75rem' }}><div><div className="eyebrow">Newest releases</div><h2 className="display-md">Just added</h2></div></div><div className="marquee"><div className="marquee-track">{[...data.listings.slice(0, 12), ...data.listings.slice(0, 12)].map((l, i) => <CoverCard key={`${l.id}-${i}`} to={`/print-on-demand/catalog/${encodeURIComponent(l.catalogKey)}`} url={l.coverImageUrl} title={`${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}`} sub={l.partner.name} price={money(l.msrpCents)} />)}</div></div></div>
        )}
        {loading && !data ? <p className="dim">Loading the catalog…</p> : !data?.cycle ? (
          <Empty title="The first catalog is being put together" body="Publishers are listing now. Come back on the catalog date, or apply to list your own titles." action={<Link to="/print-on-demand/apply?as=publisher" className="pbtn primary">Apply as a publisher</Link>} />
        ) : shown.length === 0 ? (
          <Empty title="No titles match" body="Try another search, publisher or format." />
        ) : (
          <div className="cover-grid">
            {shown.map((l, i) => (
              <div key={l.id} className="rise" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <CoverCard
                  to={`/print-on-demand/catalog/${encodeURIComponent(l.catalogKey)}`} url={l.coverImageUrl}
                  title={`${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}`} sub={l.partner.name} price={money(l.msrpCents)}
                  tag={l.incentiveRatio ? <Pill tone="rose">{l.incentiveRatio} incentive</Pill> : l.coverDescription && !/^main/i.test(l.coverDescription) ? <Pill tone="violet" >{l.coverDescription}</Pill> : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
