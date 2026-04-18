import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../../api/client';

interface Package {
  id: string;
  name: string;
  description?: string | null;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  emptyWeightOz: number;
  maxWeightOz?: number | null;
  costCents: number;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
}

interface Carrier {
  name: string;
  code: string;
  primary: boolean;
}

type Tab = 'packages' | 'carriers' | 'tools';

export function AdminFulfillment() {
  const [tab, setTab] = useState<Tab>('packages');

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Fulfillment</h1>
      </div>
      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          {(['packages', 'carriers', 'tools'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '.85rem 1rem', background: 'transparent', border: 'none',
                borderBottom: tab === t ? '3px solid var(--brand)' : '3px solid transparent',
                color: tab === t ? 'var(--brand)' : 'var(--ink)',
                fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === 'packages' && <PackagesTab />}
      {tab === 'carriers' && <CarriersTab />}
      {tab === 'tools' && <ToolsTab />}
    </div>
  );
}

const blankPackage = {
  name: '', description: '',
  lengthIn: 9, widthIn: 6, heightIn: 1,
  emptyWeightOz: 0.5, maxWeightOz: undefined as number | undefined,
  costCents: 0, isDefault: false, active: true, sortOrder: 0,
};

function PackagesTab() {
  const [items, setItems] = useState<Package[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<typeof blankPackage>(blankPackage);
  const [saving, setSaving] = useState(false);

  const load = () => api.get<{ items: Package[] }>('/admin/fulfillment/packages').then((r) => setItems(r.items));
  useEffect(() => { void load(); }, []);

  function startEdit(p: Package) {
    setEditing(p.id);
    setDraft({
      name: p.name,
      description: p.description ?? '',
      lengthIn: p.lengthIn,
      widthIn: p.widthIn,
      heightIn: p.heightIn,
      emptyWeightOz: p.emptyWeightOz,
      maxWeightOz: p.maxWeightOz ?? undefined,
      costCents: p.costCents,
      isDefault: p.isDefault,
      active: p.active,
      sortOrder: p.sortOrder,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...draft,
        description: draft.description || undefined,
        maxWeightOz: draft.maxWeightOz || undefined,
      };
      if (editing === 'new') await api.post('/admin/fulfillment/packages', payload);
      else if (editing) await api.put(`/admin/fulfillment/packages/${editing}`, payload);
      setEditing(null);
      setDraft(blankPackage);
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete package?')) return;
    await api.del(`/admin/fulfillment/packages/${id}`);
    await load();
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          Define the box / mailer sizes you ship in. ShipStation uses these to quote rates.
        </p>
        {editing === null && (
          <button className="btn" onClick={() => { setEditing('new'); setDraft(blankPackage); }}>
            Add package
          </button>
        )}
      </div>

      {editing !== null && (
        <form onSubmit={save} className="admin-card">
          <h3 style={{ marginTop: 0 }}>{editing === 'new' ? 'New package' : 'Edit package'}</h3>
          <label>Name</label>
          <input value={draft.name} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <label>Description (optional)</label>
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

          <label style={{ marginTop: '1rem', fontWeight: 600 }}>Inner dimensions (inches)</label>
          <div className="grid-2">
            <div><label>Length</label><input type="number" step="0.125" value={draft.lengthIn} required onChange={(e) => setDraft({ ...draft, lengthIn: Number(e.target.value) })} /></div>
            <div><label>Width</label><input type="number" step="0.125" value={draft.widthIn} required onChange={(e) => setDraft({ ...draft, widthIn: Number(e.target.value) })} /></div>
          </div>
          <label>Height</label>
          <input type="number" step="0.125" value={draft.heightIn} required onChange={(e) => setDraft({ ...draft, heightIn: Number(e.target.value) })} />

          <label style={{ marginTop: '1rem', fontWeight: 600 }}>Weight</label>
          <div className="grid-2">
            <div><label>Empty package weight (oz)</label><input type="number" step="0.1" value={draft.emptyWeightOz} onChange={(e) => setDraft({ ...draft, emptyWeightOz: Number(e.target.value) })} /></div>
            <div><label>Max packed weight (oz, optional)</label><input type="number" step="0.1" value={draft.maxWeightOz ?? ''} onChange={(e) => setDraft({ ...draft, maxWeightOz: e.target.value ? Number(e.target.value) : undefined })} /></div>
          </div>

          <div className="grid-2" style={{ marginTop: '.5rem' }}>
            <div><label>Cost per package (cents)</label><input type="number" value={draft.costCents} onChange={(e) => setDraft({ ...draft, costCents: Number(e.target.value) })} /></div>
            <div><label>Sort order</label><input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></div>
          </div>

          <div className="row" style={{ marginTop: '.75rem', gap: '1rem' }}>
            <label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} style={{ width: 'auto', marginRight: '.35rem' }} /> Active</label>
            <label><input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} style={{ width: 'auto', marginRight: '.35rem' }} /> Default package</label>
          </div>

          <div className="row" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save package'}</button>
          </div>
        </form>
      )}

      <div className="admin-card">
        {items.length === 0 ? (
          <p className="muted">No packages yet — add your first box / mailer.</p>
        ) : (
          <table className="admin-table">
            <thead><tr>
              <th>Name</th><th>Dimensions</th><th>Weight</th><th>Cost</th><th>Default</th><th>Active</th><th />
            </tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description && <div className="muted" style={{ fontSize: '.8rem' }}>{p.description}</div>}
                  </td>
                  <td>{p.lengthIn}″ × {p.widthIn}″ × {p.heightIn}″</td>
                  <td>
                    {p.emptyWeightOz} oz empty
                    {p.maxWeightOz && <div className="muted" style={{ fontSize: '.8rem' }}>max {p.maxWeightOz} oz</div>}
                  </td>
                  <td>{formatMoney(p.costCents)}</td>
                  <td>{p.isDefault ? '✓' : ''}</td>
                  <td>{p.active ? 'Yes' : 'No'}</td>
                  <td>
                    <button className="btn secondary" onClick={() => startEdit(p)}>Edit</button>
                    <button className="btn secondary" style={{ color: '#b91c1c' }} onClick={() => void remove(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CarriersTab() {
  const [carriers, setCarriers] = useState<Carrier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ carriers: Carrier[] }>('/admin/fulfillment/shipstation/carriers')
      .then((r) => setCarriers(r.carriers))
      .catch((e) => setError(e.message ?? 'Failed to load carriers'));
  }, []);

  return (
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>Active carriers in ShipStation</h3>
      {error && <div className="error">{error}</div>}
      {!carriers && !error && <p className="muted">Loading…</p>}
      {carriers && carriers.length === 0 && (
        <p className="muted">No carriers connected in ShipStation. Add them in your ShipStation account → Account Settings → Selling Channels → Carriers.</p>
      )}
      {carriers && carriers.length > 0 && (
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Code</th><th>Primary</th></tr></thead>
          <tbody>
            {carriers.map((c) => (
              <tr key={c.code}>
                <td>{c.name}</td>
                <td><code>{c.code}</code></td>
                <td>{c.primary ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ToolsTab() {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setTestResult(null);
    try {
      const r = await api.get<{ ok: boolean; carriers: number }>('/admin/fulfillment/shipstation/test');
      setTestResult(`✅ Connected. ${r.carriers} carriers active.`);
    } catch (e: any) {
      setTestResult(`❌ ${e.message ?? 'Connection failed'}`);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Test ShipStation connection</h3>
        <p className="muted" style={{ fontSize: '.9rem' }}>Pings the ShipStation API with the credentials in <a href="/admin/settings">Admin → Settings → Shipping</a>.</p>
        <button className="btn" disabled={busy} onClick={() => void test()}>
          {busy ? 'Testing…' : 'Run test'}
        </button>
        {testResult && (
          <div style={{ marginTop: '.75rem', fontWeight: 500 }}>{testResult}</div>
        )}
      </div>

      <div className="admin-card">
        <h3 style={{ marginTop: 0 }}>Webhook URL</h3>
        <p className="muted" style={{ fontSize: '.9rem', marginBottom: '.5rem' }}>
          Paste this into ShipStation → Account Settings → Selling Channels → Webhooks → SHIP_NOTIFY:
        </p>
        <code style={{ display: 'block', padding: '.6rem', background: 'var(--bg-alt)', borderRadius: 4, wordBreak: 'break-all' }}>
          https://printingcomics.com/api/webhooks/shipstation
        </code>
        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
          When a shipment is marked shipped in ShipStation, the order in this app auto-updates with the
          tracking number + carrier and the customer gets a shipping notification email.
        </p>
      </div>
    </div>
  );
}
