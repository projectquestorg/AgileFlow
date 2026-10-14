import type { Principal } from '../auth/verify';
import { many, one, type Queryable } from '../db/sql';
import { clampLimit, type Access, type Core, type MutationContext } from './core';
import { AppError, notFound } from './errors';
import { digest, newId } from './util';
import { consumeApproval, getRow } from './work';

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

interface NoteRow {
  id: string;
  project_id: string;
  work_id: string | null;
  run_id: string | null;
  kind: string;
  body: string;
  author: Record<string, unknown>;
  corrects_note_id: string | null;
  promoted_decision_id: string | null;
  version: number;
  redacted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RunRow {
  id: string;
  project_id: string;
  connection_id: string;
  work_ids: string[];
  name: string;
  intent: string;
  state: string;
  summary: string | null;
  blocker: string | null;
  evidence: Evidence[];
  cancel_requested_at: Date | null;
  cancel_acknowledged_at: Date | null;
  approval_id: string | null;
  version: number;
  started_at: Date;
  last_report_at: Date;
  ended_at: Date | null;
}

interface ClaimRow {
  id: string;
  project_id: string;
  story_id: string;
  run_id: string;
  connection_id: string;
  generation: number;
  version: number;
  expires_at: Date;
  last_renewed_at: Date;
  released_at: Date | null;
  release_reason: string | null;
  override_by: string | null;
}

export interface Evidence {
  kind: 'pr' | 'commit' | 'ci' | 'link' | 'test-report';
  url?: string;
  summary?: string;
  /** Agent-reported unless an integration verified it. */
  provenance: 'reported' | 'verified';
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function noteDto(n: NoteRow) {
  return {
    id: n.id,
    workId: n.work_id,
    runId: n.run_id,
    kind: n.kind,
    body: n.redacted_at ? '[redacted]' : n.body,
    redacted: !!n.redacted_at,
    author: n.author,
    correctsNoteId: n.corrects_note_id,
    promotedDecisionId: n.promoted_decision_id,
    version: n.version,
    createdAt: iso(n.created_at),
    updatedAt: iso(n.updated_at),
  };
}

export function runDto(r: RunRow, now: Date) {
  const terminal = (TERMINAL_RUN_STATES as readonly string[]).includes(r.state);
  return {
    id: r.id,
    connectionId: r.connection_id,
    workIds: r.work_ids,
    name: r.name,
    intent: r.intent,
    state: r.state,
    summary: r.summary,
    blocker: r.blocker,
    evidence: r.evidence,
    version: r.version,
    startedAt: iso(r.started_at),
    lastReportAt: iso(r.last_report_at),
    endedAt: iso(r.ended_at),
    /** Overlay: the last report is old. The reported state is unchanged; this is not proof the work stopped. */
    stale: !terminal && now.getTime() - new Date(r.last_report_at).getTime() > RUN_STALE_SEC * 1000,
    cancellation: r.cancel_requested_at ? { requestedAt: iso(r.cancel_requested_at), acknowledgedAt: iso(r.cancel_acknowledged_at) } : null,
  };
}

function claimDto(c: ClaimRow, now: Date) {
  return {
    id: c.id,
    storyId: c.story_id,
    runId: c.run_id,
    connectionId: c.connection_id,
    generation: c.generation,
    version: c.version,
    expiresAt: iso(c.expires_at),
    active: !c.released_at && new Date(c.expires_at) > now,
    releasedAt: iso(c.released_at),
    releaseReason: c.release_reason,
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

async function ownRun(ctx: MutationContext, runId: unknown): Promise<RunRow> {
  if (typeof runId !== 'string') throw new AppError('VALIDATION_ERROR', 'runId is required.');
  const run = await one<RunRow>(ctx.q, 'SELECT * FROM runs WHERE id = $1 AND project_id = $2 FOR UPDATE', [runId, ctx.access.project.id]);
  if (!run || run.connection_id !== ctx.access.connection?.id) throw notFound('The run');
  return run;
}

export class CollabService {
  constructor(private readonly core: Core) {}

  // ---------------------------------------------------------------- notes

  async noteList(principal: Principal, projectId: string, f: { workId?: string; runId?: string; kind?: string } = {}, cursor?: string, limit?: number) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const n = clampLimit(limit);
    const ctxKey = this.core.cursorContext(access, 'notes', f);
    const params: unknown[] = [projectId];
    let sql = 'SELECT * FROM notes WHERE project_id = $1';
    if (f.workId) params.push(f.workId.toUpperCase()), (sql += ` AND work_id = $${params.length}`);
    if (f.runId) params.push(f.runId), (sql += ` AND run_id = $${params.length}`);
    if (f.kind) params.push(f.kind), (sql += ` AND kind = $${params.length}`);
    if (cursor) {
      const p = this.core.cursors.decode(ctxKey, cursor) as { t: string; i: string } | null;
      if (!p) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this listing.');
      params.push(p.t, p.i);
      sql += ` AND (created_at, id) > ($${params.length - 1}::timestamptz, $${params.length})`;
    }
    params.push(n + 1);
    sql += ` ORDER BY created_at, id LIMIT $${params.length}`;
    const rows = await many<NoteRow>(this.core.db, sql, params);
    const page = rows.slice(0, n);
    const last = page[page.length - 1];
    return this.core.envelope(access, {
      items: page.map(noteDto),
      hasMore: rows.length > n,
      nextCursor: rows.length > n && last ? this.core.cursors.encode(ctxKey, { t: new Date(last.created_at).toISOString(), i: last.id }) : null,
    });
  }

  async noteAdd(principal: Principal, input: { projectId: string; workId?: string; runId?: string; kind: string; body: string; correctsNoteId?: string; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'notes:write');
    if (!(NOTE_KINDS as readonly string[]).includes(input.kind)) throw new AppError('VALIDATION_ERROR', `kind must be one of: ${NOTE_KINDS.join(', ')}.`);
    const body = checkText('body', input.body, MAX_NOTE)!;
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'notes:write', 'note_add', requestId, payload, async (ctx) => {
      const workId = input.workId ? (await getRow(ctx.q, input.projectId, input.workId)).native_id : null;
      if (input.runId) {
        const run = await one<RunRow>(ctx.q, 'SELECT * FROM runs WHERE id = $1 AND project_id = $2', [input.runId, input.projectId]);
        // A client can attach notes only to runs reported under its own connection.
        if (!run || (ctx.access.connection && run.connection_id !== ctx.access.connection.id)) throw notFound('The run');
      }
      if (input.correctsNoteId && !(await one(ctx.q, 'SELECT 1 FROM notes WHERE id = $1 AND project_id = $2', [input.correctsNoteId, input.projectId]))) throw notFound('The corrected note');
      const author = { ...ctx.access.actor, name: await displayName(ctx.q, ctx.access.actor.userId) };
      const row = (await one<NoteRow>(
        ctx.q,
        `INSERT INTO notes (id, workspace_id, project_id, work_id, run_id, kind, body, author, corrects_note_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING *`,
        [newId('note'), ctx.access.workspace.id, input.projectId, workId, input.runId ?? null, input.kind, body, JSON.stringify(author), input.correctsNoteId ?? null],
      ))!;
      await ctx.revision('note', row.id, 1, { body }, 'create');
      await ctx.event({ operation: 'note.added', objectType: 'note', objectId: row.id, version: 1, summary: `${input.kind} note${workId ? ` on ${workId}` : ''}` });
      return noteDto(row);
    });
  }

  /** Dashboard: a person revises their own note (versioned). Agents append corrections instead. */
  async noteEdit(principal: Principal, input: { projectId: string; noteId: string; body: string; expectedVersion: number; requestId: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Connected clients append a correction instead of editing a note.');
    const access = await this.core.authorize(principal, input.projectId, 'notes:write');
    const body = checkText('body', input.body, MAX_NOTE)!;
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'notes:write', 'note_edit', requestId, payload, async (ctx) => {
      const n = await one<NoteRow>(ctx.q, 'SELECT * FROM notes WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.noteId, input.projectId]);
      if (!n) throw notFound('The note');
      if ((n.author as { userId?: string; kind?: string }).userId !== principal.userId || (n.author as { kind?: string }).kind !== 'user') {
        throw new AppError('FORBIDDEN', 'You can only edit your own notes.');
      }
      if (n.redacted_at) throw new AppError('FORBIDDEN', 'A redacted note cannot be edited.');
      if (n.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 'The note changed.', { currentVersion: n.version });
      const row = (await one<NoteRow>(ctx.q, 'UPDATE notes SET body = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *', [n.id, body]))!;
      await ctx.revision('note', n.id, row.version, { body }, 'edit');
      await ctx.event({ operation: 'note.edited', objectType: 'note', objectId: n.id, version: row.version, summary: 'Edited a note' });
      return noteDto(row);
    });
  }

  /** Admin redaction: removes the body from the note, its revisions, and future exports. */
  async noteRedact(principal: Principal, input: { projectId: string; noteId: string; reason: string; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const reason = checkText('reason', input.reason, 500)!;
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'admin', 'note_redact', requestId, payload, async (ctx) => {
      const n = await one<NoteRow>(ctx.q, 'SELECT * FROM notes WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.noteId, input.projectId]);
      if (!n) throw notFound('The note');
      await ctx.q.query(`UPDATE notes SET body = '', redacted_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [n.id]);
      await ctx.q.query(`UPDATE revisions SET snapshot = '{"redacted":true}'::jsonb WHERE project_id = $1 AND object_type = 'note' AND object_id = $2`, [input.projectId, n.id]);
      await ctx.event({ operation: 'note.redacted', objectType: 'note', objectId: n.id, summary: `Redacted a note: ${reason}` });
      return { noteId: n.id, redacted: true };
    });
  }

  /** Promote a decision-proposal note into a proposed decision linked to the note. */
  async notePromote(principal: Principal, input: { projectId: string; noteId: string; title: string; requestId: string }, createDecision: (title: string, body: string) => Promise<{ id: string }>) {
    const access = await this.core.authorize(principal, input.projectId, 'work:write');
    const n = await one<NoteRow>(this.core.db, 'SELECT * FROM notes WHERE id = $1 AND project_id = $2', [input.noteId, input.projectId]);
    if (!n || n.redacted_at) throw notFound('The note');
    if (n.kind !== 'decision-proposal') throw new AppError('VALIDATION_ERROR', 'Only decision-proposal notes can be promoted.');
    if (n.promoted_decision_id) throw new AppError('VALIDATION_ERROR', `Already promoted to ${n.promoted_decision_id}.`);
    const decision = await createDecision(input.title, `${n.body}\n\n_Promoted from note ${n.id}._\n`);
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'work:write', 'note_promote', requestId, payload, async (ctx) => {
      await ctx.q.query('UPDATE notes SET promoted_decision_id = $2 WHERE id = $1', [n.id, decision.id]);
      await ctx.event({ operation: 'note.promoted', objectType: 'note', objectId: n.id, summary: `Promoted to proposed decision ${decision.id}` });
      return { noteId: n.id, decisionId: decision.id };
    });
  }

  // ------------------------------------------------------------- activity

  async activityList(principal: Principal, projectId: string, f: { objectId?: string; actorUserId?: string; operation?: string; sinceSeq?: number } = {}, cursor?: string, limit?: number) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const n = clampLimit(limit);
    const ctxKey = this.core.cursorContext(access, 'activity', f);
    const params: unknown[] = [projectId];
    let sql = 'SELECT seq, actor, operation, object_type, object_id, object_version, summary, created_at FROM activity_events WHERE project_id = $1';
    if (f.objectId) params.push(f.objectId), (sql += ` AND object_id = $${params.length}`);
    if (f.actorUserId) params.push(f.actorUserId), (sql += ` AND actor->>'userId' = $${params.length}`);
    if (f.operation) params.push(`${f.operation}%`), (sql += ` AND operation LIKE $${params.length}`);
    let after = typeof f.sinceSeq === 'number' ? f.sinceSeq : 0;
    if (cursor) {
      const p = this.core.cursors.decode(ctxKey, cursor) as { s: number } | null;
      if (!p) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this listing.');
      after = p.s;
    }
    params.push(after, n + 1);
    sql += ` AND seq > $${params.length - 1} ORDER BY seq LIMIT $${params.length}`;
    const rows = await many<{ seq: string; actor: unknown; operation: string; object_type: string; object_id: string; object_version: number | null; summary: string; created_at: Date }>(this.core.db, sql, params);
    const page = rows.slice(0, n);
    const last = page[page.length - 1];
    return this.core.envelope(access, {
      items: page.map((r) => ({ seq: Number(r.seq), actor: r.actor, operation: r.operation, objectType: r.object_type, objectId: r.object_id, objectVersion: r.object_version, summary: r.summary, at: iso(r.created_at) })),
      hasMore: rows.length > n,
      nextCursor: rows.length > n && last ? this.core.cursors.encode(ctxKey, { s: Number(last.seq) }) : null,
      latestSeq: Number(access.project.activity_seq),
    });
  }

  // ----------------------------------------------------------------- runs

  async runStart(principal: Principal, input: { projectId: string; workIds?: string[]; name: string; intent: string; approvalId?: string; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    if (!access.connection) throw new AppError('FORBIDDEN', 'Runs are reported by connected agents and CLIs.');
    const name = checkText('name', input.name, 200)!;
    const intent = checkText('intent', input.intent, 2000)!;
    const workIds = [...new Set((input.workIds ?? []).map((w) => String(w).trim().toUpperCase()))].sort();
    if (workIds.length > 20) throw new AppError('VALIDATION_ERROR', 'A run may name at most 20 work items.');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'run_start', requestId, payload, async (ctx) => {
      const versions: Record<string, number> = {};
      for (const id of workIds) versions[id] = (await getRow(ctx.q, input.projectId, id)).version;
      let approvalId: string | null = null;
      if (ctx.access.workspace.policy.requireStartApproval) {
        approvalId = await consumeApproval(ctx, input.approvalId, 'execution_start', { workIds, intent, workVersions: versions });
      }
      const run = (await one<RunRow>(
        ctx.q,
        `INSERT INTO runs (id, workspace_id, project_id, connection_id, work_ids, name, intent, state, approval_id, started_at, last_report_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'planning', $8, $9, $9) RETURNING *`,
        [newId('run'), ctx.access.workspace.id, input.projectId, ctx.access.connection!.id, JSON.stringify(workIds), name, intent, approvalId, ctx.now],
      ))!;
      await ctx.event({ operation: 'run.started', objectType: 'run', objectId: run.id, version: 1, summary: `Run started: ${name}${workIds.length ? ` (${workIds.join(', ')})` : ''}` });
      return runDto(run, ctx.now);
    });
  }

  async runReport(principal: Principal, input: { projectId: string; runId: string; expectedVersion: number; state?: string; summary?: string; blocker?: string | null; evidence?: Evidence[]; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    if (input.state !== undefined && !(NONTERMINAL_RUN_STATES as readonly string[]).includes(input.state)) {
      throw new AppError('VALIDATION_ERROR', `run_report accepts ${NONTERMINAL_RUN_STATES.join(', ')}; finish a run with agileflow_run_finish.`);
    }
    const summary = checkText('summary', input.summary, 2000, false);
    const blocker = checkText('blocker', input.blocker, 2000, false);
    const evidence = checkEvidence(input.evidence);
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'run_report', requestId, payload, async (ctx) => {
      const run = await ownRun(ctx, input.runId);
      if ((TERMINAL_RUN_STATES as readonly string[]).includes(run.state)) throw new AppError('VALIDATION_ERROR', `The run already ended (${run.state}).`);
      if (run.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 'The run changed (for example, a cancellation was requested). Reload it.', { currentVersion: run.version });
      const updated = (await one<RunRow>(
        ctx.q,
        `UPDATE runs SET state = COALESCE($2, state), summary = COALESCE($3, summary), blocker = $4,
            evidence = evidence || $5::jsonb, last_report_at = $6, version = version + 1 WHERE id = $1 RETURNING *`,
        [run.id, input.state ?? null, summary, input.blocker === undefined ? run.blocker : blocker, JSON.stringify(evidence), ctx.now],
      ))!;
      // Heartbeats without a state change are compacted into last_report_at, not the activity feed.
      if ((input.state && input.state !== run.state) || blocker) {
        await ctx.event({ operation: 'run.reported', objectType: 'run', objectId: run.id, version: updated.version, summary: `Run ${updated.state}${blocker ? `: blocked - ${blocker.slice(0, 200)}` : summary ? `: ${summary.slice(0, 200)}` : ''}` });
      }
      return { run: runDto(updated, ctx.now), pendingActions: updated.cancel_requested_at && !updated.cancel_acknowledged_at ? [{ kind: 'cancel', requestedAt: iso(updated.cancel_requested_at) }] : [] };
    });
  }

  async runFinish(principal: Principal, input: { projectId: string; runId: string; expectedVersion: number; outcome: string; summary: string; evidence?: Evidence[]; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    if (!(TERMINAL_RUN_STATES as readonly string[]).includes(input.outcome)) throw new AppError('VALIDATION_ERROR', `outcome must be one of: ${TERMINAL_RUN_STATES.join(', ')}.`);
    const summary = checkText('summary', input.summary, 2000)!;
    const evidence = checkEvidence(input.evidence);
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'run_finish', requestId, payload, async (ctx) => {
      const run = await ownRun(ctx, input.runId);
      if ((TERMINAL_RUN_STATES as readonly string[]).includes(run.state)) throw new AppError('VALIDATION_ERROR', `The run already ended (${run.state}).`);
      if (run.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 'The run changed. Reload it.', { currentVersion: run.version });
      const updated = (await one<RunRow>(
        ctx.q,
        `UPDATE runs SET state = $2, summary = $3, evidence = evidence || $4::jsonb, ended_at = $5::timestamptz, last_report_at = $5::timestamptz,
            cancel_acknowledged_at = CASE WHEN cancel_requested_at IS NOT NULL THEN $5::timestamptz ELSE NULL END, version = version + 1
          WHERE id = $1 RETURNING *`,
        [run.id, input.outcome, summary, JSON.stringify(evidence), ctx.now],
      ))!;
      const released = await many<{ id: string }>(
        ctx.q,
        `UPDATE claims SET released_at = $2, release_reason = 'run finished', version = version + 1 WHERE run_id = $1 AND released_at IS NULL RETURNING id`,
        [run.id, ctx.now],
      );
      // Finishing a run does not change any story's status or acceptance criteria.
      await ctx.event({ operation: 'run.finished', objectType: 'run', objectId: run.id, version: updated.version, summary: `Run ${input.outcome}: ${summary.slice(0, 200)}` });
      return { run: runDto(updated, ctx.now), releasedClaims: released.map((r) => r.id) };
    });
  }

  async runList(principal: Principal, projectId: string, f: { workId?: string; state?: string; connectionId?: string } = {}, cursor?: string, limit?: number) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const n = clampLimit(limit);
    const ctxKey = this.core.cursorContext(access, 'runs', f);
    const params: unknown[] = [projectId];
    let sql = 'SELECT * FROM runs WHERE project_id = $1';
    if (f.workId) params.push(JSON.stringify([f.workId.toUpperCase()])), (sql += ` AND work_ids @> $${params.length}::jsonb`);
    if (f.state) params.push(f.state), (sql += ` AND state = $${params.length}`);
    if (f.connectionId) params.push(f.connectionId), (sql += ` AND connection_id = $${params.length}`);
    if (cursor) {
      const p = this.core.cursors.decode(ctxKey, cursor) as { t: string; i: string } | null;
      if (!p) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this listing.');
      params.push(p.t, p.i);
      sql += ` AND (started_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`;
    }
    params.push(n + 1);
    sql += ` ORDER BY started_at DESC, id DESC LIMIT $${params.length}`;
    const rows = await many<RunRow>(this.core.db, sql, params);
    const page = rows.slice(0, n);
    const last = page[page.length - 1];
    const now = this.core.now();
    return this.core.envelope(access, {
      items: page.map((r) => runDto(r, now)),
      hasMore: rows.length > n,
      nextCursor: rows.length > n && last ? this.core.cursors.encode(ctxKey, { t: new Date(last.started_at).toISOString(), i: last.id }) : null,
    });
  }

  /** Dashboard: request cooperative cancellation. Never claims the external process stopped. */
  async runCancel(principal: Principal, input: { projectId: string; runId: string; requestId: string }) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Cancellation is requested from the dashboard.');
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'run_cancel', requestId, payload, async (ctx) => {
      const run = await one<RunRow>(ctx.q, 'SELECT * FROM runs WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.runId, input.projectId]);
      if (!run) throw notFound('The run');
      if ((TERMINAL_RUN_STATES as readonly string[]).includes(run.state)) throw new AppError('VALIDATION_ERROR', `The run already ended (${run.state}).`);
      if (run.cancel_requested_at) return runDto(run, ctx.now);
      const updated = (await one<RunRow>(ctx.q, `UPDATE runs SET cancel_requested_at = $2, cancel_requested_by = $3, version = version + 1 WHERE id = $1 RETURNING *`, [run.id, ctx.now, principal.userId]))!;
      await ctx.event({ operation: 'run.cancel_requested', objectType: 'run', objectId: run.id, version: updated.version, summary: `Cancellation requested for ${run.name}` });
      return runDto(updated, ctx.now);
    });
  }

  // --------------------------------------------------------------- claims

  async claimAcquire(principal: Principal, input: { projectId: string; storyId: string; runId: string; durationSec?: number; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    const duration = Math.min(CLAIM_LEASE_SEC, Math.max(30, Math.floor(input.durationSec ?? CLAIM_LEASE_SEC)));
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'claim_acquire', requestId, payload, async (ctx) => {
      const run = await ownRun(ctx, input.runId);
      if (!(NONTERMINAL_RUN_STATES as readonly string[]).includes(run.state)) throw new AppError('VALIDATION_ERROR', 'Claims need an active run.');
      const story = await getRow(ctx.q, input.projectId, input.storyId, true);
      if (story.type !== 'story') throw new AppError('VALIDATION_ERROR', 'Only stories can be claimed.');
      const current = await one<ClaimRow>(ctx.q, 'SELECT * FROM claims WHERE project_id = $1 AND story_id = $2 AND released_at IS NULL FOR UPDATE', [input.projectId, story.native_id]);
      if (current) {
        if (new Date(current.expires_at) > ctx.now) {
          const holder = await one<{ name: string }>(ctx.q, 'SELECT name FROM runs WHERE id = $1', [current.run_id]);
          throw new AppError('CLAIM_CONFLICT', `${story.native_id} is claimed by run "${holder?.name ?? current.run_id}" until ${iso(current.expires_at)}. Pick other work or request a claim override.`, {
            claim: claimDto(current, ctx.now),
          });
        }
        await ctx.q.query(`UPDATE claims SET released_at = $2, release_reason = 'expired', version = version + 1 WHERE id = $1`, [current.id, ctx.now]);
      }
      const generation = story.claim_generation + 1;
      await ctx.q.query('UPDATE work_items SET claim_generation = $2 WHERE id = $1', [story.id, generation]);
      const claim = (await one<ClaimRow>(
        ctx.q,
        `INSERT INTO claims (id, workspace_id, project_id, story_id, run_id, connection_id, generation, expires_at, last_renewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [newId('claim'), ctx.access.workspace.id, input.projectId, story.native_id, run.id, run.connection_id, generation, new Date(ctx.now.getTime() + duration * 1000), ctx.now],
      ))!;
      await ctx.event({ operation: 'claim.acquired', objectType: 'story', objectId: story.native_id, summary: `Claimed by run "${run.name}" (generation ${generation})` });
      return claimDto(claim, ctx.now);
    });
  }

  private async ownedClaim(ctx: MutationContext, claimId: string, expectedVersion: number): Promise<ClaimRow> {
    const c = await one<ClaimRow>(ctx.q, 'SELECT * FROM claims WHERE id = $1 AND project_id = $2 FOR UPDATE', [claimId, ctx.access.project.id]);
    if (!c || c.connection_id !== ctx.access.connection?.id) throw notFound('The claim');
    if (c.released_at) throw new AppError('CLAIM_CONFLICT', `The claim was released (${c.release_reason}).`, { claim: claimDto(c, ctx.now) });
    if (new Date(c.expires_at) <= ctx.now) throw new AppError('CLAIM_CONFLICT', 'The claim lease expired. Acquire it again.', { claim: claimDto(c, ctx.now) });
    if (c.version !== expectedVersion) throw new AppError('VERSION_CONFLICT', 'The claim changed.', { currentVersion: c.version });
    return c;
  }

  async claimRenew(principal: Principal, input: { projectId: string; claimId: string; expectedVersion: number; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'claim_renew', requestId, payload, async (ctx) => {
      const c = await this.ownedClaim(ctx, input.claimId, input.expectedVersion);
      if (ctx.now.getTime() - new Date(c.last_renewed_at).getTime() < CLAIM_RENEW_MIN_INTERVAL_SEC * 1000) {
        throw new AppError('RATE_LIMITED', `Renew a claim at most once per ${CLAIM_RENEW_MIN_INTERVAL_SEC} seconds.`, { retryAfterSec: CLAIM_RENEW_MIN_INTERVAL_SEC });
      }
      const row = (await one<ClaimRow>(
        ctx.q,
        `UPDATE claims SET expires_at = $2, last_renewed_at = $3, version = version + 1 WHERE id = $1 RETURNING *`,
        [c.id, new Date(ctx.now.getTime() + CLAIM_LEASE_SEC * 1000), ctx.now],
      ))!;
      return claimDto(row, ctx.now);
    });
  }

  async claimRelease(principal: Principal, input: { projectId: string; claimId: string; expectedVersion: number; reason: string; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'runs:write');
    const reason = checkText('reason', input.reason, 500)!;
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'runs:write', 'claim_release', requestId, payload, async (ctx) => {
      const c = await this.ownedClaim(ctx, input.claimId, input.expectedVersion);
      const row = (await one<ClaimRow>(ctx.q, `UPDATE claims SET released_at = $2, release_reason = $3, version = version + 1 WHERE id = $1 RETURNING *`, [c.id, ctx.now, reason]))!;
      await ctx.event({ operation: 'claim.released', objectType: 'story', objectId: c.story_id, summary: `Claim released: ${reason.slice(0, 200)}` });
      return claimDto(row, ctx.now);
    });
  }

  async claimsForProject(principal: Principal, projectId: string) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const rows = await many<ClaimRow>(this.core.db, 'SELECT * FROM claims WHERE project_id = $1 AND released_at IS NULL ORDER BY created_at', [projectId]);
    const now = this.core.now();
    return this.core.envelope(access, { items: rows.map((r) => claimDto(r, now)) });
  }

  // ------------------------------------------------- approvals / requests

  /**
   * Record a reviewable request. It never executes or approves anything; a
   * person decides in the dashboard, and the bound operation consumes it.
   */
  async controlRequest(principal: Principal, input: { projectId: string; kind: string; proposal: Record<string, unknown>; reason: string; requestId: string }, dashboardUrl: (approvalId: string) => string) {
    const kind = input.kind as (typeof APPROVAL_KINDS)[number];
    if (!(APPROVAL_KINDS as readonly string[]).includes(kind)) throw new AppError('VALIDATION_ERROR', `kind must be one of: ${APPROVAL_KINDS.join(', ')}.`);
    // The proposed operation's own capability is required too.
    const opCap = kind === 'lifecycle_override' ? 'work:write' : kind === 'settings_change' ? 'controls:request' : 'runs:write';
    this.core.requireScope(principal, opCap);
    const access = await this.core.authorize(principal, input.projectId, 'controls:request');
    if (access.role === 'viewer') throw new AppError('FORBIDDEN', 'You have read-only access to this project.');
    const reason = checkText('reason', input.reason, 2000)!;
    if (!input.proposal || typeof input.proposal !== 'object' || Array.isArray(input.proposal)) throw new AppError('VALIDATION_ERROR', 'proposal must be an object.');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'controls:request', 'control_request', requestId, payload, async (ctx) => {
      const proposal = await this.bindProposal(ctx, kind, input.proposal);
      const row = (await one<{ id: string; expires_at: Date }>(
        ctx.q,
        `INSERT INTO approvals (id, workspace_id, project_id, kind, requested_by_connection, requested_by_user, proposal, proposal_hash, reason, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10) RETURNING id, expires_at`,
        [newId('appr'), ctx.access.workspace.id, input.projectId, kind, ctx.access.connection?.id ?? null, ctx.access.actor.userId, JSON.stringify(proposal), digest(proposal), reason, new Date(ctx.now.getTime() + APPROVAL_TTL_MS)],
      ))!;
      await ctx.event({ operation: 'approval.requested', objectType: 'approval', objectId: row.id, summary: `${kind} requested: ${reason.slice(0, 200)}` });
      return { approvalId: row.id, kind, state: 'pending', proposal, expiresAt: iso(row.expires_at), reviewUrl: dashboardUrl(row.id) };
    });
  }

  /** Normalize and bind the reviewed object versions into an immutable proposal. */
  private async bindProposal(ctx: MutationContext, kind: string, p: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pid = ctx.access.project.id;
    if (kind === 'lifecycle_override') {
      const row = await getRow(ctx.q, pid, p.workId);
      if (p.expectedVersion !== row.version) throw new AppError('VERSION_CONFLICT', `${row.native_id} is at version ${row.version}; review the current state.`, { currentVersion: row.version });
      if (typeof p.targetStatus !== 'string') throw new AppError('VALIDATION_ERROR', 'proposal.targetStatus is required.');
      return { workId: row.native_id, expectedVersion: row.version, targetStatus: p.targetStatus, fromStatus: row.status };
    }
    if (kind === 'execution_start') {
      const workIds = [...new Set(((p.workIds as string[]) ?? []).map((w) => String(w).trim().toUpperCase()))].sort();
      const intent = checkText('proposal.intent', p.intent, 2000)!;
      const workVersions: Record<string, number> = {};
      for (const id of workIds) workVersions[id] = (await getRow(ctx.q, pid, id)).version;
      return { workIds, intent, workVersions };
    }
    if (kind === 'claim_override') {
      const c = await one<ClaimRow>(ctx.q, 'SELECT * FROM claims WHERE id = $1 AND project_id = $2', [p.claimId, pid]);
      if (!c || c.released_at) throw notFound('The claim');
      if (p.generation !== c.generation || p.version !== c.version) throw new AppError('VERSION_CONFLICT', 'The claim changed; review it again.', { currentVersion: c.version });
      return { claimId: c.id, storyId: c.story_id, generation: c.generation, version: c.version };
    }
    // settings_change: typed desired settings only.
    return { desired: normalizeDesiredSettings(p.desired), checkoutIds: Array.isArray(p.checkoutIds) ? p.checkoutIds.map(String).sort() : null };
  }

  async approvalList(principal: Principal, projectId: string, state?: string) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const params: unknown[] = [projectId];
    let sql = 'SELECT * FROM approvals WHERE project_id = $1';
    if (state) params.push(state), (sql += ` AND state = $2`);
    if (access.role !== 'admin') params.push(principal.userId), (sql += ` AND requested_by_user = $${params.length}`);
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const rows = await many<Record<string, unknown>>(this.core.db, sql, params);
    return this.core.envelope(access, { items: rows.map(approvalDto) });
  }

  /**
   * Dashboard decision on a pending approval. Lifecycle, claim and settings
   * approvals need an admin; execution starts need an editor. The decision
   * itself never runs the agent's operation, except a claim override, which
   * the admin handler performs and consumes atomically.
   */
  async approvalDecide(principal: Principal, input: { projectId: string; approvalId: string; decision: 'approve' | 'reject'; requestId: string }, applySettings: (ctx: MutationContext, desired: unknown, checkoutIds: string[] | null, approvalId: string) => Promise<unknown>) {
    if (principal.kind !== 'session') throw new AppError('FORBIDDEN', 'Approvals are decided in the dashboard.');
    const first = await one<{ kind: string }>(this.core.db, 'SELECT kind FROM approvals WHERE id = $1 AND project_id = $2', [input.approvalId, input.projectId]);
    const cap = first?.kind === 'execution_start' ? 'runs:write' : 'admin';
    const access = await this.core.authorize(principal, input.projectId, cap);
    if (!first) throw notFound('The approval');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, cap, 'approval_decide', requestId, payload, async (ctx) => {
      const a = (await one<Record<string, any>>(ctx.q, 'SELECT * FROM approvals WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.approvalId, input.projectId]))!;
      if (a.state !== 'pending') throw new AppError('VALIDATION_ERROR', `The approval is already ${a.state}.`);
      if (new Date(a.expires_at) < ctx.now) {
        await ctx.q.query(`UPDATE approvals SET state = 'expired' WHERE id = $1`, [a.id]);
        throw new AppError('OPERATION_EXPIRED', 'The approval request expired.');
      }
      if (input.decision === 'reject') {
        await ctx.q.query(`UPDATE approvals SET state = 'rejected', decided_by = $2, decided_at = now() WHERE id = $1`, [a.id, principal.userId]);
        await ctx.event({ operation: 'approval.rejected', objectType: 'approval', objectId: a.id, summary: `${a.kind} rejected` });
        return approvalDto({ ...a, state: 'rejected' });
      }
      let state = 'approved';
      let result: unknown = null;
      if (a.kind === 'claim_override') {
        const c = await one<ClaimRow>(ctx.q, 'SELECT * FROM claims WHERE id = $1 AND project_id = $2 FOR UPDATE', [a.proposal.claimId, input.projectId]);
        if (!c || c.released_at || c.generation !== a.proposal.generation || c.version !== a.proposal.version) {
          throw new AppError('CLAIM_CONFLICT', 'The claim changed or was replaced since the request; nothing was released.');
        }
        await ctx.q.query(`UPDATE claims SET released_at = $2, release_reason = $3, override_by = $4, version = version + 1 WHERE id = $1`, [c.id, ctx.now, `override: ${a.reason}`.slice(0, 500), principal.userId]);
        await ctx.event({ operation: 'claim.override_released', objectType: 'story', objectId: c.story_id, summary: `Claim force-released by an admin: ${String(a.reason).slice(0, 200)}` });
        state = 'consumed';
      } else if (a.kind === 'settings_change') {
        result = await applySettings(ctx, a.proposal.desired, a.proposal.checkoutIds, a.id);
        state = 'consumed';
      }
      await ctx.q.query(`UPDATE approvals SET state = $2, decided_by = $3, decided_at = now(), consumed_at = CASE WHEN $2 = 'consumed' THEN now() END WHERE id = $1`, [a.id, state, principal.userId]);
      await ctx.event({ operation: 'approval.approved', objectType: 'approval', objectId: a.id, summary: `${a.kind} approved` });
      return { ...approvalDto({ ...a, state }), result };
    });
  }

  // ----------------------------------------------------------- operations

  async operationGet(principal: Principal, projectId: string, operationId: string) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const own = (userId: unknown) => access.role === 'admin' || userId === principal.userId;
    const approval = await one<Record<string, unknown>>(this.core.db, 'SELECT * FROM approvals WHERE id = $1 AND project_id = $2', [operationId, projectId]);
    if (approval && own(approval.requested_by_user)) return this.core.envelope(access, { operationType: 'approval', ...approvalDto(approval) });
    const job = await one<Record<string, any>>(this.core.db, 'SELECT * FROM jobs WHERE id = $1 AND project_id = $2', [operationId, projectId]);
    if (job && own(job.owner_user_id)) return this.core.envelope(access, { operationType: `${job.kind}_job`, id: job.id, status: job.status, result: job.result, expiresAt: iso(job.expires_at) });
    const op = await one<Record<string, any>>(this.core.db, 'SELECT * FROM control_operations WHERE id = $1 AND project_id = $2', [operationId, projectId]);
    if (op) return this.core.envelope(access, { operationType: 'control_operation', id: op.id, state: op.state, revision: op.revision, receipt: op.receipt, error: op.error, updatedAt: iso(op.updated_at) });
    throw notFound('The operation');
  }
}

export function approvalDto(a: Record<string, any>) {
  return {
    id: a.id,
    kind: a.kind,
    state: a.state,
    proposal: a.proposal,
    reason: a.reason,
    requestedByUser: a.requested_by_user,
    requestedByConnection: a.requested_by_connection,
    decidedBy: a.decided_by ?? null,
    expiresAt: iso(a.expires_at),
    createdAt: iso(a.created_at),
  };
}

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

/** Typed allowlist: no commands, paths, URLs, or environment values can enter a desired revision. */
export function normalizeDesiredSettings(raw: unknown): DesiredSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('VALIDATION_ERROR', 'desired settings must be an object.');
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!['skills', 'providers', 'questions'].includes(k)) throw new AppError('VALIDATION_ERROR', `Unsupported setting: ${k}.`);
  const out: DesiredSettings = {};
  if (r.skills !== undefined) {
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

export async function displayName(q: Queryable, userId: string): Promise<string | null> {
  return (await one<{ display_name: string | null }>(q, 'SELECT display_name FROM users WHERE id = $1', [userId]))?.display_name ?? null;
}

export type { Access };
