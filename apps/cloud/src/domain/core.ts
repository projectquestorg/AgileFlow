import type { Principal, TokenPrincipal } from '../auth/verify';
import { UpstreamUnavailable, type MembershipInfo, type MembershipSource } from '../auth/membership';
import { one, type Db, type Queryable } from '../db/sql';
import { AppError, ScopeError, notFound } from './errors';
import { CursorCodec, digest, newId } from './util';

import { SCOPE_FOR, type Capability } from '../auth/scopes';

export { SCOPE_FOR, type Capability };

export type Role = 'viewer' | 'editor' | 'admin';

export interface WorkspaceRow {
  id: string;
  clerk_org_id: string;
  name: string;
  status: string;
  policy: { requireStartApproval?: boolean; allowLifecycleOverride?: boolean };
  policy_revision: number;
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  authority_mode: string;
  native_schema: number;
  client_writes_paused: boolean;
  archived_at: Date | null;
  deletion_requested_at: Date | null;
  policy_revision: number;
  activity_seq: string | number;
  created_at: Date;
  updated_at: Date;
}

export interface ConnectionRow {
  id: string;
  workspace_id: string;
  issuer: string;
  user_id: string;
  client_id: string;
  resource: string;
  allowed_projects: string[] | null;
  disabled_at: Date | null;
}

/** Who performed an action, derived from the verified principal only. */
export interface Actor {
  kind: 'user' | 'agent' | 'cli' | 'companion' | 'system';
  userId: string;
  connectionId?: string;
  clientId?: string;
}

export interface WorkspaceAccess {
  principal: Principal;
  workspace: WorkspaceRow;
  membership: MembershipInfo;
  connection: ConnectionRow | null;
  actor: Actor;
  /** Idempotency namespace: the connection for token clients, the user for browser sessions. */
  principalKey: string;
}

export interface Access extends WorkspaceAccess {
  project: ProjectRow;
  role: Role;
}

export interface Warning {
  code: string;
  message: string;
  objectId?: string;
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
  q: Queryable;
  access: Access;
  operationId: string;
  now: Date;
  warn(w: Warning): void;
  event(e: { operation: string; objectType: string; objectId: string; version?: number | null; summary: string }): Promise<number>;
  revision(objectType: string, objectId: string, version: number, snapshot: unknown, operation: string): Promise<void>;
}

export interface CoreOptions {
  db: Db;
  membership: MembershipSource;
  cursorSecret: string;
  /** Read cache bound for external membership (default 60 seconds). */
  membershipReadCacheMs?: number;
  /** Idempotency receipt lifetime (default 7 days). */
  idempotencyTtlMs?: number;
  now?: () => Date;
}

const READ_CACHE_MS = 60_000;
const IDEMPOTENCY_TTL_MS = 7 * 24 * 3600_000;

export class Core {
  readonly db: Db;
  readonly membership: MembershipSource;
  readonly cursors: CursorCodec;
  readonly now: () => Date;
  private readonly readCacheMs: number;
  private readonly idempotencyTtlMs: number;

  constructor(opts: CoreOptions) {
    this.db = opts.db;
    this.membership = opts.membership;
    this.cursors = new CursorCodec(opts.cursorSecret);
    this.now = opts.now ?? (() => new Date());
    this.readCacheMs = opts.membershipReadCacheMs ?? READ_CACHE_MS;
    this.idempotencyTtlMs = opts.idempotencyTtlMs ?? IDEMPOTENCY_TTL_MS;
  }

  /**
   * Resolve the verified principal's workspace. Organization comes only from
   * the verified credential. Membership is re-verified upstream for every
   * mutation (`fresh`) and at most every 60 seconds for reads; the first
   * request hydrates the local mirror without waiting for a webhook.
   */
  async workspaceAccess(principal: Principal, opts: { fresh: boolean }): Promise<WorkspaceAccess> {
    const orgId = principal.orgId;
    if (!orgId) throw new AppError('FORBIDDEN', 'Select or create an organization first.');
    const mirror = await one<{ workspace_id: string; role: 'admin' | 'member'; status: string; verified_at: Date; ws_status: string }>(
      this.db,
      `SELECT m.workspace_id, m.role, m.status, m.verified_at, w.status AS ws_status
         FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
        WHERE w.clerk_org_id = $1 AND m.user_id = $2`,
      [orgId, principal.userId],
    );
    let membership: MembershipInfo | null;
    const age = mirror ? this.now().getTime() - new Date(mirror.verified_at).getTime() : Infinity;
    if (mirror && mirror.ws_status !== 'active') throw notFound('The workspace');
    if (!opts.fresh && mirror && mirror.status === 'active' && age <= this.readCacheMs) {
      membership = { role: mirror.role };
    } else {
      try {
        membership = await this.membership.fetch(orgId, principal.userId);
      } catch (err) {
        if (err instanceof UpstreamUnavailable) throw new AppError('UPSTREAM_UNAVAILABLE', err.message);
        throw err;
      }
      await this.recordMembership(orgId, principal.userId, membership);
    }
    if (!membership) throw new AppError('FORBIDDEN', 'You are not a member of this organization.');
    const workspace = await one<WorkspaceRow>(this.db, 'SELECT * FROM workspaces WHERE clerk_org_id = $1', [orgId]);
    if (!workspace || workspace.status !== 'active') throw notFound('The workspace');

    let connection: ConnectionRow | null = null;
    if (principal.kind === 'token') connection = await this.connectionFor(principal, workspace.id);
    const actor: Actor =
      principal.kind === 'session'
        ? { kind: 'user', userId: principal.userId }
        : {
            kind: principal.resource === 'mcp' ? 'agent' : principal.resource === 'cli' ? 'cli' : 'companion',
            userId: principal.userId,
            connectionId: connection!.id,
            clientId: principal.clientId,
          };
    return {
      principal,
      workspace,
      membership,
      connection,
      actor,
      principalKey: connection ? `conn:${connection.id}` : `user:${principal.userId}`,
    };
  }

  /** Upsert the user/workspace/membership mirror from a verified upstream answer. */
  async recordMembership(orgId: string, userId: string, m: MembershipInfo | null): Promise<void> {
    await this.db.tx(async (q) => {
      if (m) {
        await q.query(
          `INSERT INTO users (id, display_name, email) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             email = COALESCE(EXCLUDED.email, users.email), updated_at = now()`,
          [userId, m.user?.displayName ?? null, m.user?.email ?? null],
        );
        await q.query(
          `INSERT INTO workspaces (id, clerk_org_id, name) VALUES ($1, $2, $3)
           ON CONFLICT (clerk_org_id) DO UPDATE SET name = COALESCE($4, workspaces.name)`,
          [newId('ws'), orgId, m.orgName ?? orgId, m.orgName ?? null],
        );
        await q.query(
          `INSERT INTO memberships (workspace_id, user_id, role, status, verified_at)
             SELECT id, $2, $3, 'active', now() FROM workspaces WHERE clerk_org_id = $1
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', verified_at = now()`,
          [orgId, userId, m.role],
        );
      } else {
        await q.query(
          `UPDATE memberships SET status = 'removed', verified_at = now()
            WHERE user_id = $2 AND workspace_id = (SELECT id FROM workspaces WHERE clerk_org_id = $1)`,
          [orgId, userId],
        );
      }
    });
  }

  /** The access connection for the verified (issuer, sub, org, client, resource) tuple. */
  private async connectionFor(p: TokenPrincipal, workspaceId: string): Promise<ConnectionRow> {
    const scopes = JSON.stringify([...p.scopes].sort());
    const row = await one<ConnectionRow>(
      this.db,
      `INSERT INTO access_connections (id, workspace_id, issuer, user_id, client_id, resource, last_request_at, last_scopes)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
       ON CONFLICT (issuer, user_id, workspace_id, client_id, resource)
         DO UPDATE SET last_request_at = now(), last_scopes = EXCLUDED.last_scopes
       RETURNING *`,
      [newId('conn'), workspaceId, p.issuer, p.userId, p.clientId, p.resourceUri, scopes],
    );
    if (row!.disabled_at) throw new AppError('CONNECTION_DISABLED', 'This client connection was disabled in the AgileFlow dashboard.');
    return row!;
  }

  /** OAuth scope ceiling for token clients. Throws ScopeError (HTTP 403 insufficient_scope). */
  requireScope(principal: Principal, cap: Capability): void {
    if (principal.kind !== 'token') return;
    if (cap === 'admin') throw new AppError('FORBIDDEN', 'Administration is only available in the dashboard.');
    const local = cap === 'local:observe' || cap === 'local:apply';
    if (local !== (principal.resource === 'local-control')) {
      throw new AppError('FORBIDDEN', local ? 'Local-control operations need a local-control enrollment.' : 'This credential is limited to local-control operations.');
    }
    const needed = [SCOPE_FOR[cap]];
    if (!needed.every((s) => principal.scopes.has(s))) throw new ScopeError(needed);
  }

  /**
   * Authorize `cap` on `projectId`: verified organization, current
   * membership, project grant (or workspace admin), OAuth scope, connection
   * restriction and disable state, archive, and the connected-client pause.
   * Inaccessible projects look the same as missing ones.
   */
  async authorize(principal: Principal, projectId: string, cap: Capability): Promise<Access> {
    this.requireScope(principal, cap);
    const mutation = cap !== 'read' && cap !== 'local:observe';
    const ws = await this.workspaceAccess(principal, { fresh: mutation });
    return this.projectAccess(ws, projectId, cap);
  }

  async projectAccess(ws: WorkspaceAccess, projectId: string, cap: Capability, q: Queryable = this.db, lock = false): Promise<Access> {
    if (typeof projectId !== 'string' || !projectId) throw new AppError('VALIDATION_ERROR', 'projectId is required.');
    const project = await one<ProjectRow>(
      q,
      `SELECT * FROM projects WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`,
      [projectId, ws.workspace.id],
    );
    if (!project || project.deletion_requested_at) throw notFound('The project');
    let role: Role | null = null;
    if (ws.membership.role === 'admin') role = ws.principal.kind === 'session' ? 'admin' : 'editor';
    else {
      const grant = await one<{ role: 'viewer' | 'editor' }>(
        q,
        `SELECT role FROM project_grants WHERE project_id = $1 AND user_id = $2 AND status = 'active'`,
        [projectId, ws.principal.userId],
      );
      role = grant?.role ?? null;
    }
    if (!role) throw notFound('The project');
    if (ws.connection) {
      const conn = await one<ConnectionRow>(q, 'SELECT * FROM access_connections WHERE id = $1', [ws.connection.id]);
      if (!conn || conn.disabled_at) throw new AppError('CONNECTION_DISABLED', 'This client connection was disabled in the AgileFlow dashboard.');
      if (conn.allowed_projects && !conn.allowed_projects.includes(projectId)) throw notFound('The project');
    }
    const access: Access = { ...ws, project, role };
    this.checkCapability(access, cap);
    return access;
  }

  private checkCapability(a: Access, cap: Capability): void {
    if (cap === 'read' || cap === 'local:observe') return;
    if (cap === 'admin') {
      if (a.role !== 'admin') throw new AppError('FORBIDDEN', 'Only workspace administrators can do this.');
      return;
    }
    if (a.role === 'viewer') throw new AppError('FORBIDDEN', 'You have read-only access to this project.');
    if (a.project.archived_at && cap !== 'local:apply') throw new AppError('PROJECT_ARCHIVED', 'The project is archived; it is read-only until restored.');
    if (cap === 'work:write' && a.principal.kind === 'token' && a.project.client_writes_paused) {
      throw new AppError('CLIENT_WRITES_PAUSED', 'Connected-client changes to work are paused for this project. Ask a project admin, or edit in the dashboard.');
    }
  }

  /**
   * Run one domain mutation atomically: project lock (the linearization point
   * for pause/disable/revoke), policy recheck, idempotency, the change, its
   * revision and activity events, and the idempotency receipt.
   */
  async mutate<T>(
    access: Access,
    cap: Capability,
    operation: string,
    requestId: string,
    payload: unknown,
    fn: (ctx: MutationContext) => Promise<T>,
  ): Promise<Envelope<T>> {
    if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 200) {
      throw new AppError('VALIDATION_ERROR', 'requestId must be a client-generated key of 8-200 characters, reused only to retry the same request.');
    }
    const requestDigest = digest(payload);
    return this.db.tx(async (q) => {
      const locked = await this.projectAccess(access, access.project.id, cap, q, true);
      const prior = await one<{ request_digest: string; result: Envelope<T>; expires_at: Date }>(
        q,
        `SELECT request_digest, result, expires_at FROM idempotency_records
          WHERE principal_key = $1 AND project_id = $2 AND operation = $3 AND request_key = $4`,
        [access.principalKey, access.project.id, operation, requestId],
      );
      if (prior) {
        if (new Date(prior.expires_at) < this.now()) {
          throw new AppError('IDEMPOTENCY_EXPIRED', 'This requestId was used before and its receipt expired; it will not be executed again. Use a new requestId after checking current state.');
        }
        if (prior.request_digest !== requestDigest) {
          throw new AppError('IDEMPOTENCY_CONFLICT', 'This requestId was already used with different content. Use a new requestId for a new request.');
        }
        return { ...prior.result, replayed: true };
      }
      const warnings: Warning[] = [];
      const operationId = newId('op');
      const now = this.now();
      let seq = Number(locked.project.activity_seq);
      const ctx: MutationContext = {
        q,
        access: locked,
        operationId,
        now,
        warn: (w) => warnings.push(w),
        event: async (e) => {
          seq += 1;
          await q.query(
            `INSERT INTO activity_events (workspace_id, project_id, seq, actor, operation, object_type, object_id, object_version, summary, correlation_id, created_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
            [locked.workspace.id, locked.project.id, seq, JSON.stringify(locked.actor), e.operation, e.objectType, e.objectId, e.version ?? null, e.summary.slice(0, 500), operationId, now],
          );
          await q.query(
            `INSERT INTO outbox (workspace_id, project_id, topic, payload) VALUES ($1, $2, 'activity', $3::jsonb)`,
            [locked.workspace.id, locked.project.id, JSON.stringify({ seq, objectType: e.objectType, objectId: e.objectId })],
          );
          return seq;
        },
        revision: async (objectType, objectId, version, snapshot, op) => {
          await q.query(
            `INSERT INTO revisions (workspace_id, project_id, object_type, object_id, version, snapshot, actor, operation, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
            [locked.workspace.id, locked.project.id, objectType, objectId, version, JSON.stringify(snapshot), JSON.stringify(locked.actor), op, now],
          );
        },
      };
      const data = await fn(ctx);
      if (seq !== Number(locked.project.activity_seq)) {
        await q.query('UPDATE projects SET activity_seq = $2, updated_at = now() WHERE id = $1', [locked.project.id, seq]);
      }
      const envelope: Envelope<T> = { schemaVersion: 1, projectId: locked.project.id, operationId, data, warnings };
      await q.query(
        `INSERT INTO idempotency_records (principal_key, project_id, operation, request_key, request_digest, result, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [access.principalKey, locked.project.id, operation, requestId, requestDigest, JSON.stringify(envelope), new Date(now.getTime() + this.idempotencyTtlMs)],
      );
      return envelope;
    });
  }

  /** Wrap read results in the same envelope as mutations. */
  envelope<T>(access: Access, data: T, warnings: Warning[] = []): Envelope<T> {
    return { schemaVersion: 1, projectId: access.project.id, operationId: newId('op'), data, warnings };
  }

  /** Cursor context: project + principal + filter digest, so cursors cannot move between contexts. */
  cursorContext(access: Access, kind: string, filters: unknown): string {
    return `${kind}|${access.project.id}|${access.principalKey}|${digest(filters ?? {})}`;
  }
}

export const LIST_DEFAULT = 50;
export const LIST_MAX = 200;

export function clampLimit(limit: unknown, max = LIST_MAX): number {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : LIST_DEFAULT;
  return Math.max(1, Math.min(max, n));
}
