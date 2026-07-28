import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { publishUpload, deleteStored } from '../../lib/storage.js';
import { HttpError } from '../../middleware/error.js';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
const MEDIA_SUBDIR = 'media';
const MEDIA_DIR = path.join(UPLOADS_DIR, MEDIA_SUBDIR);
await fs.mkdir(MEDIA_DIR, { recursive: true }).catch(() => undefined);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB per file
});

function publicUrl(filename: string) {
  return `/uploads/${MEDIA_SUBDIR}/${filename}`;
}

// ---- List / filter ----
router.get('/', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const folder = (req.query.folder as string | undefined) ?? undefined;
  const kind = req.query.kind as string | undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Number(req.query.limit ?? 60));

  const where: any = {};
  if (folder) where.folder = folder;
  if (q) where.OR = [
    { originalName: { contains: q, mode: 'insensitive' } },
    { altText: { contains: q, mode: 'insensitive' } },
    { tags: { has: q } },
  ];
  if (kind === 'image') where.mimeType = { startsWith: 'image/' };
  else if (kind === 'video') where.mimeType = { startsWith: 'video/' };
  else if (kind === 'document') where.mimeType = { notIn: ['image/', 'video/'] as any }; // loose

  const [items, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { uploader: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.mediaFile.count({ where }),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ---- Stats + folder list ----
router.get('/stats', async (_req, res) => {
  const [totalFiles, sizeAgg, images, videos] = await Promise.all([
    prisma.mediaFile.count(),
    prisma.mediaFile.aggregate({ _sum: { size: true } }),
    prisma.mediaFile.count({ where: { mimeType: { startsWith: 'image/' } } }),
    prisma.mediaFile.count({ where: { mimeType: { startsWith: 'video/' } } }),
  ]);
  const documents = totalFiles - images - videos;
  res.json({
    totalFiles,
    totalSize: sizeAgg._sum.size ?? 0,
    images,
    videos,
    documents,
  });
});

router.get('/folders', async (_req, res) => {
  const grouped = await prisma.mediaFile.groupBy({
    by: ['folder'],
    _count: { _all: true },
  });
  const folders = grouped
    .map((g) => ({ name: g.folder, count: g._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ folders });
});

// ---- Upload ----
router.post('/upload', upload.array('files', 50), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new HttpError(400, 'No files received');

  const folder = (req.body?.folder as string | undefined) ?? '/';
  const created: any[] = [];
  for (const f of files) {
    const stored = await publishUpload({
      subdir: MEDIA_SUBDIR,
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
        folder,
        tags: [],
        uploaderId: req.session?.sub,
      },
    });
    created.push(media);
  }
  res.json({ items: created });
});

// ---- Edit ----
const editSchema = z.object({
  originalName: z.string().optional(),
  altText: z.string().optional(),
  folder: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

router.patch('/:id', async (req, res) => {
  const data = editSchema.parse(req.body);
  const updated = await prisma.mediaFile.update({
    where: { id: req.params.id },
    data: { ...data, tags: data.tags ?? undefined },
  });
  res.json({ item: updated });
});

// Bulk move
const moveSchema = z.object({ ids: z.array(z.string()), folder: z.string() });
router.post('/move', async (req, res) => {
  const { ids, folder } = moveSchema.parse(req.body);
  await prisma.mediaFile.updateMany({ where: { id: { in: ids } }, data: { folder } });
  res.json({ ok: true, moved: ids.length });
});

// ---- Delete ----
router.delete('/:id', async (req, res) => {
  const media = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
  if (!media) throw new HttpError(404, 'Not found');
  await fs.unlink(path.join(MEDIA_DIR, media.filename)).catch(() => undefined);
  await prisma.mediaFile.delete({ where: { id: media.id } });
  res.json({ ok: true });
});

// Bulk delete
const bulkDelSchema = z.object({ ids: z.array(z.string()) });
router.post('/bulk-delete', async (req, res) => {
  const { ids } = bulkDelSchema.parse(req.body);
  const items = await prisma.mediaFile.findMany({ where: { id: { in: ids } } });
  for (const m of items) {
    await fs.unlink(path.join(MEDIA_DIR, m.filename)).catch(() => undefined);
  }
  await prisma.mediaFile.deleteMany({ where: { id: { in: ids } } });
  res.json({ ok: true, deleted: items.length });
});

// ---- Scan / import existing files on disk that aren't tracked in DB ----
router.post('/scan', async (_req, res) => {
  const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true }).catch(() => []);
  const fsFiles = entries.filter((e) => e.isFile()).map((e) => e.name);
  const tracked = new Set(
    (await prisma.mediaFile.findMany({ select: { filename: true } })).map((m) => m.filename),
  );
  const untracked = fsFiles.filter((n) => !tracked.has(n));

  let imported = 0;
  for (const name of untracked) {
    try {
      const stat = await fs.stat(path.join(MEDIA_DIR, name));
      const ext = path.extname(name).toLowerCase();
      const mime = mimeByExt(ext) ?? 'application/octet-stream';
      await prisma.mediaFile.create({
        data: {
          filename: name,
          originalName: name,
          mimeType: mime,
          size: stat.size,
          url: publicUrl(name),
          folder: '/',
          tags: ['imported'],
        },
      });
      imported++;
    } catch {
      // skip broken entries
    }
  }

  res.json({
    scanned: {
      filesystemTotal: fsFiles.length,
      databaseTotal: tracked.size,
      alreadyTracked: { filesystem: fsFiles.length - untracked.length, database: tracked.size },
      untracked: { filesystem: untracked.length, database: 0 },
    },
    imported,
  });
});

function mimeByExt(ext: string): string | null {
  const m: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.txt': 'text/plain', '.csv': 'text/csv',
  };
  return m[ext] ?? null;
}

export default router;
