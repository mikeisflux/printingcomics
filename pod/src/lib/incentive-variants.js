import { getRetailerTitleKey, normalizeQuantityMap } from './retailer-order.js';

const text = value => String(value || '').trim();
const normalized = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const parseIncentiveRatio = title => {
  const source = [title?.incentiveRatio, title?.coverDescription, title?.title]
    .map(text)
    .find(value => /\b\d+\s*[:/]\s*\d+\b/.test(value));
  const match = source?.match(/\b(\d+)\s*[:/]\s*(\d+)\b/);
  if (!match) return null;
  const awardQuantity = Number.parseInt(match[1], 10);
  const qualifyingQuantity = Number.parseInt(match[2], 10);
  if (awardQuantity < 1 || qualifyingQuantity < 1) return null;
  return { awardQuantity, qualifyingQuantity, label: `${awardQuantity}:${qualifyingQuantity}` };
};

export const isIncentiveTitle = title => Boolean(parseIncentiveRatio(title));

const explicitQualifier = (title, titles) => {
  const explicitKey = text(title?.incentiveQualifyingTitleId || title?.qualifyingTitleId);
  if (explicitKey) return titles.filter(candidate => getRetailerTitleKey(candidate) === explicitKey);
  const philboId = text(title?.incentiveRules).match(/\bPHI(?:L)?[A-Z0-9-]+\b/i)?.[0];
  return philboId
    ? titles.filter(candidate => normalized(candidate.philboId) === normalized(philboId))
    : [];
};

const comparableSeries = title => normalized(title?.seriesName || title?.title)
  .replace(/\b(?:cover|cvr|variant|virgin|incentive|incv|retailer|special|regular|main|homage)\b.*$/g, '')
  .trim();

export const getQualifyingTitles = (incentiveTitle, titles = []) => {
  const explicit = explicitQualifier(incentiveTitle, titles);
  if (explicit.length) return explicit;

  const publisher = normalized(incentiveTitle?.publisherId || incentiveTitle?.publisherName);
  const cycle = text(incentiveTitle?.cycleId || incentiveTitle?.catalogCycleId);
  const issue = normalized(incentiveTitle?.issueNumber);
  const series = comparableSeries(incentiveTitle);
  return titles.filter(candidate => {
    if (getRetailerTitleKey(candidate) === getRetailerTitleKey(incentiveTitle) || isIncentiveTitle(candidate)) return false;
    if (publisher && normalized(candidate.publisherId || candidate.publisherName) !== publisher) return false;
    if (cycle && text(candidate.cycleId || candidate.catalogCycleId) !== cycle) return false;
    if (issue && normalized(candidate.issueNumber) !== issue) return false;
    return !series || comparableSeries(candidate) === series;
  });
};

export const getIncentiveEligibility = (title, titles = [], quantities = {}) => {
  const ratio = parseIncentiveRatio(title);
  if (!ratio) return null;
  const normalizedQuantities = normalizeQuantityMap(quantities);
  const qualifyingTitles = getQualifyingTitles(title, titles);
  const qualifyingQuantity = qualifyingTitles.reduce(
    (sum, candidate) => sum + (normalizedQuantities[getRetailerTitleKey(candidate)] || 0),
    0
  );
  const maximumQuantity = Math.floor(qualifyingQuantity / ratio.qualifyingQuantity) * ratio.awardQuantity;
  const nextUnlockAt = (Math.floor(qualifyingQuantity / ratio.qualifyingQuantity) + 1) * ratio.qualifyingQuantity;
  return {
    ...ratio,
    qualifyingTitles,
    qualifyingQuantity,
    maximumQuantity,
    copiesUntilNextUnlock: Math.max(0, nextUnlockAt - qualifyingQuantity)
  };
};

export const capIncentiveQuantities = (quantities, titles = []) => {
  const next = normalizeQuantityMap(quantities);
  titles.filter(isIncentiveTitle).forEach(title => {
    const key = getRetailerTitleKey(title);
    if (!key || !next[key]) return;
    const eligibility = getIncentiveEligibility(title, titles, next);
    if (!eligibility?.maximumQuantity) delete next[key];
    else next[key] = Math.min(next[key], eligibility.maximumQuantity);
  });
  return next;
};

export const validateIncentiveQuantities = (quantities, titles = []) => {
  const normalizedQuantities = normalizeQuantityMap(quantities);
  return titles.filter(isIncentiveTitle).flatMap(title => {
    const ordered = normalizedQuantities[getRetailerTitleKey(title)] || 0;
    if (!ordered) return [];
    const eligibility = getIncentiveEligibility(title, titles, normalizedQuantities);
    return ordered <= eligibility.maximumQuantity ? [] : [{ title, ordered, ...eligibility }];
  });
};
