import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

interface MediaFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  altText?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (files: MediaFile[]) => void;
  multiple?: boolean;
  kind?: 'image' | 'video' | 'document' | 'all';
}

/**
 * Modal picker that lists existing media + allows inline upload.
 * Drop into any form to replace URL inputs.
 */
export function MediaPicker({ open, onClose, onPick, multiple = false, kind = 'image' }: Props) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (kind !== 'all') params.set('kind', kind);
    if (q) params.set('q', q);
    const r = await api.get<{ items: MediaFile[] }>(`/admin/media?${params}`);
    setFiles(r.items);
  };

  useEffect(() => { if (open) { setSelected(new Set()); void load(); } }, [open, kind]);

  if (!open) return null;

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (multiple) {
      n.has(id) ? n.delete(id) : n.add(id);
    } else {
      n.clear();
      n.add(id);
    }
    setSelected(n);
  };

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append('files', f);
    setUploading(true);
    try {
      const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd, credentials: 'include' });
      if (res.ok) await load();
      else alert('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirm = () => {
    const picked = files.filter((f) => selected.has(f.id));
    onPick(picked);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150 }} onClick={onClose}>
      <div style={{ width: '90vw', maxWidth: 980, maxHeight: '88vh', background: '#fff', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Select media</h3>
          <div className="row">
            <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} style={{ width: 220 }} />
            <button className="btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload new'}
            </button>
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => upload(e.target.files)} accept={kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : undefined} />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '1rem', background: 'var(--bg-alt)' }}>
          {files.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No media. Click Upload to add some.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.5rem' }}>
              {files.map((f) => (
                <div
                  key={f.id}
                  onClick={() => toggle(f.id)}
                  style={{
                    background: '#fff',
                    border: selected.has(f.id) ? '3px solid var(--brand)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ aspectRatio: '1', background: 'var(--bg-alt) center/cover no-repeat' }}>
                    {f.mimeType.startsWith('image/') ? (
                      <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ padding: '.5rem', fontSize: '.75rem', textAlign: 'center', color: 'var(--ink-muted)' }}>{f.mimeType}</div>
                    )}
                  </div>
                  <div style={{ padding: '.4rem', fontSize: '.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.originalName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="spread" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          <span className="muted">{selected.size} selected</span>
          <div className="row">
            <button className="btn secondary" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={confirm} disabled={selected.size === 0}>Insert</button>
          </div>
        </div>
      </div>
    </div>
  );
}
