'use node';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, type ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { DIRS, PRODUCT_FILE, ROADMAP_FILE, README_FILE } from '../../../packages/work/src/constants';
import * as frontmatter from '../../../packages/work/src/frontmatter';
import { artifactFileName, resolveWorkPaths } from '../../../packages/work/src/paths';
import { allArtifacts, scanWorkspace } from '../../../packages/work/src/scanner';
import { README_TEMPLATE } from '../../../packages/work/src/templates';
import { validateWorkspace } from '../../../packages/work/src/validate';
import type { Artifact, WorkIssue } from '../../../packages/work/src/types';
import { AppError } from '../src/domain/errors';
import { clerkMembershipSource, UpstreamUnavailable, type MembershipInfo } from '../src/auth/membership';
import { checkFiles, type Change, type PreparedItem, type SnapshotItem } from './domain/portability';
import { toArtifact } from './domain/work';
import { digest, newId } from './lib/util';
import type { WirePrincipal } from './lib/core';

/**
 * Node runtime half of import/export: the quarantine scan uses the native
 * @agileflow/work scanner and validator in a private temp directory, exactly
 * like the Postgres service. Records are read and written only through the
 * internal queries/mutations in domain/portability.ts, which re-authorize.
 */

type Outcome = { ok: true; value: any } | { ok: false; error: Record<string, unknown>; status: number } | { ok: false; scope: string[] };

const fail = (err: AppError): Outcome => ({ ok: false, error: err.toJSON(), status: err.status });

/** Run an internal mutation; a domain failure arrives as ConvexError carrying the outcome. */
async function write<T>(fn: () => Promise<T>): Promise<T | Outcome> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ConvexError) return err.data as Outcome;
    throw err;
  }
}

const isFailure = (o: unknown): o is Exclude<Outcome, { ok: true }> => !!o && typeof o === 'object' && (o as Outcome).ok === false;

/**
 * Membership freshness, the same rules as runOp in http.ts: writes always
 * re-verify upstream; reads re-verify when the mirror is older than 55 s.
 */
export async function freshen(ctx: ActionCtx, p: WirePrincipal, write: boolean): Promise<{ freshSince?: number } | Exclude<Outcome, { ok: true }>> {
  if (!p.orgId) {
    if (p.kind === 'token') await ctx.runMutation(internal.ops.prepare, { principal: p, refreshMembership: false });
    return {};
  }
  let refresh = write;
  if (!refresh) {
    const age = (await ctx.runQuery(internal.ops.membershipAge, { orgId: p.orgId, userId: p.userId })) as number | null;
    refresh = age === null || age > 55_000;
  }
  let membership: MembershipInfo | null | undefined;
  let freshSince: number | undefined;
  if (refresh) {
    freshSince = Date.now();
    try {
      if (process.env.AGILEFLOW_DEV_AUTH === '1') membership = (await ctx.runQuery(internal.dev.directoryGet, { orgId: p.orgId, userId: p.userId })) as MembershipInfo | null;
      else {
        const secret = process.env.CLERK_SECRET_KEY;
        if (!secret) throw new UpstreamUnavailable('CLERK_SECRET_KEY is not set for this deployment.');
        membership = await clerkMembershipSource(secret, process.env.CLERK_API_URL ?? 'https://api.clerk.com').fetch(p.orgId, p.userId);
      }
    } catch (err) {
      if (err instanceof UpstreamUnavailable) return { ok: false, error: { code: 'UPSTREAM_UNAVAILABLE', message: err.message, retryable: true }, status: 503 };
      throw err;
    }
  }
  await ctx.runMutation(internal.ops.prepare, { principal: p, membership: membership ?? undefined, refreshMembership: refresh });
  return { freshSince };
}

// ------------------------------------------------------------ pure logic

/** Write to a private temp directory and run the native scanner/validator there. */
export async function quarantineScan(files: Record<string, string>) {
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
    const issues: WorkIssue[] = validation.issues.map((i) => ({ ...i, ...(i.path ? { path: strip(i.path) } : {}) }));
    // The native writer separates frontmatter and body with one blank line; that separator is not body content.
    const artifacts = allArtifacts(scan).map((a) => ({ ...a, path: strip(a.path)!, body: a.body.replace(/^\r?\n/, '') }));
    return { artifacts, issues, errors: validation.errors, warnings: validation.warnings };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

export const productPath = `${DIRS.product}/${PRODUCT_FILE}`;
export const roadmapPath = `${DIRS.roadmap}/${ROADMAP_FILE}`;

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

const diffFields = (a: Fields, b: Fields): string[] => (Object.keys(a) as Array<keyof Fields>).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

function baseFields(original: string | undefined): Fields | null {
  if (original === undefined) return null;
  const parsed = frontmatter.parse(original);
  if (!parsed.data) return null;
  const d = parsed.data as Record<string, any>;
  return { title: d.title, status: d.status, body: parsed.body.replace(/^\r?\n/, ''), priority: d.priority ?? null, horizon: d.horizon ?? null, epic: d.epic ?? null, dependsOn: d.depends_on ?? [], related: d.related ?? [] };
}

/** Unknown frontmatter keys (schema-1 strictness reports them as warnings); preserved verbatim. */
export function unknownMeta(original: string): Record<string, unknown> | undefined {
  const parsed = frontmatter.parse(original);
  if (!parsed.data) return undefined;
  const known = new Set(['schema', 'type', 'id', 'title', 'status', 'priority', 'horizon', 'epic', 'depends_on', 'related', 'legacy_id', 'legacy_source']);
  const extra = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !known.has(k)));
  return Object.keys(extra).length ? extra : undefined;
}

const rowArtifact = (s: SnapshotItem) => toArtifact(s.row as never, s.rel);

/** Three-way plan: base (last imported/exported), incoming, and current cloud record. */
export function plan(incoming: Artifact[], current: SnapshotItem[]): Change[] {
  const byId = new Map(current.map((s) => [s.row.nativeId, s]));
  const changes: Change[] = [];
  const seen = new Set<string>();
  for (const a of incoming) {
    seen.add(a.id);
    const s = byId.get(a.id);
    if (!s) {
      changes.push({ id: a.id, type: a.type, action: 'create', title: a.title });
      continue;
    }
    const cur = fieldsOf(rowArtifact(s));
    const inc = fieldsOf(a);
    if (!diffFields(cur, inc).length) {
      changes.push({ id: a.id, type: a.type, action: 'unchanged' });
      continue;
    }
    const base = baseFields(s.source?.original);
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
  for (const s of current) if (!seen.has(s.row.nativeId) && !s.row.archivedAt) changes.push({ id: s.row.nativeId, type: s.row.type, action: 'possible-removal', title: s.row.title });
  return changes;
}

const STRUCTURAL = /duplicate|unknown epic|unknown story|depends on itself|dependency cycle|references unknown|invalid|could not|schema/i;

export function buildPreview(files: Record<string, string>, scan: Awaited<ReturnType<typeof quarantineScan>>, changes: Change[]) {
  const structural = scan.issues.some((i) => i.level === 'error' && STRUCTURAL.test(i.message));
  return {
    sourceDigest: digest(files),
    counts: {
      epics: scan.artifacts.filter((a) => a.type === 'epic').length,
      stories: scan.artifacts.filter((a) => a.type === 'story').length,
      decisions: scan.artifacts.filter((a) => a.type === 'decision').length,
      documents: [productPath, roadmapPath].filter((p) => p in files).length,
    },
    issues: scan.issues,
    errors: scan.errors,
    warnings: scan.warnings,
    blocked: structural || scan.issues.some((i) => i.code === 'invalid'),
    changes,
    authority: 'After import, this project is connected: the AgileFlow service is the source of truth. Local files become exports and explicit re-import input; they are not modified by this upload.',
  };
}

/** Rows to write for a plan: creates, updates, and conflicts resolved to the incoming file. */
export function prepareItems(changes: Change[], artifacts: Artifact[], files: Record<string, string>, resolutions: Record<string, string>): PreparedItem[] {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const out: PreparedItem[] = [];
  let rank = 0;
  for (const c of changes) {
    const a = byId.get(c.id);
    if (!a) continue;
    const take = c.action === 'create' || c.action === 'update' || (c.action === 'conflict' && resolutions[c.id] === 'incoming');
    if (!take) continue;
    const x = a as Artifact & Record<string, any>;
    const edges: Array<[string, string]> = [];
    if (a.type === 'story') {
      if (x.epic) edges.push(['parent_epic', x.epic]);
      for (const d of x.depends_on ?? []) edges.push(['depends_on', d]);
    }
    if (a.type === 'decision') for (const r of x.related ?? []) edges.push(['related', r]);
    const original = files[a.path] ?? '';
    out.push({
      nativeId: a.id,
      type: a.type,
      action: c.action === 'create' ? 'create' : 'update',
      title: a.title,
      status: a.status,
      body: a.body,
      ...(x.priority ? { priority: x.priority } : {}),
      ...(x.horizon ? { horizon: x.horizon } : {}),
      ...(c.action === 'create' && x.legacy_id ? { legacyId: x.legacy_id } : {}),
      ...(c.action === 'create' && x.legacy_source ? { legacySource: x.legacy_source } : {}),
      ...(unknownMeta(original) ? { unknownMeta: unknownMeta(original) } : {}),
      rank: c.action === 'create' ? ++rank : 0,
      path: a.path,
      original,
      edges,
    });
  }
  return out;
}

/** Split into batches by count and bytes, so each mutation stays inside Convex limits. */
export function batches<T>(items: T[], size: (t: T) => number, maxItems = 100, maxBytes = 4 * 1024 * 1024): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const it of items) {
    const n = size(it);
    if (cur.length && (cur.length >= maxItems || bytes + n > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(it);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---------------------------------------------------------- record reads

async function loadState(ctx: ActionCtx, projectId: string): Promise<{ items: SnapshotItem[]; activitySeq: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const items: SnapshotItem[] = [];
    let cursor: string | null = null;
    let seq: number | null = null;
    let consistent = true;
    for (;;) {
      const page: { items: SnapshotItem[]; isDone: boolean; continueCursor: string; activitySeq: number } = await ctx.runQuery(internal.domain.portability.snapshot, {
        projectId,
        paginationOpts: { numItems: 100, cursor, maximumBytesRead: 4 * 1024 * 1024 } as never,
      });
      if (seq === null) seq = page.activitySeq;
      else if (seq !== page.activitySeq) consistent = false;
      items.push(...page.items);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    // Pages are separate reads: a change between them (any write moves the sequence) restarts the snapshot.
    if (consistent) return { items, activitySeq: seq! };
  }
  throw new AppError('VERSION_CONFLICT', 'The project is changing too quickly to snapshot. Retry.');
}

function filesFromArg(files: unknown): Record<string, string> {
  return files && typeof files === 'object' && !Array.isArray(files) ? (files as Record<string, string>) : {};
}

// --------------------------------------------------------------- actions

const principal = v.any();

/** Preview an import (new project) or re-import (existing project) without changing records. */
export const preview = internalAction({
  args: { principal, projectId: v.string(), files: v.any(), operationKey: v.string() },
  handler: async (ctx, a): Promise<Outcome> => {
    const p = a.principal as WirePrincipal;
    try {
      const fresh = await freshen(ctx, p, true);
      if (isFailure(fresh)) return fresh;
      const auth = (await ctx.runQuery(internal.domain.portability.authorizeQ, { principal: p, projectId: a.projectId, cap: 'work:write', freshSince: fresh.freshSince })) as Outcome;
      if (!auth.ok) return auth;
      if (typeof a.operationKey !== 'string' || a.operationKey.length < 8) throw new AppError('VALIDATION_ERROR', 'operationKey must be a client-generated key of at least 8 characters.');
      const files = filesFromArg(a.files);
      checkFiles(files);
      const scan = await quarantineScan(files);
      const state = await loadState(ctx, a.projectId);
      const pv = buildPreview(files, scan, plan(scan.artifacts, state.items));
      // The quarantined upload is kept with the preview (file storage), so a person can confirm a CLI-prepared import.
      const sourceFile = await ctx.storage.store(new Blob([JSON.stringify(files)], { type: 'application/json' }));
      const o = await write(() => ctx.runMutation(internal.domain.portability.savePreview, { principal: p, projectId: a.projectId, freshSince: fresh.freshSince, operationKey: a.operationKey, sourceDigest: pv.sourceDigest, preview: pv, sourceFile }));
      if (isFailure(o)) await ctx.runMutation(internal.domain.portability.dropUpload, { id: sourceFile });
      return o as Outcome;
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      throw err;
    }
  },
});

/**
 * Commit a previewed import. Conflicts need an explicit resolution ('cloud'
 * keeps the current record, 'incoming' takes the file); a missing file never
 * deletes; `archive` archives selected records. Retrying (same or new
 * requestId) is safe: a committed job returns its result, an interrupted
 * activation resumes.
 */
export const commit = internalAction({
  args: { principal, args: v.any() },
  handler: async (ctx, { principal: raw, args }): Promise<Outcome> => {
    const p = raw as WirePrincipal;
    const input = (args ?? {}) as { projectId: string; jobId: string; files?: Record<string, string>; resolutions?: Record<string, 'cloud' | 'incoming'>; archive?: string[]; requestId?: string };
    try {
      if (typeof input.projectId !== 'string' || typeof input.jobId !== 'string') throw new AppError('VALIDATION_ERROR', 'projectId and jobId are required.');
      if (input.archive !== undefined && (!Array.isArray(input.archive) || input.archive.some((x) => typeof x !== 'string'))) throw new AppError('VALIDATION_ERROR', 'archive must be a list of work IDs.');
      const fresh = await freshen(ctx, p, true);
      if (isFailure(fresh)) return fresh;
      const base = { principal: p, projectId: input.projectId, jobId: input.jobId, freshSince: fresh.freshSince };
      const loaded = (await ctx.runQuery(internal.domain.portability.loadCommit, { ...base, resolutions: input.resolutions })) as Outcome;
      if (!loaded.ok) return loaded;
      if (loaded.value.committed) return { ok: true, value: loaded.value.committed };
      const job = loaded.value.job as { status: string; sourceFile: Id<'_storage'> | null; sourceDigest: string; preview: { changes: Change[]; issues: unknown[] }; commitInput: any };

      let files = input.files;
      if (!files) {
        const blob = job.sourceFile ? await ctx.storage.get(job.sourceFile) : null;
        files = blob ? (JSON.parse(await blob.text()) as Record<string, string>) : {};
      }
      if (digest(files) !== job.sourceDigest) throw new AppError('VERSION_CONFLICT', 'The files changed since the preview. Preview again.');
      const scan = await quarantineScan(files);
      const { requestId, files: _f, ...payload } = input;
      const requestDigest = digest({ ...payload, sourceDigest: job.sourceDigest });

      // Begin: plan against a fresh snapshot (retried if the project moves meanwhile), or resume.
      let commitInput: { resolutions: Record<string, string>; archive: string[] } | null = job.status === 'activating' ? job.commitInput : null;
      for (let attempt = 0; !commitInput; attempt++) {
        const state = await loadState(ctx, input.projectId);
        const changes = plan(scan.artifacts, state.items);
        const begun = await write(() =>
          ctx.runMutation(internal.domain.portability.commitBegin, { ...base, requestId, requestDigest, activitySeq: state.activitySeq, plan: changes, resolutions: input.resolutions, archive: input.archive }),
        );
        if (isFailure(begun)) {
          if ('error' in begun && (begun.error as any).replan && attempt < 3) continue;
          return begun;
        }
        const value = (begun as { value: any }).value;
        if (value.committed) return { ok: true, value: value.committed };
        commitInput = value.commitInput;
      }

      // Activate in batches. The approved plan is the preview's.
      const items = prepareItems(job.preview.changes, scan.artifacts, files, commitInput.resolutions ?? {});
      const created = items.filter((i) => i.action === 'create').length;
      const updated = items.length - created;
      const interrupted = (o: Outcome): Outcome =>
        isFailure(o) && 'error' in o
          ? { ok: false, error: { ...o.error, message: `Import activation was interrupted: ${String(o.error.message)} Retry the commit to finish it.`, retryable: true }, status: o.status }
          : o;
      const size = (i: PreparedItem) => 2 * (i.body.length + i.original.length) + 1024;
      for (const batch of batches(items, size)) {
        const o = await write(() => ctx.runMutation(internal.domain.portability.commitItems, { projectId: input.projectId, jobId: input.jobId, items: batch }));
        if (isFailure(o)) return interrupted(o);
      }
      for (const batch of batches(items, (i) => 1024 + 64 * i.edges.length, 200)) {
        const o = await write(() => ctx.runMutation(internal.domain.portability.commitLinks, { projectId: input.projectId, jobId: input.jobId, items: batch.map((i) => ({ nativeId: i.nativeId, edges: i.edges })) }));
        if (isFailure(o)) return interrupted(o);
      }
      const docs = (
        [
          ['product', productPath],
          ['roadmap', roadmapPath],
        ] as const
      )
        .filter(([, path_]) => path_ in files!)
        .map(([key, path_]) => ({ key, path: path_, body: files![path_]! }));
      for (const d of docs) {
        const o = await write(() => ctx.runMutation(internal.domain.portability.commitDocs, { projectId: input.projectId, jobId: input.jobId, docs: [d] }));
        if (isFailure(o)) return interrupted(o);
      }
      const done = await write(() => ctx.runMutation(internal.domain.portability.commitFinish, { ...base, requestId, requestDigest, created, updated, issues: scan.issues.length }));
      return interrupted(done as Outcome);
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      throw err;
    }
  },
});

/**
 * Native export (schema-1 Work files, baseline-readable) plus the complete
 * export (namespaced collaboration JSON). Unchanged imported originals are
 * returned byte-for-byte. Credentials and private logs are never included.
 */
export const exportProject = internalAction({
  args: { principal, projectId: v.string(), complete: v.boolean() },
  handler: async (ctx, a): Promise<Outcome> => {
    const p = a.principal as WirePrincipal;
    try {
      const fresh = await freshen(ctx, p, false);
      if (isFailure(fresh)) return fresh;
      const extras = (await ctx.runQuery(internal.domain.portability.exportExtras, { principal: p, projectId: a.projectId, freshSince: fresh.freshSince, complete: a.complete })) as Outcome;
      if (!extras.ok) return extras;
      const { project, workspaceId, docs, complete: collab } = extras.value as { project: { id: string; name: string; slug: string }; workspaceId: string; docs: Record<string, string>; complete: Record<string, unknown[]> | null };
      const { items } = await loadState(ctx, a.projectId);
      items.sort((x, y) => (x.row.type === y.row.type ? (x.row.nativeId < y.row.nativeId ? -1 : 1) : x.row.type < y.row.type ? -1 : 1));
      const files: Record<string, string> = { [README_FILE]: README_TEMPLATE };
      const fidelity: Record<string, 'original' | 'normalized'> = {};
      for (const s of items) {
        const r = s.row;
        if (s.source && s.source.baseVersion === r.version) {
          files[s.source.path] = s.source.original;
          fidelity[s.source.path] = 'original';
          continue;
        }
        const art = rowArtifact(s);
        const { path: _p, body, ...data } = art as Artifact & Record<string, unknown>;
        const rel = s.source?.path ?? `${DIRS[r.type]}/${artifactFileName(r.nativeId, r.title)}`;
        files[rel] = frontmatter.serialize({ ...data, ...((r.unknownMeta as object) ?? {}) }, body);
        fidelity[rel] = 'normalized';
      }
      files[productPath] = docs.product!;
      files[roadmapPath] = docs.roadmap!;
      const validation = await quarantineScan(files);
      const report = { errors: validation.errors, warnings: validation.warnings, issues: validation.issues, fidelity, note: 'Native validation findings keep their original severity, including recorded lifecycle overrides.' };
      let complete: Record<string, unknown> | undefined;
      if (collab) {
        complete = {
          'agileflow-connected/project.json': { id: project.id, name: project.name, slug: project.slug, archived: items.filter((s) => s.row.archivedAt).map((s) => s.row.nativeId) },
          'agileflow-connected/collaboration.json': Object.fromEntries(
            items.map((s) => [s.row.nativeId, { assignee: s.row.assignee ?? null, tags: s.row.tags, rank: s.row.boardRank, archivedAt: s.row.archivedAt ? new Date(s.row.archivedAt).toISOString() : null, supersededBy: s.rel.supersededBy ?? null }]),
          ),
          'agileflow-connected/notes.json': collab.notes,
          'agileflow-connected/revisions.json': collab.revisions,
          'agileflow-connected/activity.json': collab.activity,
          'agileflow-connected/runs.json': collab.runs,
          'agileflow-connected/claims.json': collab.claims,
          'agileflow-connected/approvals.json': collab.approvals,
          'agileflow-connected/controls.json': collab.controls,
          'agileflow-connected/evidence.json': collab.evidence,
        };
      }
      const jobId = await ctx.runMutation(internal.domain.portability.saveExportJob, { workspaceId, projectId: a.projectId, userId: p.userId, result: { files: Object.keys(files).length, complete: !!a.complete, errors: report.errors } });
      return { ok: true, value: { schemaVersion: 1, projectId: a.projectId, operationId: newId('op'), data: { jobId, root: 'docs/agile', files, report, ...(complete ? { complete } : {}) }, warnings: [] } };
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      throw err;
    }
  },
});
