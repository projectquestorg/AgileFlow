import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { createTwoFilesPatch } from 'diff';
import type { LockEntry, SkillSpec } from './config';
import { replaceDirAtomic, toPosix, writeFileAtomic, type TreeFile } from './fs';
import {
  effectiveActivation,
  isSelfSource,
  materialize,
  OperationError,
  syncWorkspace,
  type OperationEvent,
  type SyncReport,
} from './installer';
import { inspectSkill, readSkillTree } from './ownership';
import { packageActivation, renderSkill, stripManagedNotice } from './render';
import { skillDir, skillRelPath, type ScopeTarget } from './scope';
import { SKILL_FILE } from './skill';
import { parseSource } from './source';
import type { FetchedPackage } from './types';
import { saveLock, setSkillSpecs, type Services, type Workspace } from './workspace';

export type ConflictChoice = 'fork' | 'reset' | 'skip';

export interface UpdateConflict {
  id: string;
  from: string;
  to: string;
  /** Unified diff: installed base -> current files. */
  localDiff: () => Promise<string>;
  /** Unified diff: installed base -> new upstream version. */
  upstreamDiff: () => Promise<string>;
}

export interface PlannedUpdate {
  id: string;
  kind: 'add' | 'update' | 'source-change' | 'remove';
  from?: string;
  to?: string;
  pkg?: FetchedPackage;
  status: 'clean' | 'modified' | 'missing' | 'n/a';
  /** The config now points at the skill's own directory (fork / local skill). */
  localOwned?: boolean;
}

export interface UpdatePlan {
  items: PlannedUpdate[];
  upToDate: string[];
  forkNotices: Array<{ id: string; forkedFrom: string; latest: string }>;
  events: OperationEvent[];
}

export interface UpdateReport {
  applied: PlannedUpdate[];
  skipped: Array<{ id: string; reason: string }>;
  forked: string[];
  upToDate: string[];
  forkNotices: UpdatePlan['forkNotices'];
  events: OperationEvent[];
  sync: SyncReport | null;
}

function packageNameOf(forkedFrom: string): { name: string; version: string | null } {
  const at = forkedFrom.lastIndexOf('@');
  if (at > 0) return { name: forkedFrom.slice(0, at), version: forkedFrom.slice(at + 1) };
  return { name: forkedFrom, version: null };
}

/** Resolve what `update` would change, without writing anything. */
export async function planUpdate(
  services: Services,
  ws: Workspace,
  ids?: string[],
): Promise<UpdatePlan> {
  const plan: UpdatePlan = { items: [], upToDate: [], forkNotices: [], events: [] };
  const targets = ids?.length ? ids : Object.keys(ws.specs);
  for (const id of targets) {
    const spec = ws.specs[id];
    if (!spec) throw new OperationError(`${id} is not in ${path.basename(ws.scope.configPath)}`);
    const entry = ws.lock.resolved[id];

    if (isSelfSource(ws.scope, id, spec, services.ctx.homeDir)) {
      if (!entry || entry.ownership !== 'local') {
        plan.items.push({ id, kind: entry ? 'source-change' : 'add', to: 'local', status: 'n/a', localOwned: true });
      } else {
        plan.upToDate.push(id);
      }
      if (spec.provenance?.forkedFrom) {
        const origin = packageNameOf(spec.provenance.forkedFrom);
        const originRef = parseSource(origin.name);
        if (originRef.kind === 'registry' && origin.version && semver.valid(origin.version)) {
          try {
            const latest = await services.fetcher.resolve(id, { source: origin.name }, ws.scope.root);
            if (semver.gt(latest.version, origin.version)) {
              plan.forkNotices.push({ id, forkedFrom: spec.provenance.forkedFrom, latest: latest.version });
            }
          } catch {
            // Upstream lookup is informational only.
          }
        }
      }
      continue;
    }

    let pkg: FetchedPackage;
    try {
      pkg = await services.fetcher.resolve(id, spec, ws.scope.root);
    } catch (err) {
      plan.events.push({ level: 'error', skill: id, message: (err as Error).message });
      continue;
    }
    const state = entry
      ? await inspectSkill(ws.scope, id, { ...entry, enabled: undefined })
      : null;
    const status = !state ? 'missing' : state.status === 'local' || state.status === 'disabled' ? 'n/a' : state.status;
    if (!entry) {
      plan.items.push({ id, kind: 'add', to: pkg.version, pkg, status: 'missing' });
    } else if (entry.source !== spec.source || entry.ownership !== 'managed') {
      plan.items.push({ id, kind: 'source-change', from: entry.version, to: pkg.version, pkg, status });
    } else if (entry.integrity !== pkg.integrity || entry.version !== pkg.version) {
      plan.items.push({ id, kind: 'update', from: entry.version, to: pkg.version, pkg, status });
    } else {
      plan.upToDate.push(id);
    }
  }
  if (!ids?.length) {
    for (const [id, entry] of Object.entries(ws.lock.resolved)) {
      if (ws.specs[id]) continue;
      const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
      plan.items.push({
        id,
        kind: 'remove',
        from: entry.version,
        status: state.status === 'clean' || state.status === 'missing' ? state.status : 'modified',
      });
    }
  }
  return plan;
}

export interface UpdateOptions {
  ids?: string[];
  /** Skills whose local modifications may be discarded. */
  reset?: string[];
  /** Called for each dirty managed skill in interactive mode. */
  decide?: (conflict: UpdateConflict) => Promise<ConflictChoice>;
  /** Called with the plan before anything is written; return false to abort. */
  confirm?: (plan: UpdatePlan) => Promise<boolean>;
  dryRun?: boolean;
}

/**
 * Resolve newer versions allowed by the config, update the lockfile, and sync.
 * Locally modified managed skills are never overwritten without a choice:
 * without `decide` they are skipped and reported.
 */
export async function updateWorkspace(
  services: Services,
  ws: Workspace,
  options: UpdateOptions = {},
): Promise<UpdateReport> {
  if (!ws.configExists) {
    throw new OperationError(`No ${path.basename(ws.scope.configPath)} found`, ['Run `agileflow init` first.']);
  }
  const plan = await planUpdate(services, ws, options.ids);
  const report: UpdateReport = {
    applied: [],
    skipped: [],
    forked: [],
    upToDate: plan.upToDate,
    forkNotices: plan.forkNotices,
    events: plan.events,
    sync: null,
  };
  if (options.dryRun) {
    report.applied = plan.items;
    return report;
  }
  if (plan.items.length && options.confirm && !(await options.confirm(plan))) {
    report.skipped = plan.items.map((i) => ({ id: i.id, reason: 'cancelled' }));
    return report;
  }
  const reset = new Set(options.reset ?? []);
  const removedIds: string[] = [];

  for (const item of plan.items) {
    const spec = ws.specs[item.id];
    const entry = ws.lock.resolved[item.id];

    if (item.kind === 'remove') {
      if (item.status === 'modified') {
        report.events.push({
          level: 'warn',
          skill: item.id,
          message: 'removed from agileflow.yaml but has local modifications; files left in place as an unmanaged skill',
        });
      } else {
        await fs.promises.rm(skillDir(ws.scope, item.id), { recursive: true, force: true });
      }
      delete ws.lock.resolved[item.id];
      removedIds.push(item.id);
      report.applied.push(item);
      continue;
    }

    if (item.localOwned && spec) {
      ws.lock.resolved[item.id] = {
        source: spec.source,
        version: 'local',
        path: skillRelPath(item.id),
        activation: effectiveActivation(spec, entry?.activation ?? 'auto'),
        ownership: 'local',
      };
      report.applied.push(item);
      continue;
    }

    if (item.status === 'modified' && !reset.has(item.id)) {
      let choice: ConflictChoice = 'skip';
      if (options.decide && entry && item.pkg) {
        choice = await options.decide(buildConflict(services, ws, item.id, entry, item.pkg));
      }
      if (choice === 'fork') {
        await forkSkill(services, ws, item.id);
        report.forked.push(item.id);
        continue;
      }
      if (choice === 'skip') {
        report.skipped.push({ id: item.id, reason: 'local modifications' });
        continue;
      }
    }

    // Config intent wins; otherwise follow the package's declared default.
    const activation = effectiveActivation(spec, packageActivation(item.pkg!.files));
    ws.lock.resolved[item.id] = await materialize(services, ws, item.id, item.pkg!, activation);
    report.applied.push(item);
  }

  await saveLock(ws);
  report.sync = await syncWorkspace(services, ws, { removedIds });
  return report;
}

function buildConflict(
  services: Services,
  ws: Workspace,
  id: string,
  entry: LockEntry,
  next: FetchedPackage,
): UpdateConflict {
  return {
    id,
    from: entry.version,
    to: next.version,
    localDiff: async () => {
      const base = await renderedBase(services, ws, id, entry);
      const current = (await readSkillTree(ws.scope, id)) ?? [];
      return diffTrees(base, current, `${id}@${entry.version} (installed)`, `${id} (local)`);
    },
    upstreamDiff: async () => {
      const base = await renderedBase(services, ws, id, entry);
      const upcoming = renderSkill(next.files, {
        id,
        managed: true,
        activation: entry.activation,
        questionPreference: ws.questionPreference,
        adapters: services.adapters,
      });
      return diffTrees(base, upcoming, `${id}@${entry.version}`, `${id}@${next.version}`);
    },
  };
}

/** Files exactly as AgileFlow installed them for the locked version. */
export async function renderedBase(services: Services, ws: Workspace, id: string, entry: LockEntry): Promise<TreeFile[]> {
  const pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root);
  return renderSkill(pkg.files, {
    id,
    managed: true,
    activation: entry.activation,
    questionPreference: ws.questionPreference,
    adapters: services.adapters,
  });
}

// ---------------------------------------------------------------------------
// Fork
// ---------------------------------------------------------------------------

export interface ForkReport {
  id: string;
  forkedFrom: string;
  path: string;
}

/** Turn a managed skill into a locally owned one. AgileFlow never overwrites it again. */
export async function forkSkill(services: Services, ws: Workspace, id: string): Promise<ForkReport> {
  const spec = ws.specs[id];
  const entry = ws.lock.resolved[id];
  if (!spec || !entry) throw new OperationError(`${id} is not managed by AgileFlow in this scope`);
  if (entry.ownership === 'local') {
    throw new OperationError(`${id} is already locally owned`, [
      spec.provenance ? `It was forked from ${spec.provenance.forkedFrom}.` : 'It was added from a local path.',
    ]);
  }
  let files = await readSkillTree(ws.scope, id);
  if (!files) {
    const pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root);
    files = renderSkill(pkg.files, {
      id,
      managed: true,
      activation: entry.activation,
      questionPreference: ws.questionPreference,
      adapters: services.adapters,
    });
    await replaceDirAtomic(skillDir(ws.scope, id), files);
  }
  const skillPath = path.join(skillDir(ws.scope, id), SKILL_FILE);
  const skillText = files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8');
  if (skillText !== undefined) {
    const stripped = stripManagedNotice(skillText);
    if (stripped !== skillText) await writeFileAtomic(skillPath, stripped);
  }
  const forkedFrom = `${entry.source}@${entry.version}`;
  const localSource = skillRelPath(id);
  const nextSpec: SkillSpec = {
    source: localSource,
    ...(spec.activation ? { activation: spec.activation } : {}),
    ...(spec.enabled === false ? { enabled: false } : {}),
    provenance: { forkedFrom },
  };
  ws.specs[id] = nextSpec;
  ws.lock.resolved[id] = {
    source: localSource,
    version: 'local',
    path: skillRelPath(id),
    activation: entry.activation,
    ownership: 'local',
    ...(entry.enabled === false ? { enabled: false as const } : {}),
  };
  await setSkillSpecs(ws.scope, { [id]: nextSpec });
  await saveLock(ws);
  return { id, forkedFrom, path: toPosix(path.relative(ws.scope.root, skillDir(ws.scope, id))) || '.' };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

function isBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

export function diffTrees(before: TreeFile[], after: TreeFile[], beforeLabel: string, afterLabel: string): string {
  const a = new Map(before.map((f) => [f.path, f]));
  const b = new Map(after.map((f) => [f.path, f]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const chunks: string[] = [];
  for (const p of paths) {
    const x = a.get(p);
    const y = b.get(p);
    if (x && y && x.content.equals(y.content) && x.executable === y.executable) continue;
    if ((x && isBinary(x.content)) || (y && isBinary(y.content))) {
      chunks.push(`Binary file ${p} differs\n`);
      continue;
    }
    const patch = createTwoFilesPatch(
      x ? `${beforeLabel}/${p}` : '/dev/null',
      y ? `${afterLabel}/${p}` : '/dev/null',
      x ? x.content.toString('utf8') : '',
      y ? y.content.toString('utf8') : '',
      undefined,
      undefined,
      { context: 3 },
    );
    chunks.push(patch.replace(/^=+\n/, ''));
    if (x && y && x.executable !== y.executable) chunks.push(`mode of ${p} changed\n`);
  }
  return chunks.join('\n');
}

export interface DiffResult {
  title: string;
  patch: string;
  identical: boolean;
}

/**
 * `agileflow diff <id>`: installed base vs current files.
 * `agileflow diff <id> --upstream`: current files vs latest upstream.
 */
export async function diffSkill(
  services: Services,
  ws: Workspace,
  id: string,
  options: { upstream?: boolean } = {},
): Promise<DiffResult> {
  const spec = ws.specs[id];
  const entry = ws.lock.resolved[id];
  if (!spec || !entry) throw new OperationError(`${id} is not managed by AgileFlow in this scope`);
  const current = (await readSkillTree(ws.scope, id)) ?? [];

  if (!options.upstream) {
    if (entry.ownership === 'local') {
      throw new OperationError(`${id} is locally owned and has no installed base`, [
        spec.provenance ? `Compare with upstream: agileflow diff ${id} --upstream` : 'It was added from a local path.',
      ]);
    }
    const base = await renderedBase(services, ws, id, entry);
    const patch = diffTrees(base, current, `${id}@${entry.version} (installed)`, `${id} (current)`);
    return { title: `${id}: installed ${entry.version} vs current files`, patch, identical: patch === '' };
  }

  const upstreamSource =
    entry.ownership === 'local'
      ? spec.provenance?.forkedFrom
        ? packageNameOf(spec.provenance.forkedFrom).name
        : null
      : spec.source;
  if (!upstreamSource) {
    throw new OperationError(`${id} has no upstream`, ['It was added from a local path, not forked.']);
  }
  const upstreamSpec: SkillSpec =
    entry.ownership === 'local' ? { source: upstreamSource } : { source: upstreamSource, ...(spec.ref ? { ref: spec.ref } : {}) };
  const latest = await services.fetcher.resolve(id, upstreamSpec, ws.scope.root);
  const upstreamFiles = renderSkill(latest.files, {
    id,
    managed: entry.ownership !== 'local',
    activation: entry.activation,
    questionPreference: ws.questionPreference,
    adapters: services.adapters,
  });
  const patch = diffTrees(current, upstreamFiles, `${id} (yours)`, `${id}@${latest.version} (upstream)`);
  return {
    title: `${id}: your copy vs upstream ${upstreamSource}@${latest.version}`,
    patch,
    identical: patch === '',
  };
}

export function skillScopeLabel(scope: ScopeTarget): string {
  return scope.kind === 'project' ? 'project' : 'global';
}

