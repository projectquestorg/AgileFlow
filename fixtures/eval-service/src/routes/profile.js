import { getUser } from '../../packages/core/src/users.js';
import { UserNotFoundError } from '../../packages/core/src/errors.js';

/** GET /users/:id - public profile. */
export function handleProfile(req, id) {
  try {
    const user = getUser(id);
    return { status: 200, body: { id: user.id, name: user.name } };
  } catch (err) {
    if (err instanceof UserNotFoundError) return { status: 404, body: { error: 'not found' } };
    throw err;
  }
}
