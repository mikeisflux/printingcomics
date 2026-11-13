/**
 * /admin/pod — the Distribution section shell: a dark "deck" with the
 * section tabs and live counts, then the page. Styled by styles/pod.css
 * (.pod.pod-admin) so it reads as its own product inside the admin.
 */
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { Printer, BookOpen, Calendar, Store, Factory, FileText, HandCoins, ScanLine, Settings, Users, Receipt, Truck, Boxes, RefreshCw, FolderOpen, Barcode, BarChart3, History } from 'lucide-react';
import { useAuth } from '../../../store/auth';
import { can } from '../../../lib/permissions';
import { useLoad } from '../../../components/pod/ui';
import type { Cycle, PodEvent } from '../../../lib/pod';

export interface Overview {
  counts: { toReview: number; changes: number; live: number; retailersPending: number; retailersActive: number; productionOpen: number; purchaseOrdersOpen: number; statementsDraft: number; publishers: number; owedCents: number; retailerOrders30: number; retailerSales30Cents: number; publisherApplications: number; unpaidOrders: number; toShip: number; returnsOpen: number; filesToReview: number };
  cycles: (Cycle & { listingCount: number; orderCount: number })[];
  recentEvents: PodEvent[];
}

export function PodLayout() {
  const { user } = useAuth();
  const full = can(user, 'pod');
  const { data, reload } = useLoad<Overview>(full ? '/admin/pod/overview' : null);
  const c = data?.counts;
  return (
    <div className="pod pod-admin">
      <header className="deck">
        <div className="deck-top">
          <div>
            <h1><Printer size={22} style={{ color: 'var(--p-cyan)' }} /> Distribution</h1>
            <div className="deck-sub">Publisher listings · monthly catalogs · wholesale to comic shops · production and payouts</div>
          </div>
          <a href="/distribution" target="_blank" rel="noreferrer" className="pbtn ghost sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>Public page ↗</a>
        </div>
        <GroupedNav full={full} c={c} />
      </header>
      <div className="body"><Outlet context={{ overview: data, reloadOverview: reload }} /></div>
    </div>
  );
}

export function useOverview() { return useOutletContext<{ overview: Overview | null; reloadOverview: () => Promise<void> }>(); }

/**
 * The section has eighteen pages; one row of tabs does not fit. Pages are
 * grouped: the first row picks a group (its badge is the sum of its pages'
 * badges), the second row lists that group's pages.
 */
type Counts = Overview['counts'] | undefined;
interface Page { to: string; icon: React.ReactNode; label: string; n?: number; end?: boolean; preflightOnly?: boolean }
interface Group { key: string; label: string; icon: React.ReactNode; pages: Page[] }

function groupsFor(c: Counts): Group[] {
  return [
    { key: 'overview', label: 'Overview', icon: <Printer size={15} />, pages: [{ to: '/admin/pod', icon: <Printer size={15} />, label: 'Overview', end: true }] },
    { key: 'catalog', label: 'Catalog', icon: <BookOpen size={15} />, pages: [
      { to: '/admin/pod/listings', icon: <BookOpen size={15} />, label: 'Listings', n: c?.toReview },
      { to: '/admin/pod/publishers', icon: <Users size={15} />, label: 'Publishers', n: c?.publisherApplications },
      { to: '/admin/pod/cycles', icon: <Calendar size={15} />, label: 'Catalog cycles' },
      { to: '/admin/pod/files', icon: <FolderOpen size={15} />, label: 'Files', n: c?.filesToReview },
      { to: '/admin/pod/barcodes', icon: <Barcode size={15} />, label: 'Barcodes' },
    ] },
    { key: 'sales', label: 'Sales', icon: <Store size={15} />, pages: [
      { to: '/admin/pod/retailers', icon: <Store size={15} />, label: 'Retailers', n: c?.retailersPending },
      { to: '/admin/pod/orders', icon: <Receipt size={15} />, label: 'Orders', n: c?.unpaidOrders },
      { to: '/admin/pod/fulfillment', icon: <Truck size={15} />, label: 'Fulfillment', n: c?.toShip },
      { to: '/admin/pod/returns', icon: <RefreshCw size={15} />, label: 'Returns', n: c?.returnsOpen },
    ] },
    { key: 'production', label: 'Production', icon: <Factory size={15} />, pages: [
      { to: '/admin/pod/production', icon: <Factory size={15} />, label: 'Production runs', n: c?.productionOpen },
      { to: '/admin/pod/preflight', icon: <ScanLine size={15} />, label: 'Preflight', preflightOnly: true },
      { to: '/admin/pod/purchase-orders', icon: <FileText size={15} />, label: 'Purchase orders', n: c?.purchaseOrdersOpen },
      { to: '/admin/pod/inventory', icon: <Boxes size={15} />, label: 'Inventory' },
    ] },
    { key: 'money', label: 'Money', icon: <HandCoins size={15} />, pages: [
      { to: '/admin/pod/payouts', icon: <HandCoins size={15} />, label: 'Payouts', n: c?.statementsDraft },
      { to: '/admin/pod/analytics', icon: <BarChart3 size={15} />, label: 'Analytics' },
    ] },
    { key: 'system', label: 'System', icon: <Settings size={15} />, pages: [
      { to: '/admin/pod/activity', icon: <History size={15} />, label: 'Activity log' },
      { to: '/admin/pod/settings', icon: <Settings size={15} />, label: 'Settings' },
    ] },
  ];
}

function GroupedNav({ full, c }: { full: boolean; c: Counts }) {
  const { pathname } = useLocation();
  const groups = groupsFor(c).map((g) => ({ ...g, pages: g.pages.filter((p) => full || p.preflightOnly) })).filter((g) => g.pages.length);
  const active = groups.find((g) => g.pages.some((p) => (p.end ? pathname === p.to || pathname === `${p.to}/` : pathname.startsWith(p.to)))) ?? groups[0]!;
  const sum = (g: Group) => g.pages.reduce((s, p) => s + (p.n ?? 0), 0);
  return (
    <>
      <nav className="tabs groups" aria-label="Distribution areas">
        {groups.map((g) => <NavLink key={g.key} to={g.pages[0]!.to} end={g.pages[0]!.end} className={active.key === g.key ? 'active' : ''}>{g.icon}{g.label}{sum(g) ? <span className="n">{sum(g)}</span> : null}</NavLink>)}
      </nav>
      {active.pages.length > 1 && (
        <nav className="subtabs" aria-label={`${active.label} pages`}>
          {active.pages.map((p) => <NavLink key={p.to} to={p.to} end={p.end}>{p.icon}{p.label}{p.n ? <span className="n">{p.n}</span> : null}</NavLink>)}
        </nav>
      )}
    </>
  );
}
