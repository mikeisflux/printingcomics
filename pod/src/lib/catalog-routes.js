export const CATALOG_PATH = '/philbo-catalog';

export const getCatalogProductPath = (title) => {
  const productId = String(title?.productSlug || title?.philboId || title?.titleId || title?.id || '').trim();
  return productId ? `${CATALOG_PATH}/p/${encodeURIComponent(productId.toLowerCase())}` : CATALOG_PATH;
};

export const getCatalogProductIdFromPath = (pathname = '') => {
  const match = String(pathname).match(/^\/philbo-catalog\/p\/([^/?#]+)\/?$/i);
  if (!match) return '';
  try { return decodeURIComponent(match[1]).trim(); }
  catch (error) { return match[1].trim(); }
};

export const findCatalogTitleByProductId = (titles = [], productId = '') => {
  const normalizedId = String(productId).trim().toLowerCase();
  if (!normalizedId) return null;
  const compactId = normalizedId.replace(/[^a-z0-9]+/g, '');
  return titles.find(title => [title.productSlug, title.philboId, title.titleId, title.id].some(value => {
    const normalizedValue = String(value || '').trim().toLowerCase();
    return normalizedValue === normalizedId || normalizedValue.replace(/[^a-z0-9]+/g, '') === compactId;
  })) || null;
};
