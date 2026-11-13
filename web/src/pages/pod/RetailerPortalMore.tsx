/**
 * The rest of the retailer portal: store information (contact, ship-to,
 * resale certificate), catalog downloads, and returns & damages.
 */
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Download, FileText, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { withViewAs } from '../../lib/view-as';
import { money, dateShort, RETURN_STATUS, CYCLE_STATUS, type PublicSettings } from '../../lib/pod';
import { DropZone, Empty, Kpi, Pill, TonePill, errText, useFlash, useLoad } from '../../components/pod/ui';

interface Me { retailer: { id: string; name: string; contactName: string | null; contactEmail: string; phone: string | null; website: string | null; address: Record<string, string> | null; tierOverride: number | null; resaleCertStatus: string; resaleCertNumber: string | null; resaleCertState: string | null; resaleCertExpires: string | null; taxExempt: boolean; creditCents: number; taxId: string | null }; settings: PublicSettings }
const useMe = () => useOutletContext<{ me: Me | null; reload: () => Promise<void> }>();
const US = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export function RetailerProfile() {
  const { me, reload } = useMe();
  const { show, node } = useFlash();
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const r = me?.retailer;
  const form = f ?? (r ? { name: r.name, taxId: r.taxId ?? '', contactName: r.contactName ?? '', phone: r.phone ?? '', website: r.website ?? '', line1: r.address?.line1 ?? '', line2: r.address?.line2 ?? '', city: r.address?.city ?? '', region: r.address?.region ?? '', postalCode: r.address?.postalCode ?? '', resaleCertNumber: r.resaleCertNumber ?? '', resaleCertState: r.resaleCertState ?? '', resaleCertExpires: r.resaleCertExpires ? r.resaleCertExpires.slice(0, 10) : '' } : null);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...(form ?? {}), [k]: e.target.value });
  const save = async () => { if (!form) return; setBusy('save'); try { await api.patch('/pod/retailer/profile', { name: form.name, taxId: form.taxId || null, contactName: form.contactName, phone: form.phone, website: form.website, address: { line1: form.line1, line2: form.line2, city: form.city, region: form.region, postalCode: form.postalCode, country: 'US' }, resaleCertNumber: form.resaleCertNumber || null, resaleCertState: form.resaleCertState || null, resaleCertExpires: form.resaleCertExpires || null }); show('Saved'); setF(null); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const uploadCert = async (file: File) => { setBusy('cert'); try { const fd = new FormData(); fd.append('file', file); if (form?.resaleCertNumber) fd.append('number', form.resaleCertNumber); if (form?.resaleCertState) fd.append('state', form.resaleCertState); await api.postForm('/pod/retailer/resale-certificate', fd); show('Certificate sent for review'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  if (!r || !form) return <p className="dim">Loading…</p>;
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">Store information</div><h1>{r.name}</h1><div className="sub">Who we talk to, where books ship, and your resale certificate.</div></div><button className="pbtn primary" disabled={busy !== null || !f} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save'}</button></div>
      <div className="split">
        <div className="stack">
          <div className="panel"><h3>Store &amp; contact</h3><div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="field span-2"><label>Store / company name</label><input value={form.name} onChange={set('name')} /></div>
            <div className="field"><label>Contact name</label><input value={form.contactName} onChange={set('contactName')} /></div>
            <div className="field"><label>Email</label><input value={r.contactEmail} disabled /><span className="hint">To change the login email, write to us.</span></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
            <div className="field"><label>Website or social</label><input value={form.website} onChange={set('website')} /></div>
          </div></div>
          <div className="panel"><h3>Ship-to address</h3><div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="field span-2"><input value={form.line1} onChange={set('line1')} placeholder="Street" aria-label="Street" /></div>
            <div className="field span-2"><input value={form.line2} onChange={set('line2')} placeholder="Suite (optional)" aria-label="Line 2" /></div>
            <div className="field"><label>City</label><input value={form.city} onChange={set('city')} /></div>
            <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}><div className="field"><label>State</label><select value={form.region} onChange={set('region')}><option value="">—</option>{US.map((s) => <option key={s}>{s}</option>)}</select></div><div className="field"><label>ZIP</label><input value={form.postalCode} onChange={set('postalCode')} /></div></div>
          </div><p className="dim" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Orders already placed keep the address they were placed with.</p></div>
        </div>
        <aside className="stack">
          <div className="panel accent"><h3><ShieldCheck size={16} /> Resale certificate</h3>
            <div className="row" style={{ margin: '.5rem 0' }}><Pill tone={r.resaleCertStatus === 'approved' ? 'green' : r.resaleCertStatus === 'submitted' ? 'amber' : r.resaleCertStatus === 'rejected' ? 'red' : 'slate'}>{r.resaleCertStatus.replace('_', ' ')}</Pill>{r.taxExempt && <Pill tone="green">tax exempt</Pill>}</div>
            <div className="form-grid"><div className="field span-2"><label>Tax ID / EIN <span className="dim">private</span></label><input value={form.taxId} onChange={set('taxId')} /></div><div className="field"><label>Certificate #</label><input value={form.resaleCertNumber} onChange={set('resaleCertNumber')} /></div><div className="field"><label>State</label><select value={form.resaleCertState} onChange={set('resaleCertState')}><option value="">—</option>{US.map((s) => <option key={s}>{s}</option>)}</select></div><div className="field span-2"><label>Expires</label><input type="date" value={form.resaleCertExpires} onChange={set('resaleCertExpires')} /></div></div>
            <div style={{ marginTop: '.75rem' }}><DropZone compact accept="application/pdf,image/*" busy={busy === 'cert'} title="Upload the certificate" hint="PDF or a photo" onFile={(file) => void uploadCert(file)} /></div>
            <p className="dim" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>Tax applies until we approve it. Save the number and state too.</p>
          </div>
          <div className="panel"><h3>Store credit</h3><div className="display-md mono">{money(r.creditCents)}</div><p className="dim tight" style={{ fontSize: '.84rem' }}>From approved returns; it comes off your next order automatically.</p></div>
        </aside>
      </div>
    </>
  );
}

interface DownloadCycle { id: string; slug: string; name: string; status: string; catalogDate: string; focDate: string; inStoreDate: string; orderingOpen: boolean; catalogPdfUrl: string | null; catalogCoverUrl: string | null; titleCount: number; csvUrl: string; myOrder: string | null }

export function RetailerDownloads() {
  const { data } = useLoad<{ cycles: DownloadCycle[] }>('/pod/retailer/downloads');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [year, setYear] = useState('');
  const years = Array.from(new Set((data?.cycles ?? []).map((c) => c.catalogDate.slice(0, 4)))).sort().reverse();
  const cycles = (data?.cycles ?? []).filter((c) => (scope === 'all' || c.orderingOpen || c.status === 'PUBLISHED') && (!year || c.catalogDate.startsWith(year)));
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Downloads</div><h1>Catalogs &amp; order sheets</h1><div className="sub">The designed catalog for each cycle, and the spreadsheet with your wholesale prices that you can fill in and upload back as your order.</div></div></div>
      <div className="panel accent" style={{ marginBottom: '1rem' }}>
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <div className="howit" style={{ gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '.6rem', flex: 1 }}>
            <div className="hs" style={{ padding: '.6rem .8rem' }}><b style={{ fontSize: '.9rem' }}>Download</b><span>Pick the order-ready sheet below.</span></div>
            <div className="hs" style={{ padding: '.6rem .8rem' }}><b style={{ fontSize: '.9rem' }}>Add quantities</b><span>Fill the Quantity column; everything else is already there.</span></div>
            <div className="hs" style={{ padding: '.6rem .8rem' }}><b style={{ fontSize: '.9rem' }}>Upload</b><span>Every line is checked before it lands in your order.</span></div>
          </div>
          <Link to="/retailer/catalog" className="pbtn hot sm">Open fast entry in Order the catalog →</Link>
        </div>
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div className="seg">{[['current', 'Current'], ['all', 'All catalogs']].map(([k, l]) => <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k as 'current' | 'all')}>{l}</button>)}</div>
        <select className="inp" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
      </div>
      {!data ? <p className="dim">Loading…</p> : cycles.length === 0 ? <Empty title="Nothing published yet" body="Catalogs appear here as soon as they are published." /> : (
        <div className="grid cols-auto">
          {cycles.map((c) => (
            <div className="panel" key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {c.catalogCoverUrl ? <img src={c.catalogCoverUrl} alt="" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 10 }} /> : <div className="hero-dark" style={{ aspectRatio: '3/4', borderRadius: 10, display: 'grid', placeItems: 'center', padding: '1rem' }}><div className="grain" /><div className="display-md" style={{ textAlign: 'center' }}>{c.name}</div></div>}
              <div className="between"><b>{c.name}</b><TonePill map={CYCLE_STATUS} status={c.status} /></div>
              <div className="dim" style={{ fontSize: '.8rem' }}>{c.titleCount} titles · FOC {dateShort(c.focDate)} · in store {dateShort(c.inStoreDate)}{c.myOrder ? ` · your order ${c.myOrder}` : ''}</div>
              <div className="row">
                {c.catalogPdfUrl && <a className="pbtn primary sm" href={c.catalogPdfUrl} target="_blank" rel="noreferrer"><FileText size={14} /> Catalog PDF</a>}
                <a className="pbtn soft sm" href={withViewAs(`/api${c.csvUrl}`, 'retailer')}><Download size={14} /> Order sheet</a>
                {c.orderingOpen && <Link to="/retailer/catalog" className="pbtn ghost sm">Order online</Link>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="notice info" style={{ marginTop: '1.25rem' }}><Upload size={18} /><span>Filled a sheet? Upload it from <Link to="/retailer/catalog">Order the catalog</Link> and your quantities load into the basket.</span></div>
    </>
  );
}

interface ReturnsResp { orders: { id: string; number: string; status: string; createdAt: string; cycle: { name: string } | null; allowance: { allowance: number; used: number; remaining: number }; items: { id: string; name: string; quantity: number; unitPriceCents: number; listingId: string | null; claimed: number; remaining: number }[] }[]; claims: { id: string; number: string; status: string; kind: string; quantity: number; creditCents: number; reason: string; reviewNote: string | null; createdAt: string; order: { number: string }; listing: { title: string; catalogKey: string } | null }[]; reasons: { key: string; label: string }[]; creditCents: number }

export function RetailerReturns() {
  const { data, reload } = useLoad<ReturnsResp>('/pod/retailer/returns');
  const { show, node } = useFlash();
  const [sel, setSel] = useState<{ orderId: string; itemId: string } | null>(null);
  const [qty, setQty] = useState('1');
  const [kind, setKind] = useState<'return' | 'damage'>('damage');
  const [reasonKey, setReasonKey] = useState('damaged');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const order = data?.orders.find((o) => o.id === sel?.orderId);
  const item = order?.items.find((i) => i.id === sel?.itemId);
  const submit = async () => {
    if (!sel) return; setBusy(true);
    try { const label = data?.reasons.find((r) => r.key === reasonKey)?.label ?? reasonKey; await api.post('/pod/retailer/returns', { orderId: sel.orderId, orderItemId: sel.itemId, quantity: Number(qty), kind, reason: detail ? `${label}: ${detail}` : label }); show('Claim sent. We will review it and credit your account.'); setSel(null); setDetail(''); setQty('1'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(false); }
  };
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">Returns &amp; damages</div><h1>Claims</h1><div className="sub">Damaged, misprinted or wrong copies can be claimed on any shipped order. Unsold returns are limited per order by your tier. Approved claims become store credit on your next order.</div></div></div>
      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <Kpi label="Store credit" value={money(data?.creditCents ?? 0)} sub="applied to your next order" dark />
        <Kpi label="Open claims" value={(data?.claims ?? []).filter((c) => ['REQUESTED', 'APPROVED', 'RECEIVED'].includes(c.status)).length} />
        <Kpi label="Credited" value={money((data?.claims ?? []).filter((c) => c.status === 'CREDITED').reduce((s, c) => s + c.creditCents, 0))} sub="all time" />
      </div>
      <div className="split">
        <div className="stack">
          <div className="panel"><h3>Start a claim</h3>
            {!data ? <p className="dim">Loading…</p> : data.orders.length === 0 ? <p className="dim" style={{ fontSize: '.9rem' }}>Claims open once an order has been invoiced and shipped.</p> : (
              <div className="stack" style={{ marginTop: '.5rem' }}>
                {data.orders.map((o) => (
                  <div key={o.id} className="panel tight">
                    <div className="between"><b>{o.number}</b><span className="dim" style={{ fontSize: '.8rem' }}>{o.cycle?.name} · returns allowance {o.allowance.remaining} of {o.allowance.allowance} left</span></div>
                    <table className="ptable" style={{ marginTop: '.4rem' }}><tbody>{o.items.map((it) => <tr key={it.id}><td>{it.name}</td><td className="num mono dim">{it.quantity} bought · {it.claimed} claimed</td><td style={{ textAlign: 'right' }}>{it.remaining > 0 ? <button className="pbtn soft xs" onClick={() => { setSel({ orderId: o.id, itemId: it.id }); setQty('1'); }}>Claim</button> : <span className="dim">—</span>}</td></tr>)}</tbody></table>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel flush"><div className="panel-head" style={{ padding: '1rem 1rem 0' }}><h3>Your claims</h3></div>
            {!data ? null : data.claims.length === 0 ? <p className="dim" style={{ padding: '0 1rem 1rem', fontSize: '.9rem' }}>No claims yet.</p> : (
              <table className="ptable"><thead><tr><th>Claim</th><th>Order</th><th>Title</th><th className="num">Copies</th><th className="num">Credit</th><th>Status</th></tr></thead><tbody>
                {data.claims.map((c) => <tr key={c.id}><td><b>{c.number}</b><div className="dim" style={{ fontSize: '.74rem' }}>{c.kind} · {dateShort(c.createdAt)}</div></td><td>{c.order.number}</td><td>{c.listing?.title ?? '—'}<div className="dim" style={{ fontSize: '.74rem' }}>{c.reason}{c.reviewNote ? ` — ${c.reviewNote}` : ''}</div></td><td className="num mono">{c.quantity}</td><td className="num mono">{money(c.creditCents)}</td><td><TonePill map={RETURN_STATUS} status={c.status} /></td></tr>)}
              </tbody></table>
            )}
          </div>
        </div>
        <aside className="panel accent sticky"><h3><RefreshCw size={16} /> Claim details</h3>
          {!item || !order ? <p className="dim" style={{ fontSize: '.9rem' }}>Pick a title on the left.</p> : (
            <div className="stack" style={{ marginTop: '.5rem' }}>
              <div><b>{item.name}</b><div className="dim" style={{ fontSize: '.8rem' }}>Order {order.number} · {item.remaining} of {item.quantity} can be claimed · {money(item.unitPriceCents)} credit each</div></div>
              <div className="field"><label>What happened</label><div className="seg"><button className={kind === 'damage' ? 'on' : ''} onClick={() => { setKind('damage'); setReasonKey('damaged'); }}>Damaged / wrong</button><button className={kind === 'return' ? 'on' : ''} onClick={() => { setKind('return'); setReasonKey('unsold'); }}>Return unsold</button></div></div>
              <div className="field"><label>Reason</label><select value={reasonKey} onChange={(e) => setReasonKey(e.target.value)}>{(data?.reasons ?? []).filter((r) => (kind === 'return' ? r.key === 'unsold' || r.key === 'other' : r.key !== 'unsold')).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
              <div className="field"><label>Copies</label><input type="number" min={1} max={item.remaining} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              <div className="field"><label>Details</label><textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Which copies, what's wrong, box condition…" /></div>
              <div className="money-row total"><span>Credit requested</span><b className="mono">{money(item.unitPriceCents * (Number(qty) || 0))}</b></div>
              <button className="pbtn hot block" disabled={busy || !Number(qty)} onClick={() => void submit()}>{busy ? 'Sending…' : 'Send claim'}</button>
              <button className="pbtn ghost xs block" onClick={() => setSel(null)}>Cancel</button>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}


interface ShipmentRow { id: string; carrier: string | null; service: string | null; trackingCode: string | null; status: string; createdAt: string; weightOz: number | null; order: { id: string; number: string; cycle: { name: string } | null }; units: number; lines: string[] }
const trackUrl = (carrier: string | null, code: string | null) => { if (!code) return null; const c = (carrier ?? '').toLowerCase(); if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${code}`; if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${code}`; if (c.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${code}`; return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${code}`; };

export function RetailerShipments() {
  const { data } = useLoad<{ shipments: ShipmentRow[] }>('/pod/retailer/shipments');
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Shipments</div><h1>On the way</h1><div className="sub">Every box we sent you, with tracking.</div></div></div>
      <div className="panel flush">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.shipments.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="Nothing shipped yet" body="Tracking appears here as soon as an order ships." /></div> : (
          <table className="ptable"><thead><tr><th>Shipped</th><th>Order</th><th>Carrier</th><th>Tracking</th><th className="num">Copies</th><th>Contents</th><th></th></tr></thead><tbody>
            {data.shipments.map((s2) => <tr key={s2.id}><td className="dim">{dateShort(s2.createdAt)}</td><td><Link to={`/retailer/orders/${s2.order.number}`}><b>{s2.order.number}</b></Link><div className="dim" style={{ fontSize: '.74rem' }}>{s2.order.cycle?.name}</div></td><td>{s2.carrier} {s2.service}</td><td className="mono">{s2.trackingCode ?? '—'}</td><td className="num mono">{s2.units}</td><td className="dim" style={{ fontSize: '.8rem' }}>{s2.lines.slice(0, 3).join(', ')}{s2.lines.length > 3 ? ` +${s2.lines.length - 3}` : ''}</td><td>{trackUrl(s2.carrier, s2.trackingCode) && <a className="pbtn soft xs" href={trackUrl(s2.carrier, s2.trackingCode)!} target="_blank" rel="noreferrer">Track</a>}</td></tr>)}
          </tbody></table>
        )}
      </div>
    </>
  );
}
