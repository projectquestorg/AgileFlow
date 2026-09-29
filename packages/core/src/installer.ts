import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { InteractionPreferenceSchema, type Activation, type InteractionPreference, type LockEntry, type SkillSpec } from './config';
import { OperationError, settledValue, startLimited, type OperationEvent } from './errors';
import { pathExists, toPosix, type TreeFile } from './fs';
import { matchesRenderedHash, renderedRecordOf } from './hash';
import { applyChanges, type ApplyResult } from './links';
import { assertReplaceable, inspectSkill, readSkillTree, type SkillSnapshot } from './ownership';
import { packageActivation, RENDERER_REVISION, renderInputsFor, renderSkill } from './render';
import { scanSkill, type RiskFinding } from './scan';
import { reviewTrust, type TrustReview } from './trust';
import { isSameDir, skillDir, skillRelPath, type ScopeTarget } from './scope';
import { COMMIT_RE } from './config';
import { defaultRange, parseSource, resolvePathSource } from './source';
import { readSyncState, writeSyncState, type SyncState } from './state';
import { MAX_NAME_LENGTH, SKILL_NAME_RE, summarizeTree, type SkillSummary } from './skill';
import { commitSkillWrites, committedBefore, type SkillWrite } from './transaction';
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

export const NEEDS_APPROVAL = 'third-party change needs approval';

/**
 * Third-party content that `sync` only writes with approval: git sources and
 * non-official registries. Path sources are exempt because their content is
 * part of the repository being synced.
 */
function syncNeedsApproval(services: Services, entry: LockEntry, approved: string | undefined): boolean {
  if (parseSource(entry.source).kind === 'path') return false;
  if (!isExternalSource(entry.source, services.fetcher.officialRegistry !== false)) return false;
  return approved !== entry.integrity;
}

/**
 * Third-party content: anything that is not an official `@agileflow` registry
 * package or a local skill. `@agileflow/*` names only count as official when
 * the registry was not chosen by the repository (`officialRegistry`).
 */
export function isExternalSource(source: string, officialRegistry = true): boolean {
  const ref = parseSource(source);
  return !(officialRegistry && ref.kind === 'registry' && ref.name.startsWith('@agileflow/'));
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

/**
 * The lock entry recording `rendered` as the installed content of `pkg`:
 * the installed-file record (hash, rule version, executable files), this
 * CLI's renderer revision, and the render inputs (`activation` and the
 * question overlay `interactionPreference` produced).
 */
export function lockEntryFor(
  id: string,
  pkg: FetchedPackage,
  rendered: TreeFile[],
  activation: Activation,
  spec: SkillSpec | undefined,
  interactionPreference: InteractionPreference,
): LockEntry {
  const gitRef = spec?.ref && parseSource(pkg.source).kind === 'git' ? spec.ref : undefined;
  return {
    source: pkg.source,
    version: pkg.version,
    ...(pkg.resolved ? { resolved: pkg.resolved } : {}),
    ...(gitRef ? { ref: gitRef } : {}),
    integrity: pkg.integrity,
    path: skillRelPath(id),
    ...renderedRecordOf(rendered),
    renderer: RENDERER_REVISION,
    ...renderInputsFor(pkg.files, interactionPreference),
    activation,
    ownership: 'managed',
  };
}

export function localLockEntry(id: string, spec: SkillSpec, activation: Activation): LockEntry {
  return { source: spec.source, version: 'local', path: skillRelPath(id), activation, ownership: 'local' };
}

/**
 * Legacy entries (no recorded render inputs): true when `entry.renderedHash`
 * was produced with a question preference other than the current one, so
 * the render difference is a preference change (apply it), not a different
 * AgileFlow version's renderer (leave it).
 */
function renderedWithOtherPreference(services: Services, ws: Workspace, id: string, pkg: FetchedPackage, entry: LockEntry): boolean {
  return InteractionPreferenceSchema.options.some(
    (preference) =>
      preference !== ws.questionPreference &&
      matchesRenderedHash(renderFor(services, ws, id, pkg, entry.activation, preference), entry, { execBits: true }),
  );
}

/**
 * True when the configuration asks for a different render than the lock
 * recorded (activation or question overlay changed): apply it. Entries with
 * recorded inputs (`renderer` present) compare them; legacy entries fall back
 * to reproducing the hash with the other preferences.
 */
export function renderInputsChanged(
  services: Services,
  ws: Workspace,
  id: string,
  pkg: FetchedPackage,
  entry: LockEntry,
  activation: Activation,
): boolean {
  if (activation !== entry.activation) return true;
  if (entry.renderer === undefined) {
    // Reproducing the hash with the current settings means nothing changed,
    // even when other preferences would render the same (no overlay applies).
    if (matchesRenderedHash(renderFor(services, ws, id, pkg, activation), entry, { execBits: true })) return false;
    return renderedWithOtherPreference(services, ws, id, pkg, entry);
  }
  return renderInputsFor(pkg.files, ws.questionPreference).questionOverlay !== entry.questionOverlay;
}

/**
 * Info text for a clean skill whose lock records another renderer than this
 * CLI's, or null when the renderers agree. Nothing is rewritten for it:
 * `agileflow update` lists the re-render and applies it on request.
 */
export function rendererDrift(entry: LockEntry): string | null {
  if (entry.renderer === RENDERER_REVISION) return null;
  if (entry.renderer === undefined) {
    return 'rendered by another AgileFlow version (renderer not recorded); left as committed. `agileflow update` re-renders it with this CLI';
  }
  if (entry.renderer > RENDERER_REVISION) {
    return `rendered by AgileFlow renderer ${entry.renderer}; this CLI uses renderer ${RENDERER_REVISION}. Left as committed; upgrade AgileFlow to reproduce it`;
  }
  return `rendered by AgileFlow renderer ${entry.renderer}; this CLI uses renderer ${RENDERER_REVISION}. Left as committed; \`agileflow update\` re-renders it with this CLI`;
}

/**
 * True when `files` are exactly what this CLI renders for the locked package
 * and recorded inputs, and that render is not the locked one: a copy restored
 * by a CLI whose renderer differs from the one the lock records. Not a user
 * edit, so `check` and `update` treat it as clean. When this CLI reproduces
 * the lock, any difference is an edit. `execBits` as for `inspectSkill`.
 */
export function isOwnRender(
  services: Services,
  ws: Workspace,
  id: string,
  entry: LockEntry,
  pkg: FetchedPackage,
  files: TreeFile[],
  options: { execBits?: boolean } = {},
): boolean {
  if (entry.ownership !== 'managed' || pkg.integrity !== entry.integrity) return false;
  const preference = entry.renderer === undefined ? ws.questionPreference : (entry.questionOverlay ?? 'provider-default');
  try {
    const own = renderFor(services, ws, id, pkg, entry.activation, preference);
    if (matchesRenderedHash(own, entry, { execBits: true })) return false;
    return matchesRenderedHash(files, renderedRecordOf(own), options);
  } catch {
    return false;
  }
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
  /** Third-party writes that were not approved (left as they are). */
  needsApproval?: PendingApproval[];
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
  /** Report what would change without writing anything (`sync --dry-run`). */
  dryRun?: boolean;
  /**
   * Write third-party content this machine has not installed before (a
   * teammate's lock change, a fresh clone). Without it, and without
   * `confirmExternal` agreeing, such skills are kept as they are with
   * `NEEDS_APPROVAL`.
   */
  approveExternal?: boolean;
  /** Interactive review of the pending third-party writes; true approves all of them. */
  confirmExternal?: (pending: PendingApproval[]) => Promise<boolean>;
}

export interface PendingApproval {
  id: string;
  source: string;
  version: string;
  resolved?: string;
  trust: TrustReview;
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
  const previous = await readSyncState(services.ctx, ws.scope);
  // Skills whose locked content is on disk after this run (verified clean or
  // written): only these are recorded as installed, and so approved, here.
  const verified = new Set<string>();
  // Skills written with a render that differs from the lock (this CLI's
  // renderer): what is really on disk, so this machine recognizes its own copy.
  const written = new Map<string, string>();
  // Third-party writes wait here until approved (see `syncNeedsApproval`).
  const gated: Array<{ write: SkillWrite; pending: PendingApproval; bucket: 'materialized' | 'rerendered' }> = [];

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

    const machineRecord = previous?.skills[id];
    const lockMovedOn =
      state.status === 'modified' &&
      !state.unhashed?.length &&
      !!machineRecord?.renderedHash &&
      (machineRecord.lockedHash ?? machineRecord.renderedHash) !== entry.renderedHash &&
      matchesRenderedHash((await readSkillTree(ws.scope, id)) ?? [], machineRecord.renderedHash);
    // A copy this CLI restored with its own renderer (the lock records another
    // renderer's output) is AgileFlow's content, not a local modification.
    if (state.status === 'modified' && !lockMovedOn && !state.unhashed?.length && state.files && entry.ownership === 'managed') {
      const own = await services.fetcher
        .fetchLocked(id, entry, ws.scope.root, { cacheOnly: true })
        .then((pkg) => isOwnRender(services, ws, id, entry, pkg, state.files!))
        .catch(() => false);
      if (own) {
        verified.add(id);
        written.set(id, renderedRecordOf(state.files).renderedHash);
        continue;
      }
    }
    if (state.status === 'modified' && !lockMovedOn) {
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
          const legacyUnchanged =
            entry.renderer === undefined && matchesRenderedHash(renderFor(services, ws, id, pkg, wantActivation), entry, { execBits: true });
          if (!legacyUnchanged && renderInputsChanged(services, ws, id, pkg, entry, wantActivation)) {
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

    if (options.missingOnly && state.status === 'clean') {
      verified.add(id);
      continue;
    }

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
        verified.add(id);
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
    // The lock is authoritative unless the configuration asks for another
    // render. A render that differs only because this CLI's renderer does
    // (a teammate on another AgileFlow version) never rewrites the lock, so
    // CLIs cannot ping-pong the committed files; `update` adopts it on request.
    const inputsChanged = renderInputsChanged(services, ws, id, pkg, entry, wantActivation);
    if (!inputsChanged) {
      const { enabled: _enabled, ...kept } = entry;
      const reproduces = matchesRenderedHash(rendered, entry, { execBits: true });
      if (state.status === 'clean' && entry.enabled !== false) {
        verified.add(id);
        if (state.modeDrift && !options.dryRun) {
          await repairModes(ws.scope, id, entry);
          report.events.push({ level: 'info', skill: id, message: 'executable bits differed from agileflow.lock; restored' });
        }
        if (!reproduces) {
          const drift = rendererDrift(entry);
          if (drift) report.events.push({ level: 'info', skill: id, message: drift });
        }
        continue;
      }
      // Missing, enabled again, or replaced by a teammate's lock change:
      // restore it and keep the locked entry.
      const restore: SkillWrite = { id, files: rendered, next: kept, ...(lockMovedOn ? { expect: state.snapshot } : {}) };
      if (syncNeedsApproval(services, entry, machineRecord?.integrity)) {
        gated.push({ write: restore, pending: await pendingFor(ws, id, entry, pkg), bucket: lockMovedOn ? 'rerendered' : 'materialized' });
        continue;
      }
      writes.push(restore);
      if (!reproduces) written.set(id, renderedRecordOf(rendered).renderedHash);
      if (lockMovedOn) report.rerendered.push(id);
      else report.materialized.push(id);
      if (!reproduces) {
        report.events.push({
          level: 'info',
          skill: id,
          message:
            `${rendererDrift(entry) ?? 'the locked render could not be reproduced'}. ` +
            'Restored with this CLI\'s renderer and agileflow.lock left unchanged, so the copy differs from the lock until everyone uses the same renderer.',
        });
      }
      continue;
    }
    const rerender: SkillWrite = {
      id,
      files: rendered,
      next: { ...lockEntryFor(id, pkg, rendered, wantActivation, undefined, ws.questionPreference), ...(entry.ref ? { ref: entry.ref } : {}) },
      ...(lockMovedOn ? { expect: state.snapshot } : {}),
    };
    const bucket = state.status === 'missing' || state.status === 'disabled' ? 'materialized' : 'rerendered';
    if ((state.status !== 'clean' || lockMovedOn) && syncNeedsApproval(services, entry, machineRecord?.integrity)) {
      gated.push({ write: rerender, pending: await pendingFor(ws, id, entry, pkg), bucket });
      continue;
    }
    writes.push(rerender);
    report[bucket].push(id);
  }

  if (gated.length) {
    const approved =
      !!options.approveExternal || (!options.dryRun && !!options.confirmExternal && (await options.confirmExternal(gated.map((g) => g.pending))));
    for (const g of gated) {
      if (approved) {
        writes.push(g.write);
        if (g.write.files && !matchesRenderedHash(g.write.files, g.write.next ?? undefined)) {
          written.set(g.write.id, renderedRecordOf(g.write.files).renderedHash);
        }
        report[g.bucket].push(g.write.id);
      } else {
        report.kept.push({ id: g.write.id, reason: NEEDS_APPROVAL });
      }
    }
    if (!approved) report.needsApproval = gated.map((g) => g.pending);
  }

  // Stale outputs: skills this machine materialized earlier that the lock no longer lists.
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
        writes.push({ id, files: null, next: null, expect: state.snapshot });
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
    if (writes.length) {
      // Replace only what was inspected above: an edit made during the downloads is kept.
      for (const w of writes) w.expect ??= states.get(w.id)?.snapshot;
      const committed = await commitSkillWrites(services, ws, writes);
      for (const id of committed.done) verified.add(id);
      report.events.push(...committed.events);
      const skipped = new Set(committed.skipped);
      for (const key of ['materialized', 'rerendered', 'removed', 'disabled'] as const) {
        report[key] = report[key].filter((id) => !skipped.has(id));
      }
    } else if (lockChanged || !ws.lockExists) await saveLock(ws);
  } catch (err) {
    report.events.push({ level: 'error', message: `sync stopped: ${(err as Error).message}` });
    // Successful writes were recorded; report only those instead of the plan.
    const done = new Set(committedBefore(err) ?? []);
    for (const key of ['materialized', 'rerendered', 'removed', 'disabled'] as const) {
      report[key] = report[key].filter((id) => done.has(id));
    }
    for (const id of done) verified.add(id);
  }
  report.exposure = await exposeProviders(services, ws, { removedIds: [...new Set(deletedIds)] });
  await recordSyncState(services, ws, { previous, processed, verified, written });
  return report;
}

/** Set each file's executable bit to what the lock recorded (content is unchanged). */
async function repairModes(scope: ScopeTarget, id: string, entry: LockEntry): Promise<void> {
  const want = new Set(entry.executables ?? []);
  for (const file of (await readSkillTree(scope, id)) ?? []) {
    if (file.executable === want.has(file.path)) continue;
    const abs = path.join(skillDir(scope, id), ...file.path.split('/'));
    const mode = (await fs.promises.stat(abs)).mode;
    await fs.promises.chmod(abs, want.has(file.path) ? mode | 0o111 : mode & ~0o111);
  }
}

/** What approving a third-party sync write means, compared with what this machine has installed. */
async function pendingFor(ws: Workspace, id: string, entry: LockEntry, pkg: FetchedPackage): Promise<PendingApproval> {
  const installed = await readSkillTree(ws.scope, id).catch(() => null);
  const after = { source: pkg.source, files: pkg.files };
  return {
    id,
    source: entry.source,
    version: entry.version,
    ...(entry.resolved ? { resolved: entry.resolved } : {}),
    trust: installed ? reviewTrust({ source: entry.source, files: installed }, after, 'installed') : reviewTrust(null, after),
  };
}

/**
 * Record what this machine materialized. Stale records that were not
 * processed yet (for example when `remove` runs before the next `sync`
 * after a pull) are carried over so their cleanup still happens.
 */
export async function recordSyncState(
  services: Services,
  ws: Workspace,
  options: { previous?: SyncState | null; processed?: Set<string>; verified?: Set<string>; written?: Map<string, string> } = {},
): Promise<void> {
  const previous = options.previous === undefined ? await readSyncState(services.ctx, ws.scope) : options.previous;
  const skills: SyncState['skills'] = {};
  for (const [id, rec] of Object.entries(previous?.skills ?? {})) {
    if (ws.lock.resolved[id] || options.processed?.has(id)) continue;
    skills[id] = rec;
  }
  for (const [id, entry] of Object.entries(ws.lock.resolved)) {
    if (entry.ownership !== 'managed') continue;
    // Only content verified on disk in this run is recorded as installed (and
    // so approved). Anything else (skipped, disabled, failed, waiting for
    // approval) keeps this machine's previous record, so the next sync still
    // asks and still recognizes the files it installed.
    if (!options.verified?.has(id)) {
      const kept = previous?.skills[id];
      skills[id] = kept ?? { path: entry.path, ...(entry.renderedHash ? { renderedHash: entry.renderedHash } : {}) };
      continue;
    }
    const renderedHash = options.written?.get(id) ?? entry.renderedHash;
    skills[id] = {
      path: entry.path,
      ...(renderedHash ? { renderedHash } : {}),
      ...(renderedHash !== entry.renderedHash && entry.renderedHash ? { lockedHash: entry.renderedHash } : {}),
      ...(entry.integrity ? { integrity: entry.integrity } : {}),
    };
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
  /** What was at the skill path when it was prepared; the install is skipped if that changes before writing. */
  expect?: SkillSnapshot;
}

/**
 * Refuse to install over anything AgileFlow does not own: a hand-written
 * skill directory, a locally owned skill, or a managed skill with local
 * modifications (`assertReplaceable`). Returns what is at the skill path,
 * so the write can confirm nothing changed in between.
 */
export async function assertInstallable(services: Services, ws: Workspace, id: string, spec: SkillSpec): Promise<SkillSnapshot | undefined> {
  if (!SKILL_NAME_RE.test(id) || id.length > MAX_NAME_LENGTH) {
    throw new OperationError(`Invalid skill name "${id}"`, [
      'Skill names must be lowercase letters, digits, and single hyphens (max 64 characters).',
    ]);
  }
  if (isSelfSource(ws.scope, id, spec, services.ctx.homeDir, services.ctx.platform)) return undefined;
  return (await assertReplaceable(ws.scope, id, ws.lock.resolved[id])).snapshot;
}

export async function prepareAdd(
  services: Services,
  ws: Workspace,
  requests: AddRequest[],
  options: { activation?: Activation } = {},
): Promise<PreparedSkill[]> {
  const prepared: PreparedSkill[] = [];
  const seen = new Map<string, string>();
  const onDisk = new Map<string, SkillSnapshot | undefined>();
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
    onDisk.set(req.id, await assertInstallable(services, ws, req.id, req.spec));
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
      external: !local && isExternalSource(req.spec.source, services.fetcher.officialRegistry !== false),
      local,
      risks: local ? [] : scanSkill(pkg.files),
      rendered,
      ...(onDisk.get(req.id) ? { expect: onDisk.get(req.id) } : {}),
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
      : {
          id: item.id,
          files: item.rendered,
          next: lockEntryFor(item.id, item.pkg, item.rendered, item.activation, spec, ws.questionPreference),
          spec,
          expect: item.expect,
        };
  });
  const committed = await commitSkillWrites(services, ws, writes);
  if (!committed.done.length) {
    throw new OperationError(`Nothing was installed: ${committed.events.map((e) => `${e.skill} ${e.message}`).join('; ')}`, [
      'Check what is there now (`agileflow list`), then run the command again.',
    ]);
  }
  const report = await syncWorkspace(services, ws, { mismatch: 'report' });
  report.events.unshift(...committed.events);
  return report;
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

export interface RemoveReport {
  removed: string[];
  keptLocal: string[];
  artifacts: ApplyResult[];
  /** Skills that changed after they were checked were left in place (error events). */
  events: OperationEvent[];
}

export async function removeSkills(
  services: Services,
  ws: Workspace,
  ids: string[],
  options: { force?: boolean } = {},
): Promise<RemoveReport> {
  const report: RemoveReport = { removed: [], keptLocal: [], artifacts: [], events: [] };
  const onDisk = new Map<string, SkillSnapshot>();
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
      onDisk.set(id, state.snapshot);
    }
  }
  const writes: SkillWrite[] = [];
  for (const id of new Set(ids)) {
    const entry = ws.lock.resolved[id];
    if (entry?.ownership === 'local') report.keptLocal.push(id);
    writes.push({ id, ...(entry && entry.ownership === 'managed' ? { files: null, expect: onDisk.get(id) } : {}), next: null, spec: 'remove' });
  }
  const previous = await readSyncState(services.ctx, ws.scope);
  const committed = await commitSkillWrites(services, ws, writes);
  report.removed = committed.done;
  report.keptLocal = report.keptLocal.filter((id) => committed.done.includes(id));
  report.events = committed.events;
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
