/**
 * /retailer/integrations — plug the shop's point of sale into Distribution:
 * the files its POS imports (invoice / shipping manifest / catalog in the
 * layout the tool expects), an integration key with feed URLs for tools and
 * scripts that fetch, and a webhook that hears about orders and shipments.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plug, Copy, Download, KeyRound, Webhook, Send, Trash2, CheckCircle2, XCircle, RefreshCw, Link2 } from 'lucide-react';
import { api } from '../../api/client';
import { withViewAs } from '../../lib/view-as';
import { dateTime } from '../../lib/pod';
import { Empty, Pill, errText, useFlash, useLoad } from '../../components/pod/ui';

interface View {
  posSystem: string | null; posSystems: string[];
  key: { prefix: string; createdAt: string } | null;
  webhook: { url: string | null; hasSecret: boolean };
  formats: { key: string; label: string }[];
  apiBase: string;
  feeds: { shipments: string; invoice: string; catalog: string };
  cycles: { id: string; name: string; slug: string; status: string }[];
  deliveries: { id: string; event: string; orderId: string | null; statusCode: number | null; succeeded: boolean; error: string | null; createdAt: string }[];
}

export const POS_LABELS: Record<string, string> = {
  manage_comics: 'Manage Comics (with Lightspeed, Shopify POS or RMH)', comichub: 'ComicHub', comic_shop_assistant: 'Comic Shop Assistant', shopify_pos: 'Shopify POS (on its own)', lightspeed: 'Lightspeed Retail (on its own)', rmh: 'Retail Management Hero / other register', other: 'Something else / a custom system',
};

/** Which file layout each system imports, and the words its import screen uses. */
const GUIDES: Record<string, { format: string; steps: string[]; note?: string; live?: boolean }> = {
  manage_comics: { format: 'diamond', live: true, steps: ['Download the invoice (or the shipments file for a whole week) in the Diamond layout.', 'In Manage Comics open Invoices → Import and pick the Diamond CSV option.', 'Upload the file: pull lists, subscriptions and allocations fill in from the quantities.', 'Before a catalog opens, import the catalog file the same way so pre-orders can be taken against our titles.'], note: 'Our catalog ids (SERIESCODE-last five of the UPC) sit in the Item Code column, so series match across months.' },
  comichub: { format: 'diamond', steps: ['Download the invoice or the shipments file in the Diamond layout.', 'In ComicHub go to the distributor invoice import and choose the Diamond file type.', 'Upload; the UPC / ISBN columns match titles already in your system, new ones are created from the description and price.'] },
  comic_shop_assistant: { format: 'generic', steps: ['Download the invoice in the all-columns layout (every field has a plain header).', 'In Comic Shop Assistant upload the invoice and map the columns once: Item Code, UPC, Title, Quantity, MSRP, Unit Cost.', 'Save the mapping as a template; later files load with one click.'], note: 'The Diamond layout works too if you would rather reuse your Diamond template.' },
  shopify_pos: { format: 'shopify', live: true, steps: ['Connect the store below: shipped copies are received into Shopify inventory on their own, with the UPC as barcode and your wholesale price as cost. The files are the fallback.', 'Download the invoice in the Shopify layout: one product per title, barcode = UPC, cost per item = your wholesale price, inventory = copies shipped.', 'In Shopify admin go to Products → Import and upload the file (tick "overwrite products with matching handles" to update).', 'Before a catalog opens, import the catalog file to create the products with zero stock for pre-orders.'] },
  lightspeed: { format: 'lightspeed', live: true, steps: ['Connect the store below (X-Series with a personal token, R-Series with the Connect button): shipped copies land in your inventory on their own.', 'Download the invoice in the Lightspeed layout.', 'In Lightspeed Retail go to Inventory → Import Items and upload; match UPC and Custom SKU to your existing items.', 'Quantities land as the on-hand count for the shipment.'] },
  rmh: { format: 'rmh', steps: ['Download the invoice in the Retail Management Hero item layout for the Import Utility (map the columns once and save the mapping), or the purchase-order receive layout (Code, Qty Rcv, Cost) to receive against a PO you raised.', 'The same file is attached to the shipped email, so the week\'s books can be received without opening the portal.'] },
  other: { format: 'generic', steps: ['Use the JSON API or the CSV feeds below; every file is also available by URL with your integration key.', 'Point a webhook at your system to hear about orders, invoices and shipments without polling.'] },
};

export function RetailerIntegrations() {
  const { data, reload } = useLoad<View>('/pod/retailer/integration');
  const { show, node } = useFlash();
  const [params] = useSearchParams();
  const posMsg = params.get('msg');
  const posResult = params.get('pos');
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [format, setFormat] = useState('');
  const pos = data?.posSystem ?? '';
  const guide = GUIDES[pos] ?? GUIDES.other!;
  const fmt = format || guide.format;
  const copy = async (text: string, what: string) => { await navigator.clipboard?.writeText(text).catch(() => undefined); show(`${what} copied`); };
  const patch = async (body: Record<string, unknown>, ok: string) => { setBusy('patch'); try { await api.patch('/pod/retailer/integration', body); show(ok); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const mint = async () => {
    if (data?.key && !confirm('Make a new key? The current key stops working the moment the new one is issued.')) return;
    setBusy('key');
    try { const r = await api.post<{ key: string }>('/pod/retailer/integration/key'); setNewKey(r.key); show('New key issued — copy it now'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); }
  };
  const revoke = async () => { if (!confirm('Revoke the key? Anything using it stops working.')) return; setBusy('key'); try { await api.del('/pod/retailer/integration/key'); setNewKey(null); show('Key revoked'); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const test = async () => { setBusy('test'); try { const r = await api.post<{ succeeded: boolean; statusCode: number | null; error: string | null }>('/pod/retailer/integration/webhook-test'); show(r.succeeded ? `Your endpoint answered ${r.statusCode}` : `Delivery failed: ${r.error ?? r.statusCode}`, !r.succeeded); await reload(); } catch (e) { show(errText(e), true); } finally { setBusy(null); } };
  const keyed = (template: string) => template.replace('YOUR_KEY', newKey ?? (data?.key ? `${data.key.prefix}…` : 'YOUR_KEY'));
  const dl = (path: string) => withViewAs(`/api${path}`, 'retailer');
  const selectedCycle = cycleId || data?.cycles[0]?.id || '';
  return (
    <>
      {node}
      <div className="ptop"><div><div className="eyebrow">POS &amp; integrations</div><h1>Plug in your point of sale</h1><div className="sub">Invoices, shipping manifests and catalogs in the file layout your system imports, a key for anything that fetches, and a webhook for anything that listens. <Link to="/distribution/pos">Read the full guide</Link>.</div></div></div>
      {posResult && posMsg && <div className={`notice ${posResult === 'connected' ? 'info' : 'bad'}`} style={{ marginBottom: '1rem' }}>{posMsg}</div>}
      {!data ? <p className="dim">Loading…</p> : (
        <div className="split wide-left">
          <div className="stack">
            <LiveConnection pos={pos} show={show} />
            <div className="panel accent">
              <h3><Plug size={18} style={{ verticalAlign: '-3px' }} /> Which system does your shop run?</h3>
              <div className="row" style={{ marginTop: '.6rem', flexWrap: 'wrap' }}>
                <select className="inp" style={{ width: 'auto', maxWidth: '100%' }} value={pos} disabled={busy === 'patch'} onChange={(e) => void patch({ posSystem: e.target.value || null }, 'Saved')}>
                  <option value="">— pick your POS —</option>
                  {data.posSystems.map((k) => <option key={k} value={k}>{POS_LABELS[k] ?? k}</option>)}
                </select>
              </div>
              {pos && (
                <ol style={{ margin: '.9rem 0 0', paddingLeft: '1.2rem', display: 'grid', gap: '.35rem', fontSize: '.92rem' }}>
                  {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
              {guide.note && pos && <p className="dim" style={{ fontSize: '.84rem', marginTop: '.6rem' }}>{guide.note}</p>}
            </div>

            <div className="panel">
              <h3><Download size={18} style={{ verticalAlign: '-3px' }} /> Files for your POS</h3>
              <p className="dim" style={{ fontSize: '.88rem', margin: '.3rem 0 .75rem' }}>Every file is built from your orders at your wholesale price. The layout follows your POS; change it here if your importer wants another.</p>
              <div className="form-grid">
                <div className="field span-2"><label>Layout</label><select className="inp" value={fmt} onChange={(e) => setFormat(e.target.value)}>{data.formats.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              </div>
              <div className="stack" style={{ marginTop: '.75rem', gap: '.5rem' }}>
                <div className="between" style={{ flexWrap: 'wrap', gap: '.5rem' }}><div><b>Shipments, last 30 days</b><div className="dim" style={{ fontSize: '.8rem' }}>One file, one invoice per order, only the copies that shipped.</div></div><a className="pbtn primary sm" href={dl(`/pod/retailer/exports/shipments.csv?format=${fmt}&since=30d`)}><Download size={14} /> Download</a></div>
                <div className="between" style={{ flexWrap: 'wrap', gap: '.5rem' }}><div><b>Shipments, last 7 days</b><div className="dim" style={{ fontSize: '.8rem' }}>This week's boxes.</div></div><a className="pbtn soft sm" href={dl(`/pod/retailer/exports/shipments.csv?format=${fmt}&since=7d`)}><Download size={14} /> Download</a></div>
                <div className="between" style={{ flexWrap: 'wrap', gap: '.5rem' }}><div><b>Catalog (pre-order file)</b><div className="dim" style={{ fontSize: '.8rem' }}>Every title in a catalog at your price, quantity blank, so your POS can take pre-orders.</div></div><span className="row"><select className="inp" style={{ width: 'auto' }} value={selectedCycle} onChange={(e) => setCycleId(e.target.value)}>{data.cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{selectedCycle && <a className="pbtn soft sm" href={dl(`/pod/retailer/exports/catalog/${selectedCycle}.csv?format=${fmt}`)}><Download size={14} /> Download</a>}</span></div>
                <p className="dim" style={{ fontSize: '.8rem', margin: 0 }}>A single order's invoice is on its page under <Link to="/retailer/orders">My orders</Link>.</p>
              </div>
            </div>

            <div className="panel">
              <h3><Webhook size={18} style={{ verticalAlign: '-3px' }} /> Webhook</h3>
              <p className="dim" style={{ fontSize: '.88rem', margin: '.3rem 0 .75rem' }}>We POST JSON to your URL when an order is placed, updated or canceled, when an invoice is ready, when it is paid, and when boxes ship (with tracking). With a secret, every call carries an HMAC signature in <code>X-PC-Signature</code>.</p>
              <div className="form-grid">
                <div className="field span-2"><label>Endpoint URL (https)</label><input className="inp" placeholder="https://pos.example.com/hooks/printingcomics" value={url ?? data.webhook.url ?? ''} onChange={(e) => setUrl(e.target.value)} /></div>
                <div className="field span-2"><label>Signing secret <span className="dim">optional, at least 16 characters{data.webhook.hasSecret ? ' · one is set' : ''}</span></label><input className="inp mono" placeholder={data.webhook.hasSecret ? '•••••••• (leave blank to keep)' : 'a long random string you also keep on your side'} value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
              </div>
              <div className="row" style={{ marginTop: '.6rem', flexWrap: 'wrap' }}>
                <button className="pbtn primary sm" disabled={busy === 'patch'} onClick={() => void patch({ webhookUrl: (url ?? data.webhook.url ?? '').trim() || null, ...(secret.trim() ? { webhookSecret: secret.trim() } : {}) }, 'Webhook saved').then(() => setSecret(''))}>Save</button>
                {data.webhook.url && <button className="pbtn soft sm" disabled={busy === 'test'} onClick={() => void test()}><Send size={14} /> Send a test ping</button>}
                {data.webhook.url && <button className="pbtn ghost sm" disabled={busy === 'patch'} onClick={() => { if (confirm('Remove the webhook?')) void patch({ webhookUrl: null, webhookSecret: null }, 'Webhook removed').then(() => setUrl('')); }}><Trash2 size={14} /> Remove</button>}
              </div>
              {data.deliveries.length > 0 && (
                <div className="scroll-x" style={{ marginTop: '.75rem' }}>
                  <table className="ptable"><thead><tr><th>When</th><th>Event</th><th>Result</th></tr></thead><tbody>
                    {data.deliveries.map((d) => <tr key={d.id}><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateTime(d.createdAt)}</td><td className="mono">{d.event}</td><td>{d.succeeded ? <span className="row" style={{ gap: '.3rem', color: 'var(--p-green)' }}><CheckCircle2 size={14} /> {d.statusCode}</span> : <span className="row" style={{ gap: '.3rem', color: 'var(--p-magenta)' }}><XCircle size={14} /> {d.error ?? d.statusCode}</span>}</td></tr>)}
                  </tbody></table>
                </div>
              )}
            </div>
          </div>

          <aside className="stack">
            <div className="panel accent">
              <h3><KeyRound size={18} style={{ verticalAlign: '-3px' }} /> Integration key</h3>
              <p className="dim" style={{ fontSize: '.86rem', margin: '.3rem 0 .6rem' }}>Lets a tool or script fetch your files and use the API as your shop. Keep it like a password; anyone holding it can place orders for you.</p>
              {newKey ? (
                <div className="notice info" style={{ display: 'block' }}>
                  <b>Copy it now — it is shown once.</b>
                  <div className="row" style={{ marginTop: '.4rem' }}><code className="mono" style={{ wordBreak: 'break-all', fontSize: '.82rem' }}>{newKey}</code><button className="pbtn soft xs" onClick={() => void copy(newKey, 'Key')}><Copy size={12} /></button></div>
                </div>
              ) : data.key ? (
                <p style={{ margin: '.25rem 0 .5rem' }}><span className="mono">{data.key.prefix}…</span> <Pill tone="teal">active</Pill><div className="dim" style={{ fontSize: '.78rem' }}>issued {dateTime(data.key.createdAt)}</div></p>
              ) : <p className="dim" style={{ fontSize: '.86rem' }}>No key yet.</p>}
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="pbtn primary sm" disabled={busy === 'key'} onClick={() => void mint()}><KeyRound size={14} /> {data.key ? 'Make a new key' : 'Make a key'}</button>
                {data.key && <button className="pbtn ghost sm" disabled={busy === 'key'} onClick={() => void revoke()}><Trash2 size={14} /> Revoke</button>}
              </div>
            </div>

            <div className="panel">
              <h3>Feed URLs</h3>
              <p className="dim" style={{ fontSize: '.84rem', margin: '.3rem 0 .6rem' }}>For tools that fetch a URL on a schedule. Put your key where it says <code>YOUR_KEY</code>; change <code>format=</code> to any layout above.</p>
              {[['Shipments (last 30 days)', data.feeds.shipments], ['One invoice', data.feeds.invoice], ['Catalog', data.feeds.catalog]].map(([label, u]) => (
                <div key={label} style={{ marginBottom: '.6rem' }}><div className="between"><b style={{ fontSize: '.84rem' }}>{label}</b><button className="pbtn ghost xs" onClick={() => void copy(keyed(u!), 'URL')}><Copy size={12} /></button></div><code className="mono dim" style={{ fontSize: '.72rem', wordBreak: 'break-all' }}>{keyed(u!)}</code></div>
              ))}
            </div>

            <div className="panel">
              <h3>API</h3>
              <p className="dim" style={{ fontSize: '.84rem', margin: '.3rem 0 .6rem' }}>JSON at <code className="mono">{data.apiBase}</code> with <code>Authorization: Bearer YOUR_KEY</code>: catalogs, your orders and invoices, shipments, and placing or replacing an order while a catalog is open.</p>
              <Link to="/distribution/pos#api" className="pbtn soft sm">API reference</Link>
            </div>
            {data.deliveries.length === 0 && !data.webhook.url && !data.key && <Empty title="Nothing connected yet" body="Pick your POS above and start with a downloaded invoice; add a key or webhook when you want it automatic." />}
          </aside>
        </div>
      )}
    </>
  );
}


interface PosView {
  connection: { kind: string; mode: string; shop: string; locationId: string | null; locationName: string | null; syncShipments: boolean; syncOrders: boolean; status: string; lastError: string | null; lastSyncAt: string | null; createdAt: string } | null;
  kinds: { key: string; label: string }[];
  oauth: { shopify: boolean; lightspeed_r: boolean };
  syncs: { id: string; kind: string; orderId: string | null; succeeded: boolean; summary: string; createdAt: string }[];
}

/**
 * The live link: Shopify and Lightspeed are pushed to, so a shop that
 * connects never touches a file. Connect by button (our app) where we hold
 * app credentials, or by pasting the store's own token / app.
 */
function LiveConnection({ pos, show }: { pos: string; show: (m: string, bad?: boolean) => void }) {
  const { data, reload, setData } = useLoad<PosView>('/pod/retailer/integration/pos');
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<'shopify' | 'lightspeed_x' | 'lightspeed_r'>(pos === 'shopify_pos' ? 'shopify' : 'lightspeed_x');
  const [f, setF] = useState({ shop: '', token: '', clientId: '', clientSecret: '', way: 'app' as 'app' | 'token' });
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const c = data?.connection ?? null;
  const run = async <T,>(label: string, fn: () => Promise<T>, ok: (r: T) => string) => { setBusy(label); try { const r = await fn(); show(ok(r)); await reload(); return r; } catch (e) { show(errText(e), true); return null; } finally { setBusy(null); } };
  const connect = () => run('connect', () => api.put<PosView>('/pod/retailer/integration/pos', { kind, shop: f.shop, mode: kind === 'shopify' && f.way === 'token' ? 'token' : kind === 'shopify' ? 'client_credentials' : 'token', token: f.token || null, clientId: f.clientId || null, clientSecret: f.clientSecret || null }), () => 'Connected — the store answered').then((v) => { if (v) { setData(v); setF({ shop: '', token: '', clientId: '', clientSecret: '', way: 'app' }); } });
  const oauth = (system: 'shopify' | 'lightspeed_r') => run('oauth', () => api.post<{ url: string }>(`/pod/retailer/integration/pos/oauth/${system}/start`, { shop: f.shop }), () => 'Opening the store to approve…').then((r) => { if (r?.url) window.location.href = r.url; });
  const test = () => run('test', () => api.post<{ ok: boolean; account: string; locations: { id: string; name: string }[]; error?: string; view: PosView }>('/pod/retailer/integration/pos/test'), (r) => (r.ok ? `Connected to ${r.account}` : `Not connected: ${r.error}`)).then((r) => { if (r) { setLocations(r.locations); setData(r.view); } });
  const disconnect = () => { if (confirm('Disconnect the store? Shipments stop syncing; nothing already in the store is removed.')) void run('disconnect', () => api.del<PosView>('/pod/retailer/integration/pos'), () => 'Disconnected').then((v) => v && setData(v)); };
  const patch = (body: Record<string, unknown>) => run('patch', () => api.patch<PosView>('/pod/retailer/integration/pos', body), () => 'Saved').then((v) => v && setData(v));
  if (!data) return null;
  void pos;
  return (
    <div className="panel" style={{ borderColor: c ? 'var(--p-green)' : undefined }}>
      <h3><Link2 size={18} style={{ verticalAlign: '-3px' }} /> Live connection {c ? <Pill tone={c.status === 'connected' ? 'green' : 'red'}>{c.status === 'connected' ? 'connected' : 'needs attention'}</Pill> : <Pill tone="slate">none</Pill>}</h3>
      {c ? (
        <>
          <p className="dim" style={{ fontSize: '.88rem', margin: '.3rem 0 .6rem' }}><b>{data.kinds.find((k) => k.key === c.kind)?.label ?? c.kind}</b> · {c.shop} · stock lands at <b>{c.locationName ?? 'no location picked'}</b>{c.lastSyncAt ? ` · last push ${dateTime(c.lastSyncAt)}` : ''}</p>
          {c.lastError && <div className="notice bad" style={{ marginBottom: '.6rem' }}>{c.lastError}</div>}
          <div className="row" style={{ flexWrap: 'wrap', gap: '.6rem' }}>
            <label className="switch"><input type="checkbox" checked={c.syncShipments} disabled={busy !== null} onChange={(e) => void patch({ syncShipments: e.target.checked })} /> Receive shipped copies into stock</label>
            <label className="switch"><input type="checkbox" checked={c.syncOrders} disabled={busy !== null} onChange={(e) => void patch({ syncOrders: e.target.checked })} /> Create titles when I order them (zero stock, for pre-orders)</label>
          </div>
          {locations.length > 1 && <div className="field" style={{ marginTop: '.6rem' }}><label>Where stock lands</label><select className="inp" value={c.locationId ?? ''} onChange={(e) => void patch({ locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
          <div className="row" style={{ marginTop: '.6rem', flexWrap: 'wrap' }}>
            <button className="pbtn soft sm" disabled={busy !== null} onClick={() => void test()}><RefreshCw size={14} /> Test connection{locations.length ? '' : ' / list locations'}</button>
            <button className="pbtn ghost sm" disabled={busy !== null} onClick={() => disconnect()}><Trash2 size={14} /> Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="dim" style={{ fontSize: '.88rem', margin: '.3rem 0 .6rem' }}>Connect Lightspeed (or Shopify) and every shipment is received into your inventory on its own: product created if new (SKU = our catalog id, barcode = UPC, cost = your wholesale price), copies added when the box ships.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select className="inp" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{data.kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
          </div>
          {kind === 'shopify' && (
            <div style={{ marginTop: '.6rem' }}>
              <div className="field"><label>Store address</label><input className="inp" placeholder="my-shop.myshopify.com" value={f.shop} onChange={(e) => setF((x) => ({ ...x, shop: e.target.value }))} /></div>
              {data.oauth.shopify && <div className="row" style={{ marginTop: '.6rem' }}><button className="pbtn primary sm" disabled={busy !== null || !f.shop.trim()} onClick={() => void oauth('shopify')}><Link2 size={14} /> Connect with Shopify</button><span className="dim" style={{ fontSize: '.8rem' }}>Approve our app in your Shopify admin; nothing to paste.</span></div>}
              <div className="seg" style={{ marginTop: '.75rem' }}><button className={f.way === 'app' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, way: 'app' }))}>{data.oauth.shopify ? 'Or: an app you made' : 'An app you made'}</button><button className={f.way === 'token' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, way: 'token' }))}>Legacy access token</button></div>
              {f.way === 'app' ? (
                <>
                  <p className="dim" style={{ fontSize: '.8rem', margin: '.5rem 0' }}>In your Shopify Dev Dashboard create an app with scopes <code>write_products</code>, <code>write_inventory</code>, <code>read_locations</code>, install it on your store, then paste its client id and secret. We fetch 24-hour tokens from them as needed.</p>
                  <div className="form-grid"><div className="field"><label>Client id</label><input className="inp mono" value={f.clientId} onChange={(e) => setF((x) => ({ ...x, clientId: e.target.value }))} /></div><div className="field"><label>Client secret</label><input className="inp mono" type="password" value={f.clientSecret} onChange={(e) => setF((x) => ({ ...x, clientSecret: e.target.value }))} /></div></div>
                </>
              ) : (
                <>
                  <p className="dim" style={{ fontSize: '.8rem', margin: '.5rem 0' }}>For a custom app made in the Shopify admin before 2026: Settings → Apps → Develop apps → your app → Admin API access token (starts with <code>shpat_</code>).</p>
                  <div className="field"><label>Admin API access token</label><input className="inp mono" type="password" value={f.token} onChange={(e) => setF((x) => ({ ...x, token: e.target.value }))} /></div>
                </>
              )}
              <button className="pbtn primary sm" style={{ marginTop: '.6rem' }} disabled={busy !== null || !f.shop.trim() || (f.way === 'token' ? !f.token.trim() : !f.clientId.trim() || !f.clientSecret.trim())} onClick={() => void connect()}>Connect</button>
            </div>
          )}
          {kind === 'lightspeed_x' && (
            <div style={{ marginTop: '.6rem' }}>
              <p className="dim" style={{ fontSize: '.8rem', margin: '.3rem 0 .5rem' }}>In Lightspeed Retail (X-Series) go to Setup → Personal tokens (an admin, on the Plus plan) and make a token. Received copies go in as a supplier stock order marked received, with your cost.</p>
              <div className="form-grid"><div className="field"><label>Store address</label><input className="inp" placeholder="my-shop.retail.lightspeed.app" value={f.shop} onChange={(e) => setF((x) => ({ ...x, shop: e.target.value }))} /></div><div className="field"><label>Personal token</label><input className="inp mono" type="password" value={f.token} onChange={(e) => setF((x) => ({ ...x, token: e.target.value }))} /></div></div>
              <button className="pbtn primary sm" style={{ marginTop: '.6rem' }} disabled={busy !== null || !f.shop.trim() || !f.token.trim()} onClick={() => void connect()}>Connect</button>
            </div>
          )}
          {kind === 'lightspeed_r' && (
            <div style={{ marginTop: '.6rem' }}>
              {data.oauth.lightspeed_r ? <><p className="dim" style={{ fontSize: '.8rem', margin: '.3rem 0 .5rem' }}>Lightspeed R-Series only connects through an approved app: click, sign in to Lightspeed, allow inventory access.</p><button className="pbtn primary sm" disabled={busy !== null} onClick={() => void oauth('lightspeed_r')}><Link2 size={14} /> Connect with Lightspeed</button></> : <p className="dim" style={{ fontSize: '.84rem' }}>R-Series connects through an app we register with Lightspeed; it is not switched on yet. Use the Lightspeed item-import file meanwhile, or write to us.</p>}
            </div>
          )}
        </>
      )}
      {data.syncs.length > 0 && (
        <div className="scroll-x" style={{ marginTop: '.75rem' }}>
          <table className="ptable"><thead><tr><th>When</th><th>What</th><th>Result</th></tr></thead><tbody>
            {data.syncs.map((s) => <tr key={s.id}><td className="dim" style={{ whiteSpace: 'nowrap' }}>{dateTime(s.createdAt)}</td><td className="mono">{s.kind}</td><td>{s.succeeded ? <span className="row" style={{ gap: '.3rem', color: 'var(--p-green)' }}><CheckCircle2 size={14} /> {s.summary}</span> : <span className="row" style={{ gap: '.3rem', color: 'var(--p-magenta)' }}><XCircle size={14} /> {s.summary}</span>}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
