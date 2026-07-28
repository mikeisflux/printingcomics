import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { publishUpload } from '../lib/storage.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const CUSTOMER_SUBDIR = 'customer';
const CUSTOMER_DIR = path.join(UPLOADS_DIR, CUSTOMER_SUBDIR);
await fs.mkdir(CUSTOMER_DIR, { recursive: true }).catch(() => undefined);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CUSTOMER_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

function publicUrl(filename: string) {
  return `/uploads/${CUSTOMER_SUBDIR}/${filename}`;
}

// Customer-facing file upload, used by the configurator's UPLOAD option type.
// Accepts one OR many files (field name `files`, or legacy `file`) so a buyer
// can attach every print-ready file for a book — interior + cover, etc.
// Files are stored separately from /admin/media and tagged so staff can tell
// them apart. Authentication is optional — anonymous carts can upload too.
router.post('/customer', upload.any(), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new HttpError(400, 'No file received');

  const productId = typeof req.body?.productId === 'string' ? req.body.productId : undefined;
  const optionKey = typeof req.body?.optionKey === 'string' ? req.body.optionKey : undefined;

  const created: Array<{ id: string; url: string; filename: string; size: number; mimeType: string }> = [];
  for (const f of files) {
    const stored = await publishUpload({
      subdir: CUSTOMER_SUBDIR,
      filename: f.filename,
      localPath: f.path,
      contentType: f.mimetype,
      originalName: f.originalname,
    });
    const media = await prisma.mediaFile.create({
      data: {
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url: stored.url,
        folder: '/customer-uploads',
        tags: ['customer-upload', ...(productId ? [`product:${productId}`] : []), ...(optionKey ? [`option:${optionKey}`] : [])],
        uploaderId: req.session?.sub,
      },
    });
    created.push({
      id: media.id,
      url: stored.url,
      filename: f.originalname,
      size: f.size,
      mimeType: f.mimetype,
    });
  }

  // `files` is the new shape; the first file is also spread at the top level so
  // any older single-file caller reading `url`/`id` keeps working.
  res.json({ files: created, ...created[0]! });
});

export default router;
