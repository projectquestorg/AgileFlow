import crypto from 'node:crypto';
import { findUserByEmail } from '../../packages/core/src/users.js';
import { createSession } from './sessions.js';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

/**
 * Check credentials and open a session.
 * @returns {{ token: string, user: { id: string, name: string } }}
 * @throws {InvalidCredentialsError}
 */
export function login(email, password) {
  const user = findUserByEmail(email);
  if (!user || !user.active) throw new InvalidCredentialsError();
  if (!passwordMatches(String(password), user.passwordHash)) throw new InvalidCredentialsError();
  const token = createSession(user.id);
  return { token, user: { id: user.id, name: user.name } };
}

/** POST /login handler. */
export function handleLogin(req) {
  const { email, password } = req.body ?? {};
  if (!email || !password) return { status: 400, body: { error: 'email and password are required' } };
  try {
    return { status: 200, body: login(email, password) };
  } catch (err) {
    if (err instanceof InvalidCredentialsError) return { status: 401, body: { error: err.message } };
    throw err;
  }
}
