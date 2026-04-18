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

interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  heroImageUrl?: string | null;
  _count: { products: number };
}

export function Shop() {
  const { category } = useParams();
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [cat, setCat] = useState<Category | null>(null);

  useEffect(() => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    void api.get<{ products: ProductCard[] }>(`/products${qs}`).then((r) => setProducts(r.products));
    if (category) {
      void api.get<{ category: Category }>(`/products/_meta/categories/${category}`)
        .then((r) => setCat(r.category))
        .catch(() => setCat(null));
    } else {
      setCat(null);
    }
  }, [category]);

  return (
    <>
      {cat && (
        <section
          style={{
            background: cat.heroImageUrl
              ? `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(${cat.heroImageUrl}) center/cover no-repeat`
              : 'linear-gradient(135deg, rgba(198, 26, 34, 0.05) 0%, rgba(198, 26, 34, 0.12) 100%)',
            color: cat.heroImageUrl ? '#fff' : 'var(--ink)',
            padding: '3rem 0',
            marginBottom: '1.5rem',
          }}
        >
          <div className="container" style={{ textAlign: 'center' }}>
            <h1 style={{ color: cat.heroImageUrl ? '#fff' : 'var(--ink)' }}>{cat.name}</h1>
            {cat.description && (
              <p style={{ maxWidth: 640, margin: '0 auto', fontSize: '1.1rem', opacity: cat.heroImageUrl ? 0.9 : 0.7 }}>
                {cat.description}
              </p>
            )}
            <p style={{ marginTop: '.5rem', fontSize: '.9rem', opacity: 0.8 }}>
              {cat._count.products} {cat._count.products === 1 ? 'product' : 'products'}
            </p>
          </div>
        </section>
      )}

      <div className="container" style={{ padding: cat ? '0 1.25rem 2rem' : '2rem 0' }}>
        {!cat && <h1 style={{ textTransform: 'capitalize' }}>{category ? category.replace(/-/g, ' ') : 'Shop'}</h1>}

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
    </>
  );
}
