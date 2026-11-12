import React, { useState } from 'react';
import { Heart, Minus, Plus, ShoppingCart } from 'lucide-react';
import { getCatalogProductPath } from '../lib/catalog-routes';

const displayDate = value => {
  if (!value) return 'TBA';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const listingUrl = title => {
  const host = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'https://philbopod.com' : window.location.origin;
  return new URL(getCatalogProductPath(title), host).toString();
};

const money = value => `$${Number(value || 0).toFixed(2)}`;

const compactRating = value => String(value || 'Not rated').split(' Suitable')[0].split(' For mature')[0];

export default function CatalogSolicitationPage({ title, cycle, pageNumber = 1, totalPages = 1, template = false, onOpenTitle }) {
  const [saved, setSaved] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const url = listingUrl(title);
  const format = [title.bookFormat, title.colorProfile].filter(Boolean).join(' / ') || 'Format TBA';
  const size = title.width && title.height ? `${title.width}\" x ${title.height}\"` : 'Size TBA';
  const coverLabel = title.variantNumber || title.coverDescription || 'Main Cover';
  const openInteractiveListing = event => {
    if (!onOpenTitle) return;
    event.preventDefault();
    onOpenTitle(title);
  };

  return (
    <article className={`catalog-print-page catalog-solicitation-page${template ? ' is-template' : ''}`}>
      {title.interiorImageUrl && (
        <div className="catalog-solicitation-atmosphere" aria-hidden="true">
          <img src={title.interiorImageUrl} alt="" />
        </div>
      )}

      <header className="catalog-solicitation-heading">
        <div>
          <span>{title.publisherName || 'Independent Publisher'}</span>
          <h2>{title.title}</h2>
          <p>{coverLabel}</p>
        </div>
        {title.publisherLogoUrl ? (
          <img src={title.publisherLogoUrl} alt={`${title.publisherName || 'Publisher'} logo`} />
        ) : (
          <div className="catalog-solicitation-publisher-name">{title.publisherName || 'PUBLISHER'}</div>
        )}
      </header>

      <div className="catalog-solicitation-main">
        <a className="catalog-solicitation-cover" href={url} onClick={openInteractiveListing} aria-label={`Open the website listing for ${title.title}`}>
          {title.coverUrl ? <img src={title.coverUrl} alt={`${title.title} cover`} /> : <span>COVER COMING SOON</span>}
        </a>

        <aside className="catalog-solicitation-facts" aria-label="Retailer ordering information">
          <dl>
            <div><dt>FORMAT</dt><dd>{format}</dd></div>
            <div><dt>GENRE</dt><dd>{title.genre || title.bisac1 || 'TBA'}</dd></div>
            <div><dt>RATING</dt><dd>{compactRating(title.ageRange)}</dd></div>
            <div><dt>SIZE</dt><dd>{size}</dd></div>
            <div><dt>PAGE COUNT</dt><dd>{title.pageCount ? `${title.pageCount} pages` : 'TBA'}</dd></div>
            <div><dt>PRICE (US)</dt><dd>{money(title.msrp)}</dd></div>
            <div><dt>FOC</dt><dd>{displayDate(title.focDate || cycle?.focDate)}</dd></div>
            <div><dt>IN STORES</dt><dd>{displayDate(title.releaseDate || cycle?.releaseDate)}</dd></div>
          </dl>

          <div className="catalog-solicitation-credits">
            <span><b>WRITER(S)</b>{title.writer || 'TBA'}</span>
            <span><b>ARTIST(S)</b>{title.artist || 'TBA'}</span>
            <span><b>COVER ARTIST(S)</b>{title.coverArtist || 'TBA'}</span>
          </div>

          <div className="catalog-solicitation-order-row">
            <a className="catalog-solicitation-order" href={url} onClick={openInteractiveListing}>
              <span>ORDER NOW</span>
            </a>
            {template && (
              <button
                type="button"
                className={`catalog-solicitation-save${saved ? ' is-saved' : ''}`}
                aria-label={saved ? 'Remove from saved titles' : 'Save title for later'}
                aria-pressed={saved}
                onClick={() => setSaved(value => !value)}
              >
                <Heart size={15} fill={saved ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>
          {template && (
            <div className="catalog-solicitation-retailer-preview">
              <div className="catalog-solicitation-quantity" aria-label="Order quantity preview">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(value => Math.max(1, value - 1))}><Minus size={11} /></button>
                <strong>{quantity}</strong>
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(value => value + 1)}><Plus size={11} /></button>
              </div>
              <button type="button" className="catalog-solicitation-add-preview">
                <ShoppingCart size={12} /> ADD TO ORDER
              </button>
              <small>RETAILER WEB TOOLS</small>
            </div>
          )}
          <strong className="catalog-solicitation-stock">PHILBO STOCK # {title.philboId || 'PENDING'}</strong>
        </aside>
      </div>

      <section className="catalog-solicitation-description">
        <span>THIS ISSUE</span>
        <p>{title.description || title.synopsis || 'Full solicitation copy coming soon.'}</p>
      </section>

      <footer className="catalog-solicitation-footer">
        <a href={url} onClick={openInteractiveListing}>VIEW TITLE &amp; ORDER ONLINE</a>
        <small>{template ? 'MASTER SOLICITATION TEMPLATE' : `${pageNumber} / ${totalPages}`} · {title.barcode || title.philboId || 'ID PENDING'}</small>
      </footer>
    </article>
  );
}
