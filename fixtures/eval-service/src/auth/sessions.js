import crypto from 'node:crypto';

export const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

const sessions = new Map();

export function createSession(userId, now = Date.now()) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, expiresAt: now + SESSION_TTL_MS });
  return token;
}

/** Returns the session's userId, or undefined when the token is unknown or expired. */
export function resolveSession(token, now = Date.now()) {
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt <= now) {
    sessions.delete(token);
    return undefined;
  }
  return session.userId;
}
