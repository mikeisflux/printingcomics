import React from 'react';
import { db } from '../firebase-mock';
import { loadPublishedCatalogTitles } from '../lib/backend';
import { CATALOG_PATH, getCatalogProductPath } from '../lib/catalog-routes';
import { isProductionBackendEnabled } from '../lib/supabase';
import { CURRENT_PHILVIEWS_CATALOG } from '../data/philviews-catalogs';

const FeatureIcon = ({ icon, label, copy }) => (
  <div className="home-benefit">
    <span className="home-benefit-icon" aria-hidden="true">{icon}</span>
    <strong>{label}</strong>
    <span>{copy}</span>
  </div>
);

export default function Home({ onNavigate }) {
  const [activeHeroSlide, setActiveHeroSlide] = React.useState(0);
  const [heroPaused, setHeroPaused] = React.useState(false);
  const [liveTitles, setLiveTitles] = React.useState(() => db.getPublicTitles());
  const assetPath = (path) => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;
  const newestCatalogTitle = [...liveTitles].sort((a, b) =>
    String(b.catalogDate || b.publishedAt || b.releaseDate || '').localeCompare(String(a.catalogDate || a.publishedAt || a.releaseDate || ''))
  )[0];
  const newestCatalogTitles = newestCatalogTitle?.cycleId
    ? liveTitles.filter(title => title.cycleId === newestCatalogTitle.cycleId)
    : newestCatalogTitle?.catalogDate
      ? liveTitles.filter(title => title.catalogDate === newestCatalogTitle.catalogDate)
      : liveTitles;
  const newestReleases = newestCatalogTitles.slice(0, 8);

  React.useEffect(() => {
    if (!isProductionBackendEnabled) return undefined;
    let active = true;
    loadPublishedCatalogTitles()
      .then(titles => { if (active) setLiveTitles(titles); })
      .catch(error => console.warn('Newest releases could not be loaded.', error.message));
    return () => { active = false; };
  }, []);
  const openRelease = (title) => {
    const productPath = getCatalogProductPath(title);
    if (productPath === CATALOG_PATH) return;
    const routeContext = `${window.location.search}${window.location.hash === '#home' ? '#home' : ''}`;
    window.history.pushState({ philboProductId: title.philboId || title.titleId }, '', `${productPath}${routeContext}`);
    onNavigate('public-catalog');
  };
  const showNewestReleases = () => document.getElementById('newest-releases')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const viewCurrentPhilviews = () => window.open(CURRENT_PHILVIEWS_CATALOG.pdfUrl, '_blank', 'noopener,noreferrer');
  const featuredReleaseCovers = [
    assetPath('home/featured-cataclysm.jpg'),
    assetPath('home/featured-torment.jpg')
  ];
  const heroSlides = [
    {
      id: 'retailers',
      accent: 'retailer',
      eyebrow: `CURRENT PHILVIEWS • CATALOG #${CURRENT_PHILVIEWS_CATALOG.issue}`,
      title: 'THE CURRENT CATALOG IS OPEN.',
      copy: 'September 1, 2026 Catalog • November 1, 2026 FOC • December 16, 2026 In-Store',
      primaryLabel: 'VIEW PHILVIEWS #15',
      primaryAction: viewCurrentPhilviews,
      secondaryLabel: 'RETAILER ACCESS',
      secondaryAction: () => onNavigate('retailers'),
      image: assetPath(CURRENT_PHILVIEWS_CATALOG.coverPath),
      imageAlt: `Philviews catalog number ${CURRENT_PHILVIEWS_CATALOG.issue}, ${CURRENT_PHILVIEWS_CATALOG.label}`,
      imageClass: 'catalog'
    },
    {
      id: 'publishers',
      accent: 'publisher',
      eyebrow: 'FOR INDEPENDENT PUBLISHERS',
      title: 'PUT YOUR BOOKS IN FRONT OF MORE READERS.',
      copy: 'Submit titles, reach comic shops, follow purchase orders, and keep distribution connected from solicitation through payment.',
      primaryLabel: 'PUBLISHER SERVICES',
      primaryAction: () => onNavigate('publishers'),
      secondaryLabel: 'APPLY TO GET STARTED',
      secondaryAction: () => onNavigate('apply-publisher'),
      image: assetPath('home/featured-cataclysm.jpg'),
      imageAlt: 'Featured independent comic cover',
      imageClass: 'comic'
    },
    {
      id: 'pod',
      accent: 'pod',
      eyebrow: 'PROFESSIONAL COMIC PRINTING',
      title: 'PRINT WHAT YOU NEED. KEEP CREATING.',
      copy: 'Print convention copies, campaign rewards, retailer restocks, and creator inventory without committing to unnecessary volume.',
      primaryLabel: 'EXPLORE PRINT SERVICES',
      primaryAction: () => onNavigate('services'),
      secondaryLabel: 'SUBMIT FOR A QUOTE',
      secondaryAction: () => onNavigate('apply-pod'),
      image: assetPath('brand/philbo-pod-green.png'),
      imageAlt: 'Print on Demand',
      imageClass: 'logo'
    },
    {
      id: 'kickstarter',
      accent: 'kickstarter',
      eyebrow: 'KICKSTARTER FULFILLMENT',
      title: 'FROM A FUNDED CAMPAIGN TO YOUR READERS’ HANDS.',
      copy: 'Campaign printing, reward packing, and fulfillment designed around the needs of independent comic creators.',
      primaryLabel: 'FULFILLMENT COMING SOON',
      primaryAction: null,
      secondaryLabel: 'SEE PRINT SERVICES',
      secondaryAction: () => onNavigate('services'),
      image: assetPath('home/featured-torment.jpg'),
      imageAlt: "Penguino's Revenge: Torment comic cover",
      imageClass: 'comic'
    }
  ];
  const activeSlide = heroSlides[activeHeroSlide];

  React.useEffect(() => {
    if (heroPaused) return undefined;
    const timer = window.setInterval(() => setActiveHeroSlide(current => (current + 1) % heroSlides.length), 7000);
    return () => window.clearInterval(timer);
  }, [heroPaused, heroSlides.length]);

  return (
    <div className="home-page animate-fade-in" style={{ '--home-city-art': `url("${assetPath('brand/philbo-city-aerial-sideways.jpg')}")` }}>
      <section className={`home-hero home-hero-slider home-hero-${activeSlide.accent}`} aria-roledescription="carousel" aria-label="Services and current catalog" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={() => setHeroPaused(false)}>
        <div className="home-hero-positioning">
          <strong>BY CREATORS. FOR CREATORS.</strong>
          <span>INDEPENDENT COMIC BOOKS. DISTRIBUTION. PROFESSIONAL PRINTING.</span>
        </div>
        <div className="home-hero-slide" key={activeSlide.id}>
          <div className="home-hero-content">
            <p className="home-kicker">{activeSlide.eyebrow}</p>
            <h1>{activeSlide.title}</h1>
            <p className="home-subtitle">{activeSlide.copy}</p>
            <div className="home-hero-actions">
              <button className="btn btn-primary" onClick={activeSlide.primaryAction || undefined} disabled={!activeSlide.primaryAction}>{activeSlide.primaryLabel}</button>
              <button className="btn btn-secondary" onClick={activeSlide.secondaryAction}>{activeSlide.secondaryLabel}</button>
            </div>
          </div>
          <div className={`home-hero-visual home-hero-visual-${activeSlide.imageClass}`}>
            <span className="home-hero-visual-glow" aria-hidden="true" />
            <img src={activeSlide.image} alt={activeSlide.imageAlt} />
          </div>
        </div>
        <button type="button" className="home-slider-arrow home-slider-prev" aria-label="Previous slide" onClick={() => setActiveHeroSlide(current => (current - 1 + heroSlides.length) % heroSlides.length)}>‹</button>
        <button type="button" className="home-slider-arrow home-slider-next" aria-label="Next slide" onClick={() => setActiveHeroSlide(current => (current + 1) % heroSlides.length)}>›</button>
        <div className="home-slider-dots" aria-label="Choose a slide">
          {heroSlides.map((slide, index) => <button type="button" key={slide.id} className={index === activeHeroSlide ? 'active' : ''} aria-label={`Show ${slide.id} slide`} aria-current={index === activeHeroSlide ? 'true' : undefined} onClick={() => setActiveHeroSlide(index)} />)}
        </div>
      </section>

      <section className="home-audience-grid" aria-label="Services">
        <article className="home-audience-card home-card-retailer">
          <div className="home-card-icon">▰</div>
          <h2>RETAILERS</h2>
          <p>Order independent comic books with tiered discounts, easy returns, and powerful tools built for comic shops.</p>
          <button className="home-outline-button red" onClick={() => onNavigate('retailers')}>I’M A RETAILER</button>
        </article>
        <article className="home-audience-card home-card-publisher">
          <div className="home-card-icon">✦</div>
          <h2>PUBLISHERS</h2>
          <p>Distribute your books, track sales, receive purchase orders, and grow your audience nationwide.</p>
          <button className="home-outline-button gold" onClick={() => onNavigate('publishers')}>I’M A PUBLISHER</button>
        </article>
        <article className="home-audience-card home-card-pod">
          <img src={assetPath('brand/philbo-pod-green.png')} alt="Print on Demand" />
          <h2>PRINT ON DEMAND</h2>
          <p>High-quality comic printing, Kickstarter fulfillment, convention copies, retail restocks, and more.</p>
          <button className="home-outline-button green" onClick={() => onNavigate('services')}>OUR PRINT SERVICES</button>
        </article>
        <article className="home-audience-card home-card-kickstarter">
          <div className="home-card-icon">◆</div>
          <h2>KICKSTARTER FULFILLMENT</h2>
          <p>Campaign printing, reward packing, and fulfillment built for independent comic creators.</p>
          <span className="home-outline-button purple" aria-disabled="true">COMING SOON</span>
        </article>
      </section>

      <section className="home-newest-releases" id="newest-releases">
        <div className="home-section-heading">
          <span />
          <h2>NEWEST RELEASES</h2>
          <span />
        </div>
        {newestReleases.length > 0 ? (
          <div className="home-release-grid">
            {newestReleases.map((title, index) => (
              <button type="button" className="home-release-card" key={title.titleId} onClick={() => openRelease(title)} aria-label={`View ${title.title} in the catalog`}>
                <div className="home-release-cover">
                  {featuredReleaseCovers[index] || title.coverUrl ? <img src={featuredReleaseCovers[index] || title.coverUrl} alt={`${title.title} featured cover`} /> : <span>Cover coming soon</span>}
                </div>
                <div className="home-release-info">
                  <h3>{title.title}</h3>
                  <p>{title.publisherName}</p>
                  <strong>${Number(title.msrp || 0).toFixed(2)} MSRP</strong>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-release-empty">Newest releases will appear here as soon as titles from the latest catalog are published Live.</div>
        )}
      </section>

      <section className="home-benefits" aria-label="Service advantages">
        <FeatureIcon icon="＄" label="BETTER MARGINS" copy="40% / 45% / 50% retailer discount tiers" />
        <FeatureIcon icon="▰" label="RELIABLE SERVICE" copy="Fast shipping, real people, and responsive support" />
        <FeatureIcon icon="◎" label="CREATOR FOCUSED" copy="No minimum orders, returns, pull lists, and more" />
        <FeatureIcon icon="▥" label="PUBLISHER POWERED" copy="Transparent reporting and monthly payouts" />
        <FeatureIcon icon="◇" label="PRINT YOUR WAY" copy="Quality printing, quick turnaround, no waste" />
      </section>

      <section className="home-featured-comics" aria-labelledby="featured-comics-title">
        <div className="home-featured-art" aria-label="Featured independent comic covers">
          <figure className="home-featured-cover home-featured-cover-back">
            <img src={assetPath('home/featured-torment.jpg')} alt="Penguino's Revenge: Torment comic cover" />
          </figure>
          <figure className="home-featured-cover home-featured-cover-front">
            <img src={assetPath('home/featured-cataclysm.jpg')} alt="Cataclysm issue two comic cover" />
          </figure>
        </div>
        <div className="home-featured-copy">
          <h2 id="featured-comics-title">CREATORS SHOULDN’T HAVE TO CHOOSE.</h2>
          <p className="home-featured-lead">We don’t believe creators should have to choose between making art … <strong>and making a living.</strong></p>
          <p>Maybe it’s time we stop accepting that as “Just the way the industry works.”</p>
          <p>We believe creators deserve a real chance to build sustainable careers doing what they love.</p>
          <p className="home-featured-signoff"><strong>By creators. For creators.</strong></p>
          <p className="home-featured-rally">This is WHAT HAPPENS WHEN CREATORS STOP WAITING FOR SOMEONE ELSE TO FIX THE INDUSTRY.</p>
          <div className="home-featured-actions">
            <button className="btn btn-primary" onClick={showNewestReleases}>DISCOVER NEW COMIC BOOKS</button>
            <button className="btn btn-secondary" onClick={() => onNavigate('services')}>EXPLORE PRINT SERVICES</button>
          </div>
        </div>
      </section>

      <section className="home-manifesto" aria-labelledby="home-manifesto-title">
        <header className="home-manifesto-heading">
          <h2 id="home-manifesto-title">THIS IS BIGGER THAN PRINTING OR DISTRIBUTION.</h2>
          <p>It’s about building a comic industry where creative work can become a sustainable life.</p>
        </header>
        <div className="home-manifesto-grid">
          <article>
            <span className="home-manifesto-number">01</span>
            <p className="home-manifesto-label">WHAT WE BELIEVE</p>
            <h3>CREATORS DESERVE MORE THAN EXPOSURE.</h3>
            <p>Creators shouldn’t have to choose between making comic books and making a living. The industry works best when creators, publishers, retailers, and readers can all win.</p>
          </article>
          <article>
            <span className="home-manifesto-number">02</span>
            <p className="home-manifesto-label">WHY WE EXIST</p>
            <h3>CREATOR SUCCESS IS WHY WE’RE HERE.</h3>
            <p>We don’t measure success by how many comic books we print. We measure it by whether the people behind those books can keep creating, growing, and reaching readers.</p>
          </article>
          <article>
            <span className="home-manifesto-number">03</span>
            <p className="home-manifesto-label">HOW WE BUILD</p>
            <h3>WE START WITH THE PROBLEM—NOT THE PRODUCT.</h3>
            <p>Every decision begins with one question: What’s the next problem creators need solved? Then we build the tools, services, and support to solve it.</p>
          </article>
        </div>
        <p className="home-manifesto-closing">THE GOAL WAS NEVER TO PRINT MORE COMIC BOOKS. <strong>IT WAS TO HELP MORE CREATORS BUILD A FUTURE.</strong></p>
      </section>

      <section className="home-moos-feature" aria-labelledby="home-moos-title">
        <div className="home-moos-animation">
          <img src={assetPath('video/mo-io-shimmer-tight-transparent.gif')} alt="Animated MO.io logo" />
        </div>
        <div className="home-moos-copy">
          <span className="home-moos-eyebrow">THE SYSTEM BEHIND IT ALL</span>
          <h2 id="home-moos-title">BUILD SMARTER.<br />MOVE FASTER.</h2>
          <p className="home-moos-supporting">MO.io connects the work behind distribution, production, catalog cycles, and support—so creators can stay focused on making great books.</p>
          <p className="home-moos-credit">Built &amp; Powered by MO.io™ · A Powers Creative Solutions System</p>
        </div>
      </section>

      <section className="home-portal-previews">
        <article className="home-preview red-preview">
          <span className="home-eyebrow">RETAILER PORTAL</span>
          <h3>Order. Track. Restock.</h3>
          <p>Manage orders, track shipments, access invoices and catalog downloads, and submit returns from one account.</p>
          <button className="home-outline-button red" onClick={() => onNavigate('login')}>RETAILER LOGIN</button>
        </article>
        <article className="home-preview gold-preview">
          <span className="home-eyebrow">PUBLISHER PORTAL</span>
          <h3>Your catalog command center.</h3>
          <p>Submit titles, upload files, review purchase orders, track sales, and access publisher resources.</p>
          <button className="home-outline-button gold" onClick={() => onNavigate('login')}>PUBLISHER LOGIN</button>
        </article>
        <article className="home-preview green-preview">
          <img src={assetPath('brand/philbo-pod-green.png')} alt="Print on Demand" />
          <h3>Print only what you need.</h3>
          <p>No minimums, quality comic printing, quick turnaround, and shipping wherever your books need to go.</p>
          <button className="home-outline-button green" onClick={() => onNavigate('services')}>LEARN MORE</button>
        </article>
      </section>
    </div>
  );
}
