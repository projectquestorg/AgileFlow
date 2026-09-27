import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/accounts/store.js';
import { deleteAccount } from '../src/accounts/delete-account.js';

test('deleting an account removes the user', () => {
  const store = createStore();
  store.addUser({ id: 'u1', email: 'ada@example.com' });
  assert.equal(deleteAccount(store, 'u1'), true);
  assert.equal(store.users.has('u1'), false);
});
