import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';

interface MediaRequest {
  id: string;
  message: string;
  status: 'open' | 'fulfilled';
  orderNumber: string;
}

interface MediaRequestResponse {
  mediaRequest: MediaRequest;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const PAGE_STYLE = { padding: '2rem 0', maxWidth: 760 } as const;
const GREEN_CARD = { background: '#d4f5dc', border: '1px solid #166534' } as const;

export function CorrectedUpload() {
  const { token } = useParams();

  const [data, setData] = useState<MediaRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .get<MediaRequestResponse>(`/proofing/media-request/${token}`)
      .then((r) => {
        if (!active) return;
        setData(r);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(e instanceof Error ? e.message : 'Could not load your upload request.');
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function upload() {
    if (!token || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) {
        form.append('files', file);
      }
      const res = await fetch(`/api/proofing/media-request/${token}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Upload failed. Please try again.');
      }
      const result = (await res.json()) as { ok: true; count: number };
      setUploadedCount(result.count);
      setFiles([]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="container" style={PAGE_STYLE}>Loading…</div>;
  }

  if (notFound) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <h1>We couldn't find that upload request</h1>
        <p className="muted">
          This link may have expired or already been completed. If you still need to send us files,
          just reply to the email we sent you and we'll help you out.
        </p>
        <Link to="/" className="btn secondary">Back to home</Link>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="container" style={PAGE_STYLE}>
        <div className="error">{loadError ?? 'Something went wrong.'}</div>
        <Link to="/" className="btn secondary">Back to home</Link>
      </div>
    );
  }

  const { mediaRequest } = data;
  const alreadyFulfilled = mediaRequest.status === 'fulfilled';
  const uploaded = uploadedCount !== null;

  return (
    <div className="container" style={PAGE_STYLE}>
      <h1 style={{ marginBottom: '.5rem' }}>
        Upload corrected files for order {mediaRequest.orderNumber}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Send us your updated files and our team will take it from here.
      </p>

      {/* What staff asked for */}
      <div className="admin-card" style={{ background: 'var(--bg-alt)', borderLeft: '4px solid var(--brand)' }}>
        <div
          className="muted"
          style={{ fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}
        >
          What we need from you
        </div>
        <p style={{ margin: '.35rem 0 0', whiteSpace: 'pre-wrap' }}>{mediaRequest.message}</p>
      </div>

      {/* Success / already-done states */}
      {uploaded ? (
        <div className="admin-card" style={GREEN_CARD}>
          <h3 style={{ marginTop: 0, color: '#166534' }}>
            Thanks — we received {uploadedCount} file{uploadedCount === 1 ? '' : 's'}. Our team will
            take it from here.
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            Need to send more? You can add additional files below.
          </p>
        </div>
      ) : alreadyFulfilled ? (
        <div className="admin-card" style={GREEN_CARD}>
          <h3 style={{ marginTop: 0, color: '#166534' }}>
            You've already uploaded your corrected files — thank you!
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            If you need to send updated files, you can still upload them below.
          </p>
        </div>
      ) : null}

      {/* Upload form */}
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>{uploaded || alreadyFulfilled ? 'Upload more files' : 'Choose your files'}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <input
            key={`file-input-${uploadedCount ?? 'initial'}`}
            type="file"
            multiple
            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          />

          {files.length > 0 && (
            <div style={{ marginTop: '.85rem' }}>
              <div className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }}>
                {files.length} file{files.length === 1 ? '' : 's'} selected
              </div>
              <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem' }}>
                {files.map((f, i) => (
                  <li key={i}>
                    {f.name} <span className="muted">({formatSize(f.size)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploadError && <div className="error">{uploadError}</div>}

          <button
            className="btn"
            type="submit"
            style={{ marginTop: '1rem' }}
            disabled={uploading || files.length === 0}
          >
            {uploading ? 'Uploading…' : 'Upload files'}
          </button>
        </form>
      </div>

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '.85rem' }}>
        Trouble uploading? Just reply to the email we sent you and attach your files there.
      </p>
    </div>
  );
}
