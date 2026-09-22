/**
 * Rasterised previews of stored files — see lib/pdf-preview.ts for why the
 * site never embeds a PDF in the browser directly.
 *
 *   GET /api/previews/:mediaId/info            what can be shown, page count
 *   GET /api/previews/:mediaId/page/:n         PNG of page n
 *
 * Who may look: staff/admin sessions, or anyone holding the review token of
 * a proof that points at this file (the customer on /proof/<token>), passed
 * as ?t=. That mirrors who can already download the file itself.
 */
import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { previewInfo, previewPage } from '../lib/pdf-preview.js';

const router = Router();

async function allowed(req: Request, mediaId: string): Promise<boolean> {
  const role = req.session?.role;
  if (role === 'ADMIN' || role === 'STAFF') return true;
  const t = String(req.query.t ?? '');
  if (!t) return false;
  const proof = await prisma.proof.findUnique({ where: { token: t }, select: { orderId: true, mediaFileId: true } });
  if (!proof) return false;
  if (proof.mediaFileId === mediaId) return true;
  // A forwarded (older-version) token still belongs to the same order.
  return (await prisma.proof.count({ where: { orderId: proof.orderId, mediaFileId: mediaId } })) > 0;
}

router.get('/:mediaId/info', async (req, res) => {
  const id = String(req.params.mediaId);
  if (!(await allowed(req, id))) throw new HttpError(403, 'Not allowed to view this file');
  res.json(await previewInfo(id));
});

router.get('/:mediaId/page/:n', async (req, res) => {
  const id = String(req.params.mediaId);
  if (!(await allowed(req, id))) throw new HttpError(403, 'Not allowed to view this file');
  const file = await previewPage(id, Number(req.params.n));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type('png');
  res.sendFile(file);
});

export default router;
