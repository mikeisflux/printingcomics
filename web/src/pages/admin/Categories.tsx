import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Category {
  id: string; slug: string; name: string; description?: string | null;
  parentId?: string | null; sortOrder: number;
  _count: { products: number };
}

export function AdminCategories() {
  const [cats, setCats] = useState<Category[]>([]);
  const [draft, setDraft] = useState({ slug: '', name: '', description: '' });
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.get<{ categories: Category[] }>('/admin/categories').then((r) => setCats(r.categories));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/admin/categories', draft);
      setDraft({ slug: '', name: '', description: '' });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const save = async () => {
    if (!editing) return;
    await api.put(`/admin/categories/${editing.id}`, {
      slug: editing.slug, name: editing.name,
      description: editing.description ?? undefined,
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
          {error && <div className="error">{error}</div>}
          <button className="btn" style={{ marginTop: '1rem' }}>Add</button>
        </form>
      </div>

      <div className="admin-card">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Products</th><th /></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td>{editing?.id === c.id ? <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /> : c.name}</td>
                <td>{editing?.id === c.id ? <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /> : c.slug}</td>
                <td>{c._count.products}</td>
                <td>
                  {editing?.id === c.id ? (
                    <>
                      <button className="btn" onClick={save}>Save</button>
                      <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
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
    </div>
  );
}
