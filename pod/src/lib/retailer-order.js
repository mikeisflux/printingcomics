export const getRetailerTitleKey = title => String(
  title?.titleId || title?.id || title?.philboId || title?.barcode || ''
).trim();

export const normalizeQuantityMap = value => {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, quantity]) => [String(key), Math.max(0, Number.parseInt(quantity, 10) || 0)])
      .filter(([key, quantity]) => key && quantity > 0)
  );
};

export const addRetailerOrderLines = (current, lines) => {
  const next = normalizeQuantityMap(current);
  lines.forEach(({ title, quantity = 1 }) => {
    const key = getRetailerTitleKey(title);
    const safeQuantity = Math.max(0, Number.parseInt(quantity, 10) || 0);
    if (key && safeQuantity) next[key] = (next[key] || 0) + safeQuantity;
  });
  return next;
};

export const countRetailerOrderItems = quantities => Object.values(
  normalizeQuantityMap(quantities)
).reduce((total, quantity) => total + quantity, 0);

export const getRetailerOrderMsrpSubtotal = (quantities, titles) => {
  const normalizedQuantities = normalizeQuantityMap(quantities);
  const titlesByKey = new Map((titles || []).map(title => [getRetailerTitleKey(title), title]));

  return Object.entries(normalizedQuantities).reduce((subtotal, [titleKey, quantity]) => {
    const title = titlesByKey.get(titleKey);
    return subtotal + (Math.max(0, Number(title?.msrp) || 0) * quantity);
  }, 0);
};

export const getRetailerTierProgress = msrpSubtotal => {
  const subtotal = Math.max(0, Number(msrpSubtotal) || 0);
  if (subtotal >= 251) {
    return {
      activeTier: 'Tier III',
      activeDiscount: 0.50,
      nextTier: null,
      nextDiscount: null,
      nextThreshold: null,
      amountRemaining: 0,
      progressPercent: 100
    };
  }

  const nextThreshold = subtotal >= 101 ? 251 : 101;
  const startingThreshold = subtotal >= 101 ? 101 : 0;
  return {
    activeTier: subtotal >= 101 ? 'Tier II' : 'Tier I',
    activeDiscount: subtotal >= 101 ? 0.45 : 0.40,
    nextTier: subtotal >= 101 ? 'Tier III' : 'Tier II',
    nextDiscount: subtotal >= 101 ? 0.50 : 0.45,
    nextThreshold,
    amountRemaining: Number((nextThreshold - subtotal).toFixed(2)),
    progressPercent: Math.min(100, Math.max(0, ((subtotal - startingThreshold) / (nextThreshold - startingThreshold)) * 100))
  };
};

export const getPublisherFollowKey = title => {
  const publisherId = String(title?.publisherId || '').trim();
  if (publisherId) return publisherId;
  const publisherName = String(title?.publisherName || '').trim().toLowerCase();
  return publisherName ? `publisher-name:${publisherName}` : '';
};
