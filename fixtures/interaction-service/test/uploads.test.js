import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadAvatar } from '../src/uploads/avatar.js';
import { uploadAttachment } from '../src/uploads/attachment.js';

const flaky = (failures) => {
  let calls = 0;
  return {
    get calls() { return calls; },
    async put() {
      calls++;
      if (calls <= failures) throw Object.assign(new Error('bad gateway'), { status: 502 });
    },
  };
};

test('avatar uploads retry transient failures', async () => {
  const client = flaky(2);
  await uploadAvatar(client, 'u1', 'img', { wait: async () => {} });
  assert.equal(client.calls, 3);
});

test('attachment uploads succeed', async () => {
  const client = flaky(0);
  await uploadAttachment(client, 'm1', 'a.txt', 'x');
  assert.equal(client.calls, 1);
});
