import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { MediaPicker } from '../../components/MediaPicker';

interface VolumeTier { minQty: number; pricePerUnitCents: number; }
interface Image { url: string; alt?: string; }
interface Category { id: string; slug: string; name: string; }
interface Variant { id: string; sku?: string | null; label: string; priceCents: number; stock: number; active: boolean; }
interface OptionValue { id: string; label: string; priceModifierCents: number; sortOrder: number; }
interface Option { id: string; name: string; sortOrder: number; values: OptionValue[]; }

interface ProductDraft {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  hasVariants: boolean;
  sku: string;
  stock: number;
  madeToOrder: boolean;
  active: boolean;
  minQuantity: number;
  weightGrams: number;
  volumeTiers: VolumeTier[];
  seoTitle: string;
  seoDescription: string;
  categoryIds: string[];
  images: Image[];
}

const emptyDraft: ProductDraft = {
  slug: '', name: '', shortDescription: '', description: '',
  priceCents: 0, hasVariants: false, sku: '', stock: 0,
  madeToOrder: true, active: true, minQuantity: 1, weightGrams: 0,
  volumeTiers: [], seoTitle: '', seoDescription: '',
  categoryIds: [], images: [],
};

export function AdminProductEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = async () => {
    const catsRes = await api.get<{ categories: Category[] }>('/admin/categories');
    setCategories(catsRes.categories);
    if (!isNew && id) {
      const r = await api.get<{ product: any }>(`/admin/products/${id}`);
      const p = r.product;
      setDraft({
        slug: p.slug, name: p.name,
        shortDescription: p.shortDescription ?? '',
        description: p.description ?? '',
        priceCents: p.priceCents,
        hasVariants: p.hasVariants,
        sku: p.sku ?? '',
        stock: p.stock,
        madeToOrder: p.madeToOrder,
        active: p.active,
        minQuantity: p.minQuantity,
        weightGrams: p.weightGrams,
        volumeTiers: p.volumeTiers ?? [],
        seoTitle: p.seoTitle ?? '',
        seoDescription: p.seoDescription ?? '',
        categoryIds: p.categories.map((c: any) => c.category.id),
        images: p.images.map((i: any) => ({ url: i.url, alt: i.alt ?? undefined })),
      });
      setVariants(p.variants);
      setOptions(p.options ?? []);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        ...draft,
        sku: draft.sku || undefined,
        shortDescription: draft.shortDescription || undefined,
        description: draft.description || undefined,
        seoTitle: draft.seoTitle || undefined,
        seoDescription: draft.seoDescription || undefined,
        volumeTiers: draft.volumeTiers.length > 0 ? draft.volumeTiers : undefined,
      };
      if (isNew) {
        const r = await api.post<{ product: { id: string } }>('/admin/products', payload);
        navigate(`/admin/products/${r.product.id}`);
      } else {
        await api.put(`/admin/products/${id}`, payload);
      }
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!id) return;
    const payload: any = {
      ...draft,
      slug: `${draft.slug}-copy`,
      name: `${draft.name} (copy)`,
      sku: draft.sku ? `${draft.sku}-copy` : undefined,
      shortDescription: draft.shortDescription || undefined,
      description: draft.description || undefined,
      seoTitle: draft.seoTitle || undefined,
      seoDescription: draft.seoDescription || undefined,
      volumeTiers: draft.volumeTiers.length > 0 ? draft.volumeTiers : undefined,
    };
    const r = await api.post<{ product: { id: string } }>('/admin/products', payload);
    navigate(`/admin/products/${r.product.id}`);
  };

  const remove = async () => {
    if (!id || !confirm('Delete this product?')) return;
    await api.del(`/admin/products/${id}`);
    navigate('/admin/products');
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= draft.images.length) return;
    const next = [...draft.images];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    setDraft({ ...draft, images: next });
  };

  // --- Variant handlers ---
  const [newVariant, setNewVariant] = useState<Omit<Variant, 'id'>>({ label: '', priceCents: 0, stock: 0, active: true });
  const addVariant = async () => {
    if (!id || !newVariant.label) return;
    const r = await api.post<{ variant: Variant }>(`/admin/products/${id}/variants`, newVariant);
    setVariants([...variants, r.variant]);
    setNewVariant({ label: '', priceCents: 0, stock: 0, active: true });
  };
  const updateVariant = async (v: Variant, patch: Partial<Variant>) => {
    const merged = { ...v, ...patch };
    await api.put(`/admin/products/${id}/variants/${v.id}`, {
      label: merged.label, priceCents: merged.priceCents, stock: merged.stock, active: merged.active, sku: merged.sku ?? undefined,
    });
    setVariants(variants.map((x) => (x.id === v.id ? merged : x)));
  };
  const deleteVariant = async (variantId: string) => {
    if (!id || !confirm('Delete variant?')) return;
    await api.del(`/admin/products/${id}/variants/${variantId}`);
    setVariants(variants.filter((v) => v.id !== variantId));
  };

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>{isNew ? 'New product' : 'Edit product'}</h1>
        <div className="row">
          {!isNew && <button className="btn secondary" onClick={duplicate}>Duplicate</button>}
          {!isNew && <button className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={remove}>Delete</button>}
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="admin-card">
        <h3>Basics</h3>
        <label>Name</label>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <label>Slug</label>
        <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
        <label>Short description</label>
        <input value={draft.shortDescription} onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })} />
        <label>Full description</label>
        <textarea rows={6} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </div>

      <div className="admin-card">
        <h3>Pricing &amp; inventory</h3>
        <div className="grid-2">
          <div>
            <label>Base price (cents)</label>
            <input type="number" value={draft.priceCents} onChange={(e) => setDraft({ ...draft, priceCents: Number(e.target.value) })} />
          </div>
          <div>
            <label>SKU</label>
            <input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label>Stock</label>
            <input type="number" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })} />
          </div>
          <div>
            <label>Min quantity</label>
            <input type="number" value={draft.minQuantity} onChange={(e) => setDraft({ ...draft, minQuantity: Number(e.target.value) })} />
          </div>
        </div>
        <div className="row">
          <label><input type="checkbox" checked={draft.madeToOrder} onChange={(e) => setDraft({ ...draft, madeToOrder: e.target.checked })} style={{ width: 'auto' }} /> Made to order (no stock tracking)</label>
          <label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} style={{ width: 'auto' }} /> Active</label>
          <label><input type="checkbox" checked={draft.hasVariants} onChange={(e) => setDraft({ ...draft, hasVariants: e.target.checked })} style={{ width: 'auto' }} /> Has variants (show "from" price)</label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Volume pricing tiers</h3>
        <p className="muted">Each tier sets the per-unit price when quantity ≥ minQty.</p>
        {draft.volumeTiers.map((t, i) => (
          <div key={i} className="row" style={{ marginBottom: '.5rem' }}>
            <label style={{ margin: 0 }}>Min qty</label>
            <input type="number" value={t.minQty} onChange={(e) => {
              const tiers = [...draft.volumeTiers];
              tiers[i] = { ...t, minQty: Number(e.target.value) };
              setDraft({ ...draft, volumeTiers: tiers });
            }} />
            <label style={{ margin: 0 }}>Price (cents)</label>
            <input type="number" value={t.pricePerUnitCents} onChange={(e) => {
              const tiers = [...draft.volumeTiers];
              tiers[i] = { ...t, pricePerUnitCents: Number(e.target.value) };
              setDraft({ ...draft, volumeTiers: tiers });
            }} />
            <button className="btn secondary" onClick={() => setDraft({ ...draft, volumeTiers: draft.volumeTiers.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn secondary" onClick={() => setDraft({ ...draft, volumeTiers: [...draft.volumeTiers, { minQty: 1, pricePerUnitCents: 0 }] })}>
          Add tier
        </button>
      </div>

      <div className="admin-card">
        <h3>Categories</h3>
        {categories.map((c) => (
          <label key={c.id} style={{ display: 'inline-flex', marginRight: '1rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={draft.categoryIds.includes(c.id)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...draft.categoryIds, c.id]
                  : draft.categoryIds.filter((x) => x !== c.id);
                setDraft({ ...draft, categoryIds: next });
              }}
              style={{ width: 'auto', marginRight: '.25rem' }}
            />
            {c.name}
          </label>
        ))}
      </div>

      <div className="admin-card">
        <div className="spread" style={{ marginBottom: '.75rem' }}>
          <h3 style={{ margin: 0 }}>Images</h3>
          <button className="btn" onClick={() => setPickerOpen(true)}>Add from library</button>
        </div>
        {draft.images.length === 0 && <p className="muted">No images yet.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.75rem' }}>
          {draft.images.map((img, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div style={{ aspectRatio: '1', background: 'var(--bg-alt) center/cover no-repeat' }}>
                {img.url && <img src={img.url} alt={img.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ padding: '.4rem' }}>
                <input placeholder="Alt" value={img.alt ?? ''} onChange={(e) => {
                  const imgs = [...draft.images];
                  imgs[i] = { ...img, alt: e.target.value };
                  setDraft({ ...draft, images: imgs });
                }} style={{ fontSize: '.8rem', padding: '.3rem' }} />
                <div style={{ display: 'flex', gap: '.25rem', marginTop: '.25rem' }}>
                  <button className="btn secondary" style={{ padding: '.2rem .4rem', fontSize: '.75rem' }} onClick={() => moveImage(i, i - 1)}>↑</button>
                  <button className="btn secondary" style={{ padding: '.2rem .4rem', fontSize: '.75rem' }} onClick={() => moveImage(i, i + 1)}>↓</button>
                  <button className="btn secondary" style={{ padding: '.2rem .4rem', fontSize: '.75rem', color: '#b91c1c' }} onClick={() => setDraft({ ...draft, images: draft.images.filter((_, j) => j !== i) })}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isNew && (
        <div className="admin-card">
          <h3>Variants</h3>
          {variants.length === 0 && <p className="muted">No variants yet. Enable "Has variants" above and add some below.</p>}
          <table className="admin-table">
            <thead><tr><th>Label</th><th>SKU</th><th>Price ($)</th><th>Stock</th><th>Active</th><th /></tr></thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td><input value={v.label} onChange={(e) => updateVariant(v, { label: e.target.value })} /></td>
                  <td><input value={v.sku ?? ''} onChange={(e) => updateVariant(v, { sku: e.target.value })} /></td>
                  <td><input type="number" step="0.01" value={(v.priceCents / 100).toFixed(2)} onChange={(e) => updateVariant(v, { priceCents: Math.round(Number(e.target.value) * 100) })} /></td>
                  <td><input type="number" value={v.stock} onChange={(e) => updateVariant(v, { stock: Number(e.target.value) })} /></td>
                  <td><input type="checkbox" checked={v.active} onChange={(e) => updateVariant(v, { active: e.target.checked })} style={{ width: 'auto' }} /></td>
                  <td><button className="btn secondary" onClick={() => deleteVariant(v.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <h4>Add variant</h4>
            <div className="row">
              <input placeholder='Label (e.g. "48pg / Soft Cover")' value={newVariant.label} onChange={(e) => setNewVariant({ ...newVariant, label: e.target.value })} />
              <input type="number" placeholder="Price (cents)" value={newVariant.priceCents} onChange={(e) => setNewVariant({ ...newVariant, priceCents: Number(e.target.value) })} style={{ width: 140 }} />
              <input type="number" placeholder="Stock" value={newVariant.stock} onChange={(e) => setNewVariant({ ...newVariant, stock: Number(e.target.value) })} style={{ width: 100 }} />
              <button className="btn" onClick={addVariant}>Add</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h3>SEO</h3>
        <label>Title</label>
        <input value={draft.seoTitle} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} />
        <label>Meta description</label>
        <textarea rows={2} value={draft.seoDescription} onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })} />
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => {
          setDraft({
            ...draft,
            images: [...draft.images, ...picked.map((p) => ({ url: p.url, alt: p.altText ?? undefined }))],
          });
        }}
        multiple
        kind="image"
      />
    </div>
  );
}
