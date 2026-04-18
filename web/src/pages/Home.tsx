import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api/client';

interface ProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  priceCents: number;
  hasVariants: boolean;
  image: string | null;
  categories: string[];
}

export function Home() {
  const [products, setProducts] = useState<ProductCard[]>([]);

  useEffect(() => {
    void api.get<{ products: ProductCard[] }>('/products?limit=8').then((r) => setProducts(r.products));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Custom Comic &amp; Graphic Novel Printing</h1>
          <p>
            Professional short-run and bulk printing for independent creators, publishers, and studios.
            Soft-cover, hard-cover, trade paperbacks — printed and shipped from the US.
          </p>
          <Link to="/shop" className="btn">Shop printing services</Link>
        </div>
      </section>

      <section className="container">
        <h2 style={{ marginTop: '3rem' }}>Featured products</h2>
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
      </section>

      <section className="container" style={{ padding: '3rem 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
          <div>
            <h3>Quality printing</h3>
            <p className="muted">Full-color interiors, premium papers, and pro binding on every run.</p>
          </div>
          <div>
            <h3>Volume discounts</h3>
            <p className="muted">Pricing tiers automatically applied for orders over 50 units.</p>
          </div>
          <div>
            <h3>Fulfilment services</h3>
            <p className="muted">Let us store and ship your print run direct to backers and fans.</p>
          </div>
        </div>
      </section>
    </>
  );
}
