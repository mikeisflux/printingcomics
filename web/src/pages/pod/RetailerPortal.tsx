/**
 * /retailer — the comic-shop portal: the current catalog at wholesale with a
 * live basket and tier meter, CSV download/upload, and past orders.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Receipt, ArrowLeft, Store, RefreshCw, FolderDown, Building2, Truck } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useSeo } from '../../lib/seo';
import { money, dateShort, FORMAT_LABELS, type PublicSettings } from '../../lib/pod';
import { priceBasket } from '../../lib/wholesale';
import { Avatar, Countdown, CoverCard, CycleTimeline, Empty, Kpi, Pill, TierLadder, errText, useFlash, useLoad } from '../../components/pod/ui';

interface Me {
  retailer: { id: string; name: string; contactName: string | null; contactEmail: string; phone: string | null; website: string | null; address: Record<string, string> | null; tierOverride: number | null; resaleCertStatus: string; resaleCertNumber: string | null; resaleCertState: string | null; resaleCertExpires: string | null; taxExempt: boolean; creditCents: number; taxId: string | null; followedPartnerIds: string[] };
  openCycles: { id: string; slug: string; name: string; catalogDate: string; focDate: string; inStoreDate: string }[];
  fromFollowed: { id: string; catalogKey: string; title: string; issueNumber: string | null; msrpCents: number; coverImageUrl: string | null; partner: { name: string } }[];
  recentOrders: { id: string; number: string; status: string; paymentStatus: string; subtotalCents: number; createdAt: string; cycle: { name: string } | null }[];
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
            <NavLink to="/retailer/shipments"><span className="row" style={{ gap: '.5rem' }}><Truck size={16} /> Shipments</span></NavLink>
            <NavLink to="/retailer/returns"><span className="row" style={{ gap: '.5rem' }}><RefreshCw size={16} /> Returns & damages</span></NavLink>
            <NavLink to="/retailer/downloads"><span className="row" style={{ gap: '.5rem' }}><FolderDown size={16} /> Downloads</span></NavLink>
            <NavLink to="/retailer/profile"><span className="row" style={{ gap: '.5rem' }}><Building2 size={16} /> Store information</span></NavLink>
          </nav>
          <div style={{ marginTop: '1.5rem', padding: '.5rem .85rem', fontSize: '.78rem', color: 'var(--p-text-inv-dim)' }}>
            <Link to="/print-on-demand/catalog" style={{ color: 'inherit' }}>Public catalog →</Link><br /><Link to="/account/password" style={{ color: 'inherit' }}>Change password →</Link>
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
        <Kpi label="Store credit" value={money(me.retailer.creditCents)} sub={me.retailer.resaleCertStatus === 'approved' ? 'Resale certificate on file' : me.retailer.resaleCertStatus === 'submitted' ? 'Certificate in review' : 'No resale certificate yet'} to="/retailer/profile" />
        <Kpi label="Your tier" value={me.retailer.tierOverride ? me.settings.tiers[me.retailer.tierOverride - 1]?.name ?? 'Set' : 'By order size'} sub={me.retailer.tierOverride ? 'Fixed for your account' : `${me.settings.tiers.map((t) => `${Math.round(t.discountBps / 100)}%`).join(' · ')}`} dark />
      </div>
      {me.fromFollowed.length > 0 && <div className="panel" style={{ marginBottom: '1.25rem' }}><div className="panel-head"><h3>New from publishers you follow</h3><Link to="/retailer/catalog" className="pbtn ghost xs">Order</Link></div><div className="cover-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>{me.fromFollowed.map((l) => <CoverCard key={l.id} to="/retailer/catalog" url={l.coverImageUrl} title={`${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ''}`} sub={l.partner.name} price={money(l.msrpCents)} />)}</div></div>}
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
          <div className="panel"><div className="panel-head"><h3>Recent orders</h3><Link to="/retailer/orders" className="pbtn ghost xs">All</Link></div>{me.recentOrders.length === 0 ? <p className="dim tight" style={{ fontSize: '.88rem' }}>No orders yet.</p> : me.recentOrders.map((o) => <div key={o.id} className="between" style={{ fontSize: '.86rem', padding: '.35rem 0', borderBottom: '1px dashed var(--p-line)' }}><Link to={`/retailer/orders/${o.number}`}><b>{o.number}</b></Link><span className="dim">{o.cycle?.name}</span><b className="mono">{money(o.subtotalCents)}</b></div>)}</div>
          <div className="panel"><h3>Ship to</h3><p className="tight" style={{ fontSize: '.9rem' }}>{me.retailer.address ? [me.retailer.address.line1, me.retailer.address.line2, [me.retailer.address.city, me.retailer.address.region, me.retailer.address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : 'No address on file'}</p><p className="dim" style={{ fontSize: '.82rem', margin: '.5rem 0 0' }}>{me.settings.retailerShipping.mode === 'flat' ? `Shipping: ${money(me.settings.retailerShipping.flatCents)} per order.` : 'Shipping is billed at cost when the order ships.'} To change the address, <Link to="/contact">write to us</Link>.</p></div>
        </div>
      </div>
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
