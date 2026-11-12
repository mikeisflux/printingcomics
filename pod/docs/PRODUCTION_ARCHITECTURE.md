# Philbo Production Architecture

Status: initial production blueprint
Last updated: July 21, 2026

This document defines the intended technical boundary for production work. `PHILBO_MASTER_BRIEF.md` remains authoritative for business rules.

## Architecture decision

Use Supabase as the production backend:

- PostgreSQL for shared operational records
- Supabase Auth for invitations, login, password reset, sessions, and optional staff MFA
- Supabase Storage for private title, production, application, and marketing files
- PostgreSQL Row Level Security for record-level access enforcement
- Database functions and Supabase Edge Functions for privileged workflow transitions, calculations, exports, and integrations

Continue using the existing React/Vite interface. Replace `src/firebase-mock.js` behind a focused data-access layer rather than rebuilding the application.

Hosting and outbound transactional email providers are not selected in this decision. They should be chosen after staging requirements, domain ownership, email volume, and access-control needs are confirmed.

## Trust boundaries

### Browser

The browser may:

- Render the interface
- Hold a short-lived authenticated session
- Submit user input
- Use the public Supabase URL and anonymous key
- Request only the rows and files allowed by database policies

The browser must not:

- Hold service-role, database, payment, or email-provider secrets
- Decide whether a user is authorized
- Calculate or finalize protected financial records
- Generate official Purchase Orders, Production Orders, or Payout Statements without a server transaction
- Change FOC locks, commission rates, retailer tiers, or protected roles directly

### Database and server functions

The database and server functions enforce:

- Organization ownership and role boundaries
- Title lifecycle transitions
- Approval versus publication separation
- FOC locking and reopening rules
- Wholesale pricing, commission, payout, and production calculations
- Official document finalization
- Append-only audit history
- Idempotent payment and webhook processing

## Identity and access model

Supabase Auth owns credentials and sessions. Application tables reference `auth.users.id`; passwords are never copied into application tables.

Supported application roles:

- `moos` — owner-level Super Admin
- `admin` — operational Admin
- `preflight` — production-file specialist
- `publisher` — scoped to assigned publisher organization records
- `retailer` — scoped to assigned retailer organization records

A user may hold more than one role where the existing workflow explicitly supports role switching. Role assignments and overrides are stored in the database and checked server-side. At least one active `moos` user must always remain.

### Permission examples

- Anonymous visitors read only `Live` public-catalog fields and MSRP.
- Publishers manage only their organizations, editable profiles, Draft titles, Changes Requested titles, and their own files and documents.
- Retailers read only their account, assigned tier, calculated pricing, orders, invoices, returns, credits, and downloadable catalogs.
- Preflight specialists access production orders and authorized production files without retailer order or financial access.
- Admins manage operational records but cannot remove or disable the final active `moos` account.
- Privileged actions create immutable audit events with before and after values.

## File-storage model

Private storage buckets are the default. Proposed buckets:

- `title-covers-public` — approved web-ready cover images only
- `title-production-private` — cover and interior print files
- `applications-private` — publisher, retailer, and POD application documents
- `marketing-assets` — public or account-scoped based on asset status
- `generated-documents-private` — Purchase Orders, Production Orders, statements, and invoices

Database records store file metadata, ownership, version, review state, checksum, and object path. Signed URLs should be short-lived. Uploading a replacement creates a new file version rather than silently overwriting an approved production file.

## Environments

### Local development

- Local Supabase stack and synthetic data
- No real customer, payment, tax, or production files
- Schema changes created as versioned migrations

### Staging

- Separate Supabase project
- Private, access-controlled deployment
- Synthetic or deliberately sanitized test records
- Complete role, workflow, migration, and recovery testing before release

### Production

- Separate Supabase project and credentials
- Real customer records and private files
- Changes applied only through reviewed migrations
- Production secrets available only to the production hosting and function environments

No environment may share database passwords, service-role keys, storage buckets, payment secrets, or webhook secrets with another environment.

## Backup and recovery policy

Minimum production policy:

- Provider-managed daily database backups
- Independent scheduled logical database export to a separate controlled location
- Separate backup/versioning plan for Storage objects because database backups contain metadata, not the uploaded file contents
- Quarterly restore test using a non-production environment
- Written recovery ownership and escalation contacts
- Recovery log recording test date, restored scope, duration, and result

Point-in-time database recovery should be enabled when live order and financial activity makes the acceptable data-loss window shorter than one day.

## Delivery sequence

1. Add migrations for identities, organizations, roles, profiles, catalog cycles, titles, and files.
2. Implement Auth invitation, password setup, reset, logout, and session revocation.
3. Implement and test Row Level Security for every initial table and storage bucket.
4. Add a data-access adapter so the UI can use either the prototype data layer or Supabase during migration.
5. Migrate the publisher-title vertical slice: invitation → title draft → upload → review → approval → publication → public catalog.
6. Import verified publisher and catalog data into staging and reconcile counts and exceptions.
7. Migrate retailer ordering, then official documents, production, inventory, returns, and payouts.
8. Enable production only after role-based acceptance testing and a successful restore exercise.

## Required quality gates

- Every exposed table has Row Level Security enabled and tested.
- Every role has positive and negative access tests.
- Financial and official-document operations are transactional and repeat-safe.
- Public API responses exclude wholesale prices, commission, payouts, internal notes, and operational data.
- Staging contains no production secrets or unsanitized production data.
- Database and Storage recovery procedures have been exercised.
- The current prototype remains recoverable from Git while the migration is underway.

## Decisions still requiring business or operational confirmation

- Production hosting provider and domain/DNS ownership
- Transactional email provider and sending domain
- Required backup retention and acceptable recovery window
- File-retention rules for applications, production files, statements, and audit events
- Whether internal staff MFA is mandatory at initial launch
- Payment timing, refunds, disputes, taxes, and accounting handoff before live Stripe work
- Storage requirements for especially large print files
