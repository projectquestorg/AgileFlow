import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal, formatCents } from '../src/cart.js';

test('totals line items', () => {
  assert.equal(cartTotal([{ priceCents: 250, quantity: 2 }]), 500);
});

test('applies a percentage discount', () => {
  assert.equal(cartTotal([{ priceCents: 1000, quantity: 1 }], 10), 900);
});

test('formats cents', () => {
  assert.equal(formatCents(1234), '$12.34');
});
