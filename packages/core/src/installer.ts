import path from 'node:path';
import semver from 'semver';
import type { LockEntry, SkillSpec, Activation } from './config';
import { pathExists, removePath, replaceDirAtomic, toPosix, type TreeFile } from './fs';
import { hashTree } from './hash';
import { applyChanges, type ApplyResult } from './links';
import { inspectSkill, readSkillTree } from './ownership';
import { packageActivation, renderSkill } from './render';
import { skillDir, skillRelPath, type ScopeTarget } from './scope';
import { defaultRange, parseSource, resolvePathSource } from './source';
import { readSyncState, writeSyncState } from './state';
import { MAX_NAME_LENGTH, SKILL_NAME_RE, summarizeTree, type SkillSummary } from './skill';
import type { FetchedPackage, PlannedChange, ProviderContext, ResolvedSkill } from './types';
import {
  loadWorkspace,
  removeSkillSpecs,
  saveLock,
  setSkillSpecs,
  type Services,
  type Workspace,
} from './workspace';

export class OperationError extends Error {
  constructor(
    message: string,
    readonly hint?: string[],
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

export interface OperationEvent {
  level: 'info' | 'warn' | 'error';
  skill?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Local ownership helpers
// ---------------------------------------------------------------------------

/** True when a spec points at the skill's own install directory (fork / local skill). */
export function isSelfSource(scope: ScopeTarget, id: string, spec: SkillSpec, homeDir: string): boolean {
  const ref = parseSource(spec.source);
  if (ref.kind !== 'path') return false;
  return path.resolve(resolvePathSource(ref.path, scope.root, homeDir)) === path.resolve(skillDir(scope, id));
}

export function effectiveActivation(spec: SkillSpec | undefined, fallback: Activation): Activation {
  return spec?.activation ?? fallback;
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
): TreeFile[] {
  return renderSkill(pkg.files, {
    id,
    managed: true,
    activation,
    questionPreference: ws.questionPreference,
    adapters: services.adapters,
  });
}

/** Write a package into `.agents/skills/<id>` and return its lock entry. */
export async function materialize(
  services: Services,
  ws: Workspace,
  id: string,
  pkg: FetchedPackage,
  activation: Activation,
): Promise<LockEntry> {
  const rendered = renderFor(services, ws, id, pkg, activation);
  await replaceDirAtomic(skillDir(ws.scope, id), rendered);
  return {
    source: pkg.source,
    version: pkg.version,
    ...(pkg.resolved ? { resolved: pkg.resolved } : {}),
    integrity: pkg.integrity,
    path: skillRelPath(id),
    baseHash: hashTree(rendered),
    activation,
    ownership: 'managed',
  };
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
// Sync
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
    const self = isSelfSource(ws.scope, id, spec, services.ctx.homeDir);
    if (self !== (entry.ownership === 'local')) {
      out.push({ id, problem: 'ownership changed' });
      continue;
    }
    const ref = parseSource(spec.source);
    if (ref.kind === 'registry' && spec.version && semver.valid(entry.version)) {
      if (!semver.satisfies(entry.version, spec.version, { includePrerelease: true })) {
        out.push({ id, problem: `locked ${entry.version} does not satisfy ${spec.version}` });
      }
    }
    if (ref.kind === 'git' && spec.ref && entry.resolved && spec.ref !== entry.resolved) {
      // A moving ref is resolved by `update`; nothing to compare here.
    }
  }
  for (const id of Object.keys(ws.lock.resolved)) {
    if (!ws.specs[id]) out.push({ id, problem: 'in agileflow.lock but no longer in agileflow.yaml' });
  }
  return out;
}

export interface SyncReport {
  materialized: string[];
  rerendered: string[];
  removed: string[];
  disabled: string[];
  kept: Array<{ id: string; reason: string }>;
  events: OperationEvent[];
  exposure: ExposureReport;
}

/**
 * Make the filesystem match the lockfile. No version resolution.
 *
 * Only skills recorded in the lockfile (or in this machine's last sync
 * record) are touched; locally modified content is never overwritten.
 */
export async function syncWorkspace(
  services: Services,
  wsIn?: Workspace,
  options: { scope?: ScopeTarget; removedIds?: string[]; missingOnly?: boolean } = {},
): Promise<SyncReport> {
  const ws = wsIn ?? (await loadWorkspace(options.scope!));
  if (!ws.configExists) {
    throw new OperationError(`No ${path.basename(ws.scope.configPath)} found`, [
      ws.scope.kind === 'project' ? 'Run `agileflow init` first.' : 'Run `agileflow add --global <skill>` first.',
    ]);
  }
  const mismatches = compareConfigToLock(services, ws);
  if (mismatches.length) {
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
  let lockChanged = false;

  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
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

    const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });

    if (!wantEnabled) {
      if (state.status === 'clean') {
        await removePath(skillDir(ws.scope, id));
        report.disabled.push(id);
      } else if (state.status === 'modified') {
        report.kept.push({ id, reason: 'disabled but has local modifications; left in place' });
      }
      if (entry.enabled !== false) {
        ws.lock.resolved[id] = { ...entry, enabled: false };
        lockChanged = true;
      }
      continue;
    }

    if (state.status === 'modified') {
      report.kept.push({ id, reason: 'local modifications' });
      if (wantActivation !== entry.activation) {
        report.events.push({
          level: 'warn',
          skill: id,
          message: `activation change to "${wantActivation}" not applied because the skill has local modifications`,
        });
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
      pkg = await services.fetcher.fetchLocked(id, entry, ws.scope.root);
    } catch (err) {
      if ((err as Error).name === 'IntegrityError') {
        // Content no longer matches the lock: never materialize it, never ignore it.
        report.events.push({ level: 'error', skill: id, message: (err as Error).message });
        continue;
      }
      if (state.status === 'clean') {
        // Offline with an empty cache: the files on disk are already correct
        // unless settings changed, which we cannot re-render without the package.
        report.events.push({
          level: 'warn',
          skill: id,
          message: `could not load locked package to re-verify (${(err as Error).message})`,
        });
        continue;
      }
      throw err;
    }
    const rendered = renderFor(services, ws, id, pkg, wantActivation);
    const renderedHash = hashTree(rendered);
    if (state.status === 'clean' && renderedHash === entry.baseHash && entry.enabled !== false) continue;

    await replaceDirAtomic(skillDir(ws.scope, id), rendered);
    const next: LockEntry = { ...entry, activation: wantActivation, baseHash: renderedHash };
    delete next.enabled;
    ws.lock.resolved[id] = next;
    lockChanged = true;
    if (state.status === 'missing' || state.status === 'disabled') report.materialized.push(id);
    else report.rerendered.push(id);
  }

  // Stale outputs: skills this machine materialized earlier that the lock no longer lists.
  const previous = await readSyncState(services.ctx, ws.scope);
  const staleIds: string[] = [...(options.removedIds ?? [])];
  if (previous) {
    for (const [id, rec] of Object.entries(previous.skills)) {
      if (ws.lock.resolved[id]) continue;
      staleIds.push(id);
      const files = await readSkillTree(ws.scope, id);
      if (!files) continue;
      if (rec.baseHash && hashTree(files) === rec.baseHash) {
        await removePath(skillDir(ws.scope, id));
        report.removed.push(id);
      } else {
        report.kept.push({ id, reason: 'no longer in agileflow.lock but has local modifications; left as unmanaged' });
      }
    }
  }

  if (lockChanged || !ws.lockExists) await saveLock(ws);
  report.exposure = await exposeProviders(services, ws, { removedIds: [...new Set(staleIds)] });
  await recordSyncState(services, ws);
  return report;
}

export async function recordSyncState(services: Services, ws: Workspace): Promise<void> {
  const skills: Record<string, { path: string; baseHash?: string }> = {};
  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
    if (entry.ownership !== 'managed') continue;
    skills[id] = { path: entry.path, ...(entry.baseHash ? { baseHash: entry.baseHash } : {}) };
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
}

export async function prepareAdd(
  services: Services,
  ws: Workspace,
  requests: AddRequest[],
  options: { activation?: Activation } = {},
): Promise<PreparedSkill[]> {
  const prepared: PreparedSkill[] = [];
  for (const req of requests) {
    // Ids become directory names; a hostile SKILL.md name must never escape .agents/skills.
    if (!SKILL_NAME_RE.test(req.id) || req.id.length > MAX_NAME_LENGTH) {
      throw new OperationError(`Invalid skill name "${req.id}"`, [
        'Skill names must be lowercase letters, digits, and single hyphens (max 64 characters).',
      ]);
    }
    if (ws.specs[req.id]) {
      throw new OperationError(`${req.id} is already in ${path.basename(ws.scope.configPath)}`, [
        `Use \`agileflow update ${req.id}\` to change its version.`,
      ]);
    }
    const local = isSelfSource(ws.scope, req.id, req.spec, services.ctx.homeDir);
    if (!local && !ws.lock.resolved[req.id] && (await pathExists(skillDir(ws.scope, req.id)))) {
      throw new OperationError(
        `${toPosix(path.relative(ws.scope.root, skillDir(ws.scope, req.id)))} already exists and is not managed by AgileFlow`,
        ['AgileFlow never overwrites skills it does not own. Rename or move that directory first.'],
      );
    }
    const pkg = await services.fetcher.resolve(req.id, req.spec, ws.scope.root);
    const summary = summarizeTree(pkg.files);
    const ref = parseSource(req.spec.source);
    prepared.push({
      id: req.id,
      spec: req.spec,
      pkg,
      summary,
      activation: options.activation ?? req.spec.activation ?? packageActivation(pkg.files),
      external: !(ref.kind === 'registry' && ref.name.startsWith('@agileflow/')) && !local,
      local,
    });
  }
  return prepared;
}

export async function commitAdd(services: Services, ws: Workspace, prepared: PreparedSkill[]): Promise<SyncReport> {
  const specs: Record<string, SkillSpec> = {};
  for (const item of prepared) {
    const spec: SkillSpec = { ...item.spec };
    // Pin registry skills to their major line so a breaking release is never a surprise.
    if (!spec.version && parseSource(spec.source).kind === 'registry') spec.version = defaultRange(item.pkg.version);
    if (item.activation !== packageActivation(item.pkg.files)) spec.activation = item.activation;
    specs[item.id] = spec;
    if (item.local) {
      ws.lock.resolved[item.id] = {
        source: item.spec.source,
        version: 'local',
        path: skillRelPath(item.id),
        activation: item.activation,
        ownership: 'local',
      };
    } else {
      ws.lock.resolved[item.id] = await materialize(services, ws, item.id, item.pkg, item.activation);
    }
    ws.specs[item.id] = spec;
  }
  await setSkillSpecs(ws.scope, specs);
  ws.configExists = true;
  await saveLock(ws);
  return syncWorkspace(services, ws);
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
          `Keep them: \`agileflow fork ${id}\` (then remove from agileflow.yaml if you want it unmanaged)`,
          `Discard them: \`agileflow remove ${id} --force\``,
          `Inspect: \`agileflow diff ${id}\``,
        ]);
      }
    }
  }
  for (const id of ids) {
    const entry = ws.lock.resolved[id];
    if (entry?.ownership === 'local') {
      report.keptLocal.push(id);
    } else if (entry) {
      await removePath(skillDir(ws.scope, id));
    }
    for (const adapter of services.adapters) {
      const pctx = pctxFor(services, ws, adapter.id);
      const plan = await adapter.removeManagedArtifacts(pctx, [id]);
      report.artifacts.push(
        ...(await applyChanges(plan, { root: ws.scope.root, env: services.ctx.env, platform: services.ctx.platform })),
      );
    }
    delete ws.lock.resolved[id];
    delete ws.specs[id];
    report.removed.push(id);
  }
  await removeSkillSpecs(ws.scope, ids);
  await saveLock(ws);
  await recordSyncState(services, ws);
  return report;
}
