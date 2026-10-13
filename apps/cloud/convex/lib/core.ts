import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server';
import type { DataModel, Doc } from '../_generated/dataModel';
import { AppError, ScopeError, notFound } from '../../src/domain/errors';
import { CursorCodec, digest, newId } from './util';

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type Ctx = QueryCtx | MutationCtx;

import { SCOPE_FOR, type Capability } from '../../src/auth/scopes';

export { SCOPE_FOR, type Capability };

/** A verified principal as passed from the HTTP layer (internal functions only). */
export type WirePrincipal =
  | { kind: 'token'; issuer: string; userId: string; orgId: string; clientId: string; resource: 'mcp' | 'cli' | 'local-control'; resourceUri: string; scopes: string[]; audienceBound?: boolean }
  | { kind: 'session'; issuer: string; userId: string; sessionId: string; orgId: string | null; orgRole: 'admin' | 'member' | null };

export type Role = 'viewer' | 'editor' | 'admin';

export interface Actor {
  kind: 'user' | 'agent' | 'cli' | 'companion' | 'system';
  userId: string;
  connectionId?: string;
  clientId?: string;
}

export interface WorkspaceAccess {
  principal: WirePrincipal;
  workspace: Doc<'workspaces'>;
  membershipRole: 'admin' | 'member';
  connection: Doc<'connections'> | null;
  actor: Actor;
  principalKey: string;
  now: number;
}

export interface Access extends WorkspaceAccess {
  project: Doc<'projects'>;
  role: Role;
}

export interface Warning {
  code: string;
  message: string;
  objectId?: string;
}

export const READ_CACHE_MS = 60_000;
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 3600_000;
export const LIST_DEFAULT = 50;
export const LIST_MAX = 200;

export const clampLimit = (limit: unknown, max = LIST_MAX) => {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : LIST_DEFAULT;
  return Math.max(1, Math.min(max, n));
};

export function cursors(): CursorCodec {
  const secret = process.env.AGILEFLOW_CURSOR_SECRET;
  if (!secret) throw new Error('AGILEFLOW_CURSOR_SECRET is not set for this deployment.');
  return new CursorCodec(secret);
}

/** Freshness requirement for the membership mirror: the HTTP layer re-verified it with Clerk at/after `freshSince`. */
export interface Freshness {
  freshSince?: number;
}

/**
 * Where token clients' capabilities come from:
 * - `scopes` (default, the spec): OAuth scopes in the access token (`agileflow:*`).
 * - `grants`: Clerk cannot issue custom scopes, so capabilities are granted by a person to each
 *   access connection in the dashboard. New connections are read-only; organization membership
 *   alone never grants a write. The token must still carry `user:org:read` (organization binding).
 */
export type CapabilitySource = 'scopes' | 'grants';
export const capabilitySource = (): CapabilitySource => (process.env.AGILEFLOW_CAPABILITY_SOURCE === 'grants' ? 'grants' : 'scopes');

/** Capabilities a person may grant to a connection, per endpoint. */
export const GRANTABLE: Record<'mcp' | 'cli' | 'local-control', Capability[]> = {
  mcp: ['notes:write', 'work:write', 'runs:write', 'controls:request'],
  cli: ['notes:write', 'work:write', 'runs:write', 'controls:request'],
  'local-control': ['local:apply'],
};
const BASELINE: Record<'mcp' | 'cli' | 'local-control', Capability> = { mcp: 'read', cli: 'read', 'local-control': 'local:observe' };

/** Token-side ceiling. Throws ScopeError (HTTP 403 insufficient_scope) in `scopes` mode. */
export function requireScope(p: WirePrincipal, cap: Capability): void {
  if (p.kind !== 'token') return;
  if (cap === 'admin') throw new AppError('FORBIDDEN', 'Administration is only available in the dashboard.');
  const local = cap === 'local:observe' || cap === 'local:apply';
  if (local !== (p.resource === 'local-control')) {
    throw new AppError('FORBIDDEN', local ? 'Local-control operations need a local-control enrollment.' : 'This credential is limited to local-control operations.');
  }
  if (capabilitySource() === 'grants') {
    // Organization binding still comes from the token; capabilities are checked against the connection.
    if (!p.scopes.includes('user:org:read')) throw new ScopeError(['user:org:read']);
    return;
  }
  const need = SCOPE_FOR[cap];
  if (!p.scopes.includes(need)) throw new ScopeError([need]);
}

/** `grants` mode: the connection must hold the capability (baseline read/observe is implicit). */
export function requireGrant(p: WirePrincipal, connection: Doc<'connections'> | null, cap: Capability): void {
  if (p.kind !== 'token' || capabilitySource() !== 'grants' || cap === 'admin') return;
  if (!connection) throw new AppError('CONNECTION_DISABLED', 'The connection is not registered.');
  if (cap === BASELINE[p.resource]) return;
  if (!(connection.grants ?? []).some((g) => g.capability === cap)) {
    throw new AppError('CAPABILITY_REQUIRED', `This connection has not been granted "${cap}". Ask the user to grant it to this connection in the AgileFlow dashboard (Connections).`, {
      capability: cap,
      connectionId: connection.publicId,
    });
  }
}

/**
 * Endpoint/client binding (enforced in `grants` mode). Each endpoint accepts only its own clients:
 * the first-party CLI client at /cli, the first-party companion at /local-control, and clients
 * registered dynamically at the identity provider (agents) at /mcp. Unknown clients fail closed.
 */
export function clientAllowed(
  resource: 'mcp' | 'cli' | 'local-control',
  clientId: string,
  lookup: { cliClientId?: string; companionClientId?: string; status: 'dynamic' | 'first_party' | 'unknown' },
): boolean {
  if (!clientId) return false;
  if (resource === 'cli') return !!lookup.cliClientId && clientId === lookup.cliClientId;
  if (resource === 'local-control') return !!lookup.companionClientId && clientId === lookup.companionClientId;
  // /mcp: never the first-party CLI/companion clients; only provider-registered dynamic clients.
  if (clientId === lookup.cliClientId || clientId === lookup.companionClientId) return false;
  return lookup.status === 'dynamic';
}

export const isMutationCap = (cap: Capability) => cap !== 'read' && cap !== 'local:observe';

/**
 * Resolve the verified principal's workspace from the membership mirror.
 * The HTTP layer re-verifies membership with Clerk for every mutation (and when
 * the mirror is older than 60 s for reads) before calling in; here the mirror
 * must be fresh enough for the operation, so a stale mirror fails closed.
 */
export async function workspaceAccess(ctx: Ctx, p: WirePrincipal, fresh: Freshness, mutation: boolean, cap: Capability = 'read'): Promise<WorkspaceAccess> {
  const now = Date.now();
  if (!p.orgId) throw new AppError('FORBIDDEN', 'Select or create an organization first.');
  const ws = await ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', p.orgId!)).unique();
  if (!ws || ws.status !== 'active') throw notFound('The workspace');
  const m = await ctx.db.query('memberships').withIndex('by_ws_user', (q) => q.eq('workspaceId', ws.publicId).eq('userId', p.userId)).unique();
  if (!m || m.status !== 'active') throw new AppError('FORBIDDEN', 'You are not a member of this organization.');
  const fresh_ = mutation ? fresh.freshSince !== undefined && m.verifiedAt >= fresh.freshSince : now - m.verifiedAt <= READ_CACHE_MS;
  if (!fresh_) throw new AppError('UPSTREAM_UNAVAILABLE', 'Organization membership could not be re-verified. Retry.', { membershipStale: true });

  let connection: Doc<'connections'> | null = null;
  if (p.kind === 'token') {
    connection = await ctx.db
      .query('connections')
      .withIndex('by_tuple', (q) => q.eq('issuer', p.issuer).eq('userId', p.userId).eq('workspaceId', ws.publicId).eq('clientId', p.clientId).eq('resource', p.resourceUri))
      .unique();
    if (!connection) throw new AppError('UPSTREAM_UNAVAILABLE', 'The connection is not registered yet. Retry.');
    if (connection.disabledAt) throw new AppError('CONNECTION_DISABLED', 'This client connection was disabled in the AgileFlow dashboard.');
    requireGrant(p, connection, cap === 'read' && p.resource === 'local-control' ? 'local:observe' : cap);
  }
  const actor: Actor =
    p.kind === 'session'
      ? { kind: 'user', userId: p.userId }
      : { kind: p.resource === 'mcp' ? 'agent' : p.resource === 'cli' ? 'cli' : 'companion', userId: p.userId, connectionId: connection!.publicId, clientId: p.clientId };
  return { principal: p, workspace: ws, membershipRole: m.role, connection, actor, principalKey: connection ? `conn:${connection.publicId}` : `user:${p.userId}`, now };
}

export async function authorize(ctx: Ctx, p: WirePrincipal, projectId: string, cap: Capability, fresh: Freshness = {}): Promise<Access> {
  requireScope(p, cap);
  const ws = await workspaceAccess(ctx, p, fresh, isMutationCap(cap), cap);
  return projectAccess(ctx, ws, projectId, cap);
}

export async function projectAccess(ctx: Ctx, ws: WorkspaceAccess, projectId: string, cap: Capability): Promise<Access> {
  if (typeof projectId !== 'string' || !projectId) throw new AppError('VALIDATION_ERROR', 'projectId is required.');
  const project = await ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', projectId)).unique();
  if (!project || project.workspaceId !== ws.workspace.publicId || project.deletionRequestedAt) throw notFound('The project');
  let role: Role | null = null;
  if (ws.membershipRole === 'admin') role = ws.principal.kind === 'session' ? 'admin' : 'editor';
  else {
    const g = await ctx.db.query('projectGrants').withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', ws.principal.userId)).unique();
    role = g && g.status === 'active' ? g.role : null;
  }
  if (!role) throw notFound('The project');
  if (ws.connection?.allowedProjects && !ws.connection.allowedProjects.includes(projectId)) throw notFound('The project');
  const a: Access = { ...ws, project, role };
  checkCapability(a, cap);
  return a;
}

function checkCapability(a: Access, cap: Capability): void {
  if (cap === 'read' || cap === 'local:observe') return;
  if (cap === 'admin') {
    if (a.role !== 'admin') throw new AppError('FORBIDDEN', 'Only workspace administrators can do this.');
    return;
  }
  if (a.role === 'viewer') throw new AppError('FORBIDDEN', 'You have read-only access to this project.');
  if (a.project.archivedAt && cap !== 'local:apply') throw new AppError('PROJECT_ARCHIVED', 'The project is archived; it is read-only until restored.');
  if (a.project.importing) throw new AppError('VERSION_CONFLICT', 'An import is being activated in this project. Retry shortly.');
  if (cap === 'work:write' && a.principal.kind === 'token' && a.project.clientWritesPaused) {
    throw new AppError('CLIENT_WRITES_PAUSED', 'Connected-client changes to work are paused for this project. Ask a project admin, or edit in the dashboard.');
  }
}

export interface Envelope<T> {
  schemaVersion: 1;
  projectId: string;
  operationId: string;
  data: T;
  warnings: Warning[];
  replayed?: boolean;
}

export interface MutationContext {
  ctx: MutationCtx;
  access: Access;
  operationId: string;
  now: number;
  warn(w: Warning): void;
  event(e: { operation: string; objectType: string; objectId: string; version?: number | null; summary: string }): Promise<number>;
  revision(objectType: string, objectId: string, version: number, snapshot: unknown, operation: string): Promise<void>;
}

export const envelope = <T>(a: Access, data: T, warnings: Warning[] = []): Envelope<T> => ({ schemaVersion: 1, projectId: a.project.publicId, operationId: newId('op'), data, warnings });

/**
 * Run one domain mutation inside the Convex transaction: idempotency, the
 * change, revisions, activity events, and the receipt. Convex serializes
 * conflicting transactions, so concurrent writes to the same objects retry
 * against the new state.
 */
export async function mutate<T>(ctx: MutationCtx, access: Access, operation: string, requestId: unknown, payload: unknown, fn: (m: MutationContext) => Promise<T>): Promise<Envelope<T>> {
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 200) {
    throw new AppError('VALIDATION_ERROR', 'requestId must be a client-generated key of 8-200 characters, reused only to retry the same request.');
  }
  const pid = access.project.publicId;
  const requestDigest = digest(payload);
  const prior = await ctx.db
    .query('idempotency')
    .withIndex('by_key', (q) => q.eq('principalKey', access.principalKey).eq('projectId', pid).eq('operation', operation).eq('requestKey', requestId))
    .unique();
  if (prior) {
    if (prior.expiresAt < access.now) {
      throw new AppError('IDEMPOTENCY_EXPIRED', 'This requestId was used before and its receipt expired; it will not be executed again. Use a new requestId after checking current state.');
    }
    if (prior.requestDigest !== requestDigest) throw new AppError('IDEMPOTENCY_CONFLICT', 'This requestId was already used with different content. Use a new requestId for a new request.');
    return { ...(prior.result as Envelope<T>), replayed: true };
  }
  const warnings: Warning[] = [];
  const operationId = newId('op');
  const now = access.now;
  const project = (await ctx.db.get(access.project._id))!;
  let seq = project.activitySeq;
  const m: MutationContext = {
    ctx,
    access,
    operationId,
    now,
    warn: (w) => warnings.push(w),
    event: async (e) => {
      seq += 1;
      await ctx.db.insert('activity', {
        projectId: pid,
        seq,
        actor: access.actor,
        operation: e.operation,
        objectType: e.objectType,
        objectId: e.objectId,
        objectVersion: e.version ?? undefined,
        summary: e.summary.slice(0, 500),
        correlationId: operationId,
        createdAt: now,
      });
      return seq;
    },
    revision: async (objectType, objectId, version, snapshot, op) => {
      await ctx.db.insert('revisions', { projectId: pid, objectType, objectId, version, snapshot, actor: access.actor, operation: op, createdAt: now });
    },
  };
  const data = await fn(m);
  if (seq !== project.activitySeq) await ctx.db.patch(project._id, { activitySeq: seq, updatedAt: now });
  const result: Envelope<T> = { schemaVersion: 1, projectId: pid, operationId, data, warnings };
  await ctx.db.insert('idempotency', { principalKey: access.principalKey, projectId: pid, operation, requestKey: requestId, requestDigest, result, expiresAt: now + IDEMPOTENCY_TTL_MS });
  return result;
}

export const cursorContext = (a: Access, kind: string, filters: unknown) => `${kind}|${a.project.publicId}|${a.principalKey}|${digest(filters ?? {})}`;

/** Record a verified upstream membership answer (or its absence) in the mirror. */
export async function recordMembership(ctx: MutationCtx, orgId: string, userId: string, m: { role: 'admin' | 'member'; orgName?: string; user?: { displayName?: string; email?: string } } | null): Promise<void> {
  const now = Date.now();
  let ws = await ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', orgId)).unique();
  if (m) {
    const u = await ctx.db.query('users').withIndex('by_user', (q) => q.eq('clerkUserId', userId)).unique();
    if (u) await ctx.db.patch(u._id, { displayName: m.user?.displayName ?? u.displayName, email: m.user?.email ?? u.email, updatedAt: now });
    else await ctx.db.insert('users', { clerkUserId: userId, displayName: m.user?.displayName, email: m.user?.email, status: 'active', updatedAt: now });
    if (!ws) {
      const id = await ctx.db.insert('workspaces', { publicId: newId('ws'), clerkOrgId: orgId, name: m.orgName ?? orgId, status: 'active', policy: {}, policyRevision: 1, updatedAt: now });
      ws = (await ctx.db.get(id))!;
    } else if (m.orgName && m.orgName !== ws.name) await ctx.db.patch(ws._id, { name: m.orgName, updatedAt: now });
  }
  if (!ws) return;
  const row = await ctx.db.query('memberships').withIndex('by_ws_user', (q) => q.eq('workspaceId', ws!.publicId).eq('userId', userId)).unique();
  if (m) {
    if (row) await ctx.db.patch(row._id, { role: m.role, status: 'active', verifiedAt: now });
    else await ctx.db.insert('memberships', { workspaceId: ws.publicId, userId, role: m.role, status: 'active', verifiedAt: now, sourceTs: 0 });
  } else if (row) await ctx.db.patch(row._id, { status: 'removed', verifiedAt: now });
}

/** Upsert the access connection for a verified token tuple. */
export async function touchConnection(ctx: MutationCtx, p: Extract<WirePrincipal, { kind: 'token' }>): Promise<Doc<'connections'> | null> {
  const ws = await ctx.db.query('workspaces').withIndex('by_org', (q) => q.eq('clerkOrgId', p.orgId)).unique();
  if (!ws) return null;
  const now = Date.now();
  const scopes = [...p.scopes].sort();
  const row = await ctx.db
    .query('connections')
    .withIndex('by_tuple', (q) => q.eq('issuer', p.issuer).eq('userId', p.userId).eq('workspaceId', ws.publicId).eq('clientId', p.clientId).eq('resource', p.resourceUri))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { lastRequestAt: now, lastScopes: scopes });
    return { ...row, lastRequestAt: now, lastScopes: scopes };
  }
  const id = await ctx.db.insert('connections', { publicId: newId('conn'), workspaceId: ws.publicId, issuer: p.issuer, userId: p.userId, clientId: p.clientId, resource: p.resourceUri, policyRevision: 1, lastRequestAt: now, lastScopes: scopes, createdAt: now });
  return ctx.db.get(id);
}
