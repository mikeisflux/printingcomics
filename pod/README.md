# Philbo Distribution Portal

Private development repository for the Philbo Distribution storefront and operations platform.

Philbo connects independent comic publishers, approved comic retailers, public catalog discovery, wholesale ordering, print-on-demand, fulfillment, and internal operations in one role-based portal.

## Current status

This repository contains a working browser-based prototype. It demonstrates the intended workflows and business rules, but it is not yet a production multi-user system.

The prototype currently stores authentication and operational records in browser `localStorage` through `src/firebase-mock.js`. Do not use it for live passwords, payments, sensitive financial records, or records that cannot be recreated from source data.

The source of truth for product requirements is [PHILBO_MASTER_BRIEF.md](./PHILBO_MASTER_BRIEF.md).

## Technology

- React 18
- Vite 5
- JavaScript / JSX
- Local prototype data layer
- Planned production backend: Supabase PostgreSQL, Auth, Storage, and Edge Functions

## Local development

Requirements:

- Node.js 20 or newer
- pnpm
- Python 3 for standalone assembly

Install dependencies:

```bash
pnpm install
```

Start the local site:

```bash
pnpm dev
```

Build the source-driven standalone portal:

```bash
pnpm build:standalone
```

Run the existing permissions and workflow checks:

```bash
pnpm test:permissions
```

Start the local Supabase stack and run database tests (Docker-compatible runtime required):

```bash
pnpm supabase:start
pnpm test:database
```

Preview pending migrations for the linked staging project without applying them:

```bash
pnpm database:preview
```

Create the Vite distribution build:

```bash
pnpm build
```

## Generated and source files

The editable application source is in `src/`. The standalone build process bundles that source into `public/assets/philbo-app.bundle.js`, then assembles the self-contained `index.html` and `philbo-operations-hub.html` files.

Generated files are presently retained because the self-contained portal is an intentional project deliverable. Changes should be made in `src/` and rebuilt rather than edited only in the generated bundle.

## Production foundation

- [Production architecture](./docs/PRODUCTION_ARCHITECTURE.md)
- [Database blueprint](./docs/DATABASE_BLUEPRINT.md)
- [Environment variable template](./.env.example)
- [Backend completion and launch gate](./docs/BACKEND_COMPLETION.md)

Production work will preserve the functioning prototype and replace the local data layer one workflow at a time. The first production workflow is publisher invitation, title submission, file upload, Admin review, publication, and public catalog display.

Database changes live in `supabase/migrations/` and are reviewed and tested before being applied to staging. Development-only database data belongs in `supabase/seed.sql`; real customer records must never be added there.

## Safety rules

- Never commit passwords, private keys, service-role keys, payment secrets, or real `.env` files.
- Never place a Supabase service-role key in browser code or in a variable beginning with `VITE_`.
- Do not use production customer data in development or staging.
- Test database permissions for every role before enabling a production feature.
- Keep approval and publication as separate actions.
- Keep Publisher Fulfilled Purchase Orders separate from Philbo POD Production Orders.
