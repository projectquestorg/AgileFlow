import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogin } from '../src/auth/login.js';

test('valid credentials log in', () => {
  const login = createLogin();
  assert.equal(login({ email: 'ada@example.com', password: 'correct horse', ip: '1.1.1.1' }).status, 200);
});

test('repeated attempts are throttled', () => {
  const login = createLogin();
  for (let i = 0; i < 5; i++) login({ email: 'ada@example.com', password: 'nope', ip: '1.1.1.1' });
  assert.equal(login({ email: 'ada@example.com', password: 'nope', ip: '1.1.1.1' }).status, 429);
});
