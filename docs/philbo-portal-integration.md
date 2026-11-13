# PHILBO portal (`pod/`) — what it is and how to fold it into Printing Comics

Status: proposal for review · Written 2026-11-13 · Source: `pod/` as copied from
`mauramariepowers-tech/philbo-portal` main `b56459f` (2026-09-16, 184 files).

`pod/` is the "Philbo Operations Hub" — a distribution portal built for a
competitor (Philbo Distribution / Philbo POD) and handed to us when they did not
pay the developer. This document says what is actually in it, what is worth
taking, how each piece maps onto our Express + Prisma + React 19 stack, and a
phased plan. The short version is at the end under **Recommendation**.

---

## 1. What the program is

Philbo Distribution is a small-press comics **distributor**: publishers solicit
titles into a monthly catalog, comic shops (retailers) order at a wholesale
discount before a Final Order Cutoff (FOC) date, Philbo either forwards the
order to the publisher (Publisher Fulfilled) or prints it themselves (Philbo
POD), and publishers get a payout statement after each cycle. The portal is the
software for all of that, plus a small print-on-demand ordering page for direct
POD customers.

Five portals, one React app (`pod/src/App.jsx` picks a portal by role):

| Portal | Role | What it does |
|---|---|---|
| **Admin** (`AdminPortal.jsx`, 3.3k lines) | `moos` (owner) / `admin` | Review and approve solicited titles, run catalog cycles, lock FOC, import catalog CSVs, manage publishers/retailers/applications, generate Purchase Orders and Production Orders, payout statements, returns, audit log, attention queue |
| **Publisher** (`PublisherPortal.jsx`, 2.4k) | `publisher` | Five-step title solicitation form (metadata, cover art, print files, dates, pricing), title history, sales/payout view, request extra copies |
| **Retailer** (`RetailerPortal.jsx`, 1.6k) | `retailer` | Browse the current cycle at tiered wholesale pricing, cart/order with FOC rules, incentive-variant eligibility, CSV catalog export + order-form upload, returns, standing orders, publisher follows |
| **POD** (`PodPortal.jsx`, 366) | `pod` (mapped to publisher UI) | Direct print ordering: comic book by page count, B&W/color, public vs crowdfunding price table, 5% off for carrying the Philbo POD logo, resale-certificate upload |
| **Preflight** (`PreflightPortal.jsx`) | `preflight` | Production-file review queue with a deliberately price-free job record (`production_jobs`) |
| Public | anonymous | `/catalog` product grid + product detail, publisher/retailer/POD application forms, home page |

Business rules that matter (from `pod/PHILBO_MASTER_BRIEF.md`):

- Retailer tiers by MSRP order subtotal: Tier I 40% off, Tier II 45% (from $101), Tier III 50% (from $251). `pod/src/lib/retailer-order.js`.
- Publisher commission 5% (POD titles) / 10% (publisher-fulfilled), 15% on consignment inventory.
- One catalog cycle = catalog date + FOC date + in-store date; publishers pick a cycle, never type dates. FOC lock freezes quantities; Admin can reopen.
- PHILBO ID = `SERIESCODE-last5UPC`, unique, one title record per cover/SKU.
- Incentive variants: "1:10" ratio parsed from the cover description; eligibility computed from qualifying title quantities (`incentive-variants.js`).
- POD page-count pricing table, $2.10–$4.65 per copy depending on page count, color and public/crowdfunding schedule (`PodPortal.jsx`).
- Official documents: Purchase Order (to publisher, retailer identities hidden), Production Order (to Philbo POD), Payout Statement (immutable snapshot).

## 2. State of the code — be clear-eyed

**It is a prototype with a half-built backend. It does not run against a real database today.**

- **Data layer is browser `localStorage`.** Every page reads and writes through `pod/src/firebase-mock.js` (4k lines of seed data, migrations-by-flag and collection helpers keyed `philbo_users`, `philbo_titles`, …). Nothing is shared between browsers or durable. `docs/CORE_SOLICITATION_WORKFLOW_AUDIT.md` says it plainly: "Browser localStorage is not a shared or durable production database."
- **Supabase backend exists as SQL, not as wired UI.** `pod/supabase/migrations/` defines 46 tables (organizations, profiles, user_roles, catalog_cycles, titles, title_files, sales_orders, invoices, payment_transactions, publisher_purchase_orders, production_jobs, pod_orders, return_requests, account_credits, inventory, fulfillments, audit_events, email_outbox, stripe_webhook_events…), Row Level Security policies, and ~30 PL/pgSQL functions (`publish_catalog_cycle`, `calculate_publisher_payout`, `create_retailer_checkout_draft`, `finalize_stripe_checkout`, `review_return_request`…). Only auth/session, the attention queue, retailer profile and a few reads go through `src/lib/backend.js`; title submission, orders, uploads and approvals still hit the mock. The launch switch `VITE_USE_SUPABASE_BACKEND` is documented as "do not enable while any live screen still writes to firebase-mock.js" (`docs/BACKEND_COMPLETION.md`).
- **Four Supabase Edge Functions** (Deno/TypeScript): `admin-user-access` (invitations, suspend/restore), `create-stripe-checkout`, `stripe-webhook`, `google-drive-upload` (archives files to a Drive folder). Payments are gated off (`VITE_ENABLE_PAYMENTS=false`) and were never tested live.
- **No tests.** `package.json` references `tests/*.mjs`; the directory is not in the repo.
- **Stack mismatch with ours.** React 18 + Vite 5, plain `.jsx` (no TypeScript), inline-style components, hash/pathname routing by hand (no router), pnpm, `pdf-lib` for preflight, Supabase JS client. We are React 19 + TypeScript + React Router + Express + Prisma.
- **Also shipped:** `philbo-operations-hub.html` (4.8 MB single-file build made by `assemble.py`), `public/assets/philbo-app.bundle.js` (4.6 MB), a 6.3 MB July–Oct 2026 catalog PDF, cover art, brand videos, and a 2.9 KB `server.js` static host that also serves an "under construction" page for `philbopod.com`.
- Size: ~17k lines of JS/JSX, 10k of it in the three big portal pages.

## 3. Things in `pod/` we should deal with before anything else

1. **Rights.** Everything was authored by one developer (single git author) for Philbo. "The developer gave it to us because the client didn't pay" is a story, not a licence. There is no LICENSE file and `package.json` is `"private": true`. Before any of this code ships under our name, get a short written assignment or licence from the developer covering the code, and keep clear of Philbo's **brand assets**, which the developer almost certainly does not own: `public/assets/brand/*` (logos, dragon, "MO.OS"), `portal-headings/*`, the Philbo catalogs and `philviews-*` covers, the publisher handbook PDF, the POD template PDFs, the `.mp4/.webm/.gif` videos.
2. **Other people's data is in the repo.** `pod/src/data/publisher-contacts.json` holds 58 publisher rows with names, emails, phones and mailing addresses lifted from a Google Form; the three catalog JSONs hold 72 + hundreds of title rows with UPCs, prices and creator credits from Philbo's catalogs. These are Philbo's publishers' details, not ours. We should not keep them in a repo we deploy from, and we must not mail or import them as leads. Delete the JSON files (and the `importBundledCatalog` seed code that reads them) in the first cleanup commit.
3. **Live identifiers.** `.env.example` ships real Google Drive folder IDs; `supabase/config.toml` names Philbo's Supabase project (`sasrmqpyqvimnmfxtggb`); `philviews-catalogs.js` links to `philbodistribution.com`; `server.js` special-cases `philbopod.com`. No secrets were found (scan of keys/JWTs came up empty), but every one of these should go.
4. **Weight.** ~25 MB of binaries (PDFs, bundle, videos) now sit in our repo history. Drop the built bundles and media in the cleanup commit; the git history keeps the original copy if we ever need to look back.

## 4. What is actually worth taking

Judged against what Printing Comics already has (configurator pricing, cart/checkout, print-file uploads and proofing, file requests, EasyPost packing/shipping, partner API with API keys, staff-placed orders, email, SEO, Shopify/eBay tooling):

### Worth it

| Piece | Why | Where it lives in `pod/` |
|---|---|---|
| **Retailer wholesale program** — tiers, FOC cycles, incentive variants, CSV catalog + order-form upload, standing orders | This is a whole business line we do not have: selling small-press books to comic shops at 40–50% off MSRP. The ordering rules are well thought through and encoded. | `lib/retailer-order.js`, `lib/retailer-csv.js`, `lib/csv-order.js`, `lib/incentive-variants.js`, `lib/catalog-workflow.js`, `RetailerPortal.jsx`, SQL `sales_orders`, `standing_order_lines`, `validate_sales_order_*` |
| **Publisher solicitation + catalog cycle** — title record per SKU, PHILBO-ID-style key, review states Draft → Submitted → Changes Requested → Approved → Scheduled → Live → Archived, cycle publication snapshot | Gives creators/publishers a self-serve way to list books with us and lets us run a monthly "catalog" that feeds the storefront and the retailer side. | `PublisherPortal.jsx` form, `catalog-workflow.js`, `title-validation.js`, SQL `titles`, `catalog_cycles`, `catalog_publication_items`, `publish_catalog_cycle()` |
| **Production job / preflight split** — a job record the preflight person sees with files, deadline and status but no prices, quantities or customer financials | Matches how we already keep costs behind /admin. A price-free "production job" view would let a prepress contractor work orders without seeing margins. | SQL `production_jobs`, `production_job_private`, `production_job_events`, `PreflightPortal.jsx` |
| **Client-side PDF preflight** — trim/bleed/spread/page-count checks with `pdf-lib` before upload | Catches the exact reasons we send "Request new file" emails for (wrong size, no bleed, spreads, mixed sizes, page count) *before* the file reaches us. Pure function, 200 lines, no Philbo coupling. | `lib/pdf-preflight.js` |
| **Payout statements + publisher sales ledger** — immutable statement lines, commission %, printing charges netted | Needed the moment we sell books on behalf of someone else (consignment, retailer program, crowdfunding fulfillment). | SQL `calculate_publisher_payout`, blueprint in `docs/DATABASE_BLUEPRINT.md` |
| **Returns & credits ledger** — retailer return request → review → credit entry, never a mutable balance | Good pattern; reusable for our own store credit if we ever add it. | SQL `return_requests`, `account_credits`, `review_return_request` |
| **Attention queue** — one list of "things an admin must look at" summarised per section | Our admin dashboard has counts; this is a nicer generalisation. | `lib/attention-center.js` |
| **Design docs** | The brief, blueprint and architecture docs are a decent spec of a distributor, written by someone who understood the domain. Reuse as a spec, not as code. | `PHILBO_MASTER_BRIEF.md`, `docs/*.md` |

### Not worth it

| Piece | Why not |
|---|---|
| The React app itself (pages, inline styles, hand-rolled routing, `firebase-mock.js`) | React 18 JSX against a localStorage mock; ours is React 19 TypeScript with a router, auth, and an API. Porting components one-for-one costs more than rebuilding pages on our `web/` conventions using their logic. |
| Supabase (Auth, RLS, Storage, Edge Functions) | We already have users/roles, API keys, sessions, media storage and email in Express + Prisma. Running a second database and auth system next to ours doubles ops. Take the *schema* and the PL/pgSQL *logic* as reference for Prisma models and TypeScript. |
| Stripe checkout + webhook | We are on PayPal (cart, pay links, manual orders). Skip. |
| Google Drive upload function | Our media is on disk behind nginx with `MediaFile` rows; no need. |
| POD ordering page and its price table | Our configurator already does this better (real paper/cover options, spreadsheet-driven pricing, packing, shipping). The crowdfunding vs public schedule idea is the only takeaway (see §6). |
| Brand assets, catalogs, videos, bundled HTML | Not ours, and not needed. |
| Publisher contact + catalog JSON | Not ours. Delete. |

## 5. Mapping onto Printing Comics

### 5.1 Roles and accounts

| PHILBO | Printing Comics today | Plan |
|---|---|---|
| `moos` (owner) | `Role.ADMIN` | same |
| `admin` | `Role.STAFF` | same |
| `preflight` | — | new `Role.PREFLIGHT` **or** a staff permission flag; sees production jobs only |
| `publisher` / `pod` | `Partner` (platform `"publisher"`) + `User` | a `Partner` row of kind `publisher` with a `User` login (today partners only have API keys; the `PartnerProject.creatorUserId` comment already anticipates a portal). |
| `retailer` | — | new `Retailer` model (organisation + tier + resale cert + users) |
| `organizations` / `organization_memberships` | — | fold into `Partner`/`Retailer` with a `members User[]` relation rather than a generic organisations table |

### 5.2 Catalog

| PHILBO | Printing Comics | Plan |
|---|---|---|
| `titles` (one row per cover/SKU; MSRP; publisher; cycle; fulfillment method; status; PHILBO ID) | `Product` + `ProductVariant` | A **`Listing`** model owned by a `Partner`: title metadata, MSRP, trim, page count, UPC, cycle, status, fulfillment method (`PRINTED_BY_US` / `PARTNER_SHIPS`), `catalogKey` (our version of PHILBO ID). Each approved Listing becomes a `Product` in the storefront (so cart/checkout/SEO/reviews work unchanged). |
| `title_files` (versioned cover/interior print files) | `OrderItemFile` / `MediaFile` | reuse `MediaFile`; add `ListingFile` (kind + version + review status) so the print files live with the listing, and a production order copies them onto the `OrderItem`. |
| `catalog_cycles` + `catalog_publication_items` | — | new `CatalogCycle` (catalogDate, focDate, inStoreDate, status, flags) + `CatalogCycleItem` snapshot. Publishing a cycle snapshots the eligible listings, exactly as `publish_catalog_cycle()` does. |
| `title_status_history` | `OrderStatusEvent` pattern | `ListingEvent` |
| public catalog read model | `/api/products` | a `/catalog/:cycle` storefront page listing the cycle's products |

### 5.3 Retailer ordering

| PHILBO | Printing Comics | Plan |
|---|---|---|
| `sales_orders` / `sales_order_items` (wholesale snapshot, tier, discount, FOC lock) | `Order` / `OrderItem` | reuse `Order` with `source = "retailer"`, a `retailerId`, and a `wholesale` block on the item snapshot (MSRP, tier, discount, unit wholesale). Tier is computed by `lib/retailer-pricing.ts` (port of `retailer-order.js`). FOC lock = cycle flag checked in the same place `assertOfferedOptions` runs today. |
| incentive eligibility | — | port `incentive-variants.js` as-is (pure TS). |
| CSV catalog export / order-form upload | — | port `retailer-csv.js` + `csv-order.js`; mount as `GET /api/retailer/cycles/:id/catalog.csv` and `POST …/order-upload`. |
| standing orders | — | later. |
| invoices, payment | PayPal pay link (`manual-order.ts`) | reuse the pay-link flow; retailer orders are created unpaid and paid from the order page, or marked paid by staff. Net terms later. |

### 5.4 Production

| PHILBO | Printing Comics | Plan |
|---|---|---|
| `production_jobs` (preflight-visible, price-free) | `OrderItem` + `OrderItemFile` + `Proof` + `MediaRequest` | **Don't add a table.** Add a preflight *view*: `/admin/preflight` lists order lines that have print files and are not yet approved, showing files, trim, page count, deadline and the proof/file-request tools — with prices and totals stripped from the API response for `PREFLIGHT` users. Our file-request flow already covers "changes required". |
| `production_job_events` | `OrderStatusEvent` | same |
| `pod_orders` | `Order` | already covered by the configurator and staff-placed orders |
| Production Order document (publisher add-on copies + retailer qty) | — | a `ProductionOrder` row created when a cycle's FOC closes for each `PRINTED_BY_US` listing: retailerQty + partnerAddOnQty → one internal `Order` with `source = "cycle"` priced by our engine, which then flows through fulfillment and packing as normal. |
| Purchase Order to publisher (retailer identities hidden) | — | a `PurchaseOrder` row + PDF for `PARTNER_SHIPS` listings; emailed with the magic-link pattern we use for proofs. |

### 5.5 Money to partners

| PHILBO | Printing Comics | Plan |
|---|---|---|
| `publisher_sales_ledger`, `payout_statements`, `payout_transactions` | — | `PartnerLedgerEntry` (sale, commission, printing charge, return credit, payout) and `PayoutStatement` snapshot per partner per cycle. Commission % on `Partner`. Shown in the partner portal and under `/admin/partners/:id/payouts`. |
| returns / credits | — | `RetailerReturn` + `RetailerCredit`; second phase. |

### 5.6 Preflight-before-upload

`lib/pdf-preflight.js` → `web/src/lib/pdf-preflight.ts`, run in `AccountOrder.tsx`'s upload slots (and the partner `uploads` endpoint docs). Feed the expected trim from the product's template (`templateFor` in `file-requests.ts` already knows the sizes). If it fails, show the same reason labels as `FILE_REQUEST_REASONS` so the wording matches the emails we send. This one is independent of everything else and could ship this week.

## 6. Things to borrow even if we never build the distributor

- **Preflight checks in the browser** (§5.6).
- **Crowdfunding vs public price schedule.** Philbo charged crowdfunding fulfillment more per copy. We already distinguish partner (crowdfunding) orders via the v1 API; worth a look at whether `Partner`-scoped pricing adjustments make sense, in `pricing.ts` only.
- **"Attention" queue on the admin dashboard**: one list across proofs waiting, file requests open, unpaid staff orders, partner applications, reviews pending.
- **Price-free production view** for a prepress contractor (§5.4).
- **Logo discount**: 5% off for carrying our logo/ad — we already have the `printing_comics_ad` option; theirs is the same idea.

## 7. Phased plan

**Phase 0 — Clean the copy (1 commit, do first)**
- Remove: `src/data/*.json`, `public/assets/**` media, `philbo-operations-hub.html`, `public/assets/philbo-app.bundle.js`, catalogs, `.github/workflows/supabase-database-backup.yml`, Philbo project IDs/domains in `.env.example`, `supabase/config.toml`, `server.js`, `philviews-catalogs.js`.
- Keep: `src/lib/*.js` (logic), `src/pages/*.jsx` (as reference), `supabase/migrations/*.sql` (as schema reference), `docs/`, `PHILBO_MASTER_BRIEF.md`.
- Add `pod/README.md` note: reference only, not built, not deployed; link to this doc.
- Resolve rights (§3.1) in parallel; nothing from Phase 2 onward ships until that is done.

**Phase 1 — Quick wins inside the existing app (no schema changes)**
- Port `pdf-preflight.js` to TypeScript and run it in the customer upload slots and the partner API docs.
- Admin "attention" summary on the dashboard.
- Preflight role/view: `/admin/preflight` with the price-stripped API.

**Phase 2 — Partner (publisher) portal and listings**
- Prisma: `Listing`, `ListingFile`, `ListingEvent`, `CatalogCycle`, `CatalogCycleItem`; `Partner.commissionRate`, `Partner.members`.
- Partner login (`/partner`), five-step listing form rebuilt in our components (`OptionControl`, `AddressFields`, existing upload slots), staff review queue at `/admin/listings` with Approve / Changes requested / Reject (reuse `MediaRequest` for the "changes requested" email).
- Publishing a cycle creates/updates storefront `Product`s and a `/catalog` page.

**Phase 3 — Retailer wholesale**
- Prisma: `Retailer`, `RetailerUser`, tier config in `Setting`.
- `/retailer` portal: cycle browse at wholesale, cart, FOC rules, incentive eligibility, CSV export/upload; orders land in `/admin/orders` with `source = "retailer"` and are paid by pay link or marked paid.
- FOC close job: generate `ProductionOrder`s (internal orders through our pricing engine) and `PurchaseOrder` PDFs.

**Phase 4 — Partner money**
- `PartnerLedgerEntry`, `PayoutStatement`; statements in the partner portal and admin; returns and credits.

Each phase is independently shippable; Phases 1 and 2 are the ones that pay off even if the retailer program never happens.

## 8. Risks

- **Legal**: code rights and third-party brand/data as in §3. Highest priority; cheap to fix now, expensive later.
- **Scope**: the distributor is a second business, not a feature. Phases 3–4 need sales/ops commitment (retailer onboarding, resale certificates, net terms, returns) before the code is worth writing.
- **Two pricing engines**: wholesale pricing (MSRP × tier) must stay separate from the configurator engine (`server/src/lib/pricing.ts` ↔ `web/src/lib/pricing.ts` mirror). Keep it in its own module and never let retailer discounts touch print pricing.
- **Costs stay behind /admin**: partner portal shows MSRP, wholesale and commission only; never our print cost or sheet yields. The `PREFLIGHT` view strips prices entirely.
- **Untested logic**: the SQL functions were never exercised against real data and there are no tests in the repo. Treat every ported rule as a spec and write our own API/e2e tests (the scratchpad suites for papers and file requests are the pattern).

## 9. Recommendation

Do not run or deploy the PHILBO app; it is not finished and it is the wrong stack. Treat `pod/` as a **specification plus a bag of pure-logic helpers**: clean it (Phase 0), sort out rights, ship the preflight checks and the preflight view (Phase 1) inside Printing Comics now, and build the partner listing/catalog portal (Phase 2) on our own stack. Decide on the retailer wholesale program (Phases 3–4) as a business question first; the code is the easy part.
