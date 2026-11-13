/**
 * The rest of the publisher portal: the file manager, the company profile
 * and marketing assets, barcodes, ordering copies of your own books, and
 * resources. (Listings, purchase orders and statements: PublisherPortal.tsx.)
 */
import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Upload, Trash2, RotateCcw, Barcode as BarcodeIcon, Printer, FileText, Download, ExternalLink, Image as ImageIcon, Search } from 'lucide-react';
import { api } from '../../api/client';
import { money, dateShort, dateTime, fileSize, ASSET_KINDS, BARCODE_STATUS, PRODUCTION_STATUS, type PublicSettings, type PreflightResult } from '../../lib/pod';
import { Barcode, DropZone, Empty, Kpi, Pill, PreflightReport, Thumb, TonePill, errText, useFlash, useLoad } from '../../components/pod/ui';

type Me = { partner: { id: string; name: string }; settings: PublicSettings; counts: Record<string, number> };
const useMe = () => useOutletContext<{ me: Me | null; reload: () => Promise<void> }>();

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

interface FileRow { id: string; kind: string; kindLabel: string; version: number; reviewStatus: string; note: string | null; preflight: PreflightResult | null; createdAt: string; isCurrent: boolean; media: { id: string; url: string; originalName: string; size: number; mimeType: string }; listing: { id: string; title: string; issueNumber: string | null; catalogKey: string; status: string } }

export function PublisherFiles() {
  const { data, reload } = useLoad<{ files: FileRow[] }>('/pod/publisher/files');
  const { show, node } = useFlash();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [history, setHistory] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (data?.files ?? []).filter((f) => (history || f.isCurrent) && (!kind || f.kind === kind) && (!status || f.reviewStatus === status) && (!q || [f.media.originalName, f.listing.title, f.listing.catalogKey].some((x) => x.toLowerCase().includes(q.toLowerCase())))), [data, q, kind, status, history]);
  const byListing = useMemo(() => { const m = new Map<string, FileRow[]>(); for (const f of rows) { const a = m.get(f.listing.id) ?? []; a.push(f); m.set(f.listing.id, a); } return [...m.values()]; }, [rows]);
  const stats = useMemo(() => { const all = data?.files ?? []; const cur = all.filter((f) => f.isCurrent); return { files: cur.length, versions: all.length, bytes: all.reduce((s, f) => s + f.media.size, 0), rejected: cur.filter((f) => f.reviewStatus === 'rejected').length, approved: cur.filter((f) => f.reviewStatus === 'approved').length }; }, [data]);
  const act = async (f: FileRow, what: 'restore' | 'delete') => {
    try { if (what === 'restore') await api.post(`/pod/publisher/listings/${f.listing.id}/files/${f.id}/restore`); else await api.del(`/pod/publisher/listings/${f.listing.id}/files/${f.id}`); show(what === 'restore' ? `v${f.version} is current again` : 'Deleted'); await reload(); } catch (e) { show(errText(e), true); }
  };
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">Files</div><h1>Every file you've sent us</h1><div className="sub">Cover and interior PDFs, cover images and marketing files across all your titles, with every version and the checks it got. Replace a file from its listing; restore an older version here.</div></div><Link to="/publisher/assets" className="pbtn soft"><ImageIcon size={16} /> Logo &amp; marketing assets</Link></div>
      <div className="grid cols-4" style={{ marginBottom: '1rem' }}>
        <Kpi label="Current files" value={stats.files} sub={`${stats.versions} versions · ${fileSize(stats.bytes)}`} />
        <Kpi label="Approved" value={stats.approved} sub="signed off by prepress" />
        <Kpi label="Need a new file" value={stats.rejected} sub="rejected or failed checks" tone={stats.rejected ? 'hot' : undefined} />
        <Kpi label="Titles with files" value={byListing.length} dark />
      </div>
      <div className="toolbar" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}><Search size={15} style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--p-text-dim)' }} /><input className="inp" style={{ paddingLeft: '2.2rem' }} placeholder="File name, title, catalog id…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="seg">{[['', 'All kinds'], ['cover', 'Cover PDF'], ['interior', 'Interior PDF'], ['cover_image', 'Cover image'], ['marketing', 'Marketing'], ['extra', 'Extra']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k!)}>{l}</button>)}</div>
        <div className="seg">{[['', 'Any status'], ['uploaded', 'Uploaded'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k!)}>{l}</button>)}</div>
        <label className="switch"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Show every version</label>
      </div>
      {!data ? <p className="dim">Loading…</p> : byListing.length === 0 ? <Empty title="No files yet" body="Files are uploaded on each listing: cover image, cover PDF, interior PDF." action={<Link to="/publisher/listings" className="pbtn primary sm">Go to listings</Link>} /> : (
        <div className="stack">
          {byListing.map((group) => {
            const l = group[0]!.listing;
            return (
              <div className="panel" key={l.id}>
                <div className="panel-head"><h3><Link to={`/publisher/listings/${l.id}`}>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</Link> <span className="key">{l.catalogKey}</span></h3><Link to={`/publisher/listings/${l.id}`} className="pbtn ghost xs">Open listing <ExternalLink size={11} /></Link></div>
                <div className="scroll-x"><table className="ptable"><thead><tr><th>File</th><th>Kind</th><th>Version</th><th>Checks</th><th>Status</th><th>Uploaded</th><th></th></tr></thead><tbody>
                  {group.map((f) => (
                    <tr key={f.id} style={!f.isCurrent ? { opacity: .65 } : undefined}>
                      <td><a href={f.media.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{f.media.originalName}</a><div className="dim" style={{ fontSize: '.76rem' }}>{fileSize(f.media.size)} · {f.media.mimeType}</div></td>
                      <td>{f.kindLabel}</td>
                      <td className="mono">v{f.version}{f.isCurrent ? <Pill tone="violet">current</Pill> : ''}</td>
                      <td>{f.preflight ? <button className="pbtn ghost xs" onClick={() => setOpen(open === f.id ? null : f.id)}>{f.preflight.status === 'ready' ? `✓ passed` : `✕ ${f.preflight.failed} failed`}</button> : <span className="dim">—</span>}</td>
                      <td><Pill tone={f.reviewStatus === 'approved' ? 'green' : f.reviewStatus === 'rejected' ? 'red' : 'amber'}>{f.reviewStatus}</Pill>{f.note && <div className="dim" style={{ fontSize: '.76rem' }}>{f.note}</div>}</td>
                      <td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateTime(f.createdAt)}</td>
                      <td><span className="row" style={{ gap: '.3rem', justifyContent: 'flex-end' }}><a className="pbtn ghost xs" href={`${f.media.url}${f.media.url.includes('?') ? '&' : '?'}download=1`}><Download size={12} /></a>{!f.isCurrent && <button className="pbtn ghost xs" title="Make this version current" onClick={() => void act(f, 'restore')}><RotateCcw size={12} /></button>}{(l.status === 'DRAFT' || l.status === 'CHANGES_REQUESTED') && <button className="pbtn ghost xs" title="Delete" onClick={() => { if (confirm('Delete this file version?')) void act(f, 'delete'); }}><Trash2 size={12} /></button>}</span></td>
                    </tr>
                  ))}
                </tbody></table></div>
                {group.filter((f) => open === f.id).map((f) => <div key={f.id} style={{ marginTop: '.75rem' }}><PreflightReport result={f.preflight} /></div>)}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Company profile + assets
// ---------------------------------------------------------------------------

interface Profile { id: string; name: string; slug: string; contactName: string | null; contactEmail: string | null; website: string | null; phone: string | null; address: Record<string, string> | null; bio: string | null; printerInfo: string | null; payoutMethod: string | null; payoutDetails: string | null; logo: { id: string; url: string } | null }
interface Asset { id: string; kind: string; title: string | null; createdAt: string; media: { id: string; url: string; originalName: string; size: number; mimeType: string } }

export function PublisherProfile() {
  const { reload: reloadMe } = useMe();
  const { data, reload } = useLoad<{ profile: Profile; assets: Asset[] }>('/pod/publisher/profile');
  const { show, node } = useFlash();
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assetKind, setAssetKind] = useState('marketing');
  const p = data?.profile;
  const form = f ?? (p ? { contactName: p.contactName ?? '', contactEmail: p.contactEmail ?? '', website: p.website ?? '', phone: p.phone ?? '', bio: p.bio ?? '', printerInfo: p.printerInfo ?? '', payoutMethod: p.payoutMethod ?? '', payoutDetails: p.payoutDetails ?? '', line1: p.address?.line1 ?? '', line2: p.address?.line2 ?? '', city: p.address?.city ?? '', region: p.address?.region ?? '', postalCode: p.address?.postalCode ?? '' } : null);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...(form ?? {}), [k]: e.target.value });
  const save = async () => { if (!form) return; setBusy('save'); try { await api.patch('/pod/publisher/profile', { contactName: form.contactName, contactEmail: form.contactEmail || null, website: form.website, phone: form.phone, bio: form.bio, printerInfo: form.printerInfo, payoutMethod: form.payoutMethod, payoutDetails: form.payoutDetails, address: { line1: form.line1, line2: form.line2, city: form.city, region: form.region, postalCode: form.postalCode, country: 'US' } }); show('Profile saved'); setF(null); await reload(); void reloadMe(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const upload = async (kind: string, file: File) => { setBusy(kind); try { const fd = new FormData(); fd.append('kind', kind); fd.append('file', file); await api.postForm('/pod/publisher/assets', fd); show(kind === 'logo' ? 'Logo updated' : 'Uploaded'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const del = async (a: Asset) => { if (!confirm(`Delete ${a.media.originalName}?`)) return; try { await api.del(`/pod/publisher/assets/${a.id}`); await reload(); } catch (e) { show(errText(e), true); } };
  if (!p || !form) return <p className="dim">Loading…</p>;
  const assets = data!.assets.filter((a) => a.kind !== 'logo');
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">Company profile</div><h1>{p.name}</h1><div className="sub">What shops and readers see about you, how we reach you, and how you get paid.</div></div><button className="pbtn primary" disabled={busy !== null || !f} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button></div>
      <div className="split">
        <div className="stack">
          <div className="panel"><h3>Contact</h3><div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="field"><label>Contact name</label><input value={form.contactName} onChange={set('contactName')} /></div>
            <div className="field"><label>Contact email</label><input type="email" value={form.contactEmail} onChange={set('contactEmail')} /><span className="hint">Review notes, purchase orders and statements go here.</span></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
            <div className="field"><label>Website</label><input value={form.website} onChange={set('website')} placeholder="https://" /></div>
            <div className="field span-2"><label>About the imprint <span className="dim">shown on your catalog page</span></label><textarea rows={4} value={form.bio} onChange={set('bio')} /></div>
          </div></div>
          <div className="panel"><h3>Address &amp; printer</h3><div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="field span-2"><label>Mailing address</label><input value={form.line1} onChange={set('line1')} placeholder="Street" /></div>
            <div className="field span-2"><input value={form.line2} onChange={set('line2')} placeholder="Suite (optional)" aria-label="Line 2" /></div>
            <div className="field"><label>City</label><input value={form.city} onChange={set('city')} /></div>
            <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}><div className="field"><label>State</label><input value={form.region} onChange={set('region')} /></div><div className="field"><label>ZIP</label><input value={form.postalCode} onChange={set('postalCode')} /></div></div>
            <div className="field span-2"><label>Outside printer <span className="dim">if you ship titles yourself</span></label><input value={form.printerInfo} onChange={set('printerInfo')} placeholder="Who prints your publisher-shipped titles, and a contact" /></div>
          </div></div>
          <div className="panel"><h3>Payouts</h3><div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="field"><label>How you'd like to be paid</label><select value={form.payoutMethod} onChange={set('payoutMethod')}><option value="">—</option><option value="bank">Bank transfer (ACH)</option><option value="paypal">PayPal</option><option value="check">Check</option><option value="zelle">Zelle</option><option value="other">Other</option></select></div>
            <div className="field"><label>Details <span className="dim">PayPal email, payee name, last four of the account</span></label><input value={form.payoutDetails} onChange={set('payoutDetails')} /><span className="hint">Never put a full account number here; we confirm bank details by phone.</span></div>
          </div></div>
        </div>
        <aside className="stack">
          <div className="panel accent"><h3>Logo</h3>
            <div className="row" style={{ margin: '.5rem 0' }}>{p.logo ? <img src={p.logo.url} alt="" style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 12, background: '#fff', border: '1px solid var(--p-line)', padding: 6 }} /> : <div className="avatar lg" style={{ background: 'var(--p-line)', color: 'var(--p-text-dim)' }}>—</div>}<p className="dim tight" style={{ fontSize: '.84rem' }}>Shown next to your titles in the catalog and on purchase orders. PNG or SVG with a transparent background works best.</p></div>
            <DropZone compact accept="image/*" busy={busy === 'logo'} title={p.logo ? 'Replace logo' : 'Upload logo'} onFile={(file) => void upload('logo', file)} />
          </div>
          <div className="panel"><h3>Marketing &amp; press files</h3><p className="dim tight" style={{ fontSize: '.84rem', margin: '.25rem 0 .75rem' }}>Preview pages, promo images, one-sheets, press kits. Shops see marketing images; press kits are for us and media.</p>
            <div className="seg" style={{ marginBottom: '.5rem' }}>{Object.entries(ASSET_KINDS).filter(([k]) => k !== 'logo').map(([k, l]) => <button key={k} className={assetKind === k ? 'on' : ''} onClick={() => setAssetKind(k)}>{l}</button>)}</div>
            <DropZone compact accept={assetKind === 'marketing' ? 'image/*' : '*/*'} busy={busy === assetKind} title={`Upload ${ASSET_KINDS[assetKind]?.toLowerCase()}`} onFile={(file) => void upload(assetKind, file)} />
            {assets.length > 0 && <ul style={{ listStyle: 'none', padding: 0, margin: '.75rem 0 0', display: 'grid', gap: '.4rem' }}>{assets.map((a) => <li key={a.id} className="between" style={{ fontSize: '.84rem', gap: '.5rem' }}><span className="row" style={{ gap: '.5rem', minWidth: 0 }}>{/^image\//.test(a.media.mimeType) ? <img src={a.media.url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} /> : <FileText size={18} />}<span style={{ minWidth: 0 }}><a href={a.media.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{a.media.originalName}</a><div className="dim" style={{ fontSize: '.74rem' }}>{ASSET_KINDS[a.kind] ?? a.kind} · {fileSize(a.media.size)} · {dateShort(a.createdAt)}</div></span></span><button className="pbtn ghost xs" onClick={() => void del(a)} aria-label="Delete"><Trash2 size={12} /></button></li>)}</ul>}
          </div>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------

interface BarcodeRow { id: string; code: string; symbology: string; block: string | null; status: string; assignedAt: string | null; listing: { id: string; title: string; issueNumber: string | null } | null }

export function PublisherBarcodes() {
  const { data } = useLoad<{ barcodes: BarcodeRow[]; poolAvailable: number; selfAssign: boolean }>('/pod/publisher/barcodes');
  const rows = data?.barcodes ?? [];
  const reserved = rows.filter((b) => b.status === 'RESERVED');
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Barcodes</div><h1>Your barcodes</h1><div className="sub">Codes held for you and the ones already on your titles. A listing without a UPC can take one from its page with one click{data?.selfAssign ? ', from your reserved codes or the shared pool' : ' when we have reserved codes for you'}.</div></div></div>
      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <Kpi label="Reserved for you" value={reserved.length} sub="ready to assign" />
        <Kpi label="On your titles" value={rows.filter((b) => b.status === 'ASSIGNED').length} />
        <Kpi label="Shared pool" value={data ? (data.selfAssign ? data.poolAvailable : '—') : '…'} sub={data?.selfAssign ? 'free codes any publisher may use' : 'ask us to reserve codes'} dark />
      </div>
      <div className="panel flush">
        {!data ? <p className="dim" style={{ padding: '1rem' }}>Loading…</p> : rows.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No barcodes yet" body={data.selfAssign ? 'Open a listing that has no UPC and press "Get a barcode".' : 'Write to us and we will reserve a block for you.'} /></div> : (
          <table className="ptable"><thead><tr><th>Code</th><th>Type</th><th>Status</th><th>Title</th><th>Assigned</th><th></th></tr></thead><tbody>
            {rows.map((b) => <tr key={b.id}><td className="mono"><b>{b.code}</b></td><td>{b.symbology}</td><td><TonePill map={BARCODE_STATUS} status={b.status} /></td><td>{b.listing ? <Link to={`/publisher/listings/${b.listing.id}`}>{b.listing.title}{b.listing.issueNumber ? ` #${b.listing.issueNumber}` : ''}</Link> : <span className="dim">—</span>}</td><td className="dim">{dateShort(b.assignedAt)}</td><td>{b.status === 'ASSIGNED' && <a className="pbtn ghost xs" href={`/api/pod/barcode/${b.code}.svg`} download={`${b.code}.svg`}><Download size={12} /> SVG</a>}</td></tr>)}
          </tbody></table>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Print copies of your own books
// ---------------------------------------------------------------------------

interface PrintOrder { id: string; number: string; status: string; quantity: number; retailerQty: number; unitCents: number | null; totalCents: number | null; deadline: string | null; notes: string | null; createdAt: string; listing: { id: string; title: string; issueNumber: string | null; catalogKey: string }; cycle: { name: string } | null }

export function PublisherPrintOrders() {
  const { me } = useMe();
  const { data, reload } = useLoad<{ printOrders: PrintOrder[] }>('/pod/publisher/print-orders');
  const { data: ls } = useLoad<{ listings: { id: string; title: string; issueNumber: string | null; status: string; fulfillment: string; coverImage: { url: string } | null }[] }>('/pod/publisher/listings');
  const { show, node } = useFlash();
  const [listingId, setListingId] = useState('');
  const [qty, setQty] = useState('50');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<{ unitCents: number; totalCents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const eligible = (ls?.listings ?? []).filter((l) => ['APPROVED', 'SCHEDULED', 'LIVE'].includes(l.status) && l.fulfillment !== 'PARTNER_SHIPS');
  const getQuote = async () => { setQuote(null); if (!listingId || !Number(qty)) return; try { setQuote(await api.post('/pod/publisher/print-orders/quote', { listingId, quantity: Number(qty) })); } catch (e) { show(errText(e), true); } };
  const place = async () => { setBusy(true); try { const r = await api.post<{ printOrder: { number: string; addedToRun: boolean } }>('/pod/publisher/print-orders', { listingId, quantity: Number(qty), notes }); show(r.printOrder.addedToRun ? `Added to run ${r.printOrder.number}` : `Run ${r.printOrder.number} raised`); setQuote(null); setQty('50'); setNotes(''); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(false); } };
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">Print copies</div><h1>Copies for you</h1><div className="sub">Order printed copies of any approved title for conventions, your own store or press. Priced at our public per-copy rate and charged against your next payout; when a catalog run is already open for the title your copies join it.</div></div></div>
      <div className="split">
        <div className="panel flush">
          <div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Print orders</h3></div>
          {!data ? <p className="dim" style={{ padding: '1rem' }}>Loading…</p> : data.printOrders.length === 0 ? <div style={{ padding: '1rem' }}><Empty title="No print orders yet" /></div> : (
            <table className="ptable"><thead><tr><th>Run</th><th>Title</th><th className="num">Your copies</th><th className="num">Charge</th><th>Status</th><th>Placed</th></tr></thead><tbody>
              {data.printOrders.map((p) => <tr key={p.id}><td><b>{p.number}</b>{p.retailerQty > 0 && <div className="dim" style={{ fontSize: '.74rem' }}>with {p.retailerQty} shop copies{p.cycle ? ` · ${p.cycle.name}` : ''}</div>}</td><td>{p.listing.title}{p.listing.issueNumber ? ` #${p.listing.issueNumber}` : ''}</td><td className="num mono">{p.quantity}</td><td className="num mono">{p.totalCents != null ? money(p.totalCents) : '—'}</td><td><TonePill map={PRODUCTION_STATUS} status={p.status} /></td><td className="dim">{dateShort(p.createdAt)}</td></tr>)}
            </tbody></table>
          )}
        </div>
        <aside className="panel accent sticky"><h3><Printer size={16} /> Order copies</h3>
          <div className="field" style={{ marginTop: '.5rem' }}><label>Title</label><select value={listingId} onChange={(e) => { setListingId(e.target.value); setQuote(null); }}><option value="">— pick an approved title —</option>{eligible.map((l) => <option key={l.id} value={l.id}>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</option>)}</select></div>
          <div className="field" style={{ marginTop: '.5rem' }}><label>Copies</label><input type="number" min={1} value={qty} onChange={(e) => { setQty(e.target.value); setQuote(null); }} /></div>
          <div className="field" style={{ marginTop: '.5rem' }}><label>Notes <span className="dim">ship-to, deadline</span></label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="row" style={{ marginTop: '.75rem' }}><button className="pbtn soft sm" disabled={!listingId || !Number(qty)} onClick={() => void getQuote()}>Get a price</button>{quote && <b className="mono">{money(quote.unitCents)} each · {money(quote.totalCents)}</b>}</div>
          <button className="pbtn glow block" style={{ marginTop: '.75rem' }} disabled={!quote || busy} onClick={() => void place()}>{busy ? 'Placing…' : 'Place print order'}</button>
          <p className="dim" style={{ fontSize: '.76rem', marginTop: '.6rem' }}>{me?.settings.publisherTerms}</p>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Resources & support
// ---------------------------------------------------------------------------

export function PublisherResources() {
  const { me } = useMe();
  const s = me?.settings;
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Resources</div><h1>Getting your books right</h1><div className="sub">Templates, file prep, the rules of the programme, and how to reach us.</div></div></div>
      <div className="panel accent" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}><div><div className="eyebrow">Official guide</div><h3 style={{ margin: '.2rem 0' }}>Printing Comics Publisher Handbook</h3><p className="dim tight" style={{ fontSize: '.9rem' }}>Distribution policies, title submission, file preparation, catalog procedure, money, and account rules. Always the current version.</p></div><div className="row"><Link to="/print-on-demand/handbook" className="pbtn primary sm">View handbook</Link><Link to="/print-on-demand/handbook" className="pbtn ghost sm" target="_blank">Print / PDF</Link></div></div>
      <div className="grid cols-3">
        <a className="panel" href="/resources/templates" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><FileText size={20} style={{ color: 'var(--p-violet)' }} /><h3 style={{ marginTop: '.5rem' }}>Print templates</h3><p className="dim tight" style={{ fontSize: '.9rem' }}>Trim, bleed and safe-area templates for every size we print.</p></a>
        <a className="panel" href="/resources/file-prep" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Upload size={20} style={{ color: 'var(--p-violet)' }} /><h3 style={{ marginTop: '.5rem' }}>File prep guide</h3><p className="dim tight" style={{ fontSize: '.9rem' }}>Single pages, 0.125" bleed, embedded fonts, flattened images, CMYK.</p></a>
        <a className="panel" href="/resources/make-a-comic" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><BarcodeIcon size={20} style={{ color: 'var(--p-violet)' }} /><h3 style={{ marginTop: '.5rem' }}>Barcodes &amp; catalog ids</h3><p className="dim tight" style={{ fontSize: '.9rem' }}>Each cover gets one UPC. Your catalog id is SERIES-last five of the UPC. Need codes? <Link to="/publisher/barcodes">Barcodes</Link>.</p></a>
      </div>
      {s && (
        <div className="grid cols-2" style={{ marginTop: '1rem' }}>
          <div className="panel"><h3>How a cycle runs</h3><ol style={{ paddingLeft: '1.1rem', color: 'var(--p-text-dim)', fontSize: '.92rem', display: 'grid', gap: '.4rem', margin: '.5rem 0 0' }}><li>List and submit by the catalog date; we review and preflight.</li><li>Approved titles go live when the catalog publishes; shops order until final order cutoff.</li><li>At FOC we print the exact count (or send you a purchase order to ship).</li><li>Books land for the in-store date; a statement follows with your payout.</li></ol></div>
          <div className="panel"><h3>Your terms</h3><dl className="spec" style={{ marginTop: '.5rem' }}><dt>Shops pay</dt><dd>{s.tiers.map((t) => `${Math.round(t.discountBps / 100)}%`).join(' / ')} off cover by tier</dd><dt>Commission, we print</dt><dd>{(s.commissionBpsPrintedByUs / 100).toFixed(0)}%</dd><dt>Commission, you ship</dt><dd>{(s.commissionBpsPartnerShips / 100).toFixed(0)}%</dd><dt>Commission, consignment</dt><dd>{(s.commissionBpsConsignment / 100).toFixed(0)}%</dd><dt>Page counts</dt><dd>multiples of {s.pageCountStep}, {s.minPageCount}–{s.maxPageCount}</dd></dl><p className="dim" style={{ fontSize: '.84rem', marginTop: '.75rem' }}>{s.publisherTerms}</p></div>
        </div>
      )}
      <div className="panel" style={{ marginTop: '1rem', background: 'var(--p-ink)', color: '#fff', borderColor: 'transparent' }}><h3>Support</h3><p className="tight" style={{ color: 'var(--p-text-inv-dim)' }}>Questions about a review note, a file, a statement? Write to us from the <a href="/contact" style={{ color: '#fff' }}>contact page</a> or reply to any email we sent you; we answer within a business day.</p></div>
    </>
  );
}

export function ThumbList({ items }: { items: { url: string | null; title: string }[] }) {
  return <div className="row">{items.map((i, n) => <Thumb key={n} url={i.url} title={i.title} size={28} />)}</div>;
}
