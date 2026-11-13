# Printing Comics

Self-hosted storefront + admin (replaces the old WordPress/WooCommerce site).
Express API + React 19/Vite SPA + Prisma + PostgreSQL, as an npm-workspaces monorepo.

## Repo layout

Run `npm` commands from the repo root unless noted.

- `server/` — Express API (TypeScript, ESM)
  - `src/routes/` — HTTP routes (`cart.ts`, `checkout.ts`, `admin/`, `v1/` = partner/crowdfunding API)
  - `src/lib/` — shared logic (`pricing.ts`, `easypost.ts`, `claude.ts`, `api-keys.ts`, …)
  - `src/generated/prisma/` — generated Prisma client (gitignored; created by `prisma generate`)
  - `dist/` — compiled output (`node server/dist/index.js`)
- `web/` — React 19 + Vite SPA — storefront + `/admin`
  - `src/pages/`, `src/components/`, `src/lib/`; `dist/` — built static assets
- `prisma/` — `schema.prisma`, `migrations/`, `seed.ts` (base), `seed-cws.ts` (configurator products)
  - `pricing/cws-pricing.json` — pricing data extracted from the discount-log spreadsheets
- `comic_discount_log.xlsx`, `graphic_novel_discount_log.xlsx` — source-of-truth pricing
- `deploy/nginx.conf`, `ecosystem.config.cjs` (pm2)
- `siteold/` — archived old site; reference only, do not modify
- `pod/` — a copy of the PHILBO portal (`mauramariepowers-tech/philbo-portal`, its
  own Node/HTML app); not part of the npm workspaces or the build. What it is
  and how to fold it in: `docs/philbo-portal-integration.md`. **Do not run or
  deploy the Philbo app.** Treat `pod/` as a specification plus a bag of
  pure-logic helpers, sort out rights, and build on our own stack.

## Prerequisites

- Node 20+ (Prisma 7 prefers 22+; on 20 you'll see a harmless `EBADENGINE` warning)
- PostgreSQL (running directly, not Docker)
- `poppler-utils` (`pdftoppm`/`pdfinfo`) — renders PDF page previews; `sudo apt install -y poppler-utils`
- `.npmrc` already sets `legacy-peer-deps=true` (React 19 / react-three peer conflicts)

## Setup & build (from repo root)

```bash
cp -n .env.example .env   # MUST exist before install: postinstall runs `prisma generate`
npm install               # installs the server + web workspaces
npm run build             # prisma generate -> server tsc -> web tsc + vite build
npm run dev               # API :4000, storefront/admin :5173
```

Typecheck only: `npm --workspace server run typecheck`, `npm --workspace web run typecheck`.

## Database

```bash
npm run db:migrate -- --name <name>  # create + apply a migration
npm run db:push                      # push schema without a migration
npm run db:seed                      # base seed
npm run db:seed:cws                  # (re)create configurator products from cws-pricing.json
npm run db:studio                    # Prisma Studio
```

`DATABASE_URL` and all bootstrap config live in the root `.env`; see `.env.example`.

## Gotchas

- `.env` must exist **before `npm install`** — the `postinstall` hook runs
  `prisma generate`, which errors out without `DATABASE_URL`.
- Building does not need a running database; `prisma generate` only reads the schema.
- Production runs from `/opt/printingcomics` (pm2 + nginx; the botblock scripts
  read `/opt/printingcomics/.env`).
- Shipping is quoted per box with the packer in `server/src/lib/auto-pack.ts`
  (shared by checkout and fulfillment Auto-pack). A `StockPool` doubles as a
  packing family: its listings' packs are counted together into the pool's
  boxes (typed on the pool, else derived from each listing's own box and
  `unitsPerItem`). With `trackUnits` off the pool is packing-only and each
  listing keeps its own stock (the Comic Armor packs). Customers pay EasyPost's
  billed `rate` per box plus the box cost (Settings → Shipping); the quote is
  stored on `Order.shippingQuote`. Carrier codes stay raw in ids and on
  `Shipment`; `lib/carriers.ts` turns them into "UPS Ground" everywhere shown.
- "Request new file" on an order line (`server/src/lib/file-requests.ts`): a
  `MediaRequest` per file (`orderItemId` + `kind` + `reasons`), one email with
  the reasons, what to send, and the trim-size template for size/bleed reasons;
  it closes itself when that slot gets a newer upload (`lib/print-files.ts`).
  A print-file spot holds only its newest file: the rejected file is deleted
  when the request goes out, a replacement deletes what it replaced, and
  `pruneSupersededPrintFiles` (run on upload and when staff open the order)
  tidies older orders. The item's upload option is cleared with the file so the
  backfill cannot link it back.
- Staff-placed orders (`/admin/orders/new`) go through `server/src/lib/manual-order.ts`:
  the same pricing engine, packer and coupon rules as checkout, plus a per-line
  price override. Payment is a pay link (the customer pays on
  `/order/:number?t=…&pay=1`, routes in `routes/orders.ts`), "already paid"
  with a method + reference, or a comp. `Order.source` is `"admin"` for these.

- Distribution (`/distribution`, `/partner`, `/retailer`, `/admin/pod`):
  publishers (a `Partner` whose users carry `partnerId`) list books (`Listing`,
  one per cover; `catalogKey` = SERIESCODE-last5(UPC)); staff review them;
  a `CatalogCycle` publishes a snapshot (`CatalogCycleItem`) and each approved
  listing becomes a flat-priced storefront `Product` (slug `pod-<key>`, no
  options, no customer files); comic shops (`Retailer`, users carry
  `retailerId`) order at MSRP × tier (`lib/pod/wholesale.ts`, mirrored in
  `web/src/lib/wholesale.ts` — keep in step, and keep it apart from the
  configurator engine); locking the cycle at FOC raises `ProductionOrder`s
  (we print; print charge from `estimatePrintCost` via our own products),
  `PurchaseOrder`s (publisher ships) and `PartnerLedgerEntry` rows;
  `PayoutStatement`s sweep the ledger. Print PDFs are preflighted with
  `pdfinfo` on upload (`lib/pod/preflight.ts`). Settings live in one JSON
  blob `pod.settings` (`lib/pod/settings.ts`). Admin permissions: `pod`
  (the section) and `preflight` (the price-free file desk,
  `/admin/pod/preflight`); a STAFF account holding only those is a "Distribution
  admin": the sidebar shows just that section and `/admin` redirects into
  it. The program was launched as "Print On Demand"; `/print-on-demand/*`
  redirects to `/distribution/*` and the admin URL stays `/admin/pod`. `npm run db:seed:pod` (run by every deploy) creates one
  (`POD_ADMIN_EMAIL`/`POD_ADMIN_PASSWORD`, default
  mauramariepowers@gmail.com / password) with `passwordSetAt: null`, so the
  first login is forced through `/account/setup`.
  Wording: it is always "publisher", never "partner", anywhere a person can
  see (the shared Prisma `Partner` model keeps its name because the
  crowdfunding API uses it). The publisher portal is `/publisher`
  (`/partner` redirects). Beyond the core loop the section also has:
  publisher directory + applications + portal invitations
  (`/admin/pod/publishers`), wholesale orders worked inside the section
  (`/admin/pod/orders`, pay link / mark paid / shipping charge),
  fulfillment with weights, tracking and a shipping CSV
  (`/admin/pod/fulfillment`), consignment inventory (`fulfillment:
  CONSIGNMENT`, `Listing.inventory*`, pulled at FOC lock), returns and
  damage claims that become shop store credit (`RetailerReturn`,
  `Retailer.creditCents`, charged to the publisher ledger), the files desk
  with versions and bulk review (`/admin/pod/files`), barcodes
  (`Barcode`: load blocks with computed check digits, reserve per
  publisher, assign to a listing; `lib/pod/barcodes.ts` also renders the
  EAN-13/UPC-A SVG at `/api/pod/barcode/:code.svg`), analytics, the
  activity log, a CSV listing importer, a printable catalog per cycle, and
  the Publisher Handbook at `/distribution/handbook` (file specs defer
  to `/resources/templates` and `/resources/file-prep`).

## Configurator pricing

- `server/src/lib/pricing.ts` is the authoritative pricing engine;
  `web/src/lib/pricing.ts` is a client-side mirror — **keep the two in sync**.
- Page / cover / embellishment prices live in `prisma/pricing/cws-pricing.json`
  (mirrors the `*_discount_log.xlsx` spreadsheets). `prisma/seed-cws.ts` compiles
  that JSON into each product's `pricingConfig`.
- Papers the store doesn't offer stay in the JSON (and keep their prices in
  `pricingConfig`) but are left out of the option tiles by `HIDDEN_COVER_TYPES`
  in `seed-cws.ts`, and by the commented-out Interior Paper rows there. Today the
  store sells 80# gloss cover ("Standard Gloss") + the specialty covers, and
  80# gloss text ("Gloss") inside. Edit those two spots to offer a paper again.
- After editing pricing data or `seed-cws.ts`, existing products keep their old
  `pricingConfig` until re-seeded. `npm run deploy` does this automatically —
  it hashes `seed-cws.ts` + `prisma/pricing/*.json` and re-runs `db:seed:cws`
  whenever that differs from the last successful seed (tracked in the
  gitignored `.deploy-state`). Locally, run `npm run db:seed:cws` by hand.
