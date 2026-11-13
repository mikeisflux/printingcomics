/**
 * /admin/pod/cycles/:id/print — a print-ready catalog of a cycle: every
 * live listing with cover, copy, credits, specs, catalog id and barcode.
 * Print to PDF from the browser and hand it to shops, or upload it to the
 * cycle as the designed catalog.
 */
import { useParams } from 'react-router-dom';
import { money, dateShort, FORMAT_LABELS, type Listing } from '../../../lib/pod';
import { Barcode, CoverArt, useLoad } from '../../../components/pod/ui';

export function PodCatalogPrint() {
  const { id = '' } = useParams();
  const { data } = useLoad<{ cycle: { name: string; catalogDate: string; focDate: string; inStoreDate: string }; listings: Listing[] }>(`/admin/pod/cycles/${id}`, [id]);
  if (!data) return <p className="dim" style={{ padding: '2rem' }}>Loading…</p>;
  const live = data.listings.filter((l) => ['LIVE', 'APPROVED', 'SCHEDULED'].includes(l.status)).sort((a, b) => a.partner.name.localeCompare(b.partner.name) || a.title.localeCompare(b.title));
  const byPub = new Map<string, Listing[]>();
  for (const l of live) byPub.set(l.partner.name, [...(byPub.get(l.partner.name) ?? []), l]);
  return (
    <div className="pod" style={{ background: '#fff', minHeight: '100vh' }}>
      <style>{`@media print { .no-print { display: none !important; } .pod .cat-item { break-inside: avoid; } .admin-side, .deck { display: none !important; } .admin-main { padding: 0 !important; } }`}</style>
      <div className="no-print between" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--p-line)' }}><b>Printable catalog · {live.length} titles</b><button className="pbtn primary sm" onClick={() => window.print()}>Print / save as PDF</button></div>
      <div style={{ padding: '2rem 1.5rem', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}><div className="eyebrow">Printing Comics · Print On Demand</div><h1 className="display-lg">{data.cycle.name}</h1><p className="dim">Catalog {dateShort(data.cycle.catalogDate)} · Final order cutoff {dateShort(data.cycle.focDate)} · In store {dateShort(data.cycle.inStoreDate)}</p></div>
        {[...byPub.entries()].map(([pub, ls]) => (
          <section key={pub} style={{ marginBottom: '2rem' }}>
            <h2 className="display-md" style={{ borderBottom: '2px solid var(--p-text)', paddingBottom: '.3rem' }}>{pub}</h2>
            {ls.map((l) => (
              <article key={l.id} className="cat-item" style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '1.25rem', padding: '1rem 0', borderBottom: '1px solid var(--p-line)' }}>
                <CoverArt url={l.coverImage?.url} title={l.title} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}{l.coverDescription && !/^main/i.test(l.coverDescription) ? ` — ${l.coverDescription}` : ''}</h3>
                  <div className="dim" style={{ fontSize: '.86rem', margin: '.2rem 0 .5rem' }}>{[FORMAT_LABELS[l.format], l.pageCount ? `${l.pageCount} pages` : null, l.trimWidthIn ? `${l.trimWidthIn} × ${l.trimHeightIn} in` : null, l.interiorColor === 'bw' ? 'B&W' : 'colour', l.ageRating].filter(Boolean).join(' · ')}</div>
                  {l.synopsis && <p style={{ margin: '0 0 .5rem', fontSize: '.95rem' }}>{l.synopsis}</p>}
                  <div className="dim" style={{ fontSize: '.84rem' }}>{[l.writer && `W: ${l.writer}`, l.artist && `A: ${l.artist}`, l.coverArtist && `CA: ${l.coverArtist}`].filter(Boolean).join(' · ')}</div>
                  <div className="row" style={{ marginTop: '.6rem', justifyContent: 'space-between' }}><span><b style={{ fontSize: '1.2rem' }}>{money(l.msrpCents)}</b> <span className="key">{l.catalogKey}</span>{l.incentiveRatio && <> · incentive {l.incentiveRatio}</>}</span>{(l.barcode?.code ?? l.upc) && <Barcode code={l.barcode?.code ?? l.upc!} height={44} />}</div>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
