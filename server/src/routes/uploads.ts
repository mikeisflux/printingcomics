import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
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
// Files are stored separately from /admin/media and tagged so staff can tell
// them apart. Authentication is optional — anonymous carts can upload too.
router.post('/customer', upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, 'No file received');

  const productId = typeof req.body?.productId === 'string' ? req.body.productId : undefined;
  const optionKey = typeof req.body?.optionKey === 'string' ? req.body.optionKey : undefined;

  const media = await prisma.mediaFile.create({
    data: {
      filename: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      url: publicUrl(f.filename),
      folder: '/customer-uploads',
      tags: ['customer-upload', ...(productId ? [`product:${productId}`] : []), ...(optionKey ? [`option:${optionKey}`] : [])],
      uploaderId: req.session?.sub,
    },
  });

  res.json({
    url: media.url,
    filename: media.originalName,
    size: media.size,
    mimeType: media.mimeType,
    id: media.id,
  });
});

export default router;
