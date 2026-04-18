import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';

interface VolumeTier { minQty: number; pricePerUnitCents: number; }
interface Image { url: string; alt?: string; }
interface Category { id: string; slug: string; name: string; }
interface Variant { id: string; sku?: string | null; label: string; priceCents: number; stock: number; active: boolean; }

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<{ categories: Category[] }>('/admin/categories').then((r) => setCategories(r.categories));
    if (!isNew && id) {
      void api.get<{ product: any }>(`/admin/products/${id}`).then((r) => {
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
      });
    }
  }, [id, isNew]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
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

  const remove = async () => {
    if (!id || !confirm('Delete this product?')) return;
    await api.del(`/admin/products/${id}`);
    navigate('/admin/products');
  };

  const addVariant = async () => {
    if (!id) return;
    const label = prompt('Variant label (e.g. "48pg / Soft Cover")');
    if (!label) return;
    const price = Number(prompt('Price (cents)') ?? '0');
    const r = await api.post<{ variant: Variant }>(`/admin/products/${id}/variants`, {
      label, priceCents: price, stock: 0, active: true,
    });
    setVariants([...variants, r.variant]);
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
          {!isNew && <button className="btn secondary" onClick={remove}>Delete</button>}
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
        <textarea rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
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
        </div>
      </div>

      <div className="admin-card">
        <h3>Volume pricing tiers</h3>
        <p className="muted">Each tier sets the per-unit price when quantity ≥ minQty.</p>
        {draft.volumeTiers.map((t, i) => (
          <div key={i} className="row" style={{ marginBottom: '.5rem' }}>
            <input type="number" value={t.minQty} onChange={(e) => {
              const tiers = [...draft.volumeTiers];
              tiers[i] = { ...t, minQty: Number(e.target.value) };
              setDraft({ ...draft, volumeTiers: tiers });
            }} />
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
        <h3>Images</h3>
        <p className="muted">Paste image URLs; file upload comes later.</p>
        {draft.images.map((img, i) => (
          <div key={i} className="row" style={{ marginBottom: '.5rem' }}>
            <input placeholder="https://…" value={img.url} onChange={(e) => {
              const imgs = [...draft.images];
              imgs[i] = { ...img, url: e.target.value };
              setDraft({ ...draft, images: imgs });
            }} />
            <input placeholder="Alt text" value={img.alt ?? ''} onChange={(e) => {
              const imgs = [...draft.images];
              imgs[i] = { ...img, alt: e.target.value };
              setDraft({ ...draft, images: imgs });
            }} />
            <button className="btn secondary" onClick={() => setDraft({ ...draft, images: draft.images.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn secondary" onClick={() => setDraft({ ...draft, images: [...draft.images, { url: '' }] })}>
          Add image
        </button>
      </div>

      {!isNew && (
        <div className="admin-card">
          <div className="spread"><h3 style={{ margin: 0 }}>Variants</h3><button className="btn secondary" onClick={addVariant}>Add variant</button></div>
          <table className="admin-table">
            <thead><tr><th>Label</th><th>Price</th><th>Stock</th><th /></tr></thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.label}</td>
                  <td>${(v.priceCents / 100).toFixed(2)}</td>
                  <td>{v.stock}</td>
                  <td><button className="btn secondary" onClick={() => deleteVariant(v.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-card">
        <h3>SEO</h3>
        <label>Title</label>
        <input value={draft.seoTitle} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} />
        <label>Meta description</label>
        <textarea rows={2} value={draft.seoDescription} onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })} />
      </div>
    </div>
  );
}
