import { getUser } from '../../packages/core/src/users.js';

/**
 * POST /admin/users/:id/deactivate (admin only).
 * An unknown id throws UserNotFoundError, which the router turns into a 404.
 */
export function handleDeactivate(req, id) {
  const user = getUser(id);
  user.active = false;
  return { status: 200, body: { id: user.id, active: user.active } };
}
