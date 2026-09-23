import crypto from 'node:crypto';
import { UserNotFoundError } from './errors.js';

/** Hash a password as `salt:hash` (hex, scrypt). */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

const users = new Map();

export function addUser({ id, email, name, password, role = 'member' }) {
  const user = { id, email: email.toLowerCase(), name, role, active: true, passwordHash: hashPassword(password) };
  users.set(id, user);
  return user;
}

addUser({ id: 'u1', email: 'ada@example.com', name: 'Ada', password: 'correct-horse', role: 'admin' });
addUser({ id: 'u2', email: 'grace@example.com', name: 'Grace', password: 'battery-staple' });

/**
 * Look up a user by id.
 * @throws {UserNotFoundError} when no user has that id.
 */
export function getUser(id) {
  const user = users.get(id);
  if (!user) throw new UserNotFoundError(id);
  return user;
}

/** Look up a user by email. Returns undefined when not found. */
export function findUserByEmail(email) {
  const needle = String(email).toLowerCase();
  for (const user of users.values()) if (user.email === needle) return user;
  return undefined;
}
