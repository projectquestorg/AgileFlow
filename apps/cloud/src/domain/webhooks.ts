import crypto from 'node:crypto';
import type { Core } from './core';
import { one } from '../db/sql';

/** Svix (Clerk webhooks) signature check over the raw body, with a 5-minute timestamp window. */
export function verifySvix(secret: string, headers: { id?: string | null; timestamp?: string | null; signature?: string | null }, rawBody: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

export interface WebhookResult {
  status: 'processed' | 'duplicate' | 'ignored';
}

/**
 * Durably record, deduplicate, and apply a verified Clerk event. Events only
 * update identity mirrors; they never grant project roles. Membership events
 * carry Clerk's updated_at so an older event cannot resurrect a removed member.
 */
export async function handleClerkEvent(core: Core, eventId: string, rawBody: string): Promise<WebhookResult> {
  const event = JSON.parse(rawBody) as { type: string; data: Record<string, any> };
  const payloadDigest = crypto.createHash('sha256').update(rawBody).digest('hex');
  return core.db.tx(async (q) => {
    const inserted = await one(q, `INSERT INTO webhook_receipts (provider, event_id, payload_digest, event_type, status) VALUES ('clerk', $1, $2, $3, 'accepted') ON CONFLICT DO NOTHING RETURNING event_id`, [eventId, payloadDigest, event.type]);
    if (!inserted) return { status: 'duplicate' as const };
    const d = event.data ?? {};
    let handled = true;
    switch (event.type) {
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
      case 'organizationMembership.deleted': {
        const orgId = d.organization?.id;
        const userId = d.public_user_data?.user_id;
        const ts = Number(d.updated_at ?? d.created_at ?? 0);
        if (!orgId || !userId) break;
        const ws = await one<{ id: string }>(q, 'SELECT id FROM workspaces WHERE clerk_org_id = $1', [orgId]);
        if (!ws) break; // Created lazily on first use.
        await q.query(`INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
        const removed = event.type === 'organizationMembership.deleted';
        const role = String(d.role ?? '').replace(/^org:/, '') === 'admin' ? 'admin' : 'member';
        await q.query(
          `INSERT INTO memberships (workspace_id, user_id, role, status, source_ts, verified_at) VALUES ($1, $2, $3, $4, $5, to_timestamp(0))
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, source_ts = EXCLUDED.source_ts, verified_at = to_timestamp(0)
             WHERE memberships.source_ts <= EXCLUDED.source_ts`,
          [ws.id, userId, role, removed ? 'removed' : 'active', ts],
        );
        // verified_at = epoch forces the next read to re-verify upstream instead of trusting the event.
        break;
      }
      case 'organization.updated':
        if (d.id && d.name) await q.query('UPDATE workspaces SET name = $2, updated_at = now() WHERE clerk_org_id = $1', [d.id, String(d.name).slice(0, 200)]);
        break;
      case 'organization.deleted':
        if (d.id) {
          await q.query(`UPDATE workspaces SET status = 'deleted', updated_at = now() WHERE clerk_org_id = $1`, [d.id]);
          await q.query(`UPDATE projects SET deletion_requested_at = COALESCE(deletion_requested_at, now()) WHERE workspace_id = (SELECT id FROM workspaces WHERE clerk_org_id = $1)`, [d.id]);
        }
        break;
      case 'user.updated':
        if (d.id) {
          const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || null;
          await q.query('UPDATE users SET display_name = COALESCE($2, display_name), updated_at = now() WHERE id = $1', [d.id, name]);
        }
        break;
      case 'user.deleted':
        if (d.id) {
          // Tombstone: team-owned work stays; identity data is minimized; access ends.
          await q.query(`UPDATE users SET status = 'deleted', display_name = 'Deleted user', email = NULL, updated_at = now() WHERE id = $1`, [d.id]);
          await q.query(`UPDATE memberships SET status = 'removed' WHERE user_id = $1`, [d.id]);
          await q.query(`UPDATE project_grants SET status = 'revoked' WHERE user_id = $1`, [d.id]);
          await q.query(`UPDATE access_connections SET disabled_at = COALESCE(disabled_at, now()) WHERE user_id = $1`, [d.id]);
          await q.query(`UPDATE companions SET revoked_at = COALESCE(revoked_at, now()), credential_hash = NULL WHERE owner_user_id = $1`, [d.id]);
        }
        break;
      default:
        handled = false;
    }
    await q.query(`UPDATE webhook_receipts SET status = 'processed' WHERE provider = 'clerk' AND event_id = $1`, [eventId]);
    return { status: handled ? ('processed' as const) : ('ignored' as const) };
  });
}
