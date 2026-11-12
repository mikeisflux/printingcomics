# Historical catalog portal reconciliation — 2026-09-16

## Result

- Historical rows preserved in the import mapping: **1,351**
- Unique source catalogs represented: **12**
- Current July 2026 catalog rows bundled in the private demo: **72**
- Current demo rows matched to the historical mapping by barcode: **72 of 72**
- Historical rows not yet written to the production database: **1,351**
- Production writes performed by this reconciliation: **0**

The books were not deleted or lost. The 1,351 historical rows remain in
`PHILBO_HISTORICAL_CATALOG_ROW_MAPPING.csv` and the review workbook. Only the
72-row July 2026 catalog was bundled into the browser demo. Those 72 rows are
already part of the 1,351-row mapping, leaving **1,279 additional historical
rows** that are review-ready but not visible in the portal.

## Catalog counts

| Catalog date | Rows |
|---|---:|
| 2025-07-01 | 167 |
| 2025-08-01 | 95 |
| 2025-10-01 | 106 |
| 2025-11-01 | 100 |
| 2025-12-01 | 93 |
| 2026-01-01 | 187 |
| 2026-02-01 | 138 |
| 2026-03-01 | 111 |
| 2026-04-01 | 95 |
| 2026-05-01 | 100 |
| 2026-06-01 | 87 |
| 2026-07-01 | 72 |

The September 1, 2025 catalog cycle remains on the official schedule, but its
source CSV was recorded as permanently unavailable. Per the September 16, 2026
decision, that cycle is intentionally skipped in the import and shown disabled
in the Publisher schedule. No title rows are invented for that cycle.

This missing historical cycle is unrelated to the current live catalogs:
**PHILVIEWS #14** is the August 2026 catalog with November 11, 2026 in-store,
and **PHILVIEWS #15** is the September 2026 catalog with December 16, 2026
in-store. Both are retailer-ordering catalogs, not archived historical cycles.

## Safe next step

Before any production import: back up the affected Supabase tables, finish the
61 pending Publisher account matches/creates without sending invitations,
review the 8 possible variant/duplicate groups, and obtain a separate explicit
production-import approval. Imported historical records should enter as
**Archived Historical**, never automatically public or orderable.
