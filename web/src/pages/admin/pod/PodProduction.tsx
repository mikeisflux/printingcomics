/**
 * /admin/pod/production — the print runs we owe after each FOC (and any
 * staff raise by hand); /admin/pod/purchase-orders — what publishers ship.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Send, Factory, ExternalLink } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, dateTime, inputDate, PRODUCTION_STATUS, PURCHASE_STATUS, type PodEvent, type PreflightResult } from '../../../lib/pod';
import { DaysLeft, Drawer, Empty, Events, Kpi, Pill, PreflightReport, Thumb, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

interface Run {
  id: string; number: string; status: string; retailerQty: number; partnerAddOnQty: number; totalQty: number; printUnitCents: number | null; printTotalCents: number | null; deadline: string | null; notes: string | null; internalNotes: string | null; createdAt: string;
  listing: { id: string; title: string; catalogKey: string; issueNumber: string | null; pageCount: number | null; trimWidthIn: number | null; trimHeightIn: number | null; interiorColor: string | null; partner: { id: string; name: string }; files: { id: string; kind: string; version: number; reviewStatus: string; preflight: PreflightResult | null; media: { id: string; url: string; originalName: string; size: number } }[]; coverImage?: { url: string } | null };
  cycle: { id: string; name: string; inStoreDate: string } | null; order: { id: string; number: string; status: string } | null;
}
const OPEN = ['PLANNED', 'FILES_NEEDED', 'PREFLIGHT', 'APPROVED', 'IN_PRODUCTION'];

export function PodProduction() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const openId = params.get('open');
  const { data, reload } = useLoad<{ production: Run[]; counts: Record<string, number> }>(`/admin/pod/production?status=${status === 'all' ? '' : status}`, [status]);
  const { reloadOverview } = useOverview();
  const [creating, setCreating] = useState(false);
  const counts = data?.counts ?? {};
  const sel = data?.production.find((p) => p.id === openId) ?? null;
  const openUnits = (data?.production ?? []).filter((p) => OPEN.includes(p.status)).reduce((s, p) => s + p.totalQty, 0);
  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Runs open" value={OPEN.reduce((s, k) => s + (counts[k] ?? 0), 0)} sub={`${openUnits} copies in the pipeline`} />
        <Kpi label="Waiting on files" value={counts.FILES_NEEDED ?? 0} sub="publisher must upload or fix" tone={counts.FILES_NEEDED ? 'hot' : undefined} />
        <Kpi label="In preflight" value={counts.PREFLIGHT ?? 0} sub={`${counts.APPROVED ?? 0} approved for press`} />
        <Kpi label="On press" value={counts.IN_PRODUCTION ?? 0} sub={`${counts.DONE ?? 0} done all time`} dark />
      </div>
      <div className="toolbar">
        <div className="seg">
          <button className={status === 'open' ? 'on' : ''} onClick={() => setParams({ status: 'open' })}>Open</button>
          {Object.keys(PRODUCTION_STATUS).map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams({ status: k })}>{PRODUCTION_STATUS[k]!.label} <span className="n">{counts[k] ?? 0}</span></button>)}
          <button className={status === 'all' ? 'on' : ''} onClick={() => setParams({ status: 'all' })}>All</button>
        </div>
        <button className="pbtn primary sm" onClick={() => setCreating(true)}><Plus size={14} /> New run</button>
      </div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.production.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No production runs" body="Runs are raised when a cycle locks at FOC, or by hand for a publisher's own copies." /></div> : (
          <table className="ptable"><thead><tr><th>Run</th><th></th><th>Title</th><th>Publisher</th><th>Cycle</th><th className="num">Copies</th><th className="num">Print charge</th><th>Files</th><th>Deadline</th><th>Status</th></tr></thead><tbody>
            {data.production.map((p) => {
              const newest = (k: string) => p.listing.files.find((f) => f.kind === k);
              const files = [newest('cover'), newest('interior')];
              const filesTone = files.some((f) => !f) ? 'rose' : files.some((f) => f!.reviewStatus === 'rejected') ? 'red' : files.every((f) => f!.reviewStatus === 'approved') ? 'green' : 'amber';
              return (
                <tr key={p.id} className="click" onClick={() => setParams({ status, open: p.id })}>
                  <td><b>{p.number}</b></td><td style={{ width: 44 }}><Thumb url={p.listing.coverImage?.url} title={p.listing.title} size={32} /></td>
                  <td>{p.listing.title}{p.listing.issueNumber ? ` #${p.listing.issueNumber}` : ''}<div className="dim" style={{ fontSize: '.76rem' }}><span className="key">{p.listing.catalogKey}</span> · {p.listing.pageCount}pp · {p.listing.trimWidthIn}×{p.listing.trimHeightIn} · {p.listing.interiorColor === 'bw' ? 'B&W' : 'color'}</div></td>
                  <td>{p.listing.partner.name}</td><td>{p.cycle?.name ?? '—'}</td>
                  <td className="num mono">{p.totalQty}<span className="dim"> ({p.retailerQty}+{p.partnerAddOnQty})</span></td>
                  <td className="num mono">{p.printTotalCents != null ? money(p.printTotalCents) : '—'}</td>
                  <td><Pill tone={filesTone}>{filesTone === 'rose' ? 'missing' : filesTone === 'red' ? 'rejected' : filesTone === 'green' ? 'approved' : 'uploaded'}</Pill></td>
                  <td>{dateShort(p.deadline)} <DaysLeft to={p.deadline} /></td><td><TonePill map={PRODUCTION_STATUS} status={p.status} /></td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </div>
      <RunDrawer run={sel} onClose={() => setParams({ status })} onChanged={() => { void reload(); void reloadOverview(); }} />
      <NewRunDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void reload(); void reloadOverview(); }} />
    </>
  );
}

function RunDrawer({ run, onClose, onChanged }: { run: Run | null; onClose: () => void; onChanged: () => void }) {
  const { data } = useLoad<{ events: PodEvent[] }>(run ? `/admin/pod/production/${run.id}` : null, [run?.id]);
  const { show, node } = useFlash();
  const [f, setF] = useState({ retailerQty: '', partnerAddOnQty: '', deadline: '', notes: '', internalNotes: '' });
  useEffect(() => { if (run) setF({ retailerQty: String(run.retailerQty), partnerAddOnQty: String(run.partnerAddOnQty), deadline: inputDate(run.deadline), notes: run.notes ?? '', internalNotes: run.internalNotes ?? '' }); }, [run]);
  const patch = async (body: Record<string, unknown>) => { try { await api.patch(`/admin/pod/production/${run!.id}`, body); show('Saved'); onChanged(); } catch (e) { show(errText(e), true); } };
  if (!run) return null;
  const newest = (k: string) => run.listing.files.find((x) => x.kind === k);
  return (
    <Drawer open onClose={onClose} title={<span className="row"><Factory size={20} /> {run.number}</span>} width={680}>
      {node}
      <div className="row" style={{ marginBottom: '1rem' }}><TonePill map={PRODUCTION_STATUS} status={run.status} /><Link to={`/admin/pod/listings/${run.listing.id}`} className="chip">{run.listing.title} <ExternalLink size={11} /></Link>{run.cycle && <Link to={`/admin/pod/cycles/${run.cycle.id}`} className="chip">{run.cycle.name}</Link>}{run.order && <Link to={`/admin/orders/${run.order.id}`} className="chip">Order {run.order.number}</Link>}</div>
      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <div className="panel tight"><div className="eyebrow">Copies</div><div className="display-md mono">{run.totalQty}</div><div className="dim" style={{ fontSize: '.78rem' }}>{run.retailerQty} retailer + {run.partnerAddOnQty} publisher</div></div>
        <div className="panel tight"><div className="eyebrow">Print charge</div><div className="display-md mono">{run.printTotalCents != null ? money(run.printTotalCents) : '—'}</div><div className="dim" style={{ fontSize: '.78rem' }}>{run.printUnitCents != null ? `${money(run.printUnitCents)} per copy, to the publisher` : 'no price: set trim + pages'}</div></div>
        <div className="panel tight"><div className="eyebrow">Deadline</div><div className="display-md">{dateShort(run.deadline)}</div><div className="dim" style={{ fontSize: '.78rem' }}>{run.cycle ? `in store ${dateShort(run.cycle.inStoreDate)}` : ''}</div></div>
      </div>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Status</h3>
        <div className="seg" style={{ marginTop: '.5rem' }}>{Object.keys(PRODUCTION_STATUS).map((k) => <button key={k} className={run.status === k ? 'on' : ''} onClick={() => void patch({ status: k })}>{PRODUCTION_STATUS[k]!.label}</button>)}</div>
        <p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Preflight moves a run between Files needed, In preflight and Approved by reviewing the files. Staff set On press and Done here.</p>
      </div>
      <div className="stack" style={{ marginBottom: '1rem' }}>
        {(['cover', 'interior'] as const).map((k) => { const file = newest(k); return (
          <div key={k} className="panel tight"><div className="between"><b>{k === 'cover' ? 'Cover PDF' : 'Interior PDF'}</b>{file ? <Pill tone={file.reviewStatus === 'approved' ? 'green' : file.reviewStatus === 'rejected' ? 'red' : 'amber'}>{file.reviewStatus} · v{file.version}</Pill> : <Pill tone="rose">missing</Pill>}</div>{file && <><a href={file.media.url} target="_blank" rel="noreferrer" style={{ fontSize: '.88rem' }}>{file.media.originalName}</a><div style={{ marginTop: '.5rem' }}><PreflightReport result={file.preflight} compact /></div></>}</div>
        ); })}
      </div>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Edit the run</h3>
        <div className="form-grid" style={{ marginTop: '.5rem' }}>
          <div className="field"><label>Retailer copies</label><input type="number" min={0} value={f.retailerQty} onChange={(e) => setF((x) => ({ ...x, retailerQty: e.target.value }))} /></div>
          <div className="field"><label>Publisher add-on copies</label><input type="number" min={0} value={f.partnerAddOnQty} onChange={(e) => setF((x) => ({ ...x, partnerAddOnQty: e.target.value }))} /><span className="hint">Charged to the publisher at the print price.</span></div>
          <div className="field"><label>Deadline</label><input type="date" value={f.deadline} onChange={(e) => setF((x) => ({ ...x, deadline: e.target.value }))} /></div>
          <div className="field span-2"><label>Notes (publisher sees)</label><textarea rows={2} value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} /></div>
          <div className="field span-2"><label>Internal notes</label><textarea rows={2} value={f.internalNotes} onChange={(e) => setF((x) => ({ ...x, internalNotes: e.target.value }))} /></div>
        </div>
        <button className="pbtn primary sm" style={{ marginTop: '.75rem' }} onClick={() => void patch({ retailerQty: Number(f.retailerQty) || 0, partnerAddOnQty: Number(f.partnerAddOnQty) || 0, deadline: f.deadline || null, notes: f.notes || null, internalNotes: f.internalNotes || null })}>Save</button>
      </div>
      <div className="panel"><h3>History</h3><div style={{ marginTop: '.5rem' }}><Events events={data?.events ?? []} /></div><p className="dim" style={{ fontSize: '.76rem' }}>Raised {dateTime(run.createdAt)}</p></div>
    </Drawer>
  );
}

function NewRunDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { data } = useLoad<{ listings: { id: string; title: string; issueNumber: string | null; catalogKey: string; partner: { name: string }; fulfillment: string; cycle: { id: string; name: string } | null }[] }>(open ? '/admin/pod/listings?status=' : null, [open]);
  const [f, setF] = useState({ listingId: '', retailerQty: '0', partnerAddOnQty: '0', deadline: '', notes: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); setErr(null); try { await api.post('/admin/pod/production', { listingId: f.listingId, retailerQty: Number(f.retailerQty) || 0, partnerAddOnQty: Number(f.partnerAddOnQty) || 0, deadline: f.deadline || null, notes: f.notes || null }); onCreated(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } };
  return (
    <Drawer open={open} onClose={onClose} title="New production run">
      <div className="stack">
        <div className="field"><label>Listing</label><select value={f.listingId} onChange={(e) => setF((x) => ({ ...x, listingId: e.target.value }))}><option value="">— pick —</option>{(data?.listings ?? []).filter((l) => l.fulfillment === 'PRINTED_BY_US').map((l) => <option key={l.id} value={l.id}>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''} · {l.partner.name} ({l.catalogKey})</option>)}</select></div>
        <div className="form-grid"><div className="field"><label>Retailer copies</label><input type="number" min={0} value={f.retailerQty} onChange={(e) => setF((x) => ({ ...x, retailerQty: e.target.value }))} /></div><div className="field"><label>Publisher copies</label><input type="number" min={0} value={f.partnerAddOnQty} onChange={(e) => setF((x) => ({ ...x, partnerAddOnQty: e.target.value }))} /><span className="hint">Charged to the publisher's ledger at our print price.</span></div><div className="field"><label>Deadline</label><input type="date" value={f.deadline} onChange={(e) => setF((x) => ({ ...x, deadline: e.target.value }))} /></div></div>
        <div className="field"><label>Notes</label><textarea rows={2} value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} /></div>
        {err && <div className="notice bad">{err}</div>}
        <div className="row"><button className="pbtn primary" disabled={busy || !f.listingId} onClick={() => void create()}>{busy ? 'Creating…' : 'Create run'}</button><button className="pbtn ghost" onClick={onClose}>Cancel</button></div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

interface PO { id: string; number: string; status: string; lines: { catalogKey: string; title: string; quantity: number; wholesaleCents: number; shipTo: { retailerName: string; qty: number; orderNumber: string; address: Record<string, string> }[] }[]; unitsTotal: number; wholesaleCents: number; commissionCents: number; netCents: number; sentAt: string | null; acknowledgedAt: string | null; fulfilledAt: string | null; notes: string | null; createdAt: string; partner: { id: string; name: string; contactEmail: string | null }; cycle: { id: string; name: string; inStoreDate: string } }

export function PodPurchaseOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const openId = params.get('open');
  const { data, reload } = useLoad<{ purchaseOrders: PO[] }>(`/admin/pod/purchase-orders?status=${status === 'all' ? '' : status}`, [status]);
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const sel = data?.purchaseOrders.find((p) => p.id === openId) ?? null;
  const { data: detail } = useLoad<{ events: PodEvent[] }>(sel ? `/admin/pod/purchase-orders/${sel.id}` : null, [sel?.id]);
  const act = async (path: string, body?: unknown) => { try { const r = await api.post<{ mail?: { sent: boolean; to?: string; error?: string } }>(`/admin/pod/purchase-orders/${sel!.id}/${path}`, body); show(r.mail ? (r.mail.sent ? `Sent to ${r.mail.to}` : `Marked sent; email failed: ${r.mail.error}`) : 'Done'); await reload(); void reloadOverview(); } catch (e) { show(errText(e), true); } };
  const patch = async (body: unknown) => { try { await api.patch(`/admin/pod/purchase-orders/${sel!.id}`, body); show('Saved'); await reload(); void reloadOverview(); } catch (e) { show(errText(e), true); } };
  const fmtAddr = (a: Record<string, string>) => [a.company, a.line1, a.line2, [a.city, a.region, a.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return (
    <>
      {node}
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Purchase orders</h2><div className="dim" style={{ fontSize: '.88rem' }}>What publisher-shipped titles owe shops after FOC. Send it, the publisher acknowledges and ships; shop names stay off their copy.</div></div>
        <div className="seg"><button className={status === 'open' ? 'on' : ''} onClick={() => setParams({ status: 'open' })}>Open</button>{Object.keys(PURCHASE_STATUS).map((k) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams({ status: k })}>{PURCHASE_STATUS[k]!.label}</button>)}<button className={status === 'all' ? 'on' : ''} onClick={() => setParams({ status: 'all' })}>All</button></div></div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.purchaseOrders.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No purchase orders" body="Raised at FOC lock for publisher-shipped titles with orders." /></div> : (
          <table className="ptable"><thead><tr><th>PO</th><th>Publisher</th><th>Cycle</th><th>Ship by</th><th className="num">Titles</th><th className="num">Copies</th><th className="num">Wholesale</th><th className="num">Net to publisher</th><th>Status</th></tr></thead><tbody>
            {data.purchaseOrders.map((p) => <tr key={p.id} className="click" onClick={() => setParams({ status, open: p.id })}><td><b>{p.number}</b></td><td>{p.partner.name}</td><td>{p.cycle.name}</td><td>{dateShort(p.cycle.inStoreDate)}</td><td className="num mono">{p.lines.length}</td><td className="num mono">{p.unitsTotal}</td><td className="num mono">{money(p.wholesaleCents)}</td><td className="num mono">{money(p.netCents)}</td><td><TonePill map={PURCHASE_STATUS} status={p.status} /></td></tr>)}
          </tbody></table>
        )}
      </div>
      <Drawer open={Boolean(sel)} onClose={() => setParams({ status })} title={sel?.number ?? ''} width={720}>
        {sel && (
          <>
            <div className="row" style={{ marginBottom: '1rem' }}><TonePill map={PURCHASE_STATUS} status={sel.status} /><span className="dim">{sel.partner.name} · {sel.cycle.name} · ship by {dateShort(sel.cycle.inStoreDate)}</span></div>
            <div className="row" style={{ marginBottom: '1rem' }}>
              {(sel.status === 'DRAFT' || sel.status === 'SENT') && <button className="pbtn glow sm" onClick={() => void act('send')}><Send size={14} /> {sel.status === 'DRAFT' ? 'Send to publisher' : 'Re-send'}</button>}
              {sel.status === 'SENT' && <button className="pbtn soft sm" onClick={() => void patch({ status: 'ACKNOWLEDGED' })}>Mark acknowledged</button>}
              {(sel.status === 'SENT' || sel.status === 'ACKNOWLEDGED') && <button className="pbtn primary sm" onClick={() => void patch({ status: 'FULFILLED' })}>Mark shipped</button>}
              {sel.status !== 'FULFILLED' && sel.status !== 'CANCELLED' && <button className="pbtn ghost sm" onClick={() => { if (confirm('Cancel this purchase order?')) void patch({ status: 'CANCELLED' }); }}>Cancel</button>}
            </div>
            <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
              <div className="panel tight"><div className="eyebrow">Copies</div><div className="display-md mono">{sel.unitsTotal}</div></div>
              <div className="panel tight"><div className="eyebrow">Wholesale</div><div className="display-md mono">{money(sel.wholesaleCents)}</div><div className="dim" style={{ fontSize: '.78rem' }}>commission {money(sel.commissionCents)}</div></div>
              <div className="panel tight"><div className="eyebrow">Net to publisher</div><div className="display-md mono">{money(sel.netCents)}</div></div>
            </div>
            {sel.lines.map((ln) => (
              <div key={ln.catalogKey} className="panel tight" style={{ marginBottom: '.75rem' }}>
                <div className="between"><b>{ln.title} <span className="key">{ln.catalogKey}</span></b><b className="mono">{ln.quantity} copies · {money(ln.wholesaleCents)}</b></div>
                <table className="ptable" style={{ marginTop: '.5rem' }}><thead><tr><th>Shop</th><th>Order</th><th>Ship to</th><th className="num">Qty</th></tr></thead><tbody>{ln.shipTo.map((s, i) => <tr key={i}><td>{s.retailerName}</td><td className="dim">{s.orderNumber}</td><td style={{ fontSize: '.84rem' }}>{fmtAddr(s.address)}</td><td className="num mono">{s.qty}</td></tr>)}</tbody></table>
              </div>
            ))}
            {sel.notes && <div className="notice info" style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{sel.notes}</div>}
            <div className="panel"><h3>History</h3><div style={{ marginTop: '.5rem' }}><Events events={detail?.events ?? []} /></div></div>
          </>
        )}
      </Drawer>
    </>
  );
}
