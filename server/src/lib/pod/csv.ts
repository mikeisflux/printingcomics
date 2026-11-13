/**
 * The retailer catalog as a spreadsheet (every live SKU in a cycle with the
 * shop's wholesale price), and the order form that comes back: a CSV with a
 * catalog id (or UPC) column and a quantity column.
 */
import type { PricedWholesaleLine } from './wholesale.js';

export const csvEscape = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface CatalogCsvRow {
  catalogKey: string; upc: string | null; title: string; seriesName: string | null; issueNumber: string | null; coverDescription: string | null;
  publisher: string; format: string; pageCount: number | null; interiorColor: string | null; trim: string; msrpCents: number;
  writer: string | null; artist: string | null; coverArtist: string | null; ageRating: string | null; incentiveRatio: string | null; description: string | null;
  catalogDate: string; focDate: string; inStoreDate: string;
}

export function catalogCsv(rows: CatalogCsvRow[], wholesale?: { discountBps: number; tierName: string } | null): string {
  const head = ['Catalog ID', 'UPC', 'Title', 'Series', 'Issue', 'Cover', 'Publisher', 'Format', 'Pages', 'Color', 'Trim', 'MSRP', ...(wholesale ? [`Wholesale (${wholesale.tierName})`] : []), 'Writer', 'Artist', 'Cover Artist', 'Rating', 'Incentive', 'Catalog Date', 'FOC', 'In Store', 'Description', 'Quantity'];
  const lines = [head.map(csvEscape).join(',')];
  for (const r of rows) {
    const cells: unknown[] = [r.catalogKey, r.upc ?? '', r.title, r.seriesName ?? '', r.issueNumber ?? '', r.coverDescription ?? '', r.publisher, r.format, r.pageCount ?? '', r.interiorColor ?? '', r.trim, (r.msrpCents / 100).toFixed(2)];
    if (wholesale) cells.push((Math.round((r.msrpCents * (10_000 - wholesale.discountBps)) / 10_000) / 100).toFixed(2));
    cells.push(r.writer ?? '', r.artist ?? '', r.coverArtist ?? '', r.ageRating ?? '', r.incentiveRatio ?? '', r.catalogDate, r.focDate, r.inStoreDate, r.description ?? '', '');
    lines.push(cells.map(csvEscape).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** A minimal RFC 4180 parser: quotes, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export interface OrderFormLine { ref: string; quantity: number; line: number }
export interface OrderFormParse { lines: OrderFormLine[]; problems: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Reads the catalog export (or any sheet) back: a reference column + a quantity column. */
export function parseOrderForm(text: string): OrderFormParse {
  const rows = parseCsv(text);
  const problems: string[] = [];
  if (!rows.length) return { lines: [], problems: ['The file is empty.'] };
  const header = rows[0]!.map(norm);
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  let refCol = find('catalogid', 'catalogkey', 'philboid', 'id', 'sku', 'item');
  const upcCol = find('upc', 'barcode', 'barcodeupcean', 'isbn');
  const qtyCol = find('quantity', 'qty', 'order', 'orderqty', 'copies');
  let start = 1;
  if (qtyCol < 0) {
    // No header: treat the sheet as two columns, reference then quantity.
    if (rows[0]!.length >= 2 && /^\d+$/.test(rows[0]![1]!.trim())) { refCol = 0; start = 0; }
    else return { lines: [], problems: ['Could not find a Quantity column. Use the catalog download as the order form.'] };
  }
  const lines: OrderFormLine[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]!;
    const qtyRaw = (qtyCol >= 0 ? r[qtyCol] : r[1]) ?? '';
    const q = Number(String(qtyRaw).replace(/[^\d.-]/g, ''));
    if (!qtyRaw.trim() || !q) continue;
    if (!Number.isInteger(q) || q < 0) { problems.push(`Row ${i + 1}: "${qtyRaw}" is not a whole number.`); continue; }
    const ref = ((refCol >= 0 ? r[refCol] : '') || (upcCol >= 0 ? r[upcCol] : '') || '').trim();
    if (!ref) { problems.push(`Row ${i + 1}: a quantity with no catalog id or UPC.`); continue; }
    lines.push({ ref, quantity: q, line: i + 1 });
  }
  return { lines, problems };
}

export function orderLinesCsv(lines: PricedWholesaleLine[]): string {
  const head = ['Catalog ID', 'Title', 'Quantity', 'MSRP', 'Wholesale', 'Line total'];
  const out = [head.join(',')];
  for (const l of lines) out.push([l.catalogKey, l.title, l.quantity, (l.msrpCents / 100).toFixed(2), (l.unitCents / 100).toFixed(2), (l.totalCents / 100).toFixed(2)].map(csvEscape).join(','));
  return `﻿${out.join('\r\n')}\r\n`;
}
