import assert from 'node:assert/strict';
import { csvRowsToOrderLines, parseCsvRows } from '../src/lib/csv-order.js';

assert.deepEqual(parseCsvRows('Code,Title,Qty\r\nP-1,"Book, One",3'), [
  ['Code', 'Title', 'Qty'],
  ['P-1', 'Book, One', '3']
]);

assert.deepEqual(csvRowsToOrderLines('\uFEFFProduct Code,Title,Qty\r\n000123,"Book, One",4\r\nEAN-2,Book Two,2'), [
  { line: 2, rawCode: '000123', qty: '4' },
  { line: 3, rawCode: 'EAN-2', qty: '2' }
]);

assert.deepEqual(csvRowsToOrderLines('000123,4\nEAN-2,2'), [
  { line: 1, rawCode: '000123', qty: '4' },
  { line: 2, rawCode: 'EAN-2', qty: '2' }
]);

assert.deepEqual(csvRowsToOrderLines('Quantity,PHILBO ID,Title\r\n,PHI-1,Book One\r\n3,PHI-2,Book Two'), [
  { line: 3, rawCode: 'PHI-2', qty: '3' }
], 'blank quantities in an order-ready catalog are ignored');

console.log('CSV order parsing tests passed.');
