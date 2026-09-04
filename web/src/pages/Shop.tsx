import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface ProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  priceCents: number;
  hasVariants: boolean;
  image: string | null;
  categories?: string[];
}

interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  heroImageUrl?: string | null;
  iconUrl?: string | null;
  _count: { products: number };
}

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

/**
 * Product grid. Normally reads the category from the route param, but a fixed
 * `categorySlug` can be passed for categories mounted on a static path — without
 * it those render with no category and list the ENTIRE catalog.
 */
export function Shop({ categorySlug }: { categorySlug?: string } = {}) {
  const params0 = useParams();
  const category = categorySlug ?? params0.category;
  const [params] = useSearchParams();
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [allCats, setAllCats] = useState<Category[]>([]);
  const [cat, setCat] = useState<Category | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState<SortKey>('newest');
  useDocumentTitle(cat?.name ?? (search ? `Search: ${search}` : 'Shop'));

  // Sync the search input when the ?q= param changes (e.g. header search navigates here).
  useEffect(() => {
    setSearch(params.get('q') ?? '');
  }, [params]);

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

  useEffect(() => {
    void api.get<{ categories: Category[] }>('/products/_meta/categories').then((r) => setAllCats(r.categories)).catch(() => undefined);
  }, []);

  const visible = useMemo(() => {
    let list = products.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.shortDescription ?? '').toLowerCase().includes(q));
    }
    switch (sort) {
      case 'price-asc': list.sort((a, b) => a.priceCents - b.priceCents); break;
      case 'price-desc': list.sort((a, b) => b.priceCents - a.priceCents); break;
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return list;
  }, [products, search, sort]);

  return (
    <>
      {cat ? (
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
      ) : (
        <section style={{ padding: '2rem 0 1rem' }}>
          <div className="container">
            <h1 style={{ marginBottom: '.25rem' }}>Shop</h1>
            <p className="muted">Browse our full catalog of comic-book printing services.</p>
          </div>
        </section>
      )}

      <div className="container" style={{ padding: '0 1.25rem 3rem', display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '2rem' }}>
        <aside>
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '.5rem', textTransform: 'uppercase', fontSize: '.75rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.05em' }}>
              Categories
            </h4>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
              <Link
                to="/shop"
                style={{
                  padding: '.4rem .65rem', borderRadius: 4, textDecoration: 'none',
                  background: !category ? 'var(--brand)' : 'transparent',
                  color: !category ? '#fff' : 'var(--ink)',
                  fontWeight: !category ? 600 : 500,
                }}
              >
                All products
              </Link>
              {allCats.map((c) => (
                <Link
                  key={c.id}
                  to={`/shop/${c.slug}`}
                  style={{
                    padding: '.4rem .65rem', borderRadius: 4, textDecoration: 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: category === c.slug ? 'var(--brand)' : 'transparent',
                    color: category === c.slug ? '#fff' : 'var(--ink)',
                    fontWeight: category === c.slug ? 600 : 500,
                  }}
                >
                  <span>{c.name}</span>
                  <span style={{ opacity: 0.7, fontSize: '.8rem' }}>({c._count.products})</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <div>
          <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
            <input
              placeholder="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <div className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: '.85rem' }}>Sort:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                style={{ width: 'auto' }}
              >
                <option value="newest">Newest</option>
                <option value="name">Name (A–Z)</option>
                <option value="price-asc">Price (low to high)</option>
                <option value="price-desc">Price (high to low)</option>
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted">
              {search ? 'No products match your search.' : 'No products yet.'}
            </p>
          ) : (
            <div className="product-grid">
              {visible.map((p) => (
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
                    {p.shortDescription && (
                      <p className="muted" style={{ fontSize: '.8rem', marginTop: '.4rem' }}>
                        {p.shortDescription}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
