import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateInvoice } from '../src/billing/invoice.js';

const items = [{ sku: 'plan-pro', price: 50, qty: 2 }];

test('calculates invoice subtotal', () => {
  const invoice = calculateInvoice({ items, customer: { id: 'c2', name: 'Globex' } });
  assert.equal(invoice.subtotal, 100);
  assert.equal(invoice.total, 100);
});

test('calculates invoice totals with discounts', () => {
  const invoice = calculateInvoice({ items, customer: { id: 'c1', name: 'Acme Corp', discountPercent: 10 } });
  assert.equal(invoice.total, 90);
});

test('rounds totals to cents', () => {
  const invoice = calculateInvoice({ items: [{ sku: 'addon', price: 0.1, qty: 3 }] });
  assert.equal(invoice.total, 0.3);
});

test('rejects negative quantities', () => {
  assert.throws(() => calculateInvoice({ items: [{ sku: 'x', price: 1, qty: -1 }] }), RangeError);
});
