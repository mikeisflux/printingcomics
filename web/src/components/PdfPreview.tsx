import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Shows a stored file without handing a PDF to the browser's own viewer.
 * Print-production PDFs (CMYK, transparency, JPEG 2000) render as solid black
 * in Chrome's and Edge's built-in engines while the file itself is fine; the
 * server rasterises pages with poppler instead (/api/previews) and we show
 * PNGs. Images are shown directly.
 */

interface Info { kind: 'pdf' | 'image' | 'other'; available: boolean; reason: string | null; pages: number }

export function PdfPreview({
  mediaId, token, fileUrl, fileName, maxHeight = 640,
}: {
  mediaId: string;
  /** Proof review token, for customers who have no session. */
  token?: string;
  fileUrl: string;
  fileName: string;
  maxHeight?: number;
}) {
  const q = token ? `?t=${encodeURIComponent(token)}` : '';
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setInfo(null); setError(null); setPage(1);
    api.get<Info>(`/previews/${mediaId}/info${q}`)
      .then((i) => { if (alive) setInfo(i); })
      .catch((e: any) => { if (alive) setError(e?.message ?? 'Could not load the preview'); });
    return () => { alive = false; };
  }, [mediaId, q]);

  useEffect(() => {
    if (!info || info.kind !== 'pdf' || info.pages < 2) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(info.pages, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [info]);

  const links = (
    <div className="row" style={{ marginTop: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
      <a className="btn secondary sm" href={fileUrl} target="_blank" rel="noopener noreferrer">Open original</a>
      <a className="btn secondary sm" href={fileUrl} download={fileName}>Download</a>
    </div>
  );

  if (error) return <div><div className="error">{error}</div>{links}</div>;
  if (!info) return <p className="muted">Loading preview…</p>;

  if (info.kind === 'image') {
    return (
      <div>
        <img src={fileUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight, display: 'block', margin: '0 auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
        {links}
      </div>
    );
  }

  if (!info.available) {
    return (
      <div>
        <div className="admin-card" style={{ background: 'var(--bg-alt)', marginBottom: 0 }}>
          <strong>No preview for this file.</strong>
          <div className="muted" style={{ marginTop: '.25rem' }}>{info.reason ?? 'Download it to view it.'}</div>
        </div>
        {links}
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: 'relative', background: '#e9e6e1', borderRadius: 'var(--radius)', border: '1px solid var(--border)', minHeight: 200, display: 'flex', justifyContent: 'center' }}>
        {imgLoading && (
          <div className="muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Rendering page {page}…
          </div>
        )}
        <img
          key={page}
          src={`/api/previews/${mediaId}/page/${page}${q}`}
          alt={`${fileName} — page ${page} of ${info.pages}`}
          onLoad={() => setImgLoading(false)}
          onLoadStart={() => setImgLoading(true)}
          onError={() => { setImgLoading(false); setError(`Page ${page} could not be rendered.`); }}
          style={{ maxWidth: '100%', maxHeight, objectFit: 'contain', display: 'block', opacity: imgLoading ? 0 : 1, transition: 'opacity .15s' }}
        />
      </div>
      <div className="spread" style={{ marginTop: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
        {info.pages > 1 ? (
          <div className="row" style={{ gap: '.5rem' }}>
            <button type="button" className="btn secondary sm" disabled={page <= 1} onClick={() => { setImgLoading(true); setPage(page - 1); }}>‹ Prev</button>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>Page {page} of {info.pages}</span>
            <button type="button" className="btn secondary sm" disabled={page >= info.pages} onClick={() => { setImgLoading(true); setPage(page + 1); }}>Next ›</button>
          </div>
        ) : <span className="muted">1 page</span>}
        {links}
      </div>
    </div>
  );
}

/** A modal around PdfPreview for the admin's file chips. */
export function FilePreviewModal({
  media, token, onClose,
}: {
  media: { id: string; url: string; originalName: string };
  token?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="pc-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-dialog" role="dialog" aria-modal="true" style={{ width: 'min(960px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="spread" style={{ marginBottom: '.75rem' }}>
          <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>{media.originalName}</h3>
          <button type="button" className="btn secondary sm" onClick={onClose}>Close</button>
        </div>
        <PdfPreview mediaId={media.id} token={token} fileUrl={media.url} fileName={media.originalName} maxHeight={720} />
      </div>
    </div>
  );
}
