/**
 * /distribution/pos — "Works with your point of sale": how a comic shop
 * gets Distribution orders, invoices and shipments into Manage Comics,
 * ComicHub, Comic Shop Assistant, Shopify POS, Lightspeed or any register,
 * plus the API and webhook reference for anyone automating it.
 */
import { Link } from 'react-router-dom';
import { Plug, FileSpreadsheet, KeyRound, Webhook, Code2, Download } from 'lucide-react';
import { useSeo } from '../../lib/seo';
import { useAuth } from '../../store/auth';

const SYSTEMS: { name: string; format: string; how: string }[] = [
  { name: 'Manage Comics', format: 'Diamond invoice layout', how: 'Invoices → Import → Diamond CSV. Works with the Lightspeed, Shopify POS and RMH registers Manage Comics plugs into; it reads our catalog ids as item codes so series carry across months.' },
  { name: 'ComicHub', format: 'Diamond invoice layout', how: 'Distributor invoice import, Diamond file type. UPC and ISBN columns match titles already in the system.' },
  { name: 'Comic Shop Assistant', format: 'All columns (or Diamond)', how: 'Upload the invoice, map Item Code, UPC, Title, Quantity, MSRP and Unit Cost once, save the template.' },
  { name: 'Lightspeed Retail', format: 'Live connection (or Lightspeed item import)', how: 'X-Series connects with a personal token, R-Series with a Connect button; shipped copies arrive as a received stock order with your cost. The import file is the fallback.' },
  { name: 'Retail Management Hero', format: 'RMH item import / PO receive', how: 'The Import Utility layout (map once, save the mapping) and the received-PO layout (Code, Qty Rcv, Cost). Any other register takes the all-columns file.' },
  { name: 'Shopify POS', format: 'Live connection (or Shopify product import)', how: 'Connect the store once; every shipment is received into inventory on its own, products created with barcode = UPC, SKU = our catalog id and cost = your wholesale price. The import file is the fallback.' },
];

const Code = ({ children }: { children: string }) => <pre className="panel tight mono" style={{ fontSize: '.78rem', overflowX: 'auto', margin: '.5rem 0 1rem', whiteSpace: 'pre' }}>{children}</pre>;

export function PodPosGuide() {
  useSeo({ image: '/og-distribution.png', title: 'Works with your POS — Distribution — Printing Comics', description: 'Get Distribution invoices, shipments and catalogs into Manage Comics, ComicHub, Comic Shop Assistant, Shopify POS, Lightspeed or any register. CSV files, a JSON API and webhooks.' });
  const { user } = useAuth();
  const H = ({ id, icon, children }: { id: string; icon: React.ReactNode; children: React.ReactNode }) => <h2 id={id} className="display-md" style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '.6rem' }}>{icon}{children}</h2>;
  return (
    <div className="pod">
      <section className="hero-dark" style={{ padding: '3rem 0 2rem' }}>
        <div className="grain" />
        <div className="container between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
          <div><div className="eyebrow rise"><Link to="/distribution" style={{ textDecoration: 'none' }}>Distribution</Link> · For comic shops</div><h1 className="display-lg rise rise-1" style={{ margin: '.3rem 0' }}>Works with your point of sale</h1><p className="lead rise rise-2" style={{ maxWidth: '58ch' }}>Your invoices, shipping manifests and catalogs come out in the layout your system already imports. Nothing to retype, nothing new to learn.</p></div>
          <Link to={user?.retailer ? '/retailer/integrations' : '/distribution/apply?as=retailer'} className="pbtn hot rise rise-2"><Plug size={16} /> {user?.retailer ? 'Open POS & integrations' : 'Open a wholesale account'}</Link>
        </div>
      </section>
      <div className="container" style={{ padding: '1.5rem 1.25rem 4rem', maxWidth: 960 }}>
        <nav className="panel tight" style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '1rem' }}>
          {[['systems', 'Your system'], ['files', 'The files'], ['key', 'Key & feeds'], ['live', 'Live connections'], ['webhooks', 'Webhooks'], ['api', 'API reference']].map(([id, l]) => <a key={id} href={`#${id}`} className="pbtn ghost xs">{l}</a>)}
        </nav>

        <H id="systems" icon={<Plug size={22} style={{ color: 'var(--p-violet)' }} />}>Your system</H>
        <p>Comic shop tools (Manage Comics, ComicHub, Comic Shop Assistant) take distributor data as files you import; registers like Lightspeed (and Shopify) can be pushed to directly. Pick your system on the POS &amp; integrations page of the portal: the right layout is chosen for you, the invoice file rides along on every shipped email, and Lightspeed (or Shopify) can be connected so nothing needs importing at all.</p>
        <div className="grid cols-2" style={{ marginTop: '1rem' }}>
          {SYSTEMS.map((s) => <div key={s.name} className="panel"><b>{s.name}</b><div className="dim" style={{ fontSize: '.8rem', margin: '.15rem 0 .4rem' }}>{s.format}</div><p className="dim tight" style={{ fontSize: '.9rem' }}>{s.how}</p></div>)}
        </div>

        <H id="files" icon={<FileSpreadsheet size={22} style={{ color: 'var(--p-violet)' }} />}>The files</H>
        <ul>
          <li><b>Invoice</b> — one order, one file: every title with quantity, cover price, your wholesale price and line total, plus UPC / ISBN, publisher and release date. Download it from the order's page.</li>
          <li><b>Shipments</b> — everything that shipped to you in the last 7 or 30 days (or since a date), one invoice per order in a single file, only the copies that actually shipped, with carrier and tracking on the all-columns layout.</li>
          <li><b>Catalog</b> — every title in a published catalog at your price with the quantity left blank, so your POS can take pre-orders and subscriptions before the books arrive.</li>
        </ul>
        <p>Six layouts, same data: <b>Diamond invoice layout</b> (Units Shipped, Item Code, Item Description, Retail Price, Unit Price, Invoice Amount, Category Code, Order Type, Processed As, Order Number, UPC, ISBN, EAN), <b>all columns</b> with plain headers, <b>Shopify product import</b>, <b>Lightspeed item import</b>, <b>RMH item import</b> and <b>RMH PO receive</b> (Code, Qty Rcv, Cost). The Item Code is our catalog id, SERIESCODE plus the last five digits of the UPC, which is the same month after month for a series.</p>

        <H id="key" icon={<KeyRound size={22} style={{ color: 'var(--p-violet)' }} />}>Integration key and feed URLs</H>
        <p>Make a key on the POS &amp; integrations page. It stands for your shop: anything holding it can fetch your files and use the API as you, so treat it like a password. A tool that only takes a URL can fetch any file with <code>?key=</code>:</p>
        <Code>{`https://printingcomics.com/api/v1/retail/exports/shipments.csv?format=diamond&since=7d&key=pcr_…
https://printingcomics.com/api/v1/retail/orders/PC-ABC123/invoice.csv?format=generic&key=pcr_…
https://printingcomics.com/api/v1/retail/exports/catalog/CATALOG_ID.csv?format=shopify&key=pcr_…`}</Code>
        <p><code>since</code> takes a date (<code>2026-01-31</code>) or a number of days (<code>30d</code>). <code>format</code> is <code>diamond</code>, <code>generic</code>, <code>shopify</code>, <code>lightspeed</code>, <code>rmh</code> or <code>rmh_receive</code>.</p>

        <H id="live" icon={<Plug size={22} style={{ color: 'var(--p-violet)' }} />}>Live connections (Lightspeed, Shopify)</H>
        <p>Connect the store once under POS &amp; integrations and we push to it: when you order, the titles are created in your POS with zero stock (SKU = our catalog id, barcode = UPC, price = cover price, cost = your wholesale price) so pre-orders can be taken; when a box ships, the copies in that box are received into stock at the location you chose, once per box. Every push is logged on the page, and "Push to POS" on an order repeats it.</p>
        <ul>
          <li><b>Lightspeed X-Series</b> — a personal token from Setup → Personal tokens (an admin on the Plus plan). Copies arrive as a supplier stock order marked received, with your cost, at the outlet you chose.</li>
          <li><b>Lightspeed R-Series</b> — "Connect with Lightspeed" (our registered app, scope <code>employee:inventory</code>); items are matched by custom SKU then UPC, and quantity on hand at your shop is raised.</li>
          <li><b>Shopify</b> — "Connect with Shopify" (our app; approve it in your admin), or paste the client id and secret of an app you made in your own Dev Dashboard (we fetch its 24-hour tokens), or a legacy admin-created custom app's <code>shpat_</code> token. Scopes: <code>write_products</code>, <code>write_inventory</code>, <code>read_locations</code>. Stock is adjusted as "available", reason "received".</li>
        </ul>

        <H id="webhooks" icon={<Webhook size={22} style={{ color: 'var(--p-violet)' }} />}>Webhooks</H>
        <p>Set an https URL and we POST JSON when something happens to one of your orders. Each call carries the event in <code>X-PC-Event</code> and, when you set a secret, an HMAC-SHA256 signature in <code>X-PC-Signature</code> as <code>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code> over <code>{'<t>.<body>'}</code>.</p>
        <table className="ptable"><thead><tr><th>Event</th><th>When</th></tr></thead><tbody>
          <tr><td className="mono">order.placed</td><td>A new order was placed in an open catalog.</td></tr>
          <tr><td className="mono">order.updated</td><td>The order was replaced before the final order cutoff.</td></tr>
          <tr><td className="mono">order.canceled</td><td>Canceled or voided, by you, by us, or by a failed payment.</td></tr>
          <tr><td className="mono">invoice.ready</td><td>Shipping is set and the pay link went out.</td></tr>
          <tr><td className="mono">order.paid</td><td>Payment received.</td></tr>
          <tr><td className="mono">shipment.created</td><td>A box left, from us or from the publisher, with tracking.</td></tr>
          <tr><td className="mono">order.shipped</td><td>Every line on the order has shipped.</td></tr>
          <tr><td className="mono">ping</td><td>The test button on the integrations page.</td></tr>
        </tbody></table>
        <Code>{`{
  "event": "shipment.created",
  "orderId": "cm…",
  "sentAt": "2026-11-19T18:02:11.000Z",
  "data": {
    "number": "PC-ABC123", "status": "PENDING", "paymentStatus": "PENDING",
    "catalog": { "id": "…", "name": "January 2027", "inStoreDate": "2027-01-20" },
    "poNumber": "PO-77", "tier": "Tier II",
    "subtotalCents": 24500, "shippingCents": 1800, "discountCents": 0, "totalCents": 26300,
    "shipments": [{ "carrier": "UPS", "service": null, "trackingCode": "1Z…", "date": "2026-11-19" }],
    "lines": [{ "catalogKey": "SAV-92708", "upc": "9798995292708", "title": "Savage Wonders #4", "publisher": "Savage Press", "quantity": 10, "msrpCents": 499, "unitCents": 274, "totalCents": 2740, "releaseDate": "2027-01-20" }]
  }
}`}</Code>

        <H id="api" icon={<Code2 size={22} style={{ color: 'var(--p-violet)' }} />}>API reference</H>
        <p>Base URL <code>https://printingcomics.com/api/v1/retail</code>. Send <code>Authorization: Bearer pcr_…</code> (or <code>X-Api-Key</code>). Responses are JSON; errors are <code>{'{ "error": "…" }'}</code> with a 4xx status. 120 requests a minute per shop.</p>
        <table className="ptable"><thead><tr><th>Method and path</th><th>What it does</th></tr></thead><tbody>
          <tr><td className="mono">GET /integration/whoami</td><td>Which shop the key stands for.</td></tr>
          <tr><td className="mono">GET /me</td><td>Your shop, the open catalog, your open order, store credit, discount tiers.</td></tr>
          <tr><td className="mono">GET /downloads</td><td>Published catalogs with dates, whether ordering is open, and your order in each.</td></tr>
          <tr><td className="mono">GET /catalog?cycle=ID</td><td>Every title in a catalog with your wholesale price.</td></tr>
          <tr><td className="mono">GET /exports/catalog/ID[.csv]?format=</td><td>The catalog as a pre-order file (JSON without .csv).</td></tr>
          <tr><td className="mono">POST /basket/preview</td><td><code>{'{ cycleId, quantities: { listingId: qty }, couponCode? }'}</code> → priced lines, tier, problems.</td></tr>
          <tr><td className="mono">POST /orders</td><td>Place, or replace before FOC, your order for a catalog: <code>{'{ cycleId, quantities, poNumber?, notes?, couponCode? }'}</code>.</td></tr>
          <tr><td className="mono">GET /orders · GET /orders/NUMBER</td><td>Your orders; one order with lines, shipments, events and the pay link when payable.</td></tr>
          <tr><td className="mono">GET /orders/NUMBER/invoice[.csv]?format=</td><td>The invoice (JSON or file). <code>shipped=1</code> limits the file to copies that shipped.</td></tr>
          <tr><td className="mono">POST /orders/NUMBER/cancel</td><td>Cancel while the catalog is still open and nothing is paid.</td></tr>
          <tr><td className="mono">GET /exports/shipments[.csv]?since=&format=</td><td>Everything shipped since a date, one invoice per order.</td></tr>
          <tr><td className="mono">GET /shipments</td><td>Shipments with carrier and tracking.</td></tr>
          <tr><td className="mono">GET /returns · POST /returns</td><td>Claimable orders and your claims; file a return or damage claim.</td></tr>
        </tbody></table>
        <Code>{`curl -H "Authorization: Bearer pcr_…" \\
  "https://printingcomics.com/api/v1/retail/exports/shipments?since=7d"

curl -H "Authorization: Bearer pcr_…" -H "Content-Type: application/json" \\
  -d '{"cycleId":"…","quantities":{"LISTING_ID":10},"poNumber":"PO-77"}' \\
  https://printingcomics.com/api/v1/retail/orders`}</Code>
        <p className="dim" style={{ fontSize: '.88rem' }}>Listing ids come from <code>GET /catalog</code>; the order form upload in the portal also accepts catalog ids and UPCs. Settings (webhook URL, keys) are changed only from the portal, never with a key.</p>
        <div className="row" style={{ marginTop: '1.5rem' }}><Link to={user?.retailer ? '/retailer/integrations' : '/login?redirect=/retailer/integrations'} className="pbtn primary"><Download size={16} /> Go to POS &amp; integrations</Link><Link to="/distribution" className="pbtn ghost">Back to Distribution</Link></div>
      </div>
    </div>
  );
}
