import type { Principal } from '../auth/verify';
import { many, one } from '../db/sql';
import type { Core, ProjectRow, WorkspaceAccess } from './core';
import { AppError, notFound } from './errors';
import { newId } from './util';
import { ensureDocument } from './work';

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
export const DELETION_RECOVERY_DAYS = 30;

function projectDto(p: ProjectRow, role: string) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    role,
    authorityMode: p.authority_mode,
    nativeSchema: p.native_schema,
    clientWritesPaused: p.client_writes_paused,
    archived: !!p.archived_at,
    deletionRequestedAt: iso(p.deletion_requested_at),
    createdAt: iso(p.created_at),
    updatedAt: iso(p.updated_at),
  };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'project'
  );
}

export class AdminService {
  constructor(private readonly core: Core) {}

  /** Context for any verified principal: workspace and the projects it may see. */
  async context(principal: Principal) {
    const ws = await this.core.workspaceAccess(principal, { fresh: false });
    const projects = await this.visibleProjects(ws);
    return {
      workspace: { id: ws.workspace.id, name: ws.workspace.name, orgId: ws.workspace.clerk_org_id, policy: ws.workspace.policy },
      user: { id: principal.userId, role: ws.membership.role },
      connection: ws.connection ? { id: ws.connection.id, clientId: ws.connection.client_id, resource: ws.connection.resource, allowedProjects: ws.connection.allowed_projects } : null,
      scopes: principal.kind === 'token' ? [...principal.scopes].sort() : null,
      projects,
    };
  }

  async visibleProjects(ws: WorkspaceAccess) {
    const admin = ws.membership.role === 'admin';
    const rows = await many<ProjectRow & { grant_role: string | null }>(
      this.core.db,
      `SELECT p.*, g.role AS grant_role FROM projects p
         LEFT JOIN project_grants g ON g.project_id = p.id AND g.user_id = $2 AND g.status = 'active'
        WHERE p.workspace_id = $1 AND p.deletion_requested_at IS NULL AND ($3 OR g.role IS NOT NULL)
        ORDER BY p.name, p.id`,
      [ws.workspace.id, ws.principal.userId, admin],
    );
    const allowed = ws.connection?.allowed_projects ?? null;
    return rows
      .filter((p) => !allowed || allowed.includes(p.id))
      .map((p) => projectDto(p, admin ? (ws.principal.kind === 'session' ? 'admin' : 'editor') : p.grant_role!));
  }

  /** Dashboard: workspace admins create projects (a solo workspace's creator is its admin). */
  async createProject(principal: Principal, input: { name: string; requestId?: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Projects are created in the dashboard.');
    const ws = await this.core.workspaceAccess(principal, { fresh: true });
    if (ws.membership.role !== 'admin') throw new AppError('FORBIDDEN', 'Only workspace administrators create projects.');
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 120) throw new AppError('VALIDATION_ERROR', 'Project name must be 1-120 characters.');
    return this.core.db.tx(async (q) => {
      let slug = slugify(name);
      for (let i = 2; await one(q, 'SELECT 1 FROM projects WHERE workspace_id = $1 AND slug = $2', [ws.workspace.id, slug]); i++) slug = `${slugify(name)}-${i}`;
      const p = (await one<ProjectRow>(q, `INSERT INTO projects (id, workspace_id, name, slug) VALUES ($1, $2, $3, $4) RETURNING *`, [newId('prj'), ws.workspace.id, name, slug]))!;
      const access = { ...ws, project: p, role: 'admin' as const };
      await ensureDocument(q, access, 'product');
      await ensureDocument(q, access, 'roadmap');
      await q.query(
        `INSERT INTO activity_events (workspace_id, project_id, seq, actor, operation, object_type, object_id, summary) VALUES ($1, $2, 1, $3::jsonb, 'project.created', 'project', $2, $4)`,
        [ws.workspace.id, p.id, JSON.stringify(ws.actor), `Created project ${name}`],
      );
      await q.query('UPDATE projects SET activity_seq = 1 WHERE id = $1', [p.id]);
      return projectDto(p, 'admin');
    });
  }

  async updateProject(principal: Principal, input: { projectId: string; name?: string; clientWritesPaused?: boolean; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'project_update', requestId, payload, async (ctx) => {
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (!name || name.length > 120) throw new AppError('VALIDATION_ERROR', 'Project name must be 1-120 characters.');
        await ctx.q.query('UPDATE projects SET name = $2, updated_at = now() WHERE id = $1', [input.projectId, name]);
      }
      if (input.clientWritesPaused !== undefined) {
        await ctx.q.query('UPDATE projects SET client_writes_paused = $2, policy_revision = policy_revision + 1, updated_at = now() WHERE id = $1', [input.projectId, !!input.clientWritesPaused]);
        await ctx.event({
          operation: input.clientWritesPaused ? 'policy.client_writes_paused' : 'policy.client_writes_resumed',
          objectType: 'project',
          objectId: input.projectId,
          summary: input.clientWritesPaused ? 'Paused connected-client changes to work (MCP and CLI)' : 'Resumed connected-client changes to work',
        });
      }
      const p = (await one<ProjectRow>(ctx.q, 'SELECT * FROM projects WHERE id = $1', [input.projectId]))!;
      return projectDto(p, 'admin');
    });
  }

  async archiveProject(principal: Principal, input: { projectId: string; archived: boolean; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'project_archive', requestId, payload, async (ctx) => {
      await ctx.q.query(`UPDATE projects SET archived_at = ${input.archived ? 'now()' : 'NULL'}, updated_at = now() WHERE id = $1`, [input.projectId]);
      if (input.archived) await ctx.q.query(`UPDATE claims SET released_at = now(), release_reason = 'project archived' WHERE project_id = $1 AND released_at IS NULL`, [input.projectId]);
      await ctx.event({ operation: input.archived ? 'project.archived' : 'project.restored', objectType: 'project', objectId: input.projectId, summary: input.archived ? 'Archived the project (read-only)' : 'Restored the project' });
      return { projectId: input.projectId, archived: input.archived };
    });
  }

  /** Deletion request: removes access now, cancels queued work, recoverable for 30 days. */
  async requestDeletion(principal: Principal, input: { projectId: string; confirmName: string; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    if (input.confirmName !== access.project.name) throw new AppError('VALIDATION_ERROR', 'Type the project name exactly to confirm deletion.');
    await this.core.db.tx(async (q) => {
      await q.query('UPDATE projects SET deletion_requested_at = now(), updated_at = now() WHERE id = $1', [input.projectId]);
      await q.query(`UPDATE control_operations SET state = 'cancelled', updated_at = now() WHERE project_id = $1 AND state IN ('pending', 'failed', 'unsupported')`, [input.projectId]);
      await q.query(`UPDATE claims SET released_at = now(), release_reason = 'project deleted' WHERE project_id = $1 AND released_at IS NULL`, [input.projectId]);
      await q.query(`UPDATE approvals SET state = 'cancelled' WHERE project_id = $1 AND state IN ('pending', 'approved')`, [input.projectId]);
    });
    return { projectId: input.projectId, purgeAfter: new Date(this.core.now().getTime() + DELETION_RECOVERY_DAYS * 86400_000).toISOString() };
  }

  async restoreDeleted(principal: Principal, input: { projectId: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Projects are restored in the dashboard.');
    const ws = await this.core.workspaceAccess(principal, { fresh: true });
    if (ws.membership.role !== 'admin') throw new AppError('FORBIDDEN', 'Only workspace administrators restore projects.');
    const p = await one<ProjectRow>(this.core.db, 'SELECT * FROM projects WHERE id = $1 AND workspace_id = $2 AND deletion_requested_at IS NOT NULL', [input.projectId, ws.workspace.id]);
    if (!p) throw notFound('The deleted project');
    // Restoring does not re-enable revoked connections or replay old control operations.
    await this.core.db.query('UPDATE projects SET deletion_requested_at = NULL, updated_at = now() WHERE id = $1', [p.id]);
    return { projectId: p.id, restored: true };
  }

  async deletedProjects(principal: Principal) {
    const ws = await this.core.workspaceAccess(principal, { fresh: false });
    if (ws.membership.role !== 'admin' || principal.kind !== 'session') return [];
    const rows = await many<ProjectRow>(this.core.db, 'SELECT * FROM projects WHERE workspace_id = $1 AND deletion_requested_at IS NOT NULL ORDER BY deletion_requested_at DESC', [ws.workspace.id]);
    return rows.map((p) => ({ ...projectDto(p, 'admin'), purgeAfter: new Date(new Date(p.deletion_requested_at!).getTime() + DELETION_RECOVERY_DAYS * 86400_000).toISOString() }));
  }

  /** Purge job: deletes projects past the recovery window. */
  async purgeExpired(): Promise<number> {
    const rows = await many<{ id: string }>(this.core.db, `SELECT id FROM projects WHERE deletion_requested_at < now() - interval '${DELETION_RECOVERY_DAYS} days'`);
    for (const { id } of rows) {
      await this.core.db.tx(async (q) => {
        for (const t of ['control_operations', 'companion_checkouts', 'claims', 'runs', 'notes', 'evidence_links', 'approvals', 'control_revisions', 'activity_events', 'revisions', 'native_sources', 'documents', 'work_relations', 'work_items', 'jobs', 'idempotency_records', 'project_grants']) {
          await q.query(`DELETE FROM ${t} WHERE project_id = $1`, [id]);
        }
        await q.query('DELETE FROM outbox WHERE project_id = $1', [id]);
        await q.query('DELETE FROM projects WHERE id = $1', [id]);
      });
    }
    return rows.length;
  }

  // ------------------------------------------------------------- members

  async members(principal: Principal, projectId: string) {
    const access = await this.core.authorize(principal, projectId, 'admin');
    const rows = await many<Record<string, any>>(
      this.core.db,
      `SELECT u.id, u.display_name, u.email, m.role AS org_role, g.role AS project_role, g.status AS grant_status
         FROM memberships m JOIN users u ON u.id = m.user_id
         LEFT JOIN project_grants g ON g.project_id = $2 AND g.user_id = m.user_id
        WHERE m.workspace_id = $1 AND m.status = 'active' ORDER BY u.display_name NULLS LAST, u.id`,
      [access.workspace.id, projectId],
    );
    return this.core.envelope(access, {
      items: rows.map((r) => ({ userId: r.id, name: r.display_name, email: r.email, orgRole: r.org_role, projectRole: r.org_role === 'admin' ? 'admin' : r.grant_status === 'active' ? r.project_role : null })),
    });
  }

  /**
   * Grant or revoke a project role. The target must be a current
   * organization member, confirmed upstream (never an email string alone).
   */
  async setGrant(principal: Principal, input: { projectId: string; userId: string; role: 'viewer' | 'editor' | null; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    if (input.role !== null && input.role !== 'viewer' && input.role !== 'editor') throw new AppError('VALIDATION_ERROR', 'role must be viewer, editor, or null to revoke.');
    if (input.role) {
      const m = await this.core.membership.fetch(access.workspace.clerk_org_id, input.userId).catch(() => {
        throw new AppError('UPSTREAM_UNAVAILABLE', 'Could not confirm organization membership.');
      });
      if (!m) throw new AppError('VALIDATION_ERROR', 'That user is not a member of this organization. Invite them through the organization first.');
      await this.core.recordMembership(access.workspace.clerk_org_id, input.userId, m);
    }
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'grant_set', requestId, payload, async (ctx) => {
      if (input.role) {
        await ctx.q.query(
          `INSERT INTO project_grants (workspace_id, project_id, user_id, role, granted_by) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', granted_by = EXCLUDED.granted_by, updated_at = now()`,
          [ctx.access.workspace.id, input.projectId, input.userId, input.role, principal.userId],
        );
      } else {
        await ctx.q.query(`UPDATE project_grants SET status = 'revoked', updated_at = now() WHERE project_id = $1 AND user_id = $2`, [input.projectId, input.userId]);
        // A revoked user's agent claims stop coordinating work.
        await ctx.q.query(
          `UPDATE claims SET released_at = now(), release_reason = 'access revoked' WHERE project_id = $1 AND released_at IS NULL
             AND connection_id IN (SELECT id FROM access_connections WHERE user_id = $2)`,
          [input.projectId, input.userId],
        );
      }
      await ctx.event({ operation: input.role ? 'grant.set' : 'grant.revoked', objectType: 'grant', objectId: input.userId, summary: input.role ? `Granted ${input.role}` : 'Revoked project access' });
      return { userId: input.userId, role: input.role };
    });
  }

  // --------------------------------------------------------- connections

  async connections(principal: Principal) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Connections are managed in the dashboard.');
    const ws = await this.core.workspaceAccess(principal, { fresh: false });
    const admin = ws.membership.role === 'admin';
    const rows = await many<Record<string, any>>(
      this.core.db,
      `SELECT c.*, u.display_name FROM access_connections c JOIN users u ON u.id = c.user_id
        WHERE c.workspace_id = $1 AND ($2 OR c.user_id = $3) ORDER BY c.last_request_at DESC NULLS LAST`,
      [ws.workspace.id, admin, principal.userId],
    );
    return rows.map((c) => ({
      id: c.id,
      userId: c.user_id,
      userName: c.display_name,
      clientId: c.client_id,
      resource: c.resource,
      allowedProjects: c.allowed_projects,
      disabled: !!c.disabled_at,
      disabledAt: iso(c.disabled_at),
      lastRequestAt: iso(c.last_request_at),
      lastScopes: c.last_scopes,
      createdAt: iso(c.created_at),
    }));
  }

  /**
   * Disable/enable or restrict a connection. Users manage their own; admins
   * manage all in the workspace. A valid token never re-enables it.
   */
  async updateConnection(principal: Principal, input: { connectionId: string; disabled?: boolean; allowedProjects?: string[] | null }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Connections are managed in the dashboard.');
    const ws = await this.core.workspaceAccess(principal, { fresh: true });
    const c = await one<Record<string, any>>(this.core.db, 'SELECT * FROM access_connections WHERE id = $1 AND workspace_id = $2', [input.connectionId, ws.workspace.id]);
    if (!c || (ws.membership.role !== 'admin' && c.user_id !== principal.userId)) throw notFound('The connection');
    if (input.allowedProjects !== undefined && input.allowedProjects !== null) {
      const ok = await many<{ id: string }>(this.core.db, 'SELECT id FROM projects WHERE workspace_id = $1 AND id = ANY($2::text[])', [ws.workspace.id, input.allowedProjects]);
      if (ok.length !== new Set(input.allowedProjects).size) throw new AppError('VALIDATION_ERROR', 'allowedProjects contains an unknown project.');
    }
    await this.core.db.query(
      `UPDATE access_connections SET
         disabled_at = CASE WHEN $2::boolean IS NULL THEN disabled_at WHEN $2 THEN COALESCE(disabled_at, now()) ELSE NULL END,
         disabled_by = CASE WHEN $2::boolean IS TRUE THEN $4 ELSE disabled_by END,
         allowed_projects = CASE WHEN $5 THEN $3::jsonb ELSE allowed_projects END,
         policy_revision = policy_revision + 1
       WHERE id = $1`,
      [c.id, input.disabled ?? null, input.allowedProjects === undefined ? null : JSON.stringify(input.allowedProjects), principal.userId, input.allowedProjects !== undefined],
    );
    if (input.disabled) {
      await this.core.db.query(`UPDATE claims SET released_at = now(), release_reason = 'connection disabled' WHERE connection_id = $1 AND released_at IS NULL`, [c.id]);
    }
    return (await this.connections(principal)).find((x) => x.id === c.id);
  }

  async setWorkspacePolicy(principal: Principal, input: { requireStartApproval?: boolean; allowLifecycleOverride?: boolean }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Workspace policy is managed in the dashboard.');
    const ws = await this.core.workspaceAccess(principal, { fresh: true });
    if (ws.membership.role !== 'admin') throw new AppError('FORBIDDEN', 'Only workspace administrators change workspace policy.');
    const policy = { ...ws.workspace.policy };
    if (input.requireStartApproval !== undefined) policy.requireStartApproval = !!input.requireStartApproval;
    if (input.allowLifecycleOverride !== undefined) policy.allowLifecycleOverride = !!input.allowLifecycleOverride;
    await this.core.db.query('UPDATE workspaces SET policy = $2::jsonb, policy_revision = policy_revision + 1, updated_at = now() WHERE id = $1', [ws.workspace.id, JSON.stringify(policy)]);
    return policy;
  }
}
