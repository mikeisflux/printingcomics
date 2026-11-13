/**
 * What each audience sees of a listing. Staff get everything; publishers get
 * their own rows without our costs; the public and retailers get the
 * catalog fields and MSRP (retailers also get their wholesale price, added
 * by the caller).
 */
import { prisma } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LISTING_STATUS_LABELS, type ListingStatusKey } from './catalog.js';

export const listingInclude = {
  partner: { select: { id: true, name: true, slug: true, contactEmail: true, commissionBps: true, logo: { select: { url: true } } } },
  barcode: { select: { id: true, code: true, symbology: true, block: true } },
  cycle: { select: { id: true, name: true, slug: true, status: true, catalogDate: true, focDate: true, inStoreDate: true } },
  coverImage: { select: { id: true, url: true, thumbnailUrl: true, originalName: true } },
  files: { orderBy: [{ kind: 'asc' }, { version: 'desc' }], include: { media: { select: { id: true, url: true, originalName: true, size: true, mimeType: true, createdAt: true } } } },
  product: { select: { id: true, slug: true, active: true } },
} satisfies Prisma.ListingInclude;

export type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

export const FILE_KINDS = ['cover', 'interior', 'cover_image', 'marketing', 'extra'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABELS: Record<FileKind, string> = { cover: 'Cover PDF', interior: 'Interior PDF', cover_image: 'Cover image', marketing: 'Marketing image', extra: 'Extra file' };

/** Newest file per kind, plus how many older versions sit behind it. */
export function currentFiles(files: ListingRow['files']) {
  const out: Record<string, (ListingRow['files'][number] & { olderVersions: number }) | null> = { cover: null, interior: null, cover_image: null, marketing: null, extra: null };
  for (const f of files) {
    if (!out[f.kind]) out[f.kind] = { ...f, olderVersions: 0 };
    else out[f.kind]!.olderVersions++;
  }
  return out;
}

function fileView(f: ListingRow['files'][number] & { olderVersions: number }) {
  return {
    id: f.id, kind: f.kind, kindLabel: FILE_KIND_LABELS[f.kind as FileKind] ?? f.kind, version: f.version, olderVersions: f.olderVersions,
    reviewStatus: f.reviewStatus, note: f.note, preflight: f.preflight, createdAt: f.createdAt,
    media: { id: f.media.id, url: f.media.url, name: f.media.originalName, size: f.media.size, mimeType: f.media.mimeType },
  };
}

export function presentListing(l: ListingRow, audience: 'staff' | 'partner') {
  const files = currentFiles(l.files);
  const missing = (['cover', 'interior'] as const).filter((k) => l.fulfillment === 'PRINTED_BY_US' && !files[k]);
  // The same shape for public, partner and staff; `allFiles` only for staff.
  const out = {
    id: l.id, catalogKey: l.catalogKey, title: l.title, seriesName: l.seriesName, seriesCode: l.seriesCode, issueNumber: l.issueNumber,
    coverDescription: l.coverDescription, variantNumber: l.variantNumber, upc: l.upc, format: l.format, seriesType: l.seriesType, frequency: l.frequency,
    language: l.language, ageRating: l.ageRating, pageCount: l.pageCount, trimWidthIn: l.trimWidthIn, trimHeightIn: l.trimHeightIn, interiorColor: l.interiorColor,
    weightOz: l.weightOz, msrpCents: l.msrpCents, description: l.description, synopsis: l.synopsis, writer: l.writer, artist: l.artist, coverArtist: l.coverArtist,
    genres: l.genres, bisac: l.bisac, incentiveRatio: l.incentiveRatio, incentiveQualifierKey: l.incentiveQualifierKey, reorderable: l.reorderable,
    fulfillment: l.fulfillment, status: l.status, statusLabel: LISTING_STATUS_LABELS[l.status as ListingStatusKey], reviewNote: l.reviewNote,
    submittedAt: l.submittedAt, approvedAt: l.approvedAt, publishedAt: l.publishedAt, createdAt: l.createdAt, updatedAt: l.updatedAt,
    partner: { id: l.partner.id, name: l.partner.name, slug: l.partner.slug, logoUrl: l.partner.logo?.url ?? null },
    cycle: l.cycle,
    coverImage: l.coverImage,
    product: l.product ? { id: l.product.id, slug: l.product.slug, active: l.product.active } : null,
    files: { cover: files.cover && fileView(files.cover), interior: files.interior && fileView(files.interior), cover_image: files.cover_image && fileView(files.cover_image), marketing: files.marketing && fileView(files.marketing), extra: files.extra && fileView(files.extra) },
    barcode: l.barcode ? { id: l.barcode.id, code: l.barcode.code, symbology: l.barcode.symbology, block: l.barcode.block } : null,
    inventory: { units: l.inventoryUnits, damaged: l.inventoryDamaged, location: l.inventoryLocation },
    missingFiles: missing,
    allFiles: audience === 'staff' ? l.files.map((f) => fileView({ ...f, olderVersions: 0 })) : undefined,
  };
  if (audience === 'staff') return { ...out, partnerContactEmail: l.partner.contactEmail, partnerCommissionBps: l.partner.commissionBps };
  return out;
}

/** The catalog fields the public sees: no cost, no commission, no files. */
export function presentPublicListing(l: ListingRow | ReturnType<typeof presentListing>) {
  const cover = 'coverImage' in l ? l.coverImage : null;
  return {
    id: l.id, catalogKey: l.catalogKey, title: l.title, seriesName: l.seriesName, issueNumber: l.issueNumber, coverDescription: l.coverDescription,
    format: l.format, pageCount: l.pageCount, trimWidthIn: l.trimWidthIn, trimHeightIn: l.trimHeightIn, interiorColor: l.interiorColor,
    msrpCents: l.msrpCents, description: l.description, synopsis: l.synopsis, writer: l.writer, artist: l.artist, coverArtist: l.coverArtist,
    ageRating: l.ageRating, genres: l.genres, incentiveRatio: l.incentiveRatio, fulfillment: l.fulfillment,
    partner: { id: l.partner.id, name: l.partner.name, slug: l.partner.slug, logoUrl: 'logoUrl' in l.partner ? (l.partner as { logoUrl: string | null }).logoUrl : (l.partner as { logo?: { url: string } | null }).logo?.url ?? null },
    upc: l.upc, coverImageUrl: cover?.url ?? null, productSlug: l.product?.slug ?? null,
  };
}

export async function loadListing(id: string) {
  return prisma.listing.findUnique({ where: { id }, include: listingInclude });
}
