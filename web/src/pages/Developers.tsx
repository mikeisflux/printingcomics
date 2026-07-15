/**
 * Public-facing API reference for the Printing Comics developer platform.
 * Linked from the footer ("Developers" column). The data shown here is the
 * static documentation — to mint a key the integrator must contact us, and
 * we provision it from /admin/api-keys.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';

export function Developers() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // Wait for the section to mount, then scroll + focus the first input if
    // we're jumping to the request-access form.
    const id = hash.slice(1);
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(id);
      if (!el) {
        if (attempt < 10) setTimeout(() => tryScroll(attempt + 1), 50);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (id === 'request-access') {
        const firstInput = el.querySelector('input');
        if (firstInput instanceof HTMLInputElement) {
          setTimeout(() => firstInput.focus(), 350);
        }
      }
    };
    tryScroll();
  }, [hash]);

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
              <li><strong>Project tracking</strong> — group orders by the campaign / creator that submitted them</li>
              <li><strong>Print file uploads</strong> (covers, interior PDFs, dust jackets, etc.) attached per line item</li>
              <li><strong>Order submission</strong> with idempotency by your platform's reference id</li>
              <li><strong>Hosted payment</strong> — we auto-generate a PayPal approval URL the creator pays through</li>
              <li>Order status & tracking lookup with outbound webhooks</li>
            </ul>
            <p>
              Typical end-to-end flow: a creator on your platform finishes their campaign → your
              backend POSTs an order to us with a <code>projectId</code> tying it to the campaign
              → we return a PayPal approval URL → you forward it to the creator → they pay → we
              print and ship to the creator's address → they fulfill to backers.
            </p>
          </Section>

          <Section id="request-access" title="Request access">
            <RequestAccessForm />
          </Section>

          <Section id="getting-started" title="Getting started">
            <ol>
              <li>
                <strong>Request an API key</strong> using the form in{' '}
                <a href="#request-access">Request access</a> above. We typically respond within
                1–2 business days. On approval you receive a one-time email containing your
                bearer key and signing secret.
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
                <tr><td><code>projects:read</code></td><td>List and inspect your projects (creators' campaigns)</td></tr>
                <tr><td><code>projects:write</code></td><td>Create / upsert / update projects</td></tr>
                <tr><td><code>orders:read</code></td><td>Look up orders submitted with this key</td></tr>
                <tr><td><code>orders:write</code></td><td>Create and cancel orders</td></tr>
                <tr><td><code>payments:read</code></td><td>Look up payment status for an order</td></tr>
                <tr><td><code>payments:write</code></td><td>Generate payment approval links + mark orders paid out-of-band</td></tr>
                <tr><td><code>uploads:read</code></td><td>List and inspect print files you've uploaded</td></tr>
                <tr><td><code>uploads:write</code></td><td>Upload, attach, and delete print files</td></tr>
              </tbody>
            </table>
            <p>
              Verify your key with a quick probe — this returns the key's name and granted scopes:
            </p>
            <Code>{`curl https://printingcomics.com/api/v1/me \\
  -H "Authorization: Bearer pc_live_xxxxxxxxxxxxxxxx"`}</Code>
          </Section>

          <Section id="request-signing" title="Request signing (HMAC)">
            <p>
              In addition to the bearer key, each credential pair includes a{' '}
              <strong>signing secret</strong> (<code>pcs_…</code>) that you can use to sign request
              bodies for tamper-proofing. Signing is <em>optional by default</em>; we will turn on
              the <code>requireRequestSigning</code> flag for your key on request, after which
              every mutating request must be signed.
            </p>
            <p>
              Add an <code>X-PC-Request-Signature</code> header in the form{' '}
              <code>{'t=<unix>,v1=<hex>'}</code>, where <code>v1</code> is{' '}
              <code>HMAC-SHA256(signingSecret, `${'$'}{'{t}'}.${'$'}{'{rawBody}'}`)</code>. The
              timestamp must be within 5 minutes of server time.
            </p>
            <Code>{`import { createHmac } from 'node:crypto';

const t = Math.floor(Date.now() / 1000);
const body = JSON.stringify(payload);  // serialize ONCE; send the same string
const sig = createHmac('sha256', signingSecret)
  .update(\`\${t}.\${body}\`)
  .digest('hex');

await fetch('https://printingcomics.com/api/v1/orders', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${apiKey}\`,
    'Content-Type': 'application/json',
    'X-PC-Request-Signature': \`t=\${t},v1=\${sig}\`,
  },
  body,
});`}</Code>
            <p>
              Rotating the signing secret invalidates the old one immediately. Both keys can be
              regenerated from your account contact at{' '}
              <a href="mailto:developers@printingcomics.com">developers@printingcomics.com</a>.
            </p>
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
            <p>
              Proof fees are included in the quote exactly as they'll be charged: a line with{' '}
              <code>hard_copy_proof</code> adds a separate <code>Hard-Copy Proof — …</code> item
              (that book's single-copy price + $19.95), and <code>pdf_proof</code> is free. So the
              quoted <code>totalCents</code> already reflects any requested proofs.
            </p>
          </Section>

          <Section id="shipping" title="Shipping">
            <Endpoint method="GET" path="/shipping/rates?country=US" scope="shipping:read" />
            <p>Return every shipping rate available for a destination country.</p>

            <Endpoint method="GET" path="/shipping/zones" scope="shipping:read" />
            <p>List all configured shipping zones with their countries and rates.</p>
          </Section>

          <Section id="projects" title="Projects (creator campaigns)">
            <p>
              Each platform has many creators, each running their own campaign. Tag every order
              with a <strong>project</strong> — the campaign id from your side — so we can group
              orders, roll up paid revenue per creator, and route status notifications to the
              right contact.
            </p>
            <p>
              You usually don't have to call <code>POST /projects</code> manually: passing{' '}
              <code>projectId</code> on an order auto-creates the project under your partner
              record. Use the dedicated endpoints when you want to pre-register a campaign,
              update creator contact info, or mark a campaign complete.
            </p>

            <Endpoint method="GET" path="/projects" scope="projects:read" />
            <p>
              List your projects, newest-updated first. Optional filters: <code>?status=active</code>{' '}
              (or <code>completed</code>, <code>cancelled</code>), <code>?creatorEmail=jane@…</code>,{' '}
              <code>?limit=200</code>.
            </p>

            <Endpoint method="POST" path="/projects" scope="projects:write" />
            <p>
              Create or upsert a project keyed by <code>(partner, externalProjectId)</code>.
              Re-posting the same <code>externalProjectId</code> updates the existing row.
            </p>
            <Code>{`POST /api/v1/projects
{
  "externalProjectId": "kickstarter-acme-issue-1",
  "title": "Acme Comics #1",
  "url": "https://www.kickstarter.com/projects/acme/issue-1",
  "creatorName": "Jane Doe",
  "creatorEmail": "jane@acmecomics.com",
  "status": "active",
  "metadata": {
    "campaignClosesAt": "2026-06-01T00:00:00Z",
    "backerCount": 1247
  }
}
# →
# {
#   "project": {
#     "id": "cmproj1abcde...",
#     "externalProjectId": "kickstarter-acme-issue-1",
#     "title": "Acme Comics #1",
#     "creatorName": "Jane Doe",
#     "creatorEmail": "jane@acmecomics.com",
#     "status": "active",
#     ...
#   }
# }`}</Code>

            <Endpoint method="GET" path="/projects/:idOrExternalId" scope="projects:read" />
            <p>
              Look up by either our id or the <code>externalProjectId</code> you supplied. The
              response includes a 50-order roll-up plus billed/paid totals so you can wire it
              straight into a campaign dashboard.
            </p>

            <Endpoint method="PATCH" path="/projects/:idOrExternalId" scope="projects:write" />
            <p>
              Update title, URL, creator info, status (active / completed / cancelled), notes,
              or free-form metadata.
            </p>
          </Section>

          <Section id="orders" title="Orders">
            <Endpoint method="POST" path="/orders" scope="orders:write" />
            <p>
              Submit a print order for a creator's campaign. The standard crowdfunding flow:
            </p>
            <ol>
              <li>You POST the order with <code>projectId</code> tying it to the campaign and{' '}
                <code>shippingAddress</code> set to the creator's fulfillment address.</li>
              <li>We respond with the order details <strong>and a PayPal approval URL</strong> in{' '}
                <code>payment.approvalUrl</code>.</li>
              <li>You forward the URL to the creator — they pay PayPal directly, no
                payment data ever touches your servers.</li>
              <li>We capture, fire <code>order.paid</code> webhook, and queue the print run.</li>
            </ol>
            <Code>{`POST /api/v1/orders
Content-Type: application/json
Authorization: Bearer pc_live_xxxxxxxxxxxxxxxx

{
  "externalRef": "kickstarter-pledge-9182374",
  "projectId": "kickstarter-acme-issue-1",
  "email": "jane@acmecomics.com",
  "customerName": "Jane Doe",
  "shippingAddress": {
    "firstName": "Jane", "lastName": "Doe",
    "line1": "123 Main St",
    "city": "San Francisco", "region": "CA",
    "postalCode": "94110", "country": "US"
  },
  "items": [
    {
      "productSlug": "standard-comic-book",
      "quantity": 1500,
      "options": {
        "interior_pages": 32,
        "interior_color": "Full Color",
        "interior_paper": "80lb Gloss",
        "cover_paper": "100lb Gloss"
      },
      "files": [
        { "uploadId": "cmf12abcde...", "purpose": "cover" },
        { "uploadId": "cmf12fghij...", "purpose": "interior" }
      ]
    }
  ],
  "shippingRateId": "shp_…",
  "notes": "Print run for KS campaign closing 2026-05-15."
}
# →
# {
#   "order": {
#     "id": "cmord1abcde...",
#     "number": "PCAPI-LK7Z2X-3491",
#     "externalRef": "kickstarter-pledge-9182374",
#     "projectId": "cmproj1abcde...",
#     "status": "PENDING",
#     "paymentStatus": "PENDING",
#     "proofStatus": null,
#     "totalCents": 487500,
#     "items": [ { ... "files": [ ... ] } ]
#   },
#   "payment": {
#     "provider": "paypal",
#     "approvalUrl": "https://www.paypal.com/checkoutnow?token=...",
#     "expiresAt": "2026-05-01T15:00:00.000Z",
#     "amountCents": 487500
#   },
#   "idempotent": false
# }`}</Code>
            <p>
              <strong>Set <code>generatePaymentLink: false</code></strong> if you'd rather mint
              the approval URL on demand (see <a href="#payments">Payments</a>) — useful when the
              creator isn't ready to pay yet. <strong>Set <code>markAsPaid: true</code></strong>{' '}
              when your platform has already collected funds and you'll settle with us via wire
              or invoice — no PayPal interaction happens, the order is just flagged paid.
            </p>
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

            <h3 id="order-proofing">Proofing</h3>
            <p>
              Request a pre-production proof by setting proof options on a line item. A{' '}
              <strong>PDF proof</strong> is free and simply flags the order; a{' '}
              <strong>hard-copy proof</strong> adds a separate line item priced at that book's
              single-copy price plus a <strong>$19.95</strong> proof &amp; shipping fee (charged per
              book). Add either or both in the item <code>options</code>:
            </p>
            <Code>{`"options": {
  "interior_pages": 32,
  "pdf_proof": "yes",         // free — flags the order for a PDF proof
  "hard_copy_proof": "yes"    // adds one printed proof of this book + $19.95
}`}</Code>
            <p>
              An order that requests any proof is created with{' '}
              <code>proofStatus: "requested"</code> and is <strong>held from production and shipping
              until the proof is approved</strong>. Our team uploads a proof (emailing the customer a
              review link); the customer approves it or requests changes.
            </p>
            <Endpoint method="GET" path="/orders/:idOrNumber/proof" scope="orders:read" />
            <p>Proof status, the customer's review link, and version history:</p>
            <Code>{`GET /api/v1/orders/PCAPI-LK7Z2X-3491/proof
# →
# {
#   "proofStatus": "awaiting_approval",   // null | requested | awaiting_approval | approved | changes_requested
#   "latestProof": {
#     "version": 1,
#     "status": "pending",                // pending | approved | changes_requested
#     "fileUrl": "/uploads/proofs/....pdf",
#     "token": "<token>",                 // the creator's approval credential
#     "reviewUrl": "https://printingcomics.com/proof/<token>",
#     "approvedName": null,
#     "decidedAt": null,
#     "decisionNote": null
#   },
#   "proofs": [ { "version": 1, "status": "pending", "createdAt": "..." } ]
# }`}</Code>
            <h3>Creator approval on your site</h3>
            <p>
              Only the <strong>creator</strong> can approve a proof — never your API key. Approval is
              gated by the proof's <code>token</code> (delivered in the <code>proof.ready</code>{' '}
              webhook and as <code>latestProof.token</code>), so you can host the whole review +
              approval flow inside your own platform:
            </p>
            <ol>
              <li>On <code>proof.ready</code>, notify the creator on your site — the payload carries{' '}
                <code>reviewUrl</code>, <code>token</code>, and <code>fileUrl</code>.</li>
              <li>Render the proof + terms with the public token endpoints below (or just deep-link
                the creator to <code>reviewUrl</code>).</li>
              <li>The creator approves (typing their name + accepting the terms) or requests changes;
                you POST their decision with the token.</li>
              <li>We fire <code>proof.approved</code> / <code>proof.changes_requested</code> back to
                your <a href="#webhooks">webhook</a>, and the order is cleared for production (or held
                for a revised proof).</li>
            </ol>
            <p className="muted">
              These endpoints are token-authenticated (no <code>Authorization</code> header). The
              token is the creator's credential — surface it only to the creator; your API key
              deliberately cannot approve on their behalf.
            </p>
            <Code>{`# Fetch the proof + terms to display
GET https://printingcomics.com/api/proofing/proof/<token>
# → { proof: { version, status, fileUrl, message, ... },
#     order: { number, items }, terms: "..." }

# The creator approves — name + explicit terms acceptance are required
POST https://printingcomics.com/api/proofing/proof/<token>/approve
Content-Type: application/json
{ "name": "Jane Doe", "acceptTerms": true }

# ...or requests changes
POST https://printingcomics.com/api/proofing/proof/<token>/changes
{ "note": "Please fix the spine text." }`}</Code>
          </Section>

          <Section id="payments" title="Payments">
            <p>
              Print runs are paid via <strong>PayPal-hosted checkout</strong>. We never see card
              data — the creator clicks an approval URL we mint, completes payment on PayPal, and
              we capture the funds when they return. PayPal supports both PayPal accounts and
              guest credit-card payments, so the creator doesn't need a PayPal account to pay.
            </p>
            <p>
              Two ways to settle a print order:
            </p>
            <ul>
              <li>
                <strong>Hosted PayPal checkout</strong> (default) — the order response carries{' '}
                <code>payment.approvalUrl</code>; forward it to whoever pays. Approval URLs are
                live for ~3&nbsp;hours; mint a fresh one with{' '}
                <code>POST /orders/:idOrNumber/payment-link</code> if it expires.
              </li>
              <li>
                <strong>Out-of-band</strong> — your platform already collected funds (the
                "drop-ship per backer" flow, or you wire / ACH to us). Pass{' '}
                <code>markAsPaid: true</code> at order create, or call{' '}
                <code>POST /orders/:idOrNumber/mark-paid</code> later with a reference.
              </li>
            </ul>

            <Endpoint method="GET" path="/orders/:idOrNumber/payment" scope="payments:read" />
            <p>Current payment status for an order:</p>
            <Code>{`GET /api/v1/orders/PCAPI-LK7Z2X-3491/payment
# →
# {
#   "payment": {
#     "status": "pending",          // unpaid | pending | paid | failed | refunded
#     "amountCents": 487500,
#     "provider": "paypal",         // paypal | manual | null
#     "providerRef": "8VR58235AB",  // PayPal order id while pending, capture id once paid
#     "paidAt": null,
#     "hasPendingApproval": true
#   }
# }`}</Code>

            <Endpoint method="POST" path="/orders/:idOrNumber/payment-link" scope="payments:write" />
            <p>
              Mint a fresh PayPal approval URL — use this when the original{' '}
              <code>payment.approvalUrl</code> from order creation has expired or you opted out
              of auto-generating one. Optional body lets you override the post-payment redirect:
            </p>
            <Code>{`POST /api/v1/orders/PCAPI-LK7Z2X-3491/payment-link
{
  "returnUrl": "https://your-platform.com/campaigns/issue-1/paid",
  "cancelUrl": "https://your-platform.com/campaigns/issue-1/payment"
}
# →
# {
#   "payment": {
#     "provider": "paypal",
#     "approvalUrl": "https://www.paypal.com/checkoutnow?token=...",
#     "expiresAt": "2026-05-01T18:00:00.000Z",
#     "amountCents": 487500
#   }
# }`}</Code>
            <p>
              Generating a new link invalidates any prior pending PayPal order on the same
              Printing Comics order — only the latest URL works. The webhook event{' '}
              <code>order.payment_link_created</code> fires when a link is minted (auto or manual).
            </p>

            <Endpoint method="POST" path="/orders/:idOrNumber/mark-paid" scope="payments:write" />
            <p>
              Assert the order has been paid out-of-band — wire, ACH, internal billing, etc. We
              don't charge anything; this just flips the order to <code>PAID</code> /{' '}
              <code>CAPTURED</code> and fires <code>order.paid</code>. The optional{' '}
              <code>reference</code> sticks on the Payment row so you can reconcile later.
            </p>
            <Code>{`POST /api/v1/orders/PCAPI-LK7Z2X-3491/mark-paid
{
  "reference": "wire-2026-04-29-acme",
  "amountCents": 487500,
  "note": "Settled via the platform's monthly invoice run"
}
# →
# {
#   "payment": {
#     "status": "paid",
#     "provider": "manual",
#     "amountCents": 487500,
#     "reference": "wire-2026-04-29-acme"
#   }
# }`}</Code>

            <h3>Payment lifecycle events</h3>
            <p>
              Listen for these on your <a href="#webhooks">webhook</a> endpoint:
            </p>
            <table className="api-table">
              <thead><tr><th>Event</th><th>When</th></tr></thead>
              <tbody>
                <tr>
                  <td><code>order.payment_link_created</code></td>
                  <td>Auto on order create (when not paid) and every <code>POST /payment-link</code></td>
                </tr>
                <tr>
                  <td><code>order.paid</code></td>
                  <td>PayPal capture completes <em>or</em> you call <code>/mark-paid</code></td>
                </tr>
                <tr>
                  <td><code>order.in_production</code></td>
                  <td>Admin moves the order to IN_PRODUCTION (we've started the press run)</td>
                </tr>
                <tr>
                  <td><code>order.shipped</code></td>
                  <td>Carrier label generated; <code>trackingNumber</code> on the payload</td>
                </tr>
                <tr>
                  <td><code>order.delivered</code></td>
                  <td>Carrier reports delivery</td>
                </tr>
                <tr>
                  <td><code>order.refunded</code></td>
                  <td>Admin issues a refund</td>
                </tr>
              </tbody>
            </table>

            <h3>Refunds</h3>
            <p>
              Refunds are admin-issued — open a support request with the order number and the
              amount. We refund through the same PayPal capture so the creator receives the funds
              back to their original payment method, and fire <code>order.refunded</code> when
              processed.
            </p>
          </Section>

          <Section id="uploads" title="Uploads (print files)">
            <p>
              Send us your print PDFs (covers, interiors, dust jackets, wrap files, etc.) ahead of
              order submission, then reference them by id when you create the order. Files are
              attributed to your partner + key, capped at <strong>2&nbsp;GB</strong> each, and
              served from a token-protected URL — only someone with the URL we returned can
              download them.
            </p>

            <Endpoint method="POST" path="/uploads" scope="uploads:write" />
            <p>
              Multipart form. The file goes in field <code>file</code>; everything else is metadata.
              Pass <code>X-Upload-Content-Hash</code> with the SHA-256 hex of your file for
              integrity verification + dedupe (re-uploading the same hash returns the existing
              record, byte-free).
            </p>
            <Code>{`curl https://printingcomics.com/api/v1/uploads \\
  -H "Authorization: Bearer pc_live_xxxxxxxxxxxxxxxx" \\
  -H "X-Upload-Content-Hash: $(sha256sum cover.pdf | cut -d' ' -f1)" \\
  -F "purpose=cover" \\
  -F "notes=Variant A (foil)" \\
  -F "file=@cover.pdf"
# →
# {
#   "upload": {
#     "id": "cmf12abcde...",
#     "url": "/uploads/partner/1717428100-...pdf?t=...",
#     "filename": "cover.pdf",
#     "size": 28491782,
#     "mimeType": "application/pdf",
#     "contentHash": "8a8b...",
#     "purpose": "cover",
#     "notes": "Variant A (foil)",
#     "createdAt": "2026-05-01T12:00:00.000Z"
#   },
#   "idempotent": false
# }`}</Code>
            <p>
              The <code>url</code> we return contains a per-file access token. Treat the whole
              URL as a capability — anyone with it can download the file. We accept any file
              type, but the comic-printing flow expects PDFs preflighted to your spec sheet.
            </p>

            <Endpoint method="GET" path="/uploads" scope="uploads:read" />
            <p>
              List the files this key has uploaded, newest first. Optional <code>?limit=200</code>{' '}
              and <code>?purpose=cover</code> filters.
            </p>

            <Endpoint method="GET" path="/uploads/:id" scope="uploads:read" />
            <p>Fetch a single upload's metadata.</p>

            <Endpoint method="DELETE" path="/uploads/:id" scope="uploads:write" />
            <p>
              Soft-delete an upload. The file is removed from disk and the URL stops working,
              but we keep the audit row. Refused with <code>409</code> if the file is already
              attached to an order — contact support to detach it first.
            </p>

            <h3>Attach files to a line item</h3>
            <p>
              When creating an order, each <code>items[]</code> entry can include a{' '}
              <code>files[]</code> array referencing one or more uploads. The{' '}
              <code>purpose</code> tag is free-form so you can use whatever conventions your
              project needs (<code>cover</code>, <code>interior</code>, <code>back-cover</code>,{' '}
              <code>dust-jacket</code>, etc.):
            </p>
            <Code>{`POST /api/v1/orders
{
  "externalRef": "kickstarter-pledge-9281",
  "email": "backer@example.com",
  "shippingAddress": { ... },
  "items": [
    {
      "productSlug": "saddle-stitch-comic",
      "quantity": 250,
      "options": { "page-count": 24, "paper-stock": "premium" },
      "files": [
        { "uploadId": "cmf12abcde...", "purpose": "cover" },
        { "uploadId": "cmf12fghij...", "purpose": "interior" }
      ]
    }
  ]
}`}</Code>
            <p>
              Files must have been uploaded by this same key, or by another key on the same
              partner — otherwise the request is rejected with <code>403</code>. The order
              response surfaces the file list inline on each line item.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>
              We POST signed JSON payloads to a URL you configure (give it to your account
              manager — we set it from <code>/admin/partners/:id</code>). The standard events:
            </p>
            <table className="api-table">
              <thead><tr><th>Event</th><th>When</th></tr></thead>
              <tbody>
                <tr><td><code>order.created</code></td><td>You POST <code>/orders</code> successfully</td></tr>
                <tr><td><code>order.payment_link_created</code></td><td>A PayPal approval URL was minted (auto on create, or via <code>POST /payment-link</code>)</td></tr>
                <tr><td><code>order.paid</code></td><td>PayPal capture completes, or <code>/mark-paid</code> called, or <code>markAsPaid:true</code> at create</td></tr>
                <tr><td><code>order.in_production</code></td><td>We've handed it off to the press</td></tr>
                <tr><td><code>order.shipped</code></td><td>Carrier label generated, tracking number attached</td></tr>
                <tr><td><code>order.delivered</code></td><td>Carrier reports delivery</td></tr>
                <tr><td><code>order.cancelled</code></td><td>You or we cancelled the order</td></tr>
                <tr><td><code>order.refunded</code></td><td>Payment refunded in full or part</td></tr>
                <tr><td><code>proof.ready</code></td><td>A proof was uploaded for the creator to approve. Payload includes <code>reviewUrl</code>, <code>token</code>, and <code>fileUrl</code> so you can surface approval on your site</td></tr>
                <tr><td><code>proof.approved</code></td><td>The customer approved the proof — the order is cleared for production</td></tr>
                <tr><td><code>proof.changes_requested</code></td><td>The customer requested changes; a revised proof is needed</td></tr>
              </tbody>
            </table>
            <p>
              Each request includes an <code>X-PC-Event</code> header naming the event, and an{' '}
              <code>X-PC-Signature</code> header with a timestamp + HMAC-SHA256 over the body. To
              verify:
            </p>
            <Code>{`// X-PC-Signature: t=1717428100,v1=8a8b…
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, signatureHeader, rawBody) {
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  const expected = createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest('hex');
  return timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}`}</Code>
            <p>
              Replied non-2xx responses are kept in our delivery log and can be replayed manually
              by our team. Always reply <code>2xx</code> as fast as you can — we time out after 8
              seconds. Acknowledge first, process asynchronously.
            </p>
          </Section>

          <Section id="data-model" title="Data model">
            <h3>Order</h3>
            <table className="api-table">
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td><code>id</code></td><td>string</td><td>Our internal id</td></tr>
                <tr><td><code>number</code></td><td>string</td><td>Human-readable, e.g. <code>PCAPI-LK7Z2X-3491</code></td></tr>
                <tr><td><code>externalRef</code></td><td>string?</td><td>The reference you supplied at create time</td></tr>
                <tr><td><code>projectId</code></td><td>string?</td><td>Our internal project id, set when you submitted with <code>projectId</code></td></tr>
                <tr><td><code>status</code></td><td>enum</td><td><code>PENDING | PAID | IN_PRODUCTION | SHIPPED | DELIVERED | CANCELLED | REFUNDED</code></td></tr>
                <tr><td><code>paymentStatus</code></td><td>enum</td><td><code>PENDING | AUTHORIZED | CAPTURED | FAILED | REFUNDED</code></td></tr>
                <tr><td><code>proofStatus</code></td><td>string?</td><td><code>null</code> when no proof is required, else <code>requested | awaiting_approval | approved | changes_requested</code>. Held from production/shipping until <code>approved</code>.</td></tr>
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
                <tr><td><code>files[]</code></td><td>array</td></tr>
              </tbody>
            </table>
            <h3>OrderItemFile</h3>
            <table className="api-table">
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td><code>uploadId</code></td><td>string</td><td>The MediaFile id from <code>POST /uploads</code></td></tr>
                <tr><td><code>url</code></td><td>string</td><td>Token-protected download URL</td></tr>
                <tr><td><code>filename</code></td><td>string</td><td>Original name you uploaded with</td></tr>
                <tr><td><code>size</code></td><td>integer</td><td>Bytes</td></tr>
                <tr><td><code>mimeType</code></td><td>string</td><td>e.g. <code>application/pdf</code></td></tr>
                <tr><td><code>contentHash</code></td><td>string</td><td>SHA-256 hex of the file</td></tr>
                <tr><td><code>purpose</code></td><td>string?</td><td>Free-form: <code>cover</code>, <code>interior</code>, etc.</td></tr>
                <tr><td><code>notes</code></td><td>string?</td><td>Free-form integrator notes</td></tr>
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

// 3. Upload the print files (multipart, no auto-set Content-Type so fetch
//    fills in the correct boundary).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { File, FormData } from 'node-fetch';

async function uploadPrintFile(localPath, purpose) {
  const buf = readFileSync(localPath);
  const hash = createHash('sha256').update(buf).digest('hex');
  const fd = new FormData();
  fd.set('file', new File([buf], localPath.split('/').pop(), { type: 'application/pdf' }));
  fd.set('purpose', purpose);
  const r = await fetch(BASE + '/uploads', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'X-Upload-Content-Hash': hash },
    body: fd,
  });
  if (!r.ok) throw new Error(\`\${r.status} \${await r.text()}\`);
  return (await r.json()).upload;
}

const cover = await uploadPrintFile('./cover.pdf', 'cover');
const interior = await uploadPrintFile('./interior.pdf', 'interior');

// 4. Register the campaign as a project so paid revenue rolls up by creator
//    (optional — passing projectId on the order auto-creates this anyway)
await api('/projects', {
  method: 'POST',
  body: JSON.stringify({
    externalProjectId: 'kickstarter-acme-issue-1',
    title: 'Acme Comics #1',
    url: 'https://www.kickstarter.com/projects/acme/issue-1',
    creatorName: 'Jane Doe',
    creatorEmail: 'jane@acmecomics.com',
  }),
});

// 5. Submit the print order. Ship to the CREATOR (they fulfill to backers).
//    We default to generating a PayPal approval URL on the response.
const { order, payment } = await api('/orders', {
  method: 'POST',
  body: JSON.stringify({
    externalRef: 'kickstarter-acme-issue-1-printrun',
    projectId: 'kickstarter-acme-issue-1',
    email: 'jane@acmecomics.com',
    customerName: 'Jane Doe',
    shippingAddress: {
      firstName: 'Jane', lastName: 'Doe',
      line1: '123 Main St',
      city: 'San Francisco', region: 'CA',
      postalCode: '94110', country: 'US',
    },
    items: quote.items.map(i => ({
      productSlug: i.productSlug,
      quantity: i.quantity,
      options: i.options,
      files: [
        { uploadId: cover.id, purpose: 'cover' },
        { uploadId: interior.id, purpose: 'interior' },
      ],
    })),
    shippingRateId: quote.shippingOptions[0].id,
  }),
});

// 6. Forward the approval URL to the creator. They pay PayPal directly; we
//    capture and fire order.paid to your webhook when they return.
console.log('Submitted', order.number, 'for', formatMoney(order.totalCents));
console.log('Send to creator:', payment.approvalUrl);
// expires in ~3 hours; if the creator misses it, mint a fresh one:
//   await api(\`/orders/\${order.id}/payment-link\`, { method: 'POST' });

// Alternative: if you've already collected funds on your platform's side,
// skip PayPal entirely:
//   body: { ..., generatePaymentLink: false, markAsPaid: true }
// or assert payment after the fact:
//   await api(\`/orders/\${order.id}/mark-paid\`, {
//     method: 'POST',
//     body: JSON.stringify({ reference: 'wire-2026-04-29' }),
//   });`}</Code>
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
      <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <a
          href="#request-access"
          className="btn"
          style={{ textDecoration: 'none' }}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById('request-access');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              const firstInput = el.querySelector('input');
              if (firstInput instanceof HTMLInputElement) {
                setTimeout(() => firstInput.focus(), 350);
              }
            }
          }}
        >
          Request API access
        </a>
        <a href="#getting-started" className="btn secondary" style={{ textDecoration: 'none' }}>
          Read the docs
        </a>
      </div>
    </div>
  );
}

function Sidebar() {
  const items = [
    ['overview', 'Overview'],
    ['request-access', 'Request access'],
    ['getting-started', 'Getting started'],
    ['auth', 'Authentication & scopes'],
    ['request-signing', 'Request signing'],
    ['rate-limits', 'Rate limits & idempotency'],
    ['catalog', 'Catalog'],
    ['pricing', 'Pricing'],
    ['shipping', 'Shipping'],
    ['projects', 'Projects'],
    ['orders', 'Orders'],
    ['payments', 'Payments'],
    ['uploads', 'Uploads'],
    ['webhooks', 'Webhooks'],
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

const ALL_SCOPES = [
  'catalog:read',
  'pricing:read',
  'shipping:read',
  'orders:read',
  'orders:write',
  'uploads:read',
  'uploads:write',
];

function RequestAccessForm() {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [platform, setPlatform] = useState('kickstarter');
  const [website, setWebsite] = useState('');
  const [scopes, setScopes] = useState<string[]>([...ALL_SCOPES]);
  const [estimated, setEstimated] = useState('');
  const [message, setMessage] = useState('');
  const [website2, setWebsite2] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (success) {
    return (
      <div
        style={{
          background: '#d4f5dc',
          border: '1px solid #1e6b32',
          borderRadius: 8,
          padding: '1.25rem',
        }}
      >
        <h3 style={{ margin: '0 0 .25rem', color: '#1e6b32' }}>Request received</h3>
        <p style={{ margin: 0 }}>{success}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
          const r = await api.post<{ message: string }>('/v1/partner-applications', {
            name,
            contactName,
            contactEmail,
            platform: platform || undefined,
            website: website.trim() || undefined,
            scopes,
            estimatedMonthlyOrders: estimated ? Number(estimated) : undefined,
            message: message.trim() || undefined,
            website2: website2 || undefined,
          });
          setSuccess(r.message);
        } catch (err: any) {
          setError(err.message || 'Submission failed');
          setSubmitting(false);
        }
      }}
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.25rem',
        display: 'grid',
        gap: '.75rem',
      }}
    >
      <p style={{ margin: 0, color: 'var(--muted)' }}>
        Tell us about your project and what you'd like to do with the API. We'll review and email
        you back within 1–2 business days. On approval you'll receive a one-time email with your
        bearer key and HMAC signing secret.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem' }}>
        <FormField label="Project / partner name" required>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Comics on Kickstarter"
            style={fieldInput}
          />
        </FormField>
        <FormField label="Platform">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={fieldInput}>
            <option value="kickstarter">Kickstarter</option>
            <option value="indiegogo">Indiegogo</option>
            <option value="backerkit">BackerKit</option>
            <option value="gamefound">Gamefound</option>
            <option value="zoop">Zoop</option>
            <option value="publisher">Publisher</option>
            <option value="other">Other</option>
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <FormField label="Your name" required>
          <input
            required
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Jane Doe"
            style={fieldInput}
          />
        </FormField>
        <FormField label="Your email" required>
          <input
            required
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="dev@your-platform.com"
            style={fieldInput}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem' }}>
        <FormField label="Project / campaign URL">
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://www.kickstarter.com/projects/…"
            style={fieldInput}
          />
        </FormField>
        <FormField label="Est. orders / month">
          <input
            type="number"
            min={1}
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            placeholder="e.g. 500"
            style={fieldInput}
          />
        </FormField>
      </div>

      <FormField label="Scopes requested">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          {ALL_SCOPES.map((s) => {
            const on = scopes.includes(s);
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
                    setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s));
                  }}
                />
                <code>{s}</code>
              </label>
            );
          })}
        </div>
      </FormField>

      <FormField label="Tell us about your project">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="What products are you fulfilling? When does the campaign close? Any other context that helps us provision the right scopes."
          style={{ ...fieldInput, fontFamily: 'inherit' }}
        />
      </FormField>

      {/* Honeypot — hidden from users via inline style; bots tend to fill all fields */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website2}
        onChange={(e) => setWebsite2(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
      />

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '.5rem .75rem', borderRadius: 4 }}>
          {error}
        </div>
      )}

      <div>
        <button
          type="submit"
          className="btn"
          disabled={submitting || !name.trim() || !contactName.trim() || !contactEmail.trim() || scopes.length === 0}
        >
          {submitting ? 'Submitting…' : 'Request API access'}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: '#b91c1c' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '.5rem .65rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: '.95rem',
};
