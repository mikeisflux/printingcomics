/**
 * Public v1 file uploads — partners send us their print files (cover PDFs,
 * interior PDFs, dust jackets, etc.) over the same API they use to submit
 * orders.
 *
 * Auth: requireApiKey('uploads:write'). The uploaded file is tagged with the
 * partner + key so admins can audit and the partner can list their own.
 *
 * Storage: same on-disk layout as customer uploads, but in a `partner/`
 * subdirectory. Each file gets a random filename + a per-file access token
 * (sha256(filename + JWT_SECRET)) — the public download URL must include
 * the token, so a leaked filename alone can't be enumerated.
 *
 * Limits: 2 GB max per file (matches existing customer upload).
 *
 * Idempotency: clients can pass the SHA-256 of their file as
 * X-Upload-Content-Hash. Duplicates within the same partner+key return the
 * existing record instead of writing again.
 */
import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { publishUpload } from '../../lib/storage.js';
import { HttpError } from '../../middleware/error.js';
import { requireApiKey } from '../../middleware/api-key.js';
import { config } from '../../config.js';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const PARTNER_SUBDIR = 'partner';
const PARTNER_DIR = path.join(UPLOADS_DIR, PARTNER_SUBDIR);
await fs.mkdir(PARTNER_DIR, { recursive: true }).catch(() => undefined);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PARTNER_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

function makeAccessToken(filename: string): string {
  return createHash('sha256').update(`${filename}:${config.jwtSecret}`).digest('hex').slice(0, 32);
}

function publicUrl(filename: string, token: string) {
  return `/uploads/${PARTNER_SUBDIR}/${filename}?t=${token}`;
}

async function hashFile(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

function serialize(media: any) {
  return {
    id: media.id,
    url: media.url,
    filename: media.originalName,
    size: media.size,
    mimeType: media.mimeType,
    contentHash: media.contentHash,
    purpose: extractPurposeTag(media.tags),
    notes: extractNoteTag(media.tags),
    createdAt: media.createdAt,
  };
}

function extractPurposeTag(tags: string[]): string | null {
  const t = tags?.find((x) => x.startsWith('purpose:'));
  return t ? t.slice('purpose:'.length) : null;
}

function extractNoteTag(tags: string[]): string | null {
  const t = tags?.find((x) => x.startsWith('note:'));
  return t ? t.slice('note:'.length) : null;
}

// Upload a print file. The body is multipart/form-data:
//   file:    binary (required)
//   purpose: free-form, e.g. "cover", "interior", "back-cover" (optional)
//   notes:   integrator-side note attached to the file (optional, max 500)
router.post('/', requireApiKey('uploads:write'), upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, 'No file received — send as multipart/form-data with field name "file".');

  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose.slice(0, 60) : undefined;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : undefined;
  const clientHash =
    typeof req.headers['x-upload-content-hash'] === 'string'
      ? (req.headers['x-upload-content-hash'] as string).toLowerCase()
      : undefined;

  // Compute the actual hash so we can both report it back and detect dupes.
  const absPath = path.join(PARTNER_DIR, f.filename);
  let contentHash: string;
  try {
    contentHash = await hashFile(absPath);
  } catch {
    throw new HttpError(500, 'Could not hash uploaded file');
  }
  if (clientHash && clientHash !== contentHash) {
    await fs.unlink(absPath).catch(() => undefined);
    throw new HttpError(400, 'X-Upload-Content-Hash does not match the file received');
  }

  // Idempotency: same hash + same key → return the prior MediaFile and drop
  // the just-written copy from disk.
  const existing = await prisma.mediaFile.findFirst({
    where: { contentHash, apiKeyId: req.apiKey!.id },
  });
  if (existing) {
    await fs.unlink(absPath).catch(() => undefined);
    return res.json({ upload: serialize(existing), idempotent: true });
  }

  const accessToken = makeAccessToken(f.filename);
  const tags = [
    'partner-upload',
    `partner:${req.apiKey!.partnerId ?? 'unattached'}`,
    `apiKey:${req.apiKey!.prefix}`,
    ...(purpose ? [`purpose:${purpose}`] : []),
    ...(notes ? [`note:${notes}`] : []),
  ];

  // Partner files keep their ?t=<token> guard when served locally; in R2 the
  // unguessable key + signed/public URL is the capability.
  const stored = await publishUpload({
    subdir: PARTNER_SUBDIR,
    filename: f.filename,
    localPath: absPath,
    contentType: f.mimetype,
    originalName: f.originalname,
    localQuery: `?t=${accessToken}`,
  });
  const media = await prisma.mediaFile.create({
    data: {
      filename: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      url: stored.url,
      folder: '/partner-uploads',
      tags,
      partnerId: req.apiKey!.partnerId ?? undefined,
      apiKeyId: req.apiKey!.id,
      contentHash,
      accessToken,
    },
  });

  res.status(201).json({ upload: serialize(media), idempotent: false });
});

// List uploads for the calling key (paginated).
router.get('/', requireApiKey('uploads:read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const purpose = req.query.purpose as string | undefined;
  const where: any = { apiKeyId: req.apiKey!.id };
  if (purpose) where.tags = { has: `purpose:${purpose}` };
  const items = await prisma.mediaFile.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ uploads: items.map(serialize) });
});

// Fetch metadata for one upload (the owning key only).
router.get('/:id', requireApiKey('uploads:read'), async (req, res) => {
  const media = await prisma.mediaFile.findFirst({
    where: { id: String(req.params.id), apiKeyId: req.apiKey!.id },
  });
  if (!media) throw new HttpError(404, 'Upload not found');
  res.json({ upload: serialize(media) });
});

// Soft-delete: detach from any orders + remove from disk + mark inactive.
// We keep the row so audit trail (which key uploaded what) survives.
router.delete('/:id', requireApiKey('uploads:write'), async (req, res) => {
  const media = await prisma.mediaFile.findFirst({
    where: { id: String(req.params.id), apiKeyId: req.apiKey!.id },
  });
  if (!media) throw new HttpError(404, 'Upload not found');

  // Refuse if the file is referenced by an order — partner has to ask
  // support to detach it first.
  const inUse = await prisma.orderItemFile.count({ where: { mediaFileId: media.id } });
  if (inUse > 0) {
    throw new HttpError(
      409,
      `Cannot delete: file is attached to ${inUse} order line item(s). Contact support if you need to remove it.`,
    );
  }

  // Remove from disk; the row stays so we can prove who deleted it when.
  await fs.unlink(path.join(PARTNER_DIR, media.filename)).catch(() => undefined);
  await prisma.mediaFile.update({
    where: { id: media.id },
    data: {
      tags: [...(media.tags ?? []), 'deleted'],
      url: '',
      accessToken: null,
    },
  });
  res.json({ ok: true });
});

export default router;
