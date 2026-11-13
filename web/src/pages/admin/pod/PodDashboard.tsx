import { Link } from 'react-router-dom';
import { ArrowRight, Plus, BookOpen, Users, Store, Lock, Truck, FileText } from 'lucide-react';
import { money, dateShort, CYCLE_STATUS } from '../../../lib/pod';
import { CycleTimeline, DaysLeft, Empty, Events, Kpi, TonePill } from '../../../components/pod/ui';
import { useOverview } from './PodLayout';

export function PodDashboard() {
  const { overview } = useOverview();
  const c = overview?.counts;
  const cycles = overview?.cycles ?? [];
  const current = cycles.find((x) => x.status === 'PUBLISHED') ?? cycles.find((x) => x.status === 'OPEN') ?? cycles[0];
  return (
    <>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <span className="dim" style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Quick actions</span>
        <Link to="/admin/pod/listings?status=queue" className="pbtn soft sm"><BookOpen size={14} /> Review queue{c?.toReview ? ` (${c.toReview})` : ''}</Link>
        <Link to="/admin/pod/publishers?view=applications" className="pbtn ghost sm"><Users size={14} /> Add / approve publisher{c?.publisherApplications ? ` (${c.publisherApplications})` : ''}</Link>
        <Link to="/admin/pod/retailers?status=PENDING" className="pbtn ghost sm"><Store size={14} /> Approve retailer{c?.retailersPending ? ` (${c.retailersPending})` : ''}</Link>
        <Link to="/admin/pod/fulfillment" className="pbtn ghost sm"><Truck size={14} /> Ship orders{c?.toShip ? ` (${c.toShip})` : ''}</Link>
        <Link to="/admin/pod/cycles" className="pbtn ghost sm"><Lock size={14} /> Lock a cycle</Link>
        <Link to="/admin/pod/purchase-orders?status=open" className="pbtn ghost sm"><FileText size={14} /> Send purchase orders{c?.purchaseOrdersOpen ? ` (${c.purchaseOrdersOpen})` : ''}</Link>
      </div>
      <div className="grid cols-4" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Listings to review" value={c?.toReview ?? '—'} sub={c?.changes ? `${c.changes} back with publishers for changes` : 'Nothing sent back'} to="/admin/pod/listings?status=queue" tone={c?.toReview ? 'hot' : undefined} />
        <Kpi label="Live titles" value={c?.live ?? '—'} sub={`${c?.publishers ?? 0} publishers listing`} to="/admin/pod/listings?status=LIVE" />
        <Kpi label="Retailer sales · 30d" value={money(c?.retailerSales30Cents ?? 0)} sub={`${c?.retailerOrders30 ?? 0} wholesale orders · ${c?.retailersActive ?? 0} active shops`} to="/admin/pod/retailers" />
        <Kpi label="Owed to publishers" value={money(c?.owedCents ?? 0)} sub={`${c?.statementsDraft ?? 0} draft statements · ${c?.productionOpen ?? 0} runs open`} to="/admin/pod/payouts" dark />
      </div>
      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Catalog cycles</h3><Link to="/admin/pod/cycles" className="pbtn ghost xs">Manage <ArrowRight size={12} /></Link></div>
            {cycles.length === 0 ? <Empty title="No cycle yet" body="Create the first catalog cycle: catalog date, final order cutoff, in-store date." action={<Link to="/admin/pod/cycles?new=1" className="pbtn primary sm"><Plus size={14} /> New cycle</Link>} /> : (
              <>
                {current && <div style={{ marginBottom: '1.25rem' }}><div className="between"><div><b>{current.name}</b> <TonePill map={CYCLE_STATUS} status={current.status} /></div><DaysLeft to={current.focDate} /></div><CycleTimeline catalogDate={current.catalogDate} focDate={current.focDate} inStoreDate={current.inStoreDate} compact /></div>}
                <table className="ptable"><thead><tr><th>Cycle</th><th>Status</th><th>FOC</th><th className="num">Listings</th><th className="num">Orders</th></tr></thead><tbody>
                  {cycles.map((cy) => <tr key={cy.id} className="click" onClick={() => (window.location.href = `/admin/pod/cycles/${cy.id}`)}><td><b>{cy.name}</b></td><td><TonePill map={CYCLE_STATUS} status={cy.status} /></td><td>{dateShort(cy.focDate)}</td><td className="num mono">{cy.listingCount}</td><td className="num mono">{cy.orderCount}</td></tr>)}
                </tbody></table>
              </>
            )}
          </div>
          <div className="grid cols-3">
            <Link to="/admin/pod/retailers?status=PENDING" className="panel" style={{ textDecoration: 'none' }}><div className="eyebrow">Retailers</div><div className="display-md mono">{c?.retailersPending ?? 0}</div><div className="dim" style={{ fontSize: '.85rem' }}>applications waiting</div></Link>
            <Link to="/admin/pod/production?status=open" className="panel" style={{ textDecoration: 'none' }}><div className="eyebrow">Production</div><div className="display-md mono">{c?.productionOpen ?? 0}</div><div className="dim" style={{ fontSize: '.85rem' }}>runs not yet done</div></Link>
            <Link to="/admin/pod/purchase-orders?status=open" className="panel" style={{ textDecoration: 'none' }}><div className="eyebrow">Purchase orders</div><div className="display-md mono">{c?.purchaseOrdersOpen ?? 0}</div><div className="dim" style={{ fontSize: '.85rem' }}>draft or sent</div></Link>
          </div>
        </div>
        <div className="panel"><div className="panel-head"><h3>Latest activity</h3></div><Events events={overview?.recentEvents ?? []} /></div>
      </div>
    </>
  );
}
