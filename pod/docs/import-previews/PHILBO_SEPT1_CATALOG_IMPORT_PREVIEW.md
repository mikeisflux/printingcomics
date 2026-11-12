# PHILBO September 1 Catalog Import Preview

Generated from `Philbo_Sept1catalog - Form Responses 1.csv`. This is a read-only preview. **No title, publisher, catalog, file, or database records were written.**

## Stop-point decision

- **Production import status: STOPPED — 0 records authorized for production write.**
- Proposed Philbo Stock Numbers are assigned in source-row order from `PHI121626-201` through `PHI121626-261`, one per sellable CSV row.
- **Sequence lock:** these proposed numbers remain fixed and must not be renumbered or automatically shifted.
- Stock Numbers identify sellable products. Publisher UUIDs are separate internal ownership relationships and do not participate in Stock Number generation.
- No collision was found in the current isolated prototype catalog or among production Live titles visible through the configured public Supabase policy on 2026-08-25. The numbers are proposals only—not reserved—because that policy cannot inspect non-Live production rows.
- **Authenticated Admin collision check: CLEARED.** On 2026-08-27, a read-only SQL Editor query against philbo-staging / main (PRODUCTION) searched the complete `public.titles` table for `PHI121626-%` and returned no rows. The fixed proposed range is cleared for import; clearance does not authorize or execute the import.
- **Production Publisher creation completed 2026-08-27:** `public.organizations` now contains 18 organizations: `Philbo Distribution LLC` plus 17 canonical Publishers. Supabase verified 17 Publisher organizations and 17 matching Publisher profiles.
- **Publisher creation dry run: PASSED — ROLLED BACK on 2026-08-27.** Supabase reported 17 proposed Publisher records and 0 persisted records after rollback.
- The confirmed production Publisher UUIDs below are the ownership targets for the eventual migration. Browser-prototype account IDs remain reference-only.
- No authentication users or Publisher invitations were created or sent. All Publisher organizations remain pending onboarding.
- All migrated rows are assigned proposed `fulfillment_method = TBD` until their Publisher explicitly selects a real method. The production enum and Publisher Portal must support that temporary state before import.
- Nineteen missing Series Codes are approved as September-only legacy exceptions. Future Publisher Solicitation submissions still require Series Code.
- The current production `philbo_id` check expects five digits after the hyphen. The corrected Stock Number format uses three digits (`PHI121626-201`), so that constraint must be revised before these values can be stored in that field.
- Five migration-only barcode values receive letter suffixes while preserving the original submitted barcode separately. The current numeric-only barcode constraint requires a scoped legacy-import accommodation.
- Source row 6, Critical Entertainment’s `Planetary Expansion #5`, has an explicit September-only page-count correction from submitted `26` to proposed import value `28`. This does not alter the source CSV and is not an automatic rounding rule.

## Source and preview totals

| Check | Result |
|---|---:|
| Source rows | 61 |
| Source columns | 44 |
| Distinct source publishers | 17 |
| Publisher relationships resolved by business decision | 17 of 17 |
| Existing prototype publisher matches | 15 |
| Publishers approved for create/match | 2 |
| Publishers still unresolved | 0 |
| Rows with a resolved publisher relationship plan | 61 |
| Record-level rows ready after global checks | 61 |
| Record-level rows still blocked | 0 |
| Records authorized for database write now | 0 |
| Missing cover images | 0 |
| Invalid prices | 0 |
| Series Code legacy exceptions | 19 |
| Records assigned Fulfillment Method = TBD | 61 |
| Proposed migration-only barcode modifications | 5 |
| Explicit September legacy page-count corrections | 1 |
| Proposed Stock Numbers | 61 (PHI121626-201–PHI121626-261) |
| Prototype collisions with `PHI121626-` | 0 |
| Read-visible production Live collisions with `PHI121626-` (2026-08-25) | 0 |
| Authenticated Admin all-status production collisions (2026-08-27) | 0 — CLEARED |
| Authenticated production Publisher organizations (2026-08-27) | 17 of 17 |
| Publisher creation dry run (2026-08-27) | PASSED — 17 proposed / 0 persisted |
| Publisher creation commit (2026-08-27) | 17 organizations / 17 profiles |
| Exact barcode matches in existing prototype catalog | 3 |
| Rows involved in a duplicate barcode inside this source CSV | 2 |
| Same publisher/title matches treated as distinct submitted SKUs | 5 |

All 61 rows contain a title, barcode, price, cover-image link, original timestamp, description, and BISAC #1. The CSV has no per-title catalog, FOC, or in-store date columns; the intended `cycle_15` supplies September 1, 2026 catalog / November 1, 2026 FOC / December 16, 2026 in-store dates after that cycle assignment is confirmed.

## Final-resolution readiness answers

1. **Total source rows:** 61.
2. **Total Publishers resolved:** 17 of 17; all 17 canonical Publisher organizations and profiles now exist at their confirmed production UUIDs.
3. **Record-level ready count:** 61.
4. **Record-level blocked count:** 0.
5. **Series Code legacy exceptions:** 19.
6. **Barcode legacy exceptions:** 5, including the migration-only Daybreak A/B treatment.
7. **Fulfillment Method = TBD count:** 61.
8. **Proposed Philbo Stock Number range:** `PHI121626-201` through `PHI121626-261`, fixed and **cleared by authenticated Admin collision check on 2026-08-27**.
9. **Remaining authorization / production-write blockers:** scoped schema support for three-digit Stock Numbers, legacy barcode suffixes, missing Series Codes, provenance, and `TBD`; implementation of acknowledged Inventory → 15% calculations; a fresh pre-import backup; and explicit authorization for the eventual title/SKU/catalog/file import.
10. **Are all 61 records record-level ready?** Yes — 61 ready and 0 blocked. **Authorized for database write now:** 0.

## Authenticated collision-check protocol

- Current status: **CLEARED BY AUTHENTICATED ADMIN COLLISION CHECK — 2026-08-27.**
- Evidence: the read-only SQL Editor query against philbo-staging / main (PRODUCTION) searched all rows in `public.titles` where `philbo_id like 'PHI121626-%'` and returned **Success. No rows returned**.
- The authenticated query covered every production title/SKU in `public.titles` without a status filter, including Draft, Submitted, Pending Review, Needs Revision, Approved, Scheduled, Live, Closed, Archived, or Rejected records if present.
- The complete production result was compared against the fixed proposed range `PHI121626-201` through `PHI121626-261`.
- No collisions were returned, so the fixed sequence is **CLEARED FOR IMPORT**. If contradictory production evidence is found later, report each conflicting Stock Number and record; **do not renumber or shift this sequence automatically.**
- Collision clearance does not itself authorize or execute the import.

## Publisher mapping checkpoint

| CSV publisher | Rows | Prototype Publisher ID | Canonical production name | Confidence | Confirmed production UUID | Production state |
|---|---:|---|---|---|---|---|
| 20th Place Media | 1 | — (no prototype account) | 20th Place Media | RESOLVED — CREATE/MATCH WITH PROVIDED CONTACT | `3811302a-dd82-4a06-985b-35afe4957c17` | **PRESENT — PENDING ONBOARDING** |
| 4 SPEED STUDIOS | 4 | pub-import-4-speed-studios | 4 Speed Studios | HIGH | `82028526-e6a8-42b8-b26e-86cfb9e991a8` | **PRESENT — PENDING ONBOARDING** |
| APEX COMICS GROUP | 1 | pub-import-apex-comics-group | APEX COMICS GROUP | HIGH | `ac704c8e-e112-468b-ad57-48be22ffadc8` | **PRESENT — PENDING ONBOARDING** |
| Broken Oar Comics | 2 | pub-contact-brokenoarcomics | Broken Oar Comics | HIGH | `af0a46f8-e54b-4452-aac4-3a689188ec39` | **PRESENT — PENDING ONBOARDING** |
| Critical Entertainment | 1 | pub-import-critical-entertainment | Critical Entertainment | HIGH | `33f59355-02ed-4859-874e-9e51e33e131d` | **PRESENT — PENDING ONBOARDING** |
| Crooked Comix | 1 | pub-contact-crookedcomixllc | Crooked Comix, LLC | HIGH — ALIAS + CONTACT MATCH | `28bec1a4-b2a2-494b-9719-81b396305e58` | **PRESENT — PENDING ONBOARDING** |
| Dreamscape Publishing | 13 | pub-import-dreamscape-publishing | Dreamscape Publishing | HIGH | `b742240d-17d7-48ad-9477-dbd192326faf` | **PRESENT — PENDING ONBOARDING** |
| FairSquare Graphics | 1 | — (no prototype account) | FairSquare Graphics | RESOLVED — CREATE/MATCH WITH PROVIDED CONTACT | `3c0724de-8fff-494c-98a4-0a6cfba76841` | **PRESENT — PENDING ONBOARDING** |
| Hermes Press | 10 | pub-import-hermes-press | Hermes Press | HIGH | `b774447e-2ec1-4d57-bd06-98bea11d2b3e` | **PRESENT — PENDING ONBOARDING** |
| Heroic Publishing Inc | 2 | pub-import-heroic-publishing-inc | Heroic Publishing Inc | HIGH | `e64181b7-a440-4f0c-b694-a6e3c7a56b96` | **PRESENT — PENDING ONBOARDING** |
| High-Vibrational Pirate Syndicate of Western New York | 9 | pub-import-high-vibrational-pirate-syndicate-of-western-new-york | High-Vibrational Pirate Syndicate of Western New York | HIGH | `1a54e853-79c1-4e38-b127-e5ad18be31ef` | **PRESENT — PENDING ONBOARDING** |
| Homebrewed Comics | 3 | pub-contact-homebrewedcomics | Homebrewed Comics | HIGH | `6918da47-bb9a-4019-9a4e-5fe0ffaaf61a` | **PRESENT — PENDING ONBOARDING** |
| New Pain Pro | 3 | pub-import-new-pain-pro | New Pain Pro | HIGH | `cccd6967-e9ad-4d20-8588-d7997ca76c26` | **PRESENT — PENDING ONBOARDING** |
| Phantom Blade Productions | 1 | pub-contact-phantombladeproductionsllc | Phantom Blade Productions LLC | HIGH — ALIAS + CONTACT MATCH | `c641d442-8d1a-49c3-8f7e-ebd082b33621` | **PRESENT — PENDING ONBOARDING** |
| Philbo Publishing | 2 | pub-import-philbo-publishing | Philbo Publishing | HIGH | `f443d302-f378-4a30-b4c7-0a2bc9a37c7a` | **PRESENT — PENDING ONBOARDING** |
| Silverline Comics | 1 | pub-import-silverline-comics | Silverline Comics | HIGH | `2e2ddf1e-099c-45ce-b62d-049d01667d81` | **PRESENT — PENDING ONBOARDING** |
| Star Cross Comics | 6 | pub-import-star-cross-comics | Star Cross Comics | HIGH | `02466c1d-4e5a-4d57-908d-c7ff97599d91` | **PRESENT — PENDING ONBOARDING** |

All 17 Publisher relationships now resolve to confirmed production organizations created on 2026-08-27. Supabase verified 17 organizations and 17 matching Publisher profiles. The two aliases remain consolidated as `Crooked Comix` → `Crooked Comix, LLC` and `Phantom Blade Productions` → `Phantom Blade Productions LLC`. Private contact emails remain excluded from this report and public product projections. No invitations were sent.

### Alias/contact consolidation plan

- Retain one canonical Crooked Comix, LLC Publisher organization and reassociate any duplicate contacts/relationships to it before removing redundant records.
- Retain one canonical Phantom Blade Productions LLC Publisher organization and treat the shorter CSV name as an alias.
- Prefer the record containing the valid contact email. If duplicates share that email, retain one canonical contact record.
- Do not delete or merge a record with relational data until titles, submissions, users, purchase orders, payouts, and other ownership links have been reassociated and verified.

## Barcode and product-identity resolutions

- This import uses a one-time legacy barcode accommodation. The original submitted barcode is preserved separately; only the internal/import value receives the suffix. This is not a permanent Publisher Solicitation rule.
- Source row 11, **Alpha Red 7 (Homage Variant)**: original `9798988986270` → proposed import value `9798988986270A`.
- Source row 31, **Daybreak! #2 (Pat Olliffe cover)**: original `9798994207864` → proposed import value `9798994207864A`.
- Source row 32, **Daybreak! #2 (main cover by Stefan Tosheff)**: original `9798994207864` → proposed import value `9798994207864B`.
- Source row 59, **CLOOTOPIA #2**: original `66565499994200211` → proposed import value `66565499994200211A`.
- Source row 60, **CLOOTOPIA #2**: original `66565499994200221` → proposed import value `66565499994200221A`.
- Daybreak rows 31 and 32 are separate covers. Row 31 receives suffix A and row 32 suffix B; both retain their fixed, separate Philbo Stock Numbers.
- Audit link: row 11's original barcode `9798988986270` is already used by `PHIL101426-1267` Alpha Red #7 Incredible Hulk 181 Homage Variant; `PHIL101426-1268` Alpha Red #7; the proposed import suffix prevents internal collision without erasing that history.
- Audit link: row 59's original barcode `66565499994200211` is already used by `PHIL101426-1248` CLOOTOPIA #2; the proposed import suffix prevents internal collision without erasing that history.
- Audit link: row 60's original barcode `66565499994200221` is already used by `PHIL101426-1249` CLOOTOPIA #2; the proposed import suffix prevents internal collision without erasing that history.
- Rows 54–58 have distinct submitted barcodes and distinct sellable-cover intent. Under the final business decision they remain separate September SKUs, with prior same-title records retained for audit rather than automatically merged.

## Other manual-review findings

- 19 rows have no Series Code and are explicitly accepted as September legacy exceptions. The production constraint needs a narrow migration path; future submissions remain blocked without Series Code.
- Source row 6, `Planetary Expansion #5`, submitted `26` pages and now has an explicit proposed import value of `28`. This resolves its row-level blocker without changing the source CSV.
- Source row 40 contains `32 pages`; this will be safely normalized to integer `32`. Its Publisher relationship is resolved for create-or-match, with production UUID pending.
- Publisher logos are missing on 43 rows and interior images on 42 rows. Those are not title-blocking because the publisher logo should normally inherit from the Publisher record and interior art is optional, but links should be preserved for later file review.
- The production schema has no dedicated `source`, `legacy_submitted_at`, `import_batch_id`, or raw legacy metadata fields on `titles`. Audit-safe migration support should be added before production import instead of discarding provenance.

## Page-count correction and permanent validation

- The `26` → `28` correction applies only to source row 6 in this September legacy migration preview.
- Permanent Standard Floppy validation requires a positive page count divisible by 4. Valid counts include 24, 28, 32, 36, and other positive multiples of four; there is no fixed 24-page requirement.
- Future Publisher submissions with an invalid Standard Floppy page count must be blocked or returned for correction. The system must never silently round, normalize, or replace the submitted number.

## Fulfillment and distribution-fee decisions

- All 61 migrated records receive temporary `fulfillment_method = TBD`.
- `TBD` does not imply Inventory and does not trigger the 15% Inventory distribution fee.
- The Publisher Portal must prominently require selection of the real fulfillment method after migration.
- Selecting Inventory must show: **Selecting Inventory fulfillment changes your Philbo distribution fee to 15%.**
- The Publisher must explicitly acknowledge that warning before Inventory can be saved. After confirmation, fulfillment becomes Inventory and the actual commission/payout calculation must use 15%.
- This permanent Inventory rule is a code-and-schema readiness requirement; it is not satisfied by report copy alone.

## Canonical field mapping

| Legacy CSV field | Prototype field | Production destination / note |
|---|---|---|
| Publisher Name | publisherId + publisherName | titles.publisher_organization_id + organizations.name |
| Full Title of Book | title | titles.title |
| Series Name | seriesName | titles.series_name |
| Issue Number | issueNumber | titles.issue_number |
| Cover Description | coverDescription | titles.cover_description |
| Variant Number | variantNumber | titles.variant_number |
| Barcode / UPC / EAN | originalBarcode + importBarcode | Preserve original; store suffixed import value only for approved September exceptions |
| Assigned Philbo Stock Number | philboId | Proposed titles.philbo_id; constraint change required for PHI121626-201 format |
| Price | msrp | titles.msrp_cents after decimal-to-cents conversion |
| Book Format | bookFormat | titles.book_format |
| Type of Series | seriesType | titles.series_type |
| Series Code | seriesCode | titles.series_code; nullable only for documented September legacy exceptions |
| Series Frequency | seriesFrequency | titles.series_frequency |
| Media Rating / Age Range | ageRange | titles.age_rating |
| Page Count | submittedPageCount + pageCount | titles.page_count after integer parsing; row 6 alone uses the documented 26 → 28 September legacy correction; future invalid submissions are blocked, never auto-corrected |
| BISAC #1/#2/#3 | bisac1/bisac2/bisac3 | titles.bisac_1/bisac_2/bisac_3 |
| Description of Issue / Book | description | titles.full_description |
| Brief Synopsis of Book | synopsis | titles.brief_synopsis |
| Writer / Artist / Cover Artist | writer/artist/coverArtist | corresponding titles creator fields |
| Color or B&W | colorProfile | titles.color_mode |
| Width / Height | widthInches/heightInches | titles.width_inches/height_inches |
| Weight in pounds | weightPounds + weightOunces | titles.weight_ounces after pounds × 16 |
| Reprint / Printing | reprint/printingNumber | titles.is_reprint/titles.printing_number |
| Available for Reorder | availableForReorder | titles.available_for_reorder |
| Fulfillment Method | fulfillmentMethod = TBD | Temporary migration value; Publisher must later select actual method |
| Cover Image / Interior Image | coverUrl/additional image | title_files records; preserve Google Drive provider IDs |
| Timestamp | legacy source timestamp | requires migration/audit field; do not overwrite created_at |
| Submitter email / contact / phone | private legacy metadata only | never expose through public_catalog |

## Record-level preview

| Row | Publisher relationship | Original → import barcode | Title | Issue / variant | Submitted → import pages | Proposed Philbo Stock Number | Fulfillment | Readiness | Resolution / blocker |
|---:|---|---|---|---|---|---|---|---|---|
| 2 | Homebrewed Comics → 6918da47-bb9a-4019-9a4e-5fe0ffaaf61a | 79267193848400111 | Don't Kill Any Monsters #1 [RE-SOLICIT] | 1 / 1 | 28 | **PHI121626-201** | TBD | READY AFTER GLOBAL CHECKS | — |
| 3 | Homebrewed Comics → 6918da47-bb9a-4019-9a4e-5fe0ffaaf61a | 79267193848400211 | Don't Kill Any Monsters #2 [RE-SOLICIT] | 2 / 1 | 32 | **PHI121626-202** | TBD | READY AFTER GLOBAL CHECKS | — |
| 4 | Heroic Publishing Inc → e64181b7-a440-4f0c-b694-a6e3c7a56b96 | 88315022348800411 | Flare Deluxe #4 | 4 / — | 52 | **PHI121626-203** | TBD | READY AFTER GLOBAL CHECKS | — |
| 5 | Heroic Publishing Inc → e64181b7-a440-4f0c-b694-a6e3c7a56b96 | 88315022349500311 | Liberty Girl Deluxe #3 | 3 / — | 52 | **PHI121626-204** | TBD | READY AFTER GLOBAL CHECKS | — |
| 6 | Critical Entertainment → 33f59355-02ed-4859-874e-9e51e33e131d | 85579400801100511 | Planetary Expansion #5 | 5 / — | 26 → 28 | **PHI121626-205** | TBD | READY AFTER GLOBAL CHECKS | September legacy correction only: submitted page count 26 → proposed import page count 28; no automatic normalization |
| 7 | 4 SPEED STUDIOS → 82028526-e6a8-42b8-b26e-86cfb9e991a8 | 63760992214500311 | COLD KUTTER #3 variant cover A | 3 / 1 | 24 | **PHI121626-206** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 8 | Star Cross Comics → 02466c1d-4e5a-4d57-908d-c7ff97599d91 | 9798988986294 | Alpha Red #9 (Cover A) | — / Cover A | 24 | **PHI121626-207** | TBD | READY AFTER GLOBAL CHECKS | — |
| 9 | Star Cross Comics → 02466c1d-4e5a-4d57-908d-c7ff97599d91 | 9798997531409 | Alpha Red #9 (Cover B) | 9 / Cover B | 24 | **PHI121626-208** | TBD | READY AFTER GLOBAL CHECKS | — |
| 10 | Star Cross Comics → 02466c1d-4e5a-4d57-908d-c7ff97599d91 | 9798997531416 | Alpha Red #9 (Homage Variant) | 9 / Homage Variant 9 | 24 | **PHI121626-209** | TBD | READY AFTER GLOBAL CHECKS | — |
| 11 | Star Cross Comics → 02466c1d-4e5a-4d57-908d-c7ff97599d91 | 9798988986270 → 9798988986270A | Alpha Red 7 (Homage Variant) | 7 / Homage Variant 7 | 24 | **PHI121626-210** | TBD | READY AFTER GLOBAL CHECKS | Legacy barcode accommodation: preserve original 9798988986270; import value 9798988986270A |
| 12 | Star Cross Comics → 02466c1d-4e5a-4d57-908d-c7ff97599d91 | 9798988986287 | Alpha Red #8 (Homage Variant) | 8 / Homage Variant 8 | 24 | **PHI121626-211** | TBD | READY AFTER GLOBAL CHECKS | — |
| 13 | 4 SPEED STUDIOS → 82028526-e6a8-42b8-b26e-86cfb9e991a8 | 63760992214500321 | COLD KUTTER variant cover B | 3 / 2 | 24 | **PHI121626-212** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 14 | 4 SPEED STUDIOS → 82028526-e6a8-42b8-b26e-86cfb9e991a8 | 63760992214500331 | COLD KUTTER #3 variant cover C | 3 / 3 | 24 | **PHI121626-213** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 15 | 4 SPEED STUDIOS → 82028526-e6a8-42b8-b26e-86cfb9e991a8 | 63760992214500341 | COLD KUTTER #3 cover variant D | 3 / 4 | 24 | **PHI121626-214** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 16 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613453315 | PHANTOM HC VOL 36 THE COMPLETE NEWSPAPER DAILIES 1993-1994 | 36 / — | 304 | **PHI121626-215** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 17 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613451441 | Story of the Phantom: The Complete Avon Novels Volume 6 The Mysterious Ambassador | 6 / — | 144 | **PHI121626-216** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 18 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613451458 | Story of the Phantom: The Complete Avon Novels Volume 7 The Mystery of the Sea Horse | 7 / — | 144 | **PHI121626-217** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 19 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613451465 | Story of the Phantom: The Complete Avon Novels Volume 8 The Hydra Monster | 8 / — | 144 | **PHI121626-218** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 20 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613451472 | Story of the Phantom: The Complete Avon Novels Volume 9 The Killer's Town | 9 / — | 144 | **PHI121626-219** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 21 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613451601 | Story of the Phantom: The Complete Avon Novels Volume 10 The Goggle-Eyed Pirates | 10 / — | 144 | **PHI121626-220** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 22 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613453339 | Johnny Hazard: The Newspaper Dailies Volume 14 1965-1966 | 14 / — | 240 | **PHI121626-221** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 23 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613452981 | The Phantom Coloring Book | — / — | 80 | **PHI121626-222** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 24 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613453032 | Johnny Hazard: The Newspaper Dailies Volume 13  Offered Again | 13 / — | 240 | **PHI121626-223** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 25 | Hermes Press → b774447e-2ec1-4d57-bd06-98bea11d2b3e | 9781613453100 | The Phantom the Complete Dailies Volume 35 1991-1993 Offered Again | 35 / — | 264 | **PHI121626-224** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 26 | Broken Oar Comics → af0a46f8-e54b-4452-aac4-3a689188ec39 | 6001579791 | Daisy Cassidy #2 of 5 | 2 / — | 28 | **PHI121626-225** | TBD | READY AFTER GLOBAL CHECKS | — |
| 27 | Broken Oar Comics → af0a46f8-e54b-4452-aac4-3a689188ec39 | 9780991390946 | Monster Elementary and The Egyptian Curse! | Vol. 2 / — | 100 | **PHI121626-226** | TBD | READY AFTER GLOBAL CHECKS | — |
| 28 | Homebrewed Comics → 6918da47-bb9a-4019-9a4e-5fe0ffaaf61a | 79467734495500611 | Caspian Porter #6 | 6 / — | 24 | **PHI121626-227** | TBD | READY AFTER GLOBAL CHECKS | — |
| 29 | Phantom Blade Productions → c641d442-8d1a-49c3-8f7e-ebd082b33621 | 9781685248369 | Ximphonic Versus- Consequences:IX | 9 / — | 52 | **PHI121626-228** | TBD | READY AFTER GLOBAL CHECKS | — |
| 30 | APEX COMICS GROUP → ac704c8e-e112-468b-ad57-48be22ffadc8 | 727073594426 | THE OUTER SPACE MEN - ORBITRON VARIANT | 1 / — | 32 | **PHI121626-229** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 31 | New Pain Pro → cccd6967-e9ad-4d20-8588-d7997ca76c26 | 9798994207864 → 9798994207864A | Daybreak! #2 (Pat Olliffe cover) | 2 / 1 | 28 | **PHI121626-230** | TBD | READY AFTER GLOBAL CHECKS | Legacy barcode accommodation: preserve original 9798994207864; import value 9798994207864A |
| 32 | New Pain Pro → cccd6967-e9ad-4d20-8588-d7997ca76c26 | 9798994207864 → 9798994207864B | Daybreak! #2 (main cover by Stefan Tosheff) | 2 / 1 | 28 | **PHI121626-231** | TBD | READY AFTER GLOBAL CHECKS | Legacy barcode accommodation: preserve original 9798994207864; import value 9798994207864B |
| 33 | New Pain Pro → cccd6967-e9ad-4d20-8588-d7997ca76c26 | 9798994207871 | Golden Years #1 | 1 / — | 24 | **PHI121626-232** | TBD | READY AFTER GLOBAL CHECKS | — |
| 34 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822803800211 | The Night Guardians – Awakenings Part Two | 2 / — | 32 | **PHI121626-233** | TBD | READY AFTER GLOBAL CHECKS | — |
| 35 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822804500211 | Let’s Hunt Monstas! The Series!!! #2 Cover A | 2 / 1 | 32 | **PHI121626-234** | TBD | READY AFTER GLOBAL CHECKS | — |
| 36 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822804500221 | Let’s Hunt Monstas! The Series!!! #2 Cover B | 2 / 2 | 32 | **PHI121626-235** | TBD | READY AFTER GLOBAL CHECKS | — |
| 37 | Crooked Comix → 28bec1a4-b2a2-494b-9719-81b396305e58 | 8600113150900211 | As Above, So Below II | 2 / — | 28 | **PHI121626-236** | TBD | READY AFTER GLOBAL CHECKS | — |
| 38 | Philbo Publishing → f443d302-f378-4a30-b4c7-0a2bc9a37c7a | 7152412479460 | LYNX | 1 / — | 20 | **PHI121626-237** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 39 | Philbo Publishing → f443d302-f378-4a30-b4c7-0a2bc9a37c7a | 715241248035 | World's Wonders Book One: Cataclysm | 1 / — | 28 | **PHI121626-238** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 40 | 20th Place Media → 3811302a-dd82-4a06-985b-35afe4957c17 | 199874665429 | Nia Griggs & The Kemetic Sisterhood of Science #1 | 1 / — | 32 | **PHI121626-239** | TBD | READY AFTER GLOBAL CHECKS | Publisher created in production at confirmed UUID |
| 41 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822808300111 | The House Over the Void: A Horror Anthology Vol 1 Cover A | 1 / 1 | 28 | **PHI121626-240** | TBD | READY AFTER GLOBAL CHECKS | — |
| 42 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822808300121 | The House Over the Void: A Horror Anthology Vol 1 Cover B | 1 / 2 | 28 | **PHI121626-241** | TBD | READY AFTER GLOBAL CHECKS | — |
| 43 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822808300131 | The House Over the Void: A Horror Anthology Vol 1 Cover C | 1 / 3 | 28 | **PHI121626-242** | TBD | READY AFTER GLOBAL CHECKS | — |
| 44 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822808300141 | The House Over the Void: A Horror Anthology Vol 1 Cover D | 1 / 4 | 28 | **PHI121626-243** | TBD | READY AFTER GLOBAL CHECKS | — |
| 45 | Star Cross Comics → 02466c1d-4e5a-4d57-908d-c7ff97599d91 | 9798997531423 | Alpha Red #9 Direct Market Exclusive | 9 / Alpha Red 9 Cover F Direct Market Exclusive | 24 | **PHI121626-244** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted |
| 46 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822807600111 | Diesel City Dreams Cover A | 1 / 1 | 24 | **PHI121626-245** | TBD | READY AFTER GLOBAL CHECKS | — |
| 47 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 85008822807600121 | Diesel City Dreams Cover B | 1 / 2 | 24 | **PHI121626-246** | TBD | READY AFTER GLOBAL CHECKS | — |
| 48 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 86001432179500111 | The Galactics #1 Cover A | 1 / 1 | 24 | **PHI121626-247** | TBD | READY AFTER GLOBAL CHECKS | — |
| 49 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 86001432179500121 | The Galactics #1 Cover B | 1 / 2 | 24 | **PHI121626-248** | TBD | READY AFTER GLOBAL CHECKS | — |
| 50 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 86001432179500131 | The Galactics #1 Cover C | 1 / 3 | 24 | **PHI121626-249** | TBD | READY AFTER GLOBAL CHECKS | — |
| 51 | Dreamscape Publishing → b742240d-17d7-48ad-9477-dbd192326faf | 86001432179500141 | The Galactics #1 Cover D | The Galactics / 4 | 24 | **PHI121626-250** | TBD | READY AFTER GLOBAL CHECKS | — |
| 52 | Silverline Comics → 2e2ddf1e-099c-45ce-b62d-049d01667d81 | 64462550289300211 | Divinity #2 | 2 / — | 24 | **PHI121626-251** | TBD | READY AFTER GLOBAL CHECKS | — |
| 53 | FairSquare Graphics → 3c0724de-8fff-494c-98a4-0a6cfba76841 | 9781960171306 | INTERTWINED: THE SPIRITS OF WUXING SAGA (10th Anniversary Edition) | — / — | 300 | **PHI121626-252** | TBD | READY AFTER GLOBAL CHECKS | September legacy exception: missing Series Code accepted; Publisher created in production at confirmed UUID |
| 54 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499989800111 | ESCAPE NEW JERSEY #1 | 1 / — | 28 | **PHI121626-253** | TBD | READY AFTER GLOBAL CHECKS | Same publisher/title exists, but submitted barcode is distinct; treat as separate SKU under migration decision |
| 55 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499989800121 | ESCAPE NEW JERSEY #1 | 1 / 1 | 28 | **PHI121626-254** | TBD | READY AFTER GLOBAL CHECKS | Same publisher/title exists, but submitted barcode is distinct; treat as separate SKU under migration decision |
| 56 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499989800161 | ESCAPE NEW JERSEY #1 | 1 / 6 | 28 | **PHI121626-255** | TBD | READY AFTER GLOBAL CHECKS | Same publisher/title exists, but submitted barcode is distinct; treat as separate SKU under migration decision |
| 57 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499994200011 | CLOOTOPIA #1 | 1 / — | 28 | **PHI121626-256** | TBD | READY AFTER GLOBAL CHECKS | Same publisher/title exists, but submitted barcode is distinct; treat as separate SKU under migration decision |
| 58 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499994200021 | CLOOTOPIA #1 | 1 / 1 | 28 | **PHI121626-257** | TBD | READY AFTER GLOBAL CHECKS | Same publisher/title exists, but submitted barcode is distinct; treat as separate SKU under migration decision |
| 59 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499994200211 → 66565499994200211A | CLOOTOPIA #2 | 2 / — | 28 | **PHI121626-258** | TBD | READY AFTER GLOBAL CHECKS | Legacy barcode accommodation: preserve original 66565499994200211; import value 66565499994200211A |
| 60 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499994200221 → 66565499994200221A | CLOOTOPIA #2 | 2 / 1 | 28 | **PHI121626-259** | TBD | READY AFTER GLOBAL CHECKS | Legacy barcode accommodation: preserve original 66565499994200221; import value 66565499994200221A |
| 61 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499994200131 | CLOOTOPIA #1 2026 Holiday Edition | 1 / 2 | 28 | **PHI121626-260** | TBD | READY AFTER GLOBAL CHECKS | — |
| 62 | High-Vibrational Pirate Syndicate of Western New York → 1a54e853-79c1-4e38-b127-e5ad18be31ef | 66565499994200231 | CLOOTOPIA #2 2026 HOLIDAY EDITION | 2 / 2 | 28 | **PHI121626-261** | TBD | READY AFTER GLOBAL CHECKS | — |

## Local production-preparation package

- `supabase/migrations/20260827090000_add_legacy_tbd_fulfillment.sql` proposes the isolated `TBD` enum prerequisite.
- `supabase/migrations/20260827091000_september_legacy_import_support.sql` proposes scoped import provenance, legacy validation exceptions, permanent divisible-by-four Standard Floppy validation, and acknowledged Inventory → 15% payout support.
- `docs/import-previews/PHILBO_SEPT1_PUBLISHER_CREATION_DRY_RUN.sql` contains the 17 proposed Publisher UUID/name records inside a transaction that always ends with `ROLLBACK`. It passed in Supabase on 2026-08-27: 17 proposed, 0 persisted.
- `docs/import-previews/PHILBO_SEPT1_CREATE_17_PUBLISHERS.sql` was explicitly authorized and committed on 2026-08-27. Supabase verified 17 organizations and 17 profiles. No users or invitations were created.
- **Preparation status: PUBLISHERS CREATED; catalog-support migrations and all title/SKU/catalog/file writes remain unapplied.**

## Required confirmations before any write

- **Completed:** authenticated Admin collision check across the complete production `public.titles` table on 2026-08-27; no `PHI121626-` records were found, so 201–261 remain fixed and cleared.
1. Revise the production Stock Number / `philbo_id` constraint to accept the confirmed three-digit sequence without weakening uniqueness.
2. Add a scoped September migration mechanism that preserves original barcodes while allowing the five proposed A/B suffixed import values without changing future submission rules.
3. Add the documented legacy Series Code exception without weakening the permanent Publisher Solicitation requirement.
4. Add `TBD` fulfillment support and implement the acknowledged Inventory → 15% rule in both the Publisher Portal and actual commission/payout calculations.
- **Completed:** all 17 canonical Publisher organizations and profiles were created at their confirmed UUIDs on 2026-08-27; no invitations were sent.
6. Add production migration fields for source provenance and take the required table backup immediately before the eventual import.

**Checkpoint enforced: the script only read source/repository data and generated this report. It contains no insert, update, delete, upsert, or localStorage persistence outside its isolated in-memory process.**
