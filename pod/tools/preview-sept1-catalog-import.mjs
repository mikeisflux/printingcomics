import fs from 'node:fs';
import path from 'node:path';
import { parseCsvRows } from '../src/lib/csv-order.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = '/Users/maurapowers/Desktop/Philbo_Sept1catalog - Form Responses 1.csv';
const OUTPUT = path.join(ROOT, 'docs', 'import-previews', 'PHILBO_SEPT1_CATALOG_IMPORT_PREVIEW.md');
const STOCK_PREFIX = 'PHI121626-';
const STOCK_START = 201;
const PUBLIC_LIVE_COLLISION_COUNT = 0;
const PUBLIC_LIVE_COLLISION_CHECK_DATE = '2026-08-25';
const AUTHENTICATED_ADMIN_COLLISION_COUNT = 0;
const AUTHENTICATED_ADMIN_COLLISION_CHECK_DATE = '2026-08-27';
const AUTHENTICATED_ADMIN_COLLISION_CHECK_TARGET = 'philbo-staging / main (PRODUCTION)';
const AUTHENTICATED_ORGANIZATION_CHECK_DATE = '2026-08-27';
const PRODUCTION_ORGANIZATION_COUNT = 18;
const PRODUCTION_PUBLISHER_ORGANIZATION_COUNT = 17;
const PUBLISHER_CREATION_DRY_RUN_DATE = '2026-08-27';
const PUBLISHER_CREATION_DRY_RUN_PROPOSED = 17;
const PUBLISHER_CREATION_DRY_RUN_PERSISTED = 0;
const PUBLISHER_CREATION_COMMIT_DATE = '2026-08-27';
const PUBLISHER_CREATION_COMMITTED_ORGANIZATIONS = 17;
const PUBLISHER_CREATION_COMMITTED_PROFILES = 17;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
await import('../src/firebase-mock.js');

const prototypeUsers = JSON.parse(localStorage.getItem('philbo_users') || '[]').filter(user => user.role === 'publisher');
const existingTitles = JSON.parse(localStorage.getItem('philbo_titles') || '[]');
const prototypeStockCollisions = existingTitles.filter(title => String(title.philboId || '').startsWith(STOCK_PREFIX));
const csvRows = parseCsvRows(fs.readFileSync(SOURCE, 'utf8'));
const headers = csvRows[0];
const sourceRows = csvRows.slice(1).map((values, index) => ({
  sourceRow: index + 2,
  values: Object.fromEntries(headers.map((header, column) => [header.trim(), values[column] || '']))
}));

const get = (record, name) => String(record.values[name] || '').trim();
const key = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const barcodeKey = value => String(value || '').replace(/[^0-9A-Za-z]+/g, '').toUpperCase();
const escapeCell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ').trim();
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const publisherAliases = new Map([
  ['crookedcomix', 'crookedcomixllc'],
  ['phantombladeproductions', 'phantombladeproductionsllc']
]);

const publisherCreateOrMatchDecisions = new Map([
  ['20thplacemedia', { canonicalName: '20th Place Media', contactProvided: true }],
  ['fairsquaregraphics', { canonicalName: 'FairSquare Graphics', contactProvided: true }]
]);

const proposedProductionPublisherIds = new Map([
  ['20thplacemedia', '3811302a-dd82-4a06-985b-35afe4957c17'],
  ['4speedstudios', '82028526-e6a8-42b8-b26e-86cfb9e991a8'],
  ['apexcomicsgroup', 'ac704c8e-e112-468b-ad57-48be22ffadc8'],
  ['brokenoarcomics', 'af0a46f8-e54b-4452-aac4-3a689188ec39'],
  ['criticalentertainment', '33f59355-02ed-4859-874e-9e51e33e131d'],
  ['crookedcomixllc', '28bec1a4-b2a2-494b-9719-81b396305e58'],
  ['dreamscapepublishing', 'b742240d-17d7-48ad-9477-dbd192326faf'],
  ['fairsquaregraphics', '3c0724de-8fff-494c-98a4-0a6cfba76841'],
  ['hermespress', 'b774447e-2ec1-4d57-bd06-98bea11d2b3e'],
  ['heroicpublishinginc', 'e64181b7-a440-4f0c-b694-a6e3c7a56b96'],
  ['highvibrationalpiratesyndicateofwesternnewyork', '1a54e853-79c1-4e38-b127-e5ad18be31ef'],
  ['homebrewedcomics', '6918da47-bb9a-4019-9a4e-5fe0ffaaf61a'],
  ['newpainpro', 'cccd6967-e9ad-4d20-8588-d7997ca76c26'],
  ['phantombladeproductionsllc', 'c641d442-8d1a-49c3-8f7e-ebd082b33621'],
  ['philbopublishing', 'f443d302-f378-4a30-b4c7-0a2bc9a37c7a'],
  ['silverlinecomics', '2e2ddf1e-099c-45ce-b62d-049d01667d81'],
  ['starcrosscomics', '02466c1d-4e5a-4d57-908d-c7ff97599d91']
]);

const legacyBarcodeOverrides = new Map([
  [11, '9798988986270A'],
  [31, '9798994207864A'],
  [32, '9798994207864B'],
  [59, '66565499994200211A'],
  [60, '66565499994200221A']
]);

const legacyPageCountOverrides = new Map([
  [6, {
    publisher: 'Critical Entertainment',
    title: 'Planetary Expansion #5',
    submittedPageCount: 26,
    importPageCount: 28
  }]
]);

const sourcePublisherCounts = new Map();
sourceRows.forEach(row => {
  const publisher = get(row, 'Publisher Name');
  sourcePublisherCounts.set(publisher, (sourcePublisherCounts.get(publisher) || 0) + 1);
});

const publisherMappings = Array.from(sourcePublisherCounts, ([sourceName, rowCount]) => {
  const sourceKey = key(sourceName);
  let match = prototypeUsers.find(user => key(user.companyName) === sourceKey);
  let method = match ? 'Exact normalized name' : '';
  if (!match && publisherAliases.has(sourceKey)) {
    match = prototypeUsers.find(user => key(user.companyName) === publisherAliases.get(sourceKey));
    method = match ? 'Known legal-name alias' : '';
  }
  const createOrMatch = publisherCreateOrMatchDecisions.get(sourceKey);
  return {
    sourceName,
    rowCount,
    publisherId: match?.uid || '',
    matchedName: match?.companyName || createOrMatch?.canonicalName || '',
    confidence: match
      ? (method === 'Exact normalized name' ? 'HIGH' : 'HIGH — ALIAS + CONTACT MATCH')
      : createOrMatch ? 'RESOLVED — CREATE/MATCH WITH PROVIDED CONTACT' : 'UNMATCHED',
    method: method || (createOrMatch ? 'Business-approved create or match' : ''),
    relationshipResolved: Boolean(match || createOrMatch),
    createOrMatch: Boolean(createOrMatch),
    proposedProductionPublisherId: proposedProductionPublisherIds.get(key(match?.companyName || createOrMatch?.canonicalName || sourceName)) || '',
    productionConfirmed: false
  };
}).sort((a, b) => a.sourceName.localeCompare(b.sourceName));

const mappingBySource = new Map(publisherMappings.map(mapping => [mapping.sourceName, mapping]));
const sourceBarcodeRows = new Map();
sourceRows.forEach(row => {
  const barcode = barcodeKey(get(row, 'The Barcode / UPC / EAN   Numeric entries only'));
  if (!barcode) return;
  sourceBarcodeRows.set(barcode, [...(sourceBarcodeRows.get(barcode) || []), row.sourceRow]);
});

const existingByBarcode = new Map();
const existingByPublisherTitle = new Map();
existingTitles.forEach(title => {
  const barcode = barcodeKey(title.barcode);
  if (barcode) existingByBarcode.set(barcode, [...(existingByBarcode.get(barcode) || []), title]);
  const titleKey = `${key(title.publisherName)}::${key(title.title)}`;
  existingByPublisherTitle.set(titleKey, [...(existingByPublisherTitle.get(titleKey) || []), title]);
});

const previews = sourceRows.map((row, rowIndex) => {
  const sourcePublisher = get(row, 'Publisher Name');
  const mapping = mappingBySource.get(sourcePublisher);
  const barcode = barcodeKey(get(row, 'The Barcode / UPC / EAN   Numeric entries only'));
  const title = get(row, 'Full Title of Book');
  const seriesCode = get(row, 'Series Code');
  const pageCountRaw = get(row, 'Page Count');
  const pageCountMatch = pageCountRaw.match(/\d+/);
  const submittedPageCount = pageCountMatch ? Number(pageCountMatch[0]) : null;
  const format = get(row, 'Book Format');
  const priceRaw = get(row, 'Price');
  const price = Number(String(priceRaw).replace(/[^0-9.]/g, ''));
  const cover = get(row, 'Cover Image\nnamed the SKU of your book .. JPG OR PNG ONLY');
  const canonicalPublisher = mapping?.matchedName || sourcePublisher;
  const reasons = [];
  const resolutionNotes = [];
  const legacyPageCountOverride = legacyPageCountOverrides.get(row.sourceRow);
  const pageCountOverrideApplied = Boolean(
    legacyPageCountOverride
    && sourcePublisher === legacyPageCountOverride.publisher
    && title === legacyPageCountOverride.title
    && submittedPageCount === legacyPageCountOverride.submittedPageCount
  );
  const pageCount = pageCountOverrideApplied
    ? legacyPageCountOverride.importPageCount
    : submittedPageCount;

  if (!mapping?.relationshipResolved) reasons.push('publisher relationship unresolved');
  if (!title) reasons.push('missing title');
  if (!barcode) reasons.push('missing barcode');
  if (!Number.isFinite(price) || price <= 0) reasons.push('invalid price');
  if (!cover) reasons.push('missing cover image');
  if (!pageCount) reasons.push('invalid page count');
  if (/standard floppy comic/i.test(format) && pageCount && pageCount % 4 !== 0) reasons.push('floppy page count not divisible by 4');
  if (pageCountOverrideApplied) resolutionNotes.push(`September legacy correction only: submitted page count ${submittedPageCount} → proposed import page count ${pageCount}; no automatic normalization`);
  if (!seriesCode) resolutionNotes.push('September legacy exception: missing Series Code accepted');
  if (mapping?.createOrMatch) resolutionNotes.push('Publisher created in production at confirmed UUID');

  const importBarcode = legacyBarcodeOverrides.get(row.sourceRow) || barcode;
  if (importBarcode !== barcode) resolutionNotes.push(`Legacy barcode accommodation: preserve original ${barcode}; import value ${importBarcode}`);

  const sameTitle = existingByPublisherTitle.get(`${key(canonicalPublisher)}::${key(title)}`) || [];
  if (sameTitle.length && !(existingByBarcode.get(barcode) || []).length) resolutionNotes.push('Same publisher/title exists, but submitted barcode is distinct; treat as separate SKU under migration decision');

  const proposedStockNumber = `${STOCK_PREFIX}${STOCK_START + rowIndex}`;

  return {
    sourceRow: row.sourceRow,
    publisher: sourcePublisher,
    publisherId: mapping?.publisherId || '',
    title,
    originalBarcode: barcode,
    importBarcode,
    issue: get(row, 'Issue Number'),
    variant: get(row, 'Variant Number'),
    submittedPageCount,
    pageCount,
    pageCountOverrideApplied,
    proposedStockNumber,
    seriesCodeLegacyException: !seriesCode,
    fulfillmentMethod: 'TBD',
    resolutionNotes,
    reasons,
    status: reasons.length ? 'BLOCKED — RECORD REVIEW' : 'READY AFTER GLOBAL CHECKS'
  };
});

const matchedPublishers = publisherMappings.filter(mapping => mapping.publisherId);
const createOrMatchPublishers = publisherMappings.filter(mapping => mapping.createOrMatch);
const resolvedPublishers = publisherMappings.filter(mapping => mapping.relationshipResolved);
const unmatchedPublishers = publisherMappings.filter(mapping => !mapping.relationshipResolved);
const cleanCandidates = previews.filter(preview => preview.status === 'READY AFTER GLOBAL CHECKS');
const reviewCandidates = previews.filter(preview => preview.status === 'BLOCKED — RECORD REVIEW');
const missingSeriesCode = previews.filter(preview => preview.seriesCodeLegacyException);
const missingCovers = previews.filter(preview => preview.reasons.includes('missing cover image'));
const invalidPrices = previews.filter(preview => preview.reasons.includes('invalid price'));
const barcodeModified = previews.filter(preview => preview.importBarcode !== preview.originalBarcode);
const pageCountCorrected = previews.filter(preview => preview.pageCountOverrideApplied);
const exactExistingBarcode = previews.filter(preview => (existingByBarcode.get(preview.originalBarcode) || []).length);
const sourceDuplicateBarcode = previews.filter(preview => (sourceBarcodeRows.get(preview.originalBarcode) || []).length > 1);
const titleOnlyReview = previews.filter(preview => preview.resolutionNotes.some(note => note.startsWith('Same publisher/title exists')));

const lines = [];
lines.push('# PHILBO September 1 Catalog Import Preview');
lines.push('');
lines.push(`Generated from \`${path.basename(SOURCE)}\`. This is a read-only preview. **No title, publisher, catalog, file, or database records were written.**`);
lines.push('');
lines.push('## Stop-point decision');
lines.push('');
lines.push('- **Production import status: STOPPED — 0 records authorized for production write.**');
lines.push(`- Proposed Philbo Stock Numbers are assigned in source-row order from \`${STOCK_PREFIX}${STOCK_START}\` through \`${STOCK_PREFIX}${STOCK_START + sourceRows.length - 1}\`, one per sellable CSV row.`);
lines.push('- **Sequence lock:** these proposed numbers remain fixed and must not be renumbered or automatically shifted.');
lines.push('- Stock Numbers identify sellable products. Publisher UUIDs are separate internal ownership relationships and do not participate in Stock Number generation.');
lines.push(`- No collision was found in the current isolated prototype catalog or among production Live titles visible through the configured public Supabase policy on ${PUBLIC_LIVE_COLLISION_CHECK_DATE}. The numbers are proposals only—not reserved—because that policy cannot inspect non-Live production rows.`);
lines.push(`- **Authenticated Admin collision check: CLEARED.** On ${AUTHENTICATED_ADMIN_COLLISION_CHECK_DATE}, a read-only SQL Editor query against ${AUTHENTICATED_ADMIN_COLLISION_CHECK_TARGET} searched the complete \`public.titles\` table for \`${STOCK_PREFIX}%\` and returned no rows. The fixed proposed range is cleared for import; clearance does not authorize or execute the import.`);
lines.push(`- **Production Publisher creation completed ${PUBLISHER_CREATION_COMMIT_DATE}:** \`public.organizations\` now contains ${PRODUCTION_ORGANIZATION_COUNT} organizations: \`Philbo Distribution LLC\` plus ${PRODUCTION_PUBLISHER_ORGANIZATION_COUNT} canonical Publishers. Supabase verified ${PUBLISHER_CREATION_COMMITTED_ORGANIZATIONS} Publisher organizations and ${PUBLISHER_CREATION_COMMITTED_PROFILES} matching Publisher profiles.`);
lines.push(`- **Publisher creation dry run: PASSED — ROLLED BACK on ${PUBLISHER_CREATION_DRY_RUN_DATE}.** Supabase reported ${PUBLISHER_CREATION_DRY_RUN_PROPOSED} proposed Publisher records and ${PUBLISHER_CREATION_DRY_RUN_PERSISTED} persisted records after rollback.`);
lines.push('- The confirmed production Publisher UUIDs below are the ownership targets for the eventual migration. Browser-prototype account IDs remain reference-only.');
lines.push('- No authentication users or Publisher invitations were created or sent. All Publisher organizations remain pending onboarding.');
lines.push('- All migrated rows are assigned proposed `fulfillment_method = TBD` until their Publisher explicitly selects a real method. The production enum and Publisher Portal must support that temporary state before import.');
lines.push('- Nineteen missing Series Codes are approved as September-only legacy exceptions. Future Publisher Solicitation submissions still require Series Code.');
lines.push('- The current production `philbo_id` check expects five digits after the hyphen. The corrected Stock Number format uses three digits (`PHI121626-201`), so that constraint must be revised before these values can be stored in that field.');
lines.push('- Five migration-only barcode values receive letter suffixes while preserving the original submitted barcode separately. The current numeric-only barcode constraint requires a scoped legacy-import accommodation.');
lines.push('- Source row 6, Critical Entertainment’s `Planetary Expansion #5`, has an explicit September-only page-count correction from submitted `26` to proposed import value `28`. This does not alter the source CSV and is not an automatic rounding rule.');
lines.push('');
lines.push('## Source and preview totals');
lines.push('');
lines.push('| Check | Result |');
lines.push('|---|---:|');
lines.push(`| Source rows | ${sourceRows.length} |`);
lines.push(`| Source columns | ${headers.length} |`);
lines.push(`| Distinct source publishers | ${publisherMappings.length} |`);
lines.push(`| Publisher relationships resolved by business decision | ${resolvedPublishers.length} of ${publisherMappings.length} |`);
lines.push(`| Existing prototype publisher matches | ${matchedPublishers.length} |`);
lines.push(`| Publishers approved for create/match | ${createOrMatchPublishers.length} |`);
lines.push(`| Publishers still unresolved | ${unmatchedPublishers.length} |`);
lines.push(`| Rows with a resolved publisher relationship plan | ${previews.filter(preview => mappingBySource.get(preview.publisher)?.relationshipResolved).length} |`);
lines.push(`| Record-level rows ready after global checks | ${cleanCandidates.length} |`);
lines.push(`| Record-level rows still blocked | ${reviewCandidates.length} |`);
lines.push(`| Records authorized for database write now | 0 |`);
lines.push(`| Missing cover images | ${missingCovers.length} |`);
lines.push(`| Invalid prices | ${invalidPrices.length} |`);
lines.push(`| Series Code legacy exceptions | ${missingSeriesCode.length} |`);
lines.push(`| Records assigned Fulfillment Method = TBD | ${previews.filter(preview => preview.fulfillmentMethod === 'TBD').length} |`);
lines.push(`| Proposed migration-only barcode modifications | ${barcodeModified.length} |`);
lines.push(`| Explicit September legacy page-count corrections | ${pageCountCorrected.length} |`);
lines.push(`| Proposed Stock Numbers | ${sourceRows.length} (${STOCK_PREFIX}${STOCK_START}–${STOCK_PREFIX}${STOCK_START + sourceRows.length - 1}) |`);
lines.push(`| Prototype collisions with \`PHI121626-\` | ${prototypeStockCollisions.length} |`);
lines.push(`| Read-visible production Live collisions with \`PHI121626-\` (${PUBLIC_LIVE_COLLISION_CHECK_DATE}) | ${PUBLIC_LIVE_COLLISION_COUNT} |`);
lines.push(`| Authenticated Admin all-status production collisions (${AUTHENTICATED_ADMIN_COLLISION_CHECK_DATE}) | ${AUTHENTICATED_ADMIN_COLLISION_COUNT} — CLEARED |`);
lines.push(`| Authenticated production Publisher organizations (${AUTHENTICATED_ORGANIZATION_CHECK_DATE}) | ${PRODUCTION_PUBLISHER_ORGANIZATION_COUNT} of ${publisherMappings.length} |`);
lines.push(`| Publisher creation dry run (${PUBLISHER_CREATION_DRY_RUN_DATE}) | PASSED — ${PUBLISHER_CREATION_DRY_RUN_PROPOSED} proposed / ${PUBLISHER_CREATION_DRY_RUN_PERSISTED} persisted |`);
lines.push(`| Publisher creation commit (${PUBLISHER_CREATION_COMMIT_DATE}) | ${PUBLISHER_CREATION_COMMITTED_ORGANIZATIONS} organizations / ${PUBLISHER_CREATION_COMMITTED_PROFILES} profiles |`);
lines.push(`| Exact barcode matches in existing prototype catalog | ${exactExistingBarcode.length} |`);
lines.push(`| Rows involved in a duplicate barcode inside this source CSV | ${sourceDuplicateBarcode.length} |`);
lines.push(`| Same publisher/title matches treated as distinct submitted SKUs | ${titleOnlyReview.length} |`);
lines.push('');
lines.push('All 61 rows contain a title, barcode, price, cover-image link, original timestamp, description, and BISAC #1. The CSV has no per-title catalog, FOC, or in-store date columns; the intended `cycle_15` supplies September 1, 2026 catalog / November 1, 2026 FOC / December 16, 2026 in-store dates after that cycle assignment is confirmed.');
lines.push('');
lines.push('## Final-resolution readiness answers');
lines.push('');
lines.push(`1. **Total source rows:** ${sourceRows.length}.`);
lines.push(`2. **Total Publishers resolved:** ${resolvedPublishers.length} of ${publisherMappings.length}; all ${PRODUCTION_PUBLISHER_ORGANIZATION_COUNT} canonical Publisher organizations and profiles now exist at their confirmed production UUIDs.`);
lines.push(`3. **Record-level ready count:** ${cleanCandidates.length}.`);
lines.push(`4. **Record-level blocked count:** ${reviewCandidates.length}.`);
lines.push(`5. **Series Code legacy exceptions:** ${missingSeriesCode.length}.`);
lines.push(`6. **Barcode legacy exceptions:** ${barcodeModified.length}, including the migration-only Daybreak A/B treatment.`);
lines.push(`7. **Fulfillment Method = TBD count:** ${previews.filter(preview => preview.fulfillmentMethod === 'TBD').length}.`);
lines.push(`8. **Proposed Philbo Stock Number range:** \`${STOCK_PREFIX}${STOCK_START}\` through \`${STOCK_PREFIX}${STOCK_START + sourceRows.length - 1}\`, fixed and **cleared by authenticated Admin collision check on ${AUTHENTICATED_ADMIN_COLLISION_CHECK_DATE}**.`);
lines.push('9. **Remaining authorization / production-write blockers:** scoped schema support for three-digit Stock Numbers, legacy barcode suffixes, missing Series Codes, provenance, and `TBD`; implementation of acknowledged Inventory → 15% calculations; a fresh pre-import backup; and explicit authorization for the eventual title/SKU/catalog/file import.');
lines.push(`10. **Are all 61 records record-level ready?** ${cleanCandidates.length === sourceRows.length && reviewCandidates.length === 0 ? 'Yes' : 'No'} — ${cleanCandidates.length} ready and ${reviewCandidates.length} blocked. **Authorized for database write now:** 0.`);
lines.push('');
lines.push('## Authenticated collision-check protocol');
lines.push('');
lines.push(`- Current status: **CLEARED BY AUTHENTICATED ADMIN COLLISION CHECK — ${AUTHENTICATED_ADMIN_COLLISION_CHECK_DATE}.**`);
lines.push(`- Evidence: the read-only SQL Editor query against ${AUTHENTICATED_ADMIN_COLLISION_CHECK_TARGET} searched all rows in \`public.titles\` where \`philbo_id like '${STOCK_PREFIX}%'\` and returned **Success. No rows returned**.`);
lines.push('- The authenticated query covered every production title/SKU in `public.titles` without a status filter, including Draft, Submitted, Pending Review, Needs Revision, Approved, Scheduled, Live, Closed, Archived, or Rejected records if present.');
lines.push('- The complete production result was compared against the fixed proposed range `PHI121626-201` through `PHI121626-261`.');
lines.push('- No collisions were returned, so the fixed sequence is **CLEARED FOR IMPORT**. If contradictory production evidence is found later, report each conflicting Stock Number and record; **do not renumber or shift this sequence automatically.**');
lines.push('- Collision clearance does not itself authorize or execute the import.');
lines.push('');
lines.push('## Publisher mapping checkpoint');
lines.push('');
lines.push('| CSV publisher | Rows | Prototype Publisher ID | Canonical production name | Confidence | Confirmed production UUID | Production state |');
lines.push('|---|---:|---|---|---|---|---|');
publisherMappings.forEach(mapping => {
  const relationshipTarget = mapping.publisherId || (mapping.createOrMatch ? '— (no prototype account)' : '**UNRESOLVED**');
  lines.push(`| ${escapeCell(mapping.sourceName)} | ${mapping.rowCount} | ${relationshipTarget} | ${escapeCell(mapping.matchedName || '—')} | ${mapping.confidence} | \`${mapping.proposedProductionPublisherId || 'MISSING'}\` | **PRESENT — PENDING ONBOARDING** |`);
});
lines.push('');
lines.push(`All 17 Publisher relationships now resolve to confirmed production organizations created on ${PUBLISHER_CREATION_COMMIT_DATE}. Supabase verified 17 organizations and 17 matching Publisher profiles. The two aliases remain consolidated as \`Crooked Comix\` → \`Crooked Comix, LLC\` and \`Phantom Blade Productions\` → \`Phantom Blade Productions LLC\`. Private contact emails remain excluded from this report and public product projections. No invitations were sent.`);
lines.push('');
lines.push('### Alias/contact consolidation plan');
lines.push('');
lines.push('- Retain one canonical Crooked Comix, LLC Publisher organization and reassociate any duplicate contacts/relationships to it before removing redundant records.');
lines.push('- Retain one canonical Phantom Blade Productions LLC Publisher organization and treat the shorter CSV name as an alias.');
lines.push('- Prefer the record containing the valid contact email. If duplicates share that email, retain one canonical contact record.');
lines.push('- Do not delete or merge a record with relational data until titles, submissions, users, purchase orders, payouts, and other ownership links have been reassociated and verified.');
lines.push('');
lines.push('## Barcode and product-identity resolutions');
lines.push('');
lines.push('- This import uses a one-time legacy barcode accommodation. The original submitted barcode is preserved separately; only the internal/import value receives the suffix. This is not a permanent Publisher Solicitation rule.');
barcodeModified.forEach(preview => {
  lines.push(`- Source row ${preview.sourceRow}, **${escapeCell(preview.title)}**: original \`${preview.originalBarcode}\` → proposed import value \`${preview.importBarcode}\`.`);
});
lines.push('- Daybreak rows 31 and 32 are separate covers. Row 31 receives suffix A and row 32 suffix B; both retain their fixed, separate Philbo Stock Numbers.');
exactExistingBarcode.forEach(preview => {
  const matches = existingByBarcode.get(preview.originalBarcode) || [];
  lines.push(`- Audit link: row ${preview.sourceRow}'s original barcode \`${preview.originalBarcode}\` is already used by ${matches.map(match => `\`${match.philboId || match.titleId}\` ${escapeCell(match.title)}`).join('; ')}; the proposed import suffix prevents internal collision without erasing that history.`);
});
lines.push('- Rows 54–58 have distinct submitted barcodes and distinct sellable-cover intent. Under the final business decision they remain separate September SKUs, with prior same-title records retained for audit rather than automatically merged.');
lines.push('');
lines.push('## Other manual-review findings');
lines.push('');
lines.push(`- ${missingSeriesCode.length} rows have no Series Code and are explicitly accepted as September legacy exceptions. The production constraint needs a narrow migration path; future submissions remain blocked without Series Code.`);
lines.push('- Source row 6, `Planetary Expansion #5`, submitted `26` pages and now has an explicit proposed import value of `28`. This resolves its row-level blocker without changing the source CSV.');
lines.push('- Source row 40 contains `32 pages`; this will be safely normalized to integer `32`. Its Publisher relationship is resolved for create-or-match, with production UUID pending.');
lines.push('- Publisher logos are missing on 43 rows and interior images on 42 rows. Those are not title-blocking because the publisher logo should normally inherit from the Publisher record and interior art is optional, but links should be preserved for later file review.');
lines.push('- The production schema has no dedicated `source`, `legacy_submitted_at`, `import_batch_id`, or raw legacy metadata fields on `titles`. Audit-safe migration support should be added before production import instead of discarding provenance.');
lines.push('');
lines.push('## Page-count correction and permanent validation');
lines.push('');
lines.push('- The `26` → `28` correction applies only to source row 6 in this September legacy migration preview.');
lines.push('- Permanent Standard Floppy validation requires a positive page count divisible by 4. Valid counts include 24, 28, 32, 36, and other positive multiples of four; there is no fixed 24-page requirement.');
lines.push('- Future Publisher submissions with an invalid Standard Floppy page count must be blocked or returned for correction. The system must never silently round, normalize, or replace the submitted number.');
lines.push('');
lines.push('## Fulfillment and distribution-fee decisions');
lines.push('');
lines.push(`- All ${previews.length} migrated records receive temporary \`fulfillment_method = TBD\`.`);
lines.push('- `TBD` does not imply Inventory and does not trigger the 15% Inventory distribution fee.');
lines.push('- The Publisher Portal must prominently require selection of the real fulfillment method after migration.');
lines.push('- Selecting Inventory must show: **Selecting Inventory fulfillment changes your Philbo distribution fee to 15%.**');
lines.push('- The Publisher must explicitly acknowledge that warning before Inventory can be saved. After confirmation, fulfillment becomes Inventory and the actual commission/payout calculation must use 15%.');
lines.push('- This permanent Inventory rule is a code-and-schema readiness requirement; it is not satisfied by report copy alone.');
lines.push('');
lines.push('## Canonical field mapping');
lines.push('');
lines.push('| Legacy CSV field | Prototype field | Production destination / note |');
lines.push('|---|---|---|');
[
  ['Publisher Name', 'publisherId + publisherName', 'titles.publisher_organization_id + organizations.name'],
  ['Full Title of Book', 'title', 'titles.title'],
  ['Series Name', 'seriesName', 'titles.series_name'],
  ['Issue Number', 'issueNumber', 'titles.issue_number'],
  ['Cover Description', 'coverDescription', 'titles.cover_description'],
  ['Variant Number', 'variantNumber', 'titles.variant_number'],
  ['Barcode / UPC / EAN', 'originalBarcode + importBarcode', 'Preserve original; store suffixed import value only for approved September exceptions'],
  ['Assigned Philbo Stock Number', 'philboId', 'Proposed titles.philbo_id; constraint change required for PHI121626-201 format'],
  ['Price', 'msrp', 'titles.msrp_cents after decimal-to-cents conversion'],
  ['Book Format', 'bookFormat', 'titles.book_format'],
  ['Type of Series', 'seriesType', 'titles.series_type'],
  ['Series Code', 'seriesCode', 'titles.series_code; nullable only for documented September legacy exceptions'],
  ['Series Frequency', 'seriesFrequency', 'titles.series_frequency'],
  ['Media Rating / Age Range', 'ageRange', 'titles.age_rating'],
  ['Page Count', 'submittedPageCount + pageCount', 'titles.page_count after integer parsing; row 6 alone uses the documented 26 → 28 September legacy correction; future invalid submissions are blocked, never auto-corrected'],
  ['BISAC #1/#2/#3', 'bisac1/bisac2/bisac3', 'titles.bisac_1/bisac_2/bisac_3'],
  ['Description of Issue / Book', 'description', 'titles.full_description'],
  ['Brief Synopsis of Book', 'synopsis', 'titles.brief_synopsis'],
  ['Writer / Artist / Cover Artist', 'writer/artist/coverArtist', 'corresponding titles creator fields'],
  ['Color or B&W', 'colorProfile', 'titles.color_mode'],
  ['Width / Height', 'widthInches/heightInches', 'titles.width_inches/height_inches'],
  ['Weight in pounds', 'weightPounds + weightOunces', 'titles.weight_ounces after pounds × 16'],
  ['Reprint / Printing', 'reprint/printingNumber', 'titles.is_reprint/titles.printing_number'],
  ['Available for Reorder', 'availableForReorder', 'titles.available_for_reorder'],
  ['Fulfillment Method', 'fulfillmentMethod = TBD', 'Temporary migration value; Publisher must later select actual method'],
  ['Cover Image / Interior Image', 'coverUrl/additional image', 'title_files records; preserve Google Drive provider IDs'],
  ['Timestamp', 'legacy source timestamp', 'requires migration/audit field; do not overwrite created_at'],
  ['Submitter email / contact / phone', 'private legacy metadata only', 'never expose through public_catalog']
].forEach(([legacy, prototype, production]) => lines.push(`| ${escapeCell(legacy)} | ${escapeCell(prototype)} | ${escapeCell(production)} |`));
lines.push('');
lines.push('## Record-level preview');
lines.push('');
lines.push('| Row | Publisher relationship | Original → import barcode | Title | Issue / variant | Submitted → import pages | Proposed Philbo Stock Number | Fulfillment | Readiness | Resolution / blocker |');
lines.push('|---:|---|---|---|---|---|---|---|---|---|');
previews.forEach(preview => {
  const mapping = mappingBySource.get(preview.publisher);
  const relationshipTarget = mapping?.proposedProductionPublisherId || 'UNRESOLVED';
  const barcodeDisplay = preview.originalBarcode === preview.importBarcode ? preview.originalBarcode : `${preview.originalBarcode} → ${preview.importBarcode}`;
  const pageCountDisplay = preview.submittedPageCount === preview.pageCount ? preview.pageCount : `${preview.submittedPageCount} → ${preview.pageCount}`;
  const notes = [...preview.resolutionNotes, ...preview.reasons];
  lines.push(`| ${preview.sourceRow} | ${escapeCell(preview.publisher)} → ${relationshipTarget} | ${escapeCell(barcodeDisplay || '—')} | ${escapeCell(preview.title)} | ${escapeCell(`${preview.issue || '—'} / ${preview.variant || '—'}`)} | ${escapeCell(pageCountDisplay || '—')} | **${preview.proposedStockNumber}** | ${preview.fulfillmentMethod} | ${preview.status} | ${escapeCell(notes.join('; ') || '—')} |`);
});
lines.push('');
lines.push('## Local production-preparation package');
lines.push('');
lines.push('- `supabase/migrations/20260827090000_add_legacy_tbd_fulfillment.sql` proposes the isolated `TBD` enum prerequisite.');
lines.push('- `supabase/migrations/20260827091000_september_legacy_import_support.sql` proposes scoped import provenance, legacy validation exceptions, permanent divisible-by-four Standard Floppy validation, and acknowledged Inventory → 15% payout support.');
lines.push(`- \`docs/import-previews/PHILBO_SEPT1_PUBLISHER_CREATION_DRY_RUN.sql\` contains the 17 proposed Publisher UUID/name records inside a transaction that always ends with \`ROLLBACK\`. It passed in Supabase on ${PUBLISHER_CREATION_DRY_RUN_DATE}: ${PUBLISHER_CREATION_DRY_RUN_PROPOSED} proposed, ${PUBLISHER_CREATION_DRY_RUN_PERSISTED} persisted.`);
lines.push(`- \`docs/import-previews/PHILBO_SEPT1_CREATE_17_PUBLISHERS.sql\` was explicitly authorized and committed on ${PUBLISHER_CREATION_COMMIT_DATE}. Supabase verified ${PUBLISHER_CREATION_COMMITTED_ORGANIZATIONS} organizations and ${PUBLISHER_CREATION_COMMITTED_PROFILES} profiles. No users or invitations were created.`);
lines.push('- **Preparation status: PUBLISHERS CREATED; catalog-support migrations and all title/SKU/catalog/file writes remain unapplied.**');
lines.push('');
lines.push('## Required confirmations before any write');
lines.push('');
lines.push(`- **Completed:** authenticated Admin collision check across the complete production \`public.titles\` table on ${AUTHENTICATED_ADMIN_COLLISION_CHECK_DATE}; no \`${STOCK_PREFIX}\` records were found, so 201–261 remain fixed and cleared.`);
lines.push('1. Revise the production Stock Number / `philbo_id` constraint to accept the confirmed three-digit sequence without weakening uniqueness.');
lines.push('2. Add a scoped September migration mechanism that preserves original barcodes while allowing the five proposed A/B suffixed import values without changing future submission rules.');
lines.push('3. Add the documented legacy Series Code exception without weakening the permanent Publisher Solicitation requirement.');
lines.push('4. Add `TBD` fulfillment support and implement the acknowledged Inventory → 15% rule in both the Publisher Portal and actual commission/payout calculations.');
lines.push(`- **Completed:** all ${PUBLISHER_CREATION_COMMITTED_ORGANIZATIONS} canonical Publisher organizations and profiles were created at their confirmed UUIDs on ${PUBLISHER_CREATION_COMMIT_DATE}; no invitations were sent.`);
lines.push('6. Add production migration fields for source provenance and take the required table backup immediately before the eventual import.');
lines.push('');
lines.push('**Checkpoint enforced: the script only read source/repository data and generated this report. It contains no insert, update, delete, upsert, or localStorage persistence outside its isolated in-memory process.**');

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ output: OUTPUT, sourceRows: sourceRows.length, publishers: publisherMappings.length, publisherRelationshipsResolved: resolvedPublishers.length, existingPublisherMatches: matchedPublishers.length, publisherCreateOrMatch: createOrMatchPublishers.length, unmatchedPublishers: unmatchedPublishers.length, recordLevelReady: cleanCandidates.length, recordLevelBlocked: reviewCandidates.length, barcodeModifications: barcodeModified.length, pageCountLegacyCorrections: pageCountCorrected.length, seriesCodeLegacyExceptions: missingSeriesCode.length, fulfillmentTbd: previews.filter(preview => preview.fulfillmentMethod === 'TBD').length, authorizedToWrite: 0 }, null, 2));
