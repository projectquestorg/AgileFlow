import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { AppError, ScopeError } from '../src/domain/errors';
import { authorize, recordMembership, touchConnection, type Freshness, type MutationCtx, type QueryCtx, type WirePrincipal } from './lib/core';
import * as work from './domain/work';
import { consumeApproval, READ_OPS as COLLAB_READ, WRITE_OPS as COLLAB_WRITE } from './domain/collab';
import { READ_OPS as CONTROLS_READ, WRITE_OPS as CONTROLS_WRITE } from './domain/controls';
import { READ_OPS as ADMIN_READ, WRITE_OPS as ADMIN_WRITE } from './domain/admin';
import { READ_OPS as PORT_READ, WRITE_OPS as PORT_WRITE } from './domain/portability';

/**
 * Every tool and dashboard operation, by name. Each runs as one internal
 * query (reads) or mutation (writes): a single serializable transaction that
 * re-checks membership freshness, project grant, scope, and connection policy.
 */
export type ReadOp = (ctx: QueryCtx, p: WirePrincipal, args: any, fresh: Freshness) => Promise<unknown>;
export type WriteOp = (ctx: MutationCtx, p: WirePrincipal, args: any, fresh: Freshness) => Promise<unknown>;

const WORK_READ: Record<string, ReadOp> = {
  agileflow_work_list: async (ctx, p, { projectId, cursor, limit, ...filters }, f) => work.list(ctx, await authorize(ctx, p, projectId, 'read', f), filters, cursor, limit),
  agileflow_work_get: async (ctx, p, a, f) => work.get(ctx, await authorize(ctx, p, a.projectId, 'read', f), a.workId, a.contentCursor),
  agileflow_board_get: async (ctx, p, { projectId, columnCursors, limit, ...filters }, f) => work.board(ctx, await authorize(ctx, p, projectId, 'read', f), filters, columnCursors, limit),
  agileflow_document_get: async (ctx, p, a, f) => work.documentGet(ctx, await authorize(ctx, p, a.projectId, 'read', f), a.document, a.contentCursor),
};

const WORK_WRITE: Record<string, WriteOp> = {
  agileflow_work_create: async (ctx, p, a, f) => work.create(ctx, await authorize(ctx, p, a.projectId, 'work:write', f), a),
  agileflow_work_update: async (ctx, p, a, f) => work.update(ctx, await authorize(ctx, p, a.projectId, 'work:write', f), a),
  agileflow_work_transition: async (ctx, p, a, f) => work.transition(ctx, await authorize(ctx, p, a.projectId, 'work:write', f), a, consumeApproval),
  agileflow_document_update: async (ctx, p, a, f) => work.documentUpdate(ctx, await authorize(ctx, p, a.projectId, 'work:write', f), a),
};

export const READ_OPS: Record<string, ReadOp> = { ...WORK_READ, ...COLLAB_READ, ...CONTROLS_READ, ...ADMIN_READ, ...PORT_READ };
export const WRITE_OPS: Record<string, WriteOp> = { ...WORK_WRITE, ...COLLAB_WRITE, ...CONTROLS_WRITE, ...ADMIN_WRITE, ...PORT_WRITE };

/** Domain outcome as plain data: Convex function errors lose class identity across the boundary. */
type Outcome = { ok: true; value: unknown } | { ok: false; error: Record<string, unknown>; status: number } | { ok: false; scope: string[] };

async function settle(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ScopeError) return { ok: false, scope: err.required };
    if (err instanceof AppError) return { ok: false, error: err.toJSON(), status: err.status };
    throw err;
  }
}

const principal = v.any();

export const read = internalQuery({
  args: { principal, name: v.string(), args: v.any(), freshSince: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const op = READ_OPS[a.name];
    if (!op) return { ok: false, error: new AppError('NOT_FOUND', `Unknown operation ${a.name}.`).toJSON(), status: 404 } satisfies Outcome;
    return settle(() => op(ctx, a.principal as WirePrincipal, a.args ?? {}, { freshSince: a.freshSince }));
  },
});

export const write = internalMutation({
  args: { principal, name: v.string(), args: v.any(), freshSince: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const op = WRITE_OPS[a.name];
    if (!op) return { ok: false, error: new AppError('NOT_FOUND', `Unknown operation ${a.name}.`).toJSON(), status: 404 } satisfies Outcome;
    // A failed domain check must roll back everything: rethrow, then convert at the boundary.
    try {
      const value = await op(ctx, a.principal as WirePrincipal, a.args ?? {}, { freshSince: a.freshSince });
      // A refusal whose bookkeeping must commit (e.g. a receipt after revocation marks the operation 'unknown').
      if (value && typeof value === 'object' && '__committedFailure' in value) return (value as { __committedFailure: Outcome }).__committedFailure;
      return { ok: true, value } satisfies Outcome;
    } catch (err) {
      // ConvexError aborts the transaction and carries the structured outcome to the HTTP action.
      if (err instanceof ScopeError) throw new ConvexError({ ok: false, scope: err.required });
      if (err instanceof AppError) throw new ConvexError({ ok: false, error: err.toJSON(), status: err.status });
      throw err;
    }
  },
});

/** Mirror freshness for reads (seconds since last upstream verification), without side effects. */
export const membershipAge = internalQuery({
  args: { orgId: v.string(), userId: v.string() },
  handler: async (ctx, a) => {
    const ws = await ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', a.orgId)).unique();
    if (!ws) return null;
    const m = await ctx.db.query('memberships').withIndex('by_ws_user', (q) => q.eq('workspaceId', ws.publicId).eq('userId', a.userId)).unique();
    return m && m.status === 'active' ? Date.now() - m.verifiedAt : null;
  },
});

/** Record an upstream membership answer and register/touch the token connection. */
export const prepare = internalMutation({
  args: { principal, membership: v.optional(v.any()), refreshMembership: v.boolean() },
  handler: async (ctx, a) => {
    const p = a.principal as WirePrincipal;
    if (a.refreshMembership && p.orgId) await recordMembership(ctx, p.orgId, p.userId, a.membership ?? null);
    if (p.kind === 'token') await touchConnection(ctx, p);
    return null;
  },
});

const CLIENT_TTL_MS = 10 * 60_000;
const UNKNOWN_CLIENT_TTL_MS = 60_000;

/** Cached identity-provider status of an OAuth client (null = not cached or expired). */
export const clientStatus = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, a) => {
    const row = await ctx.db.query('oauthClients').withIndex('by_client', (q) => q.eq('clientId', a.clientId)).unique();
    if (!row) return null;
    const ttl = row.status === 'unknown' ? UNKNOWN_CLIENT_TTL_MS : CLIENT_TTL_MS;
    return Date.now() - row.checkedAt <= ttl ? row.status : null;
  },
});

export const recordClient = internalMutation({
  args: { clientId: v.string(), status: v.union(v.literal('dynamic'), v.literal('first_party'), v.literal('unknown')) },
  handler: async (ctx, a) => {
    const row = await ctx.db.query('oauthClients').withIndex('by_client', (q) => q.eq('clientId', a.clientId)).unique();
    if (row) await ctx.db.patch(row._id, { status: a.status, checkedAt: Date.now() });
    else await ctx.db.insert('oauthClients', { clientId: a.clientId, status: a.status, checkedAt: Date.now() });
  },
});
