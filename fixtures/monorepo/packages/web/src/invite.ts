import type { User } from '@demo/contracts/src/user';

/** Address an invitation email is sent to. */
export const inviteAddress = (u: User) => u.email.trim().toLowerCase();
