import { withRetry } from './retry.js';

export function uploadDocument(client, userId, name, body, options) {
  return withRetry(() => client.put(`documents/${userId}/${name}`, body), options);
}
