/**
 * /admin/pod/cycles — catalog cycles: create, open to publishers, publish
 * (snapshot + live), lock at FOC (production + purchase orders + ledger),
 * reopen, close; /admin/pod/cycles/:id — one cycle end to end.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft, Rocket, Lock, Unlock, Archive, Download, Factory, FileText } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, inputDate, CYCLE_STATUS, LISTING_STATUS, PRODUCTION_STATUS, PURCHASE_STATUS, type Cycle, type Listing, type PodEvent } from '../../../lib/pod';
import { CycleTimeline, DaysLeft, Drawer, Empty, Events, Kpi, Pill, StatusPill, Thumb, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

type CycleForm = { name: string; catalogDate: string; focDate: string; inStoreDate: string; publisherOpen: boolean; notes: string };
const nextMonth = (m: number, d = 1) => { const x = new Date(); x.setMonth(x.getMonth() + m, d); return x.toISOString().slice(0, 10); };
const blankCycle = (): CycleForm => { const d = new Date(); const label = new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleString('en-US', { month: 'long' }); const ship = new Date(d.getFullYear(), d.getMonth() + 3, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); return { name: `${label} for ${ship}`, catalogDate: nextMonth(1), focDate: nextMonth(2), inStoreDate: nextMonth(3, 15), publisherOpen: true, notes: '' }; };

function CycleEditor({ open, onClose, initial, cycleId, onSaved }: { open: boolean; onClose: () => void; initial: CycleForm; cycleId?: string; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(initial); }, [initial, open]);
  const set = (k: keyof CycleForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setErr(null);
    try { if (cycleId) await api.patch(`/admin/pod/cycles/${cycleId}`, f); else await api.post('/admin/pod/cycles', f); onSaved(); onClose(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={cycleId ? 'Edit cycle' : 'New catalog cycle'}>
      <div className="stack">
        <div className="field"><label>Name</label><input value={f.name} onChange={set('name')} placeholder="January for April 2027" /><span className="hint">Shops know cycles as "catalog month for in-store month".</span></div>
        <div className="form-grid">
          <div className="field"><label>Catalog date</label><input type="date" value={f.catalogDate} onChange={set('catalogDate')} /><span className="hint">Listings due; the catalog opens to shops.</span></div>
          <div className="field"><label>Final order cutoff</label><input type="date" value={f.focDate} onChange={set('focDate')} /><span className="hint">Orders lock; production and POs raised.</span></div>
          <div className="field"><label>In-store date</label><input type="date" value={f.inStoreDate} onChange={set('inStoreDate')} /><span className="hint">Books land in shops.</span></div>
          <label className="switch" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.publisherOpen} onChange={(e) => setF((x) => ({ ...x, publisherOpen: e.target.checked }))} /> Open to publishers now</label>
        </div>
        <div className="field"><label>Notes</label><textarea rows={3} value={f.notes} onChange={set('notes')} /></div>
        {f.catalogDate && f.focDate && f.inStoreDate && <CycleTimeline catalogDate={f.catalogDate} focDate={f.focDate} inStoreDate={f.inStoreDate} compact />}
        {err && <div className="notice bad">{err}</div>}
        <div className="row"><button className="pbtn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : cycleId ? 'Save' : 'Create cycle'}</button><button className="pbtn ghost" onClick={onClose}>Cancel</button></div>
      </div>
    </Drawer>
  );
}

export function PodCycles() {
  const [params, setParams] = useSearchParams();
  const { data, reload } = useLoad<{ cycles: Cycle[] }>('/admin/pod/cycles');
  const { reloadOverview } = useOverview();
  const creating = params.get('new') === '1';
  const cycles = data?.cycles ?? [];
  const active = cycles.filter((c) => c.status !== 'CLOSED');
  const closed = cycles.filter((c) => c.status === 'CLOSED');
  const Row = ({ c }: { c: Cycle }) => (
    <tr className="click" onClick={() => (window.location.href = `/admin/pod/cycles/${c.id}`)}>
      <td><b>{c.name}</b><div className="dim" style={{ fontSize: '.78rem' }}>v{c.version}{c.publishedAt ? ` · published ${dateShort(c.publishedAt)}` : ''}</div></td>
      <td><TonePill map={CYCLE_STATUS} status={c.status} />{c.orderingOpen && <> <Pill tone="green" live>open</Pill></>}</td>
      <td>{dateShort(c.catalogDate)}</td><td>{dateShort(c.focDate)} <DaysLeft to={c.focDate} /></td><td>{dateShort(c.inStoreDate)}</td>
      <td className="num mono">{c.listingCount}<span className="dim"> ({c.listingsByStatus.LIVE ?? 0} live)</span></td>
      <td className="num mono">{c.orderCount} · {c.orderedUnits} u</td><td className="num mono">{money(c.wholesaleCents)}</td>
    </tr>
  );
  return (
    <>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Catalog cycles</h2><div className="dim" style={{ fontSize: '.88rem' }}>Three dates per cycle. Publishers list by the catalog date, shops order until FOC, books land in store.</div></div><button className="pbtn primary" onClick={() => setParams({ new: '1' })}><Plus size={16} /> New cycle</button></div>
      <div className="panel flush scroll-x" style={{ marginBottom: '1.25rem' }}>
        {cycles.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No cycles yet" body="Create the first one. Suggested: catalog on the 1st, FOC a month later, in store six weeks after that." action={<button className="pbtn primary sm" onClick={() => setParams({ new: '1' })}><Plus size={14} /> New cycle</button>} /></div> : (
          <table className="ptable"><thead><tr><th>Cycle</th><th>Status</th><th>Catalog</th><th>FOC</th><th>In store</th><th className="num">Listings</th><th className="num">Orders</th><th className="num">Wholesale</th></tr></thead><tbody>{active.map((c) => <Row key={c.id} c={c} />)}{closed.map((c) => <Row key={c.id} c={c} />)}</tbody></table>
        )}
      </div>
      <CycleEditor open={creating} onClose={() => setParams({})} initial={blankCycle()} onSaved={() => { void reload(); void reloadOverview(); }} />
    </>
  );
}

interface CycleDetail {
  cycle: Cycle; listings: (Listing & { ordered: { units: number; wholesaleCents: number } })[]; snapshotCount: number; events: PodEvent[];
  orders: { id: string; number: string; status: string; paymentStatus: string; subtotalCents: number; totalCents: number; createdAt: string; retailer: { id: string; name: string } | null; wholesale: { tierName: string } | null; _count: { items: number } }[];
  production: { id: string; number: string; status: string; totalQty: number; retailerQty: number; partnerAddOnQty: number; printTotalCents: number | null; listing: { title: string; catalogKey: string; partner: { name: string } } }[];
  purchaseOrders: { id: string; number: string; status: string; unitsTotal: number; netCents: number; partner: { name: string } }[];
}

export function PodCycleDetail() {
  const { id = '' } = useParams();
  const { data, reload } = useLoad<CycleDetail>(`/admin/pod/cycles/${id}`, [id]);
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'listings' | 'orders' | 'production' | 'pos'>('listings');
  const c = data?.cycle;
  const act = async (path: string, confirmText?: string, body?: unknown) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(path);
    try { const r = await api.post<{ count?: number; version?: number; summary?: { productionOrders: number; purchaseOrders: number; ledgerEntries: number; units: number } }>(`/admin/pod/cycles/${id}/${path}`, body); show(r.summary ? `Locked: ${r.summary.productionOrders} production run(s), ${r.summary.purchaseOrders} purchase order(s), ${r.summary.units} copies` : r.count != null ? `Published v${r.version}: ${r.count} listings live` : 'Done'); await reload(); void reloadOverview(); } catch (x) { show(errText(x), true); } finally { setBusy(null); }
  };
  const patch = async (body: Record<string, unknown>) => { try { await api.patch(`/admin/pod/cycles/${id}`, body); await reload(); } catch (x) { show(errText(x), true); } };
  if (!c) return <p className="dim">Loading…</p>;
  const eligible = (c.listingsByStatus.APPROVED ?? 0) + (c.listingsByStatus.SCHEDULED ?? 0) + (c.listingsByStatus.LIVE ?? 0);
  return (
    <>
      {node}
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <div><Link to="/admin/pod/cycles" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Cycles</Link><h2 className="display-md" style={{ margin: 0 }}>{c.name}</h2><div className="row" style={{ marginTop: '.4rem' }}><TonePill map={CYCLE_STATUS} status={c.status} />{c.orderingOpen && <Pill tone="green" live>Ordering open</Pill>}<DaysLeft to={c.focDate} /><span className="dim" style={{ fontSize: '.85rem' }}>snapshot v{c.version} · {data.snapshotCount} titles</span></div></div>
        <div className="row">
          <a href={`/api/admin/pod/cycles/${id}/catalog.csv`} className="pbtn ghost sm"><Download size={14} /> Catalog CSV</a>
          <button className="pbtn ghost sm" onClick={() => setEditing(true)}>Edit dates</button>
          {(c.status === 'DRAFT' || c.status === 'OPEN' || c.status === 'PUBLISHED') && <button className="pbtn glow" disabled={busy !== null || !eligible} title={!eligible ? 'Approve some listings first' : ''} onClick={() => void act('publish', c.status === 'PUBLISHED' ? 'Republish? Approved listings go live and the snapshot moves to a new version.' : `Publish ${eligible} approved listing(s)? They go live and shops can order.`)}><Rocket size={16} /> {c.status === 'PUBLISHED' ? 'Republish' : 'Publish catalog'}</button>}
          {c.status === 'PUBLISHED' && <button className="pbtn hot" disabled={busy !== null} onClick={() => void act('lock', `Lock ${c.name} at FOC? Ordering closes; production runs, purchase orders and ledger entries are raised from ${c.orderCount} retailer order(s). This can be re-run safely.`)}><Lock size={16} /> Lock at FOC</button>}
          {c.status === 'FOC_LOCKED' && <><button className="pbtn soft" disabled={busy !== null} onClick={() => void act('lock', 'Re-run the lock to pick up anything missing (safe; adds only what is not there yet)?')}><Lock size={16} /> Re-run lock</button><button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('reopen', 'Reopen ordering after FOC? New orders will need another lock run.')}><Unlock size={16} /> Reopen</button><button className="pbtn ghost" disabled={busy !== null} onClick={() => void act('close', 'Close the cycle? Nothing more can be published or ordered.')}><Archive size={16} /> Close</button></>}
        </div>
      </div>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Listings" value={c.listingCount} sub={Object.entries(c.listingsByStatus).map(([k, n]) => `${n} ${LISTING_STATUS[k as keyof typeof LISTING_STATUS]?.label.toLowerCase() ?? k}`).join(' · ') || 'none attached'} />
        <Kpi label="Retailer orders" value={c.orderCount} sub={`${c.orderedUnits} copies`} />
        <Kpi label="Wholesale" value={money(c.wholesaleCents)} sub="before FOC adjustments" tone="hot" />
        <Kpi label="Raised at lock" value={`${c.productionOrderCount} / ${c.purchaseOrderCount}`} sub="production runs / purchase orders" dark />
      </div>
      <div className="panel" style={{ marginBottom: '1.25rem' }}>
        <div className="between" style={{ marginBottom: '.75rem' }}><h3 style={{ margin: 0 }}>Timeline</h3><div className="row"><label className="switch"><input type="checkbox" checked={c.publisherOpen} onChange={(e) => void patch({ publisherOpen: e.target.checked })} /> Open to publishers</label><label className="switch"><input type="checkbox" checked={c.retailerOpen} disabled={c.status !== 'PUBLISHED'} onChange={(e) => void patch({ retailerOpen: e.target.checked })} /> Retailer ordering</label>{c.status === 'PUBLISHED' && <label className="switch"><input type="checkbox" checked={c.focOverrideOpen} onChange={(e) => void patch({ focOverrideOpen: e.target.checked })} /> Keep open past FOC</label>}</div></div>
        <CycleTimeline catalogDate={c.catalogDate} focDate={c.focDate} inStoreDate={c.inStoreDate} />
        {c.notes && <p className="dim" style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', fontSize: '.9rem' }}>{c.notes}</p>}
      </div>
      <div className="seg" style={{ marginBottom: '1rem' }}>
        <button className={tab === 'listings' ? 'on' : ''} onClick={() => setTab('listings')}>Listings <span className="n">{data.listings.length}</span></button>
        <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Retailer orders <span className="n">{data.orders.length}</span></button>
        <button className={tab === 'production' ? 'on' : ''} onClick={() => setTab('production')}><Factory size={13} /> Production <span className="n">{data.production.length}</span></button>
        <button className={tab === 'pos' ? 'on' : ''} onClick={() => setTab('pos')}><FileText size={13} /> Purchase orders <span className="n">{data.purchaseOrders.length}</span></button>
      </div>
      <div className="split">
        <div className="panel flush scroll-x">
          {tab === 'listings' && (data.listings.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No listings attached" body="Publishers pick this cycle on their listing; staff can set it from the listing editor." /></div> : (
            <table className="ptable"><thead><tr><th></th><th>Title</th><th>Publisher</th><th className="num">Cover</th><th>Status</th><th className="num">Ordered</th><th className="num">Wholesale</th></tr></thead><tbody>
              {data.listings.map((l) => <tr key={l.id} className="click" onClick={() => (window.location.href = `/admin/pod/listings/${l.id}`)}><td style={{ width: 46 }}><Thumb url={l.coverImage?.url} title={l.title} size={34} /></td><td><b>{l.title}{l.issueNumber ? ` #${l.issueNumber}` : ''}</b><div className="dim" style={{ fontSize: '.78rem' }}><span className="key">{l.catalogKey}</span>{l.missingFiles.length ? ` · ${l.missingFiles.length} file(s) missing` : ''}</div></td><td>{l.partner.name}</td><td className="num mono">{money(l.msrpCents)}</td><td><StatusPill status={l.status} /></td><td className="num mono">{l.ordered.units}</td><td className="num mono">{money(l.ordered.wholesaleCents)}</td></tr>)}
            </tbody></table>
          ))}
          {tab === 'orders' && (data.orders.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No retailer orders yet" /></div> : (
            <table className="ptable"><thead><tr><th>Order</th><th>Shop</th><th>Tier</th><th className="num">Lines</th><th className="num">Wholesale</th><th>Status</th><th>Placed</th></tr></thead><tbody>
              {data.orders.map((o) => <tr key={o.id} className="click" onClick={() => (window.location.href = `/admin/orders/${o.id}`)}><td><b>{o.number}</b></td><td>{o.retailer?.name ?? '—'}</td><td>{o.wholesale?.tierName}</td><td className="num mono">{o._count.items}</td><td className="num mono">{money(o.subtotalCents)}</td><td><Pill tone={o.status === 'CANCELLED' ? 'slate' : o.paymentStatus === 'CAPTURED' ? 'green' : 'amber'}>{o.status.toLowerCase()} · {o.paymentStatus.toLowerCase()}</Pill></td><td className="dim">{dateShort(o.createdAt)}</td></tr>)}
            </tbody></table>
          ))}
          {tab === 'production' && (data.production.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No production runs" body={c.status === 'PUBLISHED' ? 'Raised when the cycle locks at FOC.' : undefined} /></div> : (
            <table className="ptable"><thead><tr><th>Run</th><th>Title</th><th>Publisher</th><th className="num">Copies</th><th className="num">Print charge</th><th>Status</th></tr></thead><tbody>
              {data.production.map((p) => <tr key={p.id} className="click" onClick={() => (window.location.href = `/admin/pod/production?open=${p.id}`)}><td><b>{p.number}</b></td><td>{p.listing.title} <span className="key">{p.listing.catalogKey}</span></td><td>{p.listing.partner.name}</td><td className="num mono">{p.totalQty}<span className="dim"> ({p.retailerQty}+{p.partnerAddOnQty})</span></td><td className="num mono">{p.printTotalCents != null ? money(p.printTotalCents) : '—'}</td><td><TonePill map={PRODUCTION_STATUS} status={p.status} /></td></tr>)}
            </tbody></table>
          ))}
          {tab === 'pos' && (data.purchaseOrders.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No purchase orders" body="Only publisher-shipped titles with orders get one, at FOC lock." /></div> : (
            <table className="ptable"><thead><tr><th>PO</th><th>Publisher</th><th className="num">Copies</th><th className="num">Net to publisher</th><th>Status</th></tr></thead><tbody>
              {data.purchaseOrders.map((p) => <tr key={p.id} className="click" onClick={() => (window.location.href = `/admin/pod/purchase-orders?open=${p.id}`)}><td><b>{p.number}</b></td><td>{p.partner.name}</td><td className="num mono">{p.unitsTotal}</td><td className="num mono">{money(p.netCents)}</td><td><TonePill map={PURCHASE_STATUS} status={p.status} /></td></tr>)}
            </tbody></table>
          ))}
        </div>
        <div className="panel"><div className="panel-head"><h3>History</h3></div><Events events={data.events} /></div>
      </div>
      <CycleEditor open={editing} onClose={() => setEditing(false)} cycleId={id} initial={{ name: c.name, catalogDate: inputDate(c.catalogDate), focDate: inputDate(c.focDate), inStoreDate: inputDate(c.inStoreDate), publisherOpen: c.publisherOpen, notes: c.notes ?? '' }} onSaved={() => { void reload(); void reloadOverview(); }} />
    </>
  );
}
