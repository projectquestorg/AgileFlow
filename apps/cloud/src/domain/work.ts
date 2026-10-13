import {
  acceptanceCriteria,
  artifactBody,
  createId,
  DECISION_STATUSES,
  EPIC_STATUSES,
  findDependencyCycles,
  hasControlCharacters,
  HORIZONS,
  PRIORITIES,
  PRODUCT_TEMPLATE,
  reviewTransition,
  ROADMAP_TEMPLATE,
  STORY_STATUSES,
  type Artifact,
  type ArtifactType,
  type Story,
  type WorkScan,
} from '@agileflow/work';
import type { Principal } from '../auth/verify';
import { many, one, type Queryable } from '../db/sql';
import { clampLimit, type Access, type Core, type Envelope, type MutationContext } from './core';
import { AppError, notFound } from './errors';
import { contentHash, newId, utf8Slice } from './util';

export const MAX_BODY_BYTES = 1024 * 1024;
export const CHUNK_BYTES = 64 * 1024;
export const MAX_TITLE = 300;

export interface WorkRow {
  id: string;
  workspace_id: string;
  project_id: string;
  native_id: string;
  type: ArtifactType;
  title: string;
  status: string;
  body: string;
  priority: string | null;
  horizon: string | null;
  legacy_id: string | null;
  legacy_source: string[] | null;
  unknown_meta: Record<string, unknown> | null;
  assignee: string | null;
  tags: string[];
  board_rank: number;
  rank_version: number;
  archived_at: Date | null;
  version: number;
  content_hash: string;
  claim_generation: number;
  created_at: Date;
  updated_at: Date;
}

interface RelationRow {
  source_id: string;
  target_id: string;
  kind: 'parent_epic' | 'depends_on' | 'related' | 'superseded_by';
  position: number;
}

export interface Relations {
  epic?: string;
  dependsOn?: string[];
  related?: string[];
  supersededBy?: string;
}

export interface WorkSummary extends Relations {
  id: string;
  type: ArtifactType;
  title: string;
  status: string;
  priority?: string;
  horizon?: string;
  assignee: string | null;
  tags: string[];
  rank: number;
  version: number;
  contentHash: string;
  archived: boolean;
  updatedAt: string;
  readiness?: { ready: boolean; dependenciesDone: boolean; waitingOn: string[] };
  criteria?: { total: number; checked: number };
}

export interface ContentPage {
  complete: boolean;
  body: string;
  totalBytes: number;
  contentCursor?: string;
}

export interface WorkDetail extends WorkSummary {
  content: ContentPage;
  legacyId?: string;
  unknownMetadata?: Record<string, unknown>;
}

const STATUSES: Record<ArtifactType, readonly string[]> = { story: STORY_STATUSES, epic: EPIC_STATUSES, decision: DECISION_STATUSES };
const DEFAULT_STATUS: Record<ArtifactType, string> = { story: 'backlog', epic: 'proposed', decision: 'proposed' };

async function relationsFor(q: Queryable, projectId: string, ids: string[]): Promise<Map<string, Relations>> {
  const out = new Map<string, Relations>();
  if (!ids.length) return out;
  const rows = await many<RelationRow>(
    q,
    `SELECT source_id, target_id, kind, position FROM work_relations WHERE project_id = $1 AND source_id = ANY($2::text[]) ORDER BY position, target_id`,
    [projectId, ids],
  );
  for (const r of rows) {
    const rel = out.get(r.source_id) ?? {};
    if (r.kind === 'parent_epic') rel.epic = r.target_id;
    else if (r.kind === 'superseded_by') rel.supersededBy = r.target_id;
    else if (r.kind === 'depends_on') (rel.dependsOn ??= []).push(r.target_id);
    else (rel.related ??= []).push(r.target_id);
    out.set(r.source_id, rel);
  }
  return out;
}

/** Readiness per story: backlog/ready and every dependency done (cancelled is not done). */
async function readinessFor(q: Queryable, projectId: string, rows: WorkRow[]): Promise<Map<string, WorkSummary['readiness']>> {
  const stories = rows.filter((r) => r.type === 'story');
  const out = new Map<string, WorkSummary['readiness']>();
  if (!stories.length) return out;
  const waiting = await many<{ source_id: string; target_id: string }>(
    q,
    `SELECT r.source_id, r.target_id FROM work_relations r
       JOIN work_items t ON t.project_id = r.project_id AND t.native_id = r.target_id
      WHERE r.project_id = $1 AND r.kind = 'depends_on' AND r.source_id = ANY($2::text[]) AND t.status <> 'done'
      ORDER BY r.position`,
    [projectId, stories.map((s) => s.native_id)],
  );
  const by = new Map<string, string[]>();
  for (const w of waiting) (by.get(w.source_id) ?? by.set(w.source_id, []).get(w.source_id)!).push(w.target_id);
  for (const s of stories) {
    const waitingOn = by.get(s.native_id) ?? [];
    out.set(s.native_id, { dependenciesDone: !waitingOn.length, waitingOn, ready: !waitingOn.length && (s.status === 'backlog' || s.status === 'ready') });
  }
  return out;
}

export async function summarize(q: Queryable, projectId: string, rows: WorkRow[]): Promise<WorkSummary[]> {
  const ids = rows.map((r) => r.native_id);
  const [rels, ready] = await Promise.all([relationsFor(q, projectId, ids), readinessFor(q, projectId, rows)]);
  return rows.map((r) => {
    const s: WorkSummary = {
      id: r.native_id,
      type: r.type,
      title: r.title,
      status: r.status,
      ...(r.priority ? { priority: r.priority } : {}),
      ...(r.horizon ? { horizon: r.horizon } : {}),
      ...rels.get(r.native_id),
      assignee: r.assignee,
      tags: r.tags ?? [],
      rank: Number(r.board_rank),
      version: r.version,
      contentHash: r.content_hash,
      archived: !!r.archived_at,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
    if (r.type === 'story') {
      s.readiness = ready.get(r.native_id);
      const c = acceptanceCriteria(r.body);
      s.criteria = { total: c.total, checked: c.checked };
    }
    return s;
  });
}

/** Build the in-memory slice of a native scan that @agileflow/work lifecycle rules need. */
function scanOf(items: WorkRow[], rels: Map<string, Relations>): WorkScan {
  const scan: WorkScan = {
    paths: { projectRoot: '/', root: 'docs/agile', abs: '/docs/agile' },
    exists: true,
    epics: [],
    stories: [],
    decisions: [],
    issues: [],
    revisions: new Map(),
  };
  for (const r of items) scan[r.type === 'epic' ? 'epics' : r.type === 'story' ? 'stories' : 'decisions'].push(toArtifact(r, rels.get(r.native_id) ?? {}) as never);
  return scan;
}

export function toArtifact(r: WorkRow, rel: Relations): Artifact {
  const base = { schema: 1 as const, id: r.native_id, title: r.title, path: '', body: r.body };
  if (r.type === 'story') {
    return {
      ...base,
      type: 'story',
      status: r.status as Story['status'],
      ...(r.priority ? { priority: r.priority as Story['priority'] } : {}),
      ...(rel.epic ? { epic: rel.epic } : {}),
      ...(rel.dependsOn?.length ? { depends_on: rel.dependsOn } : {}),
      ...(r.legacy_id ? { legacy_id: r.legacy_id } : {}),
      ...(r.legacy_source ? { legacy_source: r.legacy_source } : {}),
    };
  }
  if (r.type === 'epic') {
    return {
      ...base,
      type: 'epic',
      status: r.status as never,
      ...(r.priority ? { priority: r.priority as never } : {}),
      ...(r.horizon ? { horizon: r.horizon as never } : {}),
      ...(r.legacy_id ? { legacy_id: r.legacy_id } : {}),
      ...(r.legacy_source ? { legacy_source: r.legacy_source } : {}),
    };
  }
  return { ...base, type: 'decision', status: r.status as never, ...(rel.related?.length ? { related: rel.related } : {}) };
}

function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim()) throw new AppError('VALIDATION_ERROR', 'title must not be empty.');
  const t = title.trim();
  if (t.length > MAX_TITLE) throw new AppError('VALIDATION_ERROR', `title must be at most ${MAX_TITLE} characters.`);
  if (hasControlCharacters(t) || /[\r\n]/.test(t)) throw new AppError('VALIDATION_ERROR', 'title must be a single line without control characters.');
  return t;
}

function checkBody(body: unknown): string {
  if (typeof body !== 'string') throw new AppError('VALIDATION_ERROR', 'body must be Markdown text.');
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new AppError('VALIDATION_ERROR', 'body exceeds the 1 MiB limit.');
  return body;
}

function checkEnum(name: string, value: unknown, allowed: readonly string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new AppError('VALIDATION_ERROR', `${name} must be one of: ${allowed.join(', ')}.`);
  return value;
}

export async function getRow(q: Queryable, projectId: string, nativeId: unknown, lock = false): Promise<WorkRow> {
  if (typeof nativeId !== 'string') throw new AppError('VALIDATION_ERROR', 'workId is required.');
  const row = await one<WorkRow>(q, `SELECT * FROM work_items WHERE project_id = $1 AND native_id = $2${lock ? ' FOR UPDATE' : ''}`, [projectId, nativeId.trim().toUpperCase()]);
  if (!row) throw notFound(`Work item ${nativeId}`);
  return row;
}

/** Validate and write relations for one item; rejects self, cross-project, missing, wrong-type and cyclic edges. */
async function writeRelations(ctx: MutationContext, row: { native_id: string; type: ArtifactType }, rel: Relations, replace: Partial<Record<keyof Relations, true>>): Promise<void> {
  const { q } = ctx;
  const projectId = ctx.access.project.id;
  const wsId = ctx.access.workspace.id;
  const need = async (id: string, types: ArtifactType[], field: string) => {
    if (typeof id !== 'string') throw new AppError('DEPENDENCY_INVALID', `${field} must contain work IDs.`);
    const norm = id.trim().toUpperCase();
    if (norm === row.native_id) throw new AppError('DEPENDENCY_INVALID', `${field}: an item cannot reference itself.`);
    const t = await one<{ type: ArtifactType }>(q, 'SELECT type FROM work_items WHERE project_id = $1 AND native_id = $2', [projectId, norm]);
    if (!t) throw new AppError('DEPENDENCY_INVALID', `${field}: ${norm} does not exist in this project.`);
    if (!types.includes(t.type)) throw new AppError('DEPENDENCY_INVALID', `${field}: ${norm} is a ${t.type}, expected ${types.join(' or ')}.`);
    return norm;
  };
  const set = async (kind: RelationRow['kind'], targets: string[]) => {
    await q.query('DELETE FROM work_relations WHERE project_id = $1 AND source_id = $2 AND kind = $3', [projectId, row.native_id, kind]);
    let pos = 0;
    for (const t of targets) {
      await q.query(
        `INSERT INTO work_relations (workspace_id, project_id, source_id, target_id, kind, position) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [wsId, projectId, row.native_id, t, kind, pos++],
      );
    }
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
      // Reject a newly introduced cycle: check the whole dependency graph once (iterative, no recursion).
      const edges = await many<{ source_id: string; target_id: string }>(q, `SELECT source_id, target_id FROM work_relations WHERE project_id = $1 AND kind = 'depends_on'`, [projectId]);
      const graph = new Map<string, string[]>();
      for (const e of edges) (graph.get(e.source_id) ?? graph.set(e.source_id, []).get(e.source_id)!).push(e.target_id);
      const cycles = findDependencyCycles([...graph].map(([id, depends_on]) => ({ id, depends_on }) as Story)).filter((c) => c.includes(row.native_id));
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

function filterSql(f: ListFilters, params: unknown[]): string {
  const where: string[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.type) add('w.type = ?', checkEnum('type', f.type, ['epic', 'story', 'decision']));
  if (f.status) add('w.status = ?', f.status);
  if (f.horizon) add('w.horizon = ?', checkEnum('horizon', f.horizon, HORIZONS));
  if (f.priority) add('w.priority = ?', checkEnum('priority', f.priority, PRIORITIES));
  if (f.assignee) add('w.assignee = ?', f.assignee);
  if (f.epic) add(`EXISTS (SELECT 1 FROM work_relations r WHERE r.project_id = w.project_id AND r.source_id = w.native_id AND r.kind = 'parent_epic' AND r.target_id = ?)`, f.epic.toUpperCase());
  if (f.search) {
    params.push(`%${String(f.search).replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    where.push(`(w.title ILIKE $${params.length} OR w.native_id ILIKE $${params.length})`);
  }
  if (!f.includeArchived) where.push('w.archived_at IS NULL');
  if (f.readiness) {
    where.push(`w.type = 'story'`);
    const waiting = `EXISTS (SELECT 1 FROM work_relations r JOIN work_items t ON t.project_id = r.project_id AND t.native_id = r.target_id
                     WHERE r.project_id = w.project_id AND r.source_id = w.native_id AND r.kind = 'depends_on' AND t.status <> 'done')`;
    where.push(f.readiness === 'ready' ? `w.status IN ('backlog', 'ready') AND NOT ${waiting}` : waiting);
  }
  return where.length ? ` AND ${where.join(' AND ')}` : '';
}

export class WorkService {
  constructor(private readonly core: Core) {}

  async list(principal: Principal, projectId: string, filters: ListFilters = {}, cursor?: string, limit?: number) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const n = clampLimit(limit);
    const ctxKey = this.core.cursorContext(access, 'work', filters);
    let after: { t: string; i: string } | null = null;
    if (cursor) {
      const p = this.core.cursors.decode(ctxKey, cursor);
      if (!p) throw new AppError('VALIDATION_ERROR', 'The cursor is invalid for this project, filter, or credential. Restart the listing.');
      after = p as { t: string; i: string };
    }
    const params: unknown[] = [projectId];
    let sql = `SELECT w.* FROM work_items w WHERE w.project_id = $1${filterSql(filters, params)}`;
    if (after) {
      params.push(after.t, after.i);
      sql += ` AND (w.type, w.native_id) > ($${params.length - 1}, $${params.length})`;
    }
    params.push(n + 1);
    sql += ` ORDER BY w.type, w.native_id LIMIT $${params.length}`;
    const rows = await many<WorkRow>(this.core.db, sql, params);
    const page = rows.slice(0, n);
    const hasMore = rows.length > n;
    const last = page[page.length - 1];
    return this.core.envelope(access, {
      items: await summarize(this.core.db, projectId, page),
      hasMore,
      nextCursor: hasMore && last ? this.core.cursors.encode(ctxKey, { t: last.type, i: last.native_id }) : null,
    });
  }

  async get(principal: Principal, projectId: string, workId: string, contentCursor?: string): Promise<Envelope<WorkDetail>> {
    const access = await this.core.authorize(principal, projectId, 'read');
    const row = await getRow(this.core.db, projectId, workId);
    const [summary] = await summarize(this.core.db, projectId, [row]);
    const content = this.page(access, `work:${row.native_id}`, row.version, row.content_hash, row.body, contentCursor);
    return this.core.envelope(access, {
      ...summary!,
      content,
      ...(row.legacy_id ? { legacyId: row.legacy_id } : {}),
      ...(row.unknown_meta ? { unknownMetadata: row.unknown_meta } : {}),
    });
  }

  /** Full body when it fits; otherwise version- and hash-bound chunks with complete=false. */
  page(access: Access, objectKey: string, version: number, hash: string, body: string, cursor?: string): ContentPage {
    const ctx = this.core.cursorContext(access, 'content', { objectKey });
    let offset = 0;
    if (cursor) {
      const p = this.core.cursors.decode(ctx, cursor) as { v: number; h: string; o: number } | null;
      if (!p) throw new AppError('VALIDATION_ERROR', 'The content cursor is invalid for this object or credential.');
      if (p.v !== version || p.h !== hash) {
        throw new AppError('VERSION_CONFLICT', 'The content changed while it was being read. Restart from the first chunk; never combine chunks from different versions.', { currentVersion: version });
      }
      offset = p.o;
    }
    const total = Buffer.byteLength(body, 'utf8');
    if (!cursor && total <= CHUNK_BYTES) return { complete: true, body, totalBytes: total };
    const { chunk, next } = utf8Slice(body, offset, CHUNK_BYTES);
    return {
      complete: false,
      body: chunk,
      totalBytes: total,
      ...(next !== null ? { contentCursor: this.core.cursors.encode(ctx, { v: version, h: hash, o: next }) } : {}),
    };
  }

  async create(
    principal: Principal,
    input: {
      projectId: string;
      kind: ArtifactType;
      title: string;
      body?: string;
      status?: string;
      priority?: string;
      horizon?: string;
      epic?: string;
      dependsOn?: string[];
      related?: string[];
      assignee?: string | null;
      tags?: string[];
      requestId: string;
    },
  ) {
    const access = await this.core.authorize(principal, input.projectId, 'work:write');
    const kind = checkEnum('kind', input.kind, ['epic', 'story', 'decision']) as ArtifactType;
    const title = checkTitle(input.title);
    const body = input.body === undefined ? artifactBody(kind, title) : checkBody(input.body);
    const status = input.status === undefined ? DEFAULT_STATUS[kind] : checkEnum('status', input.status, STATUSES[kind]);
    if (input.priority !== undefined && kind === 'decision') throw new AppError('VALIDATION_ERROR', 'Decisions have no priority.');
    if (input.horizon !== undefined && kind !== 'epic') throw new AppError('VALIDATION_ERROR', 'Only epics have a horizon.');
    const priority = input.priority === undefined ? null : checkEnum('priority', input.priority, PRIORITIES);
    const horizon = input.horizon === undefined ? null : checkEnum('horizon', input.horizon, HORIZONS);
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'work:write', 'work_create', requestId, payload, async (ctx) => {
      const { q } = ctx;
      let nativeId = '';
      for (let i = 0; i < 5; i++) {
        nativeId = createId(kind);
        if (!(await one(q, 'SELECT 1 FROM work_items WHERE project_id = $1 AND native_id = $2', [input.projectId, nativeId]))) break;
      }
      const rank = (await one<{ r: number }>(q, `SELECT COALESCE(MAX(board_rank), 0) + 1 AS r FROM work_items WHERE project_id = $1`, [input.projectId]))!.r;
      const row = (await one<WorkRow>(
        q,
        `INSERT INTO work_items (id, workspace_id, project_id, native_id, type, title, status, body, priority, horizon, assignee, tags, board_rank, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14) RETURNING *`,
        [newId('wi'), access.workspace.id, input.projectId, nativeId, kind, title, status, body, priority, horizon, input.assignee ?? null, JSON.stringify(input.tags ?? []), rank, contentHash(body)],
      ))!;
      await writeRelations(ctx, row, { epic: input.epic, dependsOn: input.dependsOn, related: input.related }, { epic: true, dependsOn: true, related: true });
      const [summary] = await summarize(q, input.projectId, [row]);
      await ctx.revision('work', nativeId, 1, { ...summary, body }, 'create');
      await ctx.event({ operation: 'work.created', objectType: kind, objectId: nativeId, version: 1, summary: `Created ${kind} ${nativeId} ${title}` });
      return summary!;
    });
  }

  async update(
    principal: Principal,
    input: {
      projectId: string;
      workId: string;
      expectedVersion: number;
      patch: {
        title?: string;
        body?: string;
        priority?: string | null;
        horizon?: string | null;
        epic?: string | null;
        dependsOn?: string[];
        related?: string[];
        supersededBy?: string | null;
        assignee?: string | null;
        tags?: string[];
        rank?: number;
      };
      priorContentHash?: string;
      requestId: string;
    },
  ) {
    const access = await this.core.authorize(principal, input.projectId, 'work:write');
    const patch = input.patch ?? {};
    const allowed = new Set(['title', 'body', 'priority', 'horizon', 'epic', 'dependsOn', 'related', 'supersededBy', 'assignee', 'tags', 'rank']);
    for (const k of Object.keys(patch)) {
      if (k === 'status') throw new AppError('VALIDATION_ERROR', 'Status changes use agileflow_work_transition.');
      if (!allowed.has(k)) throw new AppError('VALIDATION_ERROR', `Unknown or immutable field: ${k}.`);
    }
    if (!Number.isInteger(input.expectedVersion)) throw new AppError('VALIDATION_ERROR', 'expectedVersion is required.');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'work:write', 'work_update', requestId, payload, async (ctx) => {
      const { q } = ctx;
      const row = await getRow(q, input.projectId, input.workId, true);
      if (row.version !== input.expectedVersion) {
        throw new AppError('VERSION_CONFLICT', `${row.native_id} changed (now version ${row.version}). Reload it, merge, and retry.`, { currentVersion: row.version });
      }
      const sets: string[] = [];
      const params: unknown[] = [row.id];
      const set = (col: string, v: unknown, cast = '') => {
        params.push(v);
        sets.push(`${col} = $${params.length}${cast}`);
      };
      if (patch.title !== undefined) set('title', checkTitle(patch.title));
      if (patch.body !== undefined) {
        if (!input.priorContentHash) throw new AppError('CONTENT_INCOMPLETE', 'Replacing the body needs priorContentHash from a complete read of the current body.');
        if (input.priorContentHash !== row.content_hash) {
          throw new AppError('VERSION_CONFLICT', 'The body changed since it was read. Reload the complete body and merge.', { currentVersion: row.version });
        }
        const body = checkBody(patch.body);
        set('body', body);
        set('content_hash', contentHash(body));
      }
      if (patch.priority !== undefined) {
        if (row.type === 'decision') throw new AppError('VALIDATION_ERROR', 'Decisions have no priority.');
        set('priority', patch.priority === null ? null : checkEnum('priority', patch.priority, PRIORITIES));
      }
      if (patch.horizon !== undefined) {
        if (row.type !== 'epic') throw new AppError('VALIDATION_ERROR', 'Only epics have a horizon.');
        set('horizon', patch.horizon === null ? null : checkEnum('horizon', patch.horizon, HORIZONS));
      }
      if (patch.assignee !== undefined) set('assignee', patch.assignee);
      if (patch.tags !== undefined) {
        if (!Array.isArray(patch.tags) || patch.tags.some((t) => typeof t !== 'string' || t.length > 50)) throw new AppError('VALIDATION_ERROR', 'tags must be short strings.');
        set('tags', JSON.stringify(patch.tags.slice(0, 20)), '::jsonb');
      }
      if (patch.rank !== undefined) {
        if (typeof patch.rank !== 'number' || !Number.isFinite(patch.rank)) throw new AppError('VALIDATION_ERROR', 'rank must be a number.');
        set('board_rank', patch.rank);
        sets.push('rank_version = rank_version + 1');
      }
      const relPatch: Relations = {};
      const replace: Partial<Record<keyof Relations, true>> = {};
      if (patch.epic !== undefined) (relPatch.epic = patch.epic ?? undefined), (replace.epic = true);
      if (patch.dependsOn !== undefined) (relPatch.dependsOn = patch.dependsOn), (replace.dependsOn = true);
      if (patch.related !== undefined) (relPatch.related = patch.related), (replace.related = true);
      if (patch.supersededBy !== undefined) (relPatch.supersededBy = patch.supersededBy ?? undefined), (replace.supersededBy = true);
      if (!sets.length && !Object.keys(replace).length) throw new AppError('VALIDATION_ERROR', 'The patch changes nothing.');
      await writeRelations(ctx, row, relPatch, replace);
      sets.push('version = version + 1', 'updated_at = now()');
      const updated = (await one<WorkRow>(q, `UPDATE work_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params))!;
      const [summary] = await summarize(q, input.projectId, [updated]);
      await ctx.revision('work', updated.native_id, updated.version, { ...summary, body: updated.body }, 'update');
      await ctx.event({ operation: 'work.updated', objectType: updated.type, objectId: updated.native_id, version: updated.version, summary: `Updated ${updated.native_id} (${Object.keys(patch).join(', ')})` });
      return summary!;
    });
  }

  async transition(
    principal: Principal,
    input: { projectId: string; workId: string; expectedVersion: number; targetStatus: string; reason?: string; override?: boolean; overrideApprovalId?: string; requestId: string },
  ) {
    const access = await this.core.authorize(principal, input.projectId, 'work:write');
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'work:write', 'work_transition', requestId, payload, async (ctx) => {
      const { q } = ctx;
      const row = await getRow(q, input.projectId, input.workId, true);
      const target = checkEnum('targetStatus', input.targetStatus, STATUSES[row.type]);
      if (row.version !== input.expectedVersion) {
        throw new AppError('VERSION_CONFLICT', `${row.native_id} changed (now version ${row.version}). Reload and review the move again.`, { currentVersion: row.version });
      }
      const review = await this.review(q, input.projectId, row, target);
      for (const w of review.warnings) ctx.warn({ code: 'LIFECYCLE_WARNING', message: w, objectId: row.native_id });
      let overridden = false;
      if (review.blockers.length) {
        if (!input.override) {
          throw new AppError('OVERRIDE_REQUIRED', review.blockers.join(' '), { blockers: review.blockers });
        }
        if (!ctx.access.workspace.policy.allowLifecycleOverride && ctx.access.role !== 'admin') {
          throw new AppError('FORBIDDEN', 'Lifecycle overrides are disabled for this workspace.');
        }
        if (ctx.access.role !== 'admin') {
          // Everyone except a workspace admin in the dashboard needs a reviewed, single-use approval.
          await consumeApproval(ctx, input.overrideApprovalId, 'lifecycle_override', {
            workId: row.native_id,
            expectedVersion: row.version,
            targetStatus: target,
          });
        }
        overridden = true;
        ctx.warn({ code: 'LIFECYCLE_OVERRIDE', message: `Overridden: ${review.blockers.join(' ')} Native validation will report this as an error.`, objectId: row.native_id });
      }
      const updated = (await one<WorkRow>(q, `UPDATE work_items SET status = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *`, [row.id, target]))!;
      const [summary] = await summarize(q, input.projectId, [updated]);
      await ctx.revision('work', updated.native_id, updated.version, { ...summary, body: updated.body }, overridden ? 'transition_override' : 'transition');
      await ctx.event({
        operation: overridden ? 'work.transition_overridden' : 'work.transitioned',
        objectType: updated.type,
        objectId: updated.native_id,
        version: updated.version,
        summary: `${updated.native_id}: ${row.status} -> ${target}${input.reason ? ` (${input.reason.slice(0, 200)})` : ''}`,
      });
      return summary!;
    });
  }

  /** Native lifecycle review using @agileflow/work rules over the relevant records. */
  async review(q: Queryable, projectId: string, row: WorkRow, target: string) {
    const related = await many<WorkRow>(
      q,
      `SELECT w.* FROM work_items w WHERE w.project_id = $1 AND (
          w.native_id IN (SELECT target_id FROM work_relations WHERE project_id = $1 AND source_id = $2 AND kind = 'depends_on')
          OR w.native_id IN (SELECT source_id FROM work_relations WHERE project_id = $1 AND target_id = $2 AND kind = 'parent_epic'))`,
      [projectId, row.native_id],
    );
    const items = [row, ...related.filter((r) => r.id !== row.id)];
    const rels = await relationsFor(q, projectId, items.map((i) => i.native_id));
    const scan = scanOf(items, rels);
    const artifact = [...scan.epics, ...scan.stories, ...scan.decisions].find((a) => a.id === row.native_id)!;
    return reviewTransition(scan, artifact, target);
  }

  async board(principal: Principal, projectId: string, filters: { epic?: string; priority?: string; assignee?: string; search?: string } = {}, columnCursors: Record<string, string> = {}, limit?: number) {
    const access = await this.core.authorize(principal, projectId, 'read');
    const n = clampLimit(limit, 50);
    const columns: Record<string, { items: WorkSummary[]; hasMore: boolean; nextCursor: string | null; total: number }> = {};
    for (const status of STORY_STATUSES) {
      const ctxKey = this.core.cursorContext(access, `board:${status}`, filters);
      const params: unknown[] = [projectId];
      let sql = `SELECT w.* FROM work_items w WHERE w.project_id = $1 AND w.type = 'story'${filterSql({ ...filters, status }, params)}`;
      const countSql = sql.replace('SELECT w.*', 'SELECT count(*)::int AS n');
      const total = (await one<{ n: number }>(this.core.db, countSql, params))!.n;
      const c = columnCursors[status];
      if (c) {
        const p = this.core.cursors.decode(ctxKey, c) as { r: number; i: string } | null;
        if (!p) throw new AppError('VALIDATION_ERROR', `The ${status} column cursor is invalid. Reload the board.`);
        params.push(p.r, p.i);
        sql += ` AND (w.board_rank, w.native_id) > ($${params.length - 1}, $${params.length})`;
      }
      params.push(n + 1);
      sql += ` ORDER BY w.board_rank, w.native_id LIMIT $${params.length}`;
      const rows = await many<WorkRow>(this.core.db, sql, params);
      const page = rows.slice(0, n);
      const last = page[page.length - 1];
      columns[status] = {
        items: await summarize(this.core.db, projectId, page),
        hasMore: rows.length > n,
        nextCursor: rows.length > n && last ? this.core.cursors.encode(ctxKey, { r: Number(last.board_rank), i: last.native_id }) : null,
        total,
      };
    }
    const epics = await many<{ native_id: string; title: string; status: string; total: number; done: number; cancelled: number }>(
      this.core.db,
      `SELECT e.native_id, e.title, e.status,
              count(s.id)::int AS total,
              count(s.id) FILTER (WHERE s.status = 'done')::int AS done,
              count(s.id) FILTER (WHERE s.status = 'cancelled')::int AS cancelled
         FROM work_items e
         LEFT JOIN work_relations r ON r.project_id = e.project_id AND r.target_id = e.native_id AND r.kind = 'parent_epic'
         LEFT JOIN work_items s ON s.project_id = r.project_id AND s.native_id = r.source_id
        WHERE e.project_id = $1 AND e.type = 'epic' AND e.archived_at IS NULL
        GROUP BY e.native_id, e.title, e.status ORDER BY e.native_id`,
      [projectId],
    );
    return this.core.envelope(access, {
      columns,
      epics: epics.map((e) => ({ id: e.native_id, title: e.title, status: e.status, progress: { total: e.total, done: e.done, cancelled: e.cancelled, open: e.total - e.done - e.cancelled } })),
    });
  }

  async documentGet(principal: Principal, projectId: string, key: 'product' | 'roadmap', contentCursor?: string) {
    const access = await this.core.authorize(principal, projectId, 'read');
    checkEnum('document', key, ['product', 'roadmap']);
    const doc = await ensureDocument(this.core.db, access, key);
    return this.core.envelope(access, {
      document: key,
      version: doc.version,
      contentHash: doc.content_hash,
      updatedAt: new Date(doc.updated_at).toISOString(),
      content: this.page(access, `doc:${key}`, doc.version, doc.content_hash, doc.body, contentCursor),
    });
  }

  async documentUpdate(principal: Principal, input: { projectId: string; document: 'product' | 'roadmap'; body: string; expectedVersion: number; priorContentHash: string; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'work:write');
    checkEnum('document', input.document, ['product', 'roadmap']);
    const body = checkBody(input.body);
    const { requestId, ...payload } = input;
    return this.core.mutate(access, 'work:write', 'document_update', requestId, payload, async (ctx) => {
      const doc = await ensureDocument(ctx.q, ctx.access, input.document, true);
      if (doc.version !== input.expectedVersion || doc.content_hash !== input.priorContentHash) {
        throw new AppError('VERSION_CONFLICT', `The ${input.document} document changed (now version ${doc.version}). Reload the complete document and merge.`, { currentVersion: doc.version });
      }
      const updated = (await one<DocRow>(
        ctx.q,
        `UPDATE documents SET body = $3, content_hash = $4, version = version + 1, updated_at = now() WHERE project_id = $1 AND key = $2 RETURNING *`,
        [input.projectId, input.document, body, contentHash(body)],
      ))!;
      await ctx.revision('document', input.document, updated.version, { body }, 'update');
      await ctx.event({ operation: 'document.updated', objectType: 'document', objectId: input.document, version: updated.version, summary: `Updated the ${input.document} document` });
      return { document: input.document, version: updated.version, contentHash: updated.content_hash };
    });
  }
}

export interface DocRow {
  project_id: string;
  key: string;
  body: string;
  version: number;
  content_hash: string;
  updated_at: Date;
}

export async function ensureDocument(q: Queryable, access: Access, key: 'product' | 'roadmap', lock = false): Promise<DocRow> {
  const template = key === 'product' ? PRODUCT_TEMPLATE : ROADMAP_TEMPLATE;
  await q.query(
    `INSERT INTO documents (workspace_id, project_id, key, body, content_hash) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [access.workspace.id, access.project.id, key, template, contentHash(template)],
  );
  return (await one<DocRow>(q, `SELECT * FROM documents WHERE project_id = $1 AND key = $2${lock ? ' FOR UPDATE' : ''}`, [access.project.id, key]))!;
}

/**
 * Consume a single-use approval inside the caller's transaction. The approval
 * must be approved, unexpired, for this project and kind, requested by this
 * connection (or user), and its reviewed binding must match exactly.
 */
export async function consumeApproval(ctx: MutationContext, approvalId: string | undefined, kind: string, binding: Record<string, unknown>): Promise<string> {
  if (!approvalId) throw new AppError('APPROVAL_REQUIRED', `This needs a ${kind} approval. Request one with agileflow_control_request; a person approves it in the dashboard.`);
  const a = await one<{ id: string; kind: string; state: string; expires_at: Date; proposal: Record<string, unknown>; requested_by_connection: string | null; requested_by_user: string }>(
    ctx.q,
    `SELECT * FROM approvals WHERE id = $1 AND project_id = $2 FOR UPDATE`,
    [approvalId, ctx.access.project.id],
  );
  if (!a || a.kind !== kind) throw notFound('The approval');
  const requester = ctx.access.connection ? a.requested_by_connection === ctx.access.connection.id : a.requested_by_user === ctx.access.actor.userId;
  if (!requester) throw notFound('The approval');
  if (a.state === 'consumed') throw new AppError('APPROVAL_REQUIRED', 'That approval was already used. Request a new one.');
  if (a.state !== 'approved') throw new AppError('APPROVAL_REQUIRED', `That approval is ${a.state}, not approved.`);
  if (new Date(a.expires_at) < ctx.now) throw new AppError('OPERATION_EXPIRED', 'That approval expired. Request a new one.');
  for (const [k, v] of Object.entries(binding)) {
    if (JSON.stringify(a.proposal[k]) !== JSON.stringify(v)) {
      throw new AppError('APPROVAL_REQUIRED', `The approved request does not match this operation (${k} changed). Request a fresh approval for the current state.`);
    }
  }
  await ctx.q.query(`UPDATE approvals SET state = 'consumed', consumed_at = now() WHERE id = $1`, [a.id]);
  await ctx.event({ operation: 'approval.consumed', objectType: 'approval', objectId: a.id, summary: `Used ${kind} approval ${a.id}` });
  return a.id;
}
