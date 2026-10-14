import type { Doc } from '../_generated/dataModel';
import { AppError, notFound } from '../../src/domain/errors';
import { authorize, clampLimit, cursorContext, cursors, envelope, mutate, requireScope, type Access, type Ctx, type MutationContext, type MutationCtx, type WirePrincipal } from '../lib/core';
import { digest, newId } from '../lib/util';
import type { ReadOp, WriteOp } from '../ops';
import { createRevision, normalizeDesiredSettings } from './controls';
import * as work from './work';

export const NOTE_KINDS = ['comment', 'progress', 'blocker', 'handoff', 'decision-proposal', 'correction'] as const;
export const RUN_STATES = ['planning', 'running', 'blocked', 'awaiting-review', 'completed', 'failed', 'cancelled'] as const;
export const NONTERMINAL_RUN_STATES = ['planning', 'running', 'blocked', 'awaiting-review'] as const;
export const TERMINAL_RUN_STATES = ['completed', 'failed', 'cancelled'] as const;
export const APPROVAL_KINDS = ['settings_change', 'execution_start', 'lifecycle_override', 'claim_override'] as const;
export const MAX_NOTE = 10_000;
export const CLAIM_LEASE_SEC = 300;
export const CLAIM_RENEW_MIN_INTERVAL_SEC = 60;
export const RUN_STALE_SEC = 90;
export const APPROVAL_TTL_MS = 24 * 3600_000;
/** Bounded scan per list request (filters are applied in order over the index). */
const SCAN_MAX = 4000;

type NoteRow = Doc<'notes'>;
type RunRow = Doc<'runs'>;
type ClaimRow = Doc<'claims'>;
type ApprovalRow = Doc<'approvals'>;
type Fresh = { freshSince?: number };

export interface Evidence {
  kind: 'pr' | 'commit' | 'ci' | 'link' | 'test-report';
  url?: string;
  summary?: string;
  /** Agent-reported unless an integration verified it. */
  provenance: 'reported' | 'verified';
}

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
const isTerminal = (state: string) => (TERMINAL_RUN_STATES as readonly string[]).includes(state);

function noteDto(n: NoteRow) {
  return {
    id: n.publicId,
    workId: n.workId ?? null,
    runId: n.runId ?? null,
    kind: n.kind,
    body: n.redactedAt ? '[redacted]' : n.body,
    redacted: !!n.redactedAt,
    author: n.author,
    correctsNoteId: n.correctsNoteId ?? null,
    promotedDecisionId: n.promotedDecisionId ?? null,
    version: n.version,
    createdAt: iso(n.createdAt),
    updatedAt: iso(n.updatedAt),
  };
}

export function runDto(r: RunRow, now: number) {
  return {
    id: r.publicId,
    connectionId: r.connectionId,
    workIds: r.workIds,
    name: r.name,
    intent: r.intent,
    state: r.state,
    summary: r.summary ?? null,
    blocker: r.blocker ?? null,
    evidence: r.evidence,
    version: r.version,
    startedAt: iso(r.startedAt),
    lastReportAt: iso(r.lastReportAt),
    endedAt: iso(r.endedAt),
    /** Overlay: the last report is old. The reported state is unchanged; this is not proof the work stopped. */
    stale: !isTerminal(r.state) && now - r.lastReportAt > RUN_STALE_SEC * 1000,
    cancellation: r.cancelRequestedAt ? { requestedAt: iso(r.cancelRequestedAt), acknowledgedAt: iso(r.cancelAcknowledgedAt) } : null,
  };
}

function claimDto(c: ClaimRow, now: number) {
  return {
    id: c.publicId,
    storyId: c.storyId,
    runId: c.runId,
    connectionId: c.connectionId,
    generation: c.generation,
    version: c.version,
    expiresAt: iso(c.expiresAt),
    active: !c.releasedAt && c.expiresAt > now,
    releasedAt: iso(c.releasedAt),
    releaseReason: c.releaseReason ?? null,
  };
}

export function approvalDto(a: ApprovalRow) {
  return {
    id: a.publicId,
    kind: a.kind,
    state: a.state,
    proposal: a.proposal,
    reason: a.reason,
    requestedByUser: a.requestedByUser,
    requestedByConnection: a.requestedByConnection ?? null,
    decidedBy: a.decidedBy ?? null,
    expiresAt: iso(a.expiresAt),
    createdAt: iso(a.createdAt),
  };
}

function checkText(name: string, v: unknown, max: number, required = true): string | null {
  if (v === undefined || v === null) {
    if (required) throw new AppError('VALIDATION_ERROR', `${name} is required.`);
    return null;
  }
  if (typeof v !== 'string' || (required && !v.trim())) throw new AppError('VALIDATION_ERROR', `${name} must be non-empty text.`);
  if (v.length > max) throw new AppError('VALIDATION_ERROR', `${name} must be at most ${max} characters.`);
  return v;
}

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

function checkEvidence(list: unknown): Evidence[] {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 20) throw new AppError('VALIDATION_ERROR', 'evidence must be a list of at most 20 items.');
  return list.map((e) => {
    const kind = (e as Evidence)?.kind;
    if (!['pr', 'commit', 'ci', 'link', 'test-report'].includes(kind)) throw new AppError('VALIDATION_ERROR', 'evidence kind must be pr, commit, ci, link, or test-report.');
    const url = (e as Evidence).url;
    if (url !== undefined && (typeof url !== 'string' || !SAFE_URL.test(url) || url.length > 2000)) throw new AppError('VALIDATION_ERROR', 'evidence url must be an http(s) URL.');
    const summary = checkText('evidence summary', (e as Evidence).summary, 1000, false) ?? undefined;
    // Clients cannot mark their own evidence verified.
    return { kind, ...(url ? { url } : {}), ...(summary ? { summary } : {}), provenance: 'reported' as const };
  });
}

const byPublic = {
  note: (ctx: Ctx, id: unknown) => ctx.db.query('notes').withIndex('by_public', (q) => q.eq('publicId', String(id ?? ''))).unique(),
  run: (ctx: Ctx, id: unknown) => ctx.db.query('runs').withIndex('by_public', (q) => q.eq('publicId', String(id ?? ''))).unique(),
  claim: (ctx: Ctx, id: unknown) => ctx.db.query('claims').withIndex('by_public', (q) => q.eq('publicId', String(id ?? ''))).unique(),
  approval: (ctx: Ctx, id: unknown) => ctx.db.query('approvals').withIndex('by_public', (q) => q.eq('publicId', String(id ?? ''))).unique(),
};

async function ownRun(m: MutationContext, runId: unknown): Promise<RunRow> {
  if (typeof runId !== 'string') throw new AppError('VALIDATION_ERROR', 'runId is required.');
  const run = await byPublic.run(m.ctx, runId);
  if (!run || run.projectId !== m.access.project.publicId || run.connectionId !== m.access.connection?.publicId) throw notFound('The run');
  return run;
}

async function displayName(ctx: Ctx, userId: string): Promise<string | null> {
  return (await ctx.db.query('users').withIndex('by_user', (q) => q.eq('clerkUserId', userId)).unique())?.displayName ?? null;
}

/**
 * Consume an approved request bound to this exact operation (single use).
 * Runs inside the caller's transaction, so a failed operation leaves it unused.
 */
export async function consumeApproval(m: MutationContext, approvalId: string | undefined, kind: string, binding: Record<string, unknown>): Promise<string> {
  if (!approvalId) throw new AppError('APPROVAL_REQUIRED', `This needs a ${kind} approval. Request one with agileflow_control_request; a person approves it in the dashboard.`);
  const a = await byPublic.approval(m.ctx, approvalId);
  if (!a || a.projectId !== m.access.project.publicId || a.kind !== kind) throw notFound('The approval');
  const requester = m.access.connection ? a.requestedByConnection === m.access.connection.publicId : a.requestedByUser === m.access.actor.userId;
  if (!requester) throw notFound('The approval');
  if (a.state === 'consumed') throw new AppError('APPROVAL_REQUIRED', 'That approval was already used. Request a new one.');
  if (a.state !== 'approved') throw new AppError('APPROVAL_REQUIRED', `That approval is ${a.state}, not approved.`);
  if (a.expiresAt < m.now) throw new AppError('OPERATION_EXPIRED', 'That approval expired. Request a new one.');
  for (const [k, v] of Object.entries(binding)) {
    if (JSON.stringify(a.proposal[k]) !== JSON.stringify(v)) {
      throw new AppError('APPROVAL_REQUIRED', `The approved request does not match this operation (${k} changed). Request a fresh approval for the current state.`);
    }
  }
  await m.ctx.db.patch(a._id, { state: 'consumed', consumedAt: m.now });
  await m.event({ operation: 'approval.consumed', objectType: 'approval', objectId: a.publicId, summary: `Used ${kind} approval ${a.publicId}` });
  return a.publicId;
}

// ------------------------------------------------------------------ notes

async function noteList(ctx: Ctx, p: WirePrincipal, { projectId, cursor, limit, ...f }: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, projectId, 'read', fresh);
  const pid = a.project.publicId;
  const n = clampLimit(limit);
  const codec = cursors();
  const key = cursorContext(a, 'notes', f);
  let after: { t: number; c: number } | null = null;
  if (cursor) {
    after = codec.decode(key, cursor) as { t: number; c: number } | null;
    if (!after) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this listing.');
  }
  const workId = f.workId ? String(f.workId).toUpperCase() : undefined;
  const q = workId
    ? ctx.db.query('notes').withIndex('by_project_work', (ix) => (after ? ix.eq('projectId', pid).eq('workId', workId).gte('createdAt', after.t) : ix.eq('projectId', pid).eq('workId', workId)))
    : f.runId
      ? ctx.db.query('notes').withIndex('by_project_run', (ix) => (after ? ix.eq('projectId', pid).eq('runId', String(f.runId)).gte('createdAt', after.t) : ix.eq('projectId', pid).eq('runId', String(f.runId))))
      : ctx.db.query('notes').withIndex('by_project_created', (ix) => (after ? ix.eq('projectId', pid).gte('createdAt', after.t) : ix.eq('projectId', pid)));
  const out: NoteRow[] = [];
  let more = false;
  let scanned = 0;
  let lastScanned: NoteRow | null = null;
  for await (const r of q) {
    if (after && r.createdAt === after.t && r._creationTime <= after.c) continue;
    scanned++;
    if ((!f.runId || r.runId === f.runId) && (!f.kind || r.kind === f.kind)) {
      if (out.length === n) {
        more = true;
        break;
      }
      out.push(r);
    }
    lastScanned = r;
    if (scanned >= SCAN_MAX) {
      more = true;
      break;
    }
  }
  const last = more && out.length === n ? out[n - 1] : lastScanned;
  return envelope(a, { items: out.map(noteDto), hasMore: more, nextCursor: more && last ? codec.encode(key, { t: last.createdAt, c: last._creationTime }) : null });
}

async function noteAdd(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'notes:write', fresh);
  if (!(NOTE_KINDS as readonly string[]).includes(input.kind)) throw new AppError('VALIDATION_ERROR', `kind must be one of: ${NOTE_KINDS.join(', ')}.`);
  const body = checkText('body', input.body, MAX_NOTE)!;
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'note_add', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const workId = input.workId ? (await work.getRow(ctx, pid, input.workId)).nativeId : undefined;
    if (input.runId) {
      const run = await byPublic.run(ctx, input.runId);
      // A client can attach notes only to runs reported under its own connection.
      if (!run || run.projectId !== pid || (a.connection && run.connectionId !== a.connection.publicId)) throw notFound('The run');
    }
    if (input.correctsNoteId) {
      const c = await byPublic.note(ctx, input.correctsNoteId);
      if (!c || c.projectId !== pid) throw notFound('The corrected note');
    }
    const author = { ...a.actor, name: await displayName(ctx, a.actor.userId) };
    const id = newId('note');
    const docId = await ctx.db.insert('notes', {
      publicId: id,
      projectId: pid,
      workId,
      runId: input.runId ?? undefined,
      kind: input.kind,
      body,
      author,
      correctsNoteId: input.correctsNoteId ?? undefined,
      version: 1,
      createdAt: m.now,
      updatedAt: m.now,
    });
    await m.revision('note', id, 1, { body }, 'create');
    await m.event({ operation: 'note.added', objectType: 'note', objectId: id, version: 1, summary: `${input.kind} note${workId ? ` on ${workId}` : ''}` });
    return noteDto((await ctx.db.get(docId))!);
  });
}

/** Dashboard: a person revises their own note (versioned). Agents append corrections instead. */
async function noteEdit(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  if (p.kind !== 'session') throw new AppError('FORBIDDEN', 'Connected clients append a correction instead of editing a note.');
  const a = await authorize(ctx, p, input.projectId, 'notes:write', fresh);
  const body = checkText('body', input.body, MAX_NOTE)!;
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'note_edit', requestId, payload, async (m) => {
    const n = await byPublic.note(ctx, input.noteId);
    if (!n || n.projectId !== a.project.publicId) throw notFound('The note');
    const author = n.author as { userId?: string; kind?: string };
    if (author.userId !== p.userId || author.kind !== 'user') throw new AppError('FORBIDDEN', 'You can only edit your own notes.');
    if (n.redactedAt) throw new AppError('FORBIDDEN', 'A redacted note cannot be edited.');
    if (n.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 'The note changed.', { currentVersion: n.version });
    await ctx.db.patch(n._id, { body, version: n.version + 1, updatedAt: m.now });
    await m.revision('note', n.publicId, n.version + 1, { body }, 'edit');
    await m.event({ operation: 'note.edited', objectType: 'note', objectId: n.publicId, version: n.version + 1, summary: 'Edited a note' });
    return noteDto((await ctx.db.get(n._id))!);
  });
}

/** Admin redaction: removes the body from the note, its revisions, and (because exports read these rows) future exports. */
async function noteRedact(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'admin', fresh);
  const reason = checkText('reason', input.reason, 500)!;
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'note_redact', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const n = await byPublic.note(ctx, input.noteId);
    if (!n || n.projectId !== pid) throw notFound('The note');
    await ctx.db.patch(n._id, { body: '', redactedAt: m.now, version: n.version + 1, updatedAt: m.now });
    for (const r of await ctx.db.query('revisions').withIndex('by_object', (q) => q.eq('projectId', pid).eq('objectType', 'note').eq('objectId', n.publicId)).collect()) {
      await ctx.db.patch(r._id, { snapshot: { redacted: true } });
    }
    await m.event({ operation: 'note.redacted', objectType: 'note', objectId: n.publicId, summary: `Redacted a note: ${reason}` });
    return { noteId: n.publicId, redacted: true };
  });
}

/**
 * Promote a decision-proposal note into a proposed decision linked to the
 * note. The decision is created with work.create semantics (its own
 * `${requestId}:decision` idempotency receipt, revision, and event) in the
 * same transaction as the link, so either both happen or neither does.
 */
async function notePromote(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'work:write', fresh);
  const { requestId, ...payload } = input;
  const pid = a.project.publicId;
  const prior =
    typeof requestId === 'string' &&
    (await ctx.db
      .query('idempotency')
      .withIndex('by_key', (q) => q.eq('principalKey', a.principalKey).eq('projectId', pid).eq('operation', 'note_promote').eq('requestKey', requestId))
      .unique());
  // A retried promotion replays its receipt (or reports the key conflict) before re-validating the note.
  if (prior) return mutate(ctx, a, 'note_promote', requestId, payload, async () => null);
  const n = await byPublic.note(ctx, input.noteId);
  if (!n || n.projectId !== pid || n.redactedAt) throw notFound('The note');
  if (n.kind !== 'decision-proposal') throw new AppError('VALIDATION_ERROR', 'Only decision-proposal notes can be promoted.');
  if (n.promotedDecisionId) throw new AppError('VALIDATION_ERROR', `Already promoted to ${n.promotedDecisionId}.`);
  // Runs before the outer mutate so each keeps a consistent activity sequence.
  const decision = await work.create(ctx, a, { projectId: pid, kind: 'decision', title: input.title, body: `${n.body}\n\n_Promoted from note ${n.publicId}._\n`, requestId: `${requestId}:decision` });
  return mutate(ctx, a, 'note_promote', requestId, payload, async (m) => {
    await ctx.db.patch(n._id, { promotedDecisionId: decision.data.id, updatedAt: m.now });
    await m.event({ operation: 'note.promoted', objectType: 'note', objectId: n.publicId, summary: `Promoted to proposed decision ${decision.data.id}` });
    return { noteId: n.publicId, decisionId: decision.data.id };
  });
}

// --------------------------------------------------------------- activity

async function activityList(ctx: Ctx, p: WirePrincipal, { projectId, cursor, limit, ...f }: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, projectId, 'read', fresh);
  const pid = a.project.publicId;
  const n = clampLimit(limit);
  const codec = cursors();
  const key = cursorContext(a, 'activity', f);
  let after = typeof f.sinceSeq === 'number' ? f.sinceSeq : 0;
  if (cursor) {
    const c = codec.decode(key, cursor) as { s: number } | null;
    if (!c) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this listing.');
    after = c.s;
  }
  const q = f.objectId
    ? ctx.db.query('activity').withIndex('by_project_object', (ix) => ix.eq('projectId', pid).eq('objectId', String(f.objectId)).gt('seq', after))
    : ctx.db.query('activity').withIndex('by_project_seq', (ix) => ix.eq('projectId', pid).gt('seq', after));
  const out: Doc<'activity'>[] = [];
  let more = false;
  let scanned = 0;
  let lastSeq = after;
  for await (const r of q) {
    scanned++;
    if ((!f.actorUserId || (r.actor as { userId?: string })?.userId === f.actorUserId) && (!f.operation || r.operation.startsWith(String(f.operation)))) {
      if (out.length === n) {
        more = true;
        break;
      }
      out.push(r);
    }
    lastSeq = r.seq;
    if (scanned >= SCAN_MAX) {
      more = true;
      break;
    }
  }
  const cursorSeq = more && out.length === n ? out[n - 1]!.seq : lastSeq;
  return envelope(a, {
    items: out.map((r) => ({ seq: r.seq, actor: r.actor, operation: r.operation, objectType: r.objectType, objectId: r.objectId, objectVersion: r.objectVersion ?? null, summary: r.summary, at: iso(r.createdAt) })),
    hasMore: more,
    nextCursor: more ? codec.encode(key, { s: cursorSeq }) : null,
    latestSeq: a.project.activitySeq,
  });
}

// ------------------------------------------------------------------- runs

async function runStart(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  if (!a.connection) throw new AppError('FORBIDDEN', 'Runs are reported by connected agents and CLIs.');
  const name = checkText('name', input.name, 200)!;
  const intent = checkText('intent', input.intent, 2000)!;
  const workIds = [...new Set(((input.workIds ?? []) as unknown[]).map((w) => String(w).trim().toUpperCase()))].sort();
  if (workIds.length > 20) throw new AppError('VALIDATION_ERROR', 'A run may name at most 20 work items.');
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'run_start', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const versions: Record<string, number> = {};
    for (const id of workIds) versions[id] = (await work.getRow(ctx, pid, id)).version;
    let approvalId: string | undefined;
    if (a.workspace.policy.requireStartApproval) approvalId = await consumeApproval(m, input.approvalId, 'execution_start', { workIds, intent, workVersions: versions });
    const id = newId('run');
    const docId = await ctx.db.insert('runs', {
      publicId: id,
      projectId: pid,
      connectionId: a.connection!.publicId,
      workIds,
      name,
      intent,
      state: 'planning',
      evidence: [],
      approvalId,
      version: 1,
      startedAt: m.now,
      lastReportAt: m.now,
    });
    await m.event({ operation: 'run.started', objectType: 'run', objectId: id, version: 1, summary: `Run started: ${name}${workIds.length ? ` (${workIds.join(', ')})` : ''}` });
    return runDto((await ctx.db.get(docId))!, m.now);
  });
}

async function runReport(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  if (input.state !== undefined && !(NONTERMINAL_RUN_STATES as readonly string[]).includes(input.state)) {
    throw new AppError('VALIDATION_ERROR', `run_report accepts ${NONTERMINAL_RUN_STATES.join(', ')}; finish a run with agileflow_run_finish.`);
  }
  const summary = checkText('summary', input.summary, 2000, false);
  const blocker = checkText('blocker', input.blocker, 2000, false);
  const evidence = checkEvidence(input.evidence);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'run_report', requestId, payload, async (m) => {
    const run = await ownRun(m, input.runId);
    if (isTerminal(run.state)) throw new AppError('VALIDATION_ERROR', `The run already ended (${run.state}).`);
    if (run.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 'The run changed (for example, a cancellation was requested). Reload it.', { currentVersion: run.version });
    await ctx.db.patch(run._id, {
      state: input.state ?? run.state,
      summary: summary ?? run.summary,
      blocker: input.blocker === undefined ? run.blocker : (blocker ?? undefined),
      evidence: [...run.evidence, ...evidence],
      lastReportAt: m.now,
      version: run.version + 1,
    });
    const updated = (await ctx.db.get(run._id))!;
    // Heartbeats without a state change are compacted into lastReportAt, not the activity feed.
    if ((input.state && input.state !== run.state) || blocker) {
      await m.event({ operation: 'run.reported', objectType: 'run', objectId: run.publicId, version: updated.version, summary: `Run ${updated.state}${blocker ? `: blocked - ${blocker.slice(0, 200)}` : summary ? `: ${summary.slice(0, 200)}` : ''}` });
    }
    return { run: runDto(updated, m.now), pendingActions: updated.cancelRequestedAt && !updated.cancelAcknowledgedAt ? [{ kind: 'cancel', requestedAt: iso(updated.cancelRequestedAt) }] : [] };
  });
}

async function runFinish(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  if (!(TERMINAL_RUN_STATES as readonly string[]).includes(input.outcome)) throw new AppError('VALIDATION_ERROR', `outcome must be one of: ${TERMINAL_RUN_STATES.join(', ')}.`);
  const summary = checkText('summary', input.summary, 2000)!;
  const evidence = checkEvidence(input.evidence);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'run_finish', requestId, payload, async (m) => {
    const run = await ownRun(m, input.runId);
    if (isTerminal(run.state)) throw new AppError('VALIDATION_ERROR', `The run already ended (${run.state}).`);
    if (run.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 'The run changed. Reload it.', { currentVersion: run.version });
    await ctx.db.patch(run._id, {
      state: input.outcome,
      summary,
      evidence: [...run.evidence, ...evidence],
      endedAt: m.now,
      lastReportAt: m.now,
      cancelAcknowledgedAt: run.cancelRequestedAt ? m.now : undefined,
      version: run.version + 1,
    });
    const releasedClaims: string[] = [];
    for (const c of await ctx.db.query('claims').withIndex('by_run_active', (q) => q.eq('runId', run.publicId).eq('active', true)).collect()) {
      await ctx.db.patch(c._id, { active: false, releasedAt: m.now, releaseReason: 'run finished', version: c.version + 1 });
      releasedClaims.push(c.publicId);
    }
    // Finishing a run does not change any story's status or acceptance criteria.
    const updated = (await ctx.db.get(run._id))!;
    await m.event({ operation: 'run.finished', objectType: 'run', objectId: run.publicId, version: updated.version, summary: `Run ${input.outcome}: ${summary.slice(0, 200)}` });
    return { run: runDto(updated, m.now), releasedClaims };
  });
}

async function runList(ctx: Ctx, p: WirePrincipal, { projectId, cursor, limit, ...f }: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, projectId, 'read', fresh);
  const pid = a.project.publicId;
  const n = clampLimit(limit);
  const codec = cursors();
  const key = cursorContext(a, 'runs', f);
  let after: { t: number; c: number } | null = null;
  if (cursor) {
    after = codec.decode(key, cursor) as { t: number; c: number } | null;
    if (!after) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this listing.');
  }
  const workId = f.workId ? String(f.workId).toUpperCase() : null;
  const q = ctx.db
    .query('runs')
    .withIndex('by_project_started', (ix) => (after ? ix.eq('projectId', pid).lte('startedAt', after.t) : ix.eq('projectId', pid)))
    .order('desc');
  const out: RunRow[] = [];
  let more = false;
  let scanned = 0;
  let lastScanned: RunRow | null = null;
  for await (const r of q) {
    if (after && r.startedAt === after.t && r._creationTime >= after.c) continue;
    scanned++;
    if ((!workId || r.workIds.includes(workId)) && (!f.state || r.state === f.state) && (!f.connectionId || r.connectionId === f.connectionId)) {
      if (out.length === n) {
        more = true;
        break;
      }
      out.push(r);
    }
    lastScanned = r;
    if (scanned >= SCAN_MAX) {
      more = true;
      break;
    }
  }
  const last = more && out.length === n ? out[n - 1] : lastScanned;
  const now = Date.now();
  return envelope(a, { items: out.map((r) => runDto(r, now)), hasMore: more, nextCursor: more && last ? codec.encode(key, { t: last.startedAt, c: last._creationTime }) : null });
}

/** Dashboard: request cooperative cancellation. Never claims the external process stopped. */
async function runCancel(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  if (p.kind !== 'session') throw new AppError('FORBIDDEN', 'Cancellation is requested from the dashboard.');
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'run_cancel', requestId, payload, async (m) => {
    const run = await byPublic.run(ctx, input.runId);
    if (!run || run.projectId !== a.project.publicId) throw notFound('The run');
    if (isTerminal(run.state)) throw new AppError('VALIDATION_ERROR', `The run already ended (${run.state}).`);
    if (run.cancelRequestedAt) return runDto(run, m.now);
    await ctx.db.patch(run._id, { cancelRequestedAt: m.now, cancelRequestedBy: p.userId, version: run.version + 1 });
    const updated = (await ctx.db.get(run._id))!;
    await m.event({ operation: 'run.cancel_requested', objectType: 'run', objectId: run.publicId, version: updated.version, summary: `Cancellation requested for ${run.name}` });
    return runDto(updated, m.now);
  });
}

// ----------------------------------------------------------------- claims

/** Convex mutations are serializable: two concurrent acquires conflict on this read set and one retries against the winner. */
async function claimAcquire(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  const duration = Math.min(CLAIM_LEASE_SEC, Math.max(30, Math.floor(typeof input.durationSec === 'number' ? input.durationSec : CLAIM_LEASE_SEC)));
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'claim_acquire', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const run = await ownRun(m, input.runId);
    if (!(NONTERMINAL_RUN_STATES as readonly string[]).includes(run.state)) throw new AppError('VALIDATION_ERROR', 'Claims need an active run.');
    const story = await work.getRow(ctx, pid, input.storyId);
    if (story.type !== 'story') throw new AppError('VALIDATION_ERROR', 'Only stories can be claimed.');
    const current = await ctx.db.query('claims').withIndex('by_project_story_active', (q) => q.eq('projectId', pid).eq('storyId', story.nativeId).eq('active', true)).first();
    if (current) {
      if (current.expiresAt > m.now) {
        const holder = await byPublic.run(ctx, current.runId);
        throw new AppError('CLAIM_CONFLICT', `${story.nativeId} is claimed by run "${holder?.name ?? current.runId}" until ${iso(current.expiresAt)}. Pick other work or request a claim override.`, {
          claim: claimDto(current, m.now),
        });
      }
      await ctx.db.patch(current._id, { active: false, releasedAt: m.now, releaseReason: 'expired', version: current.version + 1 });
    }
    const generation = story.claimGeneration + 1;
    await ctx.db.patch(story._id, { claimGeneration: generation });
    const id = newId('claim');
    const docId = await ctx.db.insert('claims', {
      publicId: id,
      projectId: pid,
      storyId: story.nativeId,
      runId: run.publicId,
      connectionId: run.connectionId,
      generation,
      version: 1,
      expiresAt: m.now + duration * 1000,
      lastRenewedAt: m.now,
      active: true,
      createdAt: m.now,
    });
    await m.event({ operation: 'claim.acquired', objectType: 'story', objectId: story.nativeId, summary: `Claimed by run "${run.name}" (generation ${generation})` });
    return claimDto((await ctx.db.get(docId))!, m.now);
  });
}

async function ownedClaim(m: MutationContext, claimId: unknown, expectedVersion: unknown): Promise<ClaimRow> {
  const c = await byPublic.claim(m.ctx, claimId);
  if (!c || c.projectId !== m.access.project.publicId || c.connectionId !== m.access.connection?.publicId) throw notFound('The claim');
  if (c.releasedAt) throw new AppError('CLAIM_CONFLICT', `The claim was released (${c.releaseReason}).`, { claim: claimDto(c, m.now) });
  if (c.expiresAt <= m.now) throw new AppError('CLAIM_CONFLICT', 'The claim lease expired. Acquire it again.', { claim: claimDto(c, m.now) });
  if (c.version !== expectedVersion) throw new AppError('VERSION_CONFLICT', 'The claim changed.', { currentVersion: c.version });
  return c;
}

async function claimRenew(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'claim_renew', requestId, payload, async (m) => {
    const c = await ownedClaim(m, input.claimId, input.expectedVersion);
    if (m.now - c.lastRenewedAt < CLAIM_RENEW_MIN_INTERVAL_SEC * 1000) {
      throw new AppError('RATE_LIMITED', `Renew a claim at most once per ${CLAIM_RENEW_MIN_INTERVAL_SEC} seconds.`, { retryAfterSec: CLAIM_RENEW_MIN_INTERVAL_SEC });
    }
    await ctx.db.patch(c._id, { expiresAt: m.now + CLAIM_LEASE_SEC * 1000, lastRenewedAt: m.now, version: c.version + 1 });
    return claimDto((await ctx.db.get(c._id))!, m.now);
  });
}

async function claimRelease(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'runs:write', fresh);
  const reason = checkText('reason', input.reason, 500)!;
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'claim_release', requestId, payload, async (m) => {
    const c = await ownedClaim(m, input.claimId, input.expectedVersion);
    await ctx.db.patch(c._id, { active: false, releasedAt: m.now, releaseReason: reason, version: c.version + 1 });
    await m.event({ operation: 'claim.released', objectType: 'story', objectId: c.storyId, summary: `Claim released: ${reason.slice(0, 200)}` });
    return claimDto((await ctx.db.get(c._id))!, m.now);
  });
}

async function claimsForProject(ctx: Ctx, p: WirePrincipal, input: { projectId: string }, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'read', fresh);
  const rows = await ctx.db.query('claims').withIndex('by_project_active', (q) => q.eq('projectId', a.project.publicId).eq('active', true)).collect();
  const now = Date.now();
  return envelope(a, { items: rows.sort((x, y) => x.createdAt - y.createdAt).map((r) => claimDto(r, now)) });
}

// ------------------------------------------------------ approvals / requests

/** Normalize and bind the reviewed object versions into an immutable proposal. */
async function bindProposal(m: MutationContext, kind: string, p: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { ctx } = m;
  const pid = m.access.project.publicId;
  if (kind === 'lifecycle_override') {
    const row = await work.getRow(ctx, pid, p.workId);
    if (p.expectedVersion !== row.version) throw new AppError('VERSION_CONFLICT', `${row.nativeId} is at version ${row.version}; review the current state.`, { currentVersion: row.version });
    if (typeof p.targetStatus !== 'string') throw new AppError('VALIDATION_ERROR', 'proposal.targetStatus is required.');
    return { workId: row.nativeId, expectedVersion: row.version, targetStatus: p.targetStatus, fromStatus: row.status };
  }
  if (kind === 'execution_start') {
    const workIds = [...new Set(((Array.isArray(p.workIds) ? p.workIds : []) as unknown[]).map((w) => String(w).trim().toUpperCase()))].sort();
    const intent = checkText('proposal.intent', p.intent, 2000)!;
    const workVersions: Record<string, number> = {};
    for (const id of workIds) workVersions[id] = (await work.getRow(ctx, pid, id)).version;
    return { workIds, intent, workVersions };
  }
  if (kind === 'claim_override') {
    const c = await byPublic.claim(ctx, p.claimId);
    if (!c || c.projectId !== pid || c.releasedAt) throw notFound('The claim');
    if (p.generation !== c.generation || p.version !== c.version) throw new AppError('VERSION_CONFLICT', 'The claim changed; review it again.', { currentVersion: c.version });
    return { claimId: c.publicId, storyId: c.storyId, generation: c.generation, version: c.version };
  }
  // settings_change: typed desired settings only.
  return { desired: normalizeDesiredSettings(p.desired), checkoutIds: Array.isArray(p.checkoutIds) ? p.checkoutIds.map(String).sort() : null };
}

/**
 * Record a reviewable request. It never executes or approves anything; a
 * person decides in the dashboard, and the bound operation consumes it.
 */
async function controlRequest(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  const kind = input.kind as string;
  if (!(APPROVAL_KINDS as readonly string[]).includes(kind)) throw new AppError('VALIDATION_ERROR', `kind must be one of: ${APPROVAL_KINDS.join(', ')}.`);
  // The proposed operation's own capability is required too.
  requireScope(p, kind === 'lifecycle_override' ? 'work:write' : kind === 'settings_change' ? 'controls:request' : 'runs:write');
  const a = await authorize(ctx, p, input.projectId, 'controls:request', fresh);
  if (a.role === 'viewer') throw new AppError('FORBIDDEN', 'You have read-only access to this project.');
  const reason = checkText('reason', input.reason, 2000)!;
  if (!input.proposal || typeof input.proposal !== 'object' || Array.isArray(input.proposal)) throw new AppError('VALIDATION_ERROR', 'proposal must be an object.');
  // reviewUrlBase is injected by the HTTP layer, not part of the client's request.
  const { requestId, reviewUrlBase, ...payload } = input;
  return mutate(ctx, a, 'control_request', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const proposal = await bindProposal(m, kind, input.proposal);
    const id = newId('appr');
    const expiresAt = m.now + APPROVAL_TTL_MS;
    await ctx.db.insert('approvals', {
      publicId: id,
      projectId: pid,
      kind,
      requestedByConnection: a.connection?.publicId,
      requestedByUser: a.actor.userId,
      proposal,
      proposalHash: digest(proposal),
      reason,
      state: 'pending',
      expiresAt,
      createdAt: m.now,
    });
    await m.event({ operation: 'approval.requested', objectType: 'approval', objectId: id, summary: `${kind} requested: ${reason.slice(0, 200)}` });
    return { approvalId: id, kind, state: 'pending', proposal, expiresAt: iso(expiresAt), reviewUrl: `${String(reviewUrlBase ?? '').replace(/\/+$/, '')}/#/p/${pid}/approvals/${id}` };
  });
}

async function approvalList(ctx: Ctx, p: WirePrincipal, input: { projectId: string; state?: string }, fresh: Fresh) {
  const a = await authorize(ctx, p, input.projectId, 'read', fresh);
  const items: ApprovalRow[] = [];
  let scanned = 0;
  for await (const r of ctx.db.query('approvals').withIndex('by_project_created', (q) => q.eq('projectId', a.project.publicId)).order('desc')) {
    if (++scanned > SCAN_MAX) break;
    if (input.state && r.state !== input.state) continue;
    if (a.role !== 'admin' && r.requestedByUser !== p.userId) continue;
    items.push(r);
    if (items.length >= 200) break;
  }
  return envelope(a, { items: items.map(approvalDto) });
}

/**
 * Dashboard decision on a pending approval. Lifecycle, claim and settings
 * approvals need an admin; execution starts need an editor. The decision
 * itself never runs the agent's operation, except a claim override (forced
 * release) and a settings change (desired revision), which happen and are
 * consumed atomically in this transaction.
 */
async function approvalDecide(ctx: MutationCtx, p: WirePrincipal, input: Record<string, any>, fresh: Fresh) {
  if (p.kind !== 'session') throw new AppError('FORBIDDEN', 'Approvals are decided in the dashboard.');
  const found = await byPublic.approval(ctx, input.approvalId);
  const first = found && found.projectId === input.projectId ? found : null;
  const cap = first?.kind === 'execution_start' ? 'runs:write' : 'admin';
  const a = await authorize(ctx, p, input.projectId, cap, fresh);
  if (!first) throw notFound('The approval');
  if (input.decision !== 'approve' && input.decision !== 'reject') throw new AppError('VALIDATION_ERROR', 'decision must be approve or reject.');
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'approval_decide', requestId, payload, async (m) => {
    const ap = (await ctx.db.get(first._id))!;
    if (ap.state !== 'pending') throw new AppError('VALIDATION_ERROR', `The approval is already ${ap.state}.`);
    // Expiry is reported without persisting: a throw rolls back, and the TTL already makes it unusable.
    if (ap.expiresAt < m.now) throw new AppError('OPERATION_EXPIRED', 'The approval request expired.');
    if (input.decision === 'reject') {
      await ctx.db.patch(ap._id, { state: 'rejected', decidedBy: p.userId, decidedAt: m.now });
      await m.event({ operation: 'approval.rejected', objectType: 'approval', objectId: ap.publicId, summary: `${ap.kind} rejected` });
      return approvalDto({ ...ap, state: 'rejected', decidedBy: p.userId });
    }
    let state = 'approved';
    let result: unknown = null;
    if (ap.kind === 'claim_override') {
      const c = await byPublic.claim(ctx, ap.proposal.claimId);
      if (!c || c.projectId !== a.project.publicId || c.releasedAt || c.generation !== ap.proposal.generation || c.version !== ap.proposal.version) {
        throw new AppError('CLAIM_CONFLICT', 'The claim changed or was replaced since the request; nothing was released.');
      }
      await ctx.db.patch(c._id, { active: false, releasedAt: m.now, releaseReason: `override: ${ap.reason}`.slice(0, 500), overrideBy: p.userId, version: c.version + 1 });
      await m.event({ operation: 'claim.override_released', objectType: 'story', objectId: c.storyId, summary: `Claim force-released by an admin: ${String(ap.reason).slice(0, 200)}` });
      state = 'consumed';
    } else if (ap.kind === 'settings_change') {
      result = await createRevision(m, ap.proposal.desired, ap.proposal.checkoutIds, ap.publicId);
      state = 'consumed';
    }
    await ctx.db.patch(ap._id, { state, decidedBy: p.userId, decidedAt: m.now, ...(state === 'consumed' ? { consumedAt: m.now } : {}) });
    await m.event({ operation: 'approval.approved', objectType: 'approval', objectId: ap.publicId, summary: `${ap.kind} approved` });
    return { ...approvalDto({ ...ap, state, decidedBy: p.userId }), result };
  });
}

// ------------------------------------------------------------- operations

async function operationGet(ctx: Ctx, p: WirePrincipal, input: { projectId: string; operationId: string }, fresh: Fresh) {
  const a: Access = await authorize(ctx, p, input.projectId, 'read', fresh);
  const pid = a.project.publicId;
  const own = (userId: unknown) => a.role === 'admin' || userId === p.userId;
  const id = String(input.operationId ?? '');
  const approval = await byPublic.approval(ctx, id);
  if (approval && approval.projectId === pid && own(approval.requestedByUser)) return envelope(a, { operationType: 'approval', ...approvalDto(approval) });
  const job = await ctx.db.query('jobs').withIndex('by_public', (q) => q.eq('publicId', id)).unique();
  if (job && job.projectId === pid && own(job.ownerUserId)) return envelope(a, { operationType: `${job.kind}_job`, id: job.publicId, status: job.status, result: job.result ?? null, expiresAt: iso(job.expiresAt) });
  const op = await ctx.db.query('controlOperations').withIndex('by_public', (q) => q.eq('publicId', id)).unique();
  if (op && op.projectId === pid) return envelope(a, { operationType: 'control_operation', id: op.publicId, state: op.state, revision: op.revision, receipt: op.receipt ?? null, error: op.error ?? null, updatedAt: iso(op.updatedAt) });
  throw notFound('The operation');
}

export const READ_OPS: Record<string, ReadOp> = {
  agileflow_note_list: noteList,
  agileflow_activity_list: activityList,
  agileflow_run_list: runList,
  agileflow_operation_get: (ctx, p, a, f) => operationGet(ctx, p, a, f),
  'collab.claims': (ctx, p, a, f) => claimsForProject(ctx, p, a, f),
  'collab.approvals': (ctx, p, a, f) => approvalList(ctx, p, a, f),
};

export const WRITE_OPS: Record<string, WriteOp> = {
  agileflow_note_add: noteAdd,
  agileflow_run_start: runStart,
  agileflow_run_report: runReport,
  agileflow_run_finish: runFinish,
  agileflow_claim_acquire: claimAcquire,
  agileflow_claim_renew: claimRenew,
  agileflow_claim_release: claimRelease,
  agileflow_control_request: controlRequest,
  'collab.noteEdit': noteEdit,
  'collab.noteRedact': noteRedact,
  'collab.notePromote': notePromote,
  'collab.runCancel': runCancel,
  'collab.approvalDecide': approvalDecide,
};
