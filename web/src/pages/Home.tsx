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
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <h1>Custom Comic &amp; Graphic Novel Printing</h1>
          <p>
            Professional short-run and bulk printing for independent creators, publishers, and studios.
            Soft-cover, hard-cover, trade paperbacks &mdash; printed and shipped from the US.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/shop" className="btn">Shop printing services</Link>
            <Link to="/shop/graphic-novels" className="btn secondary">Graphic novels</Link>
          </div>
        </div>
      </section>

      {/* Service categories */}
      <section className="container" style={{ padding: '3rem 0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2>What we print</h2>
          <p className="muted">Four core services &mdash; every one custom-quoted per run.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {[
            { slug: 'comic-books', name: 'Comic Books', blurb: 'Saddle-stitched, soft-cover, 24-32 pages.' },
            { slug: 'graphic-novels', name: 'Graphic Novels', blurb: 'Perfect-bound, soft or hard cover.' },
            { slug: 'manga', name: 'Manga', blurb: 'Right-to-left or left-to-right bound.' },
            { slug: 'zines', name: 'Zines', blurb: 'Short runs, stapled and folded.' },
            { slug: 'artist-tools', name: 'Artist Tools', blurb: 'Sketchbooks, templates, panel pads.' },
          ].map((c) => (
            <Link
              key={c.slug}
              to={`/shop/${c.slug}`}
              className="product-card"
              style={{ textAlign: 'center', padding: '2rem 1rem' }}
            >
              <h3 style={{ color: 'var(--brand)' }}>{c.name}</h3>
              <p className="muted" style={{ margin: 0 }}>{c.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      {products.length > 0 && (
        <section className="container" style={{ padding: '3rem 0' }}>
          <div className="spread" style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Popular services</h2>
            <Link to="/shop">View all &rarr;</Link>
          </div>
          <div className="product-grid" style={{ paddingTop: 0 }}>
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
                  {p.shortDescription && <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>{p.shortDescription}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Why us */}
      <section style={{ background: 'var(--bg-alt)', padding: '3rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2>Why creators choose us</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
            {[
              { title: 'Quality printing', body: 'Full-color interiors, premium papers, and pro binding on every run. Real print-shop gear, not POD.' },
              { title: 'Volume discounts', body: 'Pricing tiers kick in automatically at 50+, 100+, and 500+ units. No hidden fees.' },
              { title: 'Fulfilment', body: 'Let us store and ship your print run direct to backers, fans, and stores.' },
              { title: 'US-based', body: 'Printed and shipped from the United States. Real people on the phone and email.' },
            ].map((f) => (
              <div key={f.title}>
                <h3 style={{ color: 'var(--brand)' }}>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="container" style={{ padding: '3rem 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2>How it works</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {[
            { n: '1', title: 'Pick your product', body: 'Comic book, graphic novel, TPB, or hardcover.' },
            { n: '2', title: 'Set your specs', body: 'Page count, cover type, interior color, quantity.' },
            { n: '3', title: 'Upload your files', body: 'Send us print-ready PDFs. We review before printing.' },
            { n: '4', title: 'We print + ship', body: 'Direct to you, or fulfil direct to your backers.' },
          ].map((step) => (
            <div key={step.n} style={{ textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56, height: 56,
                borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 700,
                marginBottom: '1rem',
              }}>{step.n}</div>
              <h3>{step.title}</h3>
              <p className="muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Crowdfunding promo */}
      <section style={{ background: '#0a1f3d', color: '#fff', padding: '3rem 0' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '.85rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.75, marginBottom: '.5rem' }}>Crowdfunding</div>
            <h2 style={{ color: '#fff', margin: '0 0 .75rem' }}>Print-and-fulfill for your next campaign.</h2>
            <p style={{ opacity: 0.9, marginBottom: '1.25rem' }}>
              We print, pick, pack, and ship your Kickstarter or IndieGoGo rewards. One partner,
              one invoice, one timeline — no broker in the middle.
            </p>
            <Link to="/crowdfunding" className="btn" style={{ background: '#fff', color: '#0a1f3d' }}>Learn more →</Link>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #1e74fc 0%, #7b2cbf 100%)',
            borderRadius: 16,
            padding: '2rem',
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.9 }}>Free with every campaign</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '.5rem' }}>Sample pack + proof</div>
            <div style={{ opacity: 0.85, marginTop: '.5rem', fontSize: '.95rem' }}>See and feel the paper before you commit.</div>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ background: 'var(--brand)', padding: '3rem 0', color: '#fff', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ color: '#fff', marginBottom: '.5rem' }}>Ready to print?</h2>
          <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>Browse our services or get in touch for a custom quote.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/shop" className="btn" style={{ background: '#fff', color: 'var(--brand)' }}>Browse services</Link>
            <Link to="/contact" className="btn secondary" style={{ borderColor: '#fff', color: '#fff' }}>Contact us</Link>
          </div>
        </div>
      </section>
    </>
  );
}
