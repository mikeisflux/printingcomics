# Philbo Database Blueprint

Status: logical schema for review; not yet an executable migration
Database: PostgreSQL through Supabase

This blueprint translates the existing Philbo workflows into relational records. It intentionally avoids selecting values for business decisions not settled in `PHILBO_MASTER_BRIEF.md`.

## Conventions

- Primary keys use UUIDs unless a human-readable document number is required.
- Money is stored as integer cents; never floating-point values.
- Rates are stored as exact decimal values.
- Dates use `date`; events and audit entries use timezone-aware timestamps.
- Records referenced by financial or audit history are archived rather than physically deleted.
- User credentials remain in Supabase Auth and are never stored in public application tables.
- Every mutable table includes `created_at` and `updated_at`.
- Important status fields use database constraints or enums defined through migrations.

## Identity and organizations

### `profiles`

One application profile per Supabase Auth user.

Key fields: `user_id`, display/contact names, login-facing email copy, account status, invitation status, session revocation timestamp, notification preferences.

### `organizations`

Represents Philbo, a publisher, or a retailer.

Key fields: `id`, `organization_type`, company name, legal name, website, tax identifier encryption/reference, account status.

### `organization_memberships`

Connects users to organizations and supports multiple authorized contacts.

Key fields: `organization_id`, `user_id`, membership status, title, primary-contact flag.

### `user_roles`

Stores one or more application roles per user.

Key fields: `user_id`, role, active flag, granted by, granted at, revoked at.

### `permission_overrides`

Stores explicit owner-approved permission additions or removals.

Key fields: `user_id`, permission code, enabled, reason, granted by, timestamps.

### `contacts` and `addresses`

Reusable organization contacts and mailing, shipping, printer, accounting, and fulfillment addresses. Each record has a type and organization owner.

### `publisher_profiles`

Publisher-only operational settings, including commission rate, payout preferences, fulfillment and printer information. Publishers can read but cannot modify protected commission or payment fields.

### `retailer_profiles`

Retailer-only operational settings, including assigned tier, resale-certificate metadata, approval state, return allowance, and shipping preferences. Retailers cannot change their own assigned tier.

## Applications and invitations

### `account_applications`

Publisher, retailer, and POD applications with submitted form data, review status, reviewer, decision timestamps, and notes.

### `account_application_files`

Private file metadata attached to an application. Actual objects live in private Storage.

### `account_invitations`

Invitation lifecycle metadata only. Supabase Auth owns invitation and password credentials.

## Catalog

### `catalog_cycles`

Key fields: catalog date, FOC date, in-store date, cycle status, publisher-open flag, retailer-open flag, download-enabled flag, lock/reopen metadata.

The three dates are selected as one cycle. Publishers do not type independent FOC or in-store dates.

### `titles`

Key fields include every source CSV field required by the master brief, plus publisher organization, catalog cycle, status, fulfillment method, PHILBO ID, pricing, approval, scheduling, publication, and archive metadata.

Required invariants:

- PHILBO ID is unique.
- PHILBO ID derives from normalized series code and the final five UPC digits while editable.
- Only `Live` titles appear publicly.
- Approval and publication are separate timestamps/actions.
- Protected edits after approval require Admin review.
- Every title has exactly one fulfillment method.

### `title_files`

Versioned metadata for downloadable covers, cover print PDFs, interior print PDFs, marketing images, and additional assets.

Key fields: title, file type, storage object path, original filename, MIME type, size, checksum, version, review status, uploader, approval metadata, superseded record.

### `title_status_history`

Append-only history for title submissions, requested changes, approval, scheduling, publication, unpublication, and archive actions.

### `catalog_imports` and `catalog_import_rows`

Preserve source file metadata, every source column, mapping results, duplicate flags, missing-data flags, publisher-match confidence, and Admin resolution. Imports never overwrite records silently.

### `catalog_exports`

Records cycle, audience, retailer tier or recipient scope, generation time, source version, title count, checksum, and generated object path.

## Pricing

### `retailer_tiers`

Admin-controlled spend thresholds, discount rates, return allowances, effective dates, and active status.

### `pod_pricing`

Admin-controlled page-count pricing with interior and cover configuration, publisher cost, effective dates, active status, and override rules.

### `title_price_history`

Tracks MSRP changes and protected pricing inputs used for orders and reports.

## Retailer orders

### `orders`

Key fields: retailer organization, order number, catalog cycle, status, payment status, currency, subtotal, credits, shipping, tax, total, placement and payment timestamps.

### `order_items`

Immutable commercial snapshot of title, publisher, fulfillment method, quantity, MSRP, retailer tier, discount, wholesale unit price, and line total at order time.

Order totals and prices are calculated on the server. Paid quantities remain preserved when FOC locks.

### `payments` and `payment_events`

Store provider identifiers, amounts, status, idempotency keys, and webhook history. No card numbers or security codes are stored.

## Purchase and production orders

### `purchase_orders` and `purchase_order_lines`

Used only for Publisher Fulfilled titles. Official records are finalized after FOC closes and preserve the relevant commercial snapshot. Retailer identities are excluded from publisher-facing documents.

### `production_orders`

Used only for Philbo POD titles. Stores retailer-fulfillment quantity, publisher add-on quantity, total production quantity, file references, specifications, costs, deadline, and production status.

### `production_order_events`

Append-only production and preflight status history, notes, actor, and timestamps.

### `publisher_print_orders`

Separate publisher print requests when no active Production Order exists.

### `publisher_copy_requests`

Tracks add-on quantities, calculated printing charges, payment choice, payout reservation, and protection against duplicate deductions.

## Inventory and fulfillment

### `inventory_items`

One inventory position per title and location/ownership combination.

### `inventory_movements`

Append-only receipts, reservations, releases, damage, adjustments, shipments, returns, and publisher-owned movements. Current stock is derived or transactionally maintained from these movements.

### `fulfillments` and `fulfillment_items`

Shipment batches, addresses captured at shipment time, carrier metadata, tracking, label/export status, shipped quantities, and delivery status.

## Returns and credits

### `returns` and `return_items`

Retailer return request, reason, requested and approved quantities, tier allowance snapshot, review status, disposition, and timestamps.

### `retailer_credits`

Credit ledger entries linked to approved returns or Admin adjustments. Credits are never represented only as a mutable balance.

## Publisher sales and payouts

### `publisher_sales_ledger`

Publisher-facing sales entries derived from paid retailer order items, with fulfillment method and cycle references. Publisher add-on copies are excluded.

### `payout_statements` and `payout_statement_lines`

Immutable statement snapshots containing units sold, wholesale revenue, commission, printing charges, other fees, returns/credits, and net amount due.

### `payout_transactions`

Payment date, method reference, amount, status, and reconciliation metadata without storing sensitive bank credentials.

## Audit

### `audit_events`

Append-only record containing timestamp, actor, role, action, affected record type and ID, previous value, new value, notes, session identifier, and IP information when available.

Regular Admins have read access where allowed but no update or delete permission. High-risk server functions must write the audit event in the same database transaction as the protected change.

## Initial Row Level Security matrix

| Data | Public | Publisher | Retailer | Preflight | Admin | MO.OS |
|---|---|---|---|---|---|---|
| Live public title fields | Read | Read | Read | Read | Manage | Manage |
| Wholesale pricing | None | None | Own relevant records only | None | Manage | Manage |
| Publisher profile/titles | None | Own organization | None | Production subset | Manage | Manage |
| Retailer profile/orders | None | None | Own organization | None | Manage | Manage |
| Production files/orders | None | Own relevant records | None | Assigned scope | Manage | Manage |
| Commission and payouts | None | Own read-only | None | None | Manage | Manage |
| Roles and overrides | None | None | None | None | Limited read | Manage |
| Audit events | None | Own relevant events if exposed | Own relevant events if exposed | Own activity | Operational read | Full read |

Exact policies will be executable migrations with automated positive and negative tests. No table will be exposed to browser access before its policies exist.

## First executable migration scope

The first migration should include only the vertical-slice foundation:

1. Profiles, organizations, memberships, roles, and overrides
2. Publisher profiles and contacts/addresses
3. Catalog cycles, titles, title files, and status history
4. Audit events
5. Storage buckets and policies needed for title submissions
6. Public-catalog read model or security-invoker view

Orders, payments, official documents, inventory, returns, and payouts should follow after the publisher-title workflow passes staging acceptance tests.
