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

export function AdminProducts() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState('');

  const load = () => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    void api.get<{ products: ProductRow[] }>(`/admin/products${qs}`).then((r) => setProducts(r.products));
  };

  useEffect(() => { load(); }, []);

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
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr><th /><th>Name</th><th>Price</th><th>Stock</th><th>Active</th><th /></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
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
