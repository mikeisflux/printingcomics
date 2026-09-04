import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useDocumentTitle, useMetaDescription } from '../hooks/useDocumentTitle';
import { formatEta } from './Product';

/**
 * Shipping Supplies — the Comic Armor site folded into the storefront.
 *
 * Deliberately NOT the print configurator: these are stock goods with no
 * artwork, proof or file-prep step. It also uses its own product grid rather
 * than the generic Shop page, which brings its own heading, sidebar, search
 * and sort — wrong furniture for a branded landing page, and the reason an
 * earlier pass listed the entire catalog here.
 *
 * Copy, layout, palette, type scale and the camo artwork are ported from the
 * Comic Armor theme (front-page.php + style.css) rather than approximated, so
 * this reads as the same brand. Every rule is scoped under `.ca` so none of it
 * leaks into the rest of the storefront.
 *
 * The two things NOT ported are the theme's demo testimonials and its demo
 * stat counters: those were placeholders, and inventing customer quotes or
 * success rates on a live store isn't something we should ship. The
 * testimonial band reads the real, moderated review feed and hides itself
 * until reviews are approved.
 */

/** The theme's own MARPAT tile, lifted verbatim from `.camo-overlay::before`. */
const CAMO_SVG =
  "url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\">" +
  '<rect fill="%232d3a2d" x="0" y="0" width="20" height="20"/><rect fill="%234a5d4a" x="20" y="0" width="15" height="25"/>' +
  '<rect fill="%236b5344" x="35" y="0" width="25" height="15"/><rect fill="%232d3a2d" x="60" y="0" width="20" height="20"/>' +
  '<rect fill="%23c4a35a" x="80" y="0" width="20" height="15"/><rect fill="%234a5d4a" x="0" y="20" width="25" height="20"/>' +
  '<rect fill="%232d3a2d" x="25" y="15" width="20" height="25"/><rect fill="%23c4a35a" x="45" y="15" width="15" height="20"/>' +
  '<rect fill="%234a5d4a" x="60" y="20" width="25" height="15"/><rect fill="%236b5344" x="85" y="15" width="15" height="25"/>' +
  '<rect fill="%236b5344" x="0" y="40" width="15" height="20"/><rect fill="%23c4a35a" x="15" y="35" width="20" height="15"/>' +
  '<rect fill="%234a5d4a" x="35" y="35" width="15" height="25"/><rect fill="%232d3a2d" x="50" y="35" width="25" height="20"/>' +
  '<rect fill="%23c4a35a" x="75" y="40" width="25" height="15"/><rect fill="%232d3a2d" x="0" y="60" width="20" height="25"/>' +
  '<rect fill="%234a5d4a" x="20" y="50" width="20" height="20"/><rect fill="%236b5344" x="40" y="60" width="15" height="15"/>' +
  '<rect fill="%23c4a35a" x="55" y="55" width="20" height="20"/><rect fill="%234a5d4a" x="75" y="55" width="25" height="25"/>' +
  '<rect fill="%23c4a35a" x="0" y="85" width="15" height="15"/><rect fill="%236b5344" x="15" y="70" width="25" height="15"/>' +
  '<rect fill="%232d3a2d" x="40" y="75" width="20" height="25"/><rect fill="%234a5d4a" x="60" y="75" width="15" height="15"/>' +
  '<rect fill="%232d3a2d" x="75" y="80" width="25" height="20"/></svg>\')';

const CSS = `
.ca {
  --camo-dark:#2d3a2d; --camo-olive:#4a5d4a; --camo-tan:#c4a35a; --camo-brown:#6b5344;
  --camo-black:#1a1f1a; --accent-red:#8b2a2a; --accent-gold:#c9a227;
  --text-light:#f5f0e1; --text-dark:#1a1f1a; --text-muted:#8a8a7a;
  --bg-dark:#1a1f1a; --bg-medium:#2d3a2d; --bg-light:#f5f0e1;
  --ca-head:'Oswald','Impact',sans-serif;
  --ca-body:'Open Sans','Helvetica Neue',sans-serif;
  font-family: var(--ca-body);
  line-height: 1.6;
}
/* :where() keeps these at zero specificity, so the component rules below
   override them by source order instead of needing !important. */
.ca :where(h1,h2,h3,h4) {
  font-family: var(--ca-head); font-weight:700; line-height:1.2;
  text-transform:uppercase; letter-spacing:2px; margin:0;
}
.ca :where(p) { margin:0; }

/* Camo wash — the theme's tile at 15%, sitting behind the content. */
.ca-camo { position:relative; overflow:hidden; }
.ca-camo::before {
  content:''; position:absolute; inset:0;
  background:${CAMO_SVG} repeat;
  background-size:150px 150px; opacity:.15; pointer-events:none; z-index:0;
}
.ca-camo > .container { position:relative; z-index:2; }

.ca-section { padding:6rem 0; }
.ca-dark   { background:var(--bg-dark);   color:var(--text-light); }
.ca-medium { background:var(--bg-medium); color:var(--text-light); }
.ca-light  { background:var(--bg-light);  color:var(--text-dark); }

.ca-header { text-align:center; margin-bottom:4rem; }
.ca-eyebrow {
  font-family:var(--ca-body); font-size:1rem; font-style:italic; color:var(--camo-tan);
  text-transform:uppercase; letter-spacing:3px; margin-bottom:.5rem;
}
.ca-title { font-size:clamp(2rem,5vw,3.5rem); margin-bottom:1rem; }
.ca-title span { color:var(--camo-tan); }
.ca-desc { max-width:700px; margin:0 auto; font-size:1.1rem; opacity:.9; }

/* Buttons */
.ca-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:.5rem;
  font-family:var(--ca-head); font-size:1rem; font-weight:600;
  text-transform:uppercase; letter-spacing:2px; padding:15px 35px;
  border:2px solid transparent; cursor:pointer; transition:all .2s ease; text-decoration:none;
}
.ca-btn-primary { background:var(--camo-tan); color:var(--camo-dark); border-color:var(--camo-tan); }
.ca-btn-primary:hover {
  background:var(--accent-gold); border-color:var(--accent-gold);
  transform:translateY(-2px); box-shadow:0 5px 20px rgba(196,163,90,.4);
}
.ca-btn-outline { background:transparent; color:var(--text-light); border-color:var(--text-light); }
.ca-btn-outline:hover { background:var(--text-light); color:var(--camo-dark); }

/* Hero — the theme's 100vh slider, trimmed because we sit under a site header. */
.ca-hero { position:relative; min-height:min(80vh,620px); background:var(--camo-dark); display:flex; }
.ca-slide {
  position:relative; z-index:10; flex:1; display:flex; flex-direction:column;
  justify-content:center; align-items:center; text-align:center; padding:5rem 2rem 6rem;
}
.ca-slide-sub {
  font-size:1.1rem; font-style:italic; color:var(--camo-tan);
  margin-bottom:1rem; letter-spacing:3px; text-transform:uppercase;
}
.ca-slide-title {
  font-size:clamp(3rem,10vw,7rem); color:var(--text-light); letter-spacing:5px;
  line-height:1; margin-bottom:2rem; text-shadow:4px 4px 8px rgba(0,0,0,.5);
}
.ca-slide-desc { font-size:1.3rem; color:var(--text-light); max-width:600px; margin-bottom:3rem; opacity:.9; }
.ca-slide-buttons { display:flex; gap:2rem; flex-wrap:wrap; justify-content:center; }

.ca-video-frame {
  width:100%; max-width:900px; aspect-ratio:16/9; background:#000;
  border:3px solid var(--camo-tan); box-shadow:0 20px 50px rgba(0,0,0,.5);
}
.ca-video-frame > iframe, .ca-video-frame > video {
  width:100%; height:100%; border:0; display:block; object-fit:cover;
}

.ca-nav {
  position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
  display:flex; align-items:center; gap:1rem; z-index:20;
}
.ca-dot {
  width:12px; height:12px; padding:0; border:2px solid var(--camo-tan);
  background:transparent; cursor:pointer; transition:all .2s ease;
}
.ca-dot[aria-current="true"], .ca-dot:hover { background:var(--camo-tan); }
.ca-arrow {
  width:46px; height:46px; background:rgba(196,163,90,.2); border:2px solid var(--camo-tan);
  color:var(--camo-tan); display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .2s ease; font-size:1.5rem; line-height:1;
}
.ca-arrow:hover { background:var(--camo-tan); color:var(--camo-dark); }

/* Features */
.ca-features { display:grid; grid-template-columns:repeat(4,1fr); gap:2rem; }
.ca-feature {
  text-align:center; padding:4rem 2rem; background:rgba(255,255,255,.03);
  border:1px solid rgba(196,163,90,.2); transition:all .3s ease;
}
.ca-feature:hover { background:rgba(196,163,90,.1); border-color:var(--camo-tan); transform:translateY(-5px); }
.ca-feature-icon {
  width:80px; height:80px; margin:0 auto 2rem; background:var(--camo-tan);
  display:flex; align-items:center; justify-content:center; font-size:2rem; color:var(--camo-dark);
}
.ca-feature h3 { font-size:1.3rem; margin-bottom:1rem; color:var(--text-light); }
.ca-feature p { font-size:.95rem; opacity:.8; line-height:1.7; }

/* Products */
.ca-products-section { background:linear-gradient(180deg, var(--bg-medium) 0%, var(--bg-dark) 100%); color:var(--text-light); }
.ca-products { display:flex; flex-wrap:wrap; gap:2rem; justify-content:center; }
.ca-product {
  width:280px; max-width:100%; background:rgba(26,31,26,.8);
  border:1px solid rgba(196,163,90,.2); transition:all .3s ease; overflow:hidden;
  color:inherit; text-decoration:none;
  /* Cards in a row stretch to the tallest. Column layout + a growing blurb
     pins the price to the bottom instead of leaving a hole under it. */
  display:flex; flex-direction:column;
}
.ca-product:hover { border-color:var(--camo-tan); transform:translateY(-10px); box-shadow:0 20px 40px rgba(0,0,0,.3); }
.ca-product-img { position:relative; padding-top:100%; background:var(--camo-olive); overflow:hidden; }
.ca-product-img img, .ca-product-img .ca-placeholder {
  position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform .3s ease;
}
.ca-product-img .ca-placeholder { display:flex; align-items:center; justify-content:center; font-size:4rem; }
.ca-product:hover .ca-product-img img { transform:scale(1.1); }
.ca-badge {
  position:absolute; top:15px; left:15px; background:var(--accent-red); color:#fff;
  font-family:var(--ca-head); font-size:.75rem; font-weight:700; text-transform:uppercase;
  letter-spacing:1px; padding:5px 12px; z-index:5;
}
.ca-product-info { padding:2rem; text-align:center; display:flex; flex-direction:column; flex:1; }
.ca-product-info h3 { font-size:1.2rem; margin-bottom:1rem; color:var(--text-light); }
.ca-product:hover .ca-product-info h3 { color:var(--camo-tan); }
.ca-product-blurb { font-size:.88rem; opacity:.75; line-height:1.6; margin-bottom:1rem; flex:1; }
.ca-price { font-family:var(--ca-head); font-size:1.4rem; color:var(--camo-tan); }
.ca-eta { font-size:.82rem; color:var(--text-muted); margin-top:.4rem; }

/* How it works */
.ca-steps { display:grid; grid-template-columns:repeat(4,1fr); gap:4rem; position:relative; }
.ca-steps::before {
  content:''; position:absolute; top:50px; left:10%; right:10%;
  height:3px; background:var(--camo-tan); z-index:0;
}
.ca-step { text-align:center; position:relative; z-index:1; }
.ca-step-num {
  width:100px; height:100px; margin:0 auto 2rem; background:var(--camo-dark);
  border:4px solid var(--camo-tan); display:flex; align-items:center; justify-content:center;
  font-family:var(--ca-head); font-size:2.5rem; font-weight:700; color:var(--camo-tan);
}
.ca-step h3 { font-size:1.3rem; color:var(--camo-dark); margin-bottom:1rem; }
.ca-step p { font-size:.95rem; color:var(--text-muted); line-height:1.7; }

/* Mission */
.ca-mission { max-width:820px; margin:0 auto; text-align:center; }
.ca-mission p { font-size:1.05rem; line-height:1.9; opacity:.9; margin-bottom:1.25rem; }

/* Testimonials */
.ca-quote {
  max-width:900px; margin:0 auto; text-align:center; padding:4rem 2rem 0; position:relative;
}
.ca-quote-body {
  font-size:1.4rem; font-style:italic; line-height:1.8; color:var(--text-light);
  margin-bottom:2rem; position:relative;
}
.ca-quote-body::before {
  content:'"'; font-family:Georgia,serif; font-size:6rem; color:var(--camo-tan);
  opacity:.3; position:absolute; top:-64px; left:50%; transform:translateX(-50%);
}
.ca-quote-author { font-family:var(--ca-head); font-size:1.1rem; color:var(--camo-tan); letter-spacing:2px; text-transform:uppercase; }
.ca-stars { color:var(--accent-gold); font-size:1.15rem; letter-spacing:3px; }

/* CTA */
.ca-cta {
  background:linear-gradient(135deg, var(--camo-dark) 0%, var(--camo-olive) 100%);
  text-align:center; padding:6rem 0; color:var(--text-light);
}
.ca-cta h2 { font-size:clamp(2rem,5vw,3.5rem); margin-bottom:1rem; }
.ca-cta p { font-size:1.2rem; opacity:.9; max-width:600px; margin:0 auto 3rem; }

@media (max-width:1200px) {
  .ca-features, .ca-steps { grid-template-columns:repeat(2,1fr); }
  .ca-steps::before { display:none; }
}
@media (max-width:768px) {
  .ca-section { padding:4rem 0; }
  .ca-features, .ca-steps { grid-template-columns:1fr; gap:2rem; }
  .ca-slide-title { letter-spacing:2px; }
  .ca-slide-desc { font-size:1.1rem; }
  .ca-header { margin-bottom:2.5rem; }
}
`;

/** Pull the 11-character id out of any of YouTube's URL shapes. */
function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  return m?.[1] ?? null;
}

interface ProductCard {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  priceCents: number;
  image: string | null;
  backorder?: boolean;
  backorderEta?: string | null;
}

interface PublicReview {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string | null;
}

interface TextSlide {
  kind: 'text';
  title: string;
  subtitle: string;
  description: string;
  buttons: { label: string; target: string }[];
}
type Slide = { kind: 'video'; url: string } | TextSlide;

const TEXT_SLIDES: TextSlide[] = [
  {
    kind: 'text',
    title: 'COMIC ARMOR',
    subtitle: 'Premium Comic Book Protection',
    description:
      'Defend your comics from damage during shipping. Military-grade protection for your valuable collection.',
    buttons: [
      { label: 'Shop Now', target: 'products' },
      { label: 'Watch Demo', target: 'video-section' },
    ],
  },
  {
    kind: 'text',
    title: 'BATTLE TESTED',
    subtitle: 'Proven Protection',
    description: 'Trusted by collectors and dealers worldwide. Your comics deserve the best defense.',
    buttons: [
      { label: 'Learn More', target: 'about-section' },
      { label: 'Reviews', target: 'testimonials' },
    ],
  },
  {
    kind: 'text',
    title: 'SHOP NOW',
    subtitle: 'Gear Up Today',
    description: 'Get your Comic Armor now and ensure your shipments arrive in mint condition.',
    buttons: [{ label: 'Browse Products', target: 'products' }],
  },
];

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: '🛡',
    title: 'Impact Resistant',
    body: 'Heavy-duty construction absorbs shocks and impacts during transit, keeping your comics safe from dings and dents.',
  },
  {
    icon: '🡒🡐',
    title: 'Bend Prevention',
    body: "Rigid backing board prevents corner bends and spine damage that can ruin a comic's grade instantly.",
  },
  {
    icon: '💧',
    title: 'Water Resistant',
    body: 'Moisture-resistant materials protect against water damage from rain, humidity, and unexpected spills.',
  },
  {
    icon: '🪶',
    title: 'Lightweight Design',
    body: 'Adds minimal weight to your shipment, keeping shipping costs low while maximizing protection.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Bag & Board', body: 'Place your comic in a bag with a standard backing board as usual.' },
  { n: '02', title: 'Insert Armor', body: 'Slide the bagged comic between the Comic Armor protective panels.' },
  { n: '03', title: 'Seal & Ship', body: 'Place in your mailer and seal. Your comic is now battle-ready for shipping.' },
  { n: '04', title: 'Arrive Mint', body: 'Your comic arrives in pristine condition, ready to be graded or enjoyed.' },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SectionHeader({
  eyebrow,
  title,
  accent,
  description,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  description?: string;
}) {
  return (
    <div className="ca-header">
      <div className="ca-eyebrow">{eyebrow}</div>
      <h2 className="ca-title">
        {title} <span>{accent}</span>
      </h2>
      {description && <p className="ca-desc">{description}</p>}
    </div>
  );
}

function HeroSlider({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  const count = slides.length;
  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    // A video slide holds the stage until the viewer moves on themselves.
    if (paused || count < 2 || slides[index]?.kind === 'video') return;
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % count), 8000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [paused, count, index, slides]);

  if (count === 0) return null;
  const slide = slides[Math.min(index, count - 1)]!;
  const vid = slide.kind === 'video' ? youtubeId(slide.url) : null;

  return (
    <section
      className="ca-hero ca-camo"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ca-slide">
        {slide.kind === 'video' ? (
          <div className="ca-video-frame">
            {vid ? (
              <iframe
                key={vid}
                src={`https://www.youtube-nocookie.com/embed/${vid}?rel=0&modestbranding=1&playsinline=1`}
                title="Comic Armor"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video key={slide.url} src={slide.url} controls playsInline />
            )}
          </div>
        ) : (
          <>
            <div className="ca-slide-sub">{slide.subtitle}</div>
            <h1 className="ca-slide-title">{slide.title}</h1>
            <p className="ca-slide-desc">{slide.description}</p>
            <div className="ca-slide-buttons">
              {slide.buttons.map((b, i) => (
                <button
                  key={b.label}
                  className={`ca-btn ${i === 0 ? 'ca-btn-primary' : 'ca-btn-outline'}`}
                  onClick={() => scrollToId(b.target)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="ca-nav">
          <button className="ca-arrow" aria-label="Previous slide" onClick={() => go(index - 1)}>‹</button>
          {slides.map((s, i) => (
            <button
              key={i}
              className="ca-dot"
              aria-label={s.kind === 'video' ? 'Show the demo video' : `Show slide: ${s.title}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
          <button className="ca-arrow" aria-label="Next slide" onClick={() => go(index + 1)}>›</button>
        </div>
      )}
    </section>
  );
}

/** Oswald + Open Sans, the theme's faces. Loaded here so only this page pays. */
function useComicArmorFonts() {
  useEffect(() => {
    const href =
      'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700' +
      '&family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }, []);
}

export function ShippingSupplies() {
  // comicarmor.com now redirects here, so this page has to carry the brand's
  // search presence on its own.
  useDocumentTitle('Comic Armor & Shipping Supplies');
  useMetaDescription(
    'Comic Armor protective inserts and adjustable foldable T-mailers — military-grade '
    + 'protection that keeps comics, trades and graphic novels in mint condition in the mail.',
  );
  useComicArmorFonts();

  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [heroVideoUrl, setHeroVideoUrl] = useState('');
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  useEffect(() => {
    // Scoped to this category — never the whole catalog.
    void api
      .get<{ products: ProductCard[] }>('/products?category=shipping-supplies')
      .then((r) => setProducts(r.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoaded(true));

    void api
      .get<{ heroVideoUrl: string }>('/config/shipping-supplies')
      .then((r) => setHeroVideoUrl(r.heroVideoUrl ?? ''))
      .catch(() => setHeroVideoUrl(''));

    void api
      .get<{ reviews: PublicReview[] }>('/reviews?limit=9')
      .then((r) => setReviews(r.reviews ?? []))
      .catch(() => setReviews([]));
  }, []);

  useEffect(() => {
    if (reviews.length < 2) return;
    const t = window.setInterval(() => setReviewIndex((i) => (i + 1) % reviews.length), 7000);
    return () => window.clearInterval(t);
  }, [reviews.length]);

  const slides = useMemo<Slide[]>(
    () => (heroVideoUrl ? [{ kind: 'video' as const, url: heroVideoUrl }, ...TEXT_SLIDES] : TEXT_SLIDES),
    [heroVideoUrl],
  );

  // Keep each product line together and cheapest-first inside it. Sorting on
  // price alone interleaved the Comic Armor packs with the T-mailers, which
  // reads as one jumbled list rather than two ranges.
  const ordered = useMemo(() => {
    const line = (p: ProductCard) => (p.slug.startsWith('comic-armor') ? 0 : 1);
    return [...products].sort((a, b) => line(a) - line(b) || a.priceCents - b.priceCents);
  }, [products]);

  const heroVideoId = heroVideoUrl ? youtubeId(heroVideoUrl) : null;
  const review = reviews[Math.min(reviewIndex, reviews.length - 1)];

  return (
    <div className="ca">
      <style>{CSS}</style>

      <HeroSlider slides={slides} />

      {/* Why Choose Us */}
      <section className="ca-section ca-dark ca-camo">
        <div className="container">
          <SectionHeader
            eyebrow="Why choose us"
            title="Military-Grade"
            accent="Protection"
            description="Our Comic Armor inserts are designed to provide the ultimate protection for your valuable comics during shipping."
          />
          <div className="ca-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="ca-feature">
                <div className="ca-feature-icon" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="ca-section ca-products-section">
        <div className="container">
          <SectionHeader
            eyebrow="Our products"
            title="Gear"
            accent="Up"
            description="Choose the protection level that fits your needs. From single comics to bulk shipments."
          />

          {loaded && ordered.length === 0 && (
            <p className="ca-desc" style={{ textAlign: 'center' }}>
              Products are on the way — check back shortly.
            </p>
          )}

          <div className="ca-products">
            {ordered.map((p) => (
              <Link key={p.id} to={`/product/${p.slug}`} className="ca-product">
                <div className="ca-product-img">
                  {p.image ? (
                    <img src={p.image} alt={p.name} />
                  ) : (
                    <span className="ca-placeholder" aria-hidden="true">🛡</span>
                  )}
                  {p.backorder && <span className="ca-badge">Backorder</span>}
                </div>
                <div className="ca-product-info">
                  <h3>{p.name}</h3>
                  {p.shortDescription && <p className="ca-product-blurb">{p.shortDescription}</p>}
                  <div className="ca-price">{formatMoney(p.priceCents)}</div>
                  {p.backorder && p.backorderEta && (
                    <p className="ca-eta">Ships {formatEta(p.backorderEta)}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="ca-section ca-light">
        <div className="container">
          <SectionHeader
            eyebrow="Simple process"
            title="How It"
            accent="Works"
            description="Protecting your comics is easy with Comic Armor. Just follow these simple steps."
          />
          <div className="ca-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="ca-step">
                <div className="ca-step-num">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Mission */}
      <section id="about-section" className="ca-section ca-dark ca-camo">
        <div className="container">
          <div className="ca-mission">
            <div className="ca-eyebrow">Our mission</div>
            <h2 className="ca-title">Protecting What <span>Matters</span></h2>
            <p>
              Comic Armor was created by collectors, for collectors. We understand the frustration
              of receiving damaged comics in the mail. Our mission is to provide the ultimate
              protection for your valuable comics during shipping.
            </p>
            <p>
              Every Comic Armor insert is designed with military precision to absorb impacts,
              prevent bends, and keep your comics in mint condition from departure to delivery.
            </p>
          </div>
        </div>
      </section>

      {/* Watch Demo */}
      {heroVideoUrl && (
        <section id="video-section" className="ca-section ca-medium">
          <div className="container">
            <SectionHeader eyebrow="See it in action" title="Watch" accent="Demo" />
            <div className="ca-video-frame" style={{ margin: '0 auto' }}>
              {heroVideoId ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${heroVideoId}?rel=0&modestbranding=1&playsinline=1`}
                  title="Comic Armor demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={heroVideoUrl} controls playsInline />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials — real approved reviews only; hidden until there are some */}
      {review && (
        <section id="testimonials" className="ca-section ca-medium ca-camo">
          <div className="container">
            <SectionHeader eyebrow="Testimonials" title="What Collectors" accent="Say" />
            <div className="ca-quote">
              <div className="ca-stars" aria-label={`${review.rating} out of 5 stars`}>
                {'★'.repeat(review.rating)}
                <span style={{ opacity: .25 }}>{'★'.repeat(5 - review.rating)}</span>
              </div>
              {review.body && <p className="ca-quote-body">{review.body}</p>}
              <div className="ca-quote-author">{review.customerName}</div>

              {reviews.length > 1 && (
                <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', marginTop: '2rem' }}>
                  {reviews.map((_, i) => (
                    <button
                      key={i}
                      className="ca-dot"
                      aria-label={`Show review ${i + 1}`}
                      aria-current={i === reviewIndex}
                      onClick={() => setReviewIndex(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="ca-cta">
        <div className="container">
          <h2>Ready to Protect Your Collection?</h2>
          <p>Join the collectors who trust Comic Armor to keep their comics safe during shipping.</p>
          <div className="ca-slide-buttons">
            <button className="ca-btn ca-btn-primary" onClick={() => scrollToId('products')}>
              Shop Now
            </button>
            <Link to="/contact" className="ca-btn ca-btn-outline">Contact Us</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
