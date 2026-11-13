/**
 * /admin/pod/orders — retailer sales orders worked inside the section:
 * search, status filter, totals, detail with lines, shipping charge, pay
 * link, mark paid, cancel. /admin/pod/fulfillment — what is paid and waiting
 * to ship, with weights, tracking entry and a shipping CSV.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Send, Check, Ban, Truck, Download, Copy } from 'lucide-react';
import { api } from '../../../api/client';
import { money, dateShort, dateTime, RETURN_STATUS } from '../../../lib/pod';
import { Drawer, Empty, Events, Kpi, Pill, TonePill, errText, useFlash, useLoad } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

interface Row { id: string; number: string; status: string; paymentStatus: string; subtotalCents: number; shippingCents: number; totalCents: number; createdAt: string; wholesale: { tierName?: string; poNumber?: string | null } | null; retailer: { id: string; name: string } | null; cycle: { id: string; name: string } | null; _count: { items: number; shipments: number } }
interface Detail { order: Row & { email: string; taxCents: number; discountCents: number; notes: string | null; shippingMethod: string | null; shippingAddress: Record<string, string>; retailer: { id: string; name: string; contactEmail: string; creditCents: number } | null; items: { id: string; name: string; quantity: number; unitPriceCents: number; totalCents: number; options: { catalogKey?: string; publisher?: string } | null; wholesale: { msrpCents: number } | null; listing: { id: string; catalogKey: string; partner: { name: string } } | null }[]; shipments: { id: string; carrier: string | null; service: string | null; trackingCode: string | null; status: string; createdAt: string }[]; payments: { id: string; provider: string; status: string; amountCents: number; createdAt: string }[]; events: { id: string; kind: string; message: string | null; actorName: string | null; createdAt: string }[]; retailerReturns: { id: string; number: string; status: string; quantity: number; creditCents: number; kind: string }[] }; payLink: string | null; paymentMethods: { key: string; label: string }[] }

const tone = (s: string) => ({ PENDING: 'amber', PAID: 'teal', IN_PRODUCTION: 'violet', SHIPPED: 'green', DELIVERED: 'green', CANCELLED: 'slate', REFUNDED: 'slate' } as Record<string, string>)[s] ?? 'slate';

export function PodOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const openId = params.get('open');
  const [q, setQ] = useState('');
  const { data, reload } = useLoad<{ orders: Row[]; totals: { count: number; wholesaleCents: number; unpaidCount: number; unpaidCents: number } }>(`/admin/pod/orders?status=${status}&q=${encodeURIComponent(q)}`, [status, q]);
  const { data: det, reload: reloadDetail } = useLoad<Detail>(openId ? `/admin/pod/orders/${openId}` : null, [openId]);
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [busy, setBusy] = useState(false);
  const [ship, setShip] = useState('');
  const [pay, setPay] = useState({ provider: 'bank', reference: '' });
  const o = det?.order;
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); show(ok); await Promise.all([reload(), reloadDetail()]); void reloadOverview(); } catch (e) { show(errText(e), true); } finally { setBusy(false); } };
  return (
    <>
      {node}
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Wholesale orders" value={data?.totals.count ?? '—'} sub={`${money(data?.totals.wholesaleCents ?? 0)} wholesale, all time`} />
        <Kpi label="Unpaid" value={data?.totals.unpaidCount ?? '—'} sub={`${money(data?.totals.unpaidCents ?? 0)} outstanding`} tone="hot" to="/admin/pod/orders?status=unpaid" />
        <Kpi label="Awaiting shipment" value={(data?.orders ?? []).filter((r) => r.status === 'PAID').length} sub="paid, not yet shipped" to="/admin/pod/fulfillment" />
        <Kpi label="Shipped" value={(data?.orders ?? []).filter((r) => r.status === 'SHIPPED' || r.status === 'DELIVERED').length} sub="in this list" dark />
      </div>
      <div className="toolbar">
        <div className="seg">{[['', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid'], ['PENDING', 'Pending'], ['PAID', 'Awaiting shipment'], ['SHIPPED', 'Shipped'], ['CANCELLED', 'Cancelled']].map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams(k ? { status: k } : {})}>{l}</button>)}</div>
        <div className="search"><Search size={15} /><input className="inp" placeholder="Order number, shop, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="panel flush scroll-x">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.orders.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No wholesale orders" body="Shops place them from the retailer portal while a catalog is open." /></div> : (
          <table className="ptable"><thead><tr><th>Order</th><th>Shop</th><th>Catalog</th><th>Tier</th><th className="num">Titles</th><th className="num">Wholesale</th><th className="num">Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>
            {data.orders.map((r) => <tr key={r.id} className="click" onClick={() => setParams({ ...(status ? { status } : {}), open: r.id })}><td><b>{r.number}</b>{r.wholesale?.poNumber && <div className="dim" style={{ fontSize: '.74rem' }}>PO {r.wholesale.poNumber}</div>}</td><td>{r.retailer?.name ?? '—'}</td><td>{r.cycle?.name ?? '—'}</td><td>{r.wholesale?.tierName}</td><td className="num mono">{r._count.items}</td><td className="num mono">{money(r.subtotalCents)}</td><td className="num mono">{money(r.totalCents)}</td><td><Pill tone={tone(r.status)}>{r.status.toLowerCase().replace('_', ' ')}</Pill> <Pill tone={r.paymentStatus === 'CAPTURED' ? 'green' : 'amber'}>{r.paymentStatus === 'CAPTURED' ? 'paid' : 'unpaid'}</Pill></td><td className="dim">{dateShort(r.createdAt)}</td></tr>)}
          </tbody></table>
        )}
      </div>
      <Drawer open={Boolean(openId)} onClose={() => setParams(status ? { status } : {})} title={o?.number ?? 'Order'} width={760}>
        {o && (
          <>
            <div className="row" style={{ marginBottom: '1rem' }}><Pill tone={tone(o.status)}>{o.status.toLowerCase().replace('_', ' ')}</Pill><Pill tone={o.paymentStatus === 'CAPTURED' ? 'green' : 'amber'}>{o.paymentStatus === 'CAPTURED' ? 'paid' : 'unpaid'}</Pill>{o.retailer && <Link to={`/admin/pod/retailers/${o.retailer.id}`} className="chip">{o.retailer.name}</Link>}{o.cycle && <Link to={`/admin/pod/cycles/${o.cycle.id}`} className="chip">{o.cycle.name}</Link>}<span className="dim" style={{ fontSize: '.84rem' }}>placed {dateTime(o.createdAt)}{o.wholesale?.tierName ? ` · ${o.wholesale.tierName}` : ''}</span></div>
            <div className="panel flush" style={{ marginBottom: '1rem' }}><table className="ptable"><thead><tr><th>Title</th><th>Publisher</th><th className="num">Cover</th><th className="num">Wholesale</th><th className="num">Qty</th><th className="num">Line</th></tr></thead><tbody>{o.items.map((it) => <tr key={it.id}><td><b>{it.name}</b><div className="dim" style={{ fontSize: '.74rem' }}><span className="key">{it.options?.catalogKey ?? it.listing?.catalogKey}</span></div></td><td className="dim">{it.listing?.partner.name ?? it.options?.publisher}</td><td className="num mono dim">{it.wholesale ? money(it.wholesale.msrpCents) : ''}</td><td className="num mono">{money(it.unitPriceCents)}</td><td className="num mono">{it.quantity}</td><td className="num mono"><b>{money(it.totalCents)}</b></td></tr>)}</tbody></table></div>
            <div className="grid cols-2" style={{ marginBottom: '1rem' }}>
              <div className="panel tight"><h3>Totals</h3><div className="money-row"><span>Wholesale</span><b className="mono">{money(o.subtotalCents)}</b></div>{o.discountCents > 0 && <div className="money-row"><span>Credit / code</span><b className="mono">−{money(o.discountCents)}</b></div>}<div className="money-row"><span>Shipping</span><b className="mono">{money(o.shippingCents)}</b></div><div className="money-row total"><span>Total</span><b className="mono">{money(o.totalCents)}</b></div>
                {o.paymentStatus !== 'CAPTURED' && o.status !== 'CANCELLED' && <div className="row" style={{ marginTop: '.5rem' }}><input className="inp mono" style={{ width: 110 }} placeholder="Shipping $" value={ship} onChange={(e) => setShip(e.target.value)} /><button className="pbtn soft xs" disabled={busy || ship === ''} onClick={() => void run(() => api.post(`/admin/pod/orders/${o.id}/shipping`, { cents: Math.round(Number(ship) * 100) }), 'Shipping set')}>Set shipping</button></div>}
              </div>
              <div className="panel tight"><h3>Ship to</h3><p className="tight" style={{ fontSize: '.88rem' }}>{[o.shippingAddress.company, `${o.shippingAddress.firstName ?? ''} ${o.shippingAddress.lastName ?? ''}`.trim(), o.shippingAddress.line1, o.shippingAddress.line2, [o.shippingAddress.city, o.shippingAddress.region, o.shippingAddress.postalCode].filter(Boolean).join(', '), o.shippingAddress.phone, o.email].filter(Boolean).join(' · ')}</p>{o.notes && <div className="notice info" style={{ marginTop: '.5rem', fontSize: '.84rem' }}>{o.notes}</div>}</div>
            </div>
            {o.paymentStatus !== 'CAPTURED' && o.status !== 'CANCELLED' && (
              <div className="panel accent" style={{ marginBottom: '1rem' }}><h3>Payment</h3>
                <div className="row" style={{ marginTop: '.5rem', flexWrap: 'wrap' }}>
                  <button className="pbtn glow sm" disabled={busy} onClick={() => void run(() => api.post(`/admin/pod/orders/${o.id}/pay-link`), 'Pay link emailed to the shop')}><Send size={14} /> Email pay link</button>
                  {det?.payLink && <button className="pbtn ghost sm" onClick={() => { void navigator.clipboard?.writeText(det.payLink!); show('Pay link copied'); }}><Copy size={14} /> Copy link</button>}
                  <span className="row"><select className="inp" style={{ width: 'auto' }} value={pay.provider} onChange={(e) => setPay((x) => ({ ...x, provider: e.target.value }))}>{(det?.paymentMethods ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select><input className="inp" style={{ width: 150 }} placeholder="Reference" value={pay.reference} onChange={(e) => setPay((x) => ({ ...x, reference: e.target.value }))} /><button className="pbtn primary sm" disabled={busy} onClick={() => void run(() => api.post(`/admin/pod/orders/${o.id}/mark-paid`, pay), 'Marked paid')}><Check size={14} /> Mark paid</button></span>
                  <button className="pbtn danger sm" disabled={busy} onClick={() => { const r = window.prompt('Cancel this order? Reason:'); if (r !== null) void run(() => api.post(`/admin/pod/orders/${o.id}/cancel`, { reason: r }), 'Cancelled'); }}><Ban size={14} /> Cancel</button>
                </div>
              </div>
            )}
            {o.shipments.length > 0 && <div className="panel tight" style={{ marginBottom: '1rem' }}><h3>Shipments</h3>{o.shipments.map((s2) => <div key={s2.id} className="row" style={{ fontSize: '.86rem', padding: '.3rem 0' }}><Truck size={14} /> {s2.carrier} {s2.service} <span className="mono">{s2.trackingCode}</span> <span className="dim">{dateShort(s2.createdAt)}</span></div>)}</div>}
            {o.retailerReturns.length > 0 && <div className="panel tight" style={{ marginBottom: '1rem' }}><h3>Claims</h3>{o.retailerReturns.map((r) => <div key={r.id} className="between" style={{ fontSize: '.86rem', padding: '.3rem 0' }}><span>{r.number} · {r.quantity} copies · {r.kind}</span><span className="row"><TonePill map={RETURN_STATUS} status={r.status} /><b className="mono">{money(r.creditCents)}</b></span></div>)}</div>}
            {o.status === 'PAID' && <Link to={`/admin/pod/fulfillment?open=${o.id}`} className="pbtn soft sm" style={{ marginBottom: '1rem' }}><Truck size={14} /> Ship it from Fulfillment</Link>}
            <div className="panel"><h3>History</h3><div style={{ marginTop: '.5rem' }}><Events events={o.events} /></div></div>
          </>
        )}
      </Drawer>
    </>
  );
}

interface Pending { id: string; number: string; status: string; createdAt: string; shippingAddress: Record<string, string>; retailer: { id: string; name: string; contactEmail: string; phone: string | null } | null; cycle: { name: string; inStoreDate: string } | null; items: { id: string; name: string; quantity: number }[]; shipments: { id: string; trackingCode: string | null; carrier: string | null; createdAt: string }[]; units: number; weightOz: number; weightLb: number; publisherShipsLines: number }

export function PodFulfillment() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const { data, reload } = useLoad<{ pending: Pending[]; recentShipments: { id: string; carrier: string | null; service: string | null; trackingCode: string | null; createdAt: string; order: { id: string; number: string; retailer: { name: string } | null } }[] }>('/admin/pod/fulfillment');
  const { reloadOverview } = useOverview();
  const { show, node } = useFlash();
  const [f, setF] = useState({ carrier: 'USPS', service: '', trackingCode: '', weightOz: '' });
  const [busy, setBusy] = useState(false);
  const sel = data?.pending.find((p) => p.id === openId) ?? null;
  const ship = async () => { if (!sel) return; setBusy(true); try { const r = await api.post<{ mail: { sent: boolean; error?: string } | null }>(`/admin/pod/fulfillment/${sel.id}/ship`, { ...f, weightOz: f.weightOz ? Number(f.weightOz) : sel.weightOz }); show(r.mail?.sent ? 'Shipped · shop emailed the tracking' : 'Shipped'); setParams({}); setF({ carrier: 'USPS', service: '', trackingCode: '', weightOz: '' }); await reload(); void reloadOverview(); } catch (e) { show(errText(e), true); } finally { setBusy(false); } };
  const totalUnits = (data?.pending ?? []).reduce((s, p) => s + p.units, 0);
  return (
    <>
      {node}
      <div className="grid cols-3" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Orders to ship" value={data?.pending.length ?? '—'} sub="paid wholesale orders" tone="hot" />
        <Kpi label="Copies" value={totalUnits} sub={`${Math.round((data?.pending ?? []).reduce((s, p) => s + p.weightLb, 0) * 10) / 10} lb in total`} />
        <Kpi label="Shipped recently" value={data?.recentShipments.length ?? '—'} sub="last 50 shipments" dark />
      </div>
      <div className="toolbar"><div><h2 className="display-md" style={{ margin: 0 }}>Pending shipments</h2><div className="dim" style={{ fontSize: '.88rem' }}>Weights are calculated from each title's weight (or page count). Export the rows for your label tool, then record the tracking here; the shop gets the tracking email.</div></div><a className="pbtn ghost sm" href="/api/admin/pod/fulfillment/export.csv"><Download size={14} /> Export shipping CSV</a></div>
      <div className="panel flush scroll-x" style={{ marginBottom: '1.25rem' }}>
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.pending.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="Nothing waiting to ship" body="Paid wholesale orders show up here." /></div> : (
          <table className="ptable"><thead><tr><th>Order</th><th>Shop</th><th>Ship to</th><th>Catalog</th><th className="num">Copies</th><th className="num">Weight</th><th></th></tr></thead><tbody>
            {data.pending.map((p) => <tr key={p.id}><td><b>{p.number}</b><div className="dim" style={{ fontSize: '.74rem' }}>{dateShort(p.createdAt)}{p.publisherShipsLines ? ` · ${p.publisherShipsLines} publisher-shipped line(s)` : ''}</div></td><td>{p.retailer?.name}</td><td style={{ fontSize: '.84rem' }}>{[p.shippingAddress.line1, p.shippingAddress.line2, [p.shippingAddress.city, p.shippingAddress.region, p.shippingAddress.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</td><td>{p.cycle?.name}<div className="dim" style={{ fontSize: '.74rem' }}>in store {dateShort(p.cycle?.inStoreDate)}</div></td><td className="num mono">{p.units}</td><td className="num mono">{p.weightOz} oz<div className="dim" style={{ fontSize: '.74rem' }}>{p.weightLb} lb</div></td><td><button className="pbtn primary xs" onClick={() => setParams({ open: p.id })}><Truck size={12} /> Ship</button></td></tr>)}
          </tbody></table>
        )}
      </div>
      <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Recent shipments</h3></div>{!data ? null : data.recentShipments.length === 0 ? <p className="dim" style={{ padding: '0 1rem 1rem' }}>None yet.</p> : <table className="ptable"><thead><tr><th>Order</th><th>Shop</th><th>Carrier</th><th>Tracking</th><th>When</th></tr></thead><tbody>{data.recentShipments.map((s2) => <tr key={s2.id}><td><b>{s2.order.number}</b></td><td>{s2.order.retailer?.name}</td><td>{s2.carrier} {s2.service}</td><td className="mono">{s2.trackingCode}</td><td className="dim">{dateTime(s2.createdAt)}</td></tr>)}</tbody></table>}</div>
      <Drawer open={Boolean(sel)} onClose={() => setParams({})} title={sel ? `Ship ${sel.number}` : ''}>
        {sel && (
          <div className="stack">
            <div className="panel tight"><b>{sel.retailer?.name}</b><div style={{ fontSize: '.88rem' }}>{[sel.shippingAddress.line1, sel.shippingAddress.line2, [sel.shippingAddress.city, sel.shippingAddress.region, sel.shippingAddress.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div><ul style={{ margin: '.5rem 0 0', paddingLeft: '1rem', fontSize: '.84rem', color: 'var(--p-text-dim)' }}>{sel.items.map((i) => <li key={i.id}>{i.quantity} × {i.name}</li>)}</ul></div>
            <div className="form-grid"><div className="field"><label>Carrier</label><select value={f.carrier} onChange={(e) => setF((x) => ({ ...x, carrier: e.target.value }))}>{['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></div><div className="field"><label>Service</label><input value={f.service} onChange={(e) => setF((x) => ({ ...x, service: e.target.value }))} placeholder="Ground Advantage, Priority…" /></div><div className="field span-2"><label>Tracking number</label><input className="mono" value={f.trackingCode} onChange={(e) => setF((x) => ({ ...x, trackingCode: e.target.value }))} /></div><div className="field"><label>Weight (oz)</label><input type="number" step="0.1" value={f.weightOz} onChange={(e) => setF((x) => ({ ...x, weightOz: e.target.value }))} placeholder={String(sel.weightOz)} /></div></div>
            <button className="pbtn glow" disabled={busy} onClick={() => void ship()}><Truck size={16} /> {busy ? 'Saving…' : 'Mark shipped & email tracking'}</button>
          </div>
        )}
      </Drawer>
    </>
  );
}
