import path from 'node:path';
import semver from 'semver';
import { createTwoFilesPatch } from 'diff';
import { InteractionPreferenceSchema, type InteractionPreference, type LockEntry, type SkillSpec } from './config';
import { OperationError, settledValue, startLimited, type OperationEvent } from './errors';
import { readTextIfExists, toPosix, writeFileAtomic, type TreeFile } from './fs';
import {
  effectiveActivation,
  isExternalSource,
  isOwnRender,
  isSelfSource,
  localLockEntry,
  lockEntryFor,
  renderFor,
  renderInputsChanged,
  syncWorkspace,
  type SyncReport,
  NEEDS_APPROVAL,
} from './installer';
import { assertReplaceable, inspectSkill, readSkillTree, type SkillSnapshot } from './ownership';
import { matchesRenderedHash } from './hash';
import { tracksExecBits } from './platform';
import { packageActivation, RENDERER_REVISION, renderSkill, stripManagedNotice } from './render';
import { scanSkill, type RiskFinding } from './scan';
import { reviewTrust, type TrustReview } from './trust';
import { skillDir, skillRelPath, type ScopeTarget } from './scope';
import { SKILL_FILE } from './skill';
import { parseSource } from './source';
import { commitSkillWrites, type SkillWrite } from './transaction';
import type { FetchedPackage } from './types';
import type { Services, Workspace } from './workspace';

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
  /** `rerender`: same package, rendered again with this CLI's renderer (`renderer`). */
  kind: 'add' | 'update' | 'source-change' | 'remove' | 'rerender';
  from?: string;
  to?: string;
  pkg?: FetchedPackage;
  status: 'clean' | 'modified' | 'missing' | 'n/a';
  /** The config now points at the skill's own directory (fork / local skill). */
  localOwned?: boolean;
  /** Third-party content: shown with a diff and needs explicit approval. */
  external?: boolean;
  /** The resolved version is older than the locked one. */
  downgrade?: boolean;
  /** `rerender` items: the renderer revision the lock records (absent: not recorded) and this CLI's. */
  renderer?: { from?: number; to: number };
  /** Static review of the incoming content (`scanSkill`). */
  risks?: RiskFinding[];
  /** What changes about source, instructions, scripts, permissions, requirements, and activation. */
  trust?: TrustReview;
  /** What was at the skill path when this was planned; the write is skipped if it changes before applying. */
  expect?: SkillSnapshot;
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

/** Reason recorded for third-party changes that were not approved. */


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
  // Resolve every non-local skill in parallel (bounded); decisions stay in order below.
  const resolvable = targets.filter((id) => ws.specs[id] && !isSelfSource(ws.scope, id, ws.specs[id]!, services.ctx.homeDir, services.ctx.platform));
  const resolved = startLimited(resolvable, 6, (id) => services.fetcher.resolve(id, ws.specs[id]!, ws.scope.root));
  const onDisk = new Map<string, SkillSnapshot>();
  for (const id of targets) {
    const spec = ws.specs[id];
    if (!spec) throw new OperationError(`${id} is not in ${path.basename(ws.scope.configPath)}`);
    const entry = ws.lock.resolved[id];

    if (isSelfSource(ws.scope, id, spec, services.ctx.homeDir, services.ctx.platform)) {
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

    // Never install over files AgileFlow does not own (hand-written skills, local skills);
    // modified managed skills are decided per skill below.
    try {
      onDisk.set(id, (await assertReplaceable(ws.scope, id, entry, { allowModified: true })).snapshot);
    } catch (err) {
      plan.events.push({ level: 'error', skill: id, message: [(err as Error).message, ...((err as OperationError).hint ?? [])].join('. ') });
      continue;
    }

    let pkg: FetchedPackage;
    try {
      pkg = settledValue(await resolved.get(id)!);
    } catch (err) {
      plan.events.push({ level: 'error', skill: id, message: (err as Error).message });
      continue;
    }
    const state = entry ? await inspectSkill(ws.scope, id, { ...entry, enabled: undefined }) : null;
    let status: PlannedUpdate['status'] = !state ? 'missing' : state.status === 'local' || state.status === 'disabled' ? 'n/a' : state.status;
    // A copy restored by this CLI's renderer (the lock records another one) is not a user edit.
    if (status === 'modified' && entry && state?.files && !state.unhashed?.length && entry.integrity === pkg.integrity) {
      if (isOwnRender(services, ws, id, entry, pkg, state.files, { execBits: await tracksExecBits(ws.scope.root) })) status = 'clean';
    }
    const external = isExternalSource(spec.source, services.fetcher.officialRegistry !== false);
    const trust = {
      ...(external ? { external, risks: scanSkill(pkg.files) } : {}),
      trust: await trustReviewFor(services, ws, id, entry, pkg),
    };
    if (entry && entry.source === spec.source && entry.ownership === 'managed' && contentReplaced(entry, pkg)) {
      plan.events.push({
        level: 'error',
        skill: id,
        message:
          `${id}: the source now serves different content for ${describeLocked(entry)} than agileflow.lock recorded. ` +
          'Published versions never change, so this points to a tampered or rewritten source; AgileFlow keeps the locked copy.',
      });
      continue;
    }
    if (!entry) {
      plan.items.push({ id, kind: 'add', to: pkg.version, pkg, status: 'missing', ...trust });
    } else if (entry.source !== spec.source || entry.ownership !== 'managed') {
      plan.items.push({ id, kind: 'source-change', from: entry.version, to: pkg.version, pkg, status, ...trust });
    } else if (entry.integrity !== pkg.integrity || entry.version !== pkg.version || (entry.ref ?? undefined) !== spec.ref) {
      const downgrade = !!(semver.valid(entry.version) && semver.valid(pkg.version) && semver.lt(pkg.version, entry.version));
      plan.items.push({
        id,
        kind: 'update',
        from: entry.version,
        to: pkg.version,
        pkg,
        status,
        ...(downgrade ? { downgrade } : {}),
        ...(entry.integrity !== pkg.integrity ? trust : { trust: trust.trust }),
      });
    } else if (entry.ownership === 'managed' && spec.enabled !== false && status !== 'missing' && rendererAdoptable(services, ws, id, entry, pkg)) {
      // Same package, another renderer: re-rendering is deliberate and listed, never done by `sync`.
      plan.items.push({
        id,
        kind: 'rerender',
        from: entry.version,
        to: pkg.version,
        pkg,
        status,
        renderer: { ...(entry.renderer !== undefined ? { from: entry.renderer } : {}), to: RENDERER_REVISION },
      });
    } else {
      plan.upToDate.push(id);
    }
  }
  if (!ids?.length) {
    for (const [id, entry] of Object.entries(ws.lock.resolved)) {
      if (ws.specs[id]) continue;
      const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
      onDisk.set(id, state.snapshot);
      plan.items.push({
        id,
        kind: 'remove',
        from: entry.version,
        status:
          entry.ownership === 'local' ? 'n/a' : state.status === 'clean' || state.status === 'missing' ? state.status : 'modified',
      });
    }
  }
  for (const item of plan.items) if (onDisk.has(item.id)) item.expect = onDisk.get(item.id);
  return plan;
}

/**
 * True when the locked render came from another (older or unrecorded)
 * renderer and this CLI renders the same package and inputs differently.
 * Input changes are left to `sync`; a newer renderer is never downgraded.
 */
function rendererAdoptable(services: Services, ws: Workspace, id: string, entry: LockEntry, pkg: FetchedPackage): boolean {
  if (entry.renderer !== undefined && entry.renderer >= RENDERER_REVISION) return false;
  const activation = effectiveActivation(ws.specs[id], entry.activation);
  if (renderInputsChanged(services, ws, id, pkg, entry, activation)) return false;
  try {
    return !matchesRenderedHash(renderFor(services, ws, id, pkg, activation), entry, { execBits: true });
  } catch {
    return false;
  }
}

/**
 * Trust review of `pkg` against what is installed now: the locked package
 * from the cache when available (exact), otherwise the installed copy.
 */
async function trustReviewFor(
  services: Services,
  ws: Workspace,
  id: string,
  entry: LockEntry | undefined,
  pkg: FetchedPackage,
): Promise<TrustReview> {
  const after = { source: pkg.source, files: pkg.files };
  if (!entry || entry.ownership !== 'managed') return reviewTrust(null, after);
  try {
    const locked = await services.fetcher.fetchLocked(id, entry, ws.scope.root, { cacheOnly: true });
    return reviewTrust({ source: entry.source, files: locked.files }, after, 'package');
  } catch {
    const installed = await readSkillTree(ws.scope, id).catch(() => null);
    return installed ? reviewTrust({ source: entry.source, files: installed }, after, 'installed') : reviewTrust(null, after);
  }
}

/**
 * Same registry version, or same git commit, with a different package hash.
 * Neither can change legitimately, so the lock is not re-pinned to it.
 */
function contentReplaced(entry: LockEntry, pkg: FetchedPackage): boolean {
  if (!entry.integrity || entry.integrity === pkg.integrity) return false;
  const kind = parseSource(entry.source).kind;
  if (kind === 'registry') return entry.version === pkg.version;
  if (kind === 'git') return !!entry.resolved && entry.resolved === pkg.resolved;
  return false;
}

function describeLocked(entry: LockEntry): string {
  return entry.resolved ? `commit ${entry.resolved.slice(0, 12)}` : `version ${entry.version}`;
}

export interface UpdateOptions {
  ids?: string[];
  /** Skills whose local modifications may be discarded. */
  reset?: string[];
  /** Called for each dirty managed skill in interactive mode. */
  decide?: (conflict: UpdateConflict) => Promise<ConflictChoice>;
  /** Called with the plan before anything is written; return false to abort. */
  confirm?: (plan: UpdatePlan) => Promise<boolean>;
  /**
   * Apply third-party (non-@agileflow) content changes. Without it they are
   * skipped with `NEEDS_APPROVAL`: new instructions from someone else's
   * repository never reach the agent without an explicit yes.
   */
  approveExternal?: boolean;
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
  const writes: SkillWrite[] = [];
  const pendingApplied: PlannedUpdate[] = [];

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
        writes.push({ id: item.id, next: null });
      } else if (entry?.ownership === 'local') {
        writes.push({ id: item.id, next: null });
      } else {
        writes.push({ id: item.id, files: null, next: null });
      }
      removedIds.push(item.id);
      pendingApplied.push(item);
      continue;
    }

    if (item.localOwned && spec) {
      writes.push({ id: item.id, next: localLockEntry(item.id, spec, effectiveActivation(spec, entry?.activation ?? 'auto')) });
      pendingApplied.push(item);
      continue;
    }

    if (item.external && !options.approveExternal) {
      report.skipped.push({ id: item.id, reason: NEEDS_APPROVAL });
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
        if (item.kind === 'source-change') {
          report.events.push({
            level: 'warn',
            skill: item.id,
            message: `kept your fork; the new source ${spec?.source} was not applied (agileflow.yaml now points at the fork)`,
          });
        }
        continue;
      }
      if (choice === 'skip') {
        report.skipped.push({ id: item.id, reason: 'local modifications' });
        continue;
      }
    }

    // Config intent wins; otherwise follow the package's declared default.
    const activation = effectiveActivation(spec, packageActivation(item.pkg!.files));
    let rendered: TreeFile[];
    try {
      rendered = renderFor(services, ws, item.id, item.pkg!, activation);
    } catch (err) {
      report.events.push({ level: 'error', skill: item.id, message: `cannot install ${item.to}: ${(err as Error).message}` });
      continue;
    }
    writes.push({ id: item.id, files: rendered, next: lockEntryFor(item.id, item.pkg!, rendered, activation, spec, ws.questionPreference) });
    pendingApplied.push(item);
  }

  // Replace only what the plan (and any prompt) was about: an edit made since is kept.
  for (const w of writes) w.expect ??= plan.items.find((i) => i.id === w.id)?.expect;
  try {
    const committed = await commitSkillWrites(services, ws, writes);
    report.events.push(...committed.events);
    report.applied = pendingApplied.filter((i) => !committed.skipped.includes(i.id));
    for (const id of committed.skipped) report.skipped.push({ id, reason: 'changed during update' });
  } catch (err) {
    // Skills written before the failure were recorded; report the rest.
    report.applied = pendingApplied.filter((i) => {
      const e = ws.lock.resolved[i.id];
      return i.kind === 'remove' ? !e : !!e && (i.localOwned ? e.ownership === 'local' : e.version === i.to);
    });
    report.events.push({ level: 'error', message: `update stopped: ${(err as Error).message}` });
    for (const i of pendingApplied) if (!report.applied.includes(i)) report.skipped.push({ id: i.id, reason: 'not applied' });
  }
  report.sync = await syncWorkspace(services, ws, { removedIds, mismatch: 'report' });
  // Mismatches left for skipped skills are expected here; the skip reason already explains them.
  const skippedIds = new Set([...report.skipped.map((s) => s.id), ...plan.events.map((e) => e.skill)]);
  report.sync.events = report.sync.events.filter((e) => !(e.level === 'warn' && e.skill && skippedIds.has(e.skill)));
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
        interactionPreference: ws.questionPreference,
        adapters: services.adapters,
      });
      return diffTrees(base, upcoming, `${id}@${entry.version}`, `${id}@${next.version}`);
    },
  };
}

/**
 * Files exactly as AgileFlow installed them for the locked version.
 *
 * The interaction preference may have changed since install (sync leaves
 * modified skills alone), so rendering with the current one could attribute
 * the overlay change to the user. Use the preference that reproduces the
 * locked `renderedHash`, falling back to the current one.
 */
export async function renderedBase(services: Services, ws: Workspace, id: string, entry: LockEntry): Promise<TreeFile[]> {
  const pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root);
  const render = (interactionPreference: InteractionPreference) =>
    renderSkill(pkg.files, {
      id,
      managed: true,
      activation: entry.activation,
      interactionPreference,
      adapters: services.adapters,
    });
  const current = render(ws.questionPreference);
  if (!entry.renderedHash || matchesRenderedHash(current, entry, { execBits: true })) return current;
  for (const preference of InteractionPreferenceSchema.options) {
    if (preference === ws.questionPreference) continue;
    const candidate = render(preference);
    if (matchesRenderedHash(candidate, entry, { execBits: true })) return candidate;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Fork
// ---------------------------------------------------------------------------

export interface ForkReport {
  id: string;
  forkedFrom: string;
  path: string;
  /** The fork keeps the question-preference text rendered into it; later preference changes don't apply. */
  keepsOverlay: boolean;
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
  // A missing skill is restored with the notice already removed, in the same journaled write as the ownership change.
  let restore: TreeFile[] | null = null;
  if (!files) {
    if (entry.enabled === false || spec.enabled === false) {
      throw new OperationError(`${id} is disabled and not on disk, so there is nothing to fork`, [
        `Enable it first (\`agileflow configure skill ${id} --enable\`), then fork it.`,
      ]);
    }
    const pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root);
    files = renderFor(services, ws, id, pkg, entry.activation);
    restore = files.map((f) =>
      f.path === SKILL_FILE ? { ...f, content: Buffer.from(stripManagedNotice(f.content.toString('utf8')), 'utf8') } : f,
    );
  }
  const skillPath = path.join(skillDir(ws.scope, id), SKILL_FILE);
  const skillText = files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8');
  const stripNotice = async () => {
    const text = await readTextIfExists(skillPath);
    if (text !== null && stripManagedNotice(text) !== text) await writeFileAtomic(skillPath, stripManagedNotice(text));
  };
  const keepsOverlay = ws.questionPreference !== 'provider-default' && !!skillText?.includes('Question preference for this project:');
  const forkedFrom = `${entry.source}@${entry.version}`;
  const localSource = skillRelPath(id);
  const nextSpec: SkillSpec = {
    source: localSource,
    ...(spec.activation ? { activation: spec.activation } : {}),
    ...(spec.enabled === false ? { enabled: false } : {}),
    provenance: { forkedFrom },
  };
  const committed = await commitSkillWrites(services, ws, [
    {
      id,
      spec: nextSpec,
      next: {
        ...localLockEntry(id, nextSpec, entry.activation),
        ...(entry.enabled === false ? { enabled: false as const } : {}),
      },
      ...(restore ? { files: restore, expect: { exists: false as const } } : { touch: stripNotice }),
    },
  ]);
  if (committed.skipped.length) {
    throw new OperationError(`${id} ${committed.events[0]?.message ?? 'changed while forking'}`, [`Run \`agileflow fork ${id}\` again.`]);
  }
  return { id, forkedFrom, path: toPosix(path.relative(ws.scope.root, skillDir(ws.scope, id))) || '.', keepsOverlay };
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
    let patch = diffTrees(base, current, `${id}@${entry.version} (installed)`, `${id} (current)`);
    const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
    if (state.unhashed?.length) {
      patch += `${patch ? '\n' : ''}Entries AgileFlow does not track (they make the skill count as modified):\n${state.unhashed
        .map((u) => `  ${u}\n`)
        .join('')}`;
    }
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
    interactionPreference: ws.questionPreference,
    adapters: services.adapters,
  });
  const patch = diffTrees(current, upstreamFiles, `${id} (yours)`, `${id}@${latest.version} (upstream)`);
  return {
    title: `${id}: your copy vs upstream ${upstreamSource}@${latest.version}`,
    patch,
    identical: patch === '',
  };
}


