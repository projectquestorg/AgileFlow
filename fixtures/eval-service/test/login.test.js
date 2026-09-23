import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';

const login = (body) => handle({ method: 'POST', url: '/login', body, ip: `test-${Math.random()}` });

test('POST /login returns a session token for valid credentials', () => {
  const res = login({ email: 'ada@example.com', password: 'correct-horse' });
  assert.equal(res.status, 200);
  assert.match(res.body.token, /^[0-9a-f]{48}$/);
  assert.deepEqual(res.body.user, { id: 'u1', name: 'Ada' });
});

test('POST /login rejects a wrong password with 401', () => {
  assert.equal(login({ email: 'ada@example.com', password: 'nope' }).status, 401);
});

test('POST /login requires email and password', () => {
  assert.equal(login({ email: 'ada@example.com' }).status, 400);
});

test('GET /me works with the returned token', () => {
  const { token } = login({ email: 'grace@example.com', password: 'battery-staple' }).body;
  const res = handle({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'u2');
});
