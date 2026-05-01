import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { StatusBadge } from '../Account';

interface Dashboard {
  counts: { orders: number; products: number; users: number; awaitingFulfillment: number; unreadInbox: number; activePartners: number };
  revenueLast30Cents: number;
  revenueLast30Count: number;
  revenueLast24hCents: number;
  revenueLast24hCount: number;
  partnerRevenueLast30Cents: number;
  partnerRevenueLast30Count: number;
  revenueSeries14d: { day: string; totalCents: number }[];
  topProducts: { productId: string; name: string; slug: string; units: number; revenueCents: number }[];
  topCustomers: { userId: string; email: string; name: string | null; orders: number; spentCents: number }[];
  topPartners: { partnerId: string; name: string; slug: string; color: string | null; orders: number; revenueCents: number }[];
  recentOrders: { id: string; number: string; email: string; status: string; paymentStatus: string; totalCents: number; createdAt: string; partner?: { id: string; name: string; color: string | null } | null }[];
  lowStock: { id: string; slug: string; name: string; stock: number }[];
}

export function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    void api.get<Dashboard>('/admin/dashboard').then(setData);
  }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <Stat label="Revenue (30d)" value={formatMoney(data.revenueLast30Cents)} sub={`${data.revenueLast30Count} orders`} />
        <Stat label="Revenue (24h)" value={formatMoney(data.revenueLast24hCents)} sub={`${data.revenueLast24hCount} orders`} />
        <Stat
          label="Partner revenue (30d)"
          value={formatMoney(data.partnerRevenueLast30Cents)}
          sub={`${data.partnerRevenueLast30Count} via API`}
        />
        <Stat label="Active partners" value={String(data.counts.activePartners)} />
        <Stat label="Total orders" value={String(data.counts.orders)} />
        <Stat label="Customers" value={String(data.counts.users)} />
        <Stat label="Active products" value={String(data.counts.products)} />
        <Stat
          label="Awaiting fulfillment"
          value={String(data.counts.awaitingFulfillment)}
          accent={data.counts.awaitingFulfillment > 0 ? '#a16207' : undefined}
        />
        <Stat
          label="Unread inbox"
          value={String(data.counts.unreadInbox)}
          accent={data.counts.unreadInbox > 0 ? '#1e74fc' : undefined}
        />
      </div>

      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Last 14 days revenue</h3>
        <RevenueChart series={data.revenueSeries14d} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Top products (30d)</h3>
          {data.topProducts.length === 0 ? (
            <p className="muted">No paid orders yet.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td><Link to={`/admin/products/${p.productId}`}>{p.name}</Link></td>
                    <td>{p.units}</td>
                    <td>{formatMoney(p.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Top customers (all time)</h3>
          {data.topCustomers.length === 0 ? (
            <p className="muted">No customer purchases yet.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Orders</th><th>Spent</th></tr></thead>
              <tbody>
                {data.topCustomers.map((c) => (
                  <tr key={c.userId}>
                    <td><Link to={`/admin/customers/${c.userId}`}>{c.name || c.email}</Link></td>
                    <td>{c.orders}</td>
                    <td>{formatMoney(c.spentCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <div className="spread" style={{ marginBottom: '.5rem' }}>
            <h3 style={{ margin: 0 }}>Top partners (30d)</h3>
            <Link to="/admin/partners">All partners →</Link>
          </div>
          {data.topPartners.length === 0 ? (
            <p className="muted">No partner orders in the last 30 days.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Partner</th><th>Orders</th><th>Revenue</th></tr></thead>
              <tbody>
                {data.topPartners.map((p) => (
                  <tr key={p.partnerId}>
                    <td>
                      <Link to={`/admin/partners/${p.partnerId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.color ?? '#94a3b8' }} />
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.orders}</td>
                    <td>{formatMoney(p.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="spread" style={{ marginBottom: '.5rem' }}>
          <h3 style={{ margin: 0 }}>Recent orders</h3>
          <Link to="/admin/orders">View all →</Link>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Number</th><th>Email</th><th>Status</th><th>Payment</th><th>Total</th><th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                <td>{o.email}</td>
                <td><StatusBadge status={o.status} /></td>
                <td><StatusBadge status={o.paymentStatus} /></td>
                <td>{formatMoney(o.totalCents)}</td>
                <td>{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.lowStock.length > 0 && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Low stock</h3>
          <ul>
            {data.lowStock.map((p) => (
              <li key={p.id}><Link to={`/admin/products/${p.id}`}>{p.name}</Link> — {p.stock} left</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="admin-card" style={{ margin: 0, padding: '1rem', borderLeft: accent ? `4px solid ${accent}` : undefined }}>
      <div style={{ fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '.25rem', color: accent ?? 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.15rem' }}>{sub}</div>}
    </div>
  );
}

function RevenueChart({ series }: { series: { day: string; totalCents: number }[] }) {
  const max = useMemo(() => Math.max(1, ...series.map((s) => s.totalCents)), [series]);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.3rem', height: 140, marginTop: '.5rem' }}>
      {series.map((s) => {
        const h = Math.max(4, (s.totalCents / max) * 130);
        return (
          <div key={s.day} title={`${s.day} — ${formatMoney(s.totalCents)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.25rem' }}>
            <div style={{
              width: '100%', height: h,
              background: s.totalCents > 0 ? 'linear-gradient(180deg, var(--brand), #8b1518)' : 'var(--bg-alt)',
              borderRadius: 4,
              transition: 'height .4s ease',
            }} />
            <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>{s.day.slice(5)}</div>
          </div>
        );
      })}
    </div>
  );
}
