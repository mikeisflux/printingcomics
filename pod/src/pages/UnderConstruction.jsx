import React, { useEffect } from 'react';

export default function UnderConstruction() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Philbo Distribution — Coming Soon';

    let robots = document.querySelector('meta[name="robots"]');
    const createdRobots = !robots;
    const previousRobots = robots?.getAttribute('content');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex, nofollow');

    return () => {
      document.title = previousTitle;
      if (createdRobots) robots.remove();
      else if (previousRobots) robots.setAttribute('content', previousRobots);
      else robots.removeAttribute('content');
    };
  }, []);

  return (
    <main className="construction-page">
      <div className="construction-art" aria-hidden="true">
        <img
          className="construction-ink-page"
          src="/assets/coming-soon/carl-tork-interior.jpg"
          alt=""
        />
        <figure className="construction-cover construction-cover-clootopia">
          <img src="/assets/coming-soon/clootopia-preview.jpg" alt="" />
        </figure>
        <figure className="construction-cover construction-cover-yakuza">
          <img src="/assets/coming-soon/american-yakuza.jpg" alt="" />
        </figure>
        <figure className="construction-cover construction-cover-heroesville">
          <img src="/assets/coming-soon/tales-from-heroesville.jpg" alt="" />
        </figure>
        <figure className="construction-cover construction-cover-penguino">
          <img src="/assets/coming-soon/penguinos-revenge.jpg" alt="" />
        </figure>
      </div>
      <div className="construction-glow construction-glow-one" aria-hidden="true" />
      <div className="construction-glow construction-glow-two" aria-hidden="true" />

      <section className="construction-card" aria-labelledby="construction-title">
        <div className="construction-rule" aria-hidden="true">
          <span />
          <b>PHILBO DISTRIBUTION</b>
          <span />
        </div>

        <img
          className="construction-logo"
          src="/assets/brand/philbo-3d-logo.png"
          alt="Philbo Distribution"
        />

        <p className="construction-kicker">SYSTEM DESIGNED BY</p>
        <h1 id="construction-title">By creators.<br />For creators.</h1>
        <p className="construction-presses">THE PRESSES ARE WARMING UP</p>
        <p className="construction-copy">
          We’re building a better home for independent comics. Our new distribution
          and ordering experience will welcome retailers, publishers, and creators soon.
        </p>

        <div className="construction-status" role="status">
          <span aria-hidden="true" />
          Website coming soon
        </div>

        <a className="construction-contact" href="mailto:philbodistribution@gmail.com">
          Need to reach us? philbodistribution@gmail.com
        </a>

        <footer className="construction-footer">
          <p>
            © 2026 Philbo Entertainment Promotions Inc. All rights reserved. Third-party trademarks and content remain the property of their respective owners.
          </p>
          <p className="site-credit">
            Built &amp; Powered by MO.io™ · A Powers Creative Solutions System
          </p>
        </footer>
      </section>
    </main>
  );
}
