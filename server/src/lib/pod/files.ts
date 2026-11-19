/**
 * Files on a listing: the cover PDF, the interior PDF, the web cover image,
 * extras. Each upload is a new version; the newest per kind is the one in
 * play. Print PDFs are preflighted on the way in.
 */
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { MAX_UPLOAD_BYTES } from '../../config.js';
import { publishUpload, UPLOADS_DIR } from '../storage.js';
import { preflightPdf, type PreflightResult } from './preflight.js';
import { FILE_KINDS, type FileKind } from './present.js';
import { getPodSettings } from './settings.js';
import { recordPodEvent, type Actor } from './events.js';
import type { Prisma } from '../../generated/prisma/client.js';

const SUBDIR = 'pod';
const DIR = path.join(UPLOADS_DIR, SUBDIR);
await fs.mkdir(DIR, { recursive: true }).catch(() => undefined);

/**
 * What may be stored at all, and under which extension. Anything else is kept
 * as .bin so the browser never runs it. HTML, SVG, scripts and the like are
 * never stored under their own extension: files under /uploads are served
 * from our own origin, where a page would run with a staff session.
 */
const SAFE_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'zip', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ai', 'psd', 'tif', 'tiff']);
export const PDF_EXTS = new Set(['pdf']);
export const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const PDF_OR_IMAGE = new Set([...PDF_EXTS, ...IMAGE_EXTS]);
export function fileExt(name: string): string { return path.extname(name).slice(1).toLowerCase(); }

export const listingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DIR),
    filename: (_req, file, cb) => { const ext = fileExt(file.originalname); cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}.${SAFE_EXTS.has(ext) ? ext : 'bin'}`); },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/** Order forms and listing sheets: a few megabytes of text, never a 5 GB file read into memory. */
export const csvUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DIR),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}.csv`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

/** Refuse (and delete) an upload whose type does not fit the slot. */
export async function requireUploadType(file: Express.Multer.File, allowed: Set<string>, what: string): Promise<void> {
  const ext = fileExt(file.originalname);
  const mimeOk = allowed.has('pdf') && /pdf$/i.test(file.mimetype) || [...allowed].some((e) => IMAGE_EXTS.has(e)) && /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
  if (!allowed.has(ext) || (!mimeOk && !/^application\/(zip|octet-stream|msword|vnd\.)/i.test(file.mimetype) && !/^text\//i.test(file.mimetype))) {
    await fs.unlink(file.path).catch(() => undefined);
    const list = [...allowed].map((e) => e.toUpperCase()).join(', ');
    throw new HttpError(400, `${what} must be ${list.includes(',') ? `one of ${list}` : `a ${list}`}; “${file.originalname}” is ${ext ? `.${ext}` : file.mimetype || 'not that'}.`);
  }
  // The stored type follows the accepted extension, never what the browser
  // declared: a ".pdf" sent as text/html must not come back as a page.
  file.mimetype = MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  zip: 'application/zip', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ai: 'application/postscript', psd: 'image/vnd.adobe.photoshop', tif: 'image/tiff', tiff: 'image/tiff',
};
export const UPLOAD_TYPES = {
  print: PDF_EXTS,
  image: IMAGE_EXTS,
  pdfOrImage: PDF_OR_IMAGE,
  extra: new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'zip', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ai', 'psd', 'tif', 'tiff']),
};

export function isFileKind(v: unknown): v is FileKind {
  return typeof v === 'string' && (FILE_KINDS as readonly string[]).includes(v);
}

/** Store one uploaded file on a listing as the next version of its kind. */
export async function storeListingFile(args: { listingId: string; kind: FileKind; file: Express.Multer.File; actor: Actor; uploaderId?: string | null }) {
  const { listingId, kind, file } = args;
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, title: true, trimWidthIn: true, trimHeightIn: true, pageCount: true, partnerId: true } });
  if (!listing) { await fs.unlink(file.path).catch(() => undefined); throw new HttpError(404, 'Listing not found'); }
  if (kind === 'cover' || kind === 'interior') await requireUploadType(file, UPLOAD_TYPES.print, `The ${kind} PDF`);
  else if (kind === 'cover_image' || kind === 'marketing') await requireUploadType(file, UPLOAD_TYPES.image, kind === 'marketing' ? 'A marketing image' : 'The cover image');
  else await requireUploadType(file, UPLOAD_TYPES.extra, 'An extra file');

  let preflight: PreflightResult | null = null;
  if (kind === 'cover' || kind === 'interior') {
    const s = await getPodSettings();
    try {
      preflight = await preflightPdf(file.path, { kind, trimWidthIn: listing.trimWidthIn, trimHeightIn: listing.trimHeightIn, declaredPages: kind === 'interior' ? listing.pageCount : null, pageCountStep: s.pageCountStep });
    } catch (e) {
      await fs.unlink(file.path).catch(() => undefined);
      throw e;
    }
  }
  const stored = await publishUpload({ subdir: SUBDIR, filename: file.filename, localPath: file.path, contentType: file.mimetype, originalName: file.originalname, gated: kind !== 'cover_image' && kind !== 'marketing' });
  const media = await prisma.mediaFile.create({ data: {
    filename: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size, url: stored.url, folder: '/pod',
    tags: ['pod', `listing:${listingId}`, `kind:${kind}`, ...(preflight?.pageCount ? [`pages:${preflight.pageCount}`] : [])],
    uploaderId: args.uploaderId ?? null, partnerId: listing.partnerId,
  } });
  const last = await prisma.listingFile.findFirst({ where: { listingId, kind }, orderBy: { version: 'desc' }, select: { version: true } });
  const row = await prisma.listingFile.create({ data: {
    listingId, kind, mediaFileId: media.id, version: (last?.version ?? 0) + 1,
    reviewStatus: preflight?.status === 'changes_required' ? 'rejected' : 'uploaded',
    preflight: (preflight as unknown as Prisma.InputJsonValue) ?? undefined, uploadedById: args.uploaderId ?? null,
  }, include: { media: true } });
  if (kind === 'cover_image') await prisma.listing.update({ where: { id: listingId }, data: { coverImageId: media.id } });
  await recordPodEvent('listing', listingId, 'file', `${kind} v${row.version} uploaded: ${file.originalname}${preflight ? ` — ${preflight.headline}` : ''}`, args.actor);
  // A new print file while a run is approved or on press is not quietly
  // filed away: the run's history says so and staff hear about it.
  if (kind === 'cover' || kind === 'interior') {
    const runs = await prisma.productionOrder.findMany({ where: { listingId, status: { in: ['APPROVED', 'IN_PRODUCTION'] } }, select: { id: true, number: true, status: true } });
    for (const run of runs) await recordPodEvent('production', run.id, 'file', `New ${kind} PDF (v${row.version}) uploaded while this run is ${run.status === 'IN_PRODUCTION' ? 'in production' : 'approved'}: ${file.originalname}`, args.actor);
    if (runs.length) {
      const { notifyStaff } = await import('./emails.js');
      void notifyStaff(`New ${kind} PDF on a run that is ${runs[0]!.status === 'IN_PRODUCTION' ? 'in production' : 'approved'}: ${listing.title}`, `<h2 style="margin:0 0 .5rem">Print file replaced mid-run</h2><p>A new <strong>${kind}</strong> PDF (v${row.version}) was uploaded for <strong>${listing.title}</strong> while run${runs.length > 1 ? 's' : ''} ${runs.map((r) => r.number).join(', ')} ${runs.length > 1 ? 'are' : 'is'} ${runs[0]!.status === 'IN_PRODUCTION' ? 'in production' : 'approved'}. Check whether the press has the right file.</p>`, `/admin/pod/production?open=${runs[0]!.id}`);
    }
  }
  return { row, preflight };
}

/** Re-run the automatic checks on a stored print PDF (after the trim or page count changed). */
export async function rerunPreflight(fileId: string): Promise<PreflightResult> {
  const f = await prisma.listingFile.findUnique({ where: { id: fileId }, include: { media: true, listing: { select: { trimWidthIn: true, trimHeightIn: true, pageCount: true } } } });
  if (!f) throw new HttpError(404, 'File not found');
  if (f.kind !== 'cover' && f.kind !== 'interior') throw new HttpError(400, 'Only print PDFs are preflighted');
  const local = path.join(UPLOADS_DIR, SUBDIR, f.media.filename);
  const s = await getPodSettings();
  const result = await preflightPdf(local, { kind: f.kind, trimWidthIn: f.listing.trimWidthIn, trimHeightIn: f.listing.trimHeightIn, declaredPages: f.kind === 'interior' ? f.listing.pageCount : null, pageCountStep: s.pageCountStep });
  await prisma.listingFile.update({ where: { id: fileId }, data: { preflight: result as unknown as Prisma.InputJsonValue, reviewStatus: result.status === 'changes_required' ? 'rejected' : f.reviewStatus === 'approved' ? 'approved' : 'uploaded' } });
  return result;
}

/** Make an older version current again: a new version row pointing at the same stored file. */
export async function restoreListingFileVersion(fileId: string, actor: Actor) {
  const f = await prisma.listingFile.findUnique({ where: { id: fileId } });
  if (!f) throw new HttpError(404, 'File version not found');
  const last = await prisma.listingFile.findFirst({ where: { listingId: f.listingId, kind: f.kind }, orderBy: { version: 'desc' }, select: { version: true, id: true } });
  if (last?.id === f.id) throw new HttpError(400, 'That is already the current version');
  const failed = (f.preflight as { status?: string } | null)?.status === 'changes_required';
  const row = await prisma.listingFile.create({ data: { listingId: f.listingId, kind: f.kind, mediaFileId: f.mediaFileId, version: (last?.version ?? 0) + 1, reviewStatus: failed ? 'rejected' : 'uploaded', preflight: f.preflight ?? undefined, note: `Restored from v${f.version}`, uploadedById: actor.id } });
  if (f.kind === 'cover_image') await prisma.listing.update({ where: { id: f.listingId }, data: { coverImageId: f.mediaFileId } });
  await recordPodEvent('listing', f.listingId, 'file', `${f.kind} v${f.version} restored as v${row.version}`, actor);
  return row;
}

/** Remove a file version; the stored bytes go too when nothing else points at them. */
export async function deleteListingFile(fileId: string, actor: Actor) {
  const f = await prisma.listingFile.findUnique({ where: { id: fileId }, include: { media: true } });
  if (!f) throw new HttpError(404, 'File not found');
  await prisma.listingFile.delete({ where: { id: f.id } });
  const stillUsed = await prisma.listingFile.count({ where: { mediaFileId: f.mediaFileId } });
  const asCover = await prisma.listing.count({ where: { coverImageId: f.mediaFileId } });
  if (!stillUsed && !asCover) {
    const { deleteStored } = await import('../storage.js');
    await deleteStored(f.media).catch(() => undefined);
    await prisma.mediaFile.delete({ where: { id: f.mediaFileId } }).catch(() => undefined);
  } else if (f.kind === 'cover_image' && asCover) {
    const newest = await prisma.listingFile.findFirst({ where: { listingId: f.listingId, kind: 'cover_image' }, orderBy: { version: 'desc' } });
    await prisma.listing.update({ where: { id: f.listingId }, data: { coverImageId: newest?.mediaFileId ?? null } });
  }
  await recordPodEvent('listing', f.listingId, 'file-removed', `${f.kind} v${f.version} removed (${f.media.originalName})`, actor);
  return f;
}

/** Store a publisher asset (logo, marketing image, press kit) outside any listing. */
export async function storePublisherAsset(args: { partnerId: string; kind: string; title?: string | null; file: Express.Multer.File; actor: Actor; uploaderId?: string | null }) {
  const { file } = args;
  if (args.kind === 'logo' || args.kind === 'marketing') await requireUploadType(file, UPLOAD_TYPES.image, args.kind === 'logo' ? 'A logo' : 'A marketing image');
  else await requireUploadType(file, UPLOAD_TYPES.extra, 'A press file');
  const stored = await publishUpload({ subdir: SUBDIR, filename: file.filename, localPath: file.path, contentType: file.mimetype, originalName: file.originalname, gated: args.kind !== 'logo' && args.kind !== 'marketing' });
  const media = await prisma.mediaFile.create({ data: { filename: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size, url: stored.url, folder: '/pod/assets', tags: ['pod-asset', `kind:${args.kind}`, `partner:${args.partnerId}`], uploaderId: args.uploaderId ?? null, partnerId: args.partnerId } });
  const asset = await prisma.publisherAsset.create({ data: { partnerId: args.partnerId, kind: args.kind, title: args.title ?? file.originalname, mediaFileId: media.id }, include: { media: true } });
  if (args.kind === 'logo') await prisma.partner.update({ where: { id: args.partnerId }, data: { logoId: media.id } });
  return asset;
}
