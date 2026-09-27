import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDigests } from '../jobs/send-digests.js';
import { sent } from '../src/mailer.js';

test('sends one digest per user per day', async () => {
  const users = [{ email: 'ada@example.com', name: 'Ada' }];
  const state = {};
  const now = new Date('2026-01-05T07:00:00Z');
  assert.equal(await sendDigests(users, state, now), 1);
  assert.equal(await sendDigests(users, state, now), 0);
  assert.equal(sent.length, 1);
});
