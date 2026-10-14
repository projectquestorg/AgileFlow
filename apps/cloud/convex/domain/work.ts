import type { Doc } from '../_generated/dataModel';
import { DECISION_STATUSES, EPIC_STATUSES, HORIZONS, PRIORITIES, PRODUCT_FILE, STORY_STATUSES } from '../../../../packages/work/src/constants';
import { findDependencyCycles } from '../../../../packages/work/src/graph';
import { createId } from '../../../../packages/work/src/ids';
import { reviewTransition } from '../../../../packages/work/src/lifecycle';
import { acceptanceCriteria } from '../../../../packages/work/src/queries';
import { artifactBody, PRODUCT_TEMPLATE, ROADMAP_TEMPLATE } from '../../../../packages/work/src/templates';
import type { WorkScan } from '../../../../packages/work/src/scanner';
import type { Artifact, ArtifactType, Story } from '../../../../packages/work/src/types';
import { AppError, notFound } from '../../src/domain/errors';
import { clampLimit, cursorContext, cursors, envelope, mutate, type Access, type Ctx, type MutationContext, type MutationCtx } from '../lib/core';
import { byteLength, contentHash, utf8Slice } from '../lib/util';

void PRODUCT_FILE;

/** Convex documents are limited to 1 MiB, so bodies stay a little below it. */
export const MAX_BODY_BYTES = 900 * 1024;
export const CHUNK_BYTES = 64 * 1024;
export const MAX_TITLE = 300;

type WorkRow = Doc<'workItems'>;
type RelKind = Doc<'relations'>['kind'];

export interface Relations {
  epic?: string;
  dependsOn?: string[];
  related?: string[];
  supersededBy?: string;
}

const STATUSES: Record<ArtifactType, readonly string[]> = { story: STORY_STATUSES, epic: EPIC_STATUSES, decision: DECISION_STATUSES };
const DEFAULT_STATUS: Record<ArtifactType, string> = { story: 'backlog', epic: 'proposed', decision: 'proposed' };

function checkEnum(name: string, value: unknown, allowed: readonly string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new AppError('VALIDATION_ERROR', `${name} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim()) throw new AppError('VALIDATION_ERROR', 'title must not be empty.');
  const t = title.trim();
  if (t.length > MAX_TITLE) throw new AppError('VALIDATION_ERROR', `title must be at most ${MAX_TITLE} characters.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) throw new AppError('VALIDATION_ERROR', 'title must be a single line without control characters.');
  return t;
}

function checkBody(body: unknown): string {
  if (typeof body !== 'string') throw new AppError('VALIDATION_ERROR', 'body must be Markdown text.');
  if (byteLength(body) > MAX_BODY_BYTES) throw new AppError('VALIDATION_ERROR', `body exceeds the ${MAX_BODY_BYTES / 1024} KiB limit.`);
  return body;
}

export async function getRow(ctx: Ctx, projectId: string, nativeId: unknown): Promise<WorkRow> {
  if (typeof nativeId !== 'string') throw new AppError('VALIDATION_ERROR', 'workId is required.');
  const row = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', projectId).eq('nativeId', nativeId.trim().toUpperCase())).unique();
  if (!row) throw notFound(`Work item ${nativeId}`);
  return row;
}

export async function relationsOf(ctx: Ctx, projectId: string, nativeId: string): Promise<Relations> {
  const rows = await ctx.db.query('relations').withIndex('by_source', (q) => q.eq('projectId', projectId).eq('sourceId', nativeId)).collect();
  const rel: Relations = {};
  for (const r of rows.sort((a, b) => a.position - b.position)) {
    if (r.kind === 'parent_epic') rel.epic = r.targetId;
    else if (r.kind === 'superseded_by') rel.supersededBy = r.targetId;
    else if (r.kind === 'depends_on') (rel.dependsOn ??= []).push(r.targetId);
    else (rel.related ??= []).push(r.targetId);
  }
  return rel;
}

async function readiness(ctx: Ctx, projectId: string, row: WorkRow, rel: Relations) {
  const waitingOn: string[] = [];
  for (const d of rel.dependsOn ?? []) {
    const dep = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', projectId).eq('nativeId', d)).unique();
    // A cancelled dependency is not done.
    if (!dep || dep.status !== 'done') waitingOn.push(d);
  }
  return { dependenciesDone: !waitingOn.length, waitingOn, ready: !waitingOn.length && (row.status === 'backlog' || row.status === 'ready') };
}

export async function summarize(ctx: Ctx, projectId: string, row: WorkRow) {
  const rel = await relationsOf(ctx, projectId, row.nativeId);
  const s: Record<string, unknown> = {
    id: row.nativeId,
    type: row.type,
    title: row.title,
    status: row.status,
    ...(row.priority ? { priority: row.priority } : {}),
    ...(row.horizon ? { horizon: row.horizon } : {}),
    ...rel,
    assignee: row.assignee ?? null,
    tags: row.tags,
    rank: row.boardRank,
    version: row.version,
    contentHash: row.contentHash,
    archived: !!row.archivedAt,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
  if (row.type === 'story') {
    s.readiness = await readiness(ctx, projectId, row, rel);
    const c = acceptanceCriteria(row.body);
    s.criteria = { total: c.total, checked: c.checked };
  }
  return s as { id: string; version: number; contentHash: string } & Record<string, unknown>;
}

export function toArtifact(r: WorkRow, rel: Relations): Artifact {
  const base = { schema: 1 as const, id: r.nativeId, title: r.title, path: '', body: r.body };
  if (r.type === 'story') {
    return {
      ...base,
      type: 'story',
      status: r.status as Story['status'],
      ...(r.priority ? { priority: r.priority as Story['priority'] } : {}),
      ...(rel.epic ? { epic: rel.epic } : {}),
      ...(rel.dependsOn?.length ? { depends_on: rel.dependsOn } : {}),
      ...(r.legacyId ? { legacy_id: r.legacyId } : {}),
      ...(r.legacySource ? { legacy_source: r.legacySource } : {}),
    };
  }
  if (r.type === 'epic') {
    return {
      ...base,
      type: 'epic',
      status: r.status as never,
      ...(r.priority ? { priority: r.priority as never } : {}),
      ...(r.horizon ? { horizon: r.horizon as never } : {}),
      ...(r.legacyId ? { legacy_id: r.legacyId } : {}),
      ...(r.legacySource ? { legacy_source: r.legacySource } : {}),
    };
  }
  return { ...base, type: 'decision', status: r.status as never, ...(rel.related?.length ? { related: rel.related } : {}) };
}

async function setRelations(m: MutationContext, row: { nativeId: string; type: ArtifactType }, rel: Relations, replace: Partial<Record<keyof Relations, true>>) {
  const { ctx } = m;
  const pid = m.access.project.publicId;
  const need = async (id: unknown, types: ArtifactType[], field: string) => {
    if (typeof id !== 'string') throw new AppError('DEPENDENCY_INVALID', `${field} must contain work IDs.`);
    const norm = id.trim().toUpperCase();
    if (norm === row.nativeId) throw new AppError('DEPENDENCY_INVALID', `${field}: an item cannot reference itself.`);
    const t = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', pid).eq('nativeId', norm)).unique();
    if (!t) throw new AppError('DEPENDENCY_INVALID', `${field}: ${norm} does not exist in this project.`);
    if (!types.includes(t.type)) throw new AppError('DEPENDENCY_INVALID', `${field}: ${norm} is a ${t.type}, expected ${types.join(' or ')}.`);
    return norm;
  };
  const set = async (kind: RelKind, targets: string[]) => {
    const old = await ctx.db.query('relations').withIndex('by_source', (q) => q.eq('projectId', pid).eq('sourceId', row.nativeId).eq('kind', kind)).collect();
    for (const o of old) await ctx.db.delete(o._id);
    let position = 0;
    for (const t of targets) await ctx.db.insert('relations', { projectId: pid, sourceId: row.nativeId, targetId: t, kind, position: position++ });
  };
  if (replace.epic) {
    if (row.type !== 'story' && rel.epic) throw new AppError('VALIDATION_ERROR', 'Only stories have a parent epic.');
    await set('parent_epic', rel.epic ? [await need(rel.epic, ['epic'], 'epic')] : []);
  }
  if (replace.dependsOn) {
    if (row.type !== 'story' && rel.dependsOn?.length) throw new AppError('VALIDATION_ERROR', 'Only stories have dependencies.');
    const deps: string[] = [];
    for (const d of rel.dependsOn ?? []) {
      const n = await need(d, ['story'], 'dependsOn');
      if (!deps.includes(n)) deps.push(n);
    }
    await set('depends_on', deps);
    if (deps.length) {
      // Reject a newly introduced cycle with the native iterative cycle finder.
      const edges = await ctx.db.query('relations').withIndex('by_project_kind', (q) => q.eq('projectId', pid).eq('kind', 'depends_on')).collect();
      const graph = new Map<string, string[]>();
      for (const e of edges) (graph.get(e.sourceId) ?? graph.set(e.sourceId, []).get(e.sourceId)!).push(e.targetId);
      const cycles = findDependencyCycles([...graph].map(([id, depends_on]) => ({ id, depends_on }) as Story)).filter((c) => c.includes(row.nativeId));
      if (cycles.length) throw new AppError('DEPENDENCY_INVALID', `That would create a dependency cycle: ${cycles[0]!.join(' -> ')} -> ${cycles[0]![0]}.`);
    }
  }
  if (replace.related) {
    if (row.type !== 'decision' && rel.related?.length) throw new AppError('VALIDATION_ERROR', 'Only decisions have related items.');
    const out: string[] = [];
    for (const r of rel.related ?? []) {
      const n = await need(r, ['epic', 'story', 'decision'], 'related');
      if (!out.includes(n)) out.push(n);
    }
    await set('related', out);
  }
  if (replace.supersededBy) {
    if (row.type !== 'decision' && rel.supersededBy) throw new AppError('VALIDATION_ERROR', 'Only decisions can be superseded.');
    await set('superseded_by', rel.supersededBy ? [await need(rel.supersededBy, ['decision'], 'supersededBy')] : []);
  }
}

export interface ListFilters {
  type?: ArtifactType;
  status?: string;
  epic?: string;
  horizon?: string;
  priority?: string;
  readiness?: 'ready' | 'waiting';
  assignee?: string;
  search?: string;
  includeArchived?: boolean;
}

async function matches(ctx: Ctx, pid: string, r: WorkRow, f: ListFilters): Promise<boolean> {
  if (f.status && r.status !== f.status) return false;
  if (f.horizon && r.horizon !== checkEnum('horizon', f.horizon, HORIZONS)) return false;
  if (f.priority && r.priority !== checkEnum('priority', f.priority, PRIORITIES)) return false;
  if (f.assignee && r.assignee !== f.assignee) return false;
  if (!f.includeArchived && r.archivedAt) return false;
  if (f.search) {
    const s = f.search.toLowerCase();
    if (!r.title.toLowerCase().includes(s) && !r.nativeId.toLowerCase().includes(s)) return false;
  }
  if (f.epic || f.readiness) {
    const rel = await relationsOf(ctx, pid, r.nativeId);
    if (f.epic && rel.epic !== f.epic.toUpperCase()) return false;
    if (f.readiness) {
      if (r.type !== 'story') return false;
      const rd = await readiness(ctx, pid, r, rel);
      if (f.readiness === 'ready' ? !rd.ready : rd.dependenciesDone) return false;
    }
  }
  return true;
}

/** Keyset pagination over (type, nativeId), filtering in order; scans a bounded window per call. */
export async function list(ctx: Ctx, a: Access, f: ListFilters, cursor?: string, limit?: number) {
  const n = clampLimit(limit);
  const codec = cursors();
  const key = cursorContext(a, 'work', f);
  let after: { t: string; i: string } | null = null;
  if (cursor) {
    after = codec.decode(key, cursor) as { t: string; i: string } | null;
    if (!after) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this project, filter, or credential. Restart the listing.');
  }
  const pid = a.project.publicId;
  const types: ArtifactType[] = f.type ? [checkEnum('type', f.type, ['epic', 'story', 'decision']) as ArtifactType] : ['decision', 'epic', 'story'];
  const out: WorkRow[] = [];
  let scanned = 0;
  let last: { t: string; i: string } | null = after;
  let exhausted = true;
  outer: for (const t of types) {
    if (after && t < after.t) continue;
    const q = ctx.db
      .query('workItems')
      .withIndex('by_project_type', (ix) => (after && t === after.t ? ix.eq('projectId', pid).eq('type', t).gt('nativeId', after.i) : ix.eq('projectId', pid).eq('type', t)));
    for await (const r of q) {
      scanned++;
      last = { t: r.type, i: r.nativeId };
      if (await matches(ctx, pid, r, f)) {
        if (out.length === n) {
          exhausted = false;
          last = { t: out[n - 1]!.type, i: out[n - 1]!.nativeId };
          break outer;
        }
        out.push(r);
      }
      if (scanned >= 4000) {
        // Bounded work per request: continue from here on the next page.
        exhausted = false;
        break outer;
      }
    }
  }
  const items = [];
  for (const r of out) items.push(await summarize(ctx, pid, r));
  return envelope(a, { items, hasMore: !exhausted, nextCursor: !exhausted && last ? codec.encode(key, last) : null });
}

export function page(a: Access, objectKey: string, version: number, hash: string, body: string, cursor?: string) {
  const codec = cursors();
  const key = cursorContext(a, 'content', { objectKey });
  let offset = 0;
  if (cursor) {
    const p = codec.decode(key, cursor) as { v: number; h: string; o: number } | null;
    if (!p) throw new AppError('VALIDATION_ERROR', 'The content cursor is invalid for this object or credential.');
    if (p.v !== version || p.h !== hash) {
      throw new AppError('VERSION_CONFLICT', 'The content changed while it was being read. Restart from the first chunk; never combine chunks from different versions.', { currentVersion: version });
    }
    offset = p.o;
  }
  const total = byteLength(body);
  if (!cursor && total <= CHUNK_BYTES) return { complete: true, body, totalBytes: total };
  const { chunk, next } = utf8Slice(body, offset, CHUNK_BYTES);
  return { complete: false, body: chunk, totalBytes: total, ...(next !== null ? { contentCursor: codec.encode(key, { v: version, h: hash, o: next }) } : {}) };
}

export async function get(ctx: Ctx, a: Access, workId: string, contentCursor?: string) {
  const row = await getRow(ctx, a.project.publicId, workId);
  const s = await summarize(ctx, a.project.publicId, row);
  return envelope(a, {
    ...s,
    content: page(a, `work:${row.nativeId}`, row.version, row.contentHash, row.body, contentCursor),
    ...(row.legacyId ? { legacyId: row.legacyId } : {}),
    ...(row.unknownMeta ? { unknownMetadata: row.unknownMeta } : {}),
  });
}

export async function create(ctx: MutationCtx, a: Access, input: Record<string, any>) {
  const kind = checkEnum('kind', input.kind, ['epic', 'story', 'decision']) as ArtifactType;
  const title = checkTitle(input.title);
  const body = input.body === undefined ? artifactBody(kind, title) : checkBody(input.body);
  const status = input.status === undefined ? DEFAULT_STATUS[kind] : checkEnum('status', input.status, STATUSES[kind]);
  if (input.priority !== undefined && kind === 'decision') throw new AppError('VALIDATION_ERROR', 'Decisions have no priority.');
  if (input.horizon !== undefined && kind !== 'epic') throw new AppError('VALIDATION_ERROR', 'Only epics have a horizon.');
  const priority = input.priority === undefined ? undefined : checkEnum('priority', input.priority, PRIORITIES);
  const horizon = input.horizon === undefined ? undefined : checkEnum('horizon', input.horizon, HORIZONS);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'work_create', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    let nativeId = createId(kind);
    while (await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', pid).eq('nativeId', nativeId)).unique()) nativeId = createId(kind);
    const top = await ctx.db.query('workItems').withIndex('by_project_type_status_rank', (q) => q.eq('projectId', pid).eq('type', kind).eq('status', status)).order('desc').first();
    const id = await ctx.db.insert('workItems', {
      projectId: pid,
      nativeId,
      type: kind,
      title,
      status,
      body,
      priority,
      horizon,
      assignee: input.assignee ?? undefined,
      tags: Array.isArray(input.tags) ? input.tags.slice(0, 20) : [],
      boardRank: (top?.boardRank ?? 0) + 1,
      rankVersion: 1,
      version: 1,
      contentHash: contentHash(body),
      claimGeneration: 0,
      createdAt: m.now,
      updatedAt: m.now,
    });
    await setRelations(m, { nativeId, type: kind }, { epic: input.epic, dependsOn: input.dependsOn, related: input.related }, { epic: true, dependsOn: true, related: true });
    const s = await summarize(ctx, pid, (await ctx.db.get(id))!);
    await m.revision('work', nativeId, 1, { ...s, body }, 'create');
    await m.event({ operation: 'work.created', objectType: kind, objectId: nativeId, version: 1, summary: `Created ${kind} ${nativeId} ${title}` });
    return s;
  });
}

const PATCHABLE = new Set(['title', 'body', 'priority', 'horizon', 'epic', 'dependsOn', 'related', 'supersededBy', 'assignee', 'tags', 'rank']);

export async function update(ctx: MutationCtx, a: Access, input: Record<string, any>) {
  const patch = (input.patch ?? {}) as Record<string, any>;
  for (const k of Object.keys(patch)) {
    if (k === 'status') throw new AppError('VALIDATION_ERROR', 'Status changes use agileflow_work_transition.');
    if (!PATCHABLE.has(k)) throw new AppError('VALIDATION_ERROR', `Unknown or immutable field: ${k}.`);
  }
  if (!Number.isInteger(input.expectedVersion)) throw new AppError('VALIDATION_ERROR', 'expectedVersion is required.');
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'work_update', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const row = await getRow(ctx, pid, input.workId);
    if (row.version !== input.expectedVersion) {
      throw new AppError('VERSION_CONFLICT', `${row.nativeId} changed (now version ${row.version}). Reload it, merge, and retry.`, { currentVersion: row.version });
    }
    const next: Partial<WorkRow> = {};
    if (patch.title !== undefined) next.title = checkTitle(patch.title);
    if (patch.body !== undefined) {
      if (!input.priorContentHash) throw new AppError('CONTENT_INCOMPLETE', 'Replacing the body needs priorContentHash from a complete read of the current body.');
      if (input.priorContentHash !== row.contentHash) throw new AppError('VERSION_CONFLICT', 'The body changed since it was read. Reload the complete body and merge.', { currentVersion: row.version });
      next.body = checkBody(patch.body);
      next.contentHash = contentHash(next.body);
    }
    if (patch.priority !== undefined) {
      if (row.type === 'decision') throw new AppError('VALIDATION_ERROR', 'Decisions have no priority.');
      next.priority = patch.priority === null ? undefined : checkEnum('priority', patch.priority, PRIORITIES);
    }
    if (patch.horizon !== undefined) {
      if (row.type !== 'epic') throw new AppError('VALIDATION_ERROR', 'Only epics have a horizon.');
      next.horizon = patch.horizon === null ? undefined : checkEnum('horizon', patch.horizon, HORIZONS);
    }
    if (patch.assignee !== undefined) next.assignee = patch.assignee ?? undefined;
    if (patch.tags !== undefined) {
      if (!Array.isArray(patch.tags) || patch.tags.some((t: unknown) => typeof t !== 'string' || t.length > 50)) throw new AppError('VALIDATION_ERROR', 'tags must be short strings.');
      next.tags = patch.tags.slice(0, 20);
    }
    if (patch.rank !== undefined) {
      if (typeof patch.rank !== 'number' || !Number.isFinite(patch.rank)) throw new AppError('VALIDATION_ERROR', 'rank must be a number.');
      next.boardRank = patch.rank;
      next.rankVersion = row.rankVersion + 1;
    }
    const rel: Relations = {};
    const replace: Partial<Record<keyof Relations, true>> = {};
    if (patch.epic !== undefined) (rel.epic = patch.epic ?? undefined), (replace.epic = true);
    if (patch.dependsOn !== undefined) (rel.dependsOn = patch.dependsOn), (replace.dependsOn = true);
    if (patch.related !== undefined) (rel.related = patch.related), (replace.related = true);
    if (patch.supersededBy !== undefined) (rel.supersededBy = patch.supersededBy ?? undefined), (replace.supersededBy = true);
    if (!Object.keys(next).length && !Object.keys(replace).length) throw new AppError('VALIDATION_ERROR', 'The patch changes nothing.');
    await setRelations(m, row, rel, replace);
    await ctx.db.patch(row._id, { ...next, version: row.version + 1, updatedAt: m.now });
    const updated = (await ctx.db.get(row._id))!;
    const s = await summarize(ctx, pid, updated);
    await m.revision('work', updated.nativeId, updated.version, { ...s, body: updated.body }, 'update');
    await m.event({ operation: 'work.updated', objectType: updated.type, objectId: updated.nativeId, version: updated.version, summary: `Updated ${updated.nativeId} (${Object.keys(patch).join(', ')})` });
    return s;
  });
}

/** Native lifecycle review over the relevant records, using @agileflow/work rules. */
export async function review(ctx: Ctx, pid: string, row: WorkRow, target: string) {
  const items: WorkRow[] = [row];
  const rel = await relationsOf(ctx, pid, row.nativeId);
  for (const d of rel.dependsOn ?? []) {
    const r = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', pid).eq('nativeId', d)).unique();
    if (r) items.push(r);
  }
  if (row.type === 'epic') {
    const kids = await ctx.db.query('relations').withIndex('by_target', (q) => q.eq('projectId', pid).eq('targetId', row.nativeId).eq('kind', 'parent_epic')).collect();
    for (const k of kids) {
      const r = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', pid).eq('nativeId', k.sourceId)).unique();
      if (r) items.push(r);
    }
  }
  const scan: WorkScan = { paths: { projectRoot: '/', root: 'docs/agile', abs: '/docs/agile' }, exists: true, epics: [], stories: [], decisions: [], issues: [], revisions: new Map() };
  for (const r of items) {
    const a = toArtifact(r, await relationsOf(ctx, pid, r.nativeId));
    (a.type === 'epic' ? scan.epics : a.type === 'story' ? scan.stories : scan.decisions).push(a as never);
  }
  const artifact = [...scan.epics, ...scan.stories, ...scan.decisions].find((x) => x.id === row.nativeId)!;
  return reviewTransition(scan, artifact, target);
}

export async function transition(ctx: MutationCtx, a: Access, input: Record<string, any>, consumeApproval: (m: MutationContext, id: string | undefined, kind: string, binding: Record<string, unknown>) => Promise<string>) {
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'work_transition', requestId, payload, async (m) => {
    const pid = a.project.publicId;
    const row = await getRow(ctx, pid, input.workId);
    const target = checkEnum('targetStatus', input.targetStatus, STATUSES[row.type]);
    if (row.version !== input.expectedVersion) {
      throw new AppError('VERSION_CONFLICT', `${row.nativeId} changed (now version ${row.version}). Reload and review the move again.`, { currentVersion: row.version });
    }
    const rv = await review(ctx, pid, row, target);
    for (const w of rv.warnings) m.warn({ code: 'LIFECYCLE_WARNING', message: w, objectId: row.nativeId });
    let overridden = false;
    if (rv.blockers.length) {
      if (!input.override) throw new AppError('OVERRIDE_REQUIRED', rv.blockers.join(' '), { blockers: rv.blockers });
      if (!a.workspace.policy.allowLifecycleOverride && a.role !== 'admin') throw new AppError('FORBIDDEN', 'Lifecycle overrides are disabled for this workspace.');
      if (a.role !== 'admin') await consumeApproval(m, input.overrideApprovalId, 'lifecycle_override', { workId: row.nativeId, expectedVersion: row.version, targetStatus: target });
      overridden = true;
      m.warn({ code: 'LIFECYCLE_OVERRIDE', message: `Overridden: ${rv.blockers.join(' ')} Native validation will report this as an error.`, objectId: row.nativeId });
    }
    await ctx.db.patch(row._id, { status: target, version: row.version + 1, updatedAt: m.now });
    const updated = (await ctx.db.get(row._id))!;
    const s = await summarize(ctx, pid, updated);
    await m.revision('work', updated.nativeId, updated.version, { ...s, body: updated.body }, overridden ? 'transition_override' : 'transition');
    await m.event({
      operation: overridden ? 'work.transition_overridden' : 'work.transitioned',
      objectType: updated.type,
      objectId: updated.nativeId,
      version: updated.version,
      summary: `${updated.nativeId}: ${row.status} -> ${target}${input.reason ? ` (${String(input.reason).slice(0, 200)})` : ''}`,
    });
    return s;
  });
}

export async function board(ctx: Ctx, a: Access, f: { epic?: string; priority?: string; assignee?: string; search?: string }, columnCursors: Record<string, string> = {}, limit?: number) {
  const n = clampLimit(limit, 50);
  const codec = cursors();
  const pid = a.project.publicId;
  const columns: Record<string, unknown> = {};
  for (const status of STORY_STATUSES) {
    const key = cursorContext(a, `board:${status}`, f);
    let after: { r: number; i: string } | null = null;
    if (columnCursors[status]) {
      after = codec.decode(key, columnCursors[status]!) as { r: number; i: string } | null;
      if (!after) throw new AppError('VALIDATION_ERROR', `The ${status} column cursor is invalid. Reload the board.`);
    }
    const rows = await ctx.db.query('workItems').withIndex('by_project_type_status_rank', (q) => q.eq('projectId', pid).eq('type', 'story').eq('status', status)).collect();
    const filtered: WorkRow[] = [];
    for (const r of rows) if (await matches(ctx, pid, r, { ...f, status })) filtered.push(r);
    const rest = after ? filtered.filter((r) => r.boardRank > after!.r || (r.boardRank === after!.r && r.nativeId > after!.i)) : filtered;
    const pageRows = rest.slice(0, n);
    const last = pageRows[pageRows.length - 1];
    const items = [];
    for (const r of pageRows) items.push(await summarize(ctx, pid, r));
    columns[status] = { items, hasMore: rest.length > n, nextCursor: rest.length > n && last ? codec.encode(key, { r: last.boardRank, i: last.nativeId }) : null, total: filtered.length };
  }
  const epics = await ctx.db.query('workItems').withIndex('by_project_type', (q) => q.eq('projectId', pid).eq('type', 'epic')).collect();
  const progress = [];
  for (const e of epics.filter((x) => !x.archivedAt)) {
    const kids = await ctx.db.query('relations').withIndex('by_target', (q) => q.eq('projectId', pid).eq('targetId', e.nativeId).eq('kind', 'parent_epic')).collect();
    let done = 0;
    let cancelled = 0;
    for (const k of kids) {
      const s = await ctx.db.query('workItems').withIndex('by_project_native', (q) => q.eq('projectId', pid).eq('nativeId', k.sourceId)).unique();
      if (s?.status === 'done') done++;
      else if (s?.status === 'cancelled') cancelled++;
    }
    progress.push({ id: e.nativeId, title: e.title, status: e.status, progress: { total: kids.length, done, cancelled, open: kids.length - done - cancelled } });
  }
  return envelope(a, { columns, epics: progress });
}

export async function ensureDocument(ctx: MutationCtx, pid: string, key: 'product' | 'roadmap'): Promise<Doc<'documents'>> {
  const existing = await ctx.db.query('documents').withIndex('by_project_key', (q) => q.eq('projectId', pid).eq('key', key)).unique();
  if (existing) return existing;
  const body = key === 'product' ? PRODUCT_TEMPLATE : ROADMAP_TEMPLATE;
  const id = await ctx.db.insert('documents', { projectId: pid, key, body, version: 1, contentHash: contentHash(body), updatedAt: Date.now() });
  return (await ctx.db.get(id))!;
}

export async function readDocument(ctx: Ctx, pid: string, key: 'product' | 'roadmap') {
  const doc = await ctx.db.query('documents').withIndex('by_project_key', (q) => q.eq('projectId', pid).eq('key', key)).unique();
  if (doc) return doc;
  // Documents are created with the project; a missing one reads as the template at version 1.
  const body = key === 'product' ? PRODUCT_TEMPLATE : ROADMAP_TEMPLATE;
  return { body, version: 1, contentHash: contentHash(body), updatedAt: 0 } as Doc<'documents'>;
}

export async function documentGet(ctx: Ctx, a: Access, key: 'product' | 'roadmap', contentCursor?: string) {
  checkEnum('document', key, ['product', 'roadmap']);
  const doc = await readDocument(ctx, a.project.publicId, key);
  return envelope(a, { document: key, version: doc.version, contentHash: doc.contentHash, updatedAt: new Date(doc.updatedAt).toISOString(), content: page(a, `doc:${key}`, doc.version, doc.contentHash, doc.body, contentCursor) });
}

export async function documentUpdate(ctx: MutationCtx, a: Access, input: Record<string, any>) {
  checkEnum('document', input.document, ['product', 'roadmap']);
  const body = checkBody(input.body);
  const { requestId, ...payload } = input;
  return mutate(ctx, a, 'document_update', requestId, payload, async (m) => {
    const doc = await ensureDocument(ctx, a.project.publicId, input.document);
    if (doc.version !== input.expectedVersion || doc.contentHash !== input.priorContentHash) {
      throw new AppError('VERSION_CONFLICT', `The ${input.document} document changed (now version ${doc.version}). Reload the complete document and merge.`, { currentVersion: doc.version });
    }
    const hash = contentHash(body);
    await ctx.db.patch(doc._id, { body, contentHash: hash, version: doc.version + 1, updatedAt: m.now });
    await m.revision('document', input.document, doc.version + 1, { body }, 'update');
    await m.event({ operation: 'document.updated', objectType: 'document', objectId: input.document, version: doc.version + 1, summary: `Updated the ${input.document} document` });
    return { document: input.document, version: doc.version + 1, contentHash: hash };
  });
}
