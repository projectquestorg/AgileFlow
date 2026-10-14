import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internalMutation, internalQuery } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { DIRS, README_FILE } from '../../../../packages/work/src/constants';
import { AppError, ScopeError, notFound } from '../../src/domain/errors';
import { authorize, envelope, IDEMPOTENCY_TTL_MS, type Access, type Capability, type MutationCtx, type WirePrincipal } from '../lib/core';
import { byteLength, contentHash, newId } from '../lib/util';
import { ensureDocument, readDocument, relationsOf, summarize } from './work';
import type { ReadOp, WriteOp } from '../ops';

/**
 * Native Work import/export (port of src/domain/portability.ts), split for
 * Convex: the quarantine scan and frontmatter parsing run in the Node action
 * (convex/portabilityNode.ts); everything that reads or writes records runs
 * here as internal queries/mutations that re-check authorization.
 *
 * Commit is staged: `commitBegin` verifies the plan against the state the
 * action planned from (by activity sequence), marks the project `importing`
 * (other writes then fail with a retryable VERSION_CONFLICT) and the job
 * `activating`; batches apply rows, then relations/revisions, then documents;
 * `commitFinish` archives selected removals, records the result, and clears
 * the flag. Every stage is idempotent, so retrying the commit resumes.
 */

export const IMPORT_LIMITS = { files: 20_000, totalBytes: 250 * 1024 * 1024, fileBytes: 1024 * 1024 };
export const PREVIEW_TTL_MS = 60 * 60_000;
export const EXPORT_TTL_MS = 24 * 3600_000;
const ALLOWED_TOP = new Set<string>([README_FILE, ...Object.values(DIRS)]);

export type ChangeAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'possible-removal';
export interface Change {
  id: string;
  type: string;
  action: ChangeAction;
  fields?: string[];
  title?: string;
}

/** Validate quarantined paths: relative, inside the Work layout, no traversal, sane encoding and size. */
export function checkFiles(files: Record<string, string>): void {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new AppError('VALIDATION_ERROR', 'The upload contains no files.');
  const entries = Object.entries(files);
  if (!entries.length) throw new AppError('VALIDATION_ERROR', 'The upload contains no files.');
  if (entries.length > IMPORT_LIMITS.files) throw new AppError('VALIDATION_ERROR', `At most ${IMPORT_LIMITS.files} files can be imported.`);
  let total = 0;
  for (const [p, content] of entries) {
    if (typeof content !== 'string') throw new AppError('VALIDATION_ERROR', `${p}: content must be UTF-8 text.`);
    if (p.includes('\0') || p.includes('\\') || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').some((s) => s === '..' || s === '.' || s === '')) {
      throw new AppError('VALIDATION_ERROR', `Unsafe path rejected: ${JSON.stringify(p).slice(0, 200)}`);
    }
    if (!ALLOWED_TOP.has(p.split('/')[0]!)) throw new AppError('VALIDATION_ERROR', `${p} is outside the Work layout (${[...ALLOWED_TOP].join(', ')}).`);
    if (!p.endsWith('.md')) throw new AppError('VALIDATION_ERROR', `${p}: only Markdown files are imported.`);
    const bytes = byteLength(content);
    if (bytes > IMPORT_LIMITS.fileBytes) throw new AppError('VALIDATION_ERROR', `${p} exceeds 1 MiB.`);
    if (content.includes('�')) throw new AppError('VALIDATION_ERROR', `${p} is not valid UTF-8.`);
    total += bytes;
  }
  if (total > IMPORT_LIMITS.totalBytes) throw new AppError('VALIDATION_ERROR', 'The upload exceeds 250 MiB.');
}

// ------------------------------------------------------------ outcomes

type Outcome = { ok: true; value: any } | { ok: false; error: Record<string, unknown>; status: number } | { ok: false; scope: string[] };

/** Convert a domain failure into the plain outcome the HTTP layer expects (queries). */
async function settle(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ScopeError) return { ok: false, scope: err.required };
    if (err instanceof AppError) return { ok: false, error: err.toJSON(), status: err.status };
    throw err;
  }
}

/** Mutations: abort the transaction and carry the outcome (caught by the action as ConvexError). */
async function settleWrite<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ScopeError) throw new ConvexError({ ok: false, scope: err.required });
    if (err instanceof AppError) throw new ConvexError({ ok: false, error: err.toJSON(), status: err.status });
    throw err;
  }
}

const principal = v.any();

/** The same authorization as every operation (authorize() in lib/core), for the Node actions. */
export const authorizeQ = internalQuery({
  args: { principal, projectId: v.string(), cap: v.string(), freshSince: v.optional(v.number()) },
  handler: async (ctx, a) =>
    settle(async () => {
      const access = await authorize(ctx, a.principal as WirePrincipal, a.projectId, a.cap as Capability, { freshSince: a.freshSince });
      return { workspaceId: access.workspace.publicId, activitySeq: access.project.activitySeq, project: { id: access.project.publicId, name: access.project.name, slug: access.project.slug } };
    }),
});

/**
 * One page of current Work records with their relations and merge bases
 * (internal: called by the Node action after authorizeQ). Pages keep each
 * read within transaction limits for large projects.
 */
export const snapshot = internalQuery({
  args: { projectId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, a) => {
    const project = await ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', a.projectId)).unique();
    const page = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', a.projectId)).paginate(a.paginationOpts);
    const items = [];
    for (const r of page.page) {
      const src = await ctx.db.query('nativeSources').withIndex('by_project_key', (q) => q.eq('projectId', a.projectId).eq('objectKey', r.nativeId)).unique();
      const { _id, _creationTime, ...row } = r;
      items.push({ row, rel: await relationsOf(ctx, a.projectId, r.nativeId), source: src ? { path: src.path, original: src.original, baseVersion: src.baseVersion } : null });
    }
    return { items, isDone: page.isDone, continueCursor: page.continueCursor, activitySeq: project?.activitySeq ?? -1 };
  },
});

export type SnapshotItem = { row: Omit<Doc<'workItems'>, '_id' | '_creationTime'>; rel: Awaited<ReturnType<typeof relationsOf>>; source: { path: string; original: string; baseVersion: number } | null };

/** Store a preview (upsert by owner + operation key while still a preview). */
export const savePreview = internalMutation({
  args: { principal, projectId: v.string(), freshSince: v.optional(v.number()), operationKey: v.string(), sourceDigest: v.string(), preview: v.any(), sourceFile: v.id('_storage') },
  handler: async (ctx, a) =>
    settleWrite(async () => {
      const p = a.principal as WirePrincipal;
      // Editors (including the connected CLI) can prepare a preview; only an admin commits it in the dashboard.
      const access = await authorize(ctx, p, a.projectId, 'work:write', { freshSince: a.freshSince });
      const now = access.now;
      const existing = await ctx.db
        .query('jobs')
        .withIndex('by_owner_key', (q) => q.eq('workspaceId', access.workspace.publicId).eq('ownerUserId', p.userId).eq('kind', 'import').eq('operationKey', a.operationKey))
        .unique();
      let jobId: string;
      if (existing) {
        if (existing.status !== 'previewed' || existing.projectId !== a.projectId) throw new AppError('IDEMPOTENCY_CONFLICT', 'That operation key was already used for a committed import. Use a new key.');
        if (existing.sourceFile) await ctx.storage.delete(existing.sourceFile);
        await ctx.db.patch(existing._id, { preview: a.preview, sourceFile: a.sourceFile, sourceDigest: a.sourceDigest, expiresAt: now + PREVIEW_TTL_MS });
        jobId = existing.publicId;
      } else {
        jobId = newId('job');
        await ctx.db.insert('jobs', {
          publicId: jobId,
          workspaceId: access.workspace.publicId,
          projectId: a.projectId,
          kind: 'import',
          ownerUserId: p.userId,
          operationKey: a.operationKey,
          sourceDigest: a.sourceDigest,
          status: 'previewed',
          preview: a.preview,
          sourceFile: a.sourceFile,
          expiresAt: now + PREVIEW_TTL_MS,
          createdAt: now,
        });
      }
      return envelope(access, { jobId, preview: a.preview });
    }),
});

async function importJob(ctx: { db: MutationCtx['db'] } | any, access: Access, jobId: unknown, userId: string): Promise<Doc<'jobs'>> {
  const job = typeof jobId === 'string' ? await ctx.db.query('jobs').withIndex('by_public', (q: any) => q.eq('publicId', jobId)).unique() : null;
  if (!job || job.projectId !== access.project.publicId || job.kind !== 'import' || job.ownerUserId !== userId) throw notFound('The import preview');
  return job;
}

function unresolvedConflicts(preview: { changes: Change[] }, resolutions: Record<string, string> | undefined) {
  return preview.changes.filter((c) => c.action === 'conflict' && !resolutions?.[c.id]);
}

/**
 * Commit precheck for the action: committed jobs return their result; otherwise
 * the job and its quarantined upload are returned for planning.
 */
export const loadCommit = internalQuery({
  args: { principal, projectId: v.string(), jobId: v.string(), freshSince: v.optional(v.number()), resolutions: v.optional(v.any()) },
  handler: async (ctx, a) =>
    settle(async () => {
      const p = a.principal as WirePrincipal;
      const access = await authorize(ctx, p, a.projectId, 'admin', { freshSince: a.freshSince });
      const job = await importJob(ctx, access, a.jobId, p.userId);
      if (job.status === 'committed') return { committed: envelope(access, job.result) };
      if (job.status === 'activating') return { job: { status: job.status, sourceFile: job.sourceFile ?? null, sourceDigest: job.sourceDigest, preview: job.preview, commitInput: job.result }, activitySeq: access.project.activitySeq };
      if (job.status !== 'previewed' || job.expiresAt < access.now) throw new AppError('OPERATION_EXPIRED', 'The preview expired. Preview the import again.');
      if (job.preview.blocked) throw new AppError('VALIDATION_ERROR', 'The preview has blocking problems (duplicate IDs, invalid references, or unreadable files). Fix them and preview again.');
      const unresolved = unresolvedConflicts(job.preview, a.resolutions);
      if (unresolved.length) throw new AppError('VERSION_CONFLICT', `Resolve conflicts first: ${unresolved.map((c) => c.id).join(', ')}.`, { conflicts: unresolved });
      return { job: { status: job.status, sourceFile: job.sourceFile ?? null, sourceDigest: job.sourceDigest, preview: job.preview, commitInput: null }, activitySeq: access.project.activitySeq };
    }),
});

const commitArgs = {
  principal,
  projectId: v.string(),
  jobId: v.string(),
  freshSince: v.optional(v.number()),
  requestId: v.any(),
  requestDigest: v.string(),
};

async function receipt(ctx: MutationCtx, access: Access, requestId: unknown, requestDigest: string) {
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 200) {
    throw new AppError('VALIDATION_ERROR', 'requestId must be a client-generated key of 8-200 characters, reused only to retry the same request.');
  }
  const prior = await ctx.db
    .query('idempotency')
    .withIndex('by_key', (q) => q.eq('principalKey', access.principalKey).eq('projectId', access.project.publicId).eq('operation', 'import_commit').eq('requestKey', requestId))
    .unique();
  if (prior && prior.requestDigest !== requestDigest) throw new AppError('IDEMPOTENCY_CONFLICT', 'This requestId was already used with different content. Use a new requestId for a new request.');
  return prior;
}

/** Start (or resume) activation: verify the plan was made against current state, then lock writes. */
export const commitBegin = internalMutation({
  args: { ...commitArgs, activitySeq: v.number(), plan: v.array(v.any()), resolutions: v.optional(v.any()), archive: v.optional(v.array(v.string())) },
  handler: async (ctx, a) =>
    settleWrite(async () => {
      const p = a.principal as WirePrincipal;
      const access = await authorize(ctx, p, a.projectId, 'admin', { freshSince: a.freshSince });
      const prior = await receipt(ctx, access, a.requestId, a.requestDigest);
      if (prior) return { committed: { ...(prior.result as object), replayed: true } };
      const job = await importJob(ctx, access, a.jobId, p.userId);
      if (job.status === 'committed') return { committed: envelope(access, job.result) };
      if (job.status === 'activating') return { commitInput: job.result };
      if (job.status !== 'previewed' || job.expiresAt < access.now) throw new AppError('OPERATION_EXPIRED', 'The preview expired. Preview the import again.');
      const unresolved = unresolvedConflicts(job.preview, a.resolutions);
      if (unresolved.length) throw new AppError('VERSION_CONFLICT', `Resolve conflicts first: ${unresolved.map((c) => c.id).join(', ')}.`, { conflicts: unresolved });
      const planned = JSON.stringify(a.plan.map((c: Change) => [c.id, c.action]));
      if (planned !== JSON.stringify((job.preview.changes as Change[]).map((c) => [c.id, c.action]))) throw new AppError('VERSION_CONFLICT', 'The project changed since the preview. Preview again.');
      // The plan was computed by the action from a snapshot at this sequence; any change since then retries.
      if (access.project.activitySeq !== a.activitySeq) throw new AppError('VERSION_CONFLICT', 'The project changed while the import was being planned. Retry.', { replan: true });
      const commitInput = { resolutions: a.resolutions ?? {}, archive: a.archive ?? [], requestId: a.requestId, requestDigest: a.requestDigest };
      await ctx.db.patch(job._id, { status: 'activating', result: commitInput });
      await ctx.db.patch(access.project._id, { importing: true, updatedAt: access.now });
      return { commitInput };
    }),
});

async function activatingJob(ctx: MutationCtx, projectId: string, jobId: string) {
  const job = await ctx.db.query('jobs').withIndex('by_public', (q) => q.eq('publicId', jobId)).unique();
  const project = await ctx.db.query('projects').withIndex('by_public', (q) => q.eq('publicId', projectId)).unique();
  if (!job || !project || job.projectId !== projectId || job.status !== 'activating' || !project.importing) throw new AppError('VERSION_CONFLICT', 'The import is not being activated. Retry the commit.');
  return { job, project };
}

async function setBase(ctx: MutationCtx, projectId: string, key: string, path: string, original: string, jobId: string, version: number, hash: string) {
  const row = await ctx.db.query('nativeSources').withIndex('by_project_key', (q) => q.eq('projectId', projectId).eq('objectKey', key)).unique();
  const doc = { projectId, objectKey: key, path, original, sourceDigest: contentHash(original), importJobId: jobId, baseVersion: version, baseHash: hash };
  if (row) await ctx.db.patch(row._id, doc);
  else await ctx.db.insert('nativeSources', doc);
}

const IMPORT_ACTOR = (userId: string) => ({ kind: 'user', userId });

async function revisionOnce(ctx: MutationCtx, projectId: string, objectType: string, objectId: string, version: number, snapshot: unknown, userId: string) {
  const exists = await ctx.db.query('revisions').withIndex('by_object', (q) => q.eq('projectId', projectId).eq('objectType', objectType).eq('objectId', objectId).eq('version', version)).first();
  if (!exists) await ctx.db.insert('revisions', { projectId, objectType, objectId, version, snapshot, actor: IMPORT_ACTOR(userId), operation: 'import', createdAt: Date.now() });
}

export interface PreparedItem {
  nativeId: string;
  type: 'epic' | 'story' | 'decision';
  action: 'create' | 'update';
  title: string;
  status: string;
  body: string;
  priority?: string;
  horizon?: string;
  legacyId?: string;
  legacySource?: string[];
  unknownMeta?: Record<string, unknown>;
  rank: number;
  path: string;
  original: string;
  edges: Array<[string, string]>;
}

/** Pass 1: rows and merge bases. An item whose base already carries this job was applied by an earlier attempt. */
export const commitItems = internalMutation({
  args: { projectId: v.string(), jobId: v.string(), items: v.array(v.any()) },
  handler: async (ctx, a) =>
    settleWrite(async () => {
      await activatingJob(ctx, a.projectId, a.jobId);
      const now = Date.now();
      for (const it of a.items as PreparedItem[]) {
        const base = await ctx.db.query('nativeSources').withIndex('by_project_key', (q) => q.eq('projectId', a.projectId).eq('objectKey', it.nativeId)).unique();
        if (base?.importJobId === a.jobId) continue;
        const row = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', a.projectId).eq('nativeId', it.nativeId)).unique();
        const hash = contentHash(it.body);
        const fields = { title: it.title, status: it.status, body: it.body, priority: it.priority, horizon: it.horizon, contentHash: hash, unknownMeta: it.unknownMeta };
        let version = 1;
        if (!row) {
          await ctx.db.insert('workItems', {
            projectId: a.projectId,
            nativeId: it.nativeId,
            type: it.type,
            ...fields,
            legacyId: it.legacyId,
            legacySource: it.legacySource,
            tags: [],
            boardRank: it.rank,
            rankVersion: 1,
            version: 1,
            claimGeneration: 0,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          version = row.version + 1;
          await ctx.db.patch(row._id, { ...fields, version, updatedAt: now });
        }
        await setBase(ctx, a.projectId, it.nativeId, it.path, it.original, a.jobId, version, hash);
      }
      return null;
    }),
});

/** Pass 2: relations (targets exist after pass 1) and revisions for every touched item. */
export const commitLinks = internalMutation({
  args: { projectId: v.string(), jobId: v.string(), items: v.array(v.object({ nativeId: v.string(), edges: v.array(v.array(v.string())) })) },
  handler: async (ctx, a) =>
    settleWrite(async () => {
      const { job } = await activatingJob(ctx, a.projectId, a.jobId);
      for (const it of a.items) {
        const old = await ctx.db.query('relations').withIndex('by_source', (q) => q.eq('projectId', a.projectId).eq('sourceId', it.nativeId)).collect();
        // superseded_by is cloud-only collaboration data; native files never carry it.
        for (const o of old) if (o.kind !== 'superseded_by') await ctx.db.delete(o._id);
        const seen = new Set<string>();
        let position = 0;
        for (const [kind, target] of it.edges) {
          if (seen.has(`${kind}|${target}`)) continue;
          seen.add(`${kind}|${target}`);
          await ctx.db.insert('relations', { projectId: a.projectId, sourceId: it.nativeId, targetId: target!, kind: kind as Doc<'relations'>['kind'], position: position++ });
        }
        const row = (await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', a.projectId).eq('nativeId', it.nativeId)).unique())!;
        const s = await summarize(ctx, a.projectId, row);
        await revisionOnce(ctx, a.projectId, 'work', row.nativeId, row.version, { ...s, body: row.body }, job.ownerUserId);
      }
      return null;
    }),
});

/** Product and roadmap documents from the upload. */
export const commitDocs = internalMutation({
  args: { projectId: v.string(), jobId: v.string(), docs: v.array(v.object({ key: v.union(v.literal('product'), v.literal('roadmap')), path: v.string(), body: v.string() })) },
  handler: async (ctx, a) =>
    settleWrite(async () => {
      const { job } = await activatingJob(ctx, a.projectId, a.jobId);
      for (const d of a.docs) {
        const doc = await ensureDocument(ctx, a.projectId, d.key);
        if (doc.body === d.body) continue;
        const hash = contentHash(d.body);
        await ctx.db.patch(doc._id, { body: d.body, contentHash: hash, version: doc.version + 1, updatedAt: Date.now() });
        await revisionOnce(ctx, a.projectId, 'document', d.key, doc.version + 1, { body: d.body }, job.ownerUserId);
        await setBase(ctx, a.projectId, `doc:${d.key}`, d.path, d.body, a.jobId, doc.version + 1, hash);
      }
      return null;
    }),
});

/** Archive explicitly selected removals (never delete), record the result, release the lock. */
export const commitFinish = internalMutation({
  args: { ...commitArgs, created: v.number(), updated: v.number(), issues: v.number() },
  handler: async (ctx, a) =>
    settleWrite(async () => {
      const p = a.principal as WirePrincipal;
      const access = await authorize(ctx, p, a.projectId, 'admin', { freshSince: a.freshSince });
      const { job, project } = await activatingJob(ctx, a.projectId, a.jobId);
      const now = access.now;
      const archive: string[] = job.result?.archive ?? [];
      for (const id of archive) {
        const row = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', a.projectId).eq('nativeId', id)).unique();
        if (row && !row.archivedAt) await ctx.db.patch(row._id, { archivedAt: now, version: row.version + 1, updatedAt: now });
      }
      const result = { jobId: a.jobId, created: a.created, updated: a.updated, archived: archive.length, issues: a.issues };
      if (job.sourceFile) await ctx.storage.delete(job.sourceFile);
      await ctx.db.patch(job._id, { status: 'committed', sourceFile: undefined, result });
      const seq = project.activitySeq + 1;
      await ctx.db.insert('activity', {
        projectId: a.projectId,
        seq,
        actor: access.actor,
        operation: 'import.committed',
        objectType: 'project',
        objectId: a.projectId,
        summary: `Imported Work: ${a.created} created, ${a.updated} updated`,
        correlationId: newId('op'),
        createdAt: now,
      });
      await ctx.db.patch(project._id, { importing: false, activitySeq: seq, updatedAt: now });
      const env = envelope(access, result);
      const requestId = job.result?.requestId;
      if (typeof requestId === 'string') {
        await ctx.db.insert('idempotency', { principalKey: access.principalKey, projectId: a.projectId, operation: 'import_commit', requestKey: requestId, requestDigest: job.result.requestDigest, result: env, expiresAt: now + IDEMPOTENCY_TTL_MS });
      }
      return env;
    }),
});

// --------------------------------------------------------------- export

/** Project, documents, and (for a complete export) the namespaced collaboration data. */
export const exportExtras = internalQuery({
  args: { principal, projectId: v.string(), freshSince: v.optional(v.number()), complete: v.boolean() },
  handler: async (ctx, a) =>
    settle(async () => {
      const access = await authorize(ctx, a.principal as WirePrincipal, a.projectId, 'read', { freshSince: a.freshSince });
      const pid = a.projectId;
      const docs: Record<string, string> = {};
      for (const key of ['product', 'roadmap'] as const) {
        docs[key] = (await readDocument(ctx, pid, key)).body;
      }
      let complete: Record<string, unknown> | null = null;
      if (a.complete) {
        const iso = (t?: number) => (t ? new Date(t).toISOString() : null);
        const notes = await ctx.db.query('notes').withIndex('by_project_created', (q) => q.eq('projectId', pid)).collect();
        const revisions = await ctx.db.query('revisions').withIndex('by_project', (q) => q.eq('projectId', pid)).collect();
        const activity = await ctx.db.query('activity').withIndex('by_project_seq', (q) => q.eq('projectId', pid)).collect();
        const runs = await ctx.db.query('runs').withIndex('by_project_started', (q) => q.eq('projectId', pid)).collect();
        const claims = (await ctx.db.query('claims').withIndex('by_project_active', (q) => q.eq('projectId', pid)).collect()).sort((x, y) => x.createdAt - y.createdAt);
        const approvals = await ctx.db.query('approvals').withIndex('by_project_created', (q) => q.eq('projectId', pid)).collect();
        const controls = await ctx.db.query('controlRevisions').withIndex('by_project_revision', (q) => q.eq('projectId', pid)).collect();
        complete = {
          notes: notes.map((n) => ({ id: n.publicId, work_id: n.workId ?? null, run_id: n.runId ?? null, kind: n.kind, body: n.redactedAt ? '[redacted]' : n.body, author: n.author, corrects_note_id: n.correctsNoteId ?? null, promoted_decision_id: n.promotedDecisionId ?? null, version: n.version, redacted_at: iso(n.redactedAt), created_at: iso(n.createdAt) })),
          revisions: revisions.map((r) => ({ object_type: r.objectType, object_id: r.objectId, version: r.version, snapshot: r.snapshot, actor: r.actor, operation: r.operation, created_at: iso(r.createdAt) })),
          activity: activity.map((e) => ({ seq: e.seq, actor: e.actor, operation: e.operation, object_type: e.objectType, object_id: e.objectId, object_version: e.objectVersion ?? null, summary: e.summary, created_at: iso(e.createdAt) })),
          runs: runs.map((r) => ({ id: r.publicId, connection_id: r.connectionId, work_ids: r.workIds, name: r.name, intent: r.intent, state: r.state, summary: r.summary ?? null, blocker: r.blocker ?? null, evidence: r.evidence, started_at: iso(r.startedAt), last_report_at: iso(r.lastReportAt), ended_at: iso(r.endedAt), cancel_requested_at: iso(r.cancelRequestedAt), cancel_acknowledged_at: iso(r.cancelAcknowledgedAt) })),
          claims: claims.map((c) => ({ id: c.publicId, story_id: c.storyId, run_id: c.runId, connection_id: c.connectionId, generation: c.generation, expires_at: iso(c.expiresAt), released_at: iso(c.releasedAt), release_reason: c.releaseReason ?? null, override_by: c.overrideBy ?? null })),
          approvals: approvals.map((x) => ({ id: x.publicId, kind: x.kind, state: x.state, proposal: x.proposal, reason: x.reason, requested_by_user: x.requestedByUser, decided_by: x.decidedBy ?? null, created_at: iso(x.createdAt) })),
          controls: controls.map((c) => ({ revision: c.revision, desired: c.desired, created_by: c.createdBy, created_at: iso(c.createdAt) })),
          // Evidence is stored on runs in this deployment (no separate evidence table).
          evidence: runs.flatMap((r) => (r.evidence ?? []).map((e: any) => ({ run_id: r.publicId, work_ids: r.workIds, ...e }))),
        };
      }
      return { project: { id: access.project.publicId, name: access.project.name, slug: access.project.slug }, workspaceId: access.workspace.publicId, docs, complete };
    }),
});

export const saveExportJob = internalMutation({
  args: { workspaceId: v.string(), projectId: v.string(), userId: v.string(), result: v.any() },
  handler: async (ctx, a) => {
    const jobId = newId('job');
    const now = Date.now();
    await ctx.db.insert('jobs', { publicId: jobId, workspaceId: a.workspaceId, projectId: a.projectId, kind: 'export', ownerUserId: a.userId, operationKey: jobId, status: 'completed', result: a.result, expiresAt: now + EXPORT_TTL_MS, createdAt: now });
    return jobId;
  },
});

/** Delete an orphaned upload (preview failed after storing it). */
export const dropUpload = internalMutation({
  args: { id: v.id('_storage') },
  handler: async (ctx, a) => {
    await ctx.storage.delete(a.id).catch(() => {});
  },
});

// ------------------------------------------------------------ operations

export const READ_OPS: Record<string, ReadOp> = {
  'portability.getImport': async (ctx, p, a, f) => {
    const access = await authorize(ctx, p, a.projectId, 'read', f);
    const job = await importJob(ctx, access, a.jobId, p.userId);
    return { id: job.publicId, status: job.status, preview: job.preview ?? null, result: job.status === 'committed' ? (job.result ?? null) : null, expires_at: new Date(job.expiresAt).toISOString() };
  },
};

/**
 * 'portability.commit' is not a single transaction here: it runs as the
 * internalAction portabilityNode.commit (routed in convex/http.ts), because it
 * must read the quarantined upload from file storage and activate in batches.
 */
export const WRITE_OPS: Record<string, WriteOp> = {};
