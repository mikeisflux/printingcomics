import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import CatalogSolicitationPage from './CatalogSolicitationPage';
import { CatalogCoverArtwork } from './CatalogCoverBuilder';

const displayDate = value => {
  if (!value) return 'TBA';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function CatalogPrintPreview({ cycle, titles, onClose, templateOnly = false, coverDraft = null, onOpenTitle }) {
  useEffect(() => {
    document.body.classList.add('catalog-print-mode');
    const closeOnEscape = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('catalog-print-mode');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  if (!cycle) return null;

  const issueNumber = cycle.cycleId?.replace('cycle_', '') || '';
  const coverUrl = cycle.catalogCoverUrl || '';
  const printableTitles = templateOnly ? titles.slice(0, 1) : titles;

  return createPortal(
    <div className="catalog-print-portal" role="dialog" aria-modal="true" aria-label={`${cycle.cycleName} printable solicitation catalog`}>
      <div className="catalog-print-toolbar">
        <div>
          <strong>{templateOnly ? `PHILVIEWS #${issueNumber} MASTER SOLICITATION TEMPLATE` : `PHILVIEWS #${issueNumber} LINKED SOLICITATION CATALOG`}</strong>
          <span>{templateOnly ? 'One representative title for layout approval' : `${titles.length} sellable SKU${titles.length === 1 ? '' : 's'} · one solicitation page per SKU`}</span>
        </div>
        <div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>{templateOnly ? 'Print Template Proof' : 'Print / Save Linked PDF'}</button>
        </div>
      </div>

      <main className="catalog-print-document">
        {!templateOnly && coverDraft && <section className="catalog-print-page catalog-generated-cover-page">
          <CatalogCoverArtwork cycle={cycle} virginCoverUrl={coverDraft.virginCoverUrl} publishers={coverDraft.publishers} />
        </section>}
        {!templateOnly && !coverDraft && <section className="catalog-official-cover-page catalog-print-page">
          {coverUrl ? <img src={coverUrl} alt={`Philviews catalog number ${issueNumber} cover`} /> : <span>COVER COMING SOON</span>}
        </section>}

        {!templateOnly && <section className="catalog-print-intro catalog-print-page">
          <span className="catalog-print-intro-kicker">CURRENT RETAILER CATALOG</span>
          <h1>PHILVIEWS</h1>
          <h2>CATALOG #{issueNumber}</h2>
          <div className="catalog-print-intro-dates">
            <div><span>CATALOG DATE</span><strong>{displayDate(cycle.catalogDate)}</strong></div>
            <div><span>FOC DATE</span><strong>{displayDate(cycle.focDate)}</strong></div>
            <div><span>IN-STORE DATE</span><strong>{displayDate(cycle.releaseDate)}</strong></div>
          </div>
          <div className="catalog-print-intro-summary">
            <strong>{titles.length}</strong>
            <span>LINKED SOLICITATIONS</span>
            <p>Each solicitation includes the title information retailers need, with a direct link to the online listing for ordering.</p>
          </div>
          <small>Solicitations begin on the following page.</small>
        </section>}

        {printableTitles.map((title, index) => (
          <CatalogSolicitationPage
            key={title.titleId}
            title={title}
            cycle={cycle}
            pageNumber={index + 1}
            totalPages={printableTitles.length}
            template={templateOnly}
            onOpenTitle={onOpenTitle}
          />
        ))}
      </main>
    </div>,
    document.body
  );
}
