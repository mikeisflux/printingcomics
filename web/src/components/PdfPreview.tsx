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

  // Download is the reliable action. The raw-PDF link is still offered, but
  // named for what it does: it hands the file to the browser's own viewer,
  // which is the thing that shows print PDFs as black pages.
  const links = (
    <div className="row" style={{ marginTop: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
      <a className="btn sm" href={fileUrl} download={fileName}>Download</a>
      <a
        className="btn secondary sm"
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Opens in the browser's own PDF viewer, which often shows print-production PDFs as black pages. Download is the reliable option."
      >
        {info?.kind === 'image' ? 'Open full size' : 'Open raw PDF in browser'}
      </a>
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

/**
 * A modal around PdfPreview for the admin's file chips. Can start from just a
 * URL (the option summary only has that); the file is then looked up by it.
 */
export function FilePreviewModal({
  media, token, onClose,
}: {
  media: { id?: string; url: string; originalName: string };
  token?: string;
  onClose: () => void;
}) {
  const [resolved, setResolved] = useState<{ id: string; url: string; originalName: string } | null>(media.id ? { id: media.id, url: media.url, originalName: media.originalName } : null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (media.id) return;
    let alive = true;
    api.get<{ media: { id: string; url: string; originalName: string } }>(`/previews/lookup?url=${encodeURIComponent(media.url)}`)
      .then((r) => { if (alive) setResolved(r.media); })
      .catch((e: any) => { if (alive) setLookupError(e?.message ?? 'Could not find this file'); });
    return () => { alive = false; };
  }, [media.id, media.url]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="pc-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-dialog" role="dialog" aria-modal="true" style={{ width: 'min(960px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="spread" style={{ marginBottom: '.75rem' }}>
          <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>{resolved?.originalName ?? media.originalName}</h3>
          <button type="button" className="btn secondary sm" onClick={onClose}>Close</button>
        </div>
        {resolved ? (
          <PdfPreview mediaId={resolved.id} token={token} fileUrl={resolved.url} fileName={resolved.originalName} maxHeight={720} />
        ) : lookupError ? (
          <div>
            <div className="error">{lookupError}</div>
            <a className="btn sm" href={media.url} download={media.originalName}>Download</a>
          </div>
        ) : (
          <p className="muted">Finding the file…</p>
        )}
      </div>
    </div>
  );
}
