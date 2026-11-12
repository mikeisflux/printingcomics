# Philbo core solicitation workflow audit

Date: 2026-08-25

## Outcome

The existing application already uses one `philbo_titles` record per sellable cover/SKU. The public catalog, retailer catalog, ordering, catalog-cycle tools, and CSV exporter all read that same collection. There is no separate website-product database or manual catalog database in the browser prototype.

The catalog bridge uses two deliberate decisions: Admin approval makes a title eligible for the catalog, and publishing the catalog cycle atomically snapshots all eligible SKUs. The snapshot—not a second copy of the book data—is the single membership list used by the public storefront, retailer catalog, ordering, and CSV.

## Existing implementation preserved

- Publisher solicitation: five-step form in `src/pages/PublisherPortal.jsx`.
- Source record: `philbo_titles` through `src/firebase-mock.js`.
- Catalog cycles and inherited catalog/FOC/in-store dates.
- Unique PHILBO ID validation and one title record per cover variant.
- Admin review queue and title review modal.
- Public product grid and product-detail routes.
- Retailer tier pricing, cart, order, FOC locking, and catalog downloads.
- Cycle and all-cycle CSV export.
- Role guards that isolate publisher records and restrict approval to Admin/MO.OS.
- Supabase production schema for `titles`, `catalog_cycles`, history, RLS, and file records.

## Bridge implemented in this pass

1. `Approved`, `Scheduled`, and `Live` are eligible lifecycle states on one authoritative title record.
2. Publishing a Catalog Cycle creates one versioned SKU snapshot. Public pages, retailer ordering, catalog counts, and the canonical CSV all consume that exact snapshot.
3. Retailer orderability is calculated separately from public visibility using the cycle ordering flag, FOC date, cycle lock, title lock, and reorder rule.
4. Order creation revalidates the authoritative title and cycle instead of trusting client cart data.
5. Admin dashboard explicitly counts new solicitations requiring review.
6. Review cards show publisher, title, cycle, FOC, in-store date, and file/art availability.
7. Admin review now exposes editable authoritative listing metadata and the required decisions: Approve, Needs Revision, Reject.
8. Needs Revision and Rejected records are excluded from public, retailer, and CSV readers.
9. Publishers can no longer silently edit an approved/published record.
10. Supabase migrations align the production status/RLS foundation, add Rejected, and provide one transactional `publish_catalog_cycle` operation plus a single catalog-publication membership table.
11. The homepage now represents all four service areas; Kickstarter Fulfillment is purple and non-functional with `COMING SOON`.

## Current data-source map

```text
PublisherPortal solicitation
        |
        v
philbo_titles / public.titles
        |
        v
Admin review and approval
        |
        v
Catalog Cycle publication snapshot
        |
        +--> PublicCatalog / CatalogProductDetail
        +--> RetailerPortal / order validation
        +--> Admin catalog renderer
        +--> Canonical Catalog CSV and retailer-priced order form
```

## Production-readiness boundary

The Vite app still routes catalog writes through the browser-storage prototype in `src/firebase-mock.js`. Supabase is configured for identity and has a strong schema/RLS foundation, but the UI does not yet perform production title submission, review, file upload, notification, or order writes through Supabase APIs. Browser `localStorage` is not a shared or durable production database.

Before launch, the next backend phase must replace these mock calls with authenticated Supabase queries/RPCs, create durable admin notifications, connect private Storage objects, and run the database integration tests against a staging project. Stripe is not required for that catalog bridge and remains deferred until verification and Test Mode are available.

The current publisher form captures the core catalog and SKU fields, cover art, creator credits, copy, dates, pricing, dimensions, and file names. A later form pass still needs dedicated publisher-facing controls for explicit genre labels, incentive ratio/rules, two additional catalog-image URLs, and publisher-logo selection; Admin can review/correct those fields now, and the authoritative record/export model preserves them.

## Intentionally deferred

- Automated PDF catalog generation.
- Stripe payment integration.
- Full Kickstarter fulfillment workflow.
- Production email delivery and admin notifications outside the in-app queue.
- Publisher-proposed revisions to already-approved records as a separate draft overlay; the current safe behavior blocks silent edits and directs the publisher to Admin review.
- Full homepage 3D visual redesign. Existing real Philbo assets were preserved.
