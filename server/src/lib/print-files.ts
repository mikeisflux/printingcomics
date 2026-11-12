/**
 * The print files a customer owes us for each book, and the rules they must
 * meet — one place for the configurator, the account order screen, the
 * admin order page and the emails, so every one of them says the same thing.
 *
 * A book needs TWO PDFs:
 *   cover    — exactly 4 pages: front cover, inside front cover, inside back
 *              cover, back cover. Nothing else.
 *   interior — every interior page in reading order, as many pages as the
 *              order's page count. No covers.
 * A print (art print, trading card) needs ONE: artwork.
 *
 * Uploads are checked with poppler (page count) before they are accepted, so
 * a 22-page interior for a 24-page book, or a cover with the interior pasted
 * in, is refused with a message that says exactly what to fix.
 */
import { promises as fs } from 'node:fs';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { proofKindsForItem, itemLabel } from './proofs.js';
import { pageCount, popplerProblem } from './pdf-preview.js';
import { publishUpload, deleteStored } from './storage.js';
import { notifyStaff } from './proof-emails.js';

export type PrintFileKind = 'cover' | 'interior' | 'artwork';

export const PRINT_FILE_LABELS: Record<PrintFileKind, string> = {
  cover: 'Cover PDF',
  interior: 'Interior PDF',
  artwork: 'Print-ready PDF',
};

/** Configurator option keys → the file they carry. */
export const PRINT_FILE_KIND_BY_OPTION_KEY: Record<string, PrintFileKind> = {
  cover_pdf: 'cover',
  interior_pdf: 'interior',
  upload: 'artwork',
};

export function isPrintFileKind(v: unknown): v is PrintFileKind {
  return v === 'cover' || v === 'interior' || v === 'artwork';
}

/** What the customer is told next to each upload spot. */
export function printFileInstructions(kind: PrintFileKind, expectedPages: number | null): string[] {
  switch (kind) {
    case 'cover':
      return [
        'One PDF with exactly 4 pages, in this order: 1 front cover · 2 inside front cover · 3 inside back cover · 4 back cover.',
        'No interior pages in this file. If nothing prints on a page (an inside cover, say), leave it blank — it still counts as a page.',
        'Trim size of the book plus 0.125″ bleed on every side, CMYK, fonts embedded or outlined.',
      ];
    case 'interior':
      return [
        `One PDF with ${expectedPages ? `all ${expectedPages}` : 'every'} interior page${expectedPages === 1 ? '' : 's'} in reading order — every page between the inside front cover and the inside back cover.`,
        'Do not include the front cover, inside covers or back cover. They go in the Cover PDF.',
        'Single pages, not spreads. Trim size plus 0.125″ bleed, CMYK, fonts embedded or outlined.',
      ];
    case 'artwork':
      return [
        'One print-ready PDF at the ordered size, with 0.125″ bleed on every side.',
        'CMYK, 300 DPI, flattened, fonts embedded or outlined.',
      ];
  }
}

/** The page count a file must have, when the order fixes it. */
export function expectedPagesFor(kind: PrintFileKind, item: { options?: unknown }): number | null {
  if (kind === 'cover') return 4;
  if (kind === 'interior') {
    const raw = (item.options as Record<string, unknown> | null | undefined)?.['interior_pages'];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** The kinds a line needs, in the order they are shown. Fee lines and shelf goods need none. */
export function printFileKindsFor(item: { options?: unknown; product?: { slug?: string | null; pricingConfig?: unknown; madeToOrder?: boolean | null } | null }): PrintFileKind[] {
  if (item.product?.madeToOrder === false) return [];
  return proofKindsForItem(item).filter(isPrintFileKind);
}

function describeType(file: { mimetype: string; originalname: string }): string {
  const ext = file.originalname.split('.').pop();
  if (ext && ext !== file.originalname) return `a .${ext.toLowerCase()} file`;
  return file.mimetype ? `${file.mimetype}` : 'not a PDF';
}

/**
 * Refuse anything that is not the PDF we asked for. Returns the page count
 * (null when poppler is not available to count — the file is accepted then).
 * `where` picks the way out offered in the message: the page count can be
 * changed in the cart, not on a placed order.
 */
export async function checkPrintPdf(
  file: { path: string; mimetype: string; originalname: string },
  kind: PrintFileKind,
  expectedPages: number | null,
  where: 'cart' | 'order',
): Promise<{ pages: number | null }> {
  const label = PRINT_FILE_LABELS[kind];
  const name = file.originalname;
  const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(name);
  if (!isPdf) {
    throw new HttpError(400, `The ${label} must be a PDF — “${name}” is ${describeType(file)}. Export it as a PDF (PDF/X-1a or PDF/X-4 is ideal) and upload that.`);
  }
  if (await popplerProblem()) return { pages: null };
  let pages: number;
  try {
    pages = await pageCount(file.path);
  } catch {
    throw new HttpError(400, `We could not open “${name}” as a PDF. Re-export it from your design app (PDF/X-1a or PDF/X-4 is ideal) and try again.`);
  }
  if (kind === 'cover' && pages !== 4) {
    throw new HttpError(400, `The ${label} must have exactly 4 pages — front cover, inside front cover, inside back cover, back cover — and “${name}” has ${pages}. ${pages > 4 ? 'Interior pages belong in the Interior PDF.' : 'Add a blank page for any cover side that prints nothing.'}`);
  }
  if (kind === 'interior' && expectedPages && pages !== expectedPages) {
    const fix = pages < expectedPages
      ? `Add the ${expectedPages - pages} missing page${expectedPages - pages === 1 ? '' : 's'}`
      : `Remove the ${pages - expectedPages} extra page${pages - expectedPages === 1 ? '' : 's'} (the covers belong in the Cover PDF)`;
    const alt = where === 'cart' ? 'or change the page count above' : 'or contact us to change the page count on this order';
    throw new HttpError(400, `The ${label} must have ${expectedPages} pages to match the ${expectedPages} interior pages ordered, and “${name}” has ${pages}. ${fix}, ${alt}.`);
  }
  return { pages };
}

export interface PrintFileSlot {
  kind: PrintFileKind;
  label: string;
  expectedPages: number | null;
  instructions: string[];
  /** The current file in this slot (the newest upload), if any. */
  file: { id: string; mediaFileId: string; name: string; size: number; url: string; pages: number | null; uploadedAt: Date } | null;
  /** Earlier uploads into this slot, newest first. */
  previous: number;
}

type SlotItem = {
  options?: unknown;
  product?: { slug?: string | null; pricingConfig?: unknown; madeToOrder?: boolean | null } | null;
  files?: Array<{ id: string; purpose: string | null; notes: string | null; createdAt: Date; media: { id: string; originalName: string; size: number; url: string } }>;
};

function pagesFromNotes(notes: string | null): number | null {
  const m = notes?.match(/(\d+) pages?/);
  return m ? Number(m[1]) : null;
}

/** The slots a line has, each with its current file. */
export function printFileSlotsFor(item: SlotItem): PrintFileSlot[] {
  return printFileKindsFor(item).map((kind) => {
    const expectedPages = expectedPagesFor(kind, item);
    const mine = (item.files ?? []).filter((f) => f.purpose === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const cur = mine[0];
    return {
      kind,
      label: PRINT_FILE_LABELS[kind],
      expectedPages,
      instructions: printFileInstructions(kind, expectedPages),
      file: cur ? { id: cur.id, mediaFileId: cur.media.id, name: cur.media.originalName, size: cur.media.size, url: cur.media.url, pages: pagesFromNotes(cur.notes), uploadedAt: cur.createdAt } : null,
      previous: Math.max(0, mine.length - 1),
    };
  });
}

/** Labels of the slots on this line that still have no file. */
export function missingPrintFiles(item: SlotItem): string[] {
  return printFileSlotsFor(item).filter((s) => !s.file).map((s) => s.label);
}

const CLOSED_FOR_UPLOADS = new Set(['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']);

/**
 * Store one print file the customer uploaded against an order line: checked
 * first, then published, recorded as the line's newest file of that kind,
 * written to the timeline, and staff told. Open file requests close by
 * themselves once every slot has a file newer than the request.
 */
export async function storeItemPrintFile(args: {
  orderItemId: string;
  kind: PrintFileKind;
  file: Express.Multer.File;
  uploaderId: string | null;
  via: string;
}): Promise<{ file: NonNullable<PrintFileSlot['file']>; pages: number | null }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: args.orderItemId },
    include: {
      order: { select: { id: true, number: true, status: true } },
      product: { select: { slug: true, pricingConfig: true, madeToOrder: true } },
    },
  });
  if (!item) throw new HttpError(404, 'Order line not found');
  const kinds = printFileKindsFor(item);
  if (!kinds.includes(args.kind)) {
    throw new HttpError(400, kinds.length
      ? `${itemLabel(item)} takes ${kinds.map((k) => PRINT_FILE_LABELS[k]).join(' and ')}, not a ${PRINT_FILE_LABELS[args.kind]}.`
      : `${itemLabel(item)} does not take print files.`);
  }
  if (CLOSED_FOR_UPLOADS.has(item.order.status)) {
    throw new HttpError(409, `Order ${item.order.number} is ${item.order.status.toLowerCase()} — files can no longer be changed on it. Reply to any of our emails and we will sort it out.`);
  }

  const expectedPages = expectedPagesFor(args.kind, item);
  let pages: number | null;
  try {
    ({ pages } = await checkPrintPdf(args.file, args.kind, expectedPages, 'order'));
  } catch (e) {
    await fs.unlink(args.file.path).catch(() => undefined);
    throw e;
  }

  const stored = await publishUpload({
    subdir: 'customer', filename: args.file.filename, localPath: args.file.path,
    contentType: args.file.mimetype, originalName: args.file.originalname,
  });
  const media = await prisma.mediaFile.create({
    data: {
      filename: args.file.filename, originalName: args.file.originalname, mimeType: args.file.mimetype, size: args.file.size,
      url: stored.url, folder: '/customer-uploads', uploaderId: args.uploaderId ?? undefined,
      tags: ['customer-upload', `order:${item.order.number}`, `kind:${args.kind}`, ...(pages ? [`pages:${pages}`] : [])],
    },
  });
  const row = await prisma.orderItemFile.create({
    data: { orderItemId: item.id, mediaFileId: media.id, purpose: args.kind, notes: pages ? `${pages} pages` : null },
  });
  const label = PRINT_FILE_LABELS[args.kind];
  const what = `${label} for ${itemLabel(item)}: ${args.file.originalname}${pages ? ` (${pages} pages)` : ''}`;
  await prisma.orderStatusEvent.create({ data: { orderId: item.order.id, kind: 'status', message: `Customer uploaded ${what} via ${args.via}` } });
  await notifyStaff(item.order.id, `${label} uploaded — order ${item.order.number}`, `The customer uploaded a ${what} on order ${item.order.number}.`);
  // The new file is the spot's only file now: whatever it replaced is deleted.
  await pruneSupersededPrintFiles(item.order.id);
  await autoFulfilMediaRequests(item.order.id);

  return {
    file: { id: row.id, mediaFileId: media.id, name: media.originalName, size: media.size, url: media.url, pages, uploadedAt: row.createdAt },
    pages,
  };
}

// ---------------------------------------------------------------------------
// One file per spot. A spot holds its current file and nothing else: when a
// file is rejected, replaced or removed, the old one is deleted — the row, and
// the bytes unless another order or a proof still uses them — so no stale
// version can reach production, and the order page lists only what is live.
// ---------------------------------------------------------------------------

type FileRow = { id: string; notes: string | null; media: { id: string; url: string; filename: string; folder: string; originalName: string } };

/** Delete one file row from a line, and the stored file when nothing else points at it. */
async function deleteFileRow(f: FileRow): Promise<string> {
  const m = f.media;
  await prisma.orderItemFile.delete({ where: { id: f.id } }).catch(() => undefined);
  const [otherItems, proofs] = await Promise.all([
    prisma.orderItemFile.count({ where: { mediaFileId: m.id } }),
    prisma.proof.count({ where: { mediaFileId: m.id } }),
  ]);
  if (otherItems === 0 && proofs === 0) {
    await deleteStored(m).catch(() => undefined);
    await prisma.mediaFile.delete({ where: { id: m.id } }).catch(() => undefined);
  }
  const pages = pagesFromNotes(f.notes);
  return `${m.originalName}${pages ? ` (${pages} pages)` : ''}`;
}

/**
 * The upload made in the configurator is also the value of the item's upload
 * option (cover_pdf, interior_pdf, upload), and the next backfill would link
 * it back. Keep the option only while it names the spot's current file.
 */
async function syncUploadOption(item: { id: string; options: unknown }, kind: PrintFileKind, currentUrl: string | null): Promise<boolean> {
  const optionKey = Object.entries(PRINT_FILE_KIND_BY_OPTION_KEY).find(([, k]) => k === kind)?.[0];
  if (!optionKey) return false;
  const options = (item.options && typeof item.options === 'object' ? item.options : {}) as Record<string, unknown>;
  const value = typeof options[optionKey] === 'string' ? (options[optionKey] as string).trim() : '';
  if (!value || value === currentUrl) return false;
  const { [optionKey]: _gone, ...rest } = options;
  await prisma.orderItem.update({ where: { id: item.id }, data: { options: rest as any } });
  return true;
}

/**
 * Every file ever uploaded into a spot except the newest goes, on every line
 * of the order; legacy "removed" markers go too. Run after an upload and when
 * staff open the order, so orders from before this rule tidy themselves.
 */
export async function pruneSupersededPrintFiles(orderId: string): Promise<number> {
  const items = await prisma.orderItem.findMany({ where: { orderId }, include: { files: { include: { media: true } } } });
  let pruned = 0;
  for (const it of items) {
    for (const kind of ['cover', 'interior', 'artwork'] as PrintFileKind[]) {
      const rows = it.files.filter((f) => f.purpose === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      for (const old of rows.slice(1)) { await deleteFileRow(old); pruned++; }
      if (rows.length > 0 && await syncUploadOption(it, kind, rows[0]!.media.url)) pruned++;
    }
    for (const legacy of it.files.filter((f) => f.purpose === 'removed')) { await deleteFileRow(legacy); pruned++; }
  }
  return pruned;
}

/**
 * Trash the file in a slot — uploaded by mistake, the wrong book. The slot is
 * emptied outright and the file deleted; it reads "missing" until another
 * file is sent.
 */
export async function removeItemPrintFile(args: { orderItemId: string; fileId: string; via: string }): Promise<void> {
  const row = await prisma.orderItemFile.findFirst({
    where: { id: args.fileId, orderItemId: args.orderItemId },
    include: {
      media: { select: { originalName: true } },
      orderItem: { include: { order: { select: { id: true, number: true, status: true } } } },
    },
  });
  if (!row) throw new HttpError(404, 'File not found on this line');
  if (!isPrintFileKind(row.purpose)) throw new HttpError(400, 'That file is not in an upload slot.');
  const order = row.orderItem.order;
  if (CLOSED_FOR_UPLOADS.has(order.status)) {
    throw new HttpError(409, `Order ${order.number} is ${order.status.toLowerCase()} — files can no longer be changed on it. Reply to any of our emails and we will sort it out.`);
  }
  const kind = row.purpose;
  const label = PRINT_FILE_LABELS[kind];
  const slotRows = await prisma.orderItemFile.findMany({ where: { orderItemId: args.orderItemId, purpose: kind }, include: { media: true } });
  const names: string[] = [];
  for (const r of slotRows) names.push(await deleteFileRow(r));
  await syncUploadOption(row.orderItem, kind, null);
  const what = `${label} for ${itemLabel(row.orderItem)}: ${names.join(', ')}`;
  await prisma.orderStatusEvent.create({ data: { orderId: order.id, kind: 'status', message: `Customer removed ${what} via ${args.via}` } });
  await notifyStaff(order.id, `${label} removed — order ${order.number}`, `The customer removed the ${what} on order ${order.number}. The slot is empty until they upload another.`);
}

/**
 * Staff asked for this file again, so the one on the order is wrong and goes
 * — off the line, out of the item's options, and its bytes with it. Only the
 * corrected upload will be on the line. Returns what was deleted, for the
 * timeline and the reply.
 */
export async function rejectItemPrintFile(args: { orderItemId: string; kind: PrintFileKind; why: string }): Promise<string[]> {
  const item = await prisma.orderItem.findUnique({
    where: { id: args.orderItemId },
    include: { order: { select: { id: true, number: true } }, files: { where: { purpose: args.kind }, include: { media: true } } },
  });
  if (!item) throw new HttpError(404, 'Order line not found');
  const gone: string[] = [];
  for (const f of item.files) gone.push(await deleteFileRow(f));
  const clearedOption = await syncUploadOption(item, args.kind, null);
  if (gone.length || clearedOption) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: item.order.id, kind: 'status',
        message: `${PRINT_FILE_LABELS[args.kind]} for ${itemLabel(item)} deleted from the order ${args.why}: ${gone.join(', ') || 'the order-time upload'} — only the corrected upload will be kept`,
      },
    });
  }
  return gone;
}

/** Every slot on the order, with its current file, plus the files uploaded after `since`. */
async function orderSlots(orderId: string) {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    include: {
      product: { select: { slug: true, pricingConfig: true, madeToOrder: true } },
      files: { include: { media: { select: { id: true, originalName: true, size: true, url: true } } } },
    },
  });
  return items.map((it) => ({ item: it, slots: printFileSlotsFor(it) }));
}

/**
 * An open request closes when the file it asked for is back: a request for
 * one file of one line when that slot holds a newer upload; one for a whole
 * line when every slot on the line does; an order-wide one (the older kind)
 * when every slot on the order does.
 */
export async function autoFulfilMediaRequests(orderId: string): Promise<number> {
  const open = await prisma.mediaRequest.findMany({ where: { orderId, status: 'open' } });
  if (open.length === 0) return 0;
  const all = await orderSlots(orderId);
  const everySlot = all.flatMap((x) => x.slots);
  if (everySlot.length === 0) return 0;
  let closed = 0;
  for (const mr of open) {
    const mine = mr.orderItemId
      ? (all.find((x) => x.item.id === mr.orderItemId)?.slots ?? []).filter((s) => !mr.kind || s.kind === mr.kind)
      : everySlot;
    if (mine.length === 0) continue;
    const complete = mine.every((s) => s.file && s.file.uploadedAt.getTime() >= mr.createdAt.getTime());
    if (!complete) continue;
    await prisma.mediaRequest.update({ where: { id: mr.id }, data: { status: 'fulfilled', fulfilledAt: new Date() } });
    const what = isPrintFileKind(mr.kind) ? `the ${PRINT_FILE_LABELS[mr.kind]} asked for` : 'every print file asked for';
    await prisma.orderStatusEvent.create({ data: { orderId, kind: 'status', message: `File request fulfilled — ${what} has been re-uploaded since it was made` } });
    closed++;
  }
  return closed;
}

/**
 * The customer says the request is done: something must have come in since,
 * and the slot(s) it covers may not be empty — a book cannot print without
 * both its files.
 */
export async function completeMediaRequest(requestId: string, via: string): Promise<void> {
  const mr = await prisma.mediaRequest.findUnique({ where: { id: requestId }, include: { order: { select: { id: true, number: true } } } });
  if (!mr) throw new HttpError(404, 'Request not found');
  if (mr.status === 'fulfilled') return;
  // An empty slot is the more useful thing to say — it names what to upload.
  const all = await orderSlots(mr.orderId);
  const scope = mr.orderItemId ? all.filter((x) => x.item.id === mr.orderItemId) : all;
  for (const { item, slots } of scope) {
    const empty = slots.filter((s) => !s.file && (!mr.kind || s.kind === mr.kind));
    if (empty.length) throw new HttpError(400, `${itemLabel(item)} still has no ${empty.map((s) => s.label).join(' or ')}. Upload it first, then mark the request done.`);
  }
  const since = await prisma.orderItemFile.count({
    where: {
      orderItem: mr.orderItemId ? { id: mr.orderItemId } : { orderId: mr.orderId },
      createdAt: { gte: mr.createdAt },
      purpose: isPrintFileKind(mr.kind) ? mr.kind : { not: 'removed' },
    },
  });
  if (since === 0) throw new HttpError(400, 'Nothing has been uploaded since we asked. Upload the files first, then mark the request done.');
  await prisma.mediaRequest.update({ where: { id: mr.id }, data: { status: 'fulfilled', fulfilledAt: new Date() } });
  await prisma.orderStatusEvent.create({ data: { orderId: mr.orderId, kind: 'status', message: `Customer marked the file request done via ${via} (${since} file${since === 1 ? '' : 's'} uploaded since)` } });
  await notifyStaff(mr.orderId, `Requested files uploaded — order ${mr.order.number}`, `The customer marked your file request on order ${mr.order.number} as done (${since} file${since === 1 ? '' : 's'} uploaded since the request).`);
}

/** True when a book line still lacks a file, or a file request is open — "files needed" on the order list. */
export async function orderFilesNeeded(orderId: string): Promise<boolean> {
  const openRequests = await prisma.mediaRequest.count({ where: { orderId, status: 'open' } });
  if (openRequests > 0) return true;
  return (await orderSlots(orderId)).some((x) => x.slots.some((s) => !s.file));
}
