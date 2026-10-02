import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { PageHeader, TableState, errorMessage, rowClick, useConfirm, useDebounced, useToast } from '../../components/admin/ui';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  stock: number;
  active: boolean;
  madeToOrder?: boolean;
  backorder?: boolean;
  images: { url: string }[];
}

interface Category { id: string; name: string; }

export function AdminProducts() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [bulkCats, setBulkCats] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    api.get<{ products: ProductRow[] }>(`/admin/products${qs}`)
      .then((r) => { if (alive) setProducts(r.products); })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load products')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, tick]);

  useEffect(() => {
    void api.get<{ categories: Category[] }>('/admin/categories').then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const allChecked = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(products.map((p) => p.id)));

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    if (selected.size === 0) return;
    const n = selected.size;
    if (action === 'delete') {
      const ok = await confirm({
        title: `Delete ${n} product${n === 1 ? '' : 's'}?`,
        body: 'They disappear from the storefront immediately. Orders that already include them keep their line items. This cannot be undone.',
        confirmLabel: `Delete ${n}`,
        danger: true,
      });
      if (!ok) return;
    }
    setWorking(true);
    try {
      await api.post('/admin/products/bulk', { ids: Array.from(selected), action, ...extra });
      const did: Record<string, string> = {
        activate: 'activated', deactivate: 'deactivated', delete: 'deleted', 'assign-categories': 'moved',
      };
      toast.success(`${n} product${n === 1 ? '' : 's'} ${did[action] ?? 'updated'}.`);
      setSelected(new Set());
      setBulkCats(new Set());
      setTick((t) => t + 1);
    } catch (e) {
      toast.error(errorMessage(e, 'Bulk update failed'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={!loading && !error ? `${products.length} shown` : undefined}
        actions={<Link to="/admin/products/new" className="btn">New product</Link>}
      />

      <SharedStockCard />

      <div className="admin-card">
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label>Search</label>
            <input type="search" placeholder="Name or SKU" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {q && <button className="btn secondary sm" onClick={() => setQ('')}>Clear</button>}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="admin-card" style={{ background: '#fff8e1', border: '1px solid #f0c65a' }}>
          <div className="spread" style={{ flexWrap: 'wrap', gap: '.75rem' }}>
            <strong>{selected.size} selected</strong>
            <div className="row" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
              <button className="btn secondary sm" disabled={working} onClick={() => void runBulk('activate')}>Activate</button>
              <button className="btn secondary sm" disabled={working} onClick={() => void runBulk('deactivate')}>Deactivate</button>
              <button className="btn secondary danger sm" disabled={working} onClick={() => void runBulk('delete')}>Delete</button>
              <button className="btn secondary sm" disabled={working} onClick={() => setSelected(new Set())}>Clear selection</button>
            </div>
          </div>
          <div style={{ marginTop: '.75rem' }}>
            <strong style={{ fontSize: '.85rem' }}>Move to categories (replaces their current ones):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', margin: '.5rem 0' }}>
              {categories.map((c) => (
                <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={bulkCats.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(bulkCats);
                      if (e.target.checked) next.add(c.id); else next.delete(c.id);
                      setBulkCats(next);
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <button
              className="btn sm"
              disabled={working || bulkCats.size === 0}
              onClick={() => void runBulk('assign-categories', { categoryIds: Array.from(bulkCats) })}
            >
              Apply categories
            </button>
          </div>
        </div>
      )}

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ width: 'auto' }} aria-label="Select all" />
              </th>
              <th style={{ width: 60 }} />
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading}
              error={error}
              count={products.length}
              colSpan={6}
              empty={query ? 'No products match.' : 'No products yet.'}
            />
            {!loading && !error && products.map((p) => (
              <tr key={p.id} className="clickable" onClick={rowClick(() => navigate(`/admin/products/${p.id}`))} style={{ opacity: p.active ? 1 : .6 }}>
                <td>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ width: 'auto' }} aria-label={`Select ${p.name}`} />
                </td>
                <td>
                  {p.images[0] ? (
                    <img src={p.images[0].url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                  ) : (
                    <div style={{ width: 44, height: 44, background: 'var(--bg-alt)', borderRadius: 4 }} />
                  )}
                </td>
                <td>
                  <Link to={`/admin/products/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                  <div className="muted" style={{ fontSize: '.78rem' }}>{p.slug}</div>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.priceCents)}</td>
                <td>
                  {p.madeToOrder ? <span className="muted">made to order</span>
                    : p.backorder ? <span style={{ color: '#b45309', fontWeight: 600 }}>backorder</span>
                    : p.stock}
                </td>
                <td>
                  {p.active
                    ? <span className="badge paid">Live</span>
                    : <span className="badge">Hidden</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Shared stock: one pile sold through several listings (the T-Mailer packs).
// The count here is what is on the shelf; each listing takes its own number
// of units per item (set on the product).
// ---------------------------------------------------------------------------
interface StockPool {
  id: string; key: string; name: string; units: number; updatedAt: string;
  /** The boxes the pile ships in and how many units each holds. */
  boxes?: { packageId: string; maxUnits: number }[] | null;
  products: { id: string; slug: string; name: string; unitsPerItem: number; active: boolean }[];
}

interface BoxOption { id: string; name: string; lengthIn: number; widthIn: number; heightIn: number }

/**
 * Which boxes a pile ships in and how many units each takes (mailers: 50 to
 * the small box, 135 to the big one). An order's packs are counted together
 * and quoted in the fewest boxes.
 */
function PoolBoxesEditor({ pool, packages, onSaved }: { pool: StockPool; packages: BoxOption[]; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [rows, setRows] = useState<{ packageId: string; maxUnits: string }[]>(() => (pool.boxes ?? []).map((b) => ({ packageId: b.packageId, maxUnits: String(b.maxUnits) })));
  const [saving, setSaving] = useState(false);
  const saved = JSON.stringify((pool.boxes ?? []).map((b) => ({ packageId: b.packageId, maxUnits: String(b.maxUnits) })));
  const dirty = JSON.stringify(rows) !== saved;

  const save = async () => {
    const boxes = rows.filter((r) => r.packageId).map((r) => ({ packageId: r.packageId, maxUnits: Math.floor(Number(r.maxUnits)) }));
    if (boxes.some((b) => !Number.isFinite(b.maxUnits) || b.maxUnits < 1)) { toast.error('Give each box a whole number of units it holds.'); return; }
    setSaving(true);
    try {
      await api.put(`/admin/stock-pools/${pool.id}`, { boxes });
      toast.success(boxes.length ? `${pool.name} ships in ${boxes.length} box size${boxes.length === 1 ? '' : 's'}.` : `${pool.name}: no box rule — each listing uses its own box.`);
      await onSaved();
    } catch (e) { toast.error(errorMessage(e, 'Could not save the boxes')); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: '.5rem', fontSize: '.85rem' }}>
      <div className="muted" style={{ marginBottom: '.25rem' }}>Ships in — the boxes this pile goes in and how many units each holds; an order's packs are counted together and quoted in the fewest boxes.</div>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: '.4rem', alignItems: 'center', marginBottom: '.3rem' }}>
          <select value={r.packageId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, packageId: e.target.value } : x)))} style={{ margin: 0, maxWidth: 320 }}>
            <option value="">— pick a box —</option>
            {packages.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.lengthIn} × {b.widthIn} × {b.heightIn} in)</option>)}
          </select>
          <span className="muted">holds up to</span>
          <input type="number" min={1} value={r.maxUnits} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, maxUnits: e.target.value } : x)))} style={{ width: 90, margin: 0 }} />
          <span className="muted">units</span>
          <button type="button" className="btn secondary sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="row" style={{ gap: '.4rem' }}>
        <button type="button" className="btn secondary sm" onClick={() => setRows([...rows, { packageId: '', maxUnits: '' }])}>+ Box</button>
        {dirty && <button type="button" className="btn sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save boxes'}</button>}
      </div>
    </div>
  );
}

function SharedStockCard() {
  const toast = useToast();
  const [pools, setPools] = useState<StockPool[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPool, setNewPool] = useState({ name: '', key: '', units: '' });
  const [packages, setPackages] = useState<BoxOption[]>([]);

  const load = () => api.get<{ pools: StockPool[] }>('/admin/stock-pools').then((r) => { setPools(r.pools); setDrafts({}); }).catch(() => setPools([]));
  useEffect(() => { void load(); }, []);
  useEffect(() => { api.get<{ items: BoxOption[] }>('/admin/fulfillment/packages').then((r) => setPackages(r.items)).catch(() => setPackages([])); }, []);

  const save = async (pool: StockPool) => {
    const units = Number(drafts[pool.id]);
    if (!Number.isInteger(units) || units < 0) { toast.error('Enter a whole number of units.'); return; }
    setSaving(pool.id);
    try {
      await api.put(`/admin/stock-pools/${pool.id}`, { units });
      toast.success(`${pool.name}: ${units} units on the shelf.`);
      await load();
    } catch (e) { toast.error(errorMessage(e, 'Could not save')); }
    finally { setSaving(null); }
  };

  const create = async () => {
    const units = Number(newPool.units || 0);
    const key = (newPool.key || newPool.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!newPool.name.trim() || !key) { toast.error('Give the pool a name.'); return; }
    setSaving('new');
    try {
      await api.post('/admin/stock-pools', { key, name: newPool.name.trim(), units: Number.isInteger(units) && units >= 0 ? units : 0 });
      setNewPool({ name: '', key: '', units: '' }); setAdding(false);
      await load();
    } catch (e) { toast.error(errorMessage(e, 'Could not create the pool')); }
    finally { setSaving(null); }
  };

  if (!pools || (pools.length === 0 && !adding)) {
    return pools && pools.length === 0 ? (
      <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>
        Listings that sell from one pile can share a stock count — <button type="button" className="btn secondary sm" onClick={() => setAdding(true)}>set one up</button>, then pick it on each product.
      </p>
    ) : null;
  }

  return (
    <div className="admin-card">
      <div className="spread" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Shared stock</h3>
          <div className="muted" style={{ fontSize: '.85rem' }}>One pile, several listings. Paid orders take their units off automatically; type the count after a delivery or a recount.</div>
        </div>
        <button type="button" className="btn secondary sm" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ New pool'}</button>
      </div>
      {adding && (
        <div className="row" style={{ gap: '.5rem', marginTop: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><label>Name</label><input value={newPool.name} onChange={(e) => setNewPool({ ...newPool, name: e.target.value })} placeholder="e.g. Comic Armor sleeves" style={{ margin: 0 }} /></div>
          <div><label>Units on the shelf</label><input type="number" min={0} value={newPool.units} onChange={(e) => setNewPool({ ...newPool, units: e.target.value })} style={{ margin: 0, width: 140 }} /></div>
          <button type="button" className="btn sm" onClick={create} disabled={saving === 'new'}>Create</button>
        </div>
      )}
      {pools.map((pool) => {
        const draft = drafts[pool.id] ?? String(pool.units);
        const dirty = draft !== String(pool.units);
        return (
          <div key={pool.id} style={{ borderTop: '1px solid var(--border)', padding: '.75rem 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1rem', alignItems: 'start' }}>
            <div>
              <strong>{pool.name}</strong>
              <div className="muted" style={{ fontSize: '.85rem', marginTop: '.2rem' }}>
                {pool.products.length === 0 ? 'No listings use this pool yet — pick it on a product.' : pool.products.map((p) => (
                  <span key={p.id} style={{ display: 'inline-block', marginRight: '.75rem' }}>
                    <Link to={`/admin/products/${p.id}`}>{p.name}</Link> · {p.unitsPerItem} each{p.active ? '' : ' (inactive)'} · {Math.floor(pool.units / Math.max(1, p.unitsPerItem))} available
                  </span>
                ))}
              </div>
              <PoolBoxesEditor key={`${pool.id}:${pool.updatedAt}`} pool={pool} packages={packages} onSaved={load} />
            </div>
            <div className="row" style={{ gap: '.4rem', alignItems: 'center' }}>
              <input type="number" min={0} value={draft} onChange={(e) => setDrafts({ ...drafts, [pool.id]: e.target.value })} style={{ width: 120, margin: 0 }} />
              <span className="muted" style={{ fontSize: '.85rem' }}>units</span>
              <button type="button" className="btn sm" disabled={!dirty || saving === pool.id} onClick={() => save(pool)}>{saving === pool.id ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
