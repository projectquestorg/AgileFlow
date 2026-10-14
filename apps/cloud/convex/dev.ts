import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

/** Development stand-in for Clerk membership (AGILEFLOW_DEV_AUTH=1 only; the HTTP routes refuse otherwise). */
export const directoryGet = internalQuery({
  args: { orgId: v.string(), userId: v.string() },
  handler: async (ctx, a) => {
    if (process.env.AGILEFLOW_DEV_AUTH !== '1') throw new Error('development directory is disabled');
    const row = await ctx.db.query('devDirectory').withIndex('by_org_user', (q) => q.eq('orgId', a.orgId).eq('userId', a.userId)).unique();
    return row?.info ?? null;
  },
});

export const directorySet = internalMutation({
  args: { orgId: v.string(), userId: v.string(), info: v.union(v.null(), v.any()) },
  handler: async (ctx, a) => {
    if (process.env.AGILEFLOW_DEV_AUTH !== '1') throw new Error('development directory is disabled');
    const row = await ctx.db.query('devDirectory').withIndex('by_org_user', (q) => q.eq('orgId', a.orgId).eq('userId', a.userId)).unique();
    if (row) await ctx.db.patch(row._id, { info: a.info });
    else await ctx.db.insert('devDirectory', { orgId: a.orgId, userId: a.userId, info: a.info });
  },
});
