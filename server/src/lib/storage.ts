/**
 * Where uploaded files live.
 *
 * Uploads land on local disk first (multer streams them there), then this
 * module moves them to R2 when it's configured. The MediaFile row records the
 * result in its `url`:
 *
 *   absolute URL  → object in R2 (served from the CDN edge / signed link)
 *   /uploads/...  → still on local disk, served by express.static
 *
 * Both forms are readable at the same time, so enabling R2 doesn't strand
 * anything already uploaded and there's no flag day.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isR2Enabled, r2Delete, r2Put, r2PublicUrl, r2SignedUrl } from './r2.js';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');

export interface StoredFile {
  /** What to persist as MediaFile.url. */
  url: string;
  storage: 'r2' | 'local';
}

/** True when a media url points at R2 rather than local disk. */
export function isRemoteUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

/**
 * Object key for a file. Mirrors the on-disk layout (`customer/…`,
 * `proofs/…`, `media/…`) so the bucket stays browsable.
 */
export function objectKey(subdir: string, filename: string): string {
  return `${subdir.replace(/^\/|\/$/g, '')}/${filename}`;
}

/**
 * Publish a file that multer wrote to disk. On success with R2 the local copy
 * is removed. Any failure falls back to the local URL, so an R2 outage
 * degrades to today's behavior instead of losing the upload.
 */
export async function publishUpload(args: {
  subdir: string;          // e.g. 'customer' | 'proofs' | 'media' | 'partner'
  filename: string;        // storage key (already randomized by multer)
  localPath: string;
  contentType?: string;
  originalName?: string;
  /** Append this to the local URL when staying on disk (e.g. '?t=token'). */
  localQuery?: string;
}): Promise<StoredFile> {
  const localUrl = `/uploads/${args.subdir.replace(/^\/|\/$/g, '')}/${args.filename}${args.localQuery ?? ''}`;

  if (!(await isR2Enabled())) return { url: localUrl, storage: 'local' };

  const key = objectKey(args.subdir, args.filename);
  try {
    const body = await fs.readFile(args.localPath);
    await r2Put({
      key,
      body,
      contentType: args.contentType,
      downloadName: args.originalName,
    });
    const url = (await r2PublicUrl(key)) ?? (await r2SignedUrl(key, 7 * 24 * 3600));
    if (!url) return { url: localUrl, storage: 'local' };
    // Uploaded — reclaim the disk copy.
    await fs.unlink(args.localPath).catch(() => undefined);
    return { url, storage: 'r2' };
  } catch (e: any) {
    console.error('[storage] R2 upload failed, keeping local copy:', e?.message ?? e);
    return { url: localUrl, storage: 'local' };
  }
}

/** Remove a stored file, wherever it lives. Best-effort. */
export async function deleteStored(media: { url?: string | null; filename?: string | null; folder?: string | null }) {
  const url = media.url ?? '';
  if (isRemoteUrl(url)) {
    // Recover the key from the URL path (public domain or endpoint/bucket form).
    const key = new URL(url).pathname.replace(/^\/+/, '').split('?')[0]!;
    await r2Delete(decodeURIComponent(key));
    return;
  }
  if (url.startsWith('/uploads/')) {
    const rel = url.replace(/^\/uploads\//, '').split('?')[0]!;
    await fs.unlink(path.join(UPLOADS_DIR, rel)).catch(() => undefined);
  }
}

/**
 * Refresh a signed URL that's close to expiring. Public-domain buckets and
 * local files are returned unchanged.
 */
export async function refreshUrl(url: string): Promise<string> {
  if (!isRemoteUrl(url) || !url.includes('X-Amz-Signature')) return url;
  const key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '').split('?')[0]!);
  return (await r2SignedUrl(key, 7 * 24 * 3600)) ?? url;
}

export { UPLOADS_DIR };
