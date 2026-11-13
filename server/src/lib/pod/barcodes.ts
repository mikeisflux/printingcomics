/**
 * Barcodes for the Distribution catalog. We buy blocks of UPC-A / EAN-13
 * numbers, load them here, hold some for a publisher, and put one on a
 * listing (which takes it as its UPC, so the catalog id follows). Check
 * digits are computed, never typed. `barcodeSvg` draws a scannable EAN-13 /
 * UPC-A image for the listing page and the publisher's files.
 */
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { recordPodEvent, type Actor } from './events.js';
import { deriveCatalogKey, uniqueCatalogKey } from './catalog.js';

export type Symbology = 'UPC-A' | 'EAN-13';

/** GS1 modulo-10 check digit for the body digits (11 for UPC-A, 12 for EAN-13). */
export function checkDigit(body: string): number {
  const digits = body.split('').map(Number);
  // Weights 3,1,3,1… from the right.
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits[digits.length - 1 - i]! * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function normalizeBarcode(raw: string): { code: string; symbology: Symbology } {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return { code: digits + checkDigit(digits), symbology: 'UPC-A' };
  if (digits.length === 12) {
    if (checkDigit(digits.slice(0, 11)) !== Number(digits[11])) throw new HttpError(400, `${digits} is not a valid UPC-A (check digit should be ${checkDigit(digits.slice(0, 11))})`);
    return { code: digits, symbology: 'UPC-A' };
  }
  if (digits.length === 13) {
    if (checkDigit(digits.slice(0, 12)) !== Number(digits[12])) throw new HttpError(400, `${digits} is not a valid EAN-13 (check digit should be ${checkDigit(digits.slice(0, 12))})`);
    return { code: digits, symbology: 'EAN-13' };
  }
  throw new HttpError(400, `${raw.trim()} is not an 11/12-digit UPC or a 12/13-digit EAN`);
}

/** Expand "prefix + start + count" into full codes with check digits. */
export function expandBlock(args: { prefix: string; start: number; count: number; symbology: Symbology }): string[] {
  const prefix = args.prefix.replace(/\D/g, '');
  const bodyLen = args.symbology === 'EAN-13' ? 12 : 11;
  const serialLen = bodyLen - prefix.length;
  if (serialLen < 1) throw new HttpError(400, `The prefix leaves no room for a serial (${bodyLen} body digits for ${args.symbology})`);
  if (args.count < 1 || args.count > 10_000) throw new HttpError(400, 'Load between 1 and 10,000 codes at a time');
  const out: string[] = [];
  for (let i = 0; i < args.count; i++) {
    const serial = String(args.start + i).padStart(serialLen, '0');
    if (serial.length > serialLen) throw new HttpError(400, `Serial ${args.start + i} does not fit in ${serialLen} digits`);
    const body = prefix + serial;
    out.push(body + checkDigit(body));
  }
  return out;
}

export async function loadBlock(args: { codes: string[]; block: string | null; partnerId?: string | null; notes?: string | null }, actor: Actor) {
  const rows = args.codes.map((c) => normalizeBarcode(c));
  const existing = await prisma.barcode.findMany({ where: { code: { in: rows.map((r) => r.code) } }, select: { code: true } });
  const taken = new Set(existing.map((e) => e.code));
  const fresh = rows.filter((r) => !taken.has(r.code));
  if (fresh.length) {
    await prisma.barcode.createMany({ data: fresh.map((r) => ({ code: r.code, symbology: r.symbology, block: args.block, partnerId: args.partnerId ?? null, status: args.partnerId ? 'RESERVED' : 'AVAILABLE', notes: args.notes ?? null })) });
  }
  await recordPodEvent('listing', 'barcodes', 'block-loaded', `${fresh.length} codes loaded${args.block ? ` into "${args.block}"` : ''}${taken.size ? `, ${taken.size} already known` : ''}`, actor);
  return { loaded: fresh.length, skipped: taken.size };
}

/** Put a barcode on a listing: a specific one, or the next free (the publisher's reserved ones first). */
export async function assignBarcode(listingId: string, actor: Actor, barcodeId?: string | null) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, partnerId: true, upc: true, title: true, seriesCode: true, catalogKey: true, status: true, barcode: { select: { id: true, code: true } } } });
  if (!listing) throw new HttpError(404, 'Listing not found');
  if (listing.barcode) throw new HttpError(400, `This listing already carries ${listing.barcode.code}. Release it first.`);
  let barcode = barcodeId ? await prisma.barcode.findUnique({ where: { id: barcodeId } }) : null;
  if (barcodeId && !barcode) throw new HttpError(404, 'Barcode not found');
  if (barcode && barcode.status === 'ASSIGNED') throw new HttpError(400, `${barcode.code} is already on another listing`);
  if (barcode && barcode.status === 'RETIRED') throw new HttpError(400, `${barcode.code} is retired`);
  if (barcode && barcode.status === 'RESERVED' && barcode.partnerId && barcode.partnerId !== listing.partnerId) throw new HttpError(400, `${barcode.code} is reserved for another publisher`);
  if (!barcode) {
    barcode = (await prisma.barcode.findFirst({ where: { status: 'RESERVED', partnerId: listing.partnerId }, orderBy: { code: 'asc' } }))
      ?? (await prisma.barcode.findFirst({ where: { status: 'AVAILABLE' }, orderBy: { code: 'asc' } }));
    if (!barcode) throw new HttpError(409, 'No barcodes are available. Load a block under Distribution → Barcodes.');
  }
  await prisma.barcode.update({ where: { id: barcode.id }, data: { status: 'ASSIGNED', listingId, partnerId: listing.partnerId, assignedAt: new Date() } });
  const data: { upc: string; catalogKey?: string } = { upc: barcode.code };
  // A draft's catalog id follows its UPC; a live one keeps the id shops already know.
  if (listing.status === 'DRAFT' || listing.status === 'CHANGES_REQUESTED' || listing.status === 'SUBMITTED') {
    const wanted = deriveCatalogKey({ seriesCode: listing.seriesCode, upc: barcode.code, title: listing.title });
    if (wanted !== listing.catalogKey) data.catalogKey = await uniqueCatalogKey(wanted, listing.id);
  }
  await prisma.listing.update({ where: { id: listingId }, data });
  await recordPodEvent('listing', listingId, 'barcode', `${barcode.code} assigned`, actor);
  return prisma.barcode.findUnique({ where: { id: barcode.id } });
}

export async function releaseBarcode(barcodeId: string, actor: Actor, retire = false) {
  const b = await prisma.barcode.findUnique({ where: { id: barcodeId }, include: { listing: { select: { id: true, upc: true } } } });
  if (!b) throw new HttpError(404, 'Barcode not found');
  if (b.listing && b.listing.upc === b.code) await prisma.listing.update({ where: { id: b.listing.id }, data: { upc: null } });
  await prisma.barcode.update({ where: { id: b.id }, data: { status: retire ? 'RETIRED' : b.partnerId ? 'RESERVED' : 'AVAILABLE', listingId: null, assignedAt: null } });
  if (b.listing) await recordPodEvent('listing', b.listing.id, 'barcode', `${b.code} ${retire ? 'retired' : 'released'}`, actor);
  return prisma.barcode.findUnique({ where: { id: b.id } });
}

// ---------------------------------------------------------------------------
// Rendering: EAN-13 (UPC-A is EAN-13 with a leading 0) as an SVG.
// ---------------------------------------------------------------------------

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => p.split('').reverse().map((b) => (b === '1' ? '0' : '1')).join(''));
const R = L.map((p) => p.split('').map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** The bar pattern (1 = bar) for a 13-digit EAN; a 12-digit UPC is prefixed with 0. */
export function ean13Modules(code: string): string {
  const d = code.length === 12 ? `0${code}` : code;
  if (!/^\d{13}$/.test(d)) throw new Error('EAN-13 needs 13 digits');
  const first = Number(d[0]);
  let out = '101';
  for (let i = 1; i <= 6; i++) out += (PARITY[first]![i - 1] === 'L' ? L : G)[Number(d[i])];
  out += '01010';
  for (let i = 7; i <= 12; i++) out += R[Number(d[i])];
  return out + '101';
}

export function barcodeSvg(code: string, opts: { moduleWidth?: number; height?: number; label?: boolean } = {}): string {
  const mw = opts.moduleWidth ?? 2;
  const h = opts.height ?? 70;
  const modules = ean13Modules(code);
  const quiet = 9 * mw;
  const width = modules.length * mw + quiet * 2;
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let bars = '';
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === '1') bars += `<rect x="${quiet + i * mw}" y="0" width="${mw}" height="${guard.has(i) ? h + 8 : h}"/>`;
  }
  const d = code.length === 12 ? `0${code}` : code;
  const label = opts.label === false ? '' : `<text x="${quiet - 3 * mw}" y="${h + 16}" font-family="ui-monospace, Menlo, monospace" font-size="11" text-anchor="end">${d[0]}</text><text x="${quiet + 24 * mw}" y="${h + 16}" font-family="ui-monospace, Menlo, monospace" font-size="11" text-anchor="middle">${d.slice(1, 7)}</text><text x="${quiet + 71 * mw}" y="${h + 16}" font-family="ui-monospace, Menlo, monospace" font-size="11" text-anchor="middle">${d.slice(7)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h + 20}" viewBox="0 0 ${width} ${h + 20}" role="img" aria-label="Barcode ${code}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g>${label}</svg>`;
}
