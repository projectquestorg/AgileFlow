import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/rate-limit.js';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test('allows 60 requests per minute by default', () => {
  const c = clock();
  const limiter = createRateLimiter({ now: c.now });
  for (let i = 0; i < 60; i++) assert.equal(limiter.check('ip-1').allowed, true, `request ${i + 1}`);
  const blocked = limiter.check('ip-1');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 60_000);
});

test('resets after the window passes', () => {
  const c = clock();
  const limiter = createRateLimiter({ limit: 2, now: c.now });
  limiter.check('k');
  limiter.check('k');
  assert.equal(limiter.check('k').allowed, false);
  c.advance(60_000);
  assert.equal(limiter.check('k').allowed, true);
});

test('tracks keys independently', () => {
  const limiter = createRateLimiter({ limit: 1 });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
});
