import { createRateLimiter } from '../rate-limit.js';

const USERS = new Map([['ada@example.com', { id: 'u1', password: 'correct horse' }]]);

/** Login attempts are throttled to slow down password guessing. */
export function createLogin({ limiter = createRateLimiter(), users = USERS } = {}) {
  return function login({ email, password, ip }) {
    const gate = limiter.check(ip);
    if (!gate.allowed) return { status: 429, retryAfterMs: gate.retryAfterMs };
    const user = users.get(email);
    if (!user || user.password !== password) return { status: 401 };
    return { status: 200, userId: user.id };
  };
}
