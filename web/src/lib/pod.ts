/**
 * Types and small helpers shared by every Print On Demand screen: the
 * public pages, the publisher and retailer portals, and /admin/pod.
 */
export const money = (cents: number | null | undefined) => {
  const c = Number(cents ?? 0);
  return `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
export const dateShort = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const dateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const daysUntil = (d: string | Date | null | undefined) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000) : null);
export const inputDate = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export type ListingStatus = 'DRAFT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED' | 'SCHEDULED' | 'LIVE' | 'REJECTED' | 'ARCHIVED';
export const LISTING_STATUS: Record<ListingStatus, { label: string; tone: string; hint: string }> = {
  DRAFT: { label: 'Draft', tone: 'slate', hint: 'Still being written; not yet sent for review.' },
  SUBMITTED: { label: 'Pending review', tone: 'amber', hint: 'Waiting for staff to approve it.' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'rose', hint: 'Sent back to the publisher with notes.' },
  APPROVED: { label: 'Approved', tone: 'teal', hint: 'Goes live when its catalog publishes.' },
  SCHEDULED: { label: 'Scheduled', tone: 'teal', hint: 'Approved and waiting for its catalog date.' },
  LIVE: { label: 'Live', tone: 'green', hint: 'In the catalog and open for orders.' },
  REJECTED: { label: 'Rejected', tone: 'red', hint: 'Not accepted for the catalog.' },
  ARCHIVED: { label: 'Archived', tone: 'slate', hint: 'Off the catalog; history kept.' },
};

export const CYCLE_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'slate' }, OPEN: { label: 'Open to publishers', tone: 'violet' }, PUBLISHED: { label: 'Ordering open', tone: 'green' }, FOC_LOCKED: { label: 'FOC locked', tone: 'amber' }, CLOSED: { label: 'Closed', tone: 'slate' },
};
export const RETAILER_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Applied', tone: 'amber' }, ACTIVE: { label: 'Active', tone: 'green' }, SUSPENDED: { label: 'Suspended', tone: 'rose' }, ARCHIVED: { label: 'Archived', tone: 'slate' },
};
export const PRODUCTION_STATUS: Record<string, { label: string; tone: string }> = {
  PLANNED: { label: 'Planned', tone: 'slate' }, FILES_NEEDED: { label: 'Files needed', tone: 'rose' }, PREFLIGHT: { label: 'In preflight', tone: 'amber' }, APPROVED: { label: 'Approved for press', tone: 'teal' }, IN_PRODUCTION: { label: 'On press', tone: 'violet' }, DONE: { label: 'Done', tone: 'green' }, CANCELLED: { label: 'Cancelled', tone: 'slate' },
};
export const PURCHASE_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'slate' }, SENT: { label: 'Sent', tone: 'amber' }, ACKNOWLEDGED: { label: 'Acknowledged', tone: 'teal' }, FULFILLED: { label: 'Shipped', tone: 'green' }, CANCELLED: { label: 'Cancelled', tone: 'slate' },
};
export const STATEMENT_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'slate' }, ISSUED: { label: 'Issued', tone: 'amber' }, PAID: { label: 'Paid', tone: 'green' }, VOID: { label: 'Void', tone: 'rose' },
};
export const FORMAT_LABELS: Record<string, string> = { comic: 'Comic book', graphic_novel: 'Graphic novel', magazine: 'Magazine', zine: 'Zine', other: 'Other' };
export const FULFILLMENT_LABELS: Record<string, string> = { PRINTED_BY_US: 'Printed & shipped by Printing Comics', PARTNER_SHIPS: 'Shipped by the publisher' };

export interface ListingFileView {
  id: string; kind: string; kindLabel: string; version: number; olderVersions: number; reviewStatus: string; note: string | null;
  preflight: PreflightResult | null; createdAt: string; media: { id: string; url: string; name: string; size: number; mimeType: string };
}
export interface PreflightCheck { id: string; label: string; status: 'pass' | 'fail' | 'warning' | 'manual'; detail: string; reason?: string }
export interface PreflightResult { status: 'ready' | 'changes_required' | 'unchecked'; headline: string; pageCount: number | null; failed: number; warnings: number; checks: PreflightCheck[]; ranAt: string }

export interface Listing {
  id: string; catalogKey: string; title: string; seriesName: string | null; seriesCode: string | null; issueNumber: string | null; coverDescription: string | null;
  variantNumber: string | null; upc: string | null; format: string; seriesType: string | null; frequency: string | null; language: string; ageRating: string | null;
  pageCount: number | null; trimWidthIn: number | null; trimHeightIn: number | null; interiorColor: string | null; weightOz: number | null; msrpCents: number;
  description: string | null; synopsis: string | null; writer: string | null; artist: string | null; coverArtist: string | null; genres: string[]; bisac: string[];
  incentiveRatio: string | null; incentiveQualifierKey: string | null; reorderable: boolean; fulfillment: 'PRINTED_BY_US' | 'PARTNER_SHIPS'; status: ListingStatus; statusLabel: string;
  reviewNote: string | null; submittedAt: string | null; approvedAt: string | null; publishedAt: string | null; createdAt: string; updatedAt: string;
  partner: { id: string; name: string; slug: string }; cycle: { id: string; name: string; slug: string; status: string; catalogDate: string; focDate: string; inStoreDate: string } | null;
  coverImage: { id: string; url: string; thumbnailUrl: string | null; originalName: string } | null; product: { id: string; slug: string; active: boolean } | null;
  files: { cover: ListingFileView | null; interior: ListingFileView | null; cover_image: ListingFileView | null; extra: ListingFileView | null };
  missingFiles: string[]; allFiles?: ListingFileView[]; partnerContactEmail?: string | null; partnerCommissionBps?: number | null; unitsSold?: number;
}

export interface Cycle {
  id: string; slug: string; name: string; catalogDate: string; focDate: string; inStoreDate: string; status: string; statusLabel: string; publisherOpen: boolean; retailerOpen: boolean;
  focOverrideOpen: boolean; publishedAt: string | null; lockedAt: string | null; closedAt: string | null; version: number; notes: string | null; orderingOpen: boolean;
  listingCount: number; orderCount: number; orderedUnits: number; wholesaleCents: number; productionOrderCount: number; purchaseOrderCount: number; listingsByStatus: Record<string, number>;
}

export interface PodEvent { id: string; subjectType: string; subjectId: string; kind: string; message: string | null; actorName: string | null; createdAt: string }

export interface PublicSettings {
  enabled: boolean; programName: string; intro: string; tiers: { name: string; minCents: number; discountBps: number }[]; retailerMinOrderCents: number;
  commissionBpsPrintedByUs: number; commissionBpsPartnerShips: number;
  retailerShipping: { mode: 'billed_later' | 'flat'; flatCents: number }; retailerTerms: string; publisherTerms: string; pageCountStep: number; minPageCount: number; maxPageCount: number;
}

export const TRIM_PRESETS = [
  { label: 'Standard comic 6.625 × 10.25"', w: 6.625, h: 10.25 },
  { label: 'Letter 8.5 × 11"', w: 8.5, h: 11 },
  { label: 'Magazine 8 × 10.5"', w: 8, h: 10.5 },
  { label: 'A5 5.8 × 8.3"', w: 5.8, h: 8.3 },
];

export const AGE_RATINGS = ['All ages', 'Teen', 'Teen+', 'Mature'];
export const GENRES = ['Action', 'Adventure', 'Comedy', 'Crime', 'Drama', 'Fantasy', 'Historical', 'Horror', 'LGBTQ+', 'Literary', 'Manga', 'Mystery', 'Non-fiction', 'Romance', 'Sci-fi', 'Slice of life', 'Superhero', 'Thriller', 'Western', 'Young readers'];

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/** A stable hue per name so publishers and shops keep their colour everywhere. */
export function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
