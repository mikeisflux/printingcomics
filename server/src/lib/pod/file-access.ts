/**
 * Who may open a Distribution file. Shared by the /uploads/pod gate (local
 * disk) and /api/files/pod/… (R2 or local) so the two can never disagree.
 *
 * Cover images, marketing images, logos and a catalog's cover image are
 * public: the catalog shows them. Print PDFs and extras belong to their
 * publisher, a resale certificate to its shop, a catalog PDF to active
 * publishers and shops; staff see everything.
 */
import { prisma } from '../../db.js';

export interface PodFileMedia { tags: string[]; partnerId: string | null; mimeType: string }
export interface PodFileSession { sub: string; role: string }

export type PodFileVerdict = 'public' | 'allow' | 'sign-in' | 'deny';

/** True when the stored type can be shown inline; anything else is a download. */
export function podFileInline(mimeType: string): boolean {
  return /^(application\/pdf|image\/(jpeg|png|webp|gif))$/i.test(mimeType);
}

export async function podFileAccess(media: PodFileMedia, session: PodFileSession | null | undefined): Promise<PodFileVerdict> {
  if (session?.role === 'ADMIN' || session?.role === 'STAFF') return 'allow';
  const kind = media.tags.find((t) => t.startsWith('kind:'))?.slice(5) ?? '';
  const isCatalog = media.tags.includes('pod-catalog');
  const isAsset = media.tags.includes('pod-asset');
  const isCert = media.tags.includes('pod-cert');
  const isPublic = (!isCatalog && !isCert && (kind === 'cover_image' || kind === 'marketing' || (isAsset && kind === 'logo'))) || (isCatalog && kind === 'cover');
  if (isPublic) return 'public';
  if (!session) return 'sign-in';
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { partnerId: true, retailerId: true, partner: { select: { status: true } }, retailer: { select: { status: true } } },
  });
  if (!user) return 'sign-in';
  if (isCatalog) {
    if (user.partner?.status === 'ACTIVE' || user.retailer?.status === 'ACTIVE') return 'allow';
    return 'deny';
  }
  if (isCert && user.retailerId && media.tags.includes(`retailer:${user.retailerId}`)) return 'allow';
  if (media.partnerId && user.partnerId === media.partnerId) return 'allow';
  return 'deny';
}

/**
 * A request path under /uploads must be exactly what it says: decoded and
 * normalized it must read the same. `..`, `.`, `//` and percent-encoded
 * segments are refused rather than resolved, so a prefix gate on
 * `/uploads/pod` cannot be walked around via `/uploads/customer/..%2Fpod/`.
 */
export function uploadPathIsPlain(rawPath: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(rawPath); } catch { return false; }
  if (decoded !== rawPath) return false;
  if (!rawPath.startsWith('/')) return false;
  if (rawPath.includes('\\') || rawPath.includes('\0')) return false;
  const segments = rawPath.split('/').slice(1);
  return segments.every((s) => s !== '' && s !== '.' && s !== '..') ;
}
