import React from 'react';
import { createPortal } from 'react-dom';
import { isTitlePublished } from '../lib/catalog-workflow';

const money = value => `$${Number(value || 0).toFixed(2)}`;
const assetPath = path => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;

export default function CatalogProductDetail({
  title,
  onClose,
  viewerRole = 'public',
  retailerTier = 'Tier I',
  discount = 0.40,
  quantity = 1,
  onQuantityChange,
  onAddToOrder,
  orderDisabled = false,
  maximumQuantity,
  orderHelp,
  onRetailerSignIn,
  publisherFollowed = false,
  onTogglePublisherFollow
}) {
  if (!title) return null;
  const isRetailer = viewerRole === 'retailer';
  const isPublisher = viewerRole === 'publisher';
  const wholesale = Number(title.msrp || 0) * (1 - discount);
  const isLive = isTitlePublished(title.status);

  return createPortal(
    <div className={`public-title-modal${viewerRole === 'public' ? '' : ' portal-modal-typography'}`} role="dialog" aria-modal="true" aria-label={`${title.title} product details`}>
      <div className="public-title-dialog" style={{ maxWidth: '1080px', maxHeight: '92vh', overflowY: 'auto' }}>
        <button className="public-title-close" onClick={onClose} aria-label="Close title details">×</button>

        {isPublisher && (
          <div style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid var(--gold-primary)', color: 'var(--text-primary)', padding: '12px 15px', borderRadius: '6px', marginBottom: '22px', fontSize: '0.82rem', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--gold-primary)' }}>{isLive ? 'LIVE WEBSITE LISTING' : 'PUBLISHER WEBSITE PREVIEW'}</strong><br />
            This is the product page generated from your title submission. {isLive ? 'It is currently visible in the public catalog.' : 'It will become public only after Philbo approves and publishes it Live.'}
          </div>
        )}

        <header className="catalog-product-heading">
          <div>
            <span className="home-eyebrow">{title.publisherName || 'Publisher'}</span>
            <h2>{title.title}</h2>
            <p>{title.seriesName || 'Series'} · Issue #{title.issueNumber || '—'} · Variant {title.variantNumber || 'Main'}</p>
          </div>
          {title.publisherLogoUrl && <img src={title.publisherLogoUrl} alt={`${title.publisherName || 'Publisher'} logo`} />}
        </header>

        <div className="public-title-detail-grid catalog-product-layout">
          <div className="public-title-detail-cover">
            {title.coverUrl ? <img src={title.coverUrl} alt={`${title.title} cover`} /> : <span>COVER COMING SOON</span>}
          </div>
          <div className="catalog-product-information">
            <div className="catalog-product-price-row">
              <div><span>MSRP</span><strong className="public-title-msrp">{money(title.msrp)}</strong></div>
              <div><span>IN STORES</span><strong>{title.releaseDate || 'TBA'}</strong></div>
            </div>
            {isRetailer && (
              <div className="catalog-product-wholesale">
                <strong style={{ color: 'var(--green-primary)', fontSize: '1.12rem' }}>{money(wholesale)} YOUR WHOLESALE</strong>
                <span className="badge badge-gold">{retailerTier} · {Math.round(discount * 100)}% OFF</span>
              </div>
            )}
            <dl className="public-title-facts">
              <div><dt>Publisher</dt><dd>{title.publisherName || '—'}</dd></div>
              <div><dt>Format</dt><dd>{title.bookFormat || '—'}</dd></div>
              <div><dt>Genre</dt><dd>{title.genre || title.bisac1 || '—'}</dd></div>
              <div><dt>Rating</dt><dd>{title.ageRange || '—'}</dd></div>
              <div><dt>Size</dt><dd>{title.width || title.widthInches || '—'} × {title.height || title.heightInches || '—'} in.</dd></div>
              <div><dt>Frequency</dt><dd>{title.seriesFrequency || '—'}</dd></div>
              <div><dt>Pages</dt><dd>{title.pageCount || '—'}</dd></div>
              <div><dt>Color</dt><dd>{title.colorProfile || '—'}</dd></div>
              <div><dt>Writer</dt><dd>{title.writer || '—'}</dd></div>
              <div><dt>Artist</dt><dd>{title.artist || '—'}</dd></div>
              <div><dt>Cover Artist</dt><dd>{title.coverArtist || '—'}</dd></div>
              <div><dt>Cover</dt><dd>{title.coverDescription || '—'}</dd></div>
              <div><dt>FOC Date</dt><dd>{title.focDate || 'TBA'}</dd></div>
              <div><dt>PHILBO ID</dt><dd>{title.philboId || '—'}</dd></div>
              <div><dt>UPC / ISBN / EAN</dt><dd>{title.barcode || '—'}</dd></div>
            </dl>

            {isRetailer ? (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-glow)', borderRadius: '7px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                    QUANTITY
                    <input className="form-input" type="number" min="1" max={maximumQuantity || undefined} value={quantity} disabled={orderDisabled} onChange={event => onQuantityChange?.(Math.min(maximumQuantity || 999, Math.max(1, parseInt(event.target.value, 10) || 1)))} style={{ width: '90px', marginTop: '5px' }} />
                  </label>
                  <button className="btn btn-primary" onClick={onAddToOrder} disabled={title.focLocked || orderDisabled}>{title.focLocked ? 'FOC LOCKED' : orderDisabled ? 'INCENTIVE LOCKED' : 'ADD TO RETAILER ORDER'}</button>
                  {onTogglePublisherFollow && (
                    <button
                      className={`btn catalog-product-follow-button${publisherFollowed ? ' is-following' : ''}`}
                      type="button"
                      aria-pressed={publisherFollowed}
                      onClick={() => onTogglePublisherFollow(title)}
                    >
                      {publisherFollowed ? '✓ FOLLOWING PUBLISHER' : '♡ FOLLOW PUBLISHER'}
                    </button>
                  )}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '9px' }}>{orderHelp || 'Ordering is available only to approved retailer accounts while the title’s FOC is open.'}</div>
              </div>
            ) : !isPublisher ? (
              <div className="public-title-order-note">
                <p>Public visitors browse at MSRP. Approved retailers can order this title directly while FOC is open.</p>
                {onRetailerSignIn && <button className="btn btn-primary" type="button" onClick={onRetailerSignIn}>RETAILER SIGN IN TO ORDER</button>}
              </div>
            ) : null}
          </div>
        </div>

        <section className="catalog-product-solicitation">
          <span>SOLICITATION</span>
          <p className="catalog-product-solicitation-lead">{title.synopsis || title.briefSynopsis || 'Synopsis coming soon.'}</p>
          {title.description && title.description !== title.synopsis && <p>{title.description}</p>}
        </section>

        <footer className="catalog-product-footer">
          <span>AVAILABLE THROUGH</span>
          <img src={assetPath('brand/philbo-3d-logo.png')} alt="Philbo Distribution" />
        </footer>
      </div>
    </div>,
    document.body
  );
}
