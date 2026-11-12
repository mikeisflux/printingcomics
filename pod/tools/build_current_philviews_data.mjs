import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

const sources = {
  cycle_14: '/Volumes/Backup Plus/Philboshit/CSVs/Philbo_August_Nov2026.csv',
  cycle_15: '/Volumes/Backup Plus/Philbo/Sept12026-Dec2026/Philbo_Sept1catalog - Form Responses 1.csv'
};

const outputs = {
  cycle_14: path.join(projectRoot, 'src/data/philviews-14-august-november-2026.json'),
  cycle_15: path.join(projectRoot, 'src/data/philviews-15-september-december-2026.json')
};

const parseCsv = text => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
};

const normalizeHeader = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const get = (row, ...candidates) => {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value ?? '').trim()]));
  for (const candidate of candidates) {
    const exact = normalized.get(normalizeHeader(candidate));
    if (exact !== undefined) return exact;
  }
  return '';
};

const number = value => {
  const parsed = Number.parseFloat(String(value || '').replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const integer = value => {
  const parsed = Number.parseInt(String(value || '').replace(/[^0-9-]+/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const productSlug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const normalizeDriveImage = value => {
  const source = String(value || '').trim();
  const match = source.match(/\/file\/d\/([^/?#]+)/i) || source.match(/[?&]id=([^&#]+)/i) || source.match(/\/d\/([^/?#]+)/i);
  return match?.[1] ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w1600` : source;
};

const sharedRecord = ({ row, cycleId, philboId, title, sourceRowNumber }) => {
  const slug = productSlug(philboId);
  const weightPounds = number(get(row, 'Weight (LBS)', 'Weight in POUNDS i.e. 8 oz= 0.5'));
  return {
    titleId: `title-${cycleId.replace('_', '-')}-${slug}`,
    philboId,
    productSlug: slug,
    directProductUrl: `https://philbodistribution.com/philbo-catalog/p/${slug}`,
    cycleId,
    publisherName: get(row, 'Publisher Name'),
    barcode: get(row, 'The Barcode / UPC / EAN Numeric entries only', 'The Barcode / UPC / EAN Numeric entries only'),
    title,
    seriesName: get(row, 'Series Name'),
    msrp: number(get(row, 'Price')) || 0,
    issueNumber: get(row, 'Issue Number'),
    language: get(row, 'Language') || 'English',
    coverDescription: get(row, 'Cover Description'),
    variantNumber: get(row, 'Variant Number'),
    bookFormat: get(row, 'Book Format'),
    seriesType: get(row, 'Type of Series'),
    seriesCode: get(row, 'Series Code'),
    seriesFrequency: get(row, 'Series Frequency', 'Series Frequency [Row 1]'),
    ageRange: get(row, 'Rating', 'Media Rating / Age Range'),
    pageCount: integer(get(row, 'Pages', 'Page Count')),
    bisac1: get(row, 'BISAC CODE #1'),
    bisac2: get(row, 'BISAC CODE 2'),
    bisac3: get(row, 'BISAC CODE 3'),
    description: get(row, 'Description of Issue /book'),
    synopsis: get(row, 'Brief Synopsis of Book'),
    reprint: get(row, 'Reprint'),
    printingNumber: integer(get(row, 'Printing - 1st, 2nd, 3rd')),
    writer: get(row, 'Writer'),
    artist: get(row, 'Artist'),
    coverArtist: get(row, 'Cover Artist'),
    colorProfile: get(row, 'B/W or Full Color', 'Is your Book Color or B&W?'),
    width: number(get(row, 'Width', 'Width in Inches (Please use Decimals Only) i.e. 3/4 = .75 no " just numbers')),
    height: number(get(row, 'Height', 'Height in Inches Decimals Only i.e. 3/4 = .75')),
    weight: weightPounds,
    weightPounds,
    weightOunces: weightPounds === null ? null : weightPounds * 16,
    availableForReorder: get(row, 'Reorder?', 'Do you want your book available for Reorder?'),
    genre: get(row, 'Genre', 'Genre of your book - For the Catalog Superheroes | Fantasy | Horror Etc .'),
    coverUrl: normalizeDriveImage(get(row, 'Cover Image', 'Cover Image named the SKU of your book .. JPG OR PNG ONLY')),
    publisherLogoUrl: normalizeDriveImage(get(row, 'Publisher logo - png or jpg', 'Publisher Logo')),
    interiorImageUrl: normalizeDriveImage(get(row, 'NEW Interiors of your book - a panel will be used on the bottom of your solicit see SAMPLE. Format must be png or jpg. No pdf. no TIFF. File is to be named the SKU-int. I.e- 5468927908- Int, variants -inta, intb')),
    fulfillmentMethod: 'TBD',
    status: 'Live',
    focLocked: false,
    importedCatalogRecord: true,
    currentCatalogTestRecord: true,
    importBatchId: cycleId === 'cycle_14' ? 'Philviews_14_August_November_2026' : 'Philviews_15_September_December_2026',
    sourceRowNumber,
    sourceFile: path.basename(sources[cycleId]),
    history: [{
      date: '2026-09-16T16:00:00.000Z',
      user: 'Current Catalog Test Import',
      action: 'Current catalog solicitation bundled for end-to-end testing',
      notes: 'The same SKU powers its solicitation, website listing, printable catalog page, and retailer ordering record.'
    }]
  };
};

const augustRows = parseCsv(fs.readFileSync(sources.cycle_14, 'utf8'))
  .map((row, index) => {
    const philboId = get(row, 'Philbo ID');
    const title = get(row, 'Full Title of Book');
    if (!philboId || !title || !number(get(row, 'Price'))) return null;
    return {
      ...sharedRecord({ row, cycleId: 'cycle_14', philboId, title, sourceRowNumber: index + 2 }),
      catalogDate: '2026-08-01',
      focDate: '2026-10-01',
      releaseDate: '2026-11-11'
    };
  })
  .filter(Boolean);

const septemberBarcodeOverrides = new Map([
  [11, 'A'],
  [31, 'A'],
  [32, 'B'],
  [59, 'A'],
  [60, 'A']
]);

const septemberRows = parseCsv(fs.readFileSync(sources.cycle_15, 'utf8'))
  .map((row, index) => {
    const sourceRowNumber = index + 2;
    const philboId = `PHI121626-${String(201 + index).padStart(3, '0')}`;
    const title = get(row, 'Full Title of Book');
    const record = sharedRecord({ row, cycleId: 'cycle_15', philboId, title, sourceRowNumber });
    const suffix = septemberBarcodeOverrides.get(sourceRowNumber);
    if (suffix) record.barcode = `${record.barcode}${suffix}`;
    if (sourceRowNumber === 6) record.pageCount = 28;
    return {
      ...record,
      catalogDate: '2026-09-01',
      focDate: '2026-11-01',
      releaseDate: '2026-12-16'
    };
  });

fs.writeFileSync(outputs.cycle_14, `${JSON.stringify(augustRows, null, 2)}\n`);
fs.writeFileSync(outputs.cycle_15, `${JSON.stringify(septemberRows, null, 2)}\n`);

console.log(JSON.stringify({
  cycle_14: { rows: augustRows.length, first: augustRows[0]?.philboId, last: augustRows.at(-1)?.philboId },
  cycle_15: { rows: septemberRows.length, first: septemberRows[0]?.philboId, last: septemberRows.at(-1)?.philboId }
}, null, 2));
