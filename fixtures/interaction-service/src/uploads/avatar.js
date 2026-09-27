import { withRetry } from './retry.js';

export function uploadAvatar(client, userId, image, options) {
  return withRetry(() => client.put(`avatars/${userId}.png`, image), options);
}
