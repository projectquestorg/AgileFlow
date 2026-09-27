import path from 'node:path';
import semver from 'semver';
import { InteractionPreferenceSchema, type Activation, type LockEntry, type SkillSpec } from './config';
import { OperationError, settledValue, startLimited, type OperationEvent } from './errors';
import { pathExists, toPosix, type TreeFile } from './fs';
import { matchesRenderedHash, renderedHashOf } from './hash';
import { applyChanges, type ApplyResult } from './links';
import { inspectSkill, readSkillTree } from './ownership';
import { packageActivation, renderSkill } from './render';
import { scanSkill, type RiskFinding } from './scan';
import { isSameDir, skillDir, skillRelPath, type ScopeTarget } from './scope';
import { COMMIT_RE } from './config';
import { defaultRange, parseSource, resolvePathSource } from './source';
import { readSyncState, writeSyncState, type SyncState } from './state';
import { MAX_NAME_LENGTH, SKILL_NAME_RE, summarizeTree, type SkillSummary } from './skill';
import { commitSkillWrites, type SkillWrite } from './transaction';
import type { FetchedPackage, PlannedChange, ProviderContext, ResolvedSkill } from './types';
import { loadWorkspace, saveLock, type Services, type Workspace } from './workspace';

// ---------------------------------------------------------------------------
// Local ownership helpers
// ---------------------------------------------------------------------------

/** True when a spec points at the skill's own install directory (fork / local skill). */
export function isSelfSource(
  scope: ScopeTarget,
  id: string,
  spec: SkillSpec,
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const ref = parseSource(spec.source);
  if (ref.kind !== 'path') return false;
  return isSameDir(resolvePathSource(ref.path, scope.root, homeDir), skillDir(scope, id), platform);
}

export function effectiveActivation(spec: SkillSpec | undefined, fallback: Activation): Activation {
  return spec?.activation ?? fallback;
}

/** Third-party content: anything that is not an official `@agileflow` registry package or a local skill. */
export function isExternalSource(source: string): boolean {
  const ref = parseSource(source);
  return !(ref.kind === 'registry' && ref.name.startsWith('@agileflow/'));
}

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

export function renderFor(
  services: Services,
  ws: Workspace,
  id: string,
  pkg: FetchedPackage,
  activation: Activation,
  interactionPreference = ws.questionPreference,
): TreeFile[] {
  return renderSkill(pkg.files, {
    id,
    managed: true,
    activation,
    interactionPreference,
    adapters: services.adapters,
  });
}

/** The lock entry recording `rendered` as the installed content of `pkg`. */
export function lockEntryFor(
  id: string,
  pkg: FetchedPackage,
  rendered: TreeFile[],
  activation: Activation,
  spec?: SkillSpec,
): LockEntry {
  const gitRef = spec?.ref && parseSource(pkg.source).kind === 'git' ? spec.ref : undefined;
  return {
    source: pkg.source,
    version: pkg.version,
    ...(pkg.resolved ? { resolved: pkg.resolved } : {}),
    ...(gitRef ? { ref: gitRef } : {}),
    integrity: pkg.integrity,
    path: skillRelPath(id),
    renderedHash: renderedHashOf(rendered),
    activation,
    ownership: 'managed',
  };
}

export function localLockEntry(id: string, spec: SkillSpec, activation: Activation): LockEntry {
  return { source: spec.source, version: 'local', path: skillRelPath(id), activation, ownership: 'local' };
}

/**
 * True when `entry.renderedHash` was produced with a question preference
 * other than the current one: the render difference is a preference change
 * (apply it), not a different AgileFlow version's renderer (leave it).
 */
function renderedWithOtherPreference(services: Services, ws: Workspace, id: string, pkg: FetchedPackage, entry: LockEntry): boolean {
  return InteractionPreferenceSchema.options.some(
    (preference) =>
      preference !== ws.questionPreference &&
      matchesRenderedHash(renderFor(services, ws, id, pkg, entry.activation, preference), entry.renderedHash),
  );
}

// ---------------------------------------------------------------------------
// Provider exposure
// ---------------------------------------------------------------------------

export interface ExposureReport {
  results: ApplyResult[];
  providers: Array<{ id: string; displayName: string; active: boolean; reason: string }>;
}

function pctxFor(services: Services, ws: Workspace, providerId: string): ProviderContext {
  return { ctx: services.ctx, scope: ws.scope, settings: ws.providerSettings[providerId] };
}

export async function resolvedSkills(ws: Workspace): Promise<ResolvedSkill[]> {
  const out: ResolvedSkill[] = [];
  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
    if (entry.enabled === false) continue;
    if (!(await pathExists(skillDir(ws.scope, id)))) continue;
    out.push({ id, dir: skillDir(ws.scope, id), activation: entry.activation });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Ask every adapter what it needs so providers see the canonical skills,
 * then apply it. `removedIds` are skills leaving the scope whose provider
 * artifacts must go too.
 */
export async function exposeProviders(
  services: Services,
  ws: Workspace,
  options: { removedIds?: string[]; dryRun?: boolean } = {},
): Promise<ExposureReport> {
  const skills = await resolvedSkills(ws);
  const activeIds = new Set(skills.map((s) => s.id));
  const inactive = [
    ...new Set([
      ...(options.removedIds ?? []),
      ...Object.keys(ws.lock.resolved).filter((id) => !activeIds.has(id)),
    ]),
  ];
  const changes: PlannedChange[] = [];
  const providers: ExposureReport['providers'] = [];
  for (const adapter of services.adapters) {
    const pctx = pctxFor(services, ws, adapter.id);
    const enabled = pctx.settings?.enabled ?? 'auto';
    if (enabled === false) {
      changes.push(...(await adapter.removeManagedArtifacts(pctx, [...activeIds, ...inactive])));
      providers.push({ id: adapter.id, displayName: adapter.displayName, active: false, reason: 'disabled in config' });
      continue;
    }
    let reason = 'enabled in config';
    if (enabled === 'auto') {
      const detection = await adapter.detect(pctx);
      if (!detection.detected) {
        providers.push({ id: adapter.id, displayName: adapter.displayName, active: false, reason: 'not detected' });
        if (inactive.length) changes.push(...(await adapter.removeManagedArtifacts(pctx, inactive)));
        continue;
      }
      reason = detection.evidence.join(', ') || 'detected';
    }
    providers.push({ id: adapter.id, displayName: adapter.displayName, active: true, reason });
    const plan =
      ws.scope.kind === 'project'
        ? await adapter.planProjectSkillExposure(pctx, skills)
        : await adapter.planUserSkillExposure(pctx, skills);
    changes.push(...plan);
    if (inactive.length) changes.push(...(await adapter.removeManagedArtifacts(pctx, inactive)));
  }
  const results = await applyChanges(changes, {
    root: ws.scope.root,
    env: services.ctx.env,
    platform: services.ctx.platform,
    dryRun: options.dryRun,
  });
  return { results, providers };
}

// ---------------------------------------------------------------------------
// Config vs lock
// ---------------------------------------------------------------------------

export interface LockMismatch {
  id: string;
  problem: string;
}

/** Differences between agileflow.yaml intent and agileflow.lock resolution. */
export function compareConfigToLock(services: Services, ws: Workspace): LockMismatch[] {
  const out: LockMismatch[] = [];
  for (const [id, spec] of Object.entries(ws.specs)) {
    const entry = ws.lock.resolved[id];
    if (!entry) {
      out.push({ id, problem: 'in agileflow.yaml but not in agileflow.lock' });
      continue;
    }
    if (entry.source !== spec.source) {
      out.push({ id, problem: `source changed (${entry.source} -> ${spec.source})` });
      continue;
    }
    const self = isSelfSource(ws.scope, id, spec, services.ctx.homeDir, services.ctx.platform);
    if (self !== (entry.ownership === 'local')) {
      out.push({ id, problem: 'ownership changed' });
      continue;
    }
    const ref = parseSource(spec.source);
    // Same prerelease semantics as version resolution (npm rules).
    if (ref.kind === 'registry' && spec.version && semver.valid(entry.version)) {
      if (!semver.satisfies(entry.version, spec.version)) {
        out.push({ id, problem: `locked ${entry.version} does not satisfy ${spec.version}` });
      }
    }
    if (ref.kind === 'git' && entry.ownership === 'managed') {
      const wanted = spec.ref;
      if (entry.ref !== undefined) {
        if (wanted !== entry.ref) out.push({ id, problem: `ref changed (${entry.ref} -> ${wanted ?? 'default branch'})` });
      } else if (wanted !== undefined) {
        // Locks written before refs were recorded: a commit ref is still comparable.
        if (COMMIT_RE.test(wanted) ? wanted !== entry.resolved : true) {
          out.push({ id, problem: `ref ${wanted} is not what agileflow.lock resolved` });
        }
      }
    }
  }
  for (const id of Object.keys(ws.lock.resolved)) {
    if (!ws.specs[id]) out.push({ id, problem: 'in agileflow.lock but no longer in agileflow.yaml' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncReport {
  materialized: string[];
  rerendered: string[];
  removed: string[];
  disabled: string[];
  kept: Array<{ id: string; reason: string }>;
  events: OperationEvent[];
  exposure: ExposureReport;
}

export interface SyncOptions {
  /** Skills leaving the scope whose provider artifacts must be removed. */
  removedIds?: string[];
  /** Only restore missing skills (`check --fix`). */
  missingOnly?: boolean;
  /**
   * `throw` (default, `agileflow sync`): refuse when config and lock
   * disagree. `report`: leave the mismatched skills untouched, report them,
   * and sync the rest (used after `add`/`update`, which already changed what
   * they could).
   */
  mismatch?: 'throw' | 'report';
  /** Re-render clean skills whose rendering changed with the CLI version (`update`). */
  refresh?: boolean;
  /** Report what would change without writing anything (`sync --dry-run`). */
  dryRun?: boolean;
}

/**
 * Make the filesystem match the lockfile. No version resolution.
 *
 * Only skills recorded in the lockfile (or in this machine's last sync
 * record) are touched; locally modified content is never overwritten.
 * Directory writes go through the crash-safe journal.
 */
export async function syncWorkspace(services: Services, ws: Workspace, options: SyncOptions = {}): Promise<SyncReport> {
  if (!ws.configExists) {
    throw new OperationError(`No ${path.basename(ws.scope.configPath)} found`, [
      ws.scope.kind === 'project' ? 'Run `agileflow init` first.' : 'Run `agileflow add --global <skill>` first.',
    ]);
  }
  const mismatches = compareConfigToLock(services, ws);
  if (mismatches.length && options.mismatch !== 'report') {
    throw new OperationError('agileflow.lock does not match agileflow.yaml', [
      ...mismatches.map((m) => `${m.id}: ${m.problem}`),
      'Run `agileflow update` to resolve the configuration into the lockfile.',
    ]);
  }

  const report: SyncReport = {
    materialized: [],
    rerendered: [],
    removed: [],
    disabled: [],
    kept: [],
    events: [],
    exposure: { results: [], providers: [] },
  };
  const skip = new Set(mismatches.map((m) => m.id));
  for (const m of mismatches) {
    report.events.push({ level: 'warn', skill: m.id, message: `${m.problem}; left unchanged (run \`agileflow update ${m.id}\`)` });
  }
  let lockChanged = false;
  const writes: SkillWrite[] = [];

  // Download what the loop below needs in parallel (bounded), then decide per skill.
  const states = new Map<string, Awaited<ReturnType<typeof inspectSkill>>>();
  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
    if (skip.has(id) || entry.ownership !== 'managed') continue;
    states.set(id, await inspectSkill(ws.scope, id, { ...entry, enabled: undefined }));
  }
  const toFetch = [...states.entries()]
    .filter(([id, state]) => ws.specs[id]?.enabled !== false && state.status !== 'modified' && !(options.missingOnly && state.status === 'clean'))
    .map(([id]) => id);
  const prefetched = startLimited(toFetch, 6, (id) => services.fetcher.fetchLocked(id, ws.lock.resolved[id]!, ws.scope.root));

  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
    if (skip.has(id)) continue;
    const spec = ws.specs[id]!;
    const wantEnabled = spec.enabled !== false;
    const wantActivation = effectiveActivation(spec, entry.activation);

    if (entry.ownership === 'local') {
      const next: LockEntry = { ...entry, activation: wantActivation };
      if (wantEnabled) delete next.enabled;
      else next.enabled = false;
      if (JSON.stringify(next) !== JSON.stringify(entry)) {
        ws.lock.resolved[id] = next;
        lockChanged = true;
      }
      if (!(await pathExists(skillDir(ws.scope, id)))) {
        report.events.push({
          level: 'error',
          skill: id,
          message: `locally owned skill is missing from ${entry.path}; restore it or run \`agileflow remove ${id}\``,
        });
      }
      continue;
    }

    const state = states.get(id) ?? (await inspectSkill(ws.scope, id, { ...entry, enabled: undefined }));

    if (!wantEnabled) {
      if (state.status === 'clean') {
        writes.push({ id, files: null, next: { ...entry, enabled: false } });
        report.disabled.push(id);
        continue;
      }
      if (state.status === 'modified') {
        report.kept.push({
          id,
          reason:
            'disabled but has local modifications; left in place and still visible to providers that read .agents/skills (fork or remove it to hide it)',
        });
      }
      if (entry.enabled !== false) {
        ws.lock.resolved[id] = { ...entry, enabled: false };
        lockChanged = true;
      }
      continue;
    }

    if (state.status === 'modified') {
      report.kept.push({
        id,
        reason: state.unhashed?.length
          ? `contains files AgileFlow does not track (${state.unhashed.join(', ')}); treated as local modifications`
          : 'local modifications',
      });
      if (wantActivation !== entry.activation) {
        report.events.push({
          level: 'warn',
          skill: id,
          message: `activation change to "${wantActivation}" not applied because the skill has local modifications`,
        });
      } else if (!options.missingOnly) {
        try {
          const pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root, { cacheOnly: true });
          if (
            !matchesRenderedHash(renderFor(services, ws, id, pkg, wantActivation), entry.renderedHash) &&
            renderedWithOtherPreference(services, ws, id, pkg, entry)
          ) {
            report.events.push({
              level: 'warn',
              skill: id,
              message: 'question preference change not applied because the skill has local modifications',
            });
          }
        } catch {
          // Package not cached; nothing to compare against.
        }
      }
      if (entry.enabled === false) {
        const { enabled: _drop, ...rest } = entry;
        ws.lock.resolved[id] = rest;
        lockChanged = true;
      }
      continue;
    }

    if (options.missingOnly && state.status === 'clean') continue;

    let pkg: FetchedPackage;
    try {
      const pending = prefetched.get(id);
      pkg = pending ? settledValue(await pending) : await services.fetcher.fetchLocked(id, entry, ws.scope.root);
    } catch (err) {
      const e = err as Error;
      if (e.name === 'IntegrityError') {
        // Content no longer matches the lock: never materialize it, never ignore it.
        report.events.push({ level: 'error', skill: id, message: e.message });
      } else if (e.name === 'SourceChangedError') {
        report.events.push({ level: 'warn', skill: id, message: e.message });
      } else if (state.status === 'clean') {
        // Offline with an empty cache: the files on disk are already correct
        // unless settings changed, which we cannot re-render without the package.
        report.events.push({ level: 'warn', skill: id, message: `could not load locked package to re-verify (${e.message})` });
      } else {
        report.events.push({ level: 'error', skill: id, message: `could not install: ${e.message}` });
      }
      continue;
    }
    let rendered: TreeFile[];
    try {
      rendered = renderFor(services, ws, id, pkg, wantActivation);
    } catch (err) {
      report.events.push({ level: 'error', skill: id, message: `could not render: ${(err as Error).message}` });
      continue;
    }
    if (state.status === 'clean' && entry.enabled !== false) {
      if (matchesRenderedHash(rendered, entry.renderedHash)) continue;
      if (wantActivation === entry.activation && !options.refresh && !renderedWithOtherPreference(services, ws, id, pkg, entry)) {
        // Only the renderer differs (a teammate's AgileFlow version): leave the
        // committed files alone instead of ping-ponging them; `update` refreshes.
        report.events.push({
          level: 'info',
          skill: id,
          message: 'rendered by a different AgileFlow version; `agileflow update` refreshes it',
        });
        continue;
      }
    }
    writes.push({ id, files: rendered, next: { ...lockEntryFor(id, pkg, rendered, wantActivation), ...(entry.ref ? { ref: entry.ref } : {}) } });
    if (state.status === 'missing' || state.status === 'disabled') report.materialized.push(id);
    else report.rerendered.push(id);
  }

  // Stale outputs: skills this machine materialized earlier that the lock no longer lists.
  const previous = await readSyncState(services.ctx, ws.scope);
  const deletedIds: string[] = [...(options.removedIds ?? [])];
  const processed = new Set<string>();
  if (previous) {
    for (const [id, rec] of Object.entries(previous.skills)) {
      if (ws.lock.resolved[id]) continue;
      processed.add(id);
      const files = await readSkillTree(ws.scope, id);
      if (!files) {
        deletedIds.push(id);
        continue;
      }
      const state = await inspectSkill(ws.scope, id, {
        source: '',
        version: '',
        path: rec.path,
        renderedHash: rec.renderedHash,
        activation: 'auto',
        ownership: 'managed',
      });
      if (state.status === 'clean') {
        writes.push({ id, files: null, next: null });
        report.removed.push(id);
        deletedIds.push(id);
      } else {
        report.kept.push({
          id,
          reason:
            'no longer in agileflow.lock but has local modifications; left as an unmanaged skill (its provider links were removed)',
        });
        deletedIds.push(id);
      }
    }
  }

  if (options.dryRun) {
    report.exposure = await exposeProviders(services, ws, { removedIds: [...new Set(deletedIds)], dryRun: true });
    return report;
  }
  try {
    if (writes.length) await commitSkillWrites(services, ws, writes);
    else if (lockChanged || !ws.lockExists) await saveLock(ws);
  } catch (err) {
    report.events.push({ level: 'error', message: `sync stopped: ${(err as Error).message}` });
    // Successful writes were recorded; report what failed instead of losing the report.
    const done = new Set(Object.keys(ws.lock.resolved));
    report.materialized = report.materialized.filter((id) => done.has(id));
    report.rerendered = report.rerendered.filter((id) => done.has(id));
  }
  report.exposure = await exposeProviders(services, ws, { removedIds: [...new Set(deletedIds)] });
  await recordSyncState(services, ws, { previous, processed });
  return report;
}

/**
 * Record what this machine materialized. Stale records that were not
 * processed yet (for example when `remove` runs before the next `sync`
 * after a pull) are carried over so their cleanup still happens.
 */
export async function recordSyncState(
  services: Services,
  ws: Workspace,
  options: { previous?: SyncState | null; processed?: Set<string> } = {},
): Promise<void> {
  const previous = options.previous === undefined ? await readSyncState(services.ctx, ws.scope) : options.previous;
  const skills: SyncState['skills'] = {};
  for (const [id, rec] of Object.entries(previous?.skills ?? {})) {
    if (ws.lock.resolved[id] || options.processed?.has(id)) continue;
    skills[id] = rec;
  }
  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
    if (entry.ownership !== 'managed') continue;
    skills[id] = { path: entry.path, ...(entry.renderedHash ? { renderedHash: entry.renderedHash } : {}) };
  }
  await writeSyncState(services.ctx, ws.scope, { version: 1, root: ws.scope.root, skills });
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export interface AddRequest {
  id: string;
  spec: SkillSpec;
}

export interface PreparedSkill {
  id: string;
  spec: SkillSpec;
  pkg: FetchedPackage;
  summary: SkillSummary;
  activation: Activation;
  /** Third-party content (not from the official @agileflow scope). */
  external: boolean;
  /** A path source pointing at the skill's own directory: registered, not copied. */
  local: boolean;
  /** Static review of what the agent will read (see `scanSkill`). */
  risks: RiskFinding[];
  /** The exact files that will be written (empty for local skills). */
  rendered: TreeFile[];
}

/**
 * Refuse to install over anything AgileFlow does not own: a hand-written
 * skill directory, a locally owned skill, or a managed skill with local
 * modifications. Shared by `add` and `update`.
 */
export async function assertInstallable(services: Services, ws: Workspace, id: string, spec: SkillSpec): Promise<void> {
  if (!SKILL_NAME_RE.test(id) || id.length > MAX_NAME_LENGTH) {
    throw new OperationError(`Invalid skill name "${id}"`, [
      'Skill names must be lowercase letters, digits, and single hyphens (max 64 characters).',
    ]);
  }
  if (isSelfSource(ws.scope, id, spec, services.ctx.homeDir, services.ctx.platform)) return;
  const entry = ws.lock.resolved[id];
  const rel = toPosix(path.relative(ws.scope.root, skillDir(ws.scope, id)));
  if (!entry) {
    if (await pathExists(skillDir(ws.scope, id))) {
      throw new OperationError(`${rel} already exists and is not managed by AgileFlow`, [
        'AgileFlow never overwrites skills it does not own. Rename or move that directory first.',
      ]);
    }
    return;
  }
  if (entry.ownership === 'local') {
    if (await pathExists(skillDir(ws.scope, id))) {
      throw new OperationError(`${id} is locally owned (${rel}); AgileFlow will not replace it`, [
        `Remove it from AgileFlow first: \`agileflow remove ${id}\` (your files are kept), then move them aside.`,
      ]);
    }
    return;
  }
  const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
  if (state.status === 'modified') {
    throw new OperationError(`${id} has local modifications`, [
      ...(state.unhashed?.length ? [`It contains files AgileFlow does not track: ${state.unhashed.join(', ')}`] : []),
      `Keep them: \`agileflow fork ${id}\``,
      `Discard them: \`agileflow remove ${id} --force\`, then add again`,
      `Inspect: \`agileflow diff ${id}\``,
    ]);
  }
}

export async function prepareAdd(
  services: Services,
  ws: Workspace,
  requests: AddRequest[],
  options: { activation?: Activation } = {},
): Promise<PreparedSkill[]> {
  const prepared: PreparedSkill[] = [];
  const seen = new Map<string, string>();
  for (const req of requests) {
    const other = seen.get(req.id);
    if (other !== undefined) {
      throw new OperationError(`Two sources provide a skill named ${req.id}`, [`${other}`, `${req.spec.source}`]);
    }
    seen.set(req.id, req.spec.source);
    if (ws.specs[req.id]) {
      throw new OperationError(`${req.id} is already in ${path.basename(ws.scope.configPath)}`, [
        `Use \`agileflow update ${req.id}\` to change its version.`,
      ]);
    }
    await assertInstallable(services, ws, req.id, req.spec);
  }
  for (const req of requests) {
    const local = isSelfSource(ws.scope, req.id, req.spec, services.ctx.homeDir, services.ctx.platform);
    const pkg = await services.fetcher.resolve(req.id, req.spec, ws.scope.root);
    const summary = summarizeTree(pkg.files);
    const activation = options.activation ?? req.spec.activation ?? packageActivation(pkg.files);
    let rendered: TreeFile[] = [];
    if (!local) {
      try {
        rendered = renderFor(services, ws, req.id, pkg, activation);
      } catch (err) {
        throw new OperationError(`${req.id} cannot be installed: ${(err as Error).message}`);
      }
    }
    prepared.push({
      id: req.id,
      spec: req.spec,
      pkg,
      summary,
      activation,
      external: !local && isExternalSource(req.spec.source),
      local,
      risks: local ? [] : scanSkill(pkg.files),
      rendered,
    });
  }
  return prepared;
}

/** The spec written to agileflow.yaml for a prepared skill. */
export function specForPrepared(item: PreparedSkill): SkillSpec {
  const spec: SkillSpec = { ...item.spec };
  // Pin registry skills to their major line so a breaking release is never a surprise.
  if (!spec.version && parseSource(spec.source).kind === 'registry') spec.version = defaultRange(item.pkg.version);
  if (item.activation !== packageActivation(item.pkg.files)) spec.activation = item.activation;
  return spec;
}

export async function commitAdd(services: Services, ws: Workspace, prepared: PreparedSkill[]): Promise<SyncReport> {
  const writes: SkillWrite[] = prepared.map((item) => {
    const spec = specForPrepared(item);
    return item.local
      ? { id: item.id, next: localLockEntry(item.id, item.spec, item.activation), spec }
      : { id: item.id, files: item.rendered, next: lockEntryFor(item.id, item.pkg, item.rendered, item.activation, spec), spec };
  });
  await commitSkillWrites(services, ws, writes);
  return syncWorkspace(services, ws, { mismatch: 'report' });
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

export interface RemoveReport {
  removed: string[];
  keptLocal: string[];
  artifacts: ApplyResult[];
}

export async function removeSkills(
  services: Services,
  ws: Workspace,
  ids: string[],
  options: { force?: boolean } = {},
): Promise<RemoveReport> {
  const report: RemoveReport = { removed: [], keptLocal: [], artifacts: [] };
  for (const id of ids) {
    if (!ws.lock.resolved[id] && !ws.specs[id]) {
      throw new OperationError(`${id} is not managed by AgileFlow in this scope`, [
        'AgileFlow only removes skills recorded in its lockfile. Unmanaged skills are left untouched.',
      ]);
    }
    const entry = ws.lock.resolved[id];
    if (entry && entry.ownership === 'managed') {
      const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
      if (state.status === 'modified' && !options.force) {
        throw new OperationError(`${id} has local modifications`, [
          ...(state.unhashed?.length ? [`It contains files AgileFlow does not track: ${state.unhashed.join(', ')}`] : []),
          `Keep them: \`agileflow fork ${id}\` (then remove from agileflow.yaml if you want it unmanaged)`,
          `Discard them: \`agileflow remove ${id} --force\``,
          `Inspect: \`agileflow diff ${id}\``,
        ]);
      }
    }
  }
  const writes: SkillWrite[] = [];
  for (const id of new Set(ids)) {
    const entry = ws.lock.resolved[id];
    if (entry?.ownership === 'local') report.keptLocal.push(id);
    writes.push({ id, ...(entry && entry.ownership === 'managed' ? { files: null } : {}), next: null, spec: 'remove' });
    report.removed.push(id);
  }
  const previous = await readSyncState(services.ctx, ws.scope);
  await commitSkillWrites(services, ws, writes);
  for (const id of report.removed) {
    for (const adapter of services.adapters) {
      const pctx = pctxFor(services, ws, adapter.id);
      const plan = await adapter.removeManagedArtifacts(pctx, [id]);
      report.artifacts.push(
        ...(await applyChanges(plan, { root: ws.scope.root, env: services.ctx.env, platform: services.ctx.platform })),
      );
    }
  }
  await recordSyncState(services, ws, { previous, processed: new Set(report.removed) });
  return report;
}

/** Load a scope's workspace fresh (after taking the scope lock). */
export async function reloadWorkspace(ws: Workspace): Promise<Workspace> {
  return loadWorkspace(ws.scope);
}
