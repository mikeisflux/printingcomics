/**
 * /admin/api-keys — manage API keys for developer integrations.
 *
 * Creating a key shows the full secret exactly once in a one-time reveal
 * panel; after that only the prefix is ever returned, so we have to make
 * sure the operator copies it before leaving the page.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  notes: string | null;
  orderCount: number;
  createdBy: { email: string; firstName: string | null; lastName: string | null } | null;
  partner: { id: string; slug: string; name: string } | null;
}

interface ListResponse {
  availableScopes: string[];
  keys: ApiKeyRow[];
}

interface CreatedSecret {
  secret: string;
  apiKey: { id: string; name: string; prefix: string; scopes: string[] };
}

export function AdminApiKeys() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedSecret | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<ListResponse>('/admin/api-keys')
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '.25rem' }}>API Keys</h1>
          <p className="muted" style={{ margin: 0 }}>
            Mint and revoke keys for crowdfunding platforms and other integrators that submit
            print orders via the public <code>/api/v1</code> endpoints.{' '}
            <Link to="/admin/partners">Manage partners →</Link>{' · '}
            <a href="/developers" target="_blank" rel="noreferrer">
              Public docs →
            </a>
          </p>
        </div>
        <button className="btn" onClick={() => setCreating(true)}>
          New API key
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {justCreated && (
        <SecretReveal created={justCreated} onDismiss={() => setJustCreated(null)} />
      )}

      {creating && data && (
        <CreateKeyForm
          availableScopes={data.availableScopes}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setJustCreated(c);
            setCreating(false);
            void load();
          }}
        />
      )}

      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Partner</th>
              <th>Prefix</th>
              <th>Scopes</th>
              <th>Orders</th>
              <th>Last used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.keys.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink-muted)' }}>
                  No API keys yet. Click <strong>New API key</strong> to mint one.
                </td>
              </tr>
            )}
            {data?.keys.map((k) => (
              <KeyRow key={k.id} row={k} availableScopes={data.availableScopes} onChanged={load} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KeyRow({
  row,
  availableScopes,
  onChanged,
}: {
  row: ApiKeyRow;
  availableScopes: string[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600 }}>{row.name}</div>
          {row.notes && (
            <div style={{ fontSize: '.8rem', color: 'var(--ink-muted)' }}>{row.notes}</div>
          )}
        </td>
        <td style={{ fontSize: '.85rem' }}>
          {row.partner ? (
            <Link to={`/admin/partners/${row.partner.id}`}>{row.partner.name}</Link>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td>
          <code>{row.prefix}…</code>
        </td>
        <td style={{ fontSize: '.8rem' }}>
          {row.scopes.map((s) => (
            <span
              key={s}
              style={{
                display: 'inline-block',
                background: 'var(--bg-alt)',
                padding: '.1rem .4rem',
                borderRadius: 3,
                marginRight: 4,
                marginBottom: 2,
              }}
            >
              {s}
            </span>
          ))}
        </td>
        <td>{row.orderCount}</td>
        <td style={{ fontSize: '.85rem', color: 'var(--ink-muted)' }}>
          {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : 'Never'}
        </td>
        <td>
          {row.active ? (
            <span className="badge paid">Active</span>
          ) : (
            <span className="badge cancelled">Revoked</span>
          )}
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button className="btn secondary" style={{ padding: '.3rem .6rem', fontSize: '.85rem', marginRight: 6 }} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close' : 'Edit'}
          </button>
          {row.active ? (
            <button
              className="btn secondary"
              style={{ padding: '.3rem .6rem', fontSize: '.85rem', color: '#b91c1c', borderColor: '#b91c1c' }}
              onClick={async () => {
                if (!confirm(`Revoke "${row.name}"? Any integration using this key will start failing immediately.`)) return;
                await api.post(`/admin/api-keys/${row.id}/revoke`);
                onChanged();
              }}
            >
              Revoke
            </button>
          ) : (
            <button
              className="btn secondary"
              style={{ padding: '.3rem .6rem', fontSize: '.85rem' }}
              onClick={async () => {
                await api.post(`/admin/api-keys/${row.id}/restore`);
                onChanged();
              }}
            >
              Restore
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--bg-alt)' }}>
            <EditKeyForm row={row} availableScopes={availableScopes} onSaved={() => { setEditing(false); onChanged(); }} />
          </td>
        </tr>
      )}
    </>
  );
}

function CreateKeyForm({
  availableScopes,
  onClose,
  onCreated,
}: {
  availableScopes: string[];
  onClose: () => void;
  onCreated: (c: CreatedSecret) => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [scopes, setScopes] = useState<string[]>([...availableScopes]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>Create a new API key</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            const r = await api.post<CreatedSecret>('/admin/api-keys', { name, scopes, notes: notes || undefined });
            onCreated(r);
          } catch (err: any) {
            setError(err.message);
            setSubmitting(false);
          }
        }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>
            Integration name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kickstarter integration"
            style={{ width: '100%', padding: '.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>
            Scopes
          </label>
          <ScopeChecklist availableScopes={availableScopes} value={scopes} onChange={setScopes} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Contact: dev@example.com"
            style={{ width: '100%', padding: '.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button type="submit" className="btn" disabled={submitting || !name.trim() || scopes.length === 0}>
            {submitting ? 'Creating…' : 'Create key'}
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EditKeyForm({
  row,
  availableScopes,
  onSaved,
}: {
  row: ApiKeyRow;
  availableScopes: string[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [scopes, setScopes] = useState<string[]>(row.scopes);
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api.patch(`/admin/api-keys/${row.id}`, {
            name,
            scopes,
            notes: notes.trim() ? notes : null,
          });
          onSaved();
        } finally {
          setSaving(false);
        }
      }}
      style={{ padding: '1rem' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '.75rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: '.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          style={{ padding: '.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
        />
      </div>
      <div style={{ marginBottom: '.75rem' }}>
        <ScopeChecklist availableScopes={availableScopes} value={scopes} onChange={setScopes} />
      </div>
      <button type="submit" className="btn" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function ScopeChecklist({
  availableScopes,
  value,
  onChange,
}: {
  availableScopes: string[];
  value: string[];
  onChange: (s: string[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
      {availableScopes.map((s) => {
        const on = value.includes(s);
        return (
          <label
            key={s}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.4rem',
              padding: '.35rem .65rem',
              borderRadius: 4,
              background: on ? 'rgba(30,116,252,.1)' : 'var(--bg-alt)',
              border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
              cursor: 'pointer',
              fontSize: '.85rem',
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s));
              }}
            />
            <code>{s}</code>
          </label>
        );
      })}
    </div>
  );
}

function SecretReveal({ created, onDismiss }: { created: CreatedSecret; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="admin-card"
      style={{
        background: '#fff8db',
        border: '1px solid #d97706',
        marginBottom: '1.5rem',
      }}
    >
      <h3 style={{ marginTop: 0, color: '#7a5800' }}>API key created — copy it now</h3>
      <p style={{ margin: '0 0 .75rem' }}>
        This is the only time the full secret will be displayed. Store it somewhere safe and
        share it with the integrator over a secure channel.
      </p>
      <div
        style={{
          display: 'flex',
          gap: '.5rem',
          background: '#0f1419',
          color: '#e2e8f0',
          padding: '.75rem',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: '.95rem',
          alignItems: 'center',
        }}
      >
        <code style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{created.secret}</code>
        <button
          className="btn"
          style={{ padding: '.3rem .7rem', fontSize: '.85rem' }}
          onClick={() => {
            void navigator.clipboard.writeText(created.secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p style={{ margin: '.75rem 0 0', fontSize: '.85rem', color: '#7a5800' }}>
        Key: <strong>{created.apiKey.name}</strong> · Prefix:{' '}
        <code>{created.apiKey.prefix}</code> · Scopes: {created.apiKey.scopes.join(', ')}
      </p>
      <button className="btn secondary" style={{ marginTop: '.75rem' }} onClick={onDismiss}>
        I've copied the key
      </button>
    </div>
  );
}
