import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseCsvRows } from '../src/lib/csv-order.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'import-previews');
const REPORT_PATH = path.join(OUTPUT_DIR, 'PHILBO_HISTORICAL_CATALOG_IMPORT_PREVIEW.md');
const ROWS_PATH = path.join(OUTPUT_DIR, 'PHILBO_HISTORICAL_CATALOG_ROW_MAPPING.csv');
const AUTHORIZED_TO_WRITE = false;

const schedule = [
  ['2025-07-01', '2025-09-01', '2025-10-15'],
  ['2025-08-01', '2025-10-01', '2025-11-12'],
  ['2025-09-01', '2025-11-01', '2025-12-17'],
  ['2025-10-01', '2025-12-01', '2026-01-14'],
  ['2025-11-01', '2026-01-01', '2026-02-11'],
  ['2025-12-01', '2026-02-01', '2026-03-11'],
  ['2026-01-01', '2026-03-01', '2026-04-15'],
  ['2026-02-01', '2026-04-01', '2026-05-13'],
  ['2026-03-01', '2026-05-01', '2026-06-17'],
  ['2026-04-01', '2026-06-01', '2026-07-15'],
  ['2026-05-01', '2026-07-01', '2026-08-12'],
  ['2026-06-01', '2026-08-01', '2026-09-16'],
  ['2026-07-01', '2026-09-01', '2026-10-14'],
  ['2026-08-01', '2026-10-01', '2026-11-11'],
  ['2026-09-01', '2026-11-01', '2026-12-16'],
  ['2026-10-01', '2026-12-01', '2027-01-13'],
  ['2026-11-01', '2027-01-01', '2027-02-10'],
  ['2026-12-01', '2027-02-01', '2027-03-17']
].map(([catalogDate, focDate, storeDate], index) => ({
  cycleNumber: index + 1,
  cycleId: `historical-${catalogDate}`,
  catalogDate,
  focDate,
  storeDate,
  cycleName: `${catalogDate} Catalog • ${focDate} FOC • ${storeDate} In-Store`
}));

const scheduleByCatalogDate = new Map(schedule.map(cycle => [cycle.catalogDate, cycle]));

const sources = [
  {
    path: '/Users/maurapowers/Downloads/PHILBO_ProductData_September2025_October2025.csv',
    catalogDate: '2025-07-01',
    filenameNote: 'Filename represents the September FOC / October store window; official schedule identifies the July catalog.'
  },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_August2025_Nov25.csv', catalogDate: '2025-08-01' },
  {
    path: '/Users/maurapowers/Downloads/PHILBO_ProductData_October2025_Jan2025 .csv',
    catalogDate: '2025-10-01',
    filenameNote: 'January year in the filename is incorrect; the official store date is in 2026.'
  },
  {
    path: '/Users/maurapowers/Downloads/PHILBO_ProductData_November2026_February2026.csv',
    catalogDate: '2025-11-01',
    filenameNote: 'November year in the filename is incorrect; this is the November 2025 catalog.'
  },
  {
    path: '/Users/maurapowers/Downloads/PHILBO_ProductData_December2026_March26.csv',
    catalogDate: '2025-12-01',
    filenameNote: 'December year in the filename is incorrect; this is the December 2025 catalog.'
  },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_January2026-April2026.csv', catalogDate: '2026-01-01' },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_February2026-May-2026.csv', catalogDate: '2026-02-01' },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_March2026_June_2026.csv', catalogDate: '2026-03-01' },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData__April2026_July2026.csv', catalogDate: '2026-04-01' },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_May2026_August26.csv', catalogDate: '2026-05-01' },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_June2026_Sept2026.csv', catalogDate: '2026-06-01' },
  { path: '/Users/maurapowers/Downloads/PHILBO_ProductData_July2026_Oct2026.csv', catalogDate: '2026-07-01' }
];

const duplicateSource = {
  path: '/Users/maurapowers/Downloads/PHILBO_ProductData_October2025_January2025.csv',
  duplicateOf: '/Users/maurapowers/Downloads/PHILBO_ProductData_October2025_Jan2025 .csv'
};

const productionPublisherIds = new Map([
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

const canonicalAliases = new Map([
  ['ablaze', 'ABLAZE Publishing'],
  ['ablazepublishing', 'ABLAZE Publishing'],
  ['akidandacomic', 'A Kid and A Comic'],
  ['akidandacomicinc', 'A Kid and A Comic'],
  ['alphacomics', 'Alpha Comics'],
  ['antarcticpress', 'Antarctic Press'],
  ['antarcticpressinc', 'Antarctic Press'],
  ['antarticpressinc', 'Antarctic Press'],
  ['chikaracomicsstudio', 'Studio Chikara and First Comics'],
  ['committedcomics100overshipperorder', 'Committed Comics'],
  ['dreascapepublishing', 'Dreamscape Publishing'],
  ['dren', 'Dren Productions'],
  ['drenproductionsafterdark', 'Dren Productions'],
  ['grokcomics', 'Grok! Comics'],
  ['heroicpublishinginc', 'Heroic Publishing Inc'],
  ['highvibrationalpirates', 'High-Vibrational Pirate Syndicate of Western New York'],
  ['highvibrationalpiratesyndicateofwesternnewyork', 'High-Vibrational Pirate Syndicate of Western New York'],
  ['highvibrationalpiratesyndicateofwesternnewyorkthe', 'High-Vibrational Pirate Syndicate of Western New York'],
  ['thehighvibrationalpiratesyndicateofwesternnewyork', 'High-Vibrational Pirate Syndicate of Western New York'],
  ['hermespressaristopublicationsimprint', 'Hermes Press'],
  ['knucklesupperstudios', 'Knuckle Supper Studios'],
  ['monstrous', 'Monstrous Books'],
  ['newpainproductions', 'New Pain Pro'],
  ['nbmgraphicnovels', 'NBM Publishing'],
  ['nbmgraphicnovelsablaze', 'NBM Publishing'],
  ['nbmgraphicnovelsablazeimprint', 'NBM Publishing'],
  ['nbmpublishing', 'NBM Publishing'],
  ['phantombladeproductions', 'Phantom Blade Productions LLC'],
  ['phantombladeproductionsllc', 'Phantom Blade Productions LLC'],
  ['philbopublisher', 'Philbo Publishing'],
  ['red5', 'Red 5 Comics'],
  ['roguematter', 'Rogue Matter'],
  ['roguematters', 'Rogue Matter'],
  ['rougematters', 'Rogue Matter'],
  ['starcrosscomic', 'Star Cross Comics'],
  ['starcrosscomics', 'Star Cross Comics'],
  ['studiochikara', 'Studio Chikara and First Comics']
]);

const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const escapeMarkdown = value => clean(value).replaceAll('|', '\\|');
const csvCell = value => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const monthNumbers = new Map([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9], ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11], ['dec', 12], ['december', 12]
]);

const isoDate = (year, month, day) => {
  const normalizedYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
  const date = new Date(Date.UTC(normalizedYear, Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== normalizedYear || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return '';
  return `${normalizedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseLegacyDate = (value, expectedDate) => {
  const raw = clean(value);
  if (!raw) return '';
  const expectedYear = Number(expectedDate.slice(0, 4));
  const expectedMonth = Number(expectedDate.slice(5, 7));
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return isoDate(match[1], match[2], match[3]);
  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) return isoDate(match[3], match[1], match[2]);
  match = raw.toLowerCase().match(/^([a-z]+)[\s-]?(\d{1,2})[\s,-]?(\d{2,4})?$/);
  if (match && monthNumbers.has(match[1])) return isoDate(match[3] || expectedYear, monthNumbers.get(match[1]), match[2]);
  match = raw.toLowerCase().match(/^(\d{1,2})[\s-]([a-z]+)(?:[\s-](\d{2,4}))?$/);
  if (match && monthNumbers.has(match[2])) return isoDate(match[3] || expectedYear, monthNumbers.get(match[2]), match[1]);
  const monthOnly = monthNumbers.get(raw.toLowerCase());
  if (monthOnly && monthOnly === expectedMonth) return expectedDate;
  return '';
};

const compareLegacyDate = (label, rawValue, officialValue) => {
  if (!rawValue) return '';
  const parsed = parseLegacyDate(rawValue, officialValue);
  if (!parsed) return `Unparsed legacy ${label} value: ${rawValue}`;
  return parsed === officialValue ? '' : `Raw ${label} ${rawValue} differs from official ${officialValue}`;
};

const fields = {
  publisher: ['publishername', 'publisher'],
  title: ['fulltitleofbook', 'fulltitle', 'titleofbook', 'webtitle', 'fullwebtitle', 'title'],
  barcode: ['barcodeupcean', 'thebarcodeupceannumericentriesonly', 'barcode', 'upc', 'barcodesku'],
  stockNumber: ['philbostockcode', 'philbostock', 'philbostockid', 'philbostockidnumber', 'philbostocknumber', 'philboid', 'philbostock'],
  issueNumber: ['issuenumber', 'issue', 'seriesnumber'],
  variantNumber: ['variantnumber'],
  coverDescription: ['coverdescription'],
  price: ['priceusd', 'price', 'retail'],
  rawCatalogDate: ['originalcatalogdate', 'catalogdate', 'initialorderdate', 'initialorderdue'],
  rawFocDate: ['focdate', 'foc'],
  rawStoreDate: ['onsaledate', 'instoredate', 'releasedate', 'instore']
};

const valueAt = (headers, values, candidates) => {
  for (const candidate of candidates) {
    const index = headers.findIndex(header => header === candidate);
    if (index >= 0 && clean(values[index])) return clean(values[index]);
  }
  return '';
};

const canonicalizePublisher = sourceName => {
  const sourceKey = normalize(sourceName);
  if (!sourceKey) return { canonicalName: '', method: 'Missing publisher' };
  if (sourceKey.startsWith('adventcomicsunboundrealms')) {
    return { canonicalName: 'Advent Comics', method: 'Known Advent Comics imprint label' };
  }
  const alias = canonicalAliases.get(sourceKey);
  return alias
    ? { canonicalName: alias, method: alias === clean(sourceName) ? 'Exact canonical name' : 'Normalized legacy alias' }
    : { canonicalName: clean(sourceName), method: 'Exact source name pending account match' };
};

const sha256 = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const duplicateHash = sha256(duplicateSource.path);
const duplicateOfHash = sha256(duplicateSource.duplicateOf);
if (duplicateHash !== duplicateOfHash) throw new Error('The two October source files are no longer exact duplicates.');

const allRows = [];
const fileSummaries = [];

for (const source of sources) {
  if (!fs.existsSync(source.path)) throw new Error(`Missing source file: ${source.path}`);
  const cycle = scheduleByCatalogDate.get(source.catalogDate);
  if (!cycle) throw new Error(`No official schedule entry for ${source.catalogDate}`);
  const parsed = parseCsvRows(fs.readFileSync(source.path, 'utf8'));
  const sourceHeaders = parsed[0] || [];
  const headers = sourceHeaders.map(normalize);
  const records = parsed.slice(1);
  let ignoredRows = 0;
  const fileRows = [];

  records.forEach((values, index) => {
    const extracted = Object.fromEntries(Object.entries(fields).map(([name, candidates]) => [name, valueAt(headers, values, candidates)]));
    const sectionHeading = !extracted.publisher && !extracted.barcode && !extracted.stockNumber && !extracted.price && /\breleases?\b/i.test(extracted.title);
    if (sectionHeading) {
      ignoredRows += 1;
      return;
    }
    const substantive = Boolean(extracted.publisher || extracted.title || extracted.barcode || extracted.stockNumber);
    if (!substantive) {
      ignoredRows += 1;
      return;
    }
    const publisher = canonicalizePublisher(extracted.publisher);
    const publisherKey = normalize(publisher.canonicalName);
    const productionPublisherId = productionPublisherIds.get(publisherKey) || '';
    const rowWarnings = [];
    if (!extracted.publisher) rowWarnings.push('Missing publisher');
    if (!extracted.title) rowWarnings.push('Missing title');
    if (!extracted.barcode) rowWarnings.push('Missing barcode');
    else {
      const compactBarcode = extracted.barcode.replace(/[^0-9A-Za-z]/g, '');
      if (compactBarcode.length < 8 || compactBarcode.length > 24) rowWarnings.push('Barcode field is not a usable identifier');
    }
    if (!extracted.stockNumber) rowWarnings.push('Missing historical Philbo Stock Number');
    if (!extracted.price) rowWarnings.push('Missing price');
    [
      compareLegacyDate('catalog/initial date', extracted.rawCatalogDate, cycle.catalogDate),
      compareLegacyDate('FOC date', extracted.rawFocDate, cycle.focDate),
      compareLegacyDate('store date', extracted.rawStoreDate, cycle.storeDate)
    ].filter(Boolean).forEach(warning => rowWarnings.push(warning));
    const assignmentStatus = extracted.publisher && extracted.title
      ? (productionPublisherId ? 'ASSIGNED — CONFIRMED PRODUCTION PUBLISHER' : 'ASSIGN TO PROPOSED PUBLISHER ACCOUNT — NO INVITE')
      : 'BLOCKED — PUBLISHER/TITLE REVIEW';
    const availabilityStatus = 'ARCHIVED HISTORICAL — PUBLISHER MAY REQUEST LISTING, REORDER, OR POD';
    const row = {
      sourceFile: path.basename(source.path),
      sourceRow: index + 2,
      sourceSha256: sha256(source.path),
      cycleId: cycle.cycleId,
      officialCatalogDate: cycle.catalogDate,
      officialFocDate: cycle.focDate,
      officialStoreDate: cycle.storeDate,
      rawCatalogDate: extracted.rawCatalogDate,
      rawFocDate: extracted.rawFocDate,
      rawStoreDate: extracted.rawStoreDate,
      sourcePublisher: extracted.publisher,
      canonicalPublisher: publisher.canonicalName,
      publisherMappingMethod: publisher.method,
      productionPublisherId,
      assignmentStatus,
      title: extracted.title,
      issueNumber: extracted.issueNumber,
      variantNumber: extracted.variantNumber,
      coverDescription: extracted.coverDescription,
      barcode: extracted.barcode,
      historicalStockNumber: extracted.stockNumber,
      price: extracted.price,
      availabilityStatus,
      rowWarnings: rowWarnings.join('; ')
    };
    fileRows.push(row);
    allRows.push(row);
  });

  fileSummaries.push({
    sourceFile: path.basename(source.path),
    sourceSha256: sha256(source.path),
    cycle,
    productRows: fileRows.length,
    ignoredRows,
    publisherCount: new Set(fileRows.map(row => row.canonicalPublisher).filter(Boolean)).size,
    confirmedPublisherRows: fileRows.filter(row => row.productionPublisherId).length,
    proposedPublisherRows: fileRows.filter(row => row.assignmentStatus.startsWith('ASSIGN TO PROPOSED')).length,
    blockedRows: fileRows.filter(row => row.assignmentStatus.startsWith('BLOCKED')).length,
    warningRows: fileRows.filter(row => row.rowWarnings).length,
    filenameNote: source.filenameNote || ''
  });
}

const publisherSummary = new Map();
for (const row of allRows) {
  const key = normalize(row.canonicalPublisher) || '[missing]';
  if (!publisherSummary.has(key)) publisherSummary.set(key, {
    canonicalPublisher: row.canonicalPublisher || '[MISSING PUBLISHER]',
    productionPublisherId: row.productionPublisherId,
    sourceNames: new Set(),
    rows: 0,
    cycles: new Set()
  });
  const publisher = publisherSummary.get(key);
  publisher.rows += 1;
  if (row.sourcePublisher) publisher.sourceNames.add(row.sourcePublisher);
  publisher.cycles.add(row.officialCatalogDate);
}

const exactRowGroups = new Map();
const sameCatalogIdentityGroups = new Map();
const barcodeGroups = new Map();
for (const row of allRows) {
  const identityKey = [row.officialCatalogDate, normalize(row.canonicalPublisher), normalize(row.title), normalize(row.barcode)].join('::');
  sameCatalogIdentityGroups.set(identityKey, [...(sameCatalogIdentityGroups.get(identityKey) || []), row]);
  const exactKey = [identityKey, normalize(row.issueNumber), normalize(row.variantNumber), normalize(row.coverDescription), normalize(row.historicalStockNumber), normalize(row.price)].join('::');
  exactRowGroups.set(exactKey, [...(exactRowGroups.get(exactKey) || []), row]);
  const barcodeKey = normalize(row.barcode);
  if (barcodeKey) barcodeGroups.set(barcodeKey, [...(barcodeGroups.get(barcodeKey) || []), row]);
}
const exactDuplicateGroups = [...exactRowGroups.values()].filter(group => group.length > 1);
const sameIdentityGroups = [...sameCatalogIdentityGroups.values()].filter(group => group.length > 1);
const repeatedBarcodeGroups = [...barcodeGroups.values()].filter(group => new Set(group.map(row => row.officialCatalogDate)).size > 1);

sameIdentityGroups.forEach((group, groupIndex) => {
  const distinguishingValues = new Set(group.map(row => [row.variantNumber, row.coverDescription, row.historicalStockNumber].map(normalize).join('::')));
  const disposition = distinguishingValues.size > 1
    ? 'MULTI-VARIANT/SIZE GROUP — preserve separate SKUs under one solicitation'
    : 'POTENTIAL DUPLICATE ROW — manual review';
  group.forEach(row => {
    row.sameCatalogIdentityGroup = `GROUP-${groupIndex + 1}`;
    row.sameCatalogIdentityDisposition = disposition;
  });
});

const missingCycleFiles = schedule
  .filter(cycle => cycle.catalogDate <= '2026-07-01' && !sources.some(source => source.catalogDate === cycle.catalogDate))
  .map(cycle => cycle.cycleName);

const rowHeaders = [
  'sourceFile', 'sourceRow', 'sourceSha256', 'cycleId', 'officialCatalogDate', 'officialFocDate', 'officialStoreDate',
  'rawCatalogDate', 'rawFocDate', 'rawStoreDate', 'sourcePublisher', 'canonicalPublisher', 'publisherMappingMethod',
  'productionPublisherId', 'assignmentStatus', 'title', 'issueNumber', 'variantNumber', 'coverDescription', 'barcode',
  'historicalStockNumber', 'price', 'availabilityStatus', 'rowWarnings'
  , 'sameCatalogIdentityGroup', 'sameCatalogIdentityDisposition'
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(ROWS_PATH, [
  rowHeaders.join(','),
  ...allRows.map(row => rowHeaders.map(header => csvCell(row[header])).join(','))
].join('\n') + '\n');

const confirmedPublishers = [...publisherSummary.values()].filter(publisher => publisher.productionPublisherId);
const proposedPublishers = [...publisherSummary.values()].filter(publisher => !publisher.productionPublisherId && publisher.canonicalPublisher !== '[MISSING PUBLISHER]');
const blockedRows = allRows.filter(row => row.assignmentStatus.startsWith('BLOCKED'));
const warningRows = allRows.filter(row => row.rowWarnings);

const report = `# PHILBO Historical Catalog Import Preview

Generated: ${new Date().toISOString()}

## Safety checkpoint

- **Authorized to write production data:** ${AUTHORIZED_TO_WRITE ? 'YES' : 'NO'}
- **Production records written:** 0
- **Publisher invitations sent:** 0
- **Source files modified:** 0
- Proposed historical availability: **Archived Historical**. Nothing becomes public, orderable, or printable automatically.

## Readiness summary

- Supplied CSV files: 13
- Exact duplicate files excluded: 1
- Unique catalog files analyzed: ${fileSummaries.length}
- Product-like source rows: ${allRows.length}
- Publisher/title assignment-ready rows: ${allRows.length - blockedRows.length}
- Blocked publisher/title rows: ${blockedRows.length}
- Rows carrying one or more legacy-data warnings: ${warningRows.length}
- Canonical publishers represented: ${publisherSummary.size}
- Publishers with previously confirmed production UUIDs: ${confirmedPublishers.length}
- Publishers requiring account match/create before production import: ${proposedPublishers.length}
- Exact duplicate row groups within the same catalog: ${exactDuplicateGroups.length}
- Same title/barcode groups requiring variant-or-duplicate review: ${sameIdentityGroups.length}
- Barcodes repeated across different catalogs: ${repeatedBarcodeGroups.length} (preserved as historical reoffers/resolicitations; never silently collapsed)

## Catalog file and official schedule mapping

| Source file | Official catalog | Official FOC | Official store date | Product rows | Publishers | Confirmed publisher rows | Proposed-account rows | Blocked rows | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
${fileSummaries.map(file => `| ${escapeMarkdown(file.sourceFile)} | ${file.cycle.catalogDate} | ${file.cycle.focDate} | ${file.cycle.storeDate} | ${file.productRows} | ${file.publisherCount} | ${file.confirmedPublisherRows} | ${file.proposedPublisherRows} | ${file.blockedRows} | ${escapeMarkdown(file.filenameNote)} |`).join('\n')}

## Duplicate-file resolution

- \`${path.basename(duplicateSource.path)}\` and \`${path.basename(duplicateSource.duplicateOf)}\` have the same SHA-256 hash: \`${duplicateHash}\`.
- The first file is excluded from the proposed import so the October 2025 catalog is not imported twice.

## Missing catalog file

${missingCycleFiles.length ? missingCycleFiles.map(name => `- **MISSING SOURCE CSV:** ${name}`).join('\n') : '- None through the latest supplied catalog.'}

## Publisher assignment preview

| Canonical publisher | Historical rows | Catalog cycles | Production target | Source-name labels found |
|---|---:|---:|---|---|
${[...publisherSummary.values()].sort((a, b) => a.canonicalPublisher.localeCompare(b.canonicalPublisher)).map(publisher => `| ${escapeMarkdown(publisher.canonicalPublisher)} | ${publisher.rows} | ${publisher.cycles.size} | ${publisher.productionPublisherId ? `Confirmed UUID: \`${publisher.productionPublisherId}\`` : publisher.canonicalPublisher === '[MISSING PUBLISHER]' ? '**BLOCKED — identify publisher**' : '**Proposed pending Publisher account — do not invite**'} | ${escapeMarkdown([...publisher.sourceNames].sort().join('; '))} |`).join('\n')}

## Blocked rows

${blockedRows.length ? `| Source file | Row | Publisher | Title | Warning |\n|---|---:|---|---|---|\n${blockedRows.map(row => `| ${escapeMarkdown(row.sourceFile)} | ${row.sourceRow} | ${escapeMarkdown(row.sourcePublisher || '[missing]')} | ${escapeMarkdown(row.title || '[missing]')} | ${escapeMarkdown(row.rowWarnings)} |`).join('\n')}` : '- None.'}

## Same-catalog title/barcode groups

These are not collapsed automatically. Rows with distinct covers, variants, sizes, or Stock Numbers become separate SKUs beneath one solicitation; indistinguishable rows require review.

${sameIdentityGroups.length ? `| Group | Catalog | Publisher | Title | Barcode | Source rows | Proposed treatment |\n|---|---:|---|---|---|---|---|\n${sameIdentityGroups.map((group, index) => `| GROUP-${index + 1} | ${group[0].officialCatalogDate} | ${escapeMarkdown(group[0].canonicalPublisher)} | ${escapeMarkdown(group[0].title)} | ${escapeMarkdown(group[0].barcode || '[missing]')} | ${group.map(row => row.sourceRow).join(', ')} | ${escapeMarkdown(group[0].sameCatalogIdentityDisposition)} |`).join('\n')}` : '- None.'}

## Import behavior after a future approval

1. Preserve every source row, raw date, barcode, historical Stock Number, source filename, source row number, and source hash as provenance.
2. Assign the official catalog/FOC/store dates from Maura's supplied schedule; never overwrite the source CSV.
3. Import each row as an **Archived Historical** SKU under its canonical Publisher account.
4. Do not send invitations during import.
5. A Publisher may later request **Distribution Listing**, **Reorder**, **POD Printing**, or any combination.
6. Before activation, validate the selected SKU's barcode, identifiers, price, print specifications, cover, interior file, and fulfillment method.
7. Rows with the same barcode in different catalogs remain separate historical catalog appearances. They require explicit review before any consolidation.

## Remaining production-write blockers

- Authenticate production Admin access immediately before any write.
- Match or create the proposed Publisher accounts and record their production UUIDs without sending invitations.
- Resolve the blocked publisher/title rows above.
- Review the publisher aliases and imprint-to-parent assignments.
- Decide whether historical Stock Numbers should remain lookup aliases only or become the active SKU identifiers.
- Back up the affected production tables immediately before the eventual import.
- Obtain Maura's explicit final import approval.
`;

fs.writeFileSync(REPORT_PATH, report);

console.log(JSON.stringify({
  authorizedToWrite: AUTHORIZED_TO_WRITE,
  sourceFilesSupplied: sources.length + 1,
  duplicateFilesExcluded: 1,
  uniqueCatalogFiles: fileSummaries.length,
  productRows: allRows.length,
  assignmentReadyRows: allRows.length - blockedRows.length,
  blockedRows: blockedRows.length,
  warningRows: warningRows.length,
  canonicalPublishers: publisherSummary.size,
  confirmedPublishers: confirmedPublishers.length,
  proposedPublishers: proposedPublishers.length,
  exactDuplicateGroups: exactDuplicateGroups.length,
  sameCatalogIdentityGroups: sameIdentityGroups.length,
  repeatedBarcodeGroups: repeatedBarcodeGroups.length,
  missingCycleFiles,
  reportPath: REPORT_PATH,
  rowMappingPath: ROWS_PATH
}, null, 2));
