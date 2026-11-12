import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase-mock';
import { CATALOG_PATH, findCatalogTitleByProductId, getCatalogProductIdFromPath, getCatalogProductPath } from '../lib/catalog-routes';
import CatalogProductDetail from './CatalogProductDetail';
import CatalogPrintPreview from '../components/CatalogPrintPreview';
import { loadPublishedCatalogTitles } from '../lib/backend';
import { isProductionBackendEnabled } from '../lib/supabase';
import { PHILVIEWS_CATALOGS } from '../data/philviews-catalogs';
import { getPublisherFollowKey, getRetailerOrderMsrpSubtotal, getRetailerTierProgress, normalizeQuantityMap } from '../lib/retailer-order';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const formatCatalogDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBA';
const getFocStatus = focDate => {
  if (!focDate) return { label: 'FOC TBA', className: 'unknown' };
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const deadline = new Date(`${focDate}T12:00:00`);
  const daysRemaining = Math.ceil((deadline - today) / 86400000);
  if (daysRemaining < 0) return { label: 'FOC CLOSED', className: 'closed' };
  if (daysRemaining <= 21) return { label: `CLOSING SOON · ${daysRemaining} DAY${daysRemaining === 1 ? '' : 'S'}`, className: 'closing' };
  return { label: 'FOC OPEN', className: 'open' };
};

export default function PublicCatalog({ onNavigate, currentUser, onSessionUpdate }) {
  const assetPath = (path) => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;
  const cycles = db.getCatalogCycles();
  const [liveTitles, setLiveTitles] = useState(() => db.getPublicTitles());
  const [catalogLoadError, setCatalogLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [publisher, setPublisher] = useState('all');
  const [cycleId, setCycleId] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState(() => findCatalogTitleByProductId(liveTitles, getCatalogProductIdFromPath(window.location.pathname)));
  const [printCycleId, setPrintCycleId] = useState('');
  const [retailerQuantity, setRetailerQuantity] = useState(1);
  const [followedPublisherKeys, setFollowedPublisherKeys] = useState(() => Array.isArray(currentUser?.followedPublisherKeys) ? currentUser.followedPublisherKeys : []);
  const publishers = Array.from(new Set(liveTitles.map(title => title.publisherName).filter(Boolean))).sort();
  const isApprovedRetailer = currentUser?.role === 'retailer' && currentUser.approved;
  const savedRetailerOrder = useMemo(() => {
    if (!isApprovedRetailer || !currentUser?.uid) return {};
    try {
      return normalizeQuantityMap(JSON.parse(localStorage.getItem(`philbo_cart_${currentUser.uid}`)) || {});
    } catch (error) {
      return {};
    }
  }, [currentUser?.uid, isApprovedRetailer]);
  const currentOrderMsrpSubtotal = useMemo(
    () => getRetailerOrderMsrpSubtotal(savedRetailerOrder, liveTitles),
    [savedRetailerOrder, liveTitles]
  );
  const projectedOrderMsrpSubtotal = currentOrderMsrpSubtotal + (
    isApprovedRetailer && selectedTitle && !selectedTitle.focLocked
      ? (Math.max(0, Number(selectedTitle.msrp) || 0) * Math.max(1, Number.parseInt(retailerQuantity, 10) || 1))
      : 0
  );
  const retailerPricing = getRetailerTierProgress(projectedOrderMsrpSubtotal);

  useEffect(() => {
    setFollowedPublisherKeys(Array.isArray(currentUser?.followedPublisherKeys) ? currentUser.followedPublisherKeys : []);
  }, [currentUser?.followedPublisherKeys]);

  const betaRouteContext = () => `${window.location.search}${window.location.hash === '#home' ? '#home' : ''}`;

  useEffect(() => {
    if (!isProductionBackendEnabled) return undefined;
    let active = true;
    loadPublishedCatalogTitles()
      .then(rows => {
        if (!active) return;
        setLiveTitles(rows);
        setSelectedTitle(findCatalogTitleByProductId(rows, getCatalogProductIdFromPath(window.location.pathname)));
        setCatalogLoadError('');
      })
      .catch(error => { if (active) setCatalogLoadError(error.message || 'The catalog could not be loaded.'); });
    return () => { active = false; };
  }, []);

  const openTitle = title => {
    setRetailerQuantity(1);
    setSelectedTitle(title);
    const productPath = getCatalogProductPath(title);
    if (productPath !== CATALOG_PATH) window.history.pushState({ philboProductId: title.philboId }, '', `${productPath}${betaRouteContext()}`);
  };

  const closeTitle = () => {
    setSelectedTitle(null);
    window.history.pushState(null, '', `${CATALOG_PATH}${betaRouteContext()}`);
  };

  useEffect(() => {
    const followProductUrl = () => {
      const title = findCatalogTitleByProductId(liveTitles, getCatalogProductIdFromPath(window.location.pathname));
      setSelectedTitle(title);
      if (title) setRetailerQuantity(1);
    };
    window.addEventListener('popstate', followProductUrl);
    return () => window.removeEventListener('popstate', followProductUrl);
  }, [liveTitles]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = selectedTitle ? `${selectedTitle.title} | Comic Catalog` : 'Comic Catalog';
    return () => { document.title = previousTitle; };
  }, [selectedTitle]);

  const addWebsiteTitleToRetailerOrder = () => {
    if (!isApprovedRetailer || !selectedTitle || selectedTitle.focLocked) return;
    const storageKey = `philbo_cart_${currentUser.uid}`;
    let savedCart = {};
    try { savedCart = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (error) { savedCart = {}; }
    savedCart[selectedTitle.titleId] = (savedCart[selectedTitle.titleId] || 0) + retailerQuantity;
    localStorage.setItem(storageKey, JSON.stringify(savedCart));
    setSelectedTitle(null);
    onNavigate('portal');
  };

  const requestRetailerOrdering = () => {
    if (!selectedTitle) return;
    sessionStorage.setItem('philbo_pending_catalog_product', getCatalogProductPath(selectedTitle));
    setSelectedTitle(null);
    onNavigate('login');
  };

  const toggleSelectedPublisherFollow = title => {
    if (!isApprovedRetailer || !title) return;
    const publisherKey = getPublisherFollowKey(title);
    if (!publisherKey) return;
    const next = followedPublisherKeys.includes(publisherKey)
      ? followedPublisherKeys.filter(key => key !== publisherKey)
      : [...followedPublisherKeys, publisherKey];
    const updatedUser = db.updateRetailerPublisherFollows(next);
    setFollowedPublisherKeys(next);
    onSessionUpdate?.(updatedUser);
  };

  const filteredTitles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return liveTitles.filter(title => {
      const searchable = [title.title, title.seriesName, title.publisherName, title.writer, title.artist, title.philboId, title.barcode]
        .filter(Boolean).join(' ').toLowerCase();
      return (!needle || searchable.includes(needle)) &&
        (publisher === 'all' || title.publisherName === publisher) &&
        (cycleId === 'all' || title.cycleId === cycleId);
    });
  }, [liveTitles, search, publisher, cycleId]);

  return (
    <div className="public-catalog-page animate-fade-in">
      <section className="public-catalog-hero">
        <span className="home-eyebrow">INDEPENDENT COMIC DISTRIBUTION</span>
        <h1>COMIC CATALOG</h1>
        <p>Browse every title in the current official catalog. Public pricing is MSRP; wholesale ordering is available only to approved retailer accounts during the ordering window.</p>
        <div className="public-catalog-actions">
          {currentUser?.role === 'retailer' ? (
            <button className="btn btn-primary" onClick={() => onNavigate('portal')}>OPEN RETAILER ORDERING</button>
          ) : (
            <button className="btn btn-primary" onClick={() => onNavigate(currentUser ? 'portal' : 'login')}>{currentUser ? 'OPEN MY PORTAL' : 'RETAILER SIGN IN'}</button>
          )}
          <button className="btn btn-secondary" onClick={() => onNavigate('retailers')}>RETAILER INFORMATION</button>
        </div>
      </section>

      <section className="philviews-library" aria-labelledby="philviews-library-title">
        <div className="philviews-library-heading">
          <span>READ THE FULL CATALOGS</span>
          <h2 id="philviews-library-title">PHILVIEWS</h2>
          <p>Open the complete digital catalog, then use the title listings below to search and order.</p>
        </div>
        <div className="philviews-library-grid">
          {PHILVIEWS_CATALOGS.map(catalog => {
            const generatedTitleCount = liveTitles.filter(title => title.cycleId === catalog.cycleId).length;
            const focStatus = getFocStatus(catalog.focDate);
            return (
            <article
              className={`philviews-issue-card${catalog.current ? ' current' : ''}`}
              key={catalog.issue}
              style={{ '--issue-accent': catalog.accentColor, '--issue-complement': catalog.complementColor }}
            >
              <a className="philviews-issue-cover" href={catalog.pdfUrl} target="_blank" rel="noreferrer">
                <img src={assetPath(catalog.coverPath)} alt={`Philviews catalog number ${catalog.issue}, ${catalog.label}`} />
                <span>{catalog.current ? 'CURRENT CATALOG' : 'VIEW CATALOG'}</span>
              </a>
              <div className="philviews-issue-copy">
                <strong className={`philviews-foc-status ${focStatus.className}`}>{focStatus.label}</strong>
                <b>PHILVIEWS #{catalog.issue}</b>
                <span>{catalog.label}</span>
                <dl className="philviews-issue-dates">
                  <div><dt>CATALOG</dt><dd>{formatCatalogDate(catalog.catalogDate)}</dd></div>
                  <div><dt>FOC</dt><dd>{formatCatalogDate(catalog.focDate)}</dd></div>
                  <div><dt>IN STORES</dt><dd>{formatCatalogDate(catalog.releaseDate)}</dd></div>
                </dl>
                <a href={catalog.pdfUrl} target="_blank" rel="noreferrer">OPEN OFFICIAL PDF ↗</a>
                {generatedTitleCount > 0 && (
                  <button type="button" onClick={() => setPrintCycleId(catalog.cycleId)}>
                    VIEW {generatedTitleCount} LINKED SOLICITS
                  </button>
                )}
                <button
                  type="button"
                  className="philviews-csv-access"
                  onClick={() => onNavigate(currentUser?.role === 'retailer' ? 'portal' : 'login')}
                >
                  {currentUser?.role === 'retailer' ? 'OPEN RETAILER CSV' : 'SIGN IN FOR RETAILER CSV'}
                </button>
              </div>
            </article>
          );})}
        </div>
      </section>

      <section className="public-catalog-controls" aria-label="Catalog filters">
        <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, series, publisher, creator, product ID or barcode" />
        <select className="form-select" value={publisher} onChange={(event) => setPublisher(event.target.value)}>
          <option value="all">All Publishers</option>
          {publishers.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select className="form-select" value={cycleId} onChange={(event) => setCycleId(event.target.value)}>
          <option value="all">All Catalog Cycles</option>
          {cycles.filter(cycle => liveTitles.some(title => title.cycleId === cycle.cycleId)).map(cycle => (
            <option key={cycle.cycleId} value={cycle.cycleId}>{cycle.cycleName}</option>
          ))}
        </select>
      </section>

      <section className="public-catalog-results">
        {catalogLoadError && <div className="public-catalog-empty"><h2>Catalog temporarily unavailable.</h2><p>{catalogLoadError}</p></div>}
        <div className="public-catalog-count"><strong>{filteredTitles.length}</strong> published catalog title{filteredTitles.length === 1 ? '' : 's'}</div>
        {filteredTitles.length ? (
          <div className="public-catalog-grid">
            {filteredTitles.map(title => (
              <article
                className="public-catalog-card"
                key={title.titleId}
                role="button"
                tabIndex="0"
                aria-label={`View the full solicitation for ${title.title}`}
                onClick={() => openTitle(title)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openTitle(title);
                  }
                }}
              >
                <div className="public-catalog-cover">
                  {title.coverUrl ? <img src={title.coverUrl} alt={`${title.title} cover`} /> : <span>COVER COMING SOON</span>}
                  <span className={`public-order-status ${title.focLocked ? 'locked' : 'open'}`}>{title.focLocked ? 'FOC LOCKED' : 'OPEN'}</span>
                </div>
                <div className="public-catalog-card-copy">
                  <span>{title.publisherName}</span>
                  <h2>{title.title}</h2>
                  <p>{title.briefSynopsis || title.synopsis || title.description || 'Full catalog information coming soon.'}</p>
                  <div className="public-catalog-card-meta">
                    <strong>{formatMoney(title.msrp)} MSRP</strong>
                    <span>In-store {title.releaseDate || 'TBA'}</span>
                  </div>
                  <span className="btn btn-secondary public-catalog-card-action" aria-hidden="true">VIEW FULL SOLICITATION</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="public-catalog-empty">
            <h2>{liveTitles.length ? 'No titles match these filters.' : 'The catalog is being prepared.'}</h2>
            <p>{liveTitles.length ? 'Try clearing one or more filters.' : 'Titles will appear here when the next official catalog is published.'}</p>
          </div>
        )}
      </section>

      <CatalogProductDetail
        title={selectedTitle}
        onClose={closeTitle}
        viewerRole={isApprovedRetailer ? 'retailer' : (currentUser?.role || 'public')}
        retailerTier={retailerPricing.activeTier}
        discount={retailerPricing.activeDiscount}
        quantity={retailerQuantity}
        onQuantityChange={setRetailerQuantity}
        onAddToOrder={addWebsiteTitleToRetailerOrder}
        onRetailerSignIn={!isApprovedRetailer ? requestRetailerOrdering : undefined}
        publisherFollowed={Boolean(selectedTitle && followedPublisherKeys.includes(getPublisherFollowKey(selectedTitle)))}
        onTogglePublisherFollow={isApprovedRetailer ? toggleSelectedPublisherFollow : undefined}
      />
      {printCycleId && (
        <CatalogPrintPreview
          cycle={cycles.find(cycle => cycle.cycleId === printCycleId)}
          titles={liveTitles.filter(title => title.cycleId === printCycleId)}
          onClose={() => setPrintCycleId('')}
          onOpenTitle={title => {
            setPrintCycleId('');
            openTitle(title);
          }}
        />
      )}
    </div>
  );
}
