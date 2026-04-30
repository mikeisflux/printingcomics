/**
 * Public-facing API reference for the Printing Comics developer platform.
 * Linked from the footer ("Developers" column). The data shown here is the
 * static documentation — to mint a key the integrator must contact us, and
 * we provision it from /admin/api-keys.
 */
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';

export function Developers() {
  return (
    <div style={{ background: 'var(--bg-alt)', minHeight: '100vh' }}>
      <div className="container" style={{ padding: '3rem 1rem', maxWidth: 1100, display: 'grid', gridTemplateColumns: '240px 1fr', gap: '2rem' }}>
        <Sidebar />
        <main style={{ minWidth: 0 }}>
          <Hero />
          <Section id="overview" title="Overview">
            <p>
              The <strong>Printing Comics Developer API</strong> lets crowdfunding platforms,
              publishers, and any other integrator submit print orders directly to our
              fulfillment system. Anything you can do on the storefront — pick a comic-book
              size, configure interior pages, choose a paper stock, apply quantity-tier
              discounts, pick a shipping method — you can do programmatically.
            </p>
            <ul>
              <li>Full read access to the catalog (products, variants, configurator options, pricing rules)</li>
              <li>Server-side <strong>price quotes</strong> that match the storefront to the cent</li>
              <li>Live <strong>shipping rates</strong> by destination country</li>
              <li><strong>Order submission</strong> with idempotency by your platform's reference id</li>
              <li>Order status & tracking lookup</li>
            </ul>
          </Section>

          <Section id="getting-started" title="Getting started">
            <ol>
              <li>
                <strong>Request an API key.</strong>{' '}
                <Link to="/contact">Contact us</Link> with the name of your platform and the
                scopes you need. Our team mints the key from the admin dashboard
                (<code>/admin/api-keys</code>) and emails it to you. The full secret is shown
                exactly once — store it somewhere safe.
              </li>
              <li>
                <strong>Authenticate every request</strong> with the <code>Authorization</code>{' '}
                header (or <code>X-Api-Key</code>):
                <Code>{`Authorization: Bearer pc_live_xxxxxxxxxxxxxxxx`}</Code>
              </li>
              <li>
                <strong>Fetch the catalog</strong> to learn what products and configurator
                options are available, then <strong>quote</strong> a basket to confirm pricing,
                and finally <strong>submit the order</strong> with your platform's pledge id as{' '}
                <code>externalRef</code> for idempotency.
              </li>
            </ol>
            <p>
              The base URL of every endpoint below is <code>{`https://printingcomics.com/api/v1`}</code>.
            </p>
          </Section>

          <Section id="auth" title="Authentication & scopes">
            <p>
              Each API key carries one or more scopes that control what it can do. A typical
              crowdfunding integration is granted all five:
            </p>
            <table className="api-table">
              <thead>
                <tr><th>Scope</th><th>Allows</th></tr>
              </thead>
              <tbody>
                <tr><td><code>catalog:read</code></td><td>Read products, variants, options, categories</td></tr>
                <tr><td><code>pricing:read</code></td><td>Quote prices for a basket</td></tr>
                <tr><td><code>shipping:read</code></td><td>List shipping rates and zones</td></tr>
                <tr><td><code>orders:read</code></td><td>Look up orders submitted with this key</td></tr>
                <tr><td><code>orders:write</code></td><td>Create and cancel orders</td></tr>
              </tbody>
            </table>
            <p>
              Verify your key with a quick probe — this returns the key's name and granted scopes:
            </p>
            <Code>{`curl https://printingcomics.com/api/v1/me \\
  -H "Authorization: Bearer pc_live_xxxxxxxxxxxxxxxx"`}</Code>
          </Section>

          <Section id="rate-limits" title="Rate limits & idempotency">
            <p>
              Each key is allowed up to <strong>300 requests per minute</strong>. Bulk-submitting
              hundreds of orders at the end of a campaign is supported — just pace your requests.
            </p>
            <p>
              When creating orders, pass a stable <code>externalRef</code> (your platform's pledge
              id, for example). Re-POSTing the same <code>externalRef</code> with the same key
              returns the previously-created order instead of duplicating it. This makes retries
              safe.
            </p>
          </Section>

          <Section id="catalog" title="Catalog">
            <Endpoint method="GET" path="/catalog/products" scope="catalog:read" />
            <p>List active products. Optional query: <code>category</code>, <code>q</code>, <code>limit</code> (max 100), <code>cursor</code>.</p>
            <Code>{`GET /api/v1/catalog/products?category=comic-books&limit=50

{
  "products": [
    {
      "id": "ckxx…",
      "slug": "standard-comic-book",
      "name": "Standard Comic Book",
      "shortDescription": "Saddle-stitched 6.625 × 10.25\\" floppy",
      "priceCents": 0,
      "minQuantity": 25,
      "image": "https://…/cover.jpg",
      "categories": [{ "slug": "comic-books", "name": "Comic Books" }]
    }
  ],
  "nextCursor": null
}`}</Code>

            <Endpoint method="GET" path="/catalog/products/:slug" scope="catalog:read" />
            <p>
              Returns the full product, including every <code>option</code> (cover stock, paper
              type, page count, finish), every <code>value</code> (with price modifiers), the{' '}
              <code>variants</code>, and the structured <code>pricingConfig</code> the storefront
              uses to compute prices.
            </p>

            <Endpoint method="GET" path="/catalog/categories" scope="catalog:read" />
            <p>List all categories with product counts.</p>

            <Endpoint method="GET" path="/catalog/categories/:slug" scope="catalog:read" />
            <p>List every product in a category with the full configurator payload.</p>
          </Section>

          <Section id="pricing" title="Pricing">
            <Endpoint method="POST" path="/pricing/quote" scope="pricing:read" />
            <p>
              Compute exact prices for a basket. The math runs on our server using the same
              pipeline as the storefront cart, so what you quote is what you'll be charged. Send
              a <code>shippingAddress</code> to compute tax, plus either a{' '}
              <code>shippingRateId</code> or just the country to receive the available shipping
              options.
            </p>
            <Code>{`POST /api/v1/pricing/quote
Content-Type: application/json

{
  "items": [
    {
      "productSlug": "standard-comic-book",
      "quantity": 250,
      "options": {
        "interior_pages": 32,
        "interior_color": "Full Color",
        "interior_paper": "80lb Gloss",
        "cover_paper": "100lb Gloss"
      }
    }
  ],
  "shippingAddress": { "country": "US", "region": "CA" },
  "couponCode": "LAUNCH10"
}`}</Code>
            <p>Response includes <code>unitPriceCents</code> and a per-line <code>breakdown</code> showing the qty discount, page upgrades, and option modifiers we applied:</p>
            <Code>{`{
  "items": [{
    "productSlug": "standard-comic-book",
    "quantity": 250,
    "unitPriceCents": 187,
    "totalCents": 46750,
    "breakdown": {
      "baseCents": 1500,
      "modifierCents": { "cover_paper": 0 },
      "pagesCents": 200,
      "combinedListCents": 1700,
      "discountBps": 8900,
      "unitCents": 187,
      "totalCents": 46750
    }
  }],
  "subtotalCents": 46750,
  "discountCents": 4675,
  "shippingOptions": [
    { "id": "shp_…", "name": "USPS Priority", "rateCents": 1499, "estimatedDays": "2-3" }
  ],
  "taxCents": 3473,
  "totalCents": 45548,
  "currency": "USD"
}`}</Code>
          </Section>

          <Section id="shipping" title="Shipping">
            <Endpoint method="GET" path="/shipping/rates?country=US" scope="shipping:read" />
            <p>Return every shipping rate available for a destination country.</p>

            <Endpoint method="GET" path="/shipping/zones" scope="shipping:read" />
            <p>List all configured shipping zones with their countries and rates.</p>
          </Section>

          <Section id="orders" title="Orders">
            <Endpoint method="POST" path="/orders" scope="orders:write" />
            <p>
              Submit a print order. The order is created in <code>PENDING</code> status. Pass{' '}
              <code>markAsPaid: true</code> if your platform has already collected payment (the
              standard crowdfunding case) — we'll mark the order as paid on our side and queue
              it for production. Otherwise the order waits to be invoiced.
            </p>
            <Code>{`POST /api/v1/orders
Content-Type: application/json
Authorization: Bearer pc_live_xxxxxxxxxxxxxxxx

{
  "externalRef": "kickstarter-pledge-9182374",
  "email": "backer@example.com",
  "customerName": "Pat Backer",
  "shippingAddress": {
    "firstName": "Pat", "lastName": "Backer",
    "line1": "123 Main St",
    "city": "San Francisco", "region": "CA",
    "postalCode": "94110", "country": "US"
  },
  "items": [
    {
      "productSlug": "standard-comic-book",
      "quantity": 250,
      "options": {
        "interior_pages": 32,
        "interior_color": "Full Color",
        "interior_paper": "80lb Gloss",
        "cover_paper": "100lb Gloss"
      }
    }
  ],
  "shippingRateId": "shp_…",
  "couponCode": "LAUNCH10",
  "notes": "Fulfill after Kickstarter campaign closes 2026-05-15.",
  "markAsPaid": true
}`}</Code>
            <p>
              Re-sending the request with the same <code>externalRef</code> is safe — you'll get
              the original order back with <code>idempotent: true</code>.
            </p>

            <Endpoint method="GET" path="/orders" scope="orders:read" />
            <p>List the orders you've submitted (most recent first). <code>?limit=200</code> max.</p>

            <Endpoint method="GET" path="/orders/:idOrNumberOrExternalRef" scope="orders:read" />
            <p>Look up by our id, our order number, or your <code>externalRef</code>. Returns full status, tracking, and line items.</p>

            <Endpoint method="POST" path="/orders/:idOrNumber/cancel" scope="orders:write" />
            <p>Cancel an order that hasn't shipped yet. Optional body: <code>{`{ "reason": "Backer refunded" }`}</code>.</p>
          </Section>

          <Section id="data-model" title="Data model">
            <h3>Order</h3>
            <table className="api-table">
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td><code>id</code></td><td>string</td><td>Our internal id</td></tr>
                <tr><td><code>number</code></td><td>string</td><td>Human-readable, e.g. <code>PCAPI-LK7Z2X-3491</code></td></tr>
                <tr><td><code>externalRef</code></td><td>string?</td><td>The reference you supplied at create time</td></tr>
                <tr><td><code>status</code></td><td>enum</td><td><code>PENDING | PAID | IN_PRODUCTION | SHIPPED | DELIVERED | CANCELLED | REFUNDED</code></td></tr>
                <tr><td><code>paymentStatus</code></td><td>enum</td><td><code>PENDING | AUTHORIZED | CAPTURED | FAILED | REFUNDED</code></td></tr>
                <tr><td><code>subtotalCents / shippingCents / taxCents / discountCents / totalCents</code></td><td>integer</td><td>All amounts in USD cents</td></tr>
                <tr><td><code>shippingMethod</code></td><td>string?</td><td>Carrier + service once shipped</td></tr>
                <tr><td><code>trackingNumber</code></td><td>string?</td><td>Set when we hand off to the carrier</td></tr>
                <tr><td><code>items[]</code></td><td>OrderItem</td><td>See below</td></tr>
              </tbody>
            </table>
            <h3>OrderItem</h3>
            <table className="api-table">
              <thead><tr><th>Field</th><th>Type</th></tr></thead>
              <tbody>
                <tr><td><code>productId</code> / <code>variantId</code></td><td>string</td></tr>
                <tr><td><code>name</code></td><td>string</td></tr>
                <tr><td><code>quantity</code></td><td>integer</td></tr>
                <tr><td><code>unitPriceCents</code> / <code>totalCents</code></td><td>integer</td></tr>
                <tr><td><code>options</code></td><td>object</td></tr>
              </tbody>
            </table>
          </Section>

          <Section id="errors" title="Errors">
            <p>Every error response is JSON with at minimum <code>{`{ "error": "<message>" }`}</code>. Common HTTP statuses:</p>
            <table className="api-table">
              <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td>400</td><td>Validation failed (see <code>details</code>)</td></tr>
                <tr><td>401</td><td>Missing / invalid / revoked API key</td></tr>
                <tr><td>403</td><td>Key is missing the required scope</td></tr>
                <tr><td>404</td><td>Resource not found</td></tr>
                <tr><td>409</td><td>Cannot perform action in the current order status</td></tr>
                <tr><td>429</td><td>Rate limit exceeded — back off and retry</td></tr>
                <tr><td>500</td><td>Server error — safe to retry</td></tr>
              </tbody>
            </table>
          </Section>

          <Section id="quickstart" title="End-to-end quickstart (Node)">
            <Code>{`import fetch from 'node-fetch';

const KEY = process.env.PRINTINGCOMICS_API_KEY;
const BASE = 'https://printingcomics.com/api/v1';

async function api(path, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(\`\${r.status} \${await r.text()}\`);
  return r.json();
}

// 1. Pull the catalog
const { products } = await api('/catalog/products?category=comic-books');

// 2. Quote a basket so the cost the backer sees matches what we'll charge
const quote = await api('/pricing/quote', {
  method: 'POST',
  body: JSON.stringify({
    items: [{
      productSlug: 'standard-comic-book',
      quantity: 250,
      options: {
        interior_pages: 32,
        interior_color: 'Full Color',
        interior_paper: '80lb Gloss',
        cover_paper: '100lb Gloss',
      },
    }],
    shippingAddress: { country: 'US', region: 'CA' },
  }),
});

// 3. Submit the order with the campaign pledge id as externalRef
const { order } = await api('/orders', {
  method: 'POST',
  body: JSON.stringify({
    externalRef: 'kickstarter-pledge-9182374',
    email: 'backer@example.com',
    shippingAddress: { /* … */ },
    items: quote.items.map(i => ({
      productSlug: i.productSlug,
      quantity: i.quantity,
      options: i.options,
    })),
    shippingRateId: quote.shippingOptions[0].id,
    markAsPaid: true,
  }),
});
console.log('Submitted', order.number);`}</Code>
          </Section>

          <Section id="support" title="Support">
            <p>
              Questions, scope changes, sandbox keys, or volume pricing — write to{' '}
              <a href="mailto:developers@printingcomics.com">developers@printingcomics.com</a>{' '}
              or <Link to="/contact">use the contact form</Link>.
            </p>
          </Section>
        </main>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ fontSize: '.85rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--brand)', fontWeight: 700 }}>
        Developer Platform
      </div>
      <h1 style={{ marginTop: '.4rem', fontSize: '2.4rem' }}>Printing Comics API</h1>
      <p className="muted" style={{ fontSize: '1.1rem', maxWidth: 720 }}>
        Submit print orders programmatically from your crowdfunding platform, publisher
        backend, or shop. The API mirrors the storefront — every product, every option,
        every price tier.
      </p>
    </div>
  );
}

function Sidebar() {
  const items = [
    ['overview', 'Overview'],
    ['getting-started', 'Getting started'],
    ['auth', 'Authentication & scopes'],
    ['rate-limits', 'Rate limits & idempotency'],
    ['catalog', 'Catalog'],
    ['pricing', 'Pricing'],
    ['shipping', 'Shipping'],
    ['orders', 'Orders'],
    ['data-model', 'Data model'],
    ['errors', 'Errors'],
    ['quickstart', 'Quickstart (Node)'],
    ['support', 'Support'],
  ];
  return (
    <aside style={{ position: 'sticky', top: '1rem', alignSelf: 'start' }}>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: '.92rem' }}>
        {items.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            style={{ color: 'var(--ink)', textDecoration: 'none', padding: '.4rem .6rem', borderRadius: 6 }}
          >
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: '3rem', scrollMarginTop: '1rem' }}>
      <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '.5rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function Endpoint({ method, path, scope }: { method: string; path: string; scope: string }) {
  const colors: Record<string, string> = {
    GET: '#1e74fc', POST: '#16a34a', PATCH: '#d97706', DELETE: '#dc2626',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', margin: '1.25rem 0 .5rem', flexWrap: 'wrap' }}>
      <span
        style={{
          background: colors[method] ?? '#444',
          color: '#fff',
          padding: '.25rem .55rem',
          borderRadius: 4,
          fontSize: '.8rem',
          fontWeight: 700,
          letterSpacing: '.05em',
        }}
      >
        {method}
      </span>
      <code style={{ fontSize: '1.05rem', fontWeight: 600 }}>{path}</code>
      <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>scope: <code>{scope}</code></span>
    </div>
  );
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: 'relative', margin: '.75rem 0 1.25rem' }}>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: '.75rem', padding: '.25rem .5rem',
          background: 'rgba(255,255,255,.08)', color: '#fff',
          border: '1px solid rgba(255,255,255,.2)', borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre
        style={{
          background: '#0f1419', color: '#e2e8f0',
          padding: '1rem', borderRadius: 8, overflowX: 'auto',
          fontSize: '.85rem', lineHeight: 1.5,
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}
