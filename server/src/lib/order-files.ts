/**
 * Links customer uploads to the order items they belong to.
 *
 * The storefront's upload control stores the uploaded file's URL in the
 * item's options (newline-joined when there are several). At order time we
 * turn those into OrderItemFile rows so staff get a real file list — name,
 * size, open, save — instead of a bare filename in the option summary.
 *
 * This used to be a regex for the local-disk path `/uploads/customer/…`.
 * When uploads moved to R2 the URLs became `/api/files/<key>` (or an
 * absolute CDN URL), the regex matched nothing, and every order since had
 * no file rows. Matching is now by URL shape, whatever the storage backend,
 * and `backfillOrderUploads` repairs orders created in that window.
 */
import { prisma } from '../db.js';

/** Anything that looks like a stored upload: absolute URL, or one of our served paths. */
const URL_RE = /(?:https?:\/\/[^\s"'<>]+|\/(?:uploads|api\/files)\/[^\s"'<>]+)/g;

/** Every upload URL referenced anywhere in an item's options, deduplicated. */
export function uploadUrlsInOptions(options: unknown): string[] {
  if (!options || typeof options !== 'object') return [];
  const urls = new Set<string>();
  for (const v of Object.values(options as Record<string, unknown>)) {
    if (typeof v !== 'string') continue;
    // The upload control stores one URL per line.
    for (const line of v.split('\n')) {
      const t = line.trim();
      if (/^(https?:\/\/|\/(uploads|api\/files)\/)/.test(t)) urls.add(t);
      else for (const m of t.matchAll(URL_RE)) urls.add(m[0]);
    }
  }
  return [...urls];
}

/**
 * Create the missing OrderItemFile rows for one item. Returns how many were
 * added. Uploads whose MediaFile row is gone (purged, or never recorded) are
 * skipped — the option summary still shows the raw link for those.
 */
export async function linkItemUploads(orderItemId: string): Promise<number> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, options: true, files: { select: { mediaFileId: true } } },
  });
  if (!item) return 0;
  const urls = uploadUrlsInOptions(item.options);
  if (urls.length === 0) return 0;

  const have = new Set(item.files.map((f) => f.mediaFileId));
  const medias = await prisma.mediaFile.findMany({ where: { url: { in: urls } }, select: { id: true } });
  const missing = medias.filter((m) => !have.has(m.id));
  if (missing.length === 0) return 0;

  await prisma.orderItemFile.createMany({
    data: missing.map((m) => ({ orderItemId: item.id, mediaFileId: m.id, purpose: 'artwork' })),
  });
  return missing.length;
}

/** Repair every item on an order. Cheap enough to run each time staff open it. */
export async function backfillOrderUploads(orderId: string): Promise<number> {
  const items = await prisma.orderItem.findMany({ where: { orderId }, select: { id: true } });
  let n = 0;
  for (const it of items) n += await linkItemUploads(it.id);
  return n;
}
