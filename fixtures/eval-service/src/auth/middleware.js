import { getUser } from '../../packages/core/src/users.js';
import { UserNotFoundError } from '../../packages/core/src/errors.js';
import { resolveSession } from './sessions.js';

/**
 * Wrap a handler so it only runs for signed-in users.
 *
 * Reads `Authorization: Bearer <token>`, looks the token up in the session
 * store, loads the user, and passes it to the handler as `req.user`.
 * Anyone without a valid, unexpired session gets 401. Deactivated users get 403.
 * Pass `{ role: 'admin' }` to also require a role.
 */
export function requireAuth(handler, { role } = {}) {
  return (req) => {
    const header = req.headers?.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return { status: 401, body: { error: 'missing bearer token' } };

    const userId = resolveSession(token);
    if (!userId) return { status: 401, body: { error: 'session expired or invalid' } };

    let user;
    try {
      user = getUser(userId);
    } catch (err) {
      if (err instanceof UserNotFoundError) return { status: 401, body: { error: 'unknown user' } };
      throw err;
    }
    if (!user.active) return { status: 403, body: { error: 'account disabled' } };
    if (role && user.role !== role) return { status: 403, body: { error: `requires ${role} role` } };

    return handler({ ...req, user });
  };
}
