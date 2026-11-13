/**
 * The remaining admin section pages: returns, the files desk, barcodes,
 * inventory, analytics and the activity log.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Check, Ban, PackageCheck, Coins, RefreshCw, Trash2, Barcode as BarcodeIcon, Plus, Download } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, dateTime, fileSize, pct, RETURN_STATUS, BARCODE_STATUS, ASSET_KINDS, type PodEvent, type PreflightResult } from '../../../lib/pod';
import { Barcode, Bars, Drawer, Empty, Kpi, Pill, PreflightReport, Thumb, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

interface Ret { id: string; number: string; status: string; kind: string; quantity: number; unitCreditCents: number; creditCents: number; reason: string; reviewNote: string | null; createdAt: string; decidedAt: string | null; retailer: { id: string; name: string }; order: { id: string; number: string; cycle: { name: string } | null }; listing: { id: string; title: string; catalogKey: string; partner: { id: string; name: string } } | null }

export function PodReturns() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const { data, reload } = useLoad<{ returns: Ret[]; counts: Record<string, number> }>(`/admin/pod/returns?status=${status === 'all' ? '' : status}`, [status]);
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (r: Ret, st: 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'CREDITED') => {
    let creditCents: number | null = null; let note: string | null = null;
    if (st === 'APPROVED' || st === 'CREDITED') { const v = window.prompt('Credit to the shop ($)', (r.creditCents / 100).toFixed(2)); if (v === null) return; creditCents = Math.round(Number(v) * 100); }
    if (st === 'REJECTED') { note = window.prompt('Why? (the shop sees this)'); if (note === null) return; }
    setBusy(r.id);
    try { await api.post(`/admin/pod/returns/${r.id}/decide`, { status: st, creditCents, note }); show(st === 'CREDITED' ? 'Credited to the shop and charged to the publisher' : 'Done'); await reload(); void reloadOverview(); } catch (e) { show(errText(e), true); } finally { setBusy(null); }
  };
  const counts = data?.counts ?? {};
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Requested" value={counts.REQUESTED ?? 0} sub="waiting for a decision" tone="hot" />
        <Kpi label="Approved" value={counts.APPROVED ?? 0} sub="copies on their way back" />
        <Kpi label="Received" value={counts.RECEIVED ?? 0} sub="ready to credit" />
        <Kpi label="Credited" value={counts.CREDITED ?? 0} sub={`${money((data?.returns ?? []).filter((r) => r.status === 'CREDITED').reduce((s, r) => s + r.creditCents, 0))} in this list`} dark />
      </div>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Returns &amp; damage claims</h2><div className="dim" style={{ fontSize: '.88rem' }}>Approve → (receive the copies) → credit. Credit becomes store credit on the shop's next order and a return charge on the publisher's ledger.</div></div>
        <div className="seg"><button className={status === 'open' ? 'on' : ''} onClick={() => setParams({ status: 'open' })}>Open</button>{Object.keys(RETURN_STATUS).map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams({ status: k })}>{RETURN_STATUS[k]!.label} <span className="n">{counts[k] ?? 0}</span></button>)}<button className={status === 'all' ? 'on' : ''} onClick={() => setParams({ status: 'all' })}>All</button></div></div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.returns.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No claims" body="Shops file them from Returns & damages in their portal." /></div> : (
          <table className="ptable"><thead><tr><th>Claim</th><th>Shop</th><th>Order</th><th>Title</th><th>Reason</th><th className="num">Copies</th><th className="num">Credit</th><th>Status</th><th></th></tr></thead><tbody>
            {data.returns.map((r) => <tr key={r.id}><td><b>{r.number}</b><div className="dim" style={{ fontSize: '.74rem' }}>{r.kind} · {dateShort(r.createdAt)}</div></td><td><Link to={`/admin/pod/retailers/${r.retailer.id}`}>{r.retailer.name}</Link></td><td><Link to={`/admin/pod/orders?open=${r.order.id}`}>{r.order.number}</Link><div className="dim" style={{ fontSize: '.74rem' }}>{r.order.cycle?.name}</div></td><td>{r.listing ? <Link to={`/admin/pod/listings/${r.listing.id}`}>{r.listing.title}</Link> : '—'}<div className="dim" style={{ fontSize: '.74rem' }}>{r.listing?.partner.name}</div></td><td style={{ fontSize: '.84rem', maxWidth: 260 }}>{r.reason}{r.reviewNote && <div className="dim">Note: {r.reviewNote}</div>}</td><td className="num mono">{r.quantity}</td><td className="num mono">{money(r.creditCents)}</td><td><TonePill map={RETURN_STATUS} status={r.status} /></td>
              <td><span className="row" style={{ gap: '.3rem' }}>{r.status === 'REQUESTED' && <><button className="pbtn glow xs" disabled={busy === r.id} onClick={() => void decide(r, 'APPROVED')}><Check size={12} /> Approve</button><button className="pbtn danger xs" disabled={busy === r.id} onClick={() => void decide(r, 'REJECTED')}><Ban size={12} /></button></>}{r.status === 'APPROVED' && <button className="pbtn soft xs" disabled={busy === r.id} onClick={() => void decide(r, 'RECEIVED')}><PackageCheck size={12} /> Received</button>}{(r.status === 'APPROVED' || r.status === 'RECEIVED') && <button className="pbtn primary xs" disabled={busy === r.id} onClick={() => void decide(r, 'CREDITED')}><Coins size={12} /> Credit</button>}</span></td></tr>)}
          </tbody></table>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Files desk
// ---------------------------------------------------------------------------

interface FileRow { id: string; kind: string; kindLabel: string; version: number; reviewStatus: string; note: string | null; preflight: PreflightResult | null; createdAt: string; isCurrent: boolean; media: { id: string; url: string; originalName: string; size: number; mimeType: string }; listing: { id: string; title: string; issueNumber: string | null; catalogKey: string; status: string; partner: { id: string; name: string } } }
interface Asset { id: string; kind: string; title: string | null; createdAt: string; media: { id: string; url: string; originalName: string; size: number; mimeType: string }; partner: { id: string; name: string } }

export function PodFiles() {
  const [kind, setKind] = useState(''); const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [history, setHistory] = useState(false); const [partnerId, setPartnerId] = useState('');
  const { data, reload } = useLoad<{ files: FileRow[]; stats: { versions: number; mediaFiles: number; bytes: number; byKind: Record<string, number>; byStatus: Record<string, number>; assets: number } }>(`/admin/pod/files?kind=${kind}&status=${status}&q=${encodeURIComponent(q)}&current=${history ? 0 : 1}&partnerId=${partnerId}`, [kind, status, q, history, partnerId]);
  const { data: pubs } = useLoad<{ publishers: { id: string; name: string }[] }>('/admin/pod/publishers');
  const { data: assets } = useLoad<{ assets: Asset[] }>('/admin/pod/assets');
  const { show, node } = useFlash();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<FileRow | null>(null);
  const [tab, setTab] = useState<'files' | 'assets'>('files');
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = async (action: string) => {
    const note = action === 'reject' ? window.prompt('Note for the publisher (shown on each file)') : null; if (action === 'reject' && note === null) return;
    if (action === 'delete' && !confirm(`Delete ${sel.size} file version(s) for good?`)) return;
    try { const r = await api.post<{ results: { ok: boolean; error?: string }[] }>('/admin/pod/files/bulk', { ids: [...sel], action, note }); const bad = r.results.filter((x) => !x.ok); show(bad.length ? `${r.results.length - bad.length} done, ${bad.length} failed: ${bad[0]!.error}` : `${r.results.length} file(s) ${action}d`, bad.length > 0); setSel(new Set()); await reload(); } catch (e) { show(errText(e), true); }
  };
  const st = data?.stats;
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="File versions" value={st?.versions ?? '—'} sub={`${st ? fileSize(st.bytes) : ''} on disk · ${st?.mediaFiles ?? 0} stored objects`} />
        <Kpi label="Awaiting review" value={st?.byStatus.uploaded ?? 0} sub={`${st?.byStatus.approved ?? 0} approved · ${st?.byStatus.rejected ?? 0} rejected`} tone="hot" />
        <Kpi label="Print PDFs" value={(st?.byKind.cover ?? 0) + (st?.byKind.interior ?? 0)} sub={`${st?.byKind.cover_image ?? 0} cover images · ${st?.byKind.marketing ?? 0} marketing`} />
        <Kpi label="Publisher assets" value={st?.assets ?? 0} sub="logos, marketing, press kits" dark />
      </div>
      <div className="toolbar">
        <div className="seg"><button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>Listing files</button><button className={tab === 'assets' ? 'on' : ''} onClick={() => setTab('assets')}>Publisher assets <span className="n">{assets?.assets.length ?? 0}</span></button></div>
        {tab === 'files' && <div className="row">
          <div className="search"><Search size={15} /><input className="inp" placeholder="File, title, catalog id…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="inp" style={{ width: 'auto' }} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">All publishers</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select className="inp" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option><option value="cover">Cover PDF</option><option value="interior">Interior PDF</option><option value="cover_image">Cover image</option><option value="marketing">Marketing</option><option value="extra">Extra</option></select>
          <select className="inp" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="uploaded">Uploaded</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
          <label className="switch"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Every version</label>
        </div>}
      </div>
      {tab === 'files' ? (
        <>
          {sel.size > 0 && <div className="notice info" style={{ marginBottom: '.75rem', justifyContent: 'space-between', alignItems: 'center' }}><span>{sel.size} selected</span><span className="row"><button className="pbtn glow xs" onClick={() => void bulk('approve')}><Check size={12} /> Approve</button><button className="pbtn danger xs" onClick={() => void bulk('reject')}><Ban size={12} /> Reject</button><button className="pbtn ghost xs" onClick={() => void bulk('preflight')}><RefreshCw size={12} /> Re-run checks</button><button className="pbtn ghost xs" onClick={() => void bulk('reset')}>Reset to uploaded</button><button className="pbtn ghost xs" onClick={() => void bulk('delete')}><Trash2 size={12} /> Delete</button><button className="pbtn ghost xs" onClick={() => setSel(new Set())}>Clear</button></span></div>}
          <div className="panel flush scroll-x">
            {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.files.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No files match" /></div> : (
              <table className="ptable"><thead><tr><th><input type="checkbox" checked={sel.size === data.files.length} onChange={(e) => setSel(e.target.checked ? new Set(data.files.map((f) => f.id)) : new Set())} aria-label="Select all" /></th><th>File</th><th>Title</th><th>Publisher</th><th>Kind</th><th>Ver</th><th>Checks</th><th>Status</th><th>Uploaded</th></tr></thead><tbody>
                {data.files.map((f) => <tr key={f.id} style={!f.isCurrent ? { opacity: .65 } : undefined}><td><input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} aria-label="Select" /></td><td><a href={f.media.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{f.media.originalName}</a><div className="dim" style={{ fontSize: '.74rem' }}>{fileSize(f.media.size)} · {f.media.mimeType}</div></td><td><Link to={`/admin/pod/listings/${f.listing.id}`}>{f.listing.title}{f.listing.issueNumber ? ` #${f.listing.issueNumber}` : ''}</Link><div className="dim" style={{ fontSize: '.74rem' }}><span className="key">{f.listing.catalogKey}</span></div></td><td className="dim" style={{ fontSize: '.84rem' }}>{f.listing.partner.name}</td><td>{f.kindLabel}</td><td className="mono">v{f.version}{f.isCurrent && <Pill tone="violet">current</Pill>}</td><td>{f.preflight ? <button className="pbtn ghost xs" onClick={() => setOpen(f)}>{f.preflight.status === 'ready' ? '✓ passed' : `✕ ${f.preflight.failed} failed`}</button> : <span className="dim">—</span>}</td><td><Pill tone={f.reviewStatus === 'approved' ? 'green' : f.reviewStatus === 'rejected' ? 'red' : 'amber'}>{f.reviewStatus}</Pill>{f.note && <div className="dim" style={{ fontSize: '.72rem' }}>{f.note}</div>}</td><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateTime(f.createdAt)}</td></tr>)}
              </tbody></table>
            )}
          </div>
        </>
      ) : (
        <div className="panel flush scroll-x">{!assets ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : assets.assets.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No publisher assets yet" /></div> : <table className="ptable"><thead><tr><th>File</th><th>Publisher</th><th>Kind</th><th>Size</th><th>Added</th></tr></thead><tbody>{assets.assets.map((a) => <tr key={a.id}><td><span className="row">{/^image\//.test(a.media.mimeType) && <img src={a.media.url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />}<a href={a.media.url} target="_blank" rel="noreferrer">{a.media.originalName}</a></span></td><td><Link to={`/admin/pod/publishers/${a.partner.id}`}>{a.partner.name}</Link></td><td>{ASSET_KINDS[a.kind] ?? a.kind}</td><td className="dim">{fileSize(a.media.size)}</td><td className="dim">{dateShort(a.createdAt)}</td></tr>)}</tbody></table>}</div>
      )}
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.media.originalName ?? ''}>{open && <PreflightReport result={open.preflight} />}</Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------

interface BarcodeRow { id: string; code: string; symbology: string; block: string | null; status: string; notes: string | null; assignedAt: string | null; createdAt: string; partner: { id: string; name: string } | null; listing: { id: string; title: string; issueNumber: string | null; catalogKey: string } | null }

export function PodBarcodes() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? ''; const partnerId = params.get('partnerId') ?? ''; const block = params.get('block') ?? '';
  const [q, setQ] = useState('');
  const { data, reload } = useLoad<{ barcodes: BarcodeRow[]; counts: Record<string, number>; blocks: { block: string | null; count: number }[] }>(`/admin/pod/barcodes?status=${status}&partnerId=${partnerId}&block=${encodeURIComponent(block)}&q=${encodeURIComponent(q)}`, [status, partnerId, block, q]);
  const { data: pubs } = useLoad<{ publishers: { id: string; name: string }[] }>('/admin/pod/publishers');
  const { show, node } = useFlash();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'range' | 'list'>('range');
  const [f, setF] = useState({ prefix: '', start: '1', count: '100', symbology: 'UPC-A', codes: '', block: '', partnerId: '', notes: '' });
  const [preview, setPreview] = useState<{ first: string[]; last: string; count: number } | null>(null);
  const [reserve, setReserve] = useState({ partnerId: '', count: '10' });
  const [busy, setBusy] = useState<string | null>(null);
  const doPreview = async () => { try { setPreview(await api.post('/admin/pod/barcodes/preview', { prefix: f.prefix, start: Number(f.start), count: Number(f.count), symbology: f.symbology })); } catch (e) { show(errText(e), true); } };
  const load = async () => { setBusy('load'); try { const r = await api.post<{ loaded: number; skipped: number }>('/admin/pod/barcodes/blocks', { mode, prefix: f.prefix, start: Number(f.start), count: Number(f.count), symbology: f.symbology, codes: f.codes, block: f.block || null, partnerId: f.partnerId || null, notes: f.notes || null }); show(`${r.loaded} codes loaded${r.skipped ? `, ${r.skipped} already known` : ''}`); setLoading(false); setPreview(null); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const act = async (b: BarcodeRow, path: string, body?: unknown) => { setBusy(b.id); try { await api.post(`/admin/pod/barcodes/${b.id}/${path}`, body); show('Done'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const reserveBulk = async () => { setBusy('reserve'); try { const r = await api.post<{ reserved: number }>('/admin/pod/barcodes/reserve-bulk', { partnerId: reserve.partnerId, count: Number(reserve.count), block: block || null }); show(`${r.reserved} codes reserved`); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const counts = data?.counts ?? {};
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Free" value={counts.AVAILABLE ?? 0} sub="in the shared pool" />
        <Kpi label="Reserved" value={counts.RESERVED ?? 0} sub="held for a publisher" />
        <Kpi label="On titles" value={counts.ASSIGNED ?? 0} sub="assigned to a listing" />
        <Kpi label="Retired" value={counts.RETIRED ?? 0} sub="never reused" dark />
      </div>
      <div className="toolbar">
        <div><h2 className="display-md" style={{ margin: 0 }}><BarcodeIcon size={22} style={{ verticalAlign: '-4px' }} /> Barcodes</h2><div className="dim" style={{ fontSize: '.88rem' }}>Load the blocks you bought, hold some for a publisher, put one on a title. Check digits are computed. A title's catalog id follows its UPC while it is a draft.</div></div>
        <div className="row"><div className="search"><Search size={15} /><input className="inp" placeholder="Code, block, title…" value={q} onChange={(e) => setQ(e.target.value)} /></div><button className="pbtn primary sm" onClick={() => setLoading(true)}><Plus size={14} /> Load a block</button></div>
      </div>
      <div className="toolbar" style={{ marginTop: '-.25rem' }}>
        <div className="seg"><button className={!status ? 'on' : ''} onClick={() => setParams({ partnerId, block })}>All</button>{Object.keys(BARCODE_STATUS).map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams({ status: k, partnerId, block })}>{BARCODE_STATUS[k]!.label} <span className="n">{counts[k] ?? 0}</span></button>)}</div>
        <div className="row"><select className="inp" style={{ width: 'auto' }} value={partnerId} onChange={(e) => setParams({ status, partnerId: e.target.value, block })}><option value="">Any publisher</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select className="inp" style={{ width: 'auto' }} value={block} onChange={(e) => setParams({ status, partnerId, block: e.target.value })}><option value="">Any block</option>{(data?.blocks ?? []).map((b) => <option key={b.block ?? 'none'} value={b.block ?? ''}>{b.block ?? '(no block)'} · {b.count}</option>)}</select></div>
      </div>
      <div className="panel tight" style={{ marginBottom: '1rem' }}><div className="row"><b style={{ fontSize: '.86rem' }}>Reserve a batch for a publisher:</b><select className="inp" style={{ width: 'auto' }} value={reserve.partnerId} onChange={(e) => setReserve((x) => ({ ...x, partnerId: e.target.value }))}><option value="">— publisher —</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input className="inp mono" style={{ width: 90 }} type="number" min={1} value={reserve.count} onChange={(e) => setReserve((x) => ({ ...x, count: e.target.value }))} /><button className="pbtn soft sm" disabled={!reserve.partnerId || busy === 'reserve'} onClick={() => void reserveBulk()}>Reserve from the free pool{block ? ` (${block})` : ''}</button></div></div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.barcodes.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No barcodes loaded" body="Load the block you bought from GS1 or a reseller: a prefix plus a start and count, or paste the list." action={<button className="pbtn primary sm" onClick={() => setLoading(true)}><Plus size={14} /> Load a block</button>} /></div> : (
          <table className="ptable"><thead><tr><th>Code</th><th>Type</th><th>Block</th><th>Status</th><th>Publisher</th><th>Title</th><th>Since</th><th></th></tr></thead><tbody>
            {data.barcodes.map((b) => <tr key={b.id}><td className="mono"><b>{b.code}</b></td><td>{b.symbology}</td><td className="dim">{b.block ?? '—'}</td><td><TonePill map={BARCODE_STATUS} status={b.status} /></td><td>{b.partner ? <Link to={`/admin/pod/publishers/${b.partner.id}`}>{b.partner.name}</Link> : <span className="dim">—</span>}</td><td>{b.listing ? <Link to={`/admin/pod/listings/${b.listing.id}`}>{b.listing.title}{b.listing.issueNumber ? ` #${b.listing.issueNumber}` : ''}</Link> : <span className="dim">—</span>}</td><td className="dim">{dateShort(b.assignedAt ?? b.createdAt)}</td>
              <td><span className="row" style={{ gap: '.3rem', justifyContent: 'flex-end' }}>{b.status === 'ASSIGNED' && <><a className="pbtn ghost xs" href={`/api/pod/barcode/${b.code}.svg`} download><Download size={12} /></a><button className="pbtn ghost xs" disabled={busy === b.id} onClick={() => { if (confirm(`Take ${b.code} off ${b.listing?.title}?`)) void act(b, 'release'); }}>Release</button></>}{b.status === 'AVAILABLE' && <select className="inp" style={{ width: 'auto', padding: '.25rem .5rem', fontSize: '.78rem' }} value="" onChange={(e) => { if (e.target.value) void act(b, 'reserve', { partnerId: e.target.value }); }}><option value="">Reserve for…</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}{b.status === 'RESERVED' && <button className="pbtn ghost xs" disabled={busy === b.id} onClick={() => void act(b, 'reserve', { partnerId: null })}>Unreserve</button>}{b.status !== 'RETIRED' && b.status !== 'ASSIGNED' && <button className="pbtn ghost xs" disabled={busy === b.id} onClick={() => { if (confirm(`Retire ${b.code}? It is never used again.`)) void act(b, 'retire'); }}>Retire</button>}</span></td></tr>)}
          </tbody></table>
        )}
      </div>
      <Drawer open={loading} onClose={() => setLoading(false)} title="Load a barcode block" width={640}>
        <div className="stack">
          <div className="seg"><button className={mode === 'range' ? 'on' : ''} onClick={() => setMode('range')}>Prefix + range</button><button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>Paste a list</button></div>
          <div className="form-grid">
            <div className="field"><label>Symbology</label><select value={f.symbology} onChange={(e) => setF((x) => ({ ...x, symbology: e.target.value }))}><option>UPC-A</option><option>EAN-13</option></select></div>
            <div className="field"><label>Block name</label><input value={f.block} onChange={(e) => setF((x) => ({ ...x, block: e.target.value }))} placeholder="GS1 2026-A" /></div>
            {mode === 'range' ? <>
              <div className="field"><label>Company prefix</label><input className="mono" value={f.prefix} onChange={(e) => setF((x) => ({ ...x, prefix: e.target.value.replace(/\D/g, '') }))} placeholder="063760" /><span className="hint">{f.symbology === 'EAN-13' ? 12 : 11} body digits; the rest is the serial.</span></div>
              <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}><div className="field"><label>Start</label><input className="mono" type="number" min={0} value={f.start} onChange={(e) => setF((x) => ({ ...x, start: e.target.value }))} /></div><div className="field"><label>Count</label><input className="mono" type="number" min={1} max={10000} value={f.count} onChange={(e) => setF((x) => ({ ...x, count: e.target.value }))} /></div></div>
            </> : <div className="field span-2"><label>Codes <span className="dim">11/12-digit UPC or 12/13-digit EAN, one per line</span></label><textarea className="mono" rows={8} value={f.codes} onChange={(e) => setF((x) => ({ ...x, codes: e.target.value }))} /></div>}
            <div className="field"><label>Reserve the whole block for <span className="dim">optional</span></label><select value={f.partnerId} onChange={(e) => setF((x) => ({ ...x, partnerId: e.target.value }))}><option value="">— shared pool —</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>Notes</label><input value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} placeholder="Invoice, vendor…" /></div>
          </div>
          {mode === 'range' && <div className="row"><button className="pbtn soft sm" onClick={() => void doPreview()}>Preview</button>{preview && <span className="mono" style={{ fontSize: '.84rem' }}>{preview.first.join(' · ')}{preview.count > 5 ? ` … ${preview.last}` : ''} ({preview.count})</span>}</div>}
          {preview && <Barcode code={preview.first[0]!} height={56} />}
          <div className="row"><button className="pbtn primary" disabled={busy === 'load'} onClick={() => void load()}>{busy === 'load' ? 'Loading…' : 'Load codes'}</button><button className="pbtn ghost" onClick={() => setLoading(false)}>Cancel</button></div>
        </div>
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

interface InvRow { id: string; title: string; issueNumber: string | null; catalogKey: string; status: string; fulfillment: string; weightOz: number | null; inventoryUnits: number; inventoryDamaged: number; inventoryIncoming: number; inventoryReorderLevel: number; inventoryLocation: string | null; partner: { id: string; name: string }; coverImage: { url: string } | null; reserved: number; available: number; low: boolean }

export function PodInventory() {
  const { data, reload } = useLoad<{ inventory: InvRow[] }>('/admin/pod/inventory');
  const { show, node } = useFlash();
  const [open, setOpen] = useState<InvRow | null>(null);
  const [f, setF] = useState({ delta: '', damagedDelta: '', incomingDelta: '', reorderLevel: '', location: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const rows = data?.inventory ?? [];
  const save = async () => { if (!open) return; setBusy(true); try { await api.post(`/admin/pod/listings/${open.id}/inventory`, { delta: Number(f.delta) || 0, damagedDelta: Number(f.damagedDelta) || 0, incomingDelta: Number(f.incomingDelta) || 0, reorderLevel: f.reorderLevel === '' ? undefined : Number(f.reorderLevel), location: f.location || undefined, reason: f.reason || 'Adjustment' }); show('Stock updated'); setOpen(null); setF({ delta: '', damagedDelta: '', incomingDelta: '', reorderLevel: '', location: '', reason: '' }); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(false); } };
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Titles in stock" value={rows.length} sub="consigned by publishers" />
        <Kpi label="On hand" value={rows.reduce((s, r) => s + r.inventoryUnits, 0)} sub={`${rows.reduce((s, r) => s + r.reserved, 0)} reserved by open orders`} />
        <Kpi label="Incoming" value={rows.reduce((s, r) => s + r.inventoryIncoming, 0)} sub="announced by publishers" />
        <Kpi label="Low stock" value={rows.filter((r) => r.low).length} sub="at or under the reorder level" tone="hot" dark />
      </div>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Inventory</h2><div className="dim" style={{ fontSize: '.88rem' }}>Stock publishers consign to us. FOC lock pulls the ordered copies out; adjust here when boxes arrive, get damaged or go out another way.</div></div></div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : rows.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No consignment stock" body="Listings with consignment fulfilment, or any stock on hand, appear here." /></div> : (
          <table className="ptable"><thead><tr><th></th><th>Title</th><th>Publisher</th><th>Location</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th><th className="num">Damaged</th><th className="num">Incoming</th><th className="num">Reorder at</th><th></th></tr></thead><tbody>
            {rows.map((r) => <tr key={r.id} style={r.low ? { background: 'rgba(255,90,95,.06)' } : undefined}><td style={{ width: 44 }}><Thumb url={r.coverImage?.url} title={r.title} size={32} /></td><td><Link to={`/admin/pod/listings/${r.id}`}><b>{r.title}{r.issueNumber ? ` #${r.issueNumber}` : ''}</b></Link><div className="dim" style={{ fontSize: '.74rem' }}><span className="key">{r.catalogKey}</span> · {r.fulfillment.toLowerCase().replace('_', ' ')}</div></td><td>{r.partner.name}</td><td className="dim">{r.inventoryLocation ?? '—'}</td><td className="num mono"><b>{r.inventoryUnits}</b></td><td className="num mono">{r.reserved}</td><td className="num mono">{r.available}</td><td className="num mono">{r.inventoryDamaged}</td><td className="num mono">{r.inventoryIncoming}</td><td className="num mono">{r.inventoryReorderLevel || '—'}{r.low && <Pill tone="red">low</Pill>}</td><td><button className="pbtn soft xs" onClick={() => { setOpen(r); setF({ delta: '', damagedDelta: '', incomingDelta: '', reorderLevel: String(r.inventoryReorderLevel), location: r.inventoryLocation ?? '', reason: '' }); }}>Adjust</button></td></tr>)}
          </tbody></table>
        )}
      </div>
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `Adjust stock · ${open.title}` : ''}>
        {open && <div className="stack">
          <div className="dim" style={{ fontSize: '.88rem' }}>Now: {open.inventoryUnits} on hand · {open.inventoryDamaged} damaged · {open.inventoryIncoming} incoming</div>
          <div className="form-grid"><div className="field"><label>On hand +/−</label><input className="mono" type="number" value={f.delta} onChange={(e) => setF((x) => ({ ...x, delta: e.target.value }))} placeholder="+40 received, −3 lost" /></div><div className="field"><label>Damaged +/−</label><input className="mono" type="number" value={f.damagedDelta} onChange={(e) => setF((x) => ({ ...x, damagedDelta: e.target.value }))} /></div><div className="field"><label>Incoming +/−</label><input className="mono" type="number" value={f.incomingDelta} onChange={(e) => setF((x) => ({ ...x, incomingDelta: e.target.value }))} placeholder="−40 when it lands" /></div><div className="field"><label>Reorder level</label><input className="mono" type="number" min={0} value={f.reorderLevel} onChange={(e) => setF((x) => ({ ...x, reorderLevel: e.target.value }))} /></div><div className="field span-2"><label>Location</label><input value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} placeholder="Shelf B-3" /></div><div className="field span-2"><label>Reason</label><input value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} placeholder="Box of 40 received from publisher" /></div></div>
          <button className="pbtn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save adjustment'}</button>
        </div>}
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

interface Analytics { days: number; cycles: { id: string; name: string; catalogDate: string | null; orders: number; wholesaleCents: number }[]; publishers: { id: string; name: string; units: number; wholesaleCents: number; titles: number }[]; retailers: { id: string; name: string; orders: number; wholesaleCents: number }[]; topTitles: { id: string; title: string; catalogKey?: string; publisher?: string; units: number; wholesaleCents: number }[]; series: { date: string; orders: number; cents: number }[]; money: Record<string, number> }

export function PodAnalytics() {
  const [days, setDays] = useState(90);
  const { data } = useLoad<Analytics>(`/admin/pod/analytics?days=${days}`, [days]);
  const { data: retailers } = useLoad<{ retailers: { id: string; name: string; tierOverride: number | null; creditCents: number; orderCount: number; wholesaleCents: number; status: string }[] }>('/admin/pod/retailers');
  const { data: pubs } = useLoad<{ publishers: { id: string; name: string; commissionBps: number | null; listingCount: number; unitsSold?: number; wholesaleCents?: number; owedCents?: number }[] }>('/admin/pod/publishers');
  const { data: rets } = useLoad<{ returns: { retailer: { id: string }; quantity: number; status: string }[] }>('/admin/pod/returns?status=');
  const returnsBy = useMemo(() => { const m = new Map<string, number>(); for (const r of rets?.returns ?? []) if (r.status !== 'REJECTED') m.set(r.retailer.id, (m.get(r.retailer.id) ?? 0) + r.quantity); return m; }, [rets]);
  const period = (data?.series ?? []).reduce((s, d) => ({ orders: s.orders + d.orders, cents: s.cents + d.cents }), { orders: 0, cents: 0 });
  return (
    <>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Analytics</h2><div className="dim" style={{ fontSize: '.88rem' }}>Wholesale sales, who is selling and who is buying. Costs and margins stay here.</div></div><div className="seg">{[30, 90, 180, 365].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d}d</button>)}</div></div>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label={`Wholesale · ${days}d`} value={money(period.cents)} sub={`${period.orders} orders`} />
        <Kpi label="Our commission · all time" value={money(-(data?.money.COMMISSION ?? 0))} sub={`on ${money(data?.money.SALE ?? 0)} wholesale`} />
        <Kpi label="Printing charged" value={money(-(data?.money.PRINTING ?? 0))} sub="to publishers, all time" />
        <Kpi label="Paid out" value={money(-(data?.money.PAYOUT ?? 0))} sub={`${money(-(data?.money.RETURN_CREDIT ?? 0))} return credits`} dark />
      </div>
      <div className="panel" style={{ marginBottom: '1.25rem' }}><div className="panel-head"><h3>Daily wholesale</h3><span className="dim" style={{ fontSize: '.8rem' }}>last {days} days</span></div><Bars values={(data?.series ?? []).map((d) => d.cents)} labels={(data?.series ?? []).map((d) => d.date)} height={140} format={(v) => money(v)} /></div>
      <div className="grid cols-2" style={{ marginBottom: '1.25rem' }}>
        <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>By catalog</h3></div><table className="ptable"><thead><tr><th>Cycle</th><th className="num">Orders</th><th className="num">Wholesale</th></tr></thead><tbody>{(data?.cycles ?? []).map((c) => <tr key={c.id}><td><Link to={`/admin/pod/cycles/${c.id}`}>{c.name}</Link></td><td className="num mono">{c.orders}</td><td className="num mono">{money(c.wholesaleCents)}</td></tr>)}</tbody></table></div>
        <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Top titles · {days}d</h3></div><table className="ptable"><thead><tr><th>Title</th><th>Publisher</th><th className="num">Units</th><th className="num">Wholesale</th></tr></thead><tbody>{(data?.topTitles ?? []).map((t) => <tr key={t.id}><td><Link to={`/admin/pod/listings/${t.id}`}>{t.title}</Link></td><td className="dim">{t.publisher}</td><td className="num mono">{t.units}</td><td className="num mono">{money(t.wholesaleCents)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="grid cols-2">
        <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Publisher list</h3></div><table className="ptable"><thead><tr><th>Publisher</th><th className="num">Titles</th><th>Commission</th><th className="num">Units</th><th className="num">Wholesale</th><th className="num">Owed</th></tr></thead><tbody>{(pubs?.publishers ?? []).map((p) => <tr key={p.id}><td><Link to={`/admin/pod/publishers/${p.id}`}>{p.name}</Link></td><td className="num mono">{p.listingCount}</td><td>{p.commissionBps != null ? pct(p.commissionBps) : 'default'}</td><td className="num mono">{p.unitsSold ?? 0}</td><td className="num mono">{money(p.wholesaleCents ?? 0)}</td><td className="num mono">{money(p.owedCents ?? 0)}</td></tr>)}</tbody></table></div>
        <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Retailer clients</h3></div><table className="ptable"><thead><tr><th>Shop</th><th>Tier</th><th className="num">Orders</th><th className="num">Spend</th><th className="num">Credit</th><th className="num">Returns used</th></tr></thead><tbody>{(retailers?.retailers ?? []).map((r) => <tr key={r.id}><td><Link to={`/admin/pod/retailers/${r.id}`}>{r.name}</Link></td><td>{r.tierOverride ? `Tier ${r.tierOverride} fixed` : 'by order'}</td><td className="num mono">{r.orderCount}</td><td className="num mono">{money(r.wholesaleCents)}</td><td className="num mono">{money(r.creditCents)}</td><td className="num mono">{returnsBy.get(r.id) ?? 0}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export function PodActivity() {
  const [q, setQ] = useState(''); const [subjectType, setSubjectType] = useState('');
  const { data } = useLoad<{ events: PodEvent[] }>(`/admin/pod/activity?q=${encodeURIComponent(q)}&subjectType=${subjectType}&take=400`, [q, subjectType]);
  const link = (e: PodEvent) => e.subjectType === 'listing' ? `/admin/pod/listings/${e.subjectId}` : e.subjectType === 'cycle' ? `/admin/pod/cycles/${e.subjectId}` : e.subjectType === 'retailer' ? `/admin/pod/retailers/${e.subjectId}` : e.subjectType === 'production' ? `/admin/pod/production?open=${e.subjectId}` : e.subjectType === 'purchase_order' ? `/admin/pod/purchase-orders?open=${e.subjectId}` : e.subjectType === 'statement' ? `/admin/pod/payouts?statement=${e.subjectId}` : '#';
  return (
    <>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Activity log</h2><div className="dim" style={{ fontSize: '.88rem' }}>Every action in the section, who did it and when. Append-only.</div></div><div className="row"><div className="search"><Search size={15} /><input className="inp" placeholder="Text, actor, kind…" value={q} onChange={(e) => setQ(e.target.value)} /></div><select className="inp" style={{ width: 'auto' }} value={subjectType} onChange={(e) => setSubjectType(e.target.value)}><option value="">Everything</option><option value="listing">Listings & publishers</option><option value="cycle">Cycles</option><option value="retailer">Retailers & returns</option><option value="production">Production</option><option value="purchase_order">Purchase orders</option><option value="statement">Statements</option></select></div></div>
      <div className="panel flush scroll-x">{!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.events.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="Nothing logged" /></div> : <table className="ptable"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Subject</th></tr></thead><tbody>{data.events.map((e) => <tr key={e.id}><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateTime(e.createdAt)}</td><td>{e.actorName ?? 'system'}</td><td><Pill tone="slate">{e.kind}</Pill> <span style={{ fontSize: '.88rem' }}>{e.message}</span></td><td><Link to={link(e)} className="dim" style={{ fontSize: '.8rem' }}>{e.subjectType}</Link></td></tr>)}</tbody></table>}</div>
    </>
  );
}
