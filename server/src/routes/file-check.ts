/**
 * The public File Checker (/resources/file-check): anyone can send a PDF and
 * get the same checklist our uploads are held to — page size for the format
 * they pick, page count, flatness, masks, images, fonts, PDF version.
 *
 * The file is written to a scratch directory on this server only for the
 * length of the check and deleted in `finally`, whether the check passes,
 * fails or throws. Nothing is published, nothing is recorded in the
 * database, and no MediaFile row is created.
 */
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { popplerProblem } from '../lib/pdf-preview.js';
import { checkPrintFile, FLAT_FILE_HELP } from '../lib/file-check.js';
import { isPrintFileKind, PRINT_FILE_LABELS, type PrintFileKind } from '../lib/print-files.js';
import { TRIMS, parseDimensions, type TrimSpec } from '../lib/print-specs.js';

const router = Router();

const CHECK_DIR = path.join(os.tmpdir(), 'printingcomics-file-check');
await fs.mkdir(CHECK_DIR, { recursive: true }).catch(() => undefined);
// Anything left behind by a crash mid-check is swept on start.
for (const f of await fs.readdir(CHECK_DIR).catch(() => [] as string[])) await fs.unlink(path.join(CHECK_DIR, f)).catch(() => undefined);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHECK_DIR),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}.pdf`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const limiter = rateLimit({ windowMs: 10 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });

/** The formats the page offers, in the order shown. */
router.get('/formats', (_req, res) => {
  res.json({
    formats: Object.values(TRIMS).map((t) => ({ key: t.key, label: t.label, trimW: t.trimW, trimH: t.trimH, pageW: t.trimW + 0.25, pageH: t.trimH + 0.25, templateUrl: t.template?.path ?? null })),
    kinds: (['cover', 'interior', 'artwork'] as PrintFileKind[]).map((k) => ({ key: k, label: PRINT_FILE_LABELS[k] })),
  });
});

router.post('/', limiter, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Choose a PDF to check.');
  try {
    const kindRaw = String(req.body?.kind ?? 'interior');
    const kind: PrintFileKind = isPrintFileKind(kindRaw) ? kindRaw : 'interior';
    const formatKey = String(req.body?.format ?? '');
    let spec: TrimSpec | null = TRIMS[formatKey] ?? null;
    if (!spec && formatKey === 'custom') {
      const d = parseDimensions(String(req.body?.customSize ?? ''));
      if (d) spec = { key: 'custom', label: `${d.w} × ${d.h} in`, trimW: d.w, trimH: d.h, template: null };
    }
    const expectedRaw = Number(req.body?.expectedPages);
    const expectedPages = kind === 'interior' && Number.isFinite(expectedRaw) && expectedRaw > 0 ? Math.round(expectedRaw) : null;
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) throw new HttpError(400, `“${file.originalname}” is not a PDF. Export your file as a PDF (a flattened PDF/X-3 export in RGB is ideal) and check that.`);
    const problem = await popplerProblem();
    if (problem) throw new HttpError(503, 'The checker is not available right now. Please try again later.');
    const report = await checkPrintFile(file.path, { kind, spec, expectedPages });
    res.json({ report, file: { name: file.originalname, size: file.size }, kind, format: spec ? { key: spec.key, label: spec.label, templateUrl: spec.template?.path ?? null } : null, help: FLAT_FILE_HELP, deleted: true });
  } finally {
    // The file lives on this server only for the length of the check.
    await fs.unlink(file.path).catch(() => undefined);
  }
});

export default router;
