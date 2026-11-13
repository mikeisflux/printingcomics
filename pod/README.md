# PHILBO portal — reference copy

This folder is a copy of `mauramariepowers-tech/philbo-portal` (main `b56459f`,
2026-09-16), a distribution portal built for a competitor and handed to us.
**It is reference material only.** It is not part of the npm workspaces, is not
built or deployed, and must not be run against real data. The full write-up —
what it is, what we took from it and how it maps onto our stack — is in
`docs/philbo-portal-integration.md` at the repo root. The Distribution
section of Printing Comics (`/distribution`, `/admin/pod`) is our own
implementation on Express + Prisma + React 19; nothing here is imported by it.

What was removed from the copy (see the integration doc, section 3):

- `src/data/*.json` and `src/data/philviews-catalogs.js` — Philbo's publisher
  contact list and catalog rows (other people's data).
- `public/assets/**`, `public/downloads/**`, `philbo-operations-hub.html` —
  Philbo brand assets, catalogs, videos and prebuilt bundles.
- `.github/workflows/supabase-database-backup.yml` and the live Supabase
  project id / Google Drive folder ids in the config examples.

Because the bundled data imports are gone, `src/firebase-mock.js` and
`src/main.jsx` no longer resolve; that is intended. Useful pure logic lives in
`src/lib/` (retailer tiers, incentive variants, CSV export/import, catalog
workflow states, PDF preflight) and the schema reference in
`supabase/migrations/`. Business rules: `PHILBO_MASTER_BRIEF.md`.
