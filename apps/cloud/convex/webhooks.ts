import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { sha256Hex } from './lib/util';

/**
 * Durably record, deduplicate, and apply a verified Clerk event (port of
 * handleClerkEvent). Events only update identity mirrors; they never grant
 * project roles. Membership events carry Clerk's updated_at so an older event
 * cannot resurrect a removed member; verifiedAt = 0 forces the next request to
 * re-verify upstream instead of trusting the event.
 */
export const applyClerkEvent = internalMutation({
  args: { eventId: v.string(), raw: v.string() },
  handler: async (ctx, a): Promise<{ status: 'processed' | 'duplicate' | 'ignored' }> => {
    const event = JSON.parse(a.raw) as { type: string; data: Record<string, any> };
    const prior = await ctx.db.query('webhookReceipts').withIndex('by_event', (q) => q.eq('provider', 'clerk').eq('eventId', a.eventId)).unique();
    if (prior) return { status: 'duplicate' };
    const now = Date.now();
    const receiptId = await ctx.db.insert('webhookReceipts', { provider: 'clerk', eventId: a.eventId, payloadDigest: sha256Hex(a.raw), eventType: String(event.type), status: 'accepted', receivedAt: now });
    const d = event.data ?? {};
    const wsByOrg = (orgId: string) => ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', orgId)).unique();
    let handled = true;
    switch (event.type) {
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
      case 'organizationMembership.deleted': {
        const orgId = d.organization?.id;
        const userId = d.public_user_data?.user_id;
        const ts = Number(d.updated_at ?? d.created_at ?? 0);
        if (!orgId || !userId) break;
        const ws = await wsByOrg(orgId);
        if (!ws) break; // Created lazily on first use.
        const u = await ctx.db.query('users').withIndex('by_user', (q) => q.eq('clerkUserId', userId)).unique();
        if (!u) await ctx.db.insert('users', { clerkUserId: userId, status: 'active', updatedAt: now });
        const status = event.type === 'organizationMembership.deleted' ? ('removed' as const) : ('active' as const);
        const role = String(d.role ?? '').replace(/^org:/, '') === 'admin' ? ('admin' as const) : ('member' as const);
        const m = await ctx.db.query('memberships').withIndex('by_ws_user', (q) => q.eq('workspaceId', ws.publicId).eq('userId', userId)).unique();
        if (!m) await ctx.db.insert('memberships', { workspaceId: ws.publicId, userId, role, status, sourceTs: ts, verifiedAt: 0 });
        else if (m.sourceTs <= ts) await ctx.db.patch(m._id, { role, status, sourceTs: ts, verifiedAt: 0 });
        break;
      }
      case 'organization.updated':
        if (d.id && d.name) {
          const ws = await wsByOrg(d.id);
          if (ws) await ctx.db.patch(ws._id, { name: String(d.name).slice(0, 200), updatedAt: now });
        }
        break;
      case 'organization.deleted':
        if (d.id) {
          const ws = await wsByOrg(d.id);
          if (ws) {
            await ctx.db.patch(ws._id, { status: 'deleted', updatedAt: now });
            for (const p of await ctx.db.query('projects').withIndex('by_ws', (q) => q.eq('workspaceId', ws.publicId)).collect()) {
              if (!p.deletionRequestedAt) await ctx.db.patch(p._id, { deletionRequestedAt: now });
            }
          }
        }
        break;
      case 'user.updated':
        if (d.id) {
          const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || null;
          const u = await ctx.db.query('users').withIndex('by_user', (q) => q.eq('clerkUserId', d.id)).unique();
          if (u) await ctx.db.patch(u._id, { displayName: name ?? u.displayName, updatedAt: now });
        }
        break;
      case 'user.deleted':
        if (d.id) {
          const uid = String(d.id);
          // Tombstone: team-owned work stays; identity data is minimized; access ends.
          const u = await ctx.db.query('users').withIndex('by_user', (q) => q.eq('clerkUserId', uid)).unique();
          if (u) await ctx.db.patch(u._id, { status: 'deleted', displayName: 'Deleted user', email: undefined, updatedAt: now });
          for (const m of await ctx.db.query('memberships').withIndex('by_user', (q) => q.eq('userId', uid)).collect()) await ctx.db.patch(m._id, { status: 'removed' });
          for (const g of await ctx.db.query('projectGrants').withIndex('by_user', (q) => q.eq('userId', uid)).collect()) await ctx.db.patch(g._id, { status: 'revoked' });
          for (const c of await ctx.db.query('connections').withIndex('by_user', (q) => q.eq('userId', uid)).collect()) if (!c.disabledAt) await ctx.db.patch(c._id, { disabledAt: now });
          // companions has no owner index: a filtered scan (user deletion is rare).
          for (const c of await ctx.db.query('companions').filter((q) => q.eq(q.field('ownerUserId'), uid)).collect()) {
            await ctx.db.patch(c._id, { revokedAt: c.revokedAt ?? now, credentialHash: undefined });
          }
        }
        break;
      default:
        handled = false;
    }
    await ctx.db.patch(receiptId, { status: 'processed' });
    return { status: handled ? 'processed' : 'ignored' };
  },
});
