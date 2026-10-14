import crypto from 'node:crypto';
import type { Principal } from '../auth/verify';
import { many, one } from '../db/sql';
import type { Core, MutationContext } from './core';
import { AppError, notFound } from './errors';
import { normalizeDesiredSettings, type DesiredSettings } from './collab';
import { digest, hashSecret, newId, randomSecret } from './util';

export const ENROLLMENT_TTL_MS = 10 * 60_000;
export const OPERATION_TTL_MS = 7 * 24 * 3600_000;
/** Companion versions this service can deliver operations to. */
export const MIN_COMPANION_VERSION = '5.0.0-alpha.1';
export const COMPANION_PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64'] as const;
export const COMPANION_CAPABILITIES = ['skills.enable', 'skills.activation', 'skills.update', 'providers.mode', 'questions.preference'] as const;

const OP_TERMINAL = ['applied', 'expired', 'cancelled', 'superseded'];
const RECEIPT_STATES = ['applied', 'blocked', 'unsupported', 'failed'] as const;

interface CompanionRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  name: string;
  platform: string;
  version: string;
  capabilities: string[];
  credential_hash: string | null;
  revoked_at: Date | null;
  last_seen_at: Date | null;
}

interface CheckoutRow {
  id: string;
  companion_id: string;
  project_id: string;
  repo_identity: string;
  checkout_path_hash: string;
  desired_revision: number;
  observed_revision: number;
  last_observation: unknown;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Compare prerelease-aware versions with the subset of semver the companion uses. */
export function versionAtLeast(v: string, min: string): boolean {
  const parse = (s: string) => {
    const [main, pre] = s.split('-', 2);
    return { nums: main!.split('.').map((n) => Number(n) || 0), pre: pre ?? null };
  };
  const a = parse(v);
  const b = parse(min);
  for (let i = 0; i < 3; i++) if ((a.nums[i] ?? 0) !== (b.nums[i] ?? 0)) return (a.nums[i] ?? 0) > (b.nums[i] ?? 0);
  if (a.pre === b.pre) return true;
  if (a.pre === null) return true;
  if (b.pre === null) return false;
  return a.pre.localeCompare(b.pre, undefined, { numeric: true }) >= 0;
}

/** Plan for one checkout: the typed desired settings plus the capability each change needs. */
function planFor(desired: DesiredSettings) {
  const steps: Array<{ capability: string; target: string; value: unknown }> = [];
  for (const [id, s] of Object.entries(desired.skills ?? {})) {
    if (s.enabled !== undefined) steps.push({ capability: 'skills.enable', target: `skills.${id}.enabled`, value: s.enabled });
    if (s.activation !== undefined) steps.push({ capability: 'skills.activation', target: `skills.${id}.activation`, value: s.activation });
    if (s.version !== undefined) steps.push({ capability: 'skills.update', target: `skills.${id}.version`, value: s.version });
  }
  for (const [id, mode] of Object.entries(desired.providers ?? {})) steps.push({ capability: 'providers.mode', target: `providers.${id}.enabled`, value: mode });
  if (desired.questions) steps.push({ capability: 'questions.preference', target: 'interaction.questionPreference', value: desired.questions });
  return { desired, steps };
}

export class ControlsService {
  constructor(private readonly core: Core) {}

  /** Cloud policy and local desired/observed state. Never credentials. */
  async settingsGet(principal: Principal, projectId: string, selector?: { companionId?: string; checkoutId?: string }) {
    const access = await this.core.authorize(principal, projectId, principal.kind === 'token' && principal.resource === 'local-control' ? 'local:observe' : 'read');
    const desired = await one<{ revision: number; desired: DesiredSettings; created_at: Date }>(
      this.core.db,
      'SELECT revision, desired, created_at FROM control_revisions WHERE project_id = $1 ORDER BY revision DESC LIMIT 1',
      [projectId],
    );
    const params: unknown[] = [projectId];
    let sql = `SELECT k.*, c.name AS companion_name, c.platform, c.version, c.revoked_at, c.last_seen_at, c.owner_user_id
                 FROM companion_checkouts k JOIN companions c ON c.id = k.companion_id WHERE k.project_id = $1`;
    if (selector?.companionId) params.push(selector.companionId), (sql += ` AND k.companion_id = $${params.length}`);
    if (selector?.checkoutId) params.push(selector.checkoutId), (sql += ` AND k.id = $${params.length}`);
    const checkouts = await many<CheckoutRow & Record<string, any>>(this.core.db, sql, params);
    const ops = await many<Record<string, any>>(
      this.core.db,
      `SELECT DISTINCT ON (checkout_id) checkout_id, id, state, revision, receipt, error, updated_at
         FROM control_operations WHERE project_id = $1 ORDER BY checkout_id, revision DESC, created_at DESC`,
      [projectId],
    );
    const lastOp = new Map(ops.map((o) => [o.checkout_id, o]));
    return this.core.envelope(access, {
      cloud: {
        clientWritesPaused: access.project.client_writes_paused,
        requireStartApproval: !!access.workspace.policy.requireStartApproval,
        allowLifecycleOverride: !!access.workspace.policy.allowLifecycleOverride,
        archived: !!access.project.archived_at,
      },
      desired: desired ? { revision: desired.revision, settings: desired.desired, createdAt: iso(desired.created_at) } : null,
      checkouts: checkouts.map((k) => {
        const op = lastOp.get(k.id);
        return {
          checkoutId: k.id,
          companionId: k.companion_id,
          companionName: k.companion_name,
          platform: k.platform,
          companionVersion: k.version,
          companionRevoked: !!k.revoked_at,
          lastSeenAt: iso(k.last_seen_at),
          repoIdentity: k.repo_identity,
          desiredRevision: k.desired_revision,
          observedRevision: k.observed_revision,
          status: k.revoked_at ? 'revoked' : k.desired_revision === k.observed_revision ? 'applied' : (op?.state ?? 'pending'),
          lastOperation: op ? { id: op.id, state: op.state, revision: op.revision, receipt: op.receipt, error: op.error, updatedAt: iso(op.updated_at) } : null,
          observation: k.last_observation,
        };
      }),
    });
  }

  /**
   * Create a desired revision and one immutable operation per selected,
   * active checkout. Older pending operations are superseded, never replayed.
   * Runs inside the caller's transaction (dashboard admin or approved request).
   */
  async createRevision(ctx: MutationContext, rawDesired: unknown, checkoutIds: string[] | null, approvalId: string | null) {
    const desired = normalizeDesiredSettings(rawDesired);
    const pid = ctx.access.project.id;
    const revision = ((await one<{ r: number }>(ctx.q, 'SELECT COALESCE(MAX(revision), 0) + 1 AS r FROM control_revisions WHERE project_id = $1', [pid]))!).r;
    await ctx.q.query(
      `INSERT INTO control_revisions (id, workspace_id, project_id, revision, desired, created_by, approval_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [newId('rev'), ctx.access.workspace.id, pid, revision, JSON.stringify(desired), ctx.access.actor.userId, approvalId],
    );
    const params: unknown[] = [pid];
    let sql = `SELECT k.* FROM companion_checkouts k JOIN companions c ON c.id = k.companion_id WHERE k.project_id = $1 AND c.revoked_at IS NULL`;
    if (checkoutIds?.length) params.push(checkoutIds), (sql += ' AND k.id = ANY($2::text[])');
    const targets = await many<CheckoutRow>(ctx.q, sql, params);
    await ctx.q.query(
      `UPDATE control_operations SET state = 'superseded', updated_at = now() WHERE project_id = $1 AND state IN ('pending', 'failed', 'blocked', 'unsupported')${checkoutIds?.length ? ' AND checkout_id = ANY($2::text[])' : ''}`,
      checkoutIds?.length ? [pid, checkoutIds] : [pid],
    );
    const plan = planFor(desired);
    const operations: Array<{ id: string; checkoutId: string }> = [];
    for (const k of targets) {
      const id = newId('cop');
      await ctx.q.query(
        `INSERT INTO control_operations (id, workspace_id, project_id, companion_id, checkout_id, revision, plan, plan_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [id, ctx.access.workspace.id, pid, k.companion_id, k.id, revision, JSON.stringify(plan), digest(plan), new Date(ctx.now.getTime() + OPERATION_TTL_MS)],
      );
      await ctx.q.query('UPDATE companion_checkouts SET desired_revision = $2 WHERE id = $1', [k.id, revision]);
      operations.push({ id, checkoutId: k.id });
    }
    await ctx.event({ operation: 'controls.revision_created', objectType: 'control_revision', objectId: String(revision), version: revision, summary: `Desired settings revision ${revision} for ${targets.length} checkout(s)` });
    return { revision, desired, operations, pendingCheckouts: targets.length };
  }

  /** Dashboard admin: set desired local settings directly. */
  async setDesired(principal: Principal, input: { projectId: string; desired: unknown; checkoutIds?: string[]; requestId: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Connected clients request settings changes with agileflow_control_request.');
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'settings_set', requestId, payload, (ctx) => this.createRevision(ctx, input.desired, input.checkoutIds ?? null, null));
  }

  // ------------------------------------------------------------ enrollment

  /**
   * Step 1 (companion, local-control token with observe scope): register the
   * installation and the hash of a possession secret only it holds.
   */
  async enrollStart(principal: Principal, input: { projectId: string; name: string; platform: string; version: string; capabilities: string[]; repoIdentity: string; checkoutPathHash: string; possessionHash: string }) {
    if (principal.kind !== 'token' || principal.resource !== 'local-control') throw new AppError('FORBIDDEN', 'Enrollment needs a local-control sign-in.');
    const access = await this.core.authorize(principal, input.projectId, 'local:observe');
    if (!(COMPANION_PLATFORMS as readonly string[]).includes(input.platform)) {
      throw new AppError('UNSUPPORTED', `Companion controls support ${COMPANION_PLATFORMS.join(', ')}; ${input.platform} is not supported yet.`);
    }
    if (!/^[0-9a-f]{64}$/.test(input.possessionHash) || !/^[0-9a-f]{64}$/.test(input.checkoutPathHash)) throw new AppError('VALIDATION_ERROR', 'Invalid enrollment proof.');
    const caps = (input.capabilities ?? []).filter((c) => (COMPANION_CAPABILITIES as readonly string[]).includes(c));
    const id = newId('enr');
    const expires = new Date(this.core.now().getTime() + ENROLLMENT_TTL_MS);
    await this.core.db.query(
      `INSERT INTO enrollment_requests (id, workspace_id, user_id, project_id, possession_hash, request, expires_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [id, access.workspace.id, principal.userId, input.projectId, input.possessionHash, JSON.stringify({ name: String(input.name).slice(0, 100), platform: input.platform, version: String(input.version).slice(0, 40), capabilities: caps, repoIdentity: String(input.repoIdentity).slice(0, 300), checkoutPathHash: input.checkoutPathHash }), expires],
    );
    return { enrollmentId: id, expiresAt: expires.toISOString() };
  }

  /** Step 2 (dashboard): the workspace admin approves the exact request and capability limits. */
  async enrollApprove(principal: Principal, input: { projectId: string; enrollmentId: string; capabilities: string[]; requestId: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Enrollment is approved in the dashboard.');
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'enroll_approve', requestId, payload, async (ctx) => {
      const e = await one<Record<string, any>>(ctx.q, 'SELECT * FROM enrollment_requests WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.enrollmentId, input.projectId]);
      if (!e) throw notFound('The enrollment request');
      if (e.state !== 'pending') throw new AppError('VALIDATION_ERROR', `The enrollment request is ${e.state}.`);
      if (new Date(e.expires_at) < ctx.now) throw new AppError('OPERATION_EXPIRED', 'The enrollment request expired; start again from the companion.');
      const caps = (input.capabilities ?? []).filter((c) => (e.request.capabilities as string[]).includes(c));
      await ctx.q.query(`UPDATE enrollment_requests SET state = 'approved', approved_by = $2, approved_capabilities = $3::jsonb WHERE id = $1`, [e.id, principal.userId, JSON.stringify(caps)]);
      await ctx.event({ operation: 'companion.enrollment_approved', objectType: 'enrollment', objectId: e.id, summary: `Approved companion "${e.request.name}" (${caps.join(', ') || 'observe only'})` });
      return { enrollmentId: e.id, state: 'approved', capabilities: caps };
    });
  }

  /**
   * Step 3 (the initiating companion): prove possession, consume the approval
   * atomically, and receive the installation credential exactly once.
   */
  async enrollRedeem(principal: Principal, input: { projectId: string; enrollmentId: string; possessionSecret: string }) {
    if (principal.kind !== 'token' || principal.resource !== 'local-control') throw new AppError('FORBIDDEN', 'Enrollment needs a local-control sign-in.');
    const access = await this.core.authorize(principal, input.projectId, 'local:observe');
    return this.core.db.tx(async (q) => {
      const e = await one<Record<string, any>>(q, 'SELECT * FROM enrollment_requests WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.enrollmentId, input.projectId]);
      if (!e || e.user_id !== principal.userId) throw notFound('The enrollment request');
      const proof = hashSecret(String(input.possessionSecret ?? ''));
      if (proof.length !== e.possession_hash.length || !crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(e.possession_hash))) throw notFound('The enrollment request');
      if (e.state === 'pending') throw new AppError('APPROVAL_REQUIRED', 'Waiting for a workspace admin to approve this companion in the dashboard.');
      if (e.state !== 'approved') throw new AppError('OPERATION_EXPIRED', `The enrollment request is ${e.state}. Start a fresh enrollment.`);
      if (new Date(e.expires_at) < this.core.now()) throw new AppError('OPERATION_EXPIRED', 'The enrollment approval expired. Start a fresh enrollment.');
      const credential = `afc_${randomSecret(32)}`;
      const companionId = newId('cmp');
      await q.query(
        `INSERT INTO companions (id, workspace_id, owner_user_id, name, platform, version, capabilities, credential_hash, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())`,
        [companionId, access.workspace.id, principal.userId, e.request.name, e.request.platform, e.request.version, JSON.stringify(e.approved_capabilities ?? []), hashSecret(credential)],
      );
      const checkoutId = newId('chk');
      await q.query(
        `INSERT INTO companion_checkouts (id, companion_id, workspace_id, project_id, repo_identity, checkout_path_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
        [checkoutId, companionId, access.workspace.id, input.projectId, e.request.repoIdentity, e.request.checkoutPathHash],
      );
      await q.query(`UPDATE enrollment_requests SET state = 'redeemed' WHERE id = $1`, [e.id]);
      return { companionId, checkoutId, credential, capabilities: e.approved_capabilities ?? [] };
    });
  }

  /** Verify OAuth (local-control) + installation credential + current policy for every companion call. */
  async companionAccess(principal: Principal, credential: string | undefined, projectId: string, cap: 'local:observe' | 'local:apply') {
    if (principal.kind !== 'token' || principal.resource !== 'local-control') throw new AppError('FORBIDDEN', 'Local-control calls need a local-control sign-in.');
    const access = await this.core.authorize(principal, projectId, cap);
    if (!credential) throw new AppError('FORBIDDEN', 'This companion is not enrolled.');
    const c = await one<CompanionRow>(this.core.db, 'SELECT * FROM companions WHERE credential_hash = $1 AND workspace_id = $2', [hashSecret(credential), access.workspace.id]);
    if (!c || c.owner_user_id !== principal.userId) throw new AppError('FORBIDDEN', 'This companion is not enrolled.');
    if (c.revoked_at) throw new AppError('FORBIDDEN', 'This companion was disconnected in the dashboard. Enroll it again to continue.');
    return { access, companion: c };
  }

  /** Companion poll: report inventory, receive pending operations for its bound checkouts. */
  async companionPoll(principal: Principal, credential: string | undefined, input: { projectId: string; version: string; inventory?: Record<string, unknown> }) {
    const { companion } = await this.companionAccess(principal, credential, input.projectId, 'local:observe');
    const version = String(input.version ?? '').slice(0, 40);
    await this.core.db.query(`UPDATE companions SET last_seen_at = now(), version = $2, last_inventory = $3::jsonb WHERE id = $1`, [companion.id, version, JSON.stringify(sanitizeInventory(input.inventory))]);
    // Expire stale operations before delivery.
    await this.core.db.query(`UPDATE control_operations SET state = 'expired', updated_at = now() WHERE companion_id = $1 AND state = 'pending' AND expires_at < now()`, [companion.id]);
    const supported = versionAtLeast(version, MIN_COMPANION_VERSION);
    if (!supported) {
      await this.core.db.query(
        `UPDATE control_operations SET state = 'unsupported', error = $2::jsonb, updated_at = now() WHERE companion_id = $1 AND state = 'pending'`,
        [companion.id, JSON.stringify({ code: 'REQUIRED_UPGRADE', message: `Upgrade the companion to ${MIN_COMPANION_VERSION} or later.` })],
      );
    } else {
      // A compatible upgrade lets unexpired, unsuperseded unsupported operations retry after fresh checks.
      await this.core.db.query(
        `UPDATE control_operations SET state = 'pending', error = NULL, updated_at = now() WHERE companion_id = $1 AND state = 'unsupported' AND error->>'code' = 'REQUIRED_UPGRADE' AND expires_at > now()`,
        [companion.id],
      );
    }
    const ops = supported
      ? await many<Record<string, any>>(
          this.core.db,
          `SELECT o.id, o.checkout_id, o.revision, o.plan, o.plan_hash, o.expires_at, k.repo_identity, k.checkout_path_hash
             FROM control_operations o JOIN companion_checkouts k ON k.id = o.checkout_id
            WHERE o.companion_id = $1 AND o.project_id = $2 AND o.state = 'pending' ORDER BY o.revision`,
          [companion.id, input.projectId],
        )
      : [];
    return {
      companionId: companion.id,
      supported,
      minimumVersion: MIN_COMPANION_VERSION,
      capabilities: companion.capabilities,
      operations: ops.map((o) => ({ id: o.id, checkoutId: o.checkout_id, revision: o.revision, plan: o.plan, planHash: o.plan_hash, expiresAt: iso(o.expires_at), binding: { repoIdentity: o.repo_identity, checkoutPathHash: o.checkout_path_hash } })),
    };
  }

  /** Immediately before applying: fresh authorization and a current, unsuperseded operation. */
  async companionBegin(principal: Principal, credential: string | undefined, input: { projectId: string; operationId: string; planHash: string }) {
    const { companion } = await this.companionAccess(principal, credential, input.projectId, 'local:apply');
    return this.core.db.tx(async (q) => {
      const op = await one<Record<string, any>>(q, 'SELECT * FROM control_operations WHERE id = $1 AND companion_id = $2 AND project_id = $3 FOR UPDATE', [input.operationId, companion.id, input.projectId]);
      if (!op) throw notFound('The operation');
      if (op.state !== 'pending' && op.state !== 'failed') throw new AppError('OPERATION_EXPIRED', `The operation is ${op.state}; do not apply it.`);
      if (new Date(op.expires_at) < this.core.now()) {
        await q.query(`UPDATE control_operations SET state = 'expired', updated_at = now() WHERE id = $1`, [op.id]);
        throw new AppError('OPERATION_EXPIRED', 'The operation expired; do not apply it.');
      }
      if (op.plan_hash !== input.planHash) throw new AppError('VERSION_CONFLICT', 'The plan changed; fetch operations again.');
      const missing = (op.plan.steps as Array<{ capability: string }>).filter((s) => !companion.capabilities.includes(s.capability)).map((s) => s.capability);
      if (missing.length) {
        await q.query(`UPDATE control_operations SET state = 'unsupported', error = $2::jsonb, updated_at = now() WHERE id = $1`, [op.id, JSON.stringify({ code: 'CAPABILITY_NOT_ENROLLED', message: `Not enrolled for: ${[...new Set(missing)].join(', ')}` })]);
        throw new AppError('UNSUPPORTED', `This companion is not enrolled for: ${[...new Set(missing)].join(', ')}.`);
      }
      await q.query(`UPDATE control_operations SET state = 'applying', attempts = attempts + 1, updated_at = now() WHERE id = $1`, [op.id]);
      return { operationId: op.id, state: 'applying' };
    });
  }

  /** Receipt: per-target results. observedRevision advances only when every target applied. */
  async companionReceipt(principal: Principal, credential: string | undefined, input: { projectId: string; operationId: string; state: string; results: Array<{ target: string; outcome: string; detail?: string }>; reloadRequired?: boolean; observation?: Record<string, unknown> }) {
    let companion: CompanionRow;
    try {
      ({ companion } = await this.companionAccess(principal, credential, input.projectId, 'local:apply'));
    } catch (err) {
      // After revocation the receipt is refused; the dashboard shows outcome unknown.
      await this.core.db.query(`UPDATE control_operations SET state = 'unknown', updated_at = now() WHERE id = $1 AND state = 'applying'`, [input.operationId]);
      throw err;
    }
    if (!(RECEIPT_STATES as readonly string[]).includes(input.state)) throw new AppError('VALIDATION_ERROR', `state must be one of: ${RECEIPT_STATES.join(', ')}.`);
    const results = (input.results ?? []).slice(0, 200).map((r) => ({ target: String(r.target).slice(0, 200), outcome: String(r.outcome).slice(0, 40), ...(r.detail ? { detail: String(r.detail).slice(0, 500) } : {}) }));
    const allApplied = input.state === 'applied' && results.every((r) => r.outcome === 'applied' || r.outcome === 'unchanged');
    const state = input.state === 'applied' && !allApplied ? 'blocked' : input.state;
    return this.core.db.tx(async (q) => {
      const op = await one<Record<string, any>>(q, 'SELECT * FROM control_operations WHERE id = $1 AND companion_id = $2 AND project_id = $3 FOR UPDATE', [input.operationId, companion.id, input.projectId]);
      if (!op) throw notFound('The operation');
      if (op.state !== 'applying') throw new AppError('VALIDATION_ERROR', `The operation is ${op.state}, not applying.`);
      const receipt = { companionId: companion.id, checkoutId: op.checkout_id, planHash: op.plan_hash, results, reloadRequired: !!input.reloadRequired, at: this.core.now().toISOString() };
      await q.query(`UPDATE control_operations SET state = $2, receipt = $3::jsonb, updated_at = now() WHERE id = $1`, [op.id, state, JSON.stringify(receipt)]);
      if (state === 'applied') {
        await q.query(`UPDATE companion_checkouts SET observed_revision = GREATEST(observed_revision, $2), last_observation = $3::jsonb WHERE id = $1`, [op.checkout_id, op.revision, JSON.stringify(sanitizeInventory(input.observation))]);
      }
      const seq = await one<{ s: string }>(q, 'UPDATE projects SET activity_seq = activity_seq + 1 WHERE id = $1 RETURNING activity_seq AS s', [input.projectId]);
      await q.query(
        `INSERT INTO activity_events (workspace_id, project_id, seq, actor, operation, object_type, object_id, object_version, summary) VALUES ($1, $2, $3, $4::jsonb, $5, 'control_operation', $6, $7, $8)`,
        [companion.workspace_id, input.projectId, Number(seq!.s), JSON.stringify({ kind: 'companion', userId: principal.userId, companionId: companion.id }), `controls.${state}`, op.id, op.revision, `Companion "${companion.name}" reported ${state} for revision ${op.revision}`],
      );
      return { operationId: op.id, state, observedAdvanced: state === 'applied' };
    });
  }

  /** Dashboard: disconnect a companion (revokes its credential and queued operations). */
  async revokeCompanion(principal: Principal, input: { projectId: string; companionId: string; requestId: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Companions are disconnected in the dashboard.');
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'companion_revoke', requestId, payload, async (ctx) => {
      const c = await one<CompanionRow>(ctx.q, 'SELECT * FROM companions WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [input.companionId, ctx.access.workspace.id]);
      if (!c) throw notFound('The companion');
      await ctx.q.query('UPDATE companions SET revoked_at = now() WHERE id = $1', [c.id]);
      const cancelled = await many<{ id: string }>(ctx.q, `UPDATE control_operations SET state = 'cancelled', updated_at = now() WHERE companion_id = $1 AND state IN ('pending', 'failed', 'unsupported') RETURNING id`, [c.id]);
      await ctx.event({ operation: 'companion.revoked', objectType: 'companion', objectId: c.id, summary: `Disconnected companion "${c.name}"; ${cancelled.length} queued operation(s) cancelled` });
      return { companionId: c.id, revoked: true, cancelledOperations: cancelled.length };
    });
  }

  async listEnrollments(principal: Principal, projectId: string) {
    const access = await this.core.authorize(principal, projectId, 'admin');
    const rows = await many<Record<string, any>>(this.core.db, `SELECT id, user_id, request, state, expires_at, created_at FROM enrollment_requests WHERE project_id = $1 AND state IN ('pending', 'approved') AND expires_at > now() ORDER BY created_at DESC`, [projectId]);
    const companions = await many<Record<string, any>>(
      this.core.db,
      `SELECT DISTINCT c.id, c.name, c.platform, c.version, c.capabilities, c.revoked_at, c.last_seen_at, c.owner_user_id
         FROM companions c JOIN companion_checkouts k ON k.companion_id = c.id WHERE k.project_id = $1 ORDER BY c.name`,
      [projectId],
    );
    return this.core.envelope(access, {
      pending: rows.map((r) => ({ id: r.id, userId: r.user_id, request: r.request, state: r.state, expiresAt: iso(r.expires_at) })),
      companions: companions.map((c) => ({ id: c.id, name: c.name, platform: c.platform, version: c.version, capabilities: c.capabilities, revoked: !!c.revoked_at, lastSeenAt: iso(c.last_seen_at), ownerUserId: c.owner_user_id, supported: versionAtLeast(c.version, MIN_COMPANION_VERSION) })),
      minimumVersion: MIN_COMPANION_VERSION,
    });
  }
}

/** Observed state is a typed allowlist: no raw config output or environment values. */
function sanitizeInventory(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, any>;
  const out: Record<string, unknown> = {};
  if (r.skills && typeof r.skills === 'object') {
    const skills: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(r.skills as Record<string, any>).slice(0, 500)) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) continue;
      skills[id] = {
        enabled: typeof s?.enabled === 'boolean' ? s.enabled : undefined,
        activation: s?.activation === 'manual' ? 'manual' : s?.activation === 'auto' ? 'auto' : undefined,
        modified: typeof s?.modified === 'boolean' ? s.modified : undefined,
        version: typeof s?.version === 'string' ? s.version.slice(0, 40) : undefined,
      };
    }
    out.skills = skills;
  }
  if (r.providers && typeof r.providers === 'object') {
    const providers: Record<string, string> = {};
    for (const [id, v] of Object.entries(r.providers as Record<string, unknown>).slice(0, 50)) if (/^[a-z][a-z0-9-]{0,31}$/.test(id) && ['on', 'off', 'auto'].includes(v as string)) providers[id] = v as string;
    out.providers = providers;
  }
  if (['provider-default', 'prefer', 'minimize'].includes(r.questions)) out.questions = r.questions;
  if (typeof r.cliVersion === 'string') out.cliVersion = r.cliVersion.slice(0, 40);
  return out;
}

export { OP_TERMINAL };
