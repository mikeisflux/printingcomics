/**
 * /admin/pod — the Print On Demand section shell: a dark "deck" with the
 * section tabs and live counts, then the page. Styled by styles/pod.css
 * (.pod.pod-admin) so it reads as its own product inside the admin.
 */
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { Printer, BookOpen, Calendar, Store, Factory, FileText, HandCoins, ScanLine, Settings } from 'lucide-react';
import { useAuth } from '../../../store/auth';
import { can } from '../../../lib/permissions';
import { useLoad } from '../../../components/pod/ui';
import type { Cycle, PodEvent } from '../../../lib/pod';

export interface Overview {
  counts: { toReview: number; changes: number; live: number; retailersPending: number; retailersActive: number; productionOpen: number; purchaseOrdersOpen: number; statementsDraft: number; publishers: number; owedCents: number; retailerOrders30: number; retailerSales30Cents: number };
  cycles: (Cycle & { listingCount: number; orderCount: number })[];
  recentEvents: PodEvent[];
}

export function PodLayout() {
  const { user } = useAuth();
  const full = can(user, 'pod');
  const { data, reload } = useLoad<Overview>(full ? '/admin/pod/overview' : null);
  const c = data?.counts;
  const Tab = ({ to, icon, label, n, end }: { to: string; icon: React.ReactNode; label: string; n?: number; end?: boolean }) => (
    <NavLink to={to} end={end}>{icon}{label}{n ? <span className="n">{n}</span> : null}</NavLink>
  );
  return (
    <div className="pod pod-admin">
      <header className="deck">
        <div className="deck-top">
          <div>
            <h1><Printer size={22} style={{ color: 'var(--p-cyan)' }} /> Print On Demand</h1>
            <div className="deck-sub">Publisher listings · monthly catalogs · wholesale to comic shops · production and payouts</div>
          </div>
          <a href="/print-on-demand" target="_blank" rel="noreferrer" className="pbtn ghost sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>Public page ↗</a>
        </div>
        <nav className="tabs">
          {full && <Tab to="/admin/pod" end icon={<Printer size={15} />} label="Overview" />}
          {full && <Tab to="/admin/pod/listings" icon={<BookOpen size={15} />} label="Listings" n={c?.toReview} />}
          {full && <Tab to="/admin/pod/cycles" icon={<Calendar size={15} />} label="Catalog cycles" />}
          {full && <Tab to="/admin/pod/retailers" icon={<Store size={15} />} label="Retailers" n={c?.retailersPending} />}
          {full && <Tab to="/admin/pod/production" icon={<Factory size={15} />} label="Production" n={c?.productionOpen} />}
          {full && <Tab to="/admin/pod/purchase-orders" icon={<FileText size={15} />} label="Purchase orders" n={c?.purchaseOrdersOpen} />}
          {full && <Tab to="/admin/pod/payouts" icon={<HandCoins size={15} />} label="Payouts" n={c?.statementsDraft} />}
          <Tab to="/admin/pod/preflight" icon={<ScanLine size={15} />} label="Preflight" />
          {full && <Tab to="/admin/pod/settings" icon={<Settings size={15} />} label="Settings" />}
        </nav>
      </header>
      <div className="body"><Outlet context={{ overview: data, reloadOverview: reload }} /></div>
    </div>
  );
}

export function useOverview() { return useOutletContext<{ overview: Overview | null; reloadOverview: () => Promise<void> }>(); }
