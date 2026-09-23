import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportCsv, legacyExport } from '../src/export/index.js';

const invoices = [
  { id: 'inv_1', customerId: 'c1', total: 90, status: 'paid' },
  { id: 'inv_2', customerId: 'c2', total: 20.5, status: 'open' },
];

test('exportCsv writes a header and one row per invoice', () => {
  assert.equal(exportCsv(invoices), 'id,customerId,total,status\ninv_1,c1,90,paid\ninv_2,c2,20.5,open');
});

test('legacyExport writes pipe-delimited rows in cents', () => {
  assert.equal(legacyExport(invoices), 'inv_1|c1|9000|PAID\ninv_2|c2|2050|OPEN');
});
