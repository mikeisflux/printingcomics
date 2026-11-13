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

export const listingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export function isFileKind(v: unknown): v is FileKind {
  return typeof v === 'string' && (FILE_KINDS as readonly string[]).includes(v);
}

/** Store one uploaded file on a listing as the next version of its kind. */
export async function storeListingFile(args: { listingId: string; kind: FileKind; file: Express.Multer.File; actor: Actor; uploaderId?: string | null }) {
  const { listingId, kind, file } = args;
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, title: true, trimWidthIn: true, trimHeightIn: true, pageCount: true, partnerId: true } });
  if (!listing) { await fs.unlink(file.path).catch(() => undefined); throw new HttpError(404, 'Listing not found'); }
  const isPdf = /pdf$/i.test(file.mimetype) || /\.pdf$/i.test(file.originalname);
  const isImage = /^image\//.test(file.mimetype);
  if ((kind === 'cover' || kind === 'interior') && !isPdf) { await fs.unlink(file.path).catch(() => undefined); throw new HttpError(400, `The ${kind} must be a PDF.`); }
  if (kind === 'cover_image' && !isImage) { await fs.unlink(file.path).catch(() => undefined); throw new HttpError(400, 'The cover image must be a JPG, PNG or WebP.'); }

  let preflight: PreflightResult | null = null;
  if (kind === 'cover' || kind === 'interior') {
    const s = await getPodSettings();
    preflight = await preflightPdf(file.path, { kind, trimWidthIn: listing.trimWidthIn, trimHeightIn: listing.trimHeightIn, declaredPages: kind === 'interior' ? listing.pageCount : null, pageCountStep: s.pageCountStep });
  }
  const stored = await publishUpload({ subdir: SUBDIR, filename: file.filename, localPath: file.path, contentType: file.mimetype, originalName: file.originalname });
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
