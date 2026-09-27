import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { withLock } from './lock.js';

export const SNAPSHOT = 'data/billing-snapshot.json';

/** Copy the billing provider's subscription list into a local snapshot. */
export async function syncBilling(fetchSubscriptions) {
  const subscriptions = await fetchSubscriptions();
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify({ syncedAt: new Date().toISOString(), subscriptions }));
  return subscriptions.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await withLock('sync-billing', () => syncBilling(async () => []));
}
