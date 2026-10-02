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

/** Every upload referenced in an item's options, with the option key it sits under. */
export function uploadsInOptions(options: unknown): { url: string; key: string }[] {
  if (!options || typeof options !== 'object') return [];
  const seen = new Set<string>();
  const out: { url: string; key: string }[] = [];
  for (const [key, v] of Object.entries(options as Record<string, unknown>)) {
    if (typeof v !== 'string') continue;
    // The upload control stores one URL per line.
    for (const line of v.split('\n')) {
      const t = line.trim();
      const found: string[] = [];
      if (/^(https?:\/\/|\/(uploads|api\/files)\/)/.test(t)) found.push(t);
      else for (const m of t.matchAll(URL_RE)) found.push(m[0]);
      for (const url of found) {
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ url, key });
      }
    }
  }
  return out;
}

/** Every upload URL referenced anywhere in an item's options, deduplicated. */
export function uploadUrlsInOptions(options: unknown): string[] {
  return uploadsInOptions(options).map((u) => u.url);
}

/**
 * What a file uploaded under an option is: the Cover PDF, the Interior PDF,
 * or (older orders, prints) just artwork.
 */
export function purposeForOptionKey(key: string): 'cover' | 'interior' | 'artwork' {
  if (key === 'cover_pdf') return 'cover';
  if (key === 'interior_pdf') return 'interior';
  return 'artwork';
}

/** The page count the upload endpoint recorded on the media (`pages:N`), as the file row's note. */
export function pagesNoteFromTags(tags: string[] | null | undefined): string | null {
  const t = (tags ?? []).find((x) => /^pages:\d+$/.test(x));
  return t ? `${t.slice(6)} pages` : null;
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
  const uploads = uploadsInOptions(item.options);
  if (uploads.length === 0) return 0;

  const have = new Set(item.files.map((f) => f.mediaFileId));
  const medias = await prisma.mediaFile.findMany({ where: { url: { in: uploads.map((u) => u.url) } }, select: { id: true, url: true, tags: true } });
  const missing = medias.filter((m) => !have.has(m.id));
  if (missing.length === 0) return 0;

  const keyByUrl = new Map(uploads.map((u) => [u.url, u.key]));
  await prisma.orderItemFile.createMany({
    data: missing.map((m) => ({ orderItemId: item.id, mediaFileId: m.id, purpose: purposeForOptionKey(keyByUrl.get(m.url) ?? ''), notes: pagesNoteFromTags(m.tags) })),
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
