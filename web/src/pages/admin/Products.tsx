import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { PageHeader, TableState, errorMessage, rowClick, useConfirm, useDebounced, useToast } from '../../components/admin/ui';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  stock: number;
  active: boolean;
  madeToOrder?: boolean;
  backorder?: boolean;
  images: { url: string }[];
}

interface Category { id: string; name: string; }

export function AdminProducts() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [bulkCats, setBulkCats] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    api.get<{ products: ProductRow[] }>(`/admin/products${qs}`)
      .then((r) => { if (alive) setProducts(r.products); })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load products')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, tick]);

  useEffect(() => {
    void api.get<{ categories: Category[] }>('/admin/categories').then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const allChecked = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(products.map((p) => p.id)));

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    if (selected.size === 0) return;
    const n = selected.size;
    if (action === 'delete') {
      const ok = await confirm({
        title: `Delete ${n} product${n === 1 ? '' : 's'}?`,
        body: 'They disappear from the storefront immediately. Orders that already include them keep their line items. This cannot be undone.',
        confirmLabel: `Delete ${n}`,
        danger: true,
      });
      if (!ok) return;
    }
    setWorking(true);
    try {
      await api.post('/admin/products/bulk', { ids: Array.from(selected), action, ...extra });
      const did: Record<string, string> = {
        activate: 'activated', deactivate: 'deactivated', delete: 'deleted', 'assign-categories': 'moved',
      };
      toast.success(`${n} product${n === 1 ? '' : 's'} ${did[action] ?? 'updated'}.`);
      setSelected(new Set());
      setBulkCats(new Set());
      setTick((t) => t + 1);
    } catch (e) {
      toast.error(errorMessage(e, 'Bulk update failed'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={!loading && !error ? `${products.length} shown` : undefined}
        actions={<Link to="/admin/products/new" className="btn">New product</Link>}
      />

      <div className="admin-card">
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label>Search</label>
            <input type="search" placeholder="Name or SKU" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {q && <button className="btn secondary sm" onClick={() => setQ('')}>Clear</button>}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="admin-card" style={{ background: '#fff8e1', border: '1px solid #f0c65a' }}>
          <div className="spread" style={{ flexWrap: 'wrap', gap: '.75rem' }}>
            <strong>{selected.size} selected</strong>
            <div className="row" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
              <button className="btn secondary sm" disabled={working} onClick={() => void runBulk('activate')}>Activate</button>
              <button className="btn secondary sm" disabled={working} onClick={() => void runBulk('deactivate')}>Deactivate</button>
              <button className="btn secondary danger sm" disabled={working} onClick={() => void runBulk('delete')}>Delete</button>
              <button className="btn secondary sm" disabled={working} onClick={() => setSelected(new Set())}>Clear selection</button>
            </div>
          </div>
          <div style={{ marginTop: '.75rem' }}>
            <strong style={{ fontSize: '.85rem' }}>Move to categories (replaces their current ones):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', margin: '.5rem 0' }}>
              {categories.map((c) => (
                <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={bulkCats.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(bulkCats);
                      if (e.target.checked) next.add(c.id); else next.delete(c.id);
                      setBulkCats(next);
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <button
              className="btn sm"
              disabled={working || bulkCats.size === 0}
              onClick={() => void runBulk('assign-categories', { categoryIds: Array.from(bulkCats) })}
            >
              Apply categories
            </button>
          </div>
        </div>
      )}

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ width: 'auto' }} aria-label="Select all" />
              </th>
              <th style={{ width: 60 }} />
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading}
              error={error}
              count={products.length}
              colSpan={6}
              empty={query ? 'No products match.' : 'No products yet.'}
            />
            {!loading && !error && products.map((p) => (
              <tr key={p.id} className="clickable" onClick={rowClick(() => navigate(`/admin/products/${p.id}`))} style={{ opacity: p.active ? 1 : .6 }}>
                <td>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ width: 'auto' }} aria-label={`Select ${p.name}`} />
                </td>
                <td>
                  {p.images[0] ? (
                    <img src={p.images[0].url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                  ) : (
                    <div style={{ width: 44, height: 44, background: 'var(--bg-alt)', borderRadius: 4 }} />
                  )}
                </td>
                <td>
                  <Link to={`/admin/products/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                  <div className="muted" style={{ fontSize: '.78rem' }}>{p.slug}</div>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.priceCents)}</td>
                <td>
                  {p.madeToOrder ? <span className="muted">made to order</span>
                    : p.backorder ? <span style={{ color: '#b45309', fontWeight: 600 }}>backorder</span>
                    : p.stock}
                </td>
                <td>
                  {p.active
                    ? <span className="badge paid">Live</span>
                    : <span className="badge">Hidden</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
