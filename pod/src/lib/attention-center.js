const normalize = value => String(value || '').trim().toLowerCase();

const TITLE_REVIEW_STATUSES = new Set([
  'submitted',
  'submitted for review',
  'submitted_for_review',
  'pending review',
  'pending_review'
]);

const ACTIVE_ORDER_STATUSES = new Set(['pending', 'new', 'processing']);
const ACTIVE_POD_ORDER_STATUSES = new Set([
  'submitted for review',
  'quote requested',
  'submitted for production review',
  'on hold — print files required'
]);
const FILE_REVIEW_STATUSES = new Set([
  'files not submitted',
  'files received',
  'under review',
  'changes required',
  'replacement requested',
  'on hold'
]);

const needsProductionFileAttention = order => [
  order?.overallPreflightStatus,
  order?.coverFileStatus,
  order?.interiorFileStatus
].some(status => FILE_REVIEW_STATUSES.has(normalize(status)));

const needsCycleAttention = cycle => Boolean(
  cycle?.attentionRequired ||
  cycle?.overrideRequested ||
  cycle?.reopenRequested ||
  cycle?.needsAdminReview
);

export const buildAdminAttentionQueue = ({
  users = [],
  titles = [],
  returns = [],
  orders = [],
  podOrders = [],
  inventory = [],
  productionOrders = [],
  cycles = [],
  unmatchedTitles = []
} = {}) => {
  const pendingUsers = users.filter(account => !account.approved && normalize(account.accountStatus) !== 'archived');
  const pendingPublishers = pendingUsers.filter(account => normalize(account.role) === 'publisher' && !account.isPodClient);
  const pendingRetailers = pendingUsers.filter(account => normalize(account.role) === 'retailer');
  const pendingPodAccounts = pendingUsers.filter(account => account.isPodClient || normalize(account.role) === 'pod');
  const pendingTitles = titles.filter(title => TITLE_REVIEW_STATUSES.has(normalize(title.status)));
  const pendingReturns = returns.filter(item => normalize(item.status) === 'pending');
  const pendingSalesOrders = orders.filter(order => ACTIVE_ORDER_STATUSES.has(normalize(order.status)));
  const pendingPodOrders = podOrders.filter(order => ACTIVE_POD_ORDER_STATUSES.has(normalize(order.status)));
  const lowInventoryItems = inventory.filter(item => Number(item.available ?? item.onHand ?? 0) <= Number(item.reorderLevel || 0));
  const fileReviewItems = productionOrders.filter(needsProductionFileAttention);
  const cycleExceptionCount = unmatchedTitles.length + cycles.filter(needsCycleAttention).length;

  return [
    { key: 'publisher-applications', label: 'Publisher Applications', count: pendingPublishers.length, detail: 'awaiting account review', section: 'publishers' },
    { key: 'retailer-applications', label: 'Retailer Applications', count: pendingRetailers.length, detail: 'awaiting account review', section: 'retailers' },
    { key: 'pod-applications', label: 'POD Quote Requests', count: pendingPodAccounts.length, detail: 'awaiting quote review', section: 'pod-accounts', tone: 'pod' },
    { key: 'catalog-reviews', label: 'New Solicitations Requiring Review', count: pendingTitles.length, detail: 'pending publisher submissions', section: 'catalog' },
    { key: 'catalog-cycle-exceptions', label: 'Catalog / FOC Exceptions', count: cycleExceptionCount, detail: 'requiring an Admin decision', section: 'cycles', tone: 'critical' },
    { key: 'production-files', label: 'Production & File Review', count: fileReviewItems.length, detail: 'waiting on files or preflight action', section: 'pod-accounts', tone: 'pod' },
    { key: 'return-requests', label: 'Return Requests', count: pendingReturns.length, detail: 'awaiting approval or rejection', section: 'returns' },
    { key: 'sales-orders', label: 'Retailer Sales Orders', count: pendingSalesOrders.length, detail: 'awaiting processing', section: 'orders' },
    { key: 'pod-orders', label: 'POD Orders & Quotes', count: pendingPodOrders.length, detail: 'awaiting review', section: 'pod-accounts', tone: 'pod' },
    { key: 'inventory-alerts', label: 'Inventory Alerts', count: lowInventoryItems.length, detail: 'at or below reorder level', section: 'inventory', tone: 'critical' }
  ];
};

export const summarizeAttentionBySection = items => (items || []).reduce((summary, item) => {
  const count = Math.max(0, Number(item.count) || 0);
  if (!count) return summary;
  summary.total += count;
  summary.bySection[item.section] = (summary.bySection[item.section] || 0) + count;
  return summary;
}, { total: 0, bySection: {} });
