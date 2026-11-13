/**
 * /admin/pod/listings — the review queue as a board, every listing as a
 * table; /admin/pod/listings/:id — the listing with files, preflight,
 * decisions and the staff edit form.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, Plus, ArrowLeft, Check, Undo2, XCircle, Archive, Mail, RefreshCw, ExternalLink, Trash2, Send, Upload, Barcode as BarcodeIcon } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, LISTING_STATUS, FORMAT_LABELS, FULFILLMENT_LABELS, type Listing, type PodEvent, type PublicSettings, pct } from '../../../lib/pod';
import { Avatar, Barcode, CoverArt, Drawer, Empty, Events, FileSlot, Pill, StatusPill, Thumb, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { ListingForm, blankListingForm, listingFormToBody, listingToForm, type ListingFormValue } from '../../pod/PublisherPortal';
import { useOverview } from './PodLayout';

interface ListResp { listings: Listing[]; counts: Record<string, number>; statuses: { key: string; label: string }[] }
interface Publisher { id: string; name: string; slug: string; contactEmail: string | null; commissionBps: number | null; listingCount: number; memberCount: number }

export function PodListings() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'queue';
  const [q, setQ] = useState('');
  const [view, setView] = useState<'board' | 'table'>(status === 'queue' ? 'board' : 'table');
  const { data, loading, reload } = useLoad<ListResp>(`/admin/pod/listings?status=${encodeURIComponent(status === 'queue' || status === 'all' ? (status === 'all' ? '' : 'queue') : status)}${q ? `&q=${encodeURIComponent(q)}` : ''}`, [status, q]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { show, node } = useFlash();
  const toggleSel = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const approveSelected = async () => { let ok = 0; const errors: string[] = []; for (const id of sel) { try { await api.post(`/admin/pod/listings/${id}/approve`, {}); ok++; } catch (e) { errors.push(errText(e)); } } show(`${ok} approved${errors.length ? `; ${errors.length} failed: ${errors[0]}` : ''}`, errors.length > 0); setSel(new Set()); await reload(); };
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const queueN = (counts.SUBMITTED ?? 0) + (counts.CHANGES_REQUESTED ?? 0);
  const rows = data?.listings ?? [];
  const cols: { key: string; label: string; items: Listing[] }[] = useMemo(() => [
    { key: 'SUBMITTED', label: 'Pending review', items: rows.filter((l) => l.status === 'SUBMITTED') },
    { key: 'CHANGES_REQUESTED', label: 'Changes requested', items: rows.filter((l) => l.status === 'CHANGES_REQUESTED') },
    { key: 'APPROVED', label: 'Approved · waiting', items: rows.filter((l) => l.status === 'APPROVED' || l.status === 'SCHEDULED') },
    { key: 'LIVE', label: 'Live', items: rows.filter((l) => l.status === 'LIVE') },
  ], [rows]);
  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={status === 'queue' ? 'on' : ''} onClick={() => { setParams({ status: 'queue' }); setView('board'); }}>Review queue <span className="n">{queueN}</span></button>
          <button className={status === 'all' ? 'on' : ''} onClick={() => { setParams({ status: 'all' }); setView('table'); }}>All <span className="n">{total}</span></button>
          {(['LIVE', 'APPROVED', 'DRAFT', 'REJECTED', 'ARCHIVED'] as const).filter((k) => counts[k]).map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => { setParams({ status: k }); setView('table'); }}>{LISTING_STATUS[k].label} <span className="n">{counts[k]}</span></button>)}
        </div>
        <div className="row">
          <div className="search"><Search size={15} /><input className="inp" placeholder="Title, catalog id, UPC, publisher…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {status === 'queue' && <div className="seg"><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button></div>}
          <button className="pbtn ghost sm" onClick={() => setImporting(true)}><Upload size={14} /> Import CSV</button>
          <button className="pbtn primary sm" onClick={() => setCreating(true)}><Plus size={14} /> New listing</button>
        </div>
      </div>
      {node}
      {sel.size > 0 && <div className="notice info" style={{ marginBottom: '.75rem', justifyContent: 'space-between', alignItems: 'center' }}><span>{sel.size} selected</span><span className="row"><button className="pbtn glow xs" onClick={() => void approveSelected()}><Check size={12} /> Approve selected</button><button className="pbtn ghost xs" onClick={() => setSel(new Set())}>Clear</button></span></div>}
      {loading && !data ? <p className="dim">Loading…</p> : view === 'board' && status === 'queue' ? (
        <div className="kanban" style={{ gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))' }}>
          {cols.map((col) => (
            <div className="col" key={col.key}>
              <div className="col-head"><span>{col.label}</span><span className="mono">{col.key === 'APPROVED' || col.key === 'LIVE' ? (counts[col.key] ?? 0) + (col.key === 'APPROVED' ? counts.SCHEDULED ?? 0 : 0) : col.items.length}</span></div>
              {col.items.length === 0 && <p className="dim" style={{ fontSize: '.82rem', padding: '.5rem .4rem' }}>{col.key === 'SUBMITTED' ? 'Nothing waiting. Nice.' : '—'}</p>}
              {col.items.slice(0, 30).map((l) => (
                <Link key={l.id} to={`/admin/pod/listings/${l.id}`} className="card">
                  <Thumb url={l.coverImage?.url} title={l.title} size={44} />
                  <div><b>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</b><small>{l.partner.name} · {money(l.msrpCents)}</small><small>{l.cycle?.name ?? 'no cycle'}{l.missingFiles.length ? ` · ${l.missingFiles.length} file${l.missingFiles.length > 1 ? 's' : ''} missing` : ''}</small></div>
                </Link>
              ))}
              {(col.key === 'APPROVED' || col.key === 'LIVE') && (counts[col.key] ?? 0) > col.items.length && <Link to={`/admin/pod/listings?status=${col.key}`} className="pbtn ghost xs block">See all {col.label.toLowerCase()}</Link>}
            </div>
          ))}
        </div>
      ) : (
        <div className="panel flush scroll-x">
          {rows.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No listings here" /></div> : (
            <table className="ptable">
              <thead><tr><th><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((l) => l.id)) : new Set())} /></th><th></th><th>Title</th><th>Publisher</th><th>Cycle</th><th>Fulfilment</th><th className="num">Cover</th><th>Files</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l.id} className="click" onClick={() => (window.location.href = `/admin/pod/listings/${l.id}`)}>
                  <td><input type="checkbox" aria-label="Select" checked={sel.has(l.id)} onChange={() => toggleSel(l.id)} /></td>
                  <td style={{ width: 48 }}><Thumb url={l.coverImage?.url} title={l.title} /></td>
                  <td><b>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</b><div className="dim" style={{ fontSize: '.78rem' }}>{l.coverDescription ?? FORMAT_LABELS[l.format]} · <span className="key">{l.catalogKey}</span></div></td>
                  <td>{l.partner.name}</td><td>{l.cycle?.name ?? <span className="dim">—</span>}</td>
                  <td className="dim" style={{ fontSize: '.82rem' }}>{l.fulfillment === 'PRINTED_BY_US' ? 'We print' : l.fulfillment === 'CONSIGNMENT' ? 'Consignment' : 'Publisher ships'}</td>
                  <td className="num mono">{money(l.msrpCents)}</td>
                  <td>{l.fulfillment === 'PRINTED_BY_US' ? (l.missingFiles.length ? <Pill tone="rose">{l.missingFiles.length} missing</Pill> : [l.files.cover, l.files.interior].some((f) => f?.reviewStatus === 'rejected') ? <Pill tone="red">Rejected file</Pill> : [l.files.cover, l.files.interior].every((f) => f?.reviewStatus === 'approved') ? <Pill tone="green">Approved</Pill> : <Pill tone="amber">Uploaded</Pill>) : <Pill tone="slate">n/a</Pill>}</td>
                  <td><StatusPill status={l.status} /></td><td className="dim">{dateShort(l.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
      <NewListingDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void reload(); }} />
      <ImportDrawer open={importing} onClose={() => setImporting(false)} onDone={() => { void reload(); }} />
    </>
  );
}

function ImportDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { data: pubs } = useLoad<{ publishers: Publisher[] }>(open ? '/admin/pod/publishers' : null, [open]);
  const { data: cyc } = useLoad<{ cycles: { id: string; name: string; status: string }[] }>(open ? '/admin/pod/cycles' : null, [open]);
  const [partnerId, setPartnerId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ dryRun: boolean; publisher: string; rows: number; created: { row: number; title: string; catalogKey: string }[]; preview: { row: number; title: string; msrpCents: number; pageCount: number | null; problems: string[] }[]; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (dryRun: boolean) => {
    if (!file || !partnerId) { setErr('Pick the publisher and a CSV'); return; }
    setBusy(true); setErr(null);
    try { const fd = new FormData(); fd.append('file', file); fd.append('partnerId', partnerId); if (cycleId) fd.append('cycleId', cycleId); if (dryRun) fd.append('dryRun', '1'); const r = await api.postForm<typeof result>('/admin/pod/listings/import', fd); setResult(r); if (!dryRun) onDone(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Import listings from a CSV" width={720}>
      <p className="dim" style={{ fontSize: '.9rem' }}>The catalog export layout works as-is; any sheet with a Title column plus Series, Series Code, Issue, Cover, UPC, Format, Pages, Color, Trim (or Width/Height), MSRP, Writer, Artist, Cover Artist, Rating, Incentive, Description, Synopsis, Fulfillment is read. Rows become drafts for the publisher; nothing is approved.</p>
      <div className="form-grid">
        <div className="field"><label>Publisher</label><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">— pick —</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="field"><label>Catalog cycle <span className="dim">optional</span></label><select value={cycleId} onChange={(e) => setCycleId(e.target.value)}><option value="">— none —</option>{(cyc?.cycles ?? []).filter((c) => c.status !== 'CLOSED').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field span-2"><label>CSV file</label><input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      {err && <div className="notice bad" style={{ marginTop: '.75rem' }}>{err}</div>}
      <div className="row" style={{ marginTop: '1rem' }}><button className="pbtn soft" disabled={busy} onClick={() => void run(true)}>Preview</button><button className="pbtn primary" disabled={busy || !result?.dryRun} onClick={() => void run(false)}>{busy ? 'Working…' : 'Import as drafts'}</button><button className="pbtn ghost" onClick={onClose}>Close</button></div>
      {result && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <b>{result.dryRun ? 'Preview' : 'Imported'} · {result.rows} rows for {result.publisher}{!result.dryRun ? ` · ${result.created.length} created` : ''}</b>
          {result.problems.length > 0 && <div className="notice warn" style={{ marginTop: '.5rem', fontSize: '.84rem' }}><div>{result.problems.slice(0, 10).map((x, i) => <div key={i}>{x}</div>)}</div></div>}
          <table className="ptable" style={{ marginTop: '.5rem' }}><thead><tr><th>Row</th><th>Title</th><th className="num">Price</th><th className="num">Pages</th><th>Notes</th></tr></thead><tbody>{(result.dryRun ? result.preview : result.preview).slice(0, 50).map((r) => <tr key={r.row}><td className="dim">{r.row}</td><td>{r.title}</td><td className="num mono">{money(r.msrpCents)}</td><td className="num mono">{r.pageCount ?? '—'}</td><td className="dim" style={{ fontSize: '.8rem' }}>{r.problems.join(', ')}</td></tr>)}</tbody></table>
        </div>
      )}
    </Drawer>
  );
}

function NewListingDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const navigate = useNavigate();
  const { data: pubs } = useLoad<{ publishers: Publisher[] }>(open ? '/admin/pod/publishers' : null, [open]);
  const { data: cyc } = useLoad<{ cycles: { id: string; name: string; catalogDate: string; focDate: string }[] }>(open ? '/admin/pod/cycles' : null, [open]);
  const { data: st } = useLoad<{ settings: PublicSettings }>(open ? '/admin/pod/settings' : null, [open]);
  const [partnerId, setPartnerId] = useState('');
  const [form, setForm] = useState<ListingFormValue>(blankListingForm);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!partnerId) { setErr('Pick the publisher'); return; }
    setBusy(true); setErr(null);
    try { const r = await api.post<{ listing: Listing }>('/admin/pod/listings', { ...listingFormToBody(form), partnerId }); onCreated(); navigate(`/admin/pod/listings/${r.listing.id}`); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="New listing" width={720}>
      <div className="field" style={{ marginBottom: '1rem' }}><label>Publisher</label><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">— pick —</option>{(pubs?.publishers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.listingCount ? ` (${p.listingCount})` : ''}</option>)}</select><span className="hint">Publishers are Partners. Create one under Partners if it is missing.</span></div>
      <ListingForm value={form} onChange={setForm} cycles={(cyc?.cycles ?? []).filter((c) => !['CLOSED'].includes((c as unknown as { status: string }).status))} settings={st?.settings ?? null} admin />
      {err && <div className="notice bad" style={{ marginTop: '1rem' }}>{err}</div>}
      <div className="row" style={{ marginTop: '1rem' }}><button className="pbtn primary" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create listing'}</button><button className="pbtn ghost" onClick={onClose}>Cancel</button></div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

interface Detail { listing: Listing; events: PodEvent[]; production: { id: string; number: string; status: string; totalQty: number; cycle: { name: string } | null }[]; sales: { units: number; wholesaleCents: number }; printCostPer100: { unitCents: number; totalCents: number; productSlug: string } | null }

export function PodListingDetail() {
  const { id = '' } = useParams();
  const { reloadOverview } = useOverview();
  const { data, reload } = useLoad<Detail>(`/admin/pod/listings/${id}`, [id]);
  const { data: cyc } = useLoad<{ cycles: { id: string; name: string; catalogDate: string; focDate: string; status: string }[] }>('/admin/pod/cycles');
  const { data: st } = useLoad<{ settings: PublicSettings }>('/admin/pod/settings');
  const { show, node } = useFlash();
  const [form, setForm] = useState<ListingFormValue>(blankListingForm);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<null | 'changes' | 'reject'>(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const l = data?.listing;
  useEffect(() => { if (l) { setForm(listingToForm(l)); setDirty(false); } }, [l]);

  const act = async (path: string, body?: unknown, ok?: string) => {
    setBusy(path);
    try { const r = await api.post<{ mail?: { sent: boolean; error?: string } | null }>(`/admin/pod/listings/${id}/${path}`, body); show(ok ?? 'Done' + (r.mail ? (r.mail.sent ? ' · publisher emailed' : ` · email failed: ${r.mail.error}`) : '')); setDecision(null); setNote(''); await reload(); void reloadOverview(); } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try { await api.patch(`/admin/pod/listings/${id}`, listingFormToBody(form)); show('Saved'); setDirty(false); setEditing(false); await reload(); } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };
  const upload = async (kind: string, file: File) => {
    setBusy(kind);
    try { const fd = new FormData(); fd.append('kind', kind); fd.append('file', file); const r = await api.postForm<{ preflight: { headline: string; status: string } | null }>(`/admin/pod/listings/${id}/files`, fd); show(r.preflight?.headline ?? 'Uploaded', r.preflight?.status === 'changes_required'); await reload(); } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };
  const fileAction = async (fileId: string, path: string, body?: unknown) => {
    setBusy(fileId);
    try { if (path === 'delete') await api.del(`/admin/pod/listings/${id}/files/${fileId}`); else await api.post(`/admin/pod/listings/${id}/files/${fileId}/${path}`, body); show(path === 'restore' ? 'That version is current again' : 'Done'); await reload(); } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };

  if (!l) return <p className="dim">Loading…</p>;
  const name = `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}`;
  const olderVersions = (kind: string) => (l?.allFiles ?? []).filter((f) => f.kind === kind && f.id !== (l?.files as Record<string, { id: string } | null>)[kind]?.id).map((f) => ({ id: f.id, version: f.version, reviewStatus: f.reviewStatus, createdAt: f.createdAt, media: f.media }));
  const inv = async () => { const delta = window.prompt('Stock adjustment (+/− copies on hand)', '0'); if (delta === null) return; const reason = window.prompt('Reason', 'Received from publisher') ?? ''; try { await api.post(`/admin/pod/listings/${id}/inventory`, { delta: Number(delta) || 0, reason }); show('Stock updated'); await reload(); } catch (x) { show(errText(x), true); } };
  const barcode = async () => { setBusy('barcode'); try { await api.post(`/admin/pod/listings/${id}/barcode`, {}); show('Barcode assigned'); await reload(); } catch (x) { show(errText(x), true); } finally { setBusy(null); } };
  const fileActions = (f: Listing['files']['cover']) => f ? (
    <>
      {f.reviewStatus !== 'approved' && <button className="pbtn soft xs" disabled={busy === f.id} onClick={() => void fileAction(f.id, 'review', { status: 'approved' })}><Check size={12} /> Approve file</button>}
      {f.reviewStatus !== 'rejected' && <button className="pbtn danger xs" disabled={busy === f.id} onClick={() => { const n = window.prompt('What is wrong with this file? (goes to the publisher as the file note)'); if (n !== null) void fileAction(f.id, 'review', { status: 'rejected', note: n }); }}><XCircle size={12} /> Reject file</button>}
      {(f.kind === 'cover' || f.kind === 'interior') && <button className="pbtn ghost xs" disabled={busy === f.id} onClick={() => void fileAction(f.id, 'preflight')}><RefreshCw size={12} /> Re-run checks</button>}
      <button className="pbtn ghost xs" disabled={busy === f.id} onClick={() => { if (confirm('Remove this file version from the listing?')) void fileAction(f.id, 'delete'); }}><Trash2 size={12} /></button>
    </>
  ) : null;
  return (
    <>
      {node}
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <div>
          <Link to="/admin/pod/listings" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Listings</Link>
          <h2 className="display-md" style={{ margin: 0 }}>{name}</h2>
          <div className="row" style={{ marginTop: '.4rem' }}><StatusPill status={l.status} /><span className="key">{l.catalogKey}</span><span className="row" style={{ gap: '.4rem' }}><Avatar name={l.partner.name} /> <Link to={`/admin/pod/payouts?partner=${l.partner.id}`}>{l.partner.name}</Link></span>{l.cycle && <Link to={`/admin/pod/cycles/${l.cycle.id}`} className="chip">{l.cycle.name}</Link>}{l.product && <a href={`/product/${l.product.slug}`} target="_blank" rel="noreferrer" className="chip">Storefront <ExternalLink size={11} /></a>}</div>
        </div>
        <div className="row">
          {(l.status === 'SUBMITTED' || l.status === 'CHANGES_REQUESTED' || l.status === 'DRAFT') && <button className="pbtn glow" disabled={busy !== null} onClick={() => void act('approve', {}, 'Approved')}><Check size={16} /> Approve</button>}
          {l.status !== 'CHANGES_REQUESTED' && l.status !== 'ARCHIVED' && l.status !== 'REJECTED' && <button className="pbtn soft" disabled={busy !== null} onClick={() => setDecision('changes')}><Undo2 size={16} /> Request changes</button>}
          {l.status !== 'REJECTED' && l.status !== 'ARCHIVED' && l.status !== 'LIVE' && <button className="pbtn danger" disabled={busy !== null} onClick={() => setDecision('reject')}><XCircle size={16} /> Reject</button>}
          {(l.status === 'LIVE' || l.status === 'APPROVED') && <button className="pbtn ghost" disabled={busy !== null} onClick={() => { if (confirm('Archive this listing? It leaves the catalog and the storefront.')) void act('archive', {}, 'Archived'); }}><Archive size={16} /> Archive</button>}
          {(l.status === 'REJECTED' || l.status === 'ARCHIVED') && <button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('reopen', { email: false }, 'Back to draft')}><Undo2 size={16} /> Reopen as draft</button>}
          <button className="pbtn primary" onClick={() => setEditing(true)}>Edit details</button>
        </div>
      </div>

      {decision && (
        <div className="panel accent" style={{ marginBottom: '1rem' }}>
          <h3>{decision === 'changes' ? 'What should the publisher change?' : 'Why is this rejected?'}</h3>
          <textarea className="inp" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision === 'changes' ? 'Cover PDF has no bleed; synopsis mentions a price; please add the UPC.' : 'Content outside what we print; duplicate of SAV-92708; …'} autoFocus />
          <div className="row" style={{ marginTop: '.75rem' }}><button className={`pbtn ${decision === 'changes' ? 'primary' : 'danger'}`} disabled={!note.trim() || busy !== null} onClick={() => void act(decision, { note }, decision === 'changes' ? 'Sent back for changes' : 'Rejected')}><Mail size={14} /> Send to publisher</button><button className="pbtn ghost" onClick={() => setDecision(null)}>Cancel</button></div>
        </div>
      )}
      {l.reviewNote && (l.status === 'CHANGES_REQUESTED' || l.status === 'REJECTED') && <div className="notice warn" style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}><b>Note to publisher:</b> {l.reviewNote}</div>}
      {l.fulfillment === 'PRINTED_BY_US' && data.printCostPer100 && st && (() => { const top = st.settings.tiers[st.settings.tiers.length - 1]!; const w = Math.round(l.msrpCents * (10000 - top.discountBps) / 10000); const net = Math.round(w * (10000 - (l.partnerCommissionBps ?? st.settings.commissionBpsPrintedByUs)) / 10000); return net < data.printCostPer100.unitCents ? <div className="notice bad" style={{ marginBottom: '1rem' }}><b>Cover price too low to print.</b>&nbsp;At {top.name} a shop pays {money(w)} a copy; after commission the publisher nets {money(net)}, but printing costs {money(data.printCostPer100.unitCents)} a copy at 100 — they would owe us on every sale. Ask for a higher cover price or fewer pages before approving.</div> : null; })()}

      <div className="split">
        <div className="stack">
          <div className="grid cols-3">
            <div className="panel tight"><div className="eyebrow">Cover price</div><div className="display-md mono">{money(l.msrpCents)}</div><div className="dim" style={{ fontSize: '.8rem' }}>{st ? `Wholesale ${money(Math.round(l.msrpCents * (10000 - st.settings.tiers[0]!.discountBps) / 10000))}–${money(Math.round(l.msrpCents * (10000 - st.settings.tiers[st.settings.tiers.length - 1]!.discountBps) / 10000))}` : ''}</div></div>
            <div className="panel tight"><div className="eyebrow">Sold</div><div className="display-md mono">{data.sales.units}</div><div className="dim" style={{ fontSize: '.8rem' }}>{money(data.sales.wholesaleCents)} wholesale</div></div>
            <div className="panel tight"><div className="eyebrow">Our print cost (100 copies)</div><div className="display-md mono">{data.printCostPer100 ? money(data.printCostPer100.unitCents) : '—'}</div><div className="dim" style={{ fontSize: '.8rem' }}>{data.printCostPer100 ? `per copy via ${data.printCostPer100.productSlug}` : l.fulfillment === 'PARTNER_SHIPS' ? 'Publisher ships' : 'Set trim + pages to price it'}</div></div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Details</h3><span className="dim" style={{ fontSize: '.82rem' }}>{FULFILLMENT_LABELS[l.fulfillment]} · commission {l.partnerCommissionBps != null ? pct(l.partnerCommissionBps) : st ? pct(l.fulfillment === 'PRINTED_BY_US' ? st.settings.commissionBpsPrintedByUs : l.fulfillment === 'CONSIGNMENT' ? st.settings.commissionBpsConsignment : st.settings.commissionBpsPartnerShips) : ''}</span></div>
            <dl className="spec">
              <dt>Series</dt><dd>{l.seriesName ?? '—'} {l.seriesCode && <span className="key">{l.seriesCode}</span>}</dd>
              <dt>Cover</dt><dd>{l.coverDescription ?? '—'}{l.variantNumber ? ` (variant ${l.variantNumber})` : ''}</dd>
              <dt>UPC</dt><dd>{l.upc ?? '—'}</dd>
              <dt>Format</dt><dd>{FORMAT_LABELS[l.format]} · {l.seriesType ?? ''} {l.frequency ? `· ${l.frequency}` : ''}</dd>
              <dt>Specs</dt><dd>{l.pageCount ?? '?'} pages · {l.trimWidthIn ?? '?'} × {l.trimHeightIn ?? '?'} in · {l.interiorColor === 'bw' ? 'B&W' : 'colour'}{l.weightOz ? ` · ${l.weightOz} oz` : ''}</dd>
              <dt>Credits</dt><dd>{[l.writer && `W: ${l.writer}`, l.artist && `A: ${l.artist}`, l.coverArtist && `CA: ${l.coverArtist}`].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Rating / genres</dt><dd>{l.ageRating ?? '—'}{l.genres.length ? ` · ${l.genres.join(', ')}` : ''}</dd>
              <dt>Incentive</dt><dd>{l.incentiveRatio ? `${l.incentiveRatio}${l.incentiveQualifierKey ? ` of ${l.incentiveQualifierKey}` : ' of the main cover'}` : '—'} · {l.reorderable ? 'reorderable' : 'no reorders'}</dd>
              <dt>Submitted</dt><dd>{dateShort(l.submittedAt)} · approved {dateShort(l.approvedAt)} · live {dateShort(l.publishedAt)}</dd>
            </dl>
            {(l.synopsis || l.description) && <div style={{ marginTop: '.75rem', fontSize: '.9rem', whiteSpace: 'pre-wrap' }}><b>Copy</b><p className="tight">{l.synopsis}</p>{l.description && <p className="dim tight" style={{ marginTop: '.4rem' }}>{l.description}</p>}</div>}
          </div>
          {data.production.length > 0 && <div className="panel"><div className="panel-head"><h3>Production runs</h3></div><table className="ptable"><tbody>{data.production.map((p) => <tr key={p.id} className="click" onClick={() => (window.location.href = `/admin/pod/production?open=${p.id}`)}><td><b>{p.number}</b></td><td>{p.cycle?.name}</td><td className="num mono">{p.totalQty} copies</td><td>{p.status}</td></tr>)}</tbody></table></div>}
          <div className="panel"><div className="panel-head"><h3>History</h3>{l.status === 'SUBMITTED' && <button className="pbtn ghost xs" onClick={() => void act('nudge', {}, 'Staff nudged')}><Send size={12} /> Nudge staff</button>}</div><Events events={data.events} /></div>
        </div>
        <aside className="stack">
          <CoverArt url={l.coverImage?.url} title={name} className="cover-hero" />
          <div className="panel tight"><div className="between"><b><BarcodeIcon size={14} /> Barcode</b>{l.barcode ? <Pill tone="teal">{l.barcode.symbology}{l.barcode.block ? ` · ${l.barcode.block}` : ''}</Pill> : l.upc ? <Pill tone="slate">publisher's own</Pill> : <Pill tone="amber">none</Pill>}</div>
            {(l.barcode || l.upc) ? <div style={{ marginTop: '.5rem' }}><Barcode code={l.barcode?.code ?? l.upc!} /><div className="row" style={{ marginTop: '.4rem', justifyContent: 'space-between' }}><span className="mono" style={{ fontSize: '.84rem' }}>{l.barcode?.code ?? l.upc}</span>{l.barcode && <Link to={`/admin/pod/barcodes?q=${l.barcode.code}`} className="pbtn ghost xs">Manage</Link>}</div></div> : <button className="pbtn soft sm" style={{ marginTop: '.5rem' }} disabled={busy !== null} onClick={() => void barcode()}>Assign the next free barcode</button>}</div>
          {(l.fulfillment === 'CONSIGNMENT' || l.inventory.units > 0) && <div className="panel tight"><div className="between"><b>Consignment stock</b><Link to="/admin/pod/inventory" className="pbtn ghost xs">Inventory</Link></div><div className="display-md mono" style={{ marginTop: '.3rem' }}>{l.inventory.units}</div><div className="dim" style={{ fontSize: '.8rem' }}>on hand · {l.inventory.damaged} damaged{l.inventory.location ? ` · ${l.inventory.location}` : ''}</div><button className="pbtn soft xs" style={{ marginTop: '.5rem' }} onClick={() => void inv()}>Adjust</button></div>}
          <FileSlot label="Cover image" file={l.files.cover_image} accept="image/*" busy={busy === 'cover_image'} onUpload={(f) => void upload('cover_image', f)} hint="Catalog + storefront image" actions={fileActions(l.files.cover_image)} versions={olderVersions('cover_image')} onRestore={(fid) => void fileAction(fid, 'restore')} onDelete={(fid) => void fileAction(fid, 'delete')} />
          {l.fulfillment === 'PRINTED_BY_US' && <>
            <FileSlot label="Cover PDF" file={l.files.cover} accept="application/pdf" busy={busy === 'cover'} onUpload={(f) => void upload('cover', f)} actions={fileActions(l.files.cover)} versions={olderVersions('cover')} onRestore={(fid) => void fileAction(fid, 'restore')} onDelete={(fid) => void fileAction(fid, 'delete')} />
            <FileSlot label="Interior PDF" file={l.files.interior} accept="application/pdf" busy={busy === 'interior'} onUpload={(f) => void upload('interior', f)} actions={fileActions(l.files.interior)} versions={olderVersions('interior')} onRestore={(fid) => void fileAction(fid, 'restore')} onDelete={(fid) => void fileAction(fid, 'delete')} />
          </>}
          <FileSlot label="Marketing image" file={l.files.marketing} accept="image/*" busy={busy === 'marketing'} onUpload={(f) => void upload('marketing', f)} actions={fileActions(l.files.marketing)} versions={olderVersions('marketing')} onRestore={(fid) => void fileAction(fid, 'restore')} onDelete={(fid) => void fileAction(fid, 'delete')} />
          {l.files.extra && <FileSlot label="Extra file" file={l.files.extra} accept="*/*" readOnly actions={fileActions(l.files.extra)} />}

        </aside>
      </div>

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit listing" width={760}>
        <ListingForm value={form} onChange={(f) => { setForm(f); setDirty(true); }} cycles={(cyc?.cycles ?? []).filter((c) => c.status !== 'CLOSED')} settings={st?.settings ?? null} admin />
        <div className="row" style={{ marginTop: '1rem', position: 'sticky', bottom: 0, background: '#fff', padding: '.75rem 0' }}><button className="pbtn primary" disabled={!dirty || busy === 'save'} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button><button className="pbtn ghost" onClick={() => setEditing(false)}>Close</button></div>
      </Drawer>
    </>
  );
}
