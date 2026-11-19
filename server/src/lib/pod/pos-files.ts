/**
 * Files a comic shop's point-of-sale tools import from a distributor.
 *
 * Manage Comics, ComicHub and Comic Shop Assistant all take distributor
 * data as files the shop downloads and imports: an invoice (or shipping
 * manifest) CSV per shipment, and a catalog for pre-orders. Manage Comics
 * and ComicHub read the Diamond invoice layout; Comic Shop Assistant maps
 * any CSV's columns. Shopify POS and Lightspeed Retail take their own
 * product-import CSVs. Every builder here starts from the same rows so the
 * layouts never drift from each other.
 *
 *   diamond    Diamond "Invoice (CSV)" column order — pick the Diamond
 *              template in Manage Comics / ComicHub / Comic Shop Assistant.
 *   generic    Every field with plain headers, for column mappers (Comic
 *              Shop Assistant, Retail Management Hero, spreadsheets).
 *   shopify    Shopify product import (one variant per title, barcode =
 *              UPC, cost per item = wholesale).
 *   lightspeed Lightspeed Retail (R-Series) item import.
 */
import { csvEscape } from './csv.js';

export const POS_FORMATS = ['diamond', 'generic', 'shopify', 'lightspeed', 'rmh', 'rmh_receive'] as const;
export type PosFormat = (typeof POS_FORMATS)[number];
export const POS_FORMAT_LABELS: Record<PosFormat, string> = {
  diamond: 'Diamond invoice layout (Manage Comics, ComicHub, Comic Shop Assistant)',
  generic: 'All columns (Comic Shop Assistant mapper, Retail Management Hero, spreadsheets)',
  shopify: 'Shopify product import (Shopify POS)',
  lightspeed: 'Lightspeed Retail item import',
  rmh: 'Retail Management Hero item import (Import Utility)',
  rmh_receive: 'Retail Management Hero purchase-order receive (Code, Qty Rcv, Cost)',
};
/** The layout a shop's chosen system imports, for the file we attach to its shipping email. */
export function defaultFormatFor(posSystem: string | null | undefined): PosFormat {
  switch (posSystem) {
    case 'manage_comics': case 'comichub': return 'diamond';
    case 'shopify_pos': return 'shopify';
    case 'lightspeed': return 'lightspeed';
    case 'rmh': return 'rmh_receive';
    default: return 'generic';
  }
}
export function isPosFormat(v: unknown): v is PosFormat { return typeof v === 'string' && (POS_FORMATS as readonly string[]).includes(v); }

/** One title on an invoice, shipment or catalog, with everything any layout needs. */
export interface PosLine {
  catalogKey: string;
  upc: string | null;
  title: string;            // "Savage Wonders #4 (Cover B)"
  seriesName: string | null;
  issueNumber: string | null;
  coverDescription: string | null;
  publisher: string;
  format: string;           // comic | graphic_novel | …
  pageCount: number | null;
  description: string | null;
  coverImageUrl: string | null;
  weightOz: number | null;
  quantity: number;         // copies shipped / ordered; 0 on a catalog row
  msrpCents: number;
  unitCents: number;        // the shop's wholesale price
  totalCents: number;       // quantity × unitCents
  releaseDate: string;      // in-store date, YYYY-MM-DD
}

export interface PosDocument {
  number: string;           // our order number (the invoice number)
  date: string;             // invoice / ship date, YYYY-MM-DD
  catalogName: string;
  poNumber: string | null;  // the shop's own PO number, when they gave one
  shipping: { carrier: string | null; service: string | null; trackingCode: string | null; date: string }[];
  lines: PosLine[];
}

const money = (c: number) => (c / 100).toFixed(2);
const row = (cells: unknown[]) => cells.map(csvEscape).join(',');
const file = (lines: string[]) => `﻿${lines.join('\r\n')}\r\n`;
const isbn = (upc: string | null) => (upc && /^97[89]\d{10}$/.test(upc) ? upc : '');
const upcOnly = (upc: string | null) => (upc && !/^97[89]\d{10}$/.test(upc) ? upc : '');
/** Diamond category codes as POS tools map them: 1 comics, 3 books / graphic novels, 10 merchandise. */
const categoryCode = (format: string) => (format === 'comic' || format === 'magazine' ? '1' : format === 'merch' ? '10' : '3');
const handle = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fullTitle = (l: PosLine) => l.title;

// ---------------------------------------------------------------------------
// Invoices and shipping manifests
// ---------------------------------------------------------------------------

/** An invoice or shipping manifest in the chosen layout. */
export function invoiceCsv(doc: PosDocument, format: PosFormat): string {
  switch (format) {
    case 'diamond': return diamondInvoice(doc);
    case 'shopify': return shopifyProducts(doc.lines, { inventory: true });
    case 'lightspeed': return lightspeedItems(doc.lines, { inventory: true });
    case 'rmh': return rmhItems(doc.lines, { inventory: true });
    case 'rmh_receive': return rmhReceive(doc.lines);
    default: return genericInvoice(doc);
  }
}

/**
 * The Diamond invoice data-file layout: Units Shipped, Item Code, Item
 * Description, Retail Price, Unit Price, Invoice Amount, Category Code,
 * Order Type, Processed As, Order Number, UPC Code, ISBN Code, EAN Code,
 * with our invoice number and date in front so a week of shipments can sit
 * in one file. Item Code is our catalog id (SERIESCODE-last5(UPC)).
 */
function diamondInvoice(doc: PosDocument): string {
  const head = ['Invoice Number', 'Invoice Date', 'Units Shipped', 'Item Code', 'Item Description', 'Retail Price', 'Unit Price', 'Invoice Amount', 'Category Code', 'Order Type', 'Processed As', 'Order Number', 'UPC Code', 'ISBN Code', 'EAN Code', 'Publisher', 'Release Date'];
  const out = [row(head)];
  for (const l of doc.lines) {
    out.push(row([doc.number, doc.date, l.quantity, l.catalogKey, fullTitle(l), money(l.msrpCents), money(l.unitCents), money(l.totalCents), categoryCode(l.format), 'I', 'Shipped', doc.poNumber ?? doc.number, upcOnly(l.upc), isbn(l.upc), l.upc && l.upc.length === 13 ? l.upc : '', l.publisher, l.releaseDate]));
  }
  return file(out);
}

function genericInvoice(doc: PosDocument): string {
  const head = ['Invoice', 'Invoice Date', 'Ship Date', 'Carrier', 'Tracking', 'Shop PO', 'Catalog', 'Item Code', 'UPC', 'Title', 'Series', 'Issue', 'Cover', 'Publisher', 'Format', 'Pages', 'Quantity', 'MSRP', 'Unit Cost', 'Line Total', 'Release Date'];
  const out = [row(head)];
  const ship = doc.shipping[0];
  for (const l of doc.lines) {
    out.push(row([doc.number, doc.date, ship?.date ?? '', ship ? [ship.carrier, ship.service].filter(Boolean).join(' ') : '', ship?.trackingCode ?? '', doc.poNumber ?? '', doc.catalogName, l.catalogKey, l.upc ?? '', fullTitle(l), l.seriesName ?? '', l.issueNumber ?? '', l.coverDescription ?? '', l.publisher, l.format, l.pageCount ?? '', l.quantity, money(l.msrpCents), money(l.unitCents), money(l.totalCents), l.releaseDate]));
  }
  return file(out);
}

// ---------------------------------------------------------------------------
// Catalogs (pre-order files): the same layouts with quantity 0 / on order
// ---------------------------------------------------------------------------

export function catalogPosCsv(args: { catalogName: string; releaseDate: string; lines: PosLine[] }, format: PosFormat): string {
  switch (format) {
    case 'diamond': return diamondCatalog(args);
    case 'shopify': return shopifyProducts(args.lines, { inventory: false });
    case 'lightspeed': return lightspeedItems(args.lines, { inventory: false });
    case 'rmh': case 'rmh_receive': return rmhItems(args.lines, { inventory: false });
    default: return genericCatalog(args);
  }
}

/** The Diamond item layout used for pre-order files: item code, description, retail, UPC/ISBN, publisher, release. */
function diamondCatalog(args: { catalogName: string; releaseDate: string; lines: PosLine[] }): string {
  const head = ['Item Code', 'Item Description', 'Retail Price', 'Unit Price', 'Category Code', 'UPC Code', 'ISBN Code', 'EAN Code', 'Publisher', 'Release Date', 'Catalog', 'Order Qty'];
  const out = [row(head)];
  for (const l of args.lines) out.push(row([l.catalogKey, fullTitle(l), money(l.msrpCents), money(l.unitCents), categoryCode(l.format), upcOnly(l.upc), isbn(l.upc), l.upc && l.upc.length === 13 ? l.upc : '', l.publisher, l.releaseDate, args.catalogName, l.quantity || '']));
  return file(out);
}

function genericCatalog(args: { catalogName: string; releaseDate: string; lines: PosLine[] }): string {
  const head = ['Catalog', 'Item Code', 'UPC', 'Title', 'Series', 'Issue', 'Cover', 'Publisher', 'Format', 'Pages', 'MSRP', 'Unit Cost', 'Release Date', 'Description', 'Cover Image', 'Order Qty'];
  const out = [row(head)];
  for (const l of args.lines) out.push(row([args.catalogName, l.catalogKey, l.upc ?? '', fullTitle(l), l.seriesName ?? '', l.issueNumber ?? '', l.coverDescription ?? '', l.publisher, l.format, l.pageCount ?? '', money(l.msrpCents), money(l.unitCents), l.releaseDate, l.description ?? '', l.coverImageUrl ?? '', l.quantity || '']));
  return file(out);
}

// ---------------------------------------------------------------------------
// Product imports for general retail POS
// ---------------------------------------------------------------------------

/**
 * Shopify's product CSV: one product per title with a single default
 * variant. Barcode is the UPC, SKU our catalog id, Cost per item the
 * wholesale price. With `inventory` the shipped quantity lands in the
 * variant's inventory quantity; a catalog file leaves it at 0.
 */
function shopifyProducts(lines: PosLine[], opts: { inventory: boolean }): string {
  const head = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Cost per item', 'Status'];
  const out = [row(head)];
  for (const l of lines) {
    const type = l.format === 'comic' ? 'Comics' : l.format === 'graphic_novel' ? 'Graphic Novels' : l.format === 'magazine' ? 'Magazines' : 'Books';
    const body = l.description ? `<p>${l.description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '';
    out.push(row([handle(l.catalogKey), fullTitle(l), body, l.publisher, type, [type, l.seriesName ?? ''].filter(Boolean).join(', '), 'TRUE', 'Title', 'Default Title', l.catalogKey, l.weightOz ? Math.round(l.weightOz * 28.3495) : '', 'shopify', opts.inventory ? l.quantity : 0, 'deny', 'manual', money(l.msrpCents), '', 'TRUE', 'TRUE', l.upc ?? '', l.coverImageUrl ?? '', money(l.unitCents), 'active']));
  }
  return file(out);
}

/** Lightspeed Retail (R-Series) item import columns. Qty is the shipped count on an invoice, blank on a catalog. */
function lightspeedItems(lines: PosLine[], opts: { inventory: boolean }): string {
  const head = ['UPC', 'EAN', 'Custom SKU', 'Manufacturer SKU', 'Item', 'Description', 'Default Cost', 'Price', 'Qty', 'Vendor', 'Brand', 'Category', 'Tax Class', 'Publish to eCom'];
  const out = [row(head)];
  for (const l of lines) {
    const category = l.format === 'comic' ? 'Comics' : l.format === 'graphic_novel' ? 'Graphic Novels' : 'Books';
    out.push(row([upcOnly(l.upc), l.upc && l.upc.length === 13 ? l.upc : '', l.catalogKey, l.catalogKey, fullTitle(l), l.description ?? '', money(l.unitCents), money(l.msrpCents), opts.inventory ? l.quantity : '', 'Printing Comics Distribution', l.publisher, category, 'Item', 'No']));
  }
  return file(out);
}

/**
 * Retail Management Hero's Import Utility maps columns by hand and saves the
 * mapping, so plain names do: lookup code, description, prices, cost,
 * quantity, supplier, barcode (as an alias).
 */
function rmhItems(lines: PosLine[], opts: { inventory: boolean }): string {
  const head = ['Item Lookup Code', 'Description', 'Extended Description', 'Price', 'Cost', 'Quantity', 'Department', 'Category', 'Supplier', 'Barcode', 'Reorder Number'];
  const out = [row(head)];
  for (const l of lines) {
    const dept = l.format === 'comic' ? 'Comics' : l.format === 'graphic_novel' ? 'Graphic Novels' : 'Books';
    out.push(row([l.catalogKey, fullTitle(l).slice(0, 30), fullTitle(l), money(l.msrpCents), money(l.unitCents), opts.inventory ? l.quantity : 0, dept, l.publisher, 'Printing Comics Distribution', l.upc ?? '', l.catalogKey]));
  }
  return file(out);
}

/** RMH's received-purchase-order import: exactly Code, Qty Rcv, Cost; items must already be on the purchase order. */
function rmhReceive(lines: PosLine[]): string {
  const out = [row(['Code', 'Qty Rcv', 'Cost'])];
  for (const l of lines) out.push(row([l.catalogKey, l.quantity, money(l.unitCents)]));
  return file(out);
}

/** The file name a shop sees: our number, the layout, the right extension. */
export function posFileName(kind: 'invoice' | 'shipments' | 'catalog', ref: string, format: PosFormat): string {
  const tag = format === 'diamond' ? 'diamond' : format === 'generic' ? 'all-columns' : format === 'rmh_receive' ? 'rmh-receive' : format;
  return `${kind}-${ref.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${tag}.csv`;
}
