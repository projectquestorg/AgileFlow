import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentWebhookHandler, sign } from '../src/webhooks/payment.js';

const secret = 'whsec_test';

function fakeStore() {
  const paid = new Map();
  return {
    paid,
    markPaid: (id, paymentId) => (id.startsWith('inv_') ? (paid.set(id, paymentId), true) : false),
    markPaymentFailed: (id) => id.startsWith('inv_'),
  };
}

function request(event, { signature } = {}) {
  const rawBody = JSON.stringify(event);
  return { rawBody, headers: { 'x-payment-signature': signature ?? sign(rawBody, secret) } };
}

const succeeded = { id: 'evt_1', type: 'payment.succeeded', data: { invoiceId: 'inv_1', paymentId: 'pay_1' } };

test('marks the invoice paid on payment.succeeded', () => {
  const store = fakeStore();
  const handle = createPaymentWebhookHandler({ secret, store });
  assert.equal(handle(request(succeeded)).status, 200);
  assert.equal(store.paid.get('inv_1'), 'pay_1');
});

test('rejects a bad signature', () => {
  const store = fakeStore();
  const handle = createPaymentWebhookHandler({ secret, store });
  assert.equal(handle(request(succeeded, { signature: 'deadbeef' })).status, 401);
  assert.equal(store.paid.size, 0);
});

test('acknowledges duplicate events without reprocessing', () => {
  const handle = createPaymentWebhookHandler({ secret, store: fakeStore() });
  handle(request(succeeded));
  assert.deepEqual(handle(request(succeeded)).body, { received: true, duplicate: true });
});
