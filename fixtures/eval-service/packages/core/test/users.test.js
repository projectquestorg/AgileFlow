import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUser, findUserByEmail } from '../src/users.js';
import { UserNotFoundError } from '../src/errors.js';

test('getUser returns a known user', () => {
  assert.equal(getUser('u1').email, 'ada@example.com');
});

test('getUser throws UserNotFoundError for unknown ids', () => {
  assert.throws(() => getUser('nope'), UserNotFoundError);
});

test('findUserByEmail is case-insensitive', () => {
  assert.equal(findUserByEmail('ADA@example.com').id, 'u1');
  assert.equal(findUserByEmail('missing@example.com'), undefined);
});
