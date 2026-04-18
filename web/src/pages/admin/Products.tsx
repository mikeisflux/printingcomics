import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  stock: number;
  active: boolean;
  images: { url: string }[];
}

interface Category { id: string; name: string; }

export function AdminProducts() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [bulkCats, setBulkCats] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const load = () => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    void api.get<{ products: ProductRow[] }>(`/admin/products${qs}`).then((r) => setProducts(r.products));
  };

  useEffect(() => {
    load();
    void api.get<{ categories: Category[] }>('/admin/categories').then((r) => setCategories(r.categories));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const allChecked = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(products.map((p) => p.id)));
  };

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    if (selected.size === 0) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} products? This cannot be undone.`)) return;
    setWorking(true);
    try {
      await api.post('/admin/products/bulk', { ids: Array.from(selected), action, ...extra });
      setSelected(new Set());
      setBulkCats(new Set());
      load();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Products</h1>
        <Link to="/admin/products/new" className="btn">New product</Link>
      </div>
      <div className="admin-card">
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          style={{ display: 'flex', gap: '.5rem' }}
        >
          <input placeholder="Search by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">Search</button>
        </form>
      </div>

      {selected.size > 0 && (
        <div className="admin-card" style={{ background: '#fff8e1', border: '1px solid #f0c65a' }}>
          <div className="spread" style={{ flexWrap: 'wrap', gap: '.75rem' }}>
            <strong>{selected.size} selected</strong>
            <div className="row" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
              <button className="btn secondary" disabled={working} onClick={() => void runBulk('activate')}>Activate</button>
              <button className="btn secondary" disabled={working} onClick={() => void runBulk('deactivate')}>Deactivate</button>
              <button
                className="btn secondary"
                style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                disabled={working}
                onClick={() => void runBulk('delete')}
              >
                Delete
              </button>
              <button className="btn secondary" disabled={working} onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
          <div style={{ marginTop: '.75rem' }}>
            <strong style={{ fontSize: '.85rem' }}>Assign to categories (replaces existing):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', margin: '.5rem 0' }}>
              {categories.map((c) => (
                <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
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
              className="btn"
              disabled={working}
              onClick={() => void runBulk('assign-categories', { categoryIds: Array.from(bulkCats) })}
            >
              Apply categories
            </button>
          </div>
        </div>
      )}

      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  style={{ width: 'auto' }}
                />
              </th>
              <th />
              <th>Name</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    style={{ width: 'auto' }}
                  />
                </td>
                <td>
                  {p.images[0] ? (
                    <img src={p.images[0].url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                  ) : (
                    <div style={{ width: 48, height: 48, background: 'var(--bg-alt)', borderRadius: 4 }} />
                  )}
                </td>
                <td><Link to={`/admin/products/${p.id}`}>{p.name}</Link></td>
                <td>{formatMoney(p.priceCents)}</td>
                <td>{p.stock}</td>
                <td>{p.active ? 'Yes' : 'No'}</td>
                <td><Link to={`/admin/products/${p.id}`}>Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
