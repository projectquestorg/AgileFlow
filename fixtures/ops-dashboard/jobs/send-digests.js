import { pathToFileURL } from 'node:url';
import { sendMail } from '../src/mailer.js';
import { withLock } from './lock.js';

/**
 * Email each user a daily digest. `lastDigestAt` is only recorded after the
 * whole batch, so a crash part-way through re-sends to everyone on the next run.
 */
export async function sendDigests(users, state, now = new Date()) {
  const due = users.filter((u) => !state.lastDigestAt || new Date(state.lastDigestAt) < startOfDay(now));
  for (const user of due) {
    await sendMail({ to: user.email, subject: 'Your daily digest', body: `Hi ${user.name}` });
  }
  state.lastDigestAt = now.toISOString();
  return due.length;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await withLock('send-digests', () => sendDigests([], {}));
}
