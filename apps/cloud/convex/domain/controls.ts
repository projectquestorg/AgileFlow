import type { Doc } from '../_generated/dataModel';
import { AppError, ScopeError, notFound } from '../../src/domain/errors';
import { authorize, envelope, mutate, type Access, type Ctx, type MutationContext, type MutationCtx, type WirePrincipal } from '../lib/core';
import { digest, newId, randomSecret, sha256Hex } from '../lib/util';
import type { ReadOp, WriteOp } from '../ops';

export const ENROLLMENT_TTL_MS = 10 * 60_000;
export const OPERATION_TTL_MS = 7 * 24 * 3600_000;
/** Companion versions this service can deliver operations to. */
export const MIN_COMPANION_VERSION = '5.0.0-alpha.1';
export const COMPANION_PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64'] as const;
export const COMPANION_CAPABILITIES = ['skills.enable', 'skills.activation', 'skills.update', 'providers.mode', 'questions.preference'] as const;
export const OP_TERMINAL = ['applied', 'expired', 'cancelled', 'superseded'];
const RECEIPT_STATES = ['applied', 'blocked', 'unsupported', 'failed'] as const;

export const QUESTION_PREFERENCES = ['provider-default', 'prefer', 'minimize'] as const;
export const PROVIDER_MODES = ['on', 'off', 'auto'] as const;
export const ACTIVATIONS = ['auto', 'manual'] as const;

export interface DesiredSettings {
  skills?: Record<string, { enabled?: boolean; activation?: (typeof ACTIVATIONS)[number]; version?: string }>;
  providers?: Record<string, (typeof PROVIDER_MODES)[number]>;
  questions?: (typeof QUESTION_PREFERENCES)[number];
}

const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);

/** Typed allowlist: no commands, paths, URLs, or environment values can enter a desired revision. */
export function normalizeDesiredSettings(raw: unknown): DesiredSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('VALIDATION_ERROR', 'desired settings must be an object.');
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!['skills', 'providers', 'questions'].includes(k)) throw new AppError('VALIDATION_ERROR', `Unsupported setting: ${k}.`);
  const out: DesiredSettings = {};
  if (r.skills !== undefined) {
    if (!r.skills || typeof r.skills !== 'object' || Array.isArray(r.skills)) throw new AppError('VALIDATION_ERROR', 'skills must be an object.');
    out.skills = {};
    for (const [id, v] of Object.entries(r.skills as Record<string, any>)) {
      if (!SKILL_ID.test(id)) throw new AppError('VALIDATION_ERROR', `Invalid skill id: ${id}.`);
      const s: { enabled?: boolean; activation?: 'auto' | 'manual'; version?: string } = {};
      if (v?.enabled !== undefined) {
        if (typeof v.enabled !== 'boolean') throw new AppError('VALIDATION_ERROR', `skills.${id}.enabled must be true or false.`);
        s.enabled = v.enabled;
      }
      if (v?.activation !== undefined) {
        if (!(ACTIVATIONS as readonly string[]).includes(v.activation)) throw new AppError('VALIDATION_ERROR', `skills.${id}.activation must be auto or manual.`);
        s.activation = v.activation;
      }
      if (v?.version !== undefined) {
        // An exact released version: the companion resolves this concrete version, never a moving range.
        if (typeof v.version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v.version)) throw new AppError('VALIDATION_ERROR', `skills.${id}.version must be an exact version such as 1.3.0.`);
        s.version = v.version;
      }
      out.skills[id] = s;
    }
  }
  if (r.providers !== undefined) {
    if (!r.providers || typeof r.providers !== 'object' || Array.isArray(r.providers)) throw new AppError('VALIDATION_ERROR', 'providers must be an object.');
    out.providers = {};
    for (const [id, v] of Object.entries(r.providers as Record<string, unknown>)) {
      if (!PROVIDER_ID.test(id) || !(PROVIDER_MODES as readonly string[]).includes(v as string)) throw new AppError('VALIDATION_ERROR', `providers.${id} must be on, off, or auto.`);
      out.providers[id] = v as 'on';
    }
  }
  if (r.questions !== undefined) {
    if (!(QUESTION_PREFERENCES as readonly string[]).includes(r.questions as string)) throw new AppError('VALIDATION_ERROR', `questions must be one of: ${QUESTION_PREFERENCES.join(', ')}.`);
    out.questions = r.questions as 'prefer';
  }
  return out;
}

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

/** Constant-time comparison of two hex digests (no node:crypto in the Convex runtime). */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

/** Observed state is a typed allowlist: no raw config output or environment values. Undefined fields are omitted (Convex values). */
function sanitizeInventory(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, any>;
  const out: Record<string, unknown> = {};
  if (r.skills && typeof r.skills === 'object') {
    const skills: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(r.skills as Record<string, any>).slice(0, 500)) {
      if (!SKILL_ID.test(id)) continue;
      const e: Record<string, unknown> = {};
      if (typeof s?.enabled === 'boolean') e.enabled = s.enabled;
      if (s?.activation === 'manual' || s?.activation === 'auto') e.activation = s.activation;
      if (typeof s?.modified === 'boolean') e.modified = s.modified;
      if (typeof s?.version === 'string') e.version = s.version.slice(0, 40);
      skills[id] = e;
    }
    out.skills = skills;
  }
  if (r.providers && typeof r.providers === 'object') {
    const providers: Record<string, string> = {};
    for (const [id, v] of Object.entries(r.providers as Record<string, unknown>).slice(0, 50)) if (PROVIDER_ID.test(id) && (PROVIDER_MODES as readonly string[]).includes(v as string)) providers[id] = v as string;
    out.providers = providers;
  }
  if ((QUESTION_PREFERENCES as readonly string[]).includes(r.questions)) out.questions = r.questions;
  if (typeof r.cliVersion === 'string') out.cliVersion = r.cliVersion.slice(0, 40);
  return out;
}

/**
 * A failure whose side effects must still commit (ops.write returns it as an
 * error outcome without throwing, so the transaction is not rolled back).
 */
export interface CommittedFailure {
  __committedFailure: { ok: false; error: Record<string, unknown>; status: number } | { ok: false; scope: string[] };
}

function committedFailure(err: unknown): CommittedFailure {
  if (err instanceof ScopeError) return { __committedFailure: { ok: false, scope: err.required } };
  if (err instanceof AppError) return { __committedFailure: { ok: false, error: err.toJSON(), status: err.status } };
  throw err;
}

// ---------------------------------------------------------------- settings

/** Cloud policy and local desired/observed state. Never credentials. */
export async function settingsGet(ctx: Ctx, p: WirePrincipal, args: { projectId: string; companionId?: string; checkoutId?: string }, fresh: { freshSince?: number }) {
  const a = await authorize(ctx, p, args.projectId, p.kind === 'token' && p.resource === 'local-control' ? 'local:observe' : 'read', fresh);
  const pid = a.project.publicId;
  const desired = await ctx.db.query('controlRevisions').withIndex('by_project_revision', (q) => q.eq('projectId', pid)).order('desc').first();
  let checkouts = await ctx.db.query('checkouts').withIndex('by_project', (q) => q.eq('projectId', pid)).collect();
  if (args.companionId) checkouts = checkouts.filter((k) => k.companionId === args.companionId);
  if (args.checkoutId) checkouts = checkouts.filter((k) => k.publicId === args.checkoutId);
  const items = [];
  for (const k of checkouts) {
    const c = await ctx.db.query('companions').withIndex('by_public', (q) => q.eq('publicId', k.companionId)).unique();
    if (!c) continue;
    const op = await ctx.db.query('controlOperations').withIndex('by_project', (q) => q.eq('projectId', pid).eq('checkoutId', k.publicId)).order('desc').first();
    items.push({
      checkoutId: k.publicId,
      companionId: k.companionId,
      companionName: c.name,
      platform: c.platform,
      companionVersion: c.version,
      companionRevoked: !!c.revokedAt,
      lastSeenAt: iso(c.lastSeenAt),
      repoIdentity: k.repoIdentity,
      desiredRevision: k.desiredRevision,
      observedRevision: k.observedRevision,
      status: c.revokedAt ? 'revoked' : k.desiredRevision === k.observedRevision ? 'applied' : (op?.state ?? 'pending'),
      lastOperation: op ? { id: op.publicId, state: op.state, revision: op.revision, receipt: op.receipt ?? null, error: op.error ?? null, updatedAt: iso(op.updatedAt) } : null,
      observation: k.lastObservation ?? null,
    });
  }
  return envelope(a, {
    cloud: {
      clientWritesPaused: a.project.clientWritesPaused,
      requireStartApproval: !!a.workspace.policy.requireStartApproval,
      allowLifecycleOverride: !!a.workspace.policy.allowLifecycleOverride,
      archived: !!a.project.archivedAt,
    },
    desired: desired ? { revision: desired.revision, settings: desired.desired, createdAt: iso(desired.createdAt) } : null,
    checkouts: items,
  });
}

/**
 * Create a desired revision and one immutable operation per selected, active
 * checkout. Older pending operations are superseded, never replayed. Runs
 * inside the caller's transaction (dashboard admin or approved request).
 */
export async function createRevision(m: MutationContext, rawDesired: unknown, checkoutIds: string[] | null, approvalId: string | null) {
  const { ctx } = m;
  const desired = normalizeDesiredSettings(rawDesired);
  const pid = m.access.project.publicId;
  const last = await ctx.db.query('controlRevisions').withIndex('by_project_revision', (q) => q.eq('projectId', pid)).order('desc').first();
  const revision = (last?.revision ?? 0) + 1;
  await ctx.db.insert('controlRevisions', { projectId: pid, revision, desired, createdBy: m.access.actor.userId, approvalId: approvalId ?? undefined, createdAt: m.now });
  const selected = (id: string) => !checkoutIds?.length || checkoutIds.includes(id);
  const targets: Doc<'checkouts'>[] = [];
  for (const k of await ctx.db.query('checkouts').withIndex('by_project', (q) => q.eq('projectId', pid)).collect()) {
    if (!selected(k.publicId)) continue;
    const c = await ctx.db.query('companions').withIndex('by_public', (q) => q.eq('publicId', k.companionId)).unique();
    if (c && !c.revokedAt) targets.push(k);
  }
  for (const o of await ctx.db.query('controlOperations').withIndex('by_project', (q) => q.eq('projectId', pid)).collect()) {
    if (['pending', 'failed', 'blocked', 'unsupported'].includes(o.state) && selected(o.checkoutId)) await ctx.db.patch(o._id, { state: 'superseded', updatedAt: m.now });
  }
  const plan = planFor(desired);
  const planHash = digest(plan);
  const operations: Array<{ id: string; checkoutId: string }> = [];
  for (const k of targets) {
    const id = newId('cop');
    await ctx.db.insert('controlOperations', { publicId: id, projectId: pid, companionId: k.companionId, checkoutId: k.publicId, revision, plan, planHash, state: 'pending', attempts: 0, expiresAt: m.now + OPERATION_TTL_MS, createdAt: m.now, updatedAt: m.now });
    await ctx.db.patch(k._id, { desiredRevision: revision });
    operations.push({ id, checkoutId: k.publicId });
  }
  await m.event({ operation: 'controls.revision_created', objectType: 'control_revision', objectId: String(revision), version: revision, summary: `Desired settings revision ${revision} for ${targets.length} checkout(s)` });
  return { revision, desired, operations, pendingCheckouts: targets.length };
}

// -------------------------------------------------------------- companions

function requireLocalControl(p: WirePrincipal, message: string): asserts p is Extract<WirePrincipal, { kind: 'token' }> {
  if (p.kind !== 'token' || p.resource !== 'local-control') throw new AppError('FORBIDDEN', message);
}

/** Verify OAuth (local-control) + installation credential + current policy for every companion call. */
async function companionAccess(ctx: Ctx, p: WirePrincipal, credential: unknown, projectId: string, cap: 'local:observe' | 'local:apply', fresh: { freshSince?: number }) {
  requireLocalControl(p, 'Local-control calls need a local-control sign-in.');
  const access = await authorize(ctx, p, projectId, cap, fresh);
  if (typeof credential !== 'string' || !credential) throw new AppError('FORBIDDEN', 'This companion is not enrolled.');
  const hash = sha256Hex(credential);
  const c = await ctx.db.query('companions').withIndex('by_credential', (q) => q.eq('credentialHash', hash)).first();
  if (!c || c.workspaceId !== access.workspace.publicId || c.ownerUserId !== p.userId) throw new AppError('FORBIDDEN', 'This companion is not enrolled.');
  if (c.revokedAt) throw new AppError('FORBIDDEN', 'This companion was disconnected in the dashboard. Enroll it again to continue.');
  return { access, companion: c };
}

/** Append an activity event outside `mutate` (companion calls have no idempotency key). */
async function appendEvent(ctx: MutationCtx, access: Access, actor: unknown, e: { operation: string; objectType: string; objectId: string; version?: number; summary: string }) {
  const project = (await ctx.db.get(access.project._id))!;
  const seq = project.activitySeq + 1;
  const now = Date.now();
  await ctx.db.patch(project._id, { activitySeq: seq, updatedAt: now });
  await ctx.db.insert('activity', { projectId: project.publicId, seq, actor, operation: e.operation, objectType: e.objectType, objectId: e.objectId, objectVersion: e.version, summary: e.summary.slice(0, 500), createdAt: now });
}

async function setDesired(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  if (p.kind !== 'session') throw new AppError('FORBIDDEN', 'Connected clients request settings changes with agileflow_control_request.');
  const a = await authorize(ctx, p, input.projectId, 'admin', f);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'settings_set', requestId, payload, (m) => createRevision(m, input.desired, Array.isArray(input.checkoutIds) ? input.checkoutIds.map(String) : null, null));
}

/** Step 1 (companion, local-control token with observe scope): register the installation and the hash of a possession secret only it holds. */
async function enrollStart(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  requireLocalControl(p, 'Enrollment needs a local-control sign-in.');
  const a = await authorize(ctx, p, input.projectId, 'local:observe', f);
  if (!(COMPANION_PLATFORMS as readonly string[]).includes(input.platform)) {
    throw new AppError('UNSUPPORTED', `Companion controls support ${COMPANION_PLATFORMS.join(', ')}; ${input.platform} is not supported yet.`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(input.possessionHash)) || !/^[0-9a-f]{64}$/.test(String(input.checkoutPathHash))) throw new AppError('VALIDATION_ERROR', 'Invalid enrollment proof.');
  const caps = (Array.isArray(input.capabilities) ? input.capabilities : []).filter((c: unknown) => (COMPANION_CAPABILITIES as readonly unknown[]).includes(c)) as string[];
  const id = newId('enr');
  const expiresAt = a.now + ENROLLMENT_TTL_MS;
  await ctx.db.insert('enrollments', {
    publicId: id,
    workspaceId: a.workspace.publicId,
    userId: p.userId,
    projectId: a.project.publicId,
    possessionHash: input.possessionHash,
    request: { name: String(input.name).slice(0, 100), platform: input.platform, version: String(input.version).slice(0, 40), capabilities: caps, repoIdentity: String(input.repoIdentity).slice(0, 300), checkoutPathHash: input.checkoutPathHash },
    state: 'pending',
    expiresAt,
    createdAt: a.now,
  });
  return { enrollmentId: id, expiresAt: iso(expiresAt) };
}

/** Step 2 (dashboard): the workspace admin approves the exact request and capability limits. */
async function enrollApprove(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  if (p.kind !== 'session') throw new AppError('FORBIDDEN', 'Enrollment is approved in the dashboard.');
  const a = await authorize(ctx, p, input.projectId, 'admin', f);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'enroll_approve', requestId, payload, async (m) => {
    const e = await ctx.db.query('enrollments').withIndex('by_public', (q) => q.eq('publicId', String(input.enrollmentId))).unique();
    if (!e || e.projectId !== a.project.publicId) throw notFound('The enrollment request');
    if (e.state !== 'pending') throw new AppError('VALIDATION_ERROR', `The enrollment request is ${e.state}.`);
    if (e.expiresAt < m.now) throw new AppError('OPERATION_EXPIRED', 'The enrollment request expired; start again from the companion.');
    const requested = (e.request.capabilities ?? []) as string[];
    const caps = (Array.isArray(input.capabilities) ? input.capabilities : []).filter((c: unknown) => requested.includes(c as string)) as string[];
    await ctx.db.patch(e._id, { state: 'approved', approvedBy: p.userId, approvedCapabilities: caps });
    await m.event({ operation: 'companion.enrollment_approved', objectType: 'enrollment', objectId: e.publicId, summary: `Approved companion "${e.request.name}" (${caps.join(', ') || 'observe only'})` });
    return { enrollmentId: e.publicId, state: 'approved', capabilities: caps };
  });
}

/** Step 3 (the initiating companion): prove possession, consume the approval atomically, and receive the installation credential exactly once. */
async function enrollRedeem(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  requireLocalControl(p, 'Enrollment needs a local-control sign-in.');
  const a = await authorize(ctx, p, input.projectId, 'local:observe', f);
  const e = await ctx.db.query('enrollments').withIndex('by_public', (q) => q.eq('publicId', String(input.enrollmentId ?? ''))).unique();
  if (!e || e.projectId !== a.project.publicId || e.userId !== p.userId) throw notFound('The enrollment request');
  if (!timingSafeEqualStr(sha256Hex(String(input.possessionSecret ?? '')), e.possessionHash)) throw notFound('The enrollment request');
  if (e.state === 'pending') throw new AppError('APPROVAL_REQUIRED', 'Waiting for a workspace admin to approve this companion in the dashboard.');
  if (e.state !== 'approved') throw new AppError('OPERATION_EXPIRED', `The enrollment request is ${e.state}. Start a fresh enrollment.`);
  if (e.expiresAt < a.now) throw new AppError('OPERATION_EXPIRED', 'The enrollment approval expired. Start a fresh enrollment.');
  const credential = `afc_${randomSecret(32)}`;
  const companionId = newId('cmp');
  const capabilities = e.approvedCapabilities ?? [];
  await ctx.db.insert('companions', {
    publicId: companionId,
    workspaceId: a.workspace.publicId,
    ownerUserId: p.userId,
    name: e.request.name,
    platform: e.request.platform,
    version: e.request.version,
    capabilities,
    credentialHash: sha256Hex(credential),
    lastSeenAt: a.now,
    createdAt: a.now,
  });
  const checkoutId = newId('chk');
  await ctx.db.insert('checkouts', { publicId: checkoutId, companionId, projectId: a.project.publicId, repoIdentity: e.request.repoIdentity, checkoutPathHash: e.request.checkoutPathHash, desiredRevision: 0, observedRevision: 0 });
  await ctx.db.patch(e._id, { state: 'redeemed' });
  return { companionId, checkoutId, credential, capabilities };
}

/** Companion poll: report inventory, receive pending operations for its bound checkouts. */
async function poll(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  const { access, companion } = await companionAccess(ctx, p, input.credential, input.projectId, 'local:observe', f);
  const now = access.now;
  const version = String(input.version ?? '').slice(0, 40);
  await ctx.db.patch(companion._id, { lastSeenAt: now, version, lastInventory: sanitizeInventory(input.inventory) });
  const supported = versionAtLeast(version, MIN_COMPANION_VERSION);
  // Expire stale operations before delivery.
  for (const o of await ctx.db.query('controlOperations').withIndex('by_companion_state', (q) => q.eq('companionId', companion.publicId).eq('state', 'pending')).collect()) {
    if (o.expiresAt < now) await ctx.db.patch(o._id, { state: 'expired', updatedAt: now });
    else if (!supported) await ctx.db.patch(o._id, { state: 'unsupported', error: { code: 'REQUIRED_UPGRADE', message: `Upgrade the companion to ${MIN_COMPANION_VERSION} or later.` }, updatedAt: now });
  }
  if (supported) {
    // A compatible upgrade lets unexpired, unsuperseded unsupported operations retry after fresh checks.
    for (const o of await ctx.db.query('controlOperations').withIndex('by_companion_state', (q) => q.eq('companionId', companion.publicId).eq('state', 'unsupported')).collect()) {
      if (o.error?.code === 'REQUIRED_UPGRADE' && o.expiresAt > now) await ctx.db.patch(o._id, { state: 'pending', error: undefined, updatedAt: now });
    }
  }
  const operations = [];
  if (supported) {
    const pending = (await ctx.db.query('controlOperations').withIndex('by_companion_state', (q) => q.eq('companionId', companion.publicId).eq('state', 'pending')).collect())
      .filter((o) => o.projectId === access.project.publicId)
      .sort((x, y) => x.revision - y.revision);
    for (const o of pending) {
      const k = await ctx.db.query('checkouts').withIndex('by_public', (q) => q.eq('publicId', o.checkoutId)).unique();
      if (!k) continue;
      operations.push({ id: o.publicId, checkoutId: o.checkoutId, revision: o.revision, plan: o.plan, planHash: o.planHash, expiresAt: iso(o.expiresAt), binding: { repoIdentity: k.repoIdentity, checkoutPathHash: k.checkoutPathHash } });
    }
  }
  return { companionId: companion.publicId, supported, minimumVersion: MIN_COMPANION_VERSION, capabilities: companion.capabilities, operations };
}

async function ownOperation(ctx: Ctx, companionId: string, projectId: string, operationId: unknown) {
  const op = await ctx.db.query('controlOperations').withIndex('by_public', (q) => q.eq('publicId', String(operationId ?? ''))).unique();
  if (!op || op.companionId !== companionId || op.projectId !== projectId) throw notFound('The operation');
  return op;
}

/**
 * Immediately before applying: fresh authorization and a current, unsuperseded
 * operation. State changes that accompany a refusal (expired, unsupported) are
 * committed and the refusal returned as an error outcome.
 */
async function begin(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  const { access, companion } = await companionAccess(ctx, p, input.credential, input.projectId, 'local:apply', f);
  const op = await ownOperation(ctx, companion.publicId, access.project.publicId, input.operationId);
  if (op.state !== 'pending' && op.state !== 'failed') throw new AppError('OPERATION_EXPIRED', `The operation is ${op.state}; do not apply it.`);
  if (op.expiresAt < access.now) {
    await ctx.db.patch(op._id, { state: 'expired', updatedAt: access.now });
    return committedFailure(new AppError('OPERATION_EXPIRED', 'The operation expired; do not apply it.'));
  }
  if (op.planHash !== input.planHash) throw new AppError('VERSION_CONFLICT', 'The plan changed; fetch operations again.');
  const missing = [...new Set((op.plan.steps as Array<{ capability: string }>).filter((s) => !companion.capabilities.includes(s.capability)).map((s) => s.capability))];
  if (missing.length) {
    await ctx.db.patch(op._id, { state: 'unsupported', error: { code: 'CAPABILITY_NOT_ENROLLED', message: `Not enrolled for: ${missing.join(', ')}` }, updatedAt: access.now });
    return committedFailure(new AppError('UNSUPPORTED', `This companion is not enrolled for: ${missing.join(', ')}.`));
  }
  await ctx.db.patch(op._id, { state: 'applying', attempts: op.attempts + 1, updatedAt: access.now });
  return { operationId: op.publicId, state: 'applying' };
}

/**
 * Receipt: per-target results. observedRevision advances only when every
 * target applied. After revocation (or any access failure) the receipt is
 * refused, but an applying operation is marked 'unknown' first: that write
 * must commit, so the refusal is returned as a committed error outcome
 * instead of being thrown (a throw would roll the transaction back).
 */
async function receipt(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  let companion: Doc<'companions'>;
  let access: Access;
  try {
    ({ access, companion } = await companionAccess(ctx, p, input.credential, input.projectId, 'local:apply', f));
  } catch (err) {
    if (!(err instanceof AppError) && !(err instanceof ScopeError)) throw err;
    const op = await ctx.db.query('controlOperations').withIndex('by_public', (q) => q.eq('publicId', String(input.operationId ?? ''))).unique();
    if (op && op.projectId === input.projectId && op.state === 'applying') await ctx.db.patch(op._id, { state: 'unknown', updatedAt: Date.now() });
    return committedFailure(err);
  }
  if (!(RECEIPT_STATES as readonly string[]).includes(input.state)) throw new AppError('VALIDATION_ERROR', `state must be one of: ${RECEIPT_STATES.join(', ')}.`);
  const results = (Array.isArray(input.results) ? input.results : [])
    .slice(0, 200)
    .map((r: any) => ({ target: String(r?.target).slice(0, 200), outcome: String(r?.outcome).slice(0, 40), ...(r?.detail ? { detail: String(r.detail).slice(0, 500) } : {}) }));
  const allApplied = input.state === 'applied' && results.every((r: { outcome: string }) => r.outcome === 'applied' || r.outcome === 'unchanged');
  const state = input.state === 'applied' && !allApplied ? 'blocked' : (input.state as string);
  const op = await ownOperation(ctx, companion.publicId, access.project.publicId, input.operationId);
  if (op.state !== 'applying') throw new AppError('VALIDATION_ERROR', `The operation is ${op.state}, not applying.`);
  const rcpt = { companionId: companion.publicId, checkoutId: op.checkoutId, planHash: op.planHash, results, reloadRequired: !!input.reloadRequired, at: iso(access.now) };
  await ctx.db.patch(op._id, { state, receipt: rcpt, updatedAt: access.now });
  if (state === 'applied') {
    const k = await ctx.db.query('checkouts').withIndex('by_public', (q) => q.eq('publicId', op.checkoutId)).unique();
    if (k) await ctx.db.patch(k._id, { observedRevision: Math.max(k.observedRevision, op.revision), lastObservation: sanitizeInventory(input.observation) });
  }
  await appendEvent(ctx, access, { kind: 'companion', userId: access.principal.userId, companionId: companion.publicId }, {
    operation: `controls.${state}`,
    objectType: 'control_operation',
    objectId: op.publicId,
    version: op.revision,
    summary: `Companion "${companion.name}" reported ${state} for revision ${op.revision}`,
  });
  return { operationId: op.publicId, state, observedAdvanced: state === 'applied' };
}

/** Dashboard: disconnect a companion (revokes its credential and queued operations). The credential hash is kept so the companion gets the specific "disconnected" message. */
async function revokeCompanion(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, f: { freshSince?: number }) {
  if (p.kind !== 'session') throw new AppError('FORBIDDEN', 'Companions are disconnected in the dashboard.');
  const a = await authorize(ctx, p, input.projectId, 'admin', f);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'companion_revoke', requestId, payload, async (m) => {
    const c = await ctx.db.query('companions').withIndex('by_public', (q) => q.eq('publicId', String(input.companionId ?? ''))).unique();
    if (!c || c.workspaceId !== a.workspace.publicId) throw notFound('The companion');
    await ctx.db.patch(c._id, { revokedAt: m.now });
    let cancelled = 0;
    for (const state of ['pending', 'failed', 'unsupported']) {
      for (const o of await ctx.db.query('controlOperations').withIndex('by_companion_state', (q) => q.eq('companionId', c.publicId).eq('state', state)).collect()) {
        await ctx.db.patch(o._id, { state: 'cancelled', updatedAt: m.now });
        cancelled++;
      }
    }
    await m.event({ operation: 'companion.revoked', objectType: 'companion', objectId: c.publicId, summary: `Disconnected companion "${c.name}"; ${cancelled} queued operation(s) cancelled` });
    return { companionId: c.publicId, revoked: true, cancelledOperations: cancelled };
  });
}

async function listEnrollments(ctx: Ctx, p: WirePrincipal, input: { projectId: string }, f: { freshSince?: number }) {
  const a = await authorize(ctx, p, input.projectId, 'admin', f);
  const pid = a.project.publicId;
  const now = Date.now();
  const rows = (await ctx.db.query('enrollments').withIndex('by_project_created', (q) => q.eq('projectId', pid)).order('desc').collect()).filter(
    (r) => (r.state === 'pending' || r.state === 'approved') && r.expiresAt > now,
  );
  const seen = new Map<string, Doc<'companions'>>();
  for (const k of await ctx.db.query('checkouts').withIndex('by_project', (q) => q.eq('projectId', pid)).collect()) {
    if (seen.has(k.companionId)) continue;
    const c = await ctx.db.query('companions').withIndex('by_public', (q) => q.eq('publicId', k.companionId)).unique();
    if (c) seen.set(c.publicId, c);
  }
  const companions = [...seen.values()].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return envelope(a, {
    pending: rows.map((r) => ({ id: r.publicId, userId: r.userId, request: r.request, state: r.state, expiresAt: iso(r.expiresAt) })),
    companions: companions.map((c) => ({ id: c.publicId, name: c.name, platform: c.platform, version: c.version, capabilities: c.capabilities, revoked: !!c.revokedAt, lastSeenAt: iso(c.lastSeenAt), ownerUserId: c.ownerUserId, supported: versionAtLeast(c.version, MIN_COMPANION_VERSION) })),
    minimumVersion: MIN_COMPANION_VERSION,
  });
}

export const READ_OPS: Record<string, ReadOp> = {
  agileflow_settings_get: (ctx, p, a, f) => settingsGet(ctx, p, a, f),
  'controls.listEnrollments': (ctx, p, a, f) => listEnrollments(ctx, p, a, f),
};

export const WRITE_OPS: Record<string, WriteOp> = {
  'controls.setDesired': setDesired,
  'controls.enrollStart': enrollStart,
  'controls.enrollRedeem': enrollRedeem,
  'controls.enrollApprove': enrollApprove,
  'controls.revokeCompanion': revokeCompanion,
  'controls.poll': poll,
  'controls.begin': begin,
  'controls.receipt': receipt,
};
