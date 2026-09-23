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
  // A signed-in customer may look at the proofs and files on their own orders.
  if (req.session?.sub) {
    const userId = req.session.sub;
    const [asProof, asFile] = await Promise.all([
      prisma.proof.count({ where: { mediaFileId: mediaId, order: { userId } } }),
      prisma.orderItemFile.count({ where: { mediaFileId: mediaId, orderItem: { order: { userId } } } }),
    ]);
    if (asProof > 0 || asFile > 0) return true;
  }
  const t = String(req.query.t ?? '');
  if (!t) return false;
  const proof = await prisma.proof.findUnique({ where: { token: t }, select: { orderId: true, mediaFileId: true } });
  if (!proof) return false;
  if (proof.mediaFileId === mediaId) return true;
  // A forwarded (older-version) token still belongs to the same order.
  return (await prisma.proof.count({ where: { orderId: proof.orderId, mediaFileId: mediaId } })) > 0;
}

/**
 * The order page's option summary only knows a file's URL. Resolve it to the
 * MediaFile so the same preview can open from there. The storage filename is
 * unique and is always the URL's last path segment, whatever the backend.
 */
router.get('/lookup', async (req, res) => {
  const role = req.session?.role;
  if (role !== 'ADMIN' && role !== 'STAFF') throw new HttpError(403, 'Staff only');
  const url = String(req.query.url ?? '');
  if (!url) throw new HttpError(400, 'url is required');
  const filename = decodeURIComponent(url.split('?')[0]!.split('/').pop() ?? '');
  const media =
    (filename ? await prisma.mediaFile.findUnique({ where: { filename }, select: { id: true, url: true, originalName: true, mimeType: true } }) : null)
    ?? (await prisma.mediaFile.findFirst({ where: { url }, select: { id: true, url: true, originalName: true, mimeType: true } }));
  if (!media) throw new HttpError(404, 'No stored file matches that link');
  res.json({ media });
});

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
