import type { User } from '@demo/contracts/src/user';

export function getUser(id: string): User {
  return { id, email: `${id}@example.com` };
}
