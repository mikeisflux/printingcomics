import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api/client';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Shipping Supplies — the Comic Armor site folded into the storefront.
 *
 * Deliberately NOT the print configurator: these are stock goods with no
 * artwork, proof or file-prep step. It also uses its own product grid rather
 * than the generic Shop page, which brings its own heading, sidebar, search
 * and sort — wrong furniture for a branded landing page, and the reason an
 * earlier pass listed the entire catalog here.
 *
 * Copy and section order are ported from the Comic Armor theme's front page.
 * The two things NOT ported are its demo testimonials and its demo stat
 * counters: those were theme placeholders, and inventing customer quotes or
 * success rates on a live store isn't something we should ship. The
 * testimonial band below reads the real, moderated review feed instead and
 * hides itself until reviews are approved.
 */

// Comic Armor's palette (theme style.css), so the section reads as its own
// brand inside the site.
const BG_DARK = '#1a1f1a';
const CAMO_DARK = '#2d3a2d';
const GOLD = '#c9a227';
const CREAM = '#f5f0e1';
const RED = '#8b2a2a';

const STENCIL = `"Stencil Std", "Army", Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;

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
}

interface PublicReview {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string | null;
  submittedAt: string | null;
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
    icon: '⤢',
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

/** Camo-ish wash used behind the dark bands, matching the theme's overlay. */
const CAMO_OVERLAY =
  `radial-gradient(circle at 18% 22%, ${CAMO_DARK} 0 12rem, transparent 12.5rem),` +
  `radial-gradient(circle at 78% 68%, ${CAMO_DARK} 0 10rem, transparent 10.5rem),` +
  `radial-gradient(circle at 52% 8%, #23301f 0 8rem, transparent 8.5rem)`;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SectionHeader({
  eyebrow,
  title,
  accent,
  description,
  onDark,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  description?: string;
  onDark: boolean;
}) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2.75rem' }}>
      <span
        style={{
          color: GOLD,
          fontSize: '.8rem',
          letterSpacing: '.2em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {eyebrow}
      </span>
      <h2
        style={{
          fontFamily: STENCIL,
          fontSize: 'clamp(1.9rem, 4vw, 2.6rem)',
          letterSpacing: '.04em',
          margin: '.5rem 0 .75rem',
          color: onDark ? CREAM : BG_DARK,
        }}
      >
        {title} <span style={{ color: GOLD }}>{accent}</span>
      </h2>
      {description && (
        <p
          style={{
            maxWidth: 640,
            margin: '0 auto',
            lineHeight: 1.7,
            color: onDark ? 'rgba(245,240,225,.78)' : 'rgba(26,31,26,.72)',
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

function HeroButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '.8rem 1.6rem',
        borderRadius: 3,
        cursor: 'pointer',
        fontWeight: 700,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        fontSize: '.85rem',
        background: primary ? GOLD : 'transparent',
        color: primary ? BG_DARK : CREAM,
        border: `2px solid ${primary ? GOLD : 'rgba(245,240,225,.6)'}`,
      }}
    >
      {label}
    </button>
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
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ background: BG_DARK, backgroundImage: CAMO_OVERLAY, position: 'relative' }}
    >
      <div
        className="container"
        style={{
          minHeight: 'min(78vh, 560px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '3rem 0',
        }}
      >
        {slide.kind === 'video' ? (
          <div style={{ width: '100%', maxWidth: 900 }}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                background: '#000',
                overflow: 'hidden',
                border: `2px solid ${GOLD}`,
                boxShadow: '0 18px 48px rgba(0,0,0,.5)',
              }}
            >
              {vid ? (
                <iframe
                  key={vid}
                  src={`https://www.youtube-nocookie.com/embed/${vid}?rel=0&modestbranding=1&playsinline=1`}
                  title="Comic Armor"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                />
              ) : (
                <video
                  key={slide.url}
                  src={slide.url}
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', maxWidth: 760 }}>
            <span
              style={{
                color: GOLD,
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                fontSize: '.85rem',
                fontWeight: 700,
              }}
            >
              {slide.subtitle}
            </span>
            <h1
              style={{
                fontFamily: STENCIL,
                fontSize: 'clamp(2.6rem, 7vw, 4.5rem)',
                letterSpacing: '.06em',
                color: CREAM,
                margin: '.6rem 0 1rem',
                lineHeight: 1.05,
              }}
            >
              {slide.title}
            </h1>
            <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: 'rgba(245,240,225,.82)', margin: '0 0 2rem' }}>
              {slide.description}
            </p>
            <div style={{ display: 'flex', gap: '.9rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {slide.buttons.map((b, i) => (
                <HeroButton key={b.label} label={b.label} primary={i === 0} onClick={() => scrollToId(b.target)} />
              ))}
            </div>
          </div>
        )}

        {count > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2.25rem' }}>
            <button
              aria-label="Previous slide"
              onClick={() => go(index - 1)}
              style={arrowStyle}
            >
              ‹
            </button>
            <div style={{ display: 'flex', gap: '.45rem' }}>
              {slides.map((s, i) => (
                <button
                  key={i}
                  aria-label={s.kind === 'video' ? 'Show the demo video' : `Show slide: ${s.title}`}
                  aria-current={i === index}
                  onClick={() => setIndex(i)}
                  style={{
                    width: i === index ? 26 : 9,
                    height: 9,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    background: i === index ? GOLD : 'rgba(245,240,225,.32)',
                    transition: 'width .25s, background .25s',
                  }}
                />
              ))}
            </div>
            <button aria-label="Next slide" onClick={() => go(index + 1)} style={arrowStyle}>
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

const arrowStyle: CSSProperties = {
  width: 38,
  height: 38,
  lineHeight: 1,
  fontSize: '1.4rem',
  background: 'transparent',
  color: CREAM,
  border: '2px solid rgba(245,240,225,.35)',
  cursor: 'pointer',
};

function Stars({ rating }: { rating: number }) {
  return (
    <div aria-label={`${rating} out of 5 stars`} style={{ color: GOLD, fontSize: '1.05rem', letterSpacing: 2 }}>
      {'★'.repeat(rating)}
      <span style={{ color: 'rgba(245,240,225,.28)' }}>{'★'.repeat(5 - rating)}</span>
    </div>
  );
}

export function ShippingSupplies() {
  useDocumentTitle('Shipping Supplies');

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

  // Cheapest first, so a 10-pack lands ahead of a 20-pack regardless of when
  // each product row was created.
  const ordered = useMemo(() => [...products].sort((a, b) => a.priceCents - b.priceCents), [products]);

  const heroVideoId = heroVideoUrl ? youtubeId(heroVideoUrl) : null;
  const review = reviews[Math.min(reviewIndex, reviews.length - 1)];

  return (
    <>
      <HeroSlider slides={slides} />

      {/* Why Choose Us */}
      <section style={{ background: BG_DARK, backgroundImage: CAMO_OVERLAY, padding: '4.5rem 0' }}>
        <div className="container">
          <SectionHeader
            eyebrow="Why choose us"
            title="Military-Grade"
            accent="Protection"
            description="Our Comic Armor inserts are designed to provide the ultimate protection for your valuable comics during shipping."
            onDark
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.title}
                style={{
                  background: 'rgba(45,58,45,.55)',
                  border: '1px solid rgba(201,162,39,.22)',
                  padding: '2rem 1.4rem',
                  textAlign: 'center',
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 54,
                    height: 54,
                    background: GOLD,
                    color: BG_DARK,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    marginBottom: '1.1rem',
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  style={{
                    fontFamily: STENCIL,
                    color: CREAM,
                    margin: '0 0 .6rem',
                    fontSize: '1.1rem',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ margin: 0, fontSize: '.92rem', lineHeight: 1.65, color: 'rgba(245,240,225,.72)' }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" style={{ background: CREAM, padding: '4.5rem 0' }}>
        <div className="container">
          <SectionHeader
            eyebrow="Our products"
            title="Gear"
            accent="Up"
            description="Choose the protection level that fits your needs. From single comics to bulk shipments."
            onDark={false}
          />

          {loaded && ordered.length === 0 && (
            <p style={{ textAlign: 'center', color: 'rgba(26,31,26,.65)' }}>
              Products are on the way — check back shortly.
            </p>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 280px))',
              gap: '1.5rem',
              justifyContent: 'center',
            }}
          >
            {ordered.map((p) => (
              <Link
                key={p.id}
                to={`/product/${p.slug}`}
                style={{
                  background: '#fff',
                  border: '1px solid rgba(26,31,26,.12)',
                  textDecoration: 'none',
                  color: BG_DARK,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    background: BG_DARK,
                    backgroundImage: p.image ? undefined : CAMO_OVERLAY,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span aria-hidden="true" style={{ fontSize: '3.5rem', color: GOLD }}>
                      🛡
                    </span>
                  )}
                </div>
                <div style={{ padding: '1.2rem 1rem 1.4rem' }}>
                  <h3
                    style={{
                      fontFamily: STENCIL,
                      fontSize: '1.05rem',
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      margin: 0,
                    }}
                  >
                    {p.name}
                  </h3>
                  {p.shortDescription && (
                    <p style={{ margin: '.45rem 0 0', fontSize: '.85rem', lineHeight: 1.5, color: 'rgba(26,31,26,.7)' }}>
                      {p.shortDescription}
                    </p>
                  )}
                  <div style={{ color: RED, fontWeight: 800, fontSize: '1.25rem', marginTop: '.7rem' }}>
                    {formatMoney(p.priceCents)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{ background: '#fff', padding: '4.5rem 0' }}>
        <div className="container">
          <SectionHeader
            eyebrow="Simple process"
            title="How It"
            accent="Works"
            description="Protecting your comics is easy with Comic Armor. Just follow these simple steps."
            onDark={false}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {STEPS.map((s) => (
              <div key={s.n} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: STENCIL,
                    fontSize: '2.6rem',
                    color: GOLD,
                    lineHeight: 1,
                    marginBottom: '.75rem',
                  }}
                >
                  {s.n}
                </div>
                <h3
                  style={{
                    fontFamily: STENCIL,
                    fontSize: '1.05rem',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    margin: '0 0 .5rem',
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.65, color: 'rgba(26,31,26,.7)' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Mission */}
      <section
        id="about-section"
        style={{ background: BG_DARK, backgroundImage: CAMO_OVERLAY, padding: '4.5rem 0', color: CREAM }}
      >
        <div className="container" style={{ maxWidth: 780, textAlign: 'center' }}>
          <span
            style={{ color: GOLD, letterSpacing: '.2em', textTransform: 'uppercase', fontSize: '.8rem', fontWeight: 700 }}
          >
            Our mission
          </span>
          <h2
            style={{
              fontFamily: STENCIL,
              fontSize: 'clamp(1.9rem, 4vw, 2.6rem)',
              letterSpacing: '.05em',
              color: CREAM,
              margin: '.5rem 0 1.25rem',
            }}
          >
            PROTECTING WHAT MATTERS
          </h2>
          <p style={{ lineHeight: 1.8, color: 'rgba(245,240,225,.82)' }}>
            Comic Armor was created by collectors, for collectors. We understand the frustration of
            receiving damaged comics in the mail. Our mission is to provide the ultimate protection
            for your valuable comics during shipping.
          </p>
          <p style={{ lineHeight: 1.8, color: 'rgba(245,240,225,.82)' }}>
            Every Comic Armor insert is designed with military precision to absorb impacts, prevent
            bends, and keep your comics in mint condition from departure to delivery.
          </p>
        </div>
      </section>

      {/* Watch Demo — only once a video has been set in Settings */}
      {heroVideoUrl && (
        <section id="video-section" style={{ background: CAMO_DARK, padding: '4.5rem 0' }}>
          <div className="container">
            <SectionHeader eyebrow="See it in action" title="Watch" accent="Demo" onDark />
            <div
              style={{
                maxWidth: 900,
                margin: '0 auto',
                aspectRatio: '16 / 9',
                background: '#000',
                border: `2px solid ${GOLD}`,
                overflow: 'hidden',
              }}
            >
              {heroVideoId ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${heroVideoId}?rel=0&modestbranding=1&playsinline=1`}
                  title="Comic Armor demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                />
              ) : (
                <video
                  src={heroVideoUrl}
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials — real approved reviews only; hidden until there are some */}
      {review && (
        <section
          id="testimonials"
          style={{ background: BG_DARK, backgroundImage: CAMO_OVERLAY, padding: '4.5rem 0' }}
        >
          <div className="container">
            <SectionHeader eyebrow="Testimonials" title="What Collectors" accent="Say" onDark />
            <div style={{ maxWidth: 660, margin: '0 auto', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Stars rating={review.rating} />
              </div>
              {review.title && (
                <h3 style={{ color: CREAM, margin: '.9rem 0 .35rem', fontSize: '1.15rem' }}>{review.title}</h3>
              )}
              {review.body && (
                <p style={{ color: 'rgba(245,240,225,.85)', lineHeight: 1.8, fontSize: '1.05rem', margin: '.75rem 0 1.25rem' }}>
                  “{review.body}”
                </p>
              )}
              <div style={{ fontFamily: STENCIL, letterSpacing: '.06em', color: GOLD, textTransform: 'uppercase' }}>
                {review.customerName}
              </div>

              {reviews.length > 1 && (
                <div style={{ display: 'flex', gap: '.45rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                  {reviews.map((_, i) => (
                    <button
                      key={i}
                      aria-label={`Show review ${i + 1}`}
                      aria-current={i === reviewIndex}
                      onClick={() => setReviewIndex(i)}
                      style={{
                        width: i === reviewIndex ? 24 : 9,
                        height: 9,
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        background: i === reviewIndex ? GOLD : 'rgba(245,240,225,.3)',
                        transition: 'width .25s, background .25s',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ background: CAMO_DARK, padding: '3.5rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2
            style={{
              fontFamily: STENCIL,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
              letterSpacing: '.05em',
              color: CREAM,
              margin: '0 0 .75rem',
            }}
          >
            READY TO PROTECT YOUR COLLECTION?
          </h2>
          <p style={{ color: 'rgba(245,240,225,.8)', margin: '0 0 1.75rem' }}>
            Join the collectors who trust Comic Armor to keep their comics safe during shipping.
          </p>
          <div style={{ display: 'flex', gap: '.9rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <HeroButton label="Shop Now" primary onClick={() => scrollToId('products')} />
            <Link
              to="/contact"
              style={{
                padding: '.8rem 1.6rem',
                borderRadius: 3,
                fontWeight: 700,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontSize: '.85rem',
                textDecoration: 'none',
                color: CREAM,
                border: '2px solid rgba(245,240,225,.6)',
              }}
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
