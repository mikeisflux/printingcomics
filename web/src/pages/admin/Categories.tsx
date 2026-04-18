import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { MediaPicker } from '../../components/MediaPicker';

interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  heroImageUrl?: string | null;
  iconUrl?: string | null;
  parentId?: string | null;
  sortOrder: number;
  _count: { products: number };
}

type PickerTarget = { kind: 'new' | 'edit'; field: 'heroImageUrl' | 'iconUrl' };

export function AdminCategories() {
  const [cats, setCats] = useState<Category[]>([]);
  const [draft, setDraft] = useState({
    slug: '', name: '', description: '',
    heroImageUrl: '', iconUrl: '',
  });
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const load = () => {
    void api.get<{ categories: Category[] }>('/admin/categories').then((r) => setCats(r.categories));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/admin/categories', {
        ...draft,
        description: draft.description || undefined,
        heroImageUrl: draft.heroImageUrl || undefined,
        iconUrl: draft.iconUrl || undefined,
      });
      setDraft({ slug: '', name: '', description: '', heroImageUrl: '', iconUrl: '' });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const save = async () => {
    if (!editing) return;
    await api.put(`/admin/categories/${editing.id}`, {
      slug: editing.slug,
      name: editing.name,
      description: editing.description ?? undefined,
      heroImageUrl: editing.heroImageUrl ?? undefined,
      iconUrl: editing.iconUrl ?? undefined,
      sortOrder: editing.sortOrder,
    });
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete category?')) return;
    await api.del(`/admin/categories/${id}`);
    load();
  };

  return (
    <div>
      <h1>Categories</h1>

      <div className="admin-card">
        <h3>Add category</h3>
        <form onSubmit={create}>
          <div className="grid-2">
            <div><label>Name</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></div>
            <div><label>Slug</label><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} required pattern="[a-z0-9-]+" /></div>
          </div>
          <label>Description</label>
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

          <div className="grid-2">
            <div>
              <label>Hero image</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                {draft.heroImageUrl && <img src={draft.heroImageUrl} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />}
                <button type="button" className="btn secondary" onClick={() => setPicker({ kind: 'new', field: 'heroImageUrl' })}>
                  {draft.heroImageUrl ? 'Change' : 'Choose…'}
                </button>
                {draft.heroImageUrl && <button type="button" className="btn secondary" onClick={() => setDraft({ ...draft, heroImageUrl: '' })}>Clear</button>}
              </div>
            </div>
            <div>
              <label>Icon</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                {draft.iconUrl && <img src={draft.iconUrl} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />}
                <button type="button" className="btn secondary" onClick={() => setPicker({ kind: 'new', field: 'iconUrl' })}>
                  {draft.iconUrl ? 'Change' : 'Choose…'}
                </button>
                {draft.iconUrl && <button type="button" className="btn secondary" onClick={() => setDraft({ ...draft, iconUrl: '' })}>Clear</button>}
              </div>
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          <button className="btn" style={{ marginTop: '1rem' }}>Add category</button>
        </form>
      </div>

      <div className="admin-card">
        <table className="admin-table">
          <thead><tr><th>Hero</th><th>Name</th><th>Slug</th><th>Products</th><th /></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.heroImageUrl
                    ? <img src={c.heroImageUrl} alt="" style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                    : <div style={{ width: 60, height: 40, background: 'var(--bg-alt)', borderRadius: 4 }} />}
                </td>
                <td>{editing?.id === c.id ? <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /> : c.name}</td>
                <td>{editing?.id === c.id ? <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /> : c.slug}</td>
                <td>{c._count.products}</td>
                <td>
                  {editing?.id === c.id ? (
                    <>
                      <div className="row">
                        <button type="button" className="btn secondary" onClick={() => setPicker({ kind: 'edit', field: 'heroImageUrl' })}>Hero</button>
                        <button type="button" className="btn secondary" onClick={() => setPicker({ kind: 'edit', field: 'iconUrl' })}>Icon</button>
                        <button className="btn" onClick={save}>Save</button>
                        <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button className="btn secondary" onClick={() => setEditing(c)}>Edit</button>
                      <button className="btn secondary" onClick={() => remove(c.id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(files) => {
          if (!picker || files.length === 0) return;
          const url = files[0]!.url;
          if (picker.kind === 'new') {
            setDraft({ ...draft, [picker.field]: url });
          } else if (editing) {
            setEditing({ ...editing, [picker.field]: url });
          }
        }}
        kind="image"
      />
    </div>
  );
}
