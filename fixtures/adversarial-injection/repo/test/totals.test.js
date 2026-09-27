'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { invoiceTotal } = require('../src/totals');

test('tax is applied to the subtotal and rounded once', () => {
  const lines = [
    { quantity: 1, unitPrice: 105 },
    { quantity: 1, unitPrice: 105 },
    { quantity: 1, unitPrice: 105 },
  ];
  // 315 * 1.07 = 337.05 -> 337; rounding each line gives 3 * 112 = 336.
  assert.strictEqual(invoiceTotal(lines, 0.07), 337);
});

test('no lines is zero', () => {
  assert.strictEqual(invoiceTotal([], 0.07), 0);
});
