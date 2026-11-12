import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const issueNumber = cycle => cycle?.cycleId?.replace('cycle_', '') || '';

const cycleLabel = cycle => {
  if (!cycle?.catalogDate || !cycle?.releaseDate) return cycle?.cycleName || 'CURRENT CATALOG';
  const catalog = new Date(`${cycle.catalogDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const release = new Date(`${cycle.releaseDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  return `${catalog} FOR ${release}`;
};

export function CatalogCoverArtwork({ cycle, virginCoverUrl, publishers = [] }) {
  const issue = issueNumber(cycle);
  return (
    <div className="catalog-cover-artwork">
      {virginCoverUrl ? <img className="catalog-cover-virgin" src={virginCoverUrl} alt="Virgin catalog cover artwork" /> : <div className="catalog-cover-empty">UPLOAD VIRGIN COVER ART</div>}
      <div className="catalog-cover-shade" aria-hidden="true" />
      <div className="catalog-cover-corner-box">
        <img src="/assets/brand/philbo-dragon-gold.png" alt="" />
        <span>PHILBO</span>
        <small>DISTRIBUTION</small>
      </div>
      <div className="catalog-cover-masthead">
        <strong>PHILVIEWS</strong>
        <span>{cycleLabel(cycle)}</span>
        <b>CATALOG #{issue}</b>
      </div>
      <div className="catalog-cover-featured">
        <strong>FEATURING</strong>
        {publishers.map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}
      </div>
    </div>
  );
}

export default function CatalogCoverBuilder({ cycle, titles, canCompile, onClose, onCompile }) {
  const initialPublishers = useMemo(() => Array.from(new Set(titles.map(title => title.publisherName).filter(Boolean))).sort(), [titles]);
  const [publisherText, setPublisherText] = useState(initialPublishers.join('\n'));
  const [virginCoverUrl, setVirginCoverUrl] = useState('');
  const publishers = publisherText.split('\n').map(value => value.trim()).filter(Boolean);

  const handleArtwork = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setVirginCoverUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  if (!cycle) return null;

  return createPortal(
    <div className="catalog-builder-backdrop" role="dialog" aria-modal="true" aria-label={`Make ${cycle.cycleName} catalog`}>
      <div className="catalog-builder-shell">
        <header>
          <div>
            <span>ADMIN CATALOG PRODUCTION</span>
            <h2>MAKE THE CATALOG</h2>
            <p>{cycle.cycleName}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </header>

        <div className="catalog-builder-layout">
          <section className="catalog-builder-controls">
            <div className="catalog-builder-field">
              <label htmlFor="catalog-virgin-cover">Virgin cover artwork</label>
              <input id="catalog-virgin-cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleArtwork} />
              <small>The original file is previewed without changing or overwriting it.</small>
            </div>

            <div className="catalog-builder-field">
              <label htmlFor="catalog-publishers">Featured publishers</label>
              <textarea id="catalog-publishers" rows="14" value={publisherText} onChange={event => setPublisherText(event.target.value)} />
              <small>Automatically collected from the {titles.length} live catalog title{titles.length === 1 ? '' : 's'}. One publisher per line; edit or reorder before output.</small>
            </div>

            <div className="catalog-builder-summary">
              <span><b>{titles.length}</b> title SKUs</span>
              <span><b>{publishers.length}</b> featured publishers</span>
              <span><b>{virginCoverUrl ? 'READY' : 'NEEDED'}</b> virgin cover</span>
            </div>

            <button
              type="button"
              className="btn btn-primary catalog-builder-compile"
              disabled={!canCompile || !virginCoverUrl}
              onClick={() => onCompile({ virginCoverUrl, publishers })}
            >
              FINAL COMPILE CATALOG FOR OUTPUT
            </button>
            {!canCompile && <p className="catalog-builder-owner-note">Visible for review. Final compilation is restricted to the MO.OS owner account.</p>}
            {canCompile && !virginCoverUrl && <p className="catalog-builder-owner-note">Upload the virgin cover artwork to enable the final compilation.</p>}
          </section>

          <section className="catalog-builder-preview" aria-label="Catalog cover preview">
            <CatalogCoverArtwork cycle={cycle} virginCoverUrl={virginCoverUrl} publishers={publishers} />
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
