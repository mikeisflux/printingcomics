import { useState, type ReactNode } from 'react';
import { PRINT_FILE_KIND_BY_OPTION_KEY, PRINT_FILE_LABELS, formatFileSize, printFileInstructions, printFileSummary, uploadWithProgress } from '../lib/print-files';

interface UploadOpt {
  id: string;
  name: string;
  internalKey?: string | null;
  required: boolean;
  helpText?: string | null;
  longDescription?: string | null;
}

interface Uploaded { url: string; filename: string; size?: number; pages?: number | null }

/**
 * The configurator's upload control. A print-file slot (the Cover PDF, the
 * Interior PDF, a print's artwork) takes exactly one PDF, says what must be
 * in it, and is checked by the server before it is accepted. Any other
 * upload option keeps the older any-number-of-files behaviour.
 *
 * The option's value is the uploaded file's URL (several, one per line, for
 * the older control) — that is what the cart and the order carry.
 */
export function UploadOption({ opt, value, onChange, productId, expectedPages, label }: {
  opt: UploadOpt;
  value: string | number | boolean | undefined;
  onChange: (v: string) => void;
  productId?: string;
  /** For the Interior PDF: the page count picked, which the file must match. */
  expectedPages?: number | null;
  /** Rendered above the control when the caller has its own heading. */
  label?: ReactNode;
}) {
  const key = opt.internalKey ?? opt.id;
  const kind = PRINT_FILE_KIND_BY_OPTION_KEY[key] ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [known, setKnown] = useState<Record<string, Uploaded>>({});
  const urls = typeof value === 'string' && value ? value.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  async function send(list: FileList | null, single: boolean) {
    if (!list || list.length === 0) return;
    setBusy(true); setErr(null); setProgress(0);
    try {
      const fd = new FormData();
      for (const file of Array.from(list)) fd.append('files', file);
      if (productId) fd.append('productId', productId);
      fd.append('optionKey', key);
      if (kind) {
        fd.append('kind', kind);
        if (kind === 'interior' && expectedPages) fd.append('expectedPages', String(expectedPages));
      }
      const body = await uploadWithProgress<{ files?: Uploaded[]; url?: string; filename?: string; pages?: number | null }>('/api/uploads/customer', fd, setProgress);
      const uploaded: Uploaded[] = Array.isArray(body.files) ? body.files : body.url ? [{ url: body.url, filename: body.filename ?? body.url, pages: body.pages ?? null }] : [];
      if (uploaded.length === 0) throw new Error('Upload failed. Please try again.');
      setKnown((m) => { const next = { ...m }; for (const u of uploaded) next[u.url] = u; return next; });
      onChange(single ? uploaded[0]!.url : [...urls, ...uploaded.map((u) => u.url)].join('\n'));
    } catch (e: any) {
      setErr(e?.message ?? 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ---- a print-file slot: one PDF, with the rules next to it ----
  if (kind) {
    const current = urls[0] ?? null;
    const info = current ? known[current] : undefined;
    const slotLabel = PRINT_FILE_LABELS[kind];
    return (
      <div
        data-testid={`print-file-${kind}`}
        style={{ border: `2px solid ${current ? '#16a34a' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '.85rem 1rem', background: current ? '#f0fdf4' : '#fff' }}
      >
        {label ?? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
            <strong>{opt.name || slotLabel}</strong>
            {opt.required && <span style={{ color: '#b91c1c' }}>*</span>}
            <span className="muted" style={{ fontSize: '.85rem' }}>— {printFileSummary(kind, expectedPages ?? null)}</span>
          </div>
        )}
        <ul style={{ margin: '.5rem 0 .75rem', paddingLeft: '1.1rem', fontSize: '.85rem', lineHeight: 1.5 }}>
          {printFileInstructions(kind, expectedPages ?? null).map((line, i) => <li key={i}>{line}</li>)}
        </ul>
        {current ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', fontSize: '.9rem' }}>
            <span aria-hidden="true" style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
            <a href={current} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
              {info?.filename ?? 'Uploaded PDF'}
            </a>
            {info?.pages ? <span className="muted">{info.pages} page{info.pages === 1 ? '' : 's'}</span> : null}
            {info?.size ? <span className="muted">· {formatFileSize(info.size)}</span> : null}
            <label className="btn secondary" style={{ padding: '.2rem .6rem', fontSize: '.8rem', cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? `Uploading… ${progress}%` : 'Replace'}
              <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={busy} onChange={(e) => { void send(e.target.files, true); e.currentTarget.value = ''; }} />
            </label>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: '.2rem .6rem', fontSize: '.8rem' }}
              disabled={busy}
              title="Take this file out — the spot goes back to empty so you can choose another"
              onClick={() => { setErr(null); onChange(''); }}
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="btn" style={{ display: 'inline-block', cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? `Uploading… ${progress}%` : `Choose ${slotLabel}`}
            <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={busy} onChange={(e) => { void send(e.target.files, true); e.currentTarget.value = ''; }} />
          </label>
        )}
        {err && <div className="error" style={{ marginTop: '.5rem' }}>{err}</div>}
      </div>
    );
  }

  // ---- any other upload option: as many files as they like ----
  return (
    <div>
      {label ?? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
          <strong>{opt.name}</strong>
          {opt.required && <span style={{ color: '#b91c1c' }}>*</span>}
          {opt.helpText && <span className="muted" style={{ fontSize: '.85rem' }}>{opt.helpText}</span>}
        </div>
      )}
      <label className="btn secondary" style={{ cursor: busy ? 'wait' : 'pointer', display: 'inline-block' }}>
        {busy ? `Uploading… ${progress}%` : urls.length ? 'Add more files' : 'Choose files'}
        <input type="file" multiple style={{ display: 'none' }} disabled={busy} onChange={(e) => { void send(e.target.files, false); e.currentTarget.value = ''; }} />
      </label>
      {urls.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '.6rem 0 0', display: 'grid', gap: '.35rem' }}>
          {urls.map((u, i) => (
            <li key={u} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
              <span aria-hidden="true">📄</span>
              <a href={u} target="_blank" rel="noreferrer" style={{ flex: 1, wordBreak: 'break-all' }}>{known[u]?.filename ?? u.split('/').pop()}</a>
              {!busy && (
                <button type="button" className="btn secondary" style={{ padding: '.1rem .45rem', fontSize: '.75rem' }} onClick={() => onChange(urls.filter((_, j) => j !== i).join('\n'))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {opt.longDescription && <p className="muted" style={{ fontSize: '.8rem', margin: '.4rem 0 0' }}>{opt.longDescription}</p>}
      {err && <div className="error" style={{ marginTop: '.5rem' }}>{err}</div>}
    </div>
  );
}
