import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const authorizedActorEmail = 'mauramariepowers+retailer@gmail.com';
const sources = [
  {
    issue: 14,
    file: 'src/data/philviews-14-august-november-2026.json',
    cycleId: '14000000-0000-4000-8000-000000000014',
    batchId: '14000000-0000-4000-8000-000000000114',
    name: 'PHILVIEWS #14 • August 1, 2026 Catalog • October 1, 2026 FOC • November 11, 2026 In-Store',
    catalogDate: '2026-08-01',
    focDate: '2026-10-01',
    inStoreDate: '2026-11-11',
    pdfUrl: 'https://philbodistribution.com/s/August_NovCatalog_2026sml.pdf'
  },
  {
    issue: 15,
    file: 'src/data/philviews-15-september-december-2026.json',
    cycleId: '15000000-0000-4000-8000-000000000015',
    batchId: '15000000-0000-4000-8000-000000000115',
    name: 'PHILVIEWS #15 • September 1, 2026 Catalog • November 1, 2026 FOC • December 16, 2026 In-Store',
    catalogDate: '2026-09-01',
    focDate: '2026-11-01',
    inStoreDate: '2026-12-16',
    pdfUrl: 'https://philbodistribution.com/s/SEPT2026-Dec2026_linksm.pdf'
  }
];

const knownPublishers = new Map([
  ['20thplacemedia', ['3811302a-dd82-4a06-985b-35afe4957c17', '20th Place Media', '20th-place-media']],
  ['4speedstudios', ['82028526-e6a8-42b8-b26e-86cfb9e991a8', '4 Speed Studios', '4-speed-studios']],
  ['apexcomicsgroup', ['ac704c8e-e112-468b-ad57-48be22ffadc8', 'APEX COMICS GROUP', 'apex-comics-group']],
  ['brokenoarcomics', ['af0a46f8-e54b-4452-aac4-3a689188ec39', 'Broken Oar Comics', 'broken-oar-comics']],
  ['criticalentertainment', ['33f59355-02ed-4859-874e-9e51e33e131d', 'Critical Entertainment', 'critical-entertainment']],
  ['crookedcomixllc', ['28bec1a4-b2a2-494b-9719-81b396305e58', 'Crooked Comix, LLC', 'crooked-comix-llc']],
  ['dreamscapepublishing', ['b742240d-17d7-48ad-9477-dbd192326faf', 'Dreamscape Publishing', 'dreamscape-publishing']],
  ['fairsquaregraphics', ['3c0724de-8fff-494c-98a4-0a6cfba76841', 'FairSquare Graphics', 'fairsquare-graphics']],
  ['hermespress', ['b774447e-2ec1-4d57-bd06-98bea11d2b3e', 'Hermes Press', 'hermes-press']],
  ['heroicpublishinginc', ['e64181b7-a440-4f0c-b694-a6e3c7a56b96', 'Heroic Publishing Inc', 'heroic-publishing-inc']],
  ['highvibrationalpiratesyndicateofwesternnewyork', ['1a54e853-79c1-4e38-b127-e5ad18be31ef', 'High-Vibrational Pirate Syndicate of Western New York', 'high-vibrational-pirate-syndicate-western-new-york']],
  ['homebrewedcomics', ['6918da47-bb9a-4019-9a4e-5fe0ffaaf61a', 'Homebrewed Comics', 'homebrewed-comics']],
  ['newpainpro', ['cccd6967-e9ad-4d20-8588-d7997ca76c26', 'New Pain Pro', 'new-pain-pro']],
  ['phantombladeproductionsllc', ['c641d442-8d1a-49c3-8f7e-ebd082b33621', 'Phantom Blade Productions LLC', 'phantom-blade-productions-llc']],
  ['philbopublishing', ['f443d302-f378-4a30-b4c7-0a2bc9a37c7a', 'Philbo Publishing', 'philbo-publishing']],
  ['silverlinecomics', ['2e2ddf1e-099c-45ce-b62d-049d01667d81', 'Silverline Comics', 'silverline-comics']],
  ['starcrosscomics', ['02466c1d-4e5a-4d57-908d-c7ff97599d91', 'Star Cross Comics', 'star-cross-comics']]
]);

const aliases = new Map([
  ['crookedcomix', 'crookedcomixllc'],
  ['dreamscpaepublishing', 'dreamscapepublishing'],
  ['dreanscapepublishing', 'dreamscapepublishing'],
  ['highvibrationalpiratesofwesternnewyork', 'highvibrationalpiratesyndicateofwesternnewyork'],
  ['phantombladeproductions', 'phantombladeproductionsllc']
]);

const key = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const deterministicUuid = seed => {
  const hex = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};
const sqlText = value => value === null || value === undefined || value === '' ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const sqlPositiveNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : 'null';
};
const sqlNonnegativeNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? String(number) : 'null';
};
const sqlBoolean = value => /^(yes|true|1)$/i.test(String(value || '')) ? 'true' : 'false';

const loaded = sources.map(source => {
  const absolute = path.join(root, source.file);
  const raw = fs.readFileSync(absolute);
  return { ...source, raw, rows: JSON.parse(raw), sha256: crypto.createHash('sha256').update(raw).digest('hex') };
});
const allRows = loaded.flatMap(source => source.rows.map(row => ({ ...row, source })));

const newPublishers = new Map();
for (const row of allRows) {
  let normalized = aliases.get(key(row.publisherName)) || key(row.publisherName);
  if (!knownPublishers.has(normalized)) {
    const canonicalName = String(row.publisherName).trim();
    const publisherSlug = slug(canonicalName);
    const record = [deterministicUuid(`philbo-publisher:${publisherSlug}`), canonicalName, publisherSlug];
    knownPublishers.set(normalized, record);
    newPublishers.set(normalized, record);
  }
}

const publisherFor = name => {
  const normalized = aliases.get(key(name)) || key(name);
  const match = knownPublishers.get(normalized);
  if (!match) throw new Error(`Unmapped publisher: ${name}`);
  return match;
};

const ids = allRows.map(row => row.philboId);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate Philbo IDs across current catalogs.');
if (loaded.some(source => source.rows.length !== (source.issue === 14 ? 85 : 61))) throw new Error('Unexpected current catalog row count.');
for (const row of allRows) {
  for (const required of ['philboId', 'publisherName', 'barcode', 'title', 'msrp', 'coverUrl']) {
    if (!row[required]) throw new Error(`${row.philboId || 'Unknown row'} is missing ${required}.`);
  }
  if (/standard floppy comic|single issue/i.test(row.bookFormat || '') && Number(row.pageCount) % 4 !== 0) {
    throw new Error(`${row.philboId} has an invalid floppy page count.`);
  }
}

const knownPublisherIds = [...new Set([...knownPublishers.values()].slice(0, 17).map(record => record[0]))];
const participantPublishers = [...new Map(allRows.map(row => {
  const record = publisherFor(row.publisherName);
  return [record[0], record];
})).values()];

const organizationValues = [...newPublishers.values()]
  .map(([id, name, publisherSlug]) => `  (${sqlText(id)}, 'publisher', ${sqlText(name)}, ${sqlText(publisherSlug)}, 'active')`)
  .join(',\n');

const cycleValues = loaded.map(source => `  (${sqlText(source.cycleId)}, ${sqlText(source.name)}, ${sqlText(source.catalogDate)}, ${sqlText(source.focDate)}, ${sqlText(source.inStoreDate)}, 'retailer_ordering_open', false, true, true, ${sqlText(`Authorized production import of PHILVIEWS #${source.issue}`)}, now(), (select user_id from pg_temp.philbo_import_actor), 1, ${sqlText(source.pdfUrl)})`).join(',\n');

const batchValues = loaded.map(source => `  (${sqlText(source.batchId)}, ${sqlText(`PHILVIEWS_${source.issue}_2026_PRODUCTION`)}, ${sqlText(path.basename(source.file))}, ${sqlText(source.sha256)}, ${source.rows.length}, 'imported', now(), now(), (select user_id from pg_temp.philbo_import_actor), now())`).join(',\n');

const titleValues = allRows.map(row => {
  const source = row.source;
  const publisher = publisherFor(row.publisherName);
  const sourceBarcode = String(row.barcode);
  const barcode = sourceBarcode.replace(/[^0-9A-Za-z]/g, '');
  if (!/^[0-9]+[AB]?$/.test(barcode)) {
    throw new Error(`${row.philboId} has an unsupported source barcode: ${sourceBarcode}`);
  }
  const originalBarcode = barcode.replace(/[A-Za-z]+$/, '');
  const metadata = {
    source_file: row.sourceFile,
    source_row: row.sourceRowNumber,
    product_slug: row.productSlug,
    direct_product_url: row.directProductUrl,
    source_barcode: sourceBarcode,
    source_printing_number: row.printingNumber,
    imported_catalog_record: true,
    authorized_import: `PHILVIEWS #${source.issue}`
  };
  return `  (${sqlText(deterministicUuid(`philbo-title:${row.philboId}`))}, ${sqlText(publisher[0])}, ${sqlText(source.cycleId)}, ${sqlText(row.philboId)}, ${sqlText(barcode)}, ${sqlText(row.title)}, ${sqlText(row.seriesName)}, ${sqlText(row.issueNumber)}, ${sqlText(row.variantNumber)}, ${sqlText(row.coverDescription)}, ${sqlText(row.language || 'English')}, ${sqlText(row.bookFormat)}, ${sqlText(row.seriesType)}, ${sqlText(row.seriesCode)}, ${sqlText(row.seriesFrequency)}, ${sqlText(row.ageRange)}, ${Math.round(Number(row.msrp) * 100)}, ${sqlText(row.synopsis)}, ${sqlText(row.description)}, ${sqlText(row.writer)}, ${sqlText(row.artist)}, ${sqlText(row.coverArtist)}, ${sqlText(row.bisac1)}, ${sqlText(row.bisac2)}, ${sqlText(row.bisac3)}, ${sqlPositiveNumber(row.pageCount)}, ${sqlText(row.colorProfile)}, ${sqlPositiveNumber(row.width)}, ${sqlPositiveNumber(row.height)}, ${sqlNonnegativeNumber(row.weightOunces)}, ${sqlBoolean(row.reprint)}, ${sqlPositiveNumber(row.printingNumber)}, ${sqlBoolean(row.availableForReorder)}, ${sqlText(row.genre)}, 'live', 'tbd', now(), now(), (select user_id from pg_temp.philbo_import_actor), now(), (select user_id from pg_temp.philbo_import_actor), (select user_id from pg_temp.philbo_import_actor), ${sqlText(source.batchId)}, ${sqlText(`PHILVIEWS #${source.issue} authorized production import`)}, now(), ${sqlText(originalBarcode)}, ${sqlText(JSON.stringify(metadata))}::jsonb, ${row.seriesCode ? 'false' : 'true'}, ${source.issue === 15 && row.sourceRowNumber === 6 ? 'true' : 'false'}, ${sqlText(row.coverUrl)}, ${sqlText(row.publisherLogoUrl)}, ${sqlText(row.interiorImageUrl)})`;
}).join(',\n');

const participantIds = participantPublishers.map(record => sqlText(record[0])).join(', ');
const newPublisherIds = [...newPublishers.values()].map(record => sqlText(record[0])).join(', ');
const knownIds = knownPublisherIds.map(sqlText).join(', ');

const migration = `-- Authorized PHILVIEWS #14 and #15 production catalog import.
-- Source records: 85 + 61 = 146. This transaction touches only catalog and
-- participating Publisher records. It intentionally does not touch customers,
-- orders, payments, shipments, returns, credentials, or files.

begin;

do $$
begin
  if (select count(*) from public.titles) <> 0
     or (select count(*) from public.catalog_cycles) <> 0
     or (select count(*) from public.catalog_publication_items) <> 0
     or (select count(*) from public.catalog_import_batches) <> 0 then
    raise exception 'Catalog import stopped: production catalog tables are no longer empty.';
  end if;
  if (select count(*) from public.organizations where id in (${knownIds})) <> 17 then
    raise exception 'Catalog import stopped: the 17 reviewed September Publisher UUIDs are not intact.';
  end if;
  if (select count(*) from public.profiles where lower(email) = lower(${sqlText(authorizedActorEmail)})) <> 1 then
    raise exception 'Catalog import stopped: the authorized production profile was not found exactly once.';
  end if;
end
$$;

create temporary table pg_temp.philbo_import_actor (user_id uuid primary key) on commit drop;
insert into pg_temp.philbo_import_actor (user_id)
select user_id from public.profiles where lower(email) = lower(${sqlText(authorizedActorEmail)});

${organizationValues ? `insert into public.organizations (id, organization_type, name, slug, account_status)\nvalues\n${organizationValues};\n\ninsert into public.publisher_profiles (organization_id, legal_business_name)\nselect id, name from public.organizations where id in (${newPublisherIds});` : ''}

update public.organizations
set account_status = 'active', updated_at = now()
where id in (${participantIds});

insert into public.publisher_profiles (organization_id, legal_business_name)
select id, name from public.organizations where id in (${participantIds})
on conflict (organization_id) do nothing;

alter table public.titles
  add column if not exists cover_url text,
  add column if not exists publisher_logo_url text,
  add column if not exists interior_image_url text;

alter table public.titles drop constraint if exists titles_philbo_id_permanent_or_september_check;
alter table public.titles drop constraint if exists titles_philbo_id_permanent_or_legacy_check;
alter table public.titles add constraint titles_philbo_id_permanent_or_legacy_check check (
  philbo_id is null
  or philbo_id ~ '^[^[:space:]]+-[0-9]{5}$'
  or (
    import_batch_id is not null
    and philbo_id ~ '^(PHI121626|PHI-111126)-[0-9]{3}$'
  )
);

insert into public.catalog_import_batches (
  id, import_code, source_filename, source_sha256, source_row_count, status,
  previewed_at, authorized_at, authorized_by, imported_at
)
values
${batchValues};

insert into public.catalog_cycles (
  id, name, catalog_date, foc_date, in_store_date, status,
  publisher_submissions_open, retailer_ordering_open, retailer_download_enabled,
  admin_notes, published_at, published_by, publication_version, catalog_pdf_url
)
values
${cycleValues};

insert into public.titles (
  id, publisher_organization_id, catalog_cycle_id, philbo_id, barcode, title,
  series_name, issue_number, variant_number, cover_description, language,
  book_format, series_type, series_code, series_frequency, age_rating,
  msrp_cents, brief_synopsis, full_description, writer, artist, cover_artist,
  bisac_1, bisac_2, bisac_3, page_count, color_mode, width_inches,
  height_inches, weight_ounces, is_reprint, printing_number,
  available_for_reorder, genre, status, fulfillment_method, submitted_at,
  approved_at, approved_by, published_at, published_by, created_by,
  import_batch_id, legacy_source, legacy_submitted_at, legacy_original_barcode,
  legacy_metadata, legacy_series_code_exception, legacy_page_count_corrected,
  cover_url, publisher_logo_url, interior_image_url
)
values
${titleValues};

insert into public.catalog_publication_items (
  catalog_cycle_id, title_id, publication_version, published_at, published_by
)
select t.catalog_cycle_id, t.id, 1, now(), (select user_id from pg_temp.philbo_import_actor)
from public.titles t
where t.import_batch_id in (${loaded.map(source => sqlText(source.batchId)).join(', ')});

drop view if exists public.public_catalog;
create view public.public_catalog
with (security_invoker = true)
as
select
  t.id, t.philbo_id, t.barcode, t.title, o.name as publisher_name,
  t.series_name, t.issue_number, t.variant_number, t.cover_description,
  t.language, t.book_format, t.series_type, t.series_frequency, t.age_rating,
  t.msrp_cents, t.brief_synopsis, t.full_description, t.writer, t.artist,
  t.cover_artist, t.bisac_1, t.bisac_2, t.bisac_3, t.page_count,
  t.color_mode, t.width_inches, t.height_inches, t.weight_ounces,
  t.is_reprint, t.printing_number, t.available_for_reorder, t.trailer_url,
  t.genre, t.cover_url, t.publisher_logo_url, t.interior_image_url,
  c.id as catalog_cycle_id, c.name as catalog_cycle_name, c.catalog_date,
  c.foc_date, c.in_store_date, c.status as catalog_cycle_status,
  c.publication_version, c.published_at as catalog_published_at,
  c.catalog_pdf_url, t.published_at, t.incentive_ratio, t.incentive_rules
from public.catalog_publication_items item
join public.titles t on t.id = item.title_id
join public.organizations o on o.id = t.publisher_organization_id
join public.catalog_cycles c on c.id = item.catalog_cycle_id
where t.status in ('approved', 'scheduled', 'live');

revoke all on public.public_catalog from public;
grant select on public.public_catalog to anon, authenticated;
grant select (genre, cover_url, publisher_logo_url, interior_image_url) on public.titles to anon;

do $$
begin
  if (select count(*) from public.titles where import_batch_id in (${loaded.map(source => sqlText(source.batchId)).join(', ')})) <> 146 then
    raise exception 'Catalog import verification failed: expected 146 titles.';
  end if;
  if (select count(*) from public.catalog_publication_items where catalog_cycle_id in (${loaded.map(source => sqlText(source.cycleId)).join(', ')})) <> 146 then
    raise exception 'Catalog import verification failed: expected 146 published title rows.';
  end if;
end
$$;

commit;
`;

const rollback = `-- Emergency rollback for the authorized PHILVIEWS #14/#15 import only.
-- This intentionally fails if commerce records already reference imported titles.
begin;
delete from public.catalog_publication_items where catalog_cycle_id in (${loaded.map(source => sqlText(source.cycleId)).join(', ')});
delete from public.titles where import_batch_id in (${loaded.map(source => sqlText(source.batchId)).join(', ')});
delete from public.catalog_cycles where id in (${loaded.map(source => sqlText(source.cycleId)).join(', ')});
delete from public.catalog_import_batches where id in (${loaded.map(source => sqlText(source.batchId)).join(', ')});
${newPublisherIds ? `delete from public.publisher_profiles where organization_id in (${newPublisherIds});\ndelete from public.organizations where id in (${newPublisherIds});` : ''}
commit;
`;

const migrationPath = path.join(root, 'supabase/migrations/20260916233000_import_philviews_14_15.sql');
const rollbackPath = path.join(root, 'docs/import-previews/PHILVIEWS_14_15_PRODUCTION_IMPORT_ROLLBACK.sql');
fs.writeFileSync(migrationPath, migration);
fs.writeFileSync(rollbackPath, rollback);
console.log(JSON.stringify({
  migrationPath,
  rollbackPath,
  titleCount: allRows.length,
  cycle14: loaded[0].rows.length,
  cycle15: loaded[1].rows.length,
  participantPublishers: participantPublishers.length,
  newPublishers: [...newPublishers.values()].map(([, name]) => name)
}, null, 2));
