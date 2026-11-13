/**
 * /retailer — the comic-shop portal: the current catalog at wholesale with a
 * live basket and tier meter, CSV download/upload, and past orders.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Receipt, Download, Upload, Search, ArrowLeft, Store, CheckCircle2, X, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useSeo } from '../../lib/seo';
import { money, dateShort, FORMAT_LABELS, type PublicSettings } from '../../lib/pod';
import { priceBasket } from '../../lib/wholesale';
import { Avatar, Countdown, CycleTimeline, DaysLeft, Empty, Kpi, Meter, Pill, Thumb, TierLadder, errText, useFlash, useLoad } from '../../components/pod/ui';

interface Me {
  retailer: { id: string; name: string; contactName: string | null; contactEmail: string; phone: string | null; address: Record<string, string> | null; tierOverride: number | null; resaleCertStatus: string; taxExempt: boolean };
  settings: PublicSettings; cycle: { id: string; slug: string; name: string; catalogDate: string; focDate: string; inStoreDate: string; orderingOpen: boolean } | null;
  totals: { orders: number; wholesaleCents: number }; openOrder: { id: string; number: string; subtotalCents: number; wholesale: { tierName: string }; items: { listingId: string; quantity: number }[] } | null;
}
interface Snapshot { listingId: string; catalogKey: string; title: string; seriesName: string | null; issueNumber: string | null; coverDescription: string | null; upc: string | null; format: string; pageCount: number | null; interiorColor: string | null; msrpCents: number; writer: string | null; artist: string | null; synopsis: string | null; description: string | null; incentiveRatio: string | null; partner: { id: string; name: string }; coverImageUrl: string | null; baseWholesaleCents: number }

export function RetailerLayout() {
  const { user, loaded, load } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => { if (loaded && !user) navigate('/login?redirect=/retailer'); }, [loaded, user, navigate]);
  const { data, error, reload } = useLoad<Me>(loaded && user ? '/pod/retailer/me' : null);
  useSeo({ title: 'Wholesale ordering — Print On Demand', description: 'Order the Print On Demand catalog at wholesale.' });
  if (!loaded || !user) return <div className="pod container" style={{ padding: '3rem' }}><p className="dim">Loading…</p></div>;
  if (error) {
    const pending = /being reviewed/i.test(error);
    return <div className="pod container" style={{ padding: '3rem 1.25rem' }}><Empty title={pending ? 'Your application is in review' : 'This account is not a retailer account'} body={error} action={<div className="row" style={{ justifyContent: 'center' }}>{!pending && <Link to="/print-on-demand/apply?as=retailer" className="pbtn hot">Open a wholesale account</Link>}<Link to="/print-on-demand/catalog" className="pbtn ghost">Browse the catalog</Link></div>} /></div>;
  }
  return (
    <div className="pod">
      <div className="portal">
        <aside className="pside">
          <div className="who"><Avatar name={data?.retailer.name ?? '…'} /><div><b>{data?.retailer.name ?? '…'}</b><small>Wholesale</small></div></div>
          <nav>
            <NavLink to="/retailer" end><span className="row" style={{ gap: '.5rem' }}><LayoutDashboard size={16} /> Overview</span></NavLink>
            <NavLink to="/retailer/catalog"><span className="row" style={{ gap: '.5rem' }}><ShoppingCart size={16} /> Order the catalog</span>{data?.cycle?.orderingOpen && <span className="n" style={{ background: 'var(--p-green)' }}>open</span>}</NavLink>
            <NavLink to="/retailer/orders"><span className="row" style={{ gap: '.5rem' }}><Receipt size={16} /> My orders</span></NavLink>
          </nav>
          <div style={{ marginTop: '1.5rem', padding: '.5rem .85rem', fontSize: '.78rem', color: 'var(--p-text-inv-dim)' }}>
            <Link to="/print-on-demand/catalog" style={{ color: 'inherit' }}>Public catalog →</Link><br /><Link to="/account" style={{ color: 'inherit' }}>My account →</Link>
          </div>
        </aside>
        <main className="pmain"><Outlet context={{ me: data, reload }} /></main>
      </div>
    </div>
  );
}
function useMe() { return useOutletContext<{ me: Me | null; reload: () => Promise<void> }>(); }

export function RetailerDashboard() {
  const { me } = useMe();
  if (!me) return <p className="dim">Loading…</p>;
  const c = me.cycle;
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Overview</div><h1>{me.retailer.name}</h1><div className="sub">{c ? (c.orderingOpen ? <>The <b>{c.name}</b> catalog is open. Final order cutoff {dateShort(c.focDate)}; books land {dateShort(c.inStoreDate)}.</> : <>The <b>{c.name}</b> catalog has passed FOC.</>) : 'No catalog is open for ordering right now.'}</div></div>
        {c?.orderingOpen && <Link to="/retailer/catalog" className="pbtn hot"><ShoppingCart size={16} /> {me.openOrder ? 'Edit my order' : 'Start my order'}</Link>}</div>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="This cycle" value={me.openOrder ? money(me.openOrder.subtotalCents) : '—'} sub={me.openOrder ? `${me.openOrder.number} · ${me.openOrder.wholesale.tierName} · ${me.openOrder.items.reduce((s, i) => s + i.quantity, 0)} copies` : c?.orderingOpen ? 'No order placed yet' : ''} to="/retailer/catalog" tone="hot" />
        <Kpi label="Orders placed" value={me.totals.orders} sub={`${money(me.totals.wholesaleCents)} at wholesale`} to="/retailer/orders" />
        <Kpi label="Resale certificate" value={me.retailer.resaleCertStatus === 'approved' ? 'On file' : me.retailer.resaleCertStatus === 'submitted' ? 'In review' : 'Not on file'} sub={me.retailer.taxExempt ? 'Tax exempt' : 'Tax applies until approved'} />
        <Kpi label="Your tier" value={me.retailer.tierOverride ? me.settings.tiers[me.retailer.tierOverride - 1]?.name ?? 'Set' : 'By order size'} sub={me.retailer.tierOverride ? 'Fixed for your account' : `${me.settings.tiers.map((t) => `${Math.round(t.discountBps / 100)}%`).join(' · ')}`} dark />
      </div>
      <div className="split">
        <div className="panel">
          {c ? <>
            <div className="between"><h3>{c.name}</h3>{c.orderingOpen ? <Pill tone="green" live>Ordering open</Pill> : <Pill tone="amber">FOC passed</Pill>}</div>
            <div style={{ margin: '1rem 0 1.25rem' }}><CycleTimeline catalogDate={c.catalogDate} focDate={c.focDate} inStoreDate={c.inStoreDate} /></div>
            {c.orderingOpen && <div className="hero-dark" style={{ borderRadius: 14, padding: '1rem 1.25rem' }}><div className="grain" /><Countdown to={c.focDate} label="Final order cutoff in" /></div>}
          </> : <Empty title="Between catalogs" body="You'll get an email when the next one opens." />}
        </div>
        <div className="stack">
          <div className="panel accent"><h3>Discount tiers</h3><p className="dim tight" style={{ fontSize: '.86rem', margin: '.25rem 0 .75rem' }}>Set by the order's total at cover price.</p><TierLadder tiers={me.settings.tiers} activeIndex={me.retailer.tierOverride ? me.retailer.tierOverride - 1 : undefined} /></div>
          <div className="panel"><h3>Ship to</h3><p className="tight" style={{ fontSize: '.9rem' }}>{me.retailer.address ? [me.retailer.address.line1, me.retailer.address.line2, [me.retailer.address.city, me.retailer.address.region, me.retailer.address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : 'No address on file'}</p><p className="dim" style={{ fontSize: '.82rem', margin: '.5rem 0 0' }}>{me.settings.retailerShipping.mode === 'flat' ? `Shipping: ${money(me.settings.retailerShipping.flatCents)} per order.` : 'Shipping is billed at cost when the order ships.'} To change the address, <Link to="/contact">write to us</Link>.</p></div>
        </div>
      </div>
    </>
  );
}

export function RetailerCatalog() {
  const { me, reload: reloadMe } = useMe();
  const { data, loading } = useLoad<{ cycle: Me['cycle'] & { status: string }; tiers: PublicSettings['tiers']; forcedTier: number | null; listings: Snapshot[] }>('/pod/retailer/catalog');
  const { show, node } = useFlash();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [publisher, setPublisher] = useState('');
  const [onlyBasket, setOnlyBasket] = useState(false);
  const [notes, setNotes] = useState('');
  const [po, setPo] = useState('');
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ number: string; replaced: boolean } | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const seeded = useRef(false);
  useEffect(() => { if (!seeded.current && me?.openOrder) { setQty(Object.fromEntries(me.openOrder.items.map((i) => [i.listingId, i.quantity]))); seeded.current = true; } }, [me?.openOrder]);

  const titles = data?.listings ?? [];
  const basket = useMemo(() => priceBasket(qty, titles.map((t) => ({ listingId: t.listingId, catalogKey: t.catalogKey, title: t.title, msrpCents: t.msrpCents, incentiveRatio: t.incentiveRatio })), data?.tiers ?? me?.settings.tiers ?? [], data?.forcedTier ?? me?.retailer.tierOverride), [qty, titles, data, me]);
  const publishers = useMemo(() => Array.from(new Map(titles.map((t) => [t.partner.id, t.partner])).values()).sort((a, b) => a.name.localeCompare(b.name)), [titles]);
  const shown = titles.filter((t) => (!publisher || t.partner.id === publisher) && (!onlyBasket || (qty[t.listingId] ?? 0) > 0) && (!q || [t.title, t.seriesName, t.writer, t.artist, t.partner.name, t.catalogKey, t.upc].some((x) => x?.toLowerCase().includes(q.toLowerCase()))));
  const setQ1 = (id: string, v: number) => setQty((m) => ({ ...m, [id]: Math.max(0, Math.min(100_000, Math.floor(v) || 0)) }));

  // Ask the server for the authoritative price (incentive rules, min order) when the basket settles.
  useEffect(() => {
    if (!data?.cycle || !basket.units) { setServerProblems([]); return; }
    const t = window.setTimeout(() => { api.post<{ pricing: { problems: string[] } }>('/pod/retailer/basket/preview', { cycleId: data.cycle!.id, quantities: qty }).then((r) => setServerProblems(r.pricing.problems)).catch(() => undefined); }, 500);
    return () => window.clearTimeout(t);
  }, [qty, data?.cycle, basket.units]);

  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api.postForm<{ quantities: Record<string, number>; matched: number; problems: string[] }>('/pod/retailer/basket/upload', fd); setQty(r.quantities); show(`${r.matched} titles loaded from the sheet${r.problems.length ? `; ${r.problems.length} rows skipped` : ''}`, r.problems.length > 0); if (r.problems.length) setServerProblems(r.problems); } catch (x) { show(errText(x), true); }
  };
  const place = async () => {
    if (!data?.cycle) return; setBusy(true);
    try { const r = await api.post<{ order: { number: string }; replaced: boolean }>('/pod/retailer/orders', { cycleId: data.cycle.id, quantities: qty, notes, poNumber: po }); setPlaced({ number: r.order.number, replaced: r.replaced }); void reloadMe(); } catch (x) { show(errText(x), true); } finally { setBusy(false); }
  };

  if (placed) {
    return (
      <div className="panel rise" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: 640, margin: '2rem auto' }}>
        <CheckCircle2 size={48} style={{ color: 'var(--p-green)' }} /><h1 className="display-md" style={{ marginTop: '.75rem' }}>{placed.replaced ? 'Order updated' : 'Order placed'}</h1>
        <p className="dim" style={{ margin: '.5rem auto 1.5rem', maxWidth: '46ch' }}>{placed.number} · {basket.units} copies · {money(basket.subtotalCents)} at {basket.tier.tier.name}. You can change it until final order cutoff; we invoice and print after that.</p>
        <div className="row" style={{ justifyContent: 'center' }}><Link to={`/retailer/orders/${placed.number}`} className="pbtn primary">View the order</Link><button className="pbtn ghost" onClick={() => setPlaced(null)}>Keep editing</button></div>
      </div>
    );
  }
  const c = data?.cycle;
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">Order the catalog</div><h1>{c?.name ?? 'Catalog'}</h1>{c && <div className="row" style={{ marginTop: '.4rem' }}>{c.orderingOpen ? <Pill tone="green" live>Ordering open</Pill> : <Pill tone="amber">Ordering closed</Pill>}<DaysLeft to={c.focDate} /><span className="dim" style={{ fontSize: '.88rem' }}>FOC {dateShort(c.focDate)} · in store {dateShort(c.inStoreDate)}</span></div>}</div>
        <div className="row">
          <a href="/api/pod/retailer/catalog.csv" className="pbtn ghost sm"><Download size={14} /> Download order sheet</a>
          <label className="pbtn soft sm" style={{ cursor: 'pointer' }}><Upload size={14} /> Upload filled sheet<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ''; }} /></label>
        </div></div>
      {!c ? <Empty title="No catalog is open" body="You'll get an email when the next one opens for ordering." /> : (
        <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
          <div>
            <div className="toolbar" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.75rem' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}><Search size={16} style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--p-text-dim)' }} /><input className="inp" style={{ paddingLeft: '2.2rem' }} placeholder="Search title, creator, publisher, UPC…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <select className="inp" style={{ width: 'auto' }} value={publisher} onChange={(e) => setPublisher(e.target.value)}><option value="">All publishers</option>{publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <label className="switch"><input type="checkbox" checked={onlyBasket} onChange={(e) => setOnlyBasket(e.target.checked)} /> In my order only</label>
            </div>
            <div className="panel flush scroll-x">
              {loading && !data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading the catalog…</p> : (
                <table className="ptable">
                  <thead><tr><th></th><th>Title</th><th>Publisher</th><th className="num">Cover</th><th className="num">Your price</th><th style={{ textAlign: 'center' }}>Qty</th><th className="num">Line</th></tr></thead>
                  <tbody>
                    {shown.map((t) => {
                      const unit = Math.round((t.msrpCents * (10_000 - basket.tier.tier.discountBps)) / 10_000);
                      const n = qty[t.listingId] ?? 0;
                      return (
                        <tr key={t.listingId} style={n ? { background: 'rgba(124,92,255,.05)' } : undefined}>
                          <td style={{ width: 46 }}><Thumb url={t.coverImageUrl} title={t.title} size={34} /></td>
                          <td><b>{t.title}{t.issueNumber ? ` #${t.issueNumber}` : ''}</b><div className="dim" style={{ fontSize: '.78rem' }}>{[t.coverDescription && !/^main/i.test(t.coverDescription) ? t.coverDescription : null, FORMAT_LABELS[t.format], t.pageCount ? `${t.pageCount}pp` : null, t.writer].filter(Boolean).join(' · ')}{t.incentiveRatio && <> · <Pill tone="rose">{t.incentiveRatio}</Pill></>}</div></td>
                          <td className="dim" style={{ fontSize: '.86rem' }}>{t.partner.name}</td>
                          <td className="num mono dim">{money(t.msrpCents)}</td>
                          <td className="num mono"><b>{money(unit)}</b></td>
                          <td style={{ textAlign: 'center' }}><input className="inp qty mono" type="number" min={0} value={n || ''} placeholder="0" onChange={(e) => setQ1(t.listingId, Number(e.target.value))} disabled={!c.orderingOpen} aria-label={`Quantity for ${t.title}`} /></td>
                          <td className="num mono">{n ? money(unit * n) : <span className="dim">—</span>}</td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={7}><Empty title="Nothing matches" /></td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <aside className="sticky stack">
            <div className="panel accent">
              <div className="between"><h3>Your order</h3>{me?.openOrder && <Pill tone="violet">{me.openOrder.number}</Pill>}</div>
              <div className="display-md mono" style={{ marginTop: '.5rem' }}>{money(basket.subtotalCents)}</div>
              <div className="dim" style={{ fontSize: '.85rem' }}>{basket.units} copies · {money(basket.msrpSubtotalCents)} at cover · you save {money(basket.savingsCents)}</div>
              <div style={{ margin: '1rem 0 .5rem' }}>
                <div className="between" style={{ fontSize: '.82rem', marginBottom: '.35rem' }}><b>{basket.tier.tier.name} · {Math.round(basket.tier.tier.discountBps / 100)}% off</b>{basket.tier.next && !basket.tier.forced && <span className="dim">{money(basket.tier.toNextCents)} more at cover → {basket.tier.next.name}</span>}</div>
                <Meter value={basket.tier.progress} />
              </div>
              {serverProblems.length > 0 && <div className="notice warn" style={{ marginTop: '.75rem', fontSize: '.84rem' }}><div>{serverProblems.map((p, i) => <div key={i}>{p}</div>)}</div></div>}
              <div className="field" style={{ marginTop: '.9rem' }}><label>Your PO number <span className="dim">optional</span></label><input value={po} onChange={(e) => setPo(e.target.value)} /></div>
              <div className="field" style={{ marginTop: '.6rem' }}><label>Notes for us</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <button className="pbtn hot block" style={{ marginTop: '1rem' }} disabled={!c.orderingOpen || !basket.units || busy || serverProblems.length > 0} onClick={() => void place()}>{busy ? 'Placing…' : me?.openOrder ? 'Update my order' : 'Place order'}</button>
              {basket.units > 0 && <button className="pbtn ghost xs block" style={{ marginTop: '.5rem' }} onClick={() => setQty({})}><Trash2 size={12} /> Clear</button>}
              <p className="dim" style={{ fontSize: '.76rem', marginTop: '.75rem' }}>{me?.settings.retailerTerms}</p>
            </div>
            {basket.lines.length > 0 && (
              <div className="panel tight"><b style={{ fontSize: '.84rem' }}>In this order</b>
                {basket.lines.map((l) => <div key={l.title.listingId} className="between" style={{ fontSize: '.82rem', padding: '.3rem 0', borderBottom: '1px dashed var(--p-line)' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.quantity} × {l.title.title}</span><span className="row" style={{ gap: '.4rem' }}><b className="mono">{money(l.totalCents)}</b><button className="pbtn ghost xs" style={{ padding: '.15rem' }} onClick={() => setQ1(l.title.listingId, 0)} aria-label="Remove"><X size={12} /></button></span></div>)}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

interface OrderRow { id: string; number: string; status: string; paymentStatus: string; subtotalCents: number; shippingCents: number; totalCents: number; createdAt: string; wholesale: { tierName: string; discountBps: number; msrpSubtotalCents: number; poNumber: string | null } | null; cycle: { id: string; name: string; focDate: string; inStoreDate: string; status: string } | null; _count: { items: number }; shipments: { trackingCode: string | null; carrier: string | null }[] }

export function RetailerOrders() {
  const { number } = useParams();
  const { data } = useLoad<{ orders: OrderRow[] }>('/pod/retailer/orders');
  const { data: one, reload } = useLoad<{ order: OrderRow & { items: { id: string; name: string; quantity: number; unitPriceCents: number; totalCents: number; wholesale: { msrpCents: number } | null; options: { catalogKey?: string; publisher?: string } | null }[]; shippingAddress: Record<string, string>; events: { id: string; kind: string; message: string | null; createdAt: string }[] }; editable: boolean }>(number ? `/pod/retailer/orders/${number}` : null, [number]);
  const { show, node } = useFlash();
  const [, setParams] = useSearchParams();
  void setParams;
  const tone = (s: string) => ({ PENDING: 'amber', PAID: 'teal', IN_PRODUCTION: 'violet', SHIPPED: 'green', DELIVERED: 'green', CANCELLED: 'slate', REFUNDED: 'slate' } as Record<string, string>)[s] ?? 'slate';
  if (number) {
    const o = one?.order;
    return (
      <>
        {node}
        <div className="ptop"><div><Link to="/retailer/orders" className="pbtn ghost xs" style={{ marginBottom: '.5rem' }}><ArrowLeft size={14} /> Orders</Link><h1>{o?.number ?? '…'}</h1>{o && <div className="row" style={{ marginTop: '.4rem' }}><Pill tone={tone(o.status)}>{o.status.replace('_', ' ').toLowerCase()}</Pill>{o.cycle && <span className="dim">{o.cycle.name} · in store {dateShort(o.cycle.inStoreDate)}</span>}{o.wholesale && <Pill tone="violet">{o.wholesale.tierName}</Pill>}</div>}</div>
          {one?.editable && <div className="row"><Link to="/retailer/catalog" className="pbtn soft">Edit the order</Link><button className="pbtn danger" onClick={async () => { if (!confirm('Cancel this order?')) return; try { await api.post(`/pod/retailer/orders/${number}/cancel`); show('Order cancelled'); await reload(); } catch (x) { show(errText(x), true); } }}>Cancel</button></div>}</div>
        {o && (
          <div className="split">
            <div className="panel flush"><table className="ptable"><thead><tr><th>Title</th><th className="num">Cover</th><th className="num">Wholesale</th><th className="num">Qty</th><th className="num">Total</th></tr></thead><tbody>
              {o.items.map((it) => <tr key={it.id}><td><b>{it.name}</b><div className="dim" style={{ fontSize: '.78rem' }}>{it.options?.publisher} · <span className="key">{it.options?.catalogKey}</span></div></td><td className="num mono dim">{it.wholesale ? money(it.wholesale.msrpCents) : ''}</td><td className="num mono">{money(it.unitPriceCents)}</td><td className="num mono">{it.quantity}</td><td className="num mono"><b>{money(it.totalCents)}</b></td></tr>)}
            </tbody></table></div>
            <aside className="stack sticky">
              <div className="panel"><h3>Totals</h3><div className="money-row"><span>Wholesale subtotal</span><b className="mono">{money(o.subtotalCents)}</b></div><div className="money-row"><span>Shipping</span><b className="mono">{o.shippingCents ? money(o.shippingCents) : 'billed at cost'}</b></div><div className="money-row total"><span>Total</span><b className="mono">{money(o.totalCents)}</b></div>{o.wholesale?.poNumber && <p className="dim" style={{ fontSize: '.84rem' }}>Your PO: {o.wholesale.poNumber}</p>}</div>
              <div className="panel"><h3>Ship to</h3><p className="tight" style={{ fontSize: '.9rem' }}>{[o.shippingAddress.company, o.shippingAddress.line1, o.shippingAddress.line2, [o.shippingAddress.city, o.shippingAddress.region, o.shippingAddress.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>{o.shipments.length > 0 && <div style={{ marginTop: '.5rem' }}>{o.shipments.map((s, i) => <div key={i} className="row" style={{ fontSize: '.86rem' }}><Store size={14} /> {s.carrier} {s.trackingCode}</div>)}</div>}</div>
              <div className="panel"><h3>History</h3><ul className="events" style={{ marginTop: '.5rem' }}>{o.events.map((e) => <li key={e.id}>{e.message ?? e.kind}<span className="when">{new Date(e.createdAt).toLocaleString()}</span></li>)}</ul></div>
            </aside>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div className="ptop"><div><div className="eyebrow">Orders</div><h1>My orders</h1><div className="sub">One order per catalog. Editable until FOC, then invoiced, printed and shipped for the in-store date.</div></div><Link to="/retailer/catalog" className="pbtn hot"><ShoppingCart size={16} /> Order the catalog</Link></div>
      <div className="panel flush">
        {!data ? <p className="dim" style={{ padding: '1.5rem' }}>Loading…</p> : data.orders.length === 0 ? <div style={{ padding: '1.5rem' }}><Empty title="No orders yet" body="Open the catalog and rack some indie books." action={<Link to="/retailer/catalog" className="pbtn primary sm">Order the catalog</Link>} /></div> : (
          <table className="ptable"><thead><tr><th>Order</th><th>Catalog</th><th>Tier</th><th className="num">Titles</th><th className="num">Wholesale</th><th>Status</th><th>Placed</th></tr></thead><tbody>
            {data.orders.map((o) => <tr key={o.id} className="click" onClick={() => (window.location.href = `/retailer/orders/${o.number}`)}><td><b>{o.number}</b></td><td>{o.cycle?.name ?? '—'}</td><td>{o.wholesale?.tierName ?? '—'}</td><td className="num mono">{o._count.items}</td><td className="num mono">{money(o.subtotalCents)}</td><td><Pill tone={tone(o.status)}>{o.status.replace('_', ' ').toLowerCase()}</Pill></td><td className="dim">{dateShort(o.createdAt)}</td></tr>)}
          </tbody></table>
        )}
      </div>
    </>
  );
}
