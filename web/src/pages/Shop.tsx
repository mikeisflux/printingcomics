import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';

interface ProductCard {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  hasVariants: boolean;
  image: string | null;
}

export function Shop() {
  const { category } = useParams();
  const [products, setProducts] = useState<ProductCard[]>([]);

  useEffect(() => {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    void api.get<{ products: ProductCard[] }>(`/products${q}`).then((r) => setProducts(r.products));
  }, [category]);

  return (
    <div className="container" style={{ padding: '2rem 0' }}>
      <h1 style={{ textTransform: 'capitalize' }}>{category ? category.replace(/-/g, ' ') : 'Shop'}</h1>
      {products.length === 0 ? (
        <p className="muted">No products yet.</p>
      ) : (
        <div className="product-grid">
          {products.map((p) => (
            <Link key={p.id} to={`/product/${p.slug}`} className="product-card">
              <div
                className="image"
                style={p.image ? { backgroundImage: `url(${p.image})` } : undefined}
              />
              <div className="body">
                <h3>{p.name}</h3>
                <div className="price">
                  {p.hasVariants ? 'From ' : ''}{formatMoney(p.priceCents)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
