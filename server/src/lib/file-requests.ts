/**
 * "Send this file again": a request to the customer for a corrected print
 * file on one order line — which file (the Cover PDF, the Interior PDF…),
 * why (a fixed list of reasons staff tick, plus a note), and the email that
 * tells them what was wrong, what to send, and — for anything to do with size
 * or bleed — where the template for their trim size is.
 *
 * Requests are MediaRequest rows with orderItemId + kind + reasons. They close
 * on their own when that slot gets a newer upload (lib/print-files.ts).
 */
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { PRINT_FILE_LABELS, printFileInstructions, expectedPagesFor, printFileKindsFor, isPrintFileKind, type PrintFileKind } from './print-files.js';
import { itemLabel, itemTitle, proofToken } from './proofs.js';
import { ensureCustomerAccount, magicLink } from './customer-accounts.js';
import { storeName, baseUrl, esc, btn, wrap, trySend, type EmailResult } from './proof-emails.js';

export interface FileRequestReason {
  key: string;
  /** What staff tick, and the heading the customer reads. */
  label: string;
  /** What the customer is told to do about it. */
  hint: string;
  /** The fix needs the trim/bleed template, so the email links to it. */
  template: boolean;
  group: 'size' | 'file' | 'content';
}

export const FILE_REQUEST_REASONS: FileRequestReason[] = [
  // Size & bleed — the template fixes these.
  { key: 'wrong_size', label: 'Wrong page size (not the ordered trim)', hint: 'The pages are not the size the book was ordered at. Set the document to the trim size plus 0.125″ bleed on every side — the template is already set up that way.', template: true, group: 'size' },
  { key: 'no_bleed', label: 'No bleed', hint: 'Art stops at the trim edge, so any shift in trimming would leave a white sliver. Extend backgrounds and edge art 0.125″ past the trim on every side.', template: true, group: 'size' },
  { key: 'safe_area', label: 'Text or art too close to the edge', hint: 'Keep text, logos and anything important at least 0.25″ inside the trim so it cannot be clipped.', template: true, group: 'size' },
  { key: 'spreads', label: 'Spreads instead of single pages', hint: 'Export single pages in reading order, not two-page spreads, so each page can be placed on the sheet.', template: true, group: 'size' },
  { key: 'cover_order', label: 'Cover pages missing or in the wrong order', hint: 'The Cover PDF must be exactly 4 single pages, in this order: front cover, inside front cover, inside back cover, back cover.', template: true, group: 'size' },
  { key: 'crop_marks', label: 'Crop marks or printer’s marks in the file', hint: 'Export without printer’s marks — no crop marks, registration marks, color bars or page information. The page should be just the art at trim size plus 0.125″ bleed, as the template shows.', template: true, group: 'size' },
  { key: 'mixed_page_sizes', label: 'Pages are different sizes', hint: 'Every page must be the same size — the trim size plus 0.125″ bleed on every side. Set the whole document to the template’s page size and export again.', template: true, group: 'size' },
  { key: 'wrong_orientation', label: 'Pages turned sideways or upside down', hint: 'Export every page upright, in portrait, at the trim size. Rotate any sideways pages back before exporting.', template: true, group: 'size' },
  // The file itself.
  { key: 'corrupted', label: 'File is corrupted or will not open', hint: 'We could not open the file. Re-export it from your design app as a PDF (PDF/X-1a or PDF/X-4 is ideal) and upload it again.', template: false, group: 'file' },
  { key: 'not_pdf', label: 'Not a print-ready PDF', hint: 'Please send a PDF rather than an image, Word or layout file — export it from your design app with the fonts embedded.', template: false, group: 'file' },
  { key: 'password_protected', label: 'PDF is password-protected or locked', hint: 'Remove the password and any printing or editing restrictions, then export the PDF again.', template: false, group: 'file' },
  { key: 'fonts', label: 'Fonts not embedded', hint: 'Embed or outline every font before exporting; a missing font gets substituted on press.', template: false, group: 'file' },
  { key: 'low_resolution', label: 'Low-resolution images', hint: 'Images should be 300 dpi at the printed size. Re-export from the original artwork rather than enlarging a small file.', template: false, group: 'file' },
  { key: 'color_mode', label: 'RGB or spot colors (needs CMYK)', hint: 'Convert the file to CMYK before exporting. RGB and spot colors shift on press.', template: false, group: 'file' },
  { key: 'transparency', label: 'Image not flattened (layers, transparency or live effects)', hint: 'Flatten the file before exporting — merge the layers and flatten transparency, drop shadows and other live effects — so nothing drops out or shifts on press.', template: false, group: 'file' },
  { key: 'ink_coverage', label: 'Too much ink (heavy blacks)', hint: 'Keep total ink under 300%. Use plain 100% black for text and fine lines; use rich black (around C60 M40 Y40 K100) only for large solid areas.', template: false, group: 'file' },
  { key: 'hairlines', label: 'Lines too thin to print', hint: 'Make every line at least 0.25 pt; hairlines and very thin strokes drop out on press.', template: false, group: 'file' },
  // Pages & content.
  { key: 'page_count', label: 'Wrong page count', hint: 'The file does not have the number of pages the book was ordered with. The Cover PDF is exactly 4 pages; the Interior PDF has every interior page and nothing else.', template: false, group: 'content' },
  { key: 'blank_pages', label: 'Blank, duplicate or out-of-order pages', hint: 'The file has empty or repeated pages where art should be, or pages out of reading order. Check the page order in your layout and export again.', template: false, group: 'content' },
  { key: 'watermark', label: 'Proof, draft or trial-software watermarks', hint: 'Remove any “PROOF”, “DRAFT” or trial-software watermark from the art before exporting.', template: false, group: 'content' },
  { key: 'wrong_file', label: 'Wrong file for this book', hint: 'The file does not match this book — another title, an old version, or the file for the other upload spot.', template: false, group: 'content' },
  { key: 'other', label: 'Something else (see the note)', hint: '', template: false, group: 'content' },
];
const REASON_BY_KEY = new Map(FILE_REQUEST_REASONS.map((r) => [r.key, r]));

/** The reasons stored on a request, resolved; unknown keys are dropped. */
export function presentReasons(raw: unknown): FileRequestReason[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((k) => REASON_BY_KEY.get(String(k))).filter((r): r is FileRequestReason => !!r);
}

/** The template for a product's trim size — the files web/public/templates holds, named as the Templates page names them. */
export function templateFor(product: { slug?: string | null; name?: string | null } | null | undefined): { label: string; path: string } | null {
  const s = `${product?.slug ?? ''} ${product?.name ?? ''}`.toLowerCase();
  if (!s.trim()) return null;
  if (/trading.?card/.test(s)) return { label: 'Trading Card (2.5 × 3.5 in)', path: '/templates/template-trading-card.pdf' };
  if (/art-print|art print/.test(s)) return { label: 'Art Print (11 × 17 in)', path: '/templates/template-art-print.pdf' };
  if (/\ba5\b/.test(s)) return { label: 'A5 (5.8 × 8.3 in)', path: '/templates/template-a5.pdf' };
  if (/magazine/.test(s)) return { label: 'Magazine (8 × 10.5 in)', path: '/templates/template-magazine.pdf' };
  if (/letter/.test(s)) return { label: 'US Letter (8.5 × 11 in)', path: '/templates/template-letter.pdf' };
  if (/standard/.test(s)) return { label: 'Standard Comic (6.625 × 10.25 in)', path: '/templates/template-standard.pdf' };
  return null;
}

type RequestRow = {
  id: string; orderItemId: string | null; kind: string | null; reasons: unknown; note: string | null; message: string;
  status: string; createdAt: Date; fulfilledAt: Date | null;
  orderItem?: { name?: string | null; options?: unknown; product?: { slug?: string | null; name?: string | null } | null } | null;
};

/** A request as the order pages (staff and customer) read it. */
export function presentRequest(mr: RequestRow, base: string) {
  const reasons = presentReasons(mr.reasons);
  const kind = isPrintFileKind(mr.kind) ? mr.kind : null;
  const template = reasons.some((r) => r.template) ? templateFor(mr.orderItem?.product) : null;
  return {
    id: mr.id,
    orderItemId: mr.orderItemId ?? null,
    kind,
    kindLabel: kind ? PRINT_FILE_LABELS[kind] : null,
    itemLabel: mr.orderItem ? itemLabel(mr.orderItem) : null,
    itemTitle: mr.orderItem ? itemTitle(mr.orderItem) || null : null,
    message: mr.message,
    note: mr.note ?? null,
    status: mr.status,
    createdAt: mr.createdAt,
    fulfilledAt: mr.fulfilledAt,
    reasons: reasons.map(({ key, label, hint, template: t }) => ({ key, label, hint, template: t })),
    templateUrl: template ? `${base}${template.path}` : null,
    templateLabel: template?.label ?? null,
    templatesPage: `${base}/resources/templates`,
  };
}
export type PresentedFileRequest = ReturnType<typeof presentRequest>;

const itemInclude = { product: { select: { slug: true, name: true, pricingConfig: true, madeToOrder: true } } } as const;

/** One request per file asked for, on one line, with the reasons; the timeline notes it. */
export async function createFileRequests(args: {
  orderId: string;
  orderItemId: string;
  kinds: PrintFileKind[];
  reasons: string[];
  note?: string | null;
  actorName?: string | null;
}) {
  const item = await prisma.orderItem.findFirst({ where: { id: args.orderItemId, orderId: args.orderId }, include: itemInclude });
  if (!item) throw new HttpError(404, 'Order line not found');
  const allowed = printFileKindsFor(item);
  const kinds = [...new Set(args.kinds)];
  if (kinds.length === 0) throw new HttpError(400, 'Pick which file you need from the customer.');
  for (const k of kinds) {
    if (!allowed.includes(k)) throw new HttpError(400, `${itemLabel(item)} has no ${PRINT_FILE_LABELS[k]} to ask for.`);
  }
  const reasons = [...new Set(args.reasons.map((r) => String(r)))];
  if (reasons.length === 0) throw new HttpError(400, 'Pick at least one reason, so the customer knows what to fix.');
  const unknown = reasons.filter((r) => !REASON_BY_KEY.has(r));
  if (unknown.length) throw new HttpError(400, `Unknown reason: ${unknown.join(', ')}`);
  const note = args.note?.trim() || null;
  if (reasons.includes('other') && !note) throw new HttpError(400, 'Say what is wrong in the note when the reason is "Something else".');

  const labels = reasons.map((r) => REASON_BY_KEY.get(r)!.label);
  const requests: Awaited<ReturnType<typeof prisma.mediaRequest.create>>[] = [];
  for (const kind of kinds) {
    const message = `${PRINT_FILE_LABELS[kind]} for ${itemLabel(item)}: ${labels.join('; ')}${note ? `. ${note}` : ''}`;
    requests.push(await prisma.mediaRequest.create({
      data: { orderId: args.orderId, orderItemId: item.id, kind, reasons, note, message, token: proofToken(), status: 'open' },
    }));
  }
  await prisma.orderStatusEvent.create({
    data: {
      orderId: args.orderId, kind: 'status', actorName: args.actorName ?? undefined,
      message: `Requested a new ${kinds.map((k) => PRINT_FILE_LABELS[k]).join(' and ')} for ${itemLabel(item)} — ${labels.join(', ')}${note ? ` — ${note}` : ''}`,
    },
  });
  return { requests, item };
}

/**
 * The email for one batch of requests (one line, one or more files): what was
 * wrong with each, what to send instead, the template when size or bleed is
 * the problem, and a link that signs the customer in to the upload spot.
 */
export async function renderFileRequestEmail(requestIds: string[]): Promise<{ to: string; subject: string; html: string; orderId: string; orderNumber: string } | null> {
  const reqs = await prisma.mediaRequest.findMany({
    where: { id: { in: requestIds } },
    include: { order: true, orderItem: { include: itemInclude } },
    orderBy: { createdAt: 'asc' },
  });
  if (reqs.length === 0) return null;
  const order = reqs[0]!.order;
  const item = reqs[0]!.orderItem;
  const [name, base] = await Promise.all([storeName(), baseUrl()]);
  const account = await ensureCustomerAccount(order.email);
  const link = await magicLink(account.id, `/account/orders/${encodeURIComponent(order.number)}`);
  const title = item ? itemTitle(item) : '';
  const what = item ? itemLabel(item) : `order ${order.number}`;
  const kinds = reqs.map((r) => r.kind).filter(isPrintFileKind);
  const kindLabels = kinds.map((k) => PRINT_FILE_LABELS[k]);
  const needsTemplate = reqs.some((r) => presentReasons(r.reasons).some((x) => x.template));
  const template = needsTemplate ? templateFor(item?.product) : null;

  const sections = reqs.map((r) => {
    const kind = isPrintFileKind(r.kind) ? r.kind : 'artwork';
    const reasons = presentReasons(r.reasons);
    const expected = item ? expectedPagesFor(kind, item) : null;
    return `
      <h3 style="margin:1.25rem 0 .35rem">${esc(PRINT_FILE_LABELS[kind])}${title ? ` — “${esc(title)}”` : ''}</h3>
      <p style="margin:.25rem 0"><strong>What we found:</strong></p>
      <ul style="padding-left:1.1rem;margin:.25rem 0 .75rem">
        ${reasons.map((x) => `<li style="margin:.3rem 0"><strong>${esc(x.label)}.</strong> ${esc(x.hint)}</li>`).join('')}
      </ul>
      ${r.note ? `<blockquote style="border-left:3px solid #C61A22;margin:.5rem 0 .75rem;padding:.25rem 1rem;color:#333">${esc(r.note)}</blockquote>` : ''}
      <p style="margin:.25rem 0"><strong>What to send:</strong></p>
      <ul style="padding-left:1.1rem;margin:.25rem 0;color:#333">${printFileInstructions(kind, expected).map((l) => `<li style="margin:.25rem 0">${esc(l)}</li>`).join('')}</ul>`;
  }).join('');

  const templateBox = template
    ? `<div style="border:1px solid #f0d58c;background:#fffbeb;border-radius:8px;padding:.75rem 1rem;margin:1.25rem 0">
         <strong>Use our template.</strong> The ${esc(template.label)} template has the trim, bleed and safe area marked, so the file comes out at the right size:
         <a href="${base}${template.path}" style="color:#C61A22;font-weight:700">download the ${esc(template.label)} template</a>.
         How to use it: <a href="${base}/resources/templates" style="color:#666">${base}/resources/templates</a>.
       </div>`
    : '';

  const html = wrap(
    `<h2 style="color:#C61A22">We need a corrected file for your order</h2>
     <p>We checked the files on order <strong>${esc(order.number)}</strong>, and the <strong>${esc(kindLabels.join(' and '))}</strong> for <strong>${esc(what)}</strong> ${kinds.length === 1 ? 'needs' : 'need'} to be sent again before it can print.</p>
     ${sections}
     ${templateBox}
     ${btn(link, kinds.length === 1 ? `Upload the corrected ${kindLabels[0]}` : 'Upload the corrected files')}
     <p style="color:#666;font-size:.85rem">The link signs you in and opens the order, with the upload spot for this book marked. The newest upload replaces the old one, and nothing prints until we have it. Questions? Just reply to this email.</p>`,
    name,
  );
  const subject = `Action needed: new ${kindLabels.join(' and ')} for ${title ? `“${title}”` : what} — order ${order.number}`;
  return { to: order.email, subject, html, orderId: order.id, orderNumber: order.number };
}

export async function sendFileRequestEmail(requestIds: string[]): Promise<EmailResult> {
  const r = await renderFileRequestEmail(requestIds);
  if (!r) return { sent: false, error: 'request not found' };
  return trySend(
    r.orderId,
    { to: { email: r.to }, subject: r.subject, html: r.html, tags: [`order:${r.orderNumber}`, 'file-request'] },
    `File request emailed to ${r.to}`,
  );
}
