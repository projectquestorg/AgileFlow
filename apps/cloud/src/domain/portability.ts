import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  allArtifacts,
  artifactFileName,
  DIRS,
  frontmatter,
  PRODUCT_FILE,
  README_FILE,
  README_TEMPLATE,
  resolveWorkPaths,
  ROADMAP_FILE,
  scanWorkspace,
  validateWorkspace,
  type Artifact,
  type WorkIssue,
} from '@agileflow/work';
import type { Principal } from '../auth/verify';
import { many, one, type Queryable } from '../db/sql';
import type { Access, Core, MutationContext } from './core';
import { AppError, notFound } from './errors';
import { contentHash, digest, newId } from './util';
import { ensureDocument, summarize, toArtifact, type Relations, type WorkRow } from './work';

/** Import envelope (initial targets). */
export const IMPORT_LIMITS = { files: 20_000, totalBytes: 250 * 1024 * 1024, fileBytes: 1024 * 1024 };
const PREVIEW_TTL_MS = 60 * 60_000;
const EXPORT_TTL_MS = 24 * 3600_000;
const ALLOWED_TOP = new Set<string>([README_FILE, ...Object.values(DIRS)]);

export interface ImportPreview {
  sourceDigest: string;
  counts: { epics: number; stories: number; decisions: number; documents: number };
  issues: WorkIssue[];
  errors: number;
  warnings: number;
  /** Blocking problems (duplicate IDs, invalid references, unreadable files) stop activation. */
  blocked: boolean;
  changes: Array<{ id: string; type: string; action: 'create' | 'update' | 'unchanged' | 'conflict' | 'possible-removal'; fields?: string[]; title?: string }>;
  authority: string;
}

/** Validate quarantined paths: relative, inside the Work layout, no traversal, sane encoding and size. */
export function checkFiles(files: Record<string, string>): void {
  const entries = Object.entries(files ?? {});
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
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > IMPORT_LIMITS.fileBytes) throw new AppError('VALIDATION_ERROR', `${p} exceeds 1 MiB.`);
    if (content.includes('�')) throw new AppError('VALIDATION_ERROR', `${p} is not valid UTF-8.`);
    total += bytes;
  }
  if (total > IMPORT_LIMITS.totalBytes) throw new AppError('VALIDATION_ERROR', 'The upload exceeds 250 MiB.');
}

/** Write to a private temp directory and run the native scanner/validator there. */
async function quarantineScan(files: Record<string, string>) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-import-'));
  try {
    const paths = resolveWorkPaths(dir, 'work');
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(paths.abs, rel);
      if (!abs.startsWith(paths.abs + path.sep)) throw new AppError('VALIDATION_ERROR', `Unsafe path rejected: ${rel}`);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content, { flag: 'wx' });
    }
    const scan = await scanWorkspace(paths);
    const validation = validateWorkspace(scan);
    const strip = (p?: string) => (p ? p.replace(/^work\//, '') : p);
    const issues = validation.issues.map((i) => ({ ...i, ...(i.path ? { path: strip(i.path) } : {}) }));
    // The native writer separates frontmatter and body with one blank line; that separator is not body content.
    const artifacts = allArtifacts(scan).map((a) => ({ ...a, path: strip(a.path)!, body: a.body.replace(/^\r?\n/, '') }));
    return { artifacts, issues, errors: validation.errors, warnings: validation.warnings };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

const productPath = `${DIRS.product}/${PRODUCT_FILE}`;
const roadmapPath = `${DIRS.roadmap}/${ROADMAP_FILE}`;

function fieldsOf(a: Artifact) {
  return {
    title: a.title,
    status: a.status,
    body: a.body,
    priority: (a as { priority?: string }).priority ?? null,
    horizon: (a as { horizon?: string }).horizon ?? null,
    epic: (a as { epic?: string }).epic ?? null,
    dependsOn: (a as { depends_on?: string[] }).depends_on ?? [],
    related: (a as { related?: string[] }).related ?? [],
  };
}
type Fields = ReturnType<typeof fieldsOf>;

function diffFields(a: Fields, b: Fields): string[] {
  return (Object.keys(a) as Array<keyof Fields>).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** Unknown frontmatter keys (schema-1 strictness reports them as warnings); preserved verbatim. */
function unknownMeta(original: string): Record<string, unknown> | null {
  const parsed = frontmatter.parse(original);
  if (!parsed.data) return null;
  const known = new Set(['schema', 'type', 'id', 'title', 'status', 'priority', 'horizon', 'epic', 'depends_on', 'related', 'legacy_id', 'legacy_source']);
  const extra = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !known.has(k)));
  return Object.keys(extra).length ? extra : null;
}

export class PortabilityService {
  constructor(private readonly core: Core) {}

  /**
   * Preview an import (new project) or re-import (existing project) without
   * changing anything. The preview is bound to the exact source digest.
   */
  async preview(principal: Principal, input: { projectId: string; files: Record<string, string>; operationKey: string }) {
    // Editors (including the connected CLI) can prepare a preview; only an admin commits it in the dashboard.
    const access = await this.core.authorize(principal, input.projectId, 'work:write');
    if (typeof input.operationKey !== 'string' || input.operationKey.length < 8) throw new AppError('VALIDATION_ERROR', 'operationKey must be a client-generated key of at least 8 characters.');
    checkFiles(input.files);
    const sourceDigest = digest(input.files);
    const scan = await quarantineScan(input.files);
    const current = await many<WorkRow>(this.core.db, 'SELECT * FROM work_items WHERE project_id = $1', [input.projectId]);
    const changes = await this.plan(this.core.db, access, scan.artifacts, current);
    const structural = scan.issues.some((i) => i.level === 'error' && /duplicate|unknown epic|unknown story|depends on itself|dependency cycle|references unknown|invalid|could not|schema/i.test(i.message));
    const preview: ImportPreview = {
      sourceDigest,
      counts: {
        epics: scan.artifacts.filter((a) => a.type === 'epic').length,
        stories: scan.artifacts.filter((a) => a.type === 'story').length,
        decisions: scan.artifacts.filter((a) => a.type === 'decision').length,
        documents: [productPath, roadmapPath].filter((p) => p in input.files).length,
      },
      issues: scan.issues,
      errors: scan.errors,
      warnings: scan.warnings,
      blocked: structural || scan.issues.some((i) => i.code === 'invalid'),
      changes,
      authority: 'After import, this project is connected: the AgileFlow service is the source of truth. Local files become exports and explicit re-import input; they are not modified by this upload.',
    };
    const job = await one<{ id: string; status: string; source_digest: string }>(
      this.core.db,
      `INSERT INTO jobs (id, workspace_id, project_id, kind, owner_user_id, operation_key, source_digest, status, preview, source, expires_at)
       VALUES ($1, $2, $3, 'import', $4, $5, $6, 'previewed', $7::jsonb, $9::jsonb, $8)
       ON CONFLICT (workspace_id, owner_user_id, kind, operation_key) DO UPDATE SET preview = EXCLUDED.preview, source = EXCLUDED.source, source_digest = EXCLUDED.source_digest, expires_at = EXCLUDED.expires_at
         WHERE jobs.status = 'previewed'
       RETURNING id, status, source_digest`,
      [newId('job'), access.workspace.id, input.projectId, principal.userId, input.operationKey, sourceDigest, JSON.stringify(preview), new Date(this.core.now().getTime() + PREVIEW_TTL_MS), JSON.stringify(input.files)],
    );
    if (!job) throw new AppError('IDEMPOTENCY_CONFLICT', 'That operation key was already used for a committed import. Use a new key.');
    return this.core.envelope(access, { jobId: job.id, preview });
  }

  /** Three-way plan: base (last imported/exported), incoming, and current cloud record. */
  private async plan(q: Queryable, access: Access, incoming: Artifact[], current: WorkRow[]): Promise<ImportPreview['changes']> {
    const byId = new Map(current.map((r) => [r.native_id, r]));
    const rels = await relationMap(q, access.project.id);
    const changes: ImportPreview['changes'] = [];
    const seen = new Set<string>();
    for (const a of incoming) {
      seen.add(a.id);
      const row = byId.get(a.id);
      if (!row) {
        changes.push({ id: a.id, type: a.type, action: 'create', title: a.title });
        continue;
      }
      const cur = fieldsOf(toArtifact(row, rels.get(row.native_id) ?? {}));
      const inc = fieldsOf(a);
      if (!diffFields(cur, inc).length) {
        changes.push({ id: a.id, type: a.type, action: 'unchanged' });
        continue;
      }
      const base = await baseFields(q, access.project.id, a.id);
      if (base) {
        const cloudChanged = diffFields(base, cur).length > 0;
        const fileChanged = diffFields(base, inc);
        if (!fileChanged.length) changes.push({ id: a.id, type: a.type, action: 'unchanged' });
        else if (!cloudChanged) changes.push({ id: a.id, type: a.type, action: 'update', fields: fileChanged });
        else changes.push({ id: a.id, type: a.type, action: 'conflict', fields: diffFields(cur, inc) });
      } else {
        // No merge base: never guess; require an explicit choice.
        changes.push({ id: a.id, type: a.type, action: 'conflict', fields: diffFields(cur, inc) });
      }
    }
    // A missing file means no change; it is only reported.
    if (current.length) for (const r of current) if (!seen.has(r.native_id) && !r.archived_at) changes.push({ id: r.native_id, type: r.type, action: 'possible-removal', title: r.title });
    return changes;
  }

  /**
   * Commit a previewed import atomically. Conflicts need an explicit
   * resolution ('cloud' keeps the current record, 'incoming' takes the file).
   * Retrying with the same job is safe; the source must match the preview.
   */
  async commit(principal: Principal, input: { projectId: string; jobId: string; files?: Record<string, string>; resolutions?: Record<string, 'cloud' | 'incoming'>; archive?: string[]; requestId: string }) {
    const access = await this.core.authorize(principal, input.projectId, 'admin');
    const job = await one<{ id: string; status: string; source_digest: string; preview: ImportPreview; source: Record<string, string> | null; expires_at: Date; owner_user_id: string; result: unknown }>(
      this.core.db,
      `SELECT * FROM jobs WHERE id = $1 AND project_id = $2 AND kind = 'import'`,
      [input.jobId, input.projectId],
    );
    if (!job || job.owner_user_id !== principal.userId) throw notFound('The import preview');
    if (job.status === 'committed') return this.core.envelope(access, job.result as Record<string, unknown>);
    if (new Date(job.expires_at) < this.core.now()) throw new AppError('OPERATION_EXPIRED', 'The preview expired. Preview the import again.');
    // The quarantined upload is kept with the preview, so a person can confirm a CLI-prepared import.
    const files = input.files ?? job.source ?? {};
    if (digest(files) !== job.source_digest) throw new AppError('VERSION_CONFLICT', 'The files changed since the preview. Preview again.');
    if (job.preview.blocked) throw new AppError('VALIDATION_ERROR', 'The preview has blocking problems (duplicate IDs, invalid references, or unreadable files). Fix them and preview again.');
    const unresolved = job.preview.changes.filter((c) => c.action === 'conflict' && !input.resolutions?.[c.id]);
    if (unresolved.length) throw new AppError('VERSION_CONFLICT', `Resolve conflicts first: ${unresolved.map((c) => c.id).join(', ')}.`, { conflicts: unresolved });
    const scan = await quarantineScan(files);
    const { requestId, files: _files, ...payload } = input;
    return this.core.mutate(access, 'admin', 'import_commit', requestId, { ...payload, sourceDigest: job.source_digest }, async (ctx) => {
      // The plan is recomputed inside the transaction against the locked current state.
      const current = await many<WorkRow>(ctx.q, 'SELECT * FROM work_items WHERE project_id = $1', [input.projectId]);
      const plan = await this.plan(ctx.q, ctx.access, scan.artifacts, current);
      const planned = JSON.stringify(plan.map((c) => [c.id, c.action]));
      if (planned !== JSON.stringify(job.preview.changes.map((c) => [c.id, c.action]))) {
        throw new AppError('VERSION_CONFLICT', 'The project changed since the preview. Preview again.');
      }
      const byId = new Map(scan.artifacts.map((a) => [a.id, a]));
      let created = 0;
      let updated = 0;
      // Pass 1: rows. Pass 2: relations (targets exist after pass 1).
      const touched: Artifact[] = [];
      for (const c of plan) {
        const a = byId.get(c.id);
        if (!a) continue;
        const take = c.action === 'create' || c.action === 'update' || (c.action === 'conflict' && input.resolutions?.[c.id] === 'incoming');
        const original = files[a.path] ?? '';
        if (c.action === 'create') {
          await ctx.q.query(
            `INSERT INTO work_items (id, workspace_id, project_id, native_id, type, title, status, body, priority, horizon, legacy_id, legacy_source, unknown_meta, board_rank, content_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15)`,
            [newId('wi'), ctx.access.workspace.id, input.projectId, a.id, a.type, a.title, a.status, a.body, (a as any).priority ?? null, (a as any).horizon ?? null, (a as any).legacy_id ?? null, (a as any).legacy_source ? JSON.stringify((a as any).legacy_source) : null, JSON.stringify(unknownMeta(original)), ++created, contentHash(a.body)],
          );
          touched.push(a);
        } else if (take) {
          await ctx.q.query(
            `UPDATE work_items SET title = $3, status = $4, body = $5, priority = $6, horizon = $7, content_hash = $8, unknown_meta = $9::jsonb, version = version + 1, updated_at = now()
              WHERE project_id = $1 AND native_id = $2`,
            [input.projectId, a.id, a.title, a.status, a.body, (a as any).priority ?? null, (a as any).horizon ?? null, contentHash(a.body), JSON.stringify(unknownMeta(original))],
          );
          updated++;
          touched.push(a);
        }
      }
      for (const a of touched) {
        await ctx.q.query(`DELETE FROM work_relations WHERE project_id = $1 AND source_id = $2`, [input.projectId, a.id]);
        const edges: Array<[string, string]> = [];
        if (a.type === 'story') {
          if (a.epic) edges.push(['parent_epic', a.epic]);
          for (const d of a.depends_on ?? []) edges.push(['depends_on', d]);
        }
        if (a.type === 'decision') for (const r of a.related ?? []) edges.push(['related', r]);
        let pos = 0;
        for (const [kind, target] of edges) {
          await ctx.q.query(
            `INSERT INTO work_relations (workspace_id, project_id, source_id, target_id, kind, position) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            [ctx.access.workspace.id, input.projectId, a.id, target, kind, pos++],
          );
        }
      }
      // Revisions and merge bases for every touched item.
      const rows = await many<WorkRow>(ctx.q, 'SELECT * FROM work_items WHERE project_id = $1 AND native_id = ANY($2::text[])', [input.projectId, touched.map((t) => t.id)]);
      const summaries = await summarize(ctx.q, input.projectId, rows);
      for (const r of rows) {
        const a = byId.get(r.native_id)!;
        await ctx.revision('work', r.native_id, r.version, { ...summaries.find((s) => s.id === r.native_id), body: r.body }, 'import');
        await setBase(ctx, r.native_id, a.path, files[a.path] ?? '', input.jobId, r.version, r.content_hash);
      }
      for (const [key, p] of [['product', productPath], ['roadmap', roadmapPath]] as const) {
        if (!(p in files)) continue;
        const doc = await ensureDocument(ctx.q, ctx.access, key, true);
        const body = files[p]!;
        if (doc.body !== body) {
          const d = (await one<{ version: number; content_hash: string }>(ctx.q, `UPDATE documents SET body = $3, content_hash = $4, version = version + 1, updated_at = now() WHERE project_id = $1 AND key = $2 RETURNING version, content_hash`, [input.projectId, key, body, contentHash(body)]))!;
          await ctx.revision('document', key, d.version, { body }, 'import');
          await setBase(ctx, `doc:${key}`, p, body, input.jobId, d.version, d.content_hash);
        }
      }
      // Explicitly selected removals archive (never delete) records.
      for (const id of input.archive ?? []) {
        await ctx.q.query('UPDATE work_items SET archived_at = now(), version = version + 1, updated_at = now() WHERE project_id = $1 AND native_id = $2 AND archived_at IS NULL', [input.projectId, id]);
      }
      const result = { jobId: input.jobId, created, updated, archived: (input.archive ?? []).length, issues: scan.issues.length };
      await ctx.q.query(`UPDATE jobs SET status = 'committed', source = NULL, result = $2::jsonb WHERE id = $1`, [input.jobId, JSON.stringify(result)]);
      await ctx.event({ operation: 'import.committed', objectType: 'project', objectId: input.projectId, summary: `Imported Work: ${created} created, ${updated} updated` });
      return result;
    });
  }

  /**
   * Native export (schema-1 Work files, baseline-readable) plus the complete
   * export (namespaced collaboration JSON). Unchanged imported originals are
   * returned byte-for-byte. Credentials and private logs are never included.
   */
  async export(principal: Principal, input: { projectId: string; complete?: boolean; recordBase?: boolean }) {
    const access = await this.core.authorize(principal, input.projectId, input.recordBase ? 'work:write' : 'read');
    const pid = input.projectId;
    const rows = await many<WorkRow>(this.core.db, 'SELECT * FROM work_items WHERE project_id = $1 ORDER BY type, native_id', [pid]);
    const rels = await relationMap(this.core.db, pid);
    const sources = new Map(
      (await many<{ object_key: string; path: string; original: string; base_version: number }>(this.core.db, 'SELECT object_key, path, original, base_version FROM native_sources WHERE project_id = $1', [pid])).map((s) => [s.object_key, s]),
    );
    const files: Record<string, string> = { [README_FILE]: README_TEMPLATE };
    const fidelity: Record<string, 'original' | 'normalized'> = {};
    for (const r of rows) {
      const src = sources.get(r.native_id);
      if (src && src.base_version === r.version) {
        files[src.path] = src.original;
        fidelity[src.path] = 'original';
        continue;
      }
      const a = toArtifact(r, rels.get(r.native_id) ?? {});
      const { path: _p, body, ...data } = a as Artifact & Record<string, unknown>;
      const rel = src?.path ?? `${DIRS[r.type]}/${artifactFileName(r.native_id, r.title)}`;
      files[rel] = frontmatter.serialize({ ...data, ...(r.unknown_meta ?? {}) }, body);
      fidelity[rel] = 'normalized';
    }
    for (const key of ['product', 'roadmap'] as const) {
      const doc = await ensureDocument(this.core.db, access, key);
      files[key === 'product' ? productPath : roadmapPath] = doc.body;
    }
    const validation = await quarantineScan(Object.fromEntries(Object.entries(files)));
    const report = { errors: validation.errors, warnings: validation.warnings, issues: validation.issues, fidelity, note: 'Native validation findings keep their original severity, including recorded lifecycle overrides.' };
    let complete: Record<string, unknown> | undefined;
    if (input.complete) {
      const q = this.core.db;
      complete = {
        'agileflow-connected/project.json': { id: access.project.id, name: access.project.name, slug: access.project.slug, archived: rows.filter((r) => r.archived_at).map((r) => r.native_id) },
        'agileflow-connected/collaboration.json': Object.fromEntries(rows.map((r) => [r.native_id, { assignee: r.assignee, tags: r.tags, rank: r.board_rank, archivedAt: r.archived_at, supersededBy: rels.get(r.native_id)?.supersededBy ?? null }])),
        'agileflow-connected/notes.json': (await many(q, `SELECT id, work_id, run_id, kind, CASE WHEN redacted_at IS NULL THEN body ELSE '[redacted]' END AS body, author, corrects_note_id, promoted_decision_id, version, redacted_at, created_at FROM notes WHERE project_id = $1 ORDER BY created_at, id`, [pid])),
        'agileflow-connected/revisions.json': await many(q, 'SELECT object_type, object_id, version, snapshot, actor, operation, created_at FROM revisions WHERE project_id = $1 ORDER BY id', [pid]),
        'agileflow-connected/activity.json': await many(q, 'SELECT seq, actor, operation, object_type, object_id, object_version, summary, created_at FROM activity_events WHERE project_id = $1 ORDER BY seq', [pid]),
        'agileflow-connected/runs.json': await many(q, 'SELECT id, connection_id, work_ids, name, intent, state, summary, blocker, evidence, started_at, last_report_at, ended_at, cancel_requested_at, cancel_acknowledged_at FROM runs WHERE project_id = $1 ORDER BY started_at', [pid]),
        'agileflow-connected/claims.json': await many(q, 'SELECT id, story_id, run_id, connection_id, generation, expires_at, released_at, release_reason, override_by FROM claims WHERE project_id = $1 ORDER BY created_at', [pid]),
        'agileflow-connected/approvals.json': await many(q, 'SELECT id, kind, state, proposal, reason, requested_by_user, decided_by, created_at FROM approvals WHERE project_id = $1 ORDER BY created_at', [pid]),
        'agileflow-connected/controls.json': await many(q, 'SELECT revision, desired, created_by, created_at FROM control_revisions WHERE project_id = $1 ORDER BY revision', [pid]),
        'agileflow-connected/evidence.json': await many(q, 'SELECT id, work_id, run_id, url, kind, provenance, observed, created_at FROM evidence_links WHERE project_id = $1 ORDER BY created_at', [pid]),
      };
    }
    if (input.recordBase) {
      // The CLI records this export as the merge base for the next re-import.
      await this.core.db.tx(async (q) => {
        for (const r of rows) {
          const rel = Object.entries(files).find(([, c]) => frontmatter.parse(c).data?.id === r.native_id)?.[0];
          if (!rel) continue;
          await q.query(
            `INSERT INTO native_sources (workspace_id, project_id, object_key, path, original, source_digest, import_job_id, base_version, base_hash)
             VALUES ($1, $2, $3, $4, $5, $6, 'export', $7, $8)
             ON CONFLICT (project_id, object_key) DO UPDATE SET path = EXCLUDED.path, original = EXCLUDED.original, source_digest = EXCLUDED.source_digest, import_job_id = 'export', base_version = EXCLUDED.base_version, base_hash = EXCLUDED.base_hash`,
            [access.workspace.id, pid, r.native_id, rel, files[rel], contentHash(files[rel]!), r.version, r.content_hash],
          );
        }
      });
    }
    const jobId = newId('job');
    await this.core.db.query(
      `INSERT INTO jobs (id, workspace_id, project_id, kind, owner_user_id, operation_key, status, result, expires_at) VALUES ($1, $2, $3, 'export', $4, $1, 'completed', $5::jsonb, $6)`,
      [jobId, access.workspace.id, pid, principal.userId, JSON.stringify({ files: Object.keys(files).length, complete: !!input.complete, errors: report.errors }), new Date(this.core.now().getTime() + EXPORT_TTL_MS)],
    );
    return this.core.envelope(access, { jobId, root: 'docs/agile', files, report, ...(complete ? { complete } : {}) });
  }
}

async function relationMap(q: Queryable, projectId: string): Promise<Map<string, Relations>> {
  const rows = await many<{ source_id: string; target_id: string; kind: string }>(q, 'SELECT source_id, target_id, kind FROM work_relations WHERE project_id = $1 ORDER BY position, target_id', [projectId]);
  const out = new Map<string, Relations>();
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

async function baseFields(q: Queryable, projectId: string, nativeId: string): Promise<Fields | null> {
  const src = await one<{ original: string }>(q, 'SELECT original FROM native_sources WHERE project_id = $1 AND object_key = $2', [projectId, nativeId]);
  if (!src) return null;
  const parsed = frontmatter.parse(src.original);
  if (!parsed.data) return null;
  const d = parsed.data as Record<string, any>;
  return { title: d.title, status: d.status, body: parsed.body.replace(/^\r?\n/, ''), priority: d.priority ?? null, horizon: d.horizon ?? null, epic: d.epic ?? null, dependsOn: d.depends_on ?? [], related: d.related ?? [] };
}

async function setBase(ctx: MutationContext, key: string, p: string, original: string, jobId: string, version: number, hash: string) {
  await ctx.q.query(
    `INSERT INTO native_sources (workspace_id, project_id, object_key, path, original, source_digest, import_job_id, base_version, base_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (project_id, object_key) DO UPDATE SET path = EXCLUDED.path, original = EXCLUDED.original, source_digest = EXCLUDED.source_digest,
       import_job_id = EXCLUDED.import_job_id, base_version = EXCLUDED.base_version, base_hash = EXCLUDED.base_hash`,
    [ctx.access.workspace.id, ctx.access.project.id, key, p, original, contentHash(original), jobId, version, hash],
  );
}
