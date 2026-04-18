import { useEffect, useState, useRef } from 'react';
import { api } from '../../api/client';

interface MediaFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  folder: string;
  tags: string[];
  altText?: string | null;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

interface Stats {
  totalFiles: number;
  totalSize: number;
  images: number;
  videos: number;
  documents: number;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function AdminMedia() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<{ name: string; count: number }[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [folder, setFolder] = useState<string>('');
  const [kind, setKind] = useState<string>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<MediaFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (kind) params.set('kind', kind);
    if (q) params.set('q', q);
    const [f, fo, s] = await Promise.all([
      api.get<{ items: MediaFile[] }>(`/admin/media?${params}`),
      api.get<{ folders: { name: string; count: number }[] }>('/admin/media/folders'),
      api.get<Stats>('/admin/media/stats'),
    ]);
    setFiles(f.items);
    setFolders(fo.folders);
    setStats(s);
    setSelected(new Set());
  };

  useEffect(() => { void load(); }, [folder, kind]);

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append('files', f);
    if (folder) fd.append('folder', folder);
    setUploading(true);
    try {
      const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        alert(err.error ?? 'Upload failed');
      } else {
        void load();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} file(s)? This cannot be undone.`)) return;
    await api.post('/admin/media/bulk-delete', { ids: [...selected] });
    void load();
  };

  const moveSelected = async () => {
    if (selected.size === 0) return;
    const target = prompt('Move to folder (e.g. "/products", "/heroes")', folder || '/');
    if (!target) return;
    await api.post('/admin/media/move', { ids: [...selected], folder: target });
    void load();
  };

  const newFolder = async () => {
    const name = prompt('Folder path (e.g. "/products")');
    if (!name) return;
    // Folders are virtual — they appear once at least one file is moved/uploaded to them.
    setFolder(name);
    alert(`Upload or move files into "${name}" to create it.`);
  };

  const scan = async () => {
    if (!confirm('Scan the uploads directory for untracked files?')) return;
    const r = await api.post<{ imported: number; scanned: any }>('/admin/media/scan');
    alert(`Imported ${r.imported} file(s) from disk.`);
    void load();
  };

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Media Library</h1>
        <div className="row">
          <button className="btn secondary" onClick={scan}>Scan disk</button>
          <button className="btn secondary" onClick={newFolder}>New folder</button>
          <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </div>

      {stats && (
        <div className="stat-grid">
          <div className="stat"><div className="label">Total</div><div className="value">{stats.totalFiles}</div></div>
          <div className="stat"><div className="label">Size</div><div className="value">{humanSize(stats.totalSize)}</div></div>
          <div className="stat"><div className="label">Images</div><div className="value">{stats.images}</div></div>
          <div className="stat"><div className="label">Videos</div><div className="value">{stats.videos}</div></div>
          <div className="stat"><div className="label">Documents</div><div className="value">{stats.documents}</div></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem' }}>
        <aside className="admin-card" style={{ padding: '.75rem' }}>
          <div style={{ fontSize: '.8rem', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '.5rem' }}>Folders</div>
          <button
            className="btn secondary"
            style={{ width: '100%', justifyContent: 'flex-start', background: folder === '' ? 'var(--brand)' : 'transparent', color: folder === '' ? '#fff' : undefined, marginBottom: '.25rem' }}
            onClick={() => setFolder('')}
          >
            All files {stats ? `(${stats.totalFiles})` : ''}
          </button>
          {folders.map((f) => (
            <button
              key={f.name}
              className="btn secondary"
              style={{ width: '100%', justifyContent: 'flex-start', background: folder === f.name ? 'var(--brand)' : 'transparent', color: folder === f.name ? '#fff' : undefined, marginBottom: '.25rem' }}
              onClick={() => setFolder(f.name)}
            >
              {f.name} ({f.count})
            </button>
          ))}

          <div style={{ fontSize: '.8rem', textTransform: 'uppercase', color: 'var(--ink-muted)', margin: '1rem 0 .5rem' }}>Type</div>
          {['', 'image', 'video', 'document'].map((k) => (
            <button
              key={k || 'all'}
              className="btn secondary"
              style={{ width: '100%', justifyContent: 'flex-start', background: kind === k ? 'var(--brand)' : 'transparent', color: kind === k ? '#fff' : undefined, marginBottom: '.25rem', textTransform: 'capitalize' }}
              onClick={() => setKind(k)}
            >
              {k || 'All types'}
            </button>
          ))}
        </aside>

        <div>
          <div className="admin-card">
            <form onSubmit={(e) => { e.preventDefault(); void load(); }} style={{ display: 'flex', gap: '.5rem' }}>
              <input placeholder="Search name, alt text, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn">Search</button>
              {selected.size > 0 && (
                <>
                  <button type="button" className="btn secondary" onClick={moveSelected}>
                    Move ({selected.size})
                  </button>
                  <button type="button" className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={deleteSelected}>
                    Delete ({selected.size})
                  </button>
                </>
              )}
            </form>
          </div>

          {files.length === 0 ? (
            <div className="admin-card">
              <p className="muted">No files. Drag + drop or click Upload.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '.75rem' }}>
              {files.map((f) => (
                <div key={f.id} style={{
                  background: '#fff',
                  border: selected.has(f.id) ? '2px solid var(--brand)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: 'pointer',
                }}>
                  <div
                    style={{ aspectRatio: '1', background: 'var(--bg-alt) center/cover no-repeat' }}
                    onClick={() => toggleSelect(f.id)}
                  >
                    {f.mimeType.startsWith('image/') ? (
                      <img src={f.url} alt={f.altText ?? f.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '.8rem', color: 'var(--ink-muted)' }}>
                        {f.mimeType}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '.5rem' }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.originalName}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--ink-muted)' }}>{humanSize(f.size)}</div>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '.75rem', padding: '.2rem .45rem', marginTop: '.35rem' }}
                      onClick={() => setEditing(f)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && <EditDialog file={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function EditDialog({ file, onClose, onSaved }: { file: MediaFile; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    originalName: file.originalName,
    altText: file.altText ?? '',
    folder: file.folder,
    tags: (file.tags ?? []).join(', '),
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/media/${file.id}`, {
        ...form,
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      });
      onSaved();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm('Delete this file?')) return;
    await api.del(`/admin/media/${file.id}`);
    onSaved();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 }} onClick={onClose}>
      <div style={{ width: 480, background: '#fff', padding: '1.5rem', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2>Edit file</h2>
        {file.mimeType.startsWith('image/') && (
          <img src={file.url} alt="" style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: '1rem' }} />
        )}
        <div className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
          {file.mimeType} · {humanSize(file.size)}
          {file.width && file.height ? ` · ${file.width}×${file.height}` : ''}
        </div>
        <label>Display name</label>
        <input value={form.originalName} onChange={(e) => setForm({ ...form, originalName: e.target.value })} />
        <label>Alt text</label>
        <textarea rows={2} value={form.altText} onChange={(e) => setForm({ ...form, altText: e.target.value })} />
        <label>Folder</label>
        <input value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} />
        <label>Tags (comma-separated)</label>
        <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        <label>Public URL</label>
        <input value={file.url} readOnly onFocus={(e) => e.currentTarget.select()} />
        <div className="row" style={{ marginTop: '1.5rem' }}>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={remove}>Delete</button>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
