import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { withLock } from './lock.js';
import { SNAPSHOT } from './sync-billing.js';

/**
 * Expire trials that ended without a paid subscription. Reads the snapshot
 * written by sync-billing; a stale snapshot would expire customers who have
 * just paid.
 */
export function expiredTrials(trials, now = new Date()) {
  const { subscriptions } = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const paying = new Set(subscriptions.map((s) => s.accountId));
  return trials.filter((t) => new Date(t.endsAt) < now && !paying.has(t.accountId));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await withLock('expire-trials', () => expiredTrials([]));
}
