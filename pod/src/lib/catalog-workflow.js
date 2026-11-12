export const TITLE_STATUS = Object.freeze({
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Submitted for Review',
  NEEDS_REVISION: 'Changes Requested',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived'
});

const normalizedStatus = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export const isTitlePendingReview = status => ['submitted_for_review', 'pending_review', 'submitted'].includes(normalizedStatus(status));

export const isTitleNeedsRevision = status => ['changes_requested', 'needs_revision'].includes(normalizedStatus(status));

export const isTitlePublished = status => ['approved', 'scheduled', 'live', 'live_override'].includes(normalizedStatus(status));

export const selectCurrentRetailerCatalogCycle = (cycles = [], titles = [], now = new Date()) => {
  const currentTime = now instanceof Date ? now : new Date(now);
  const visibleCycleIds = new Set((titles || []).map(title => title?.cycleId).filter(Boolean));
  const publishedCycles = (cycles || []).filter(cycle => cycle && (
    cycle.retailerOpen === true ||
    Boolean(cycle.catalogPublishedAt) ||
    String(cycle.status || '').toLowerCase() === 'open for retailer ordering'
  ));

  const descendingCatalogDate = (a, b) => String(b.catalogDate || '').localeCompare(String(a.catalogDate || ''));
  const inOrderingWindow = cycle => {
    if (!cycle.catalogDate || !cycle.focDate || Number.isNaN(currentTime.getTime())) return false;
    const catalogDate = new Date(`${cycle.catalogDate}T00:00:00`);
    if (cycle.focOverrideOpen === true) return catalogDate <= currentTime;
    const focDate = new Date(`${cycle.focDate}T23:59:59`);
    return catalogDate <= currentTime && currentTime <= focDate;
  };

  const activeCycles = publishedCycles.filter(inOrderingWindow).sort(descendingCatalogDate);
  const activeWithTitles = activeCycles.find(cycle => visibleCycleIds.has(cycle.cycleId));
  if (activeWithTitles) return activeWithTitles;
  if (activeCycles.length) return activeCycles[0];

  const publishedWithTitles = publishedCycles.filter(cycle => visibleCycleIds.has(cycle.cycleId)).sort(descendingCatalogDate);
  return publishedWithTitles[0] || publishedCycles.sort(descendingCatalogDate)[0] || null;
};

export const getTitleStatusLabel = status => {
  if (isTitlePendingReview(status)) return 'Pending Review';
  if (isTitleNeedsRevision(status)) return 'Needs Revision';
  if (normalizedStatus(status) === 'live_override') return 'Live';
  return status || 'Draft';
};

const endOfDay = value => {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getTitleCatalogAvailability = (title, cycle, now = new Date()) => {
  const published = isTitlePublished(title?.status);
  const overrideOpen = title?.focOverrideOpen === true || cycle?.focOverrideOpen === true;
  const focDeadline = endOfDay(cycle?.focDate || title?.focDate);
  const focPassed = !overrideOpen && Boolean(focDeadline && focDeadline < now);
  const cycleLocked = !overrideOpen && ['FOC Locked', 'Released', 'Archived', 'foc_locked', 'released', 'archived'].includes(cycle?.status);
  const preorderOpen = (overrideOpen || cycle?.retailerOpen === true) && !cycleLocked && !focPassed && (!title?.focLocked || overrideOpen);
  const reorderOpen = ['Released', 'released'].includes(cycle?.status) && title?.availableForReorder === 'Yes';

  return {
    published,
    publicVisible: published,
    orderable: published && (preorderOpen || reorderOpen),
    focPassed,
    focLocked: !published || (!overrideOpen && (Boolean(title?.focLocked) || cycleLocked || focPassed || (!preorderOpen && !reorderOpen))),
    orderingStatus: !published
      ? 'Not Published'
      : preorderOpen
        ? 'Open for Ordering'
        : reorderOpen
          ? 'Reorder Available'
          : focPassed || cycleLocked
            ? 'FOC Locked'
            : 'Ordering Not Open'
  };
};
