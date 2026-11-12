import assert from 'node:assert/strict';
import {
  findCatalogTitleByProductId,
  getCatalogProductIdFromPath,
  getCatalogProductPath
} from '../src/lib/catalog-routes.js';

const productionTitle = { id: 'd2222222-2222-4222-8222-222222222222', philboId: 'PHI121626-201' };
const legacyPreviewTitle = { titleId: 'title_preview_1', philboId: '' };

assert.equal(getCatalogProductPath(productionTitle), '/philbo-catalog/p/phi121626-201');
assert.equal(getCatalogProductPath(legacyPreviewTitle), '/philbo-catalog/p/title_preview_1');
assert.equal(getCatalogProductIdFromPath('/philbo-catalog/p/phi121626-201'), 'phi121626-201');
assert.equal(findCatalogTitleByProductId([productionTitle], 'PHI121626-201'), productionTitle);
assert.equal(findCatalogTitleByProductId([legacyPreviewTitle], 'title_preview_1'), legacyPreviewTitle);

console.log('Catalog route tests passed.');
