import fs from 'node:fs';
import path from 'node:path';
import { pathExists, removePath, writeFileAtomic } from './fs';
import { exposeProviders } from './installer';
import { MIRROR_MARKER, classifyEntry } from './links';
import { inspectSkill } from './ownership';
import { stripManagedNotice } from './render';
import { skillDir } from './scope';
import { SKILL_FILE } from './skill';
import { projectStateDir } from './state';
import { readGlobalConfig } from './config';
import { setConfigValue, type Services, type Workspace } from './workspace';

async function personalConfigHasSettings(file: string): Promise<boolean> {
  const config = await readGlobalConfig(file).catch(() => null);
  if (!config) return false;
  const defaults = config.defaults?.questionPreference && config.defaults.questionPreference !== 'provider-default';
  return !!(defaults || config.registry || (config.providers && Object.keys(config.providers).length));
}

export interface DetachReport {
  keptSkills: string[];
  removedSkills: string[];
  keptModified: string[];
  removedFiles: string[];
  providerArtifacts: number;
}

export interface DetachPlan {
  keepSkills: boolean;
  /** With `keepSkills`: skills that stay as standalone Agent Skills. */
  kept: string[];
  /** Without `keepSkills`: unmodified skills whose directories will be deleted. */
  remove: string[];
  /** Without `keepSkills`: modified or locally owned skills that stay. */
  keptModified: string[];
  /** Config/lock files that will be removed. */
  files: string[];
}

/** What `detachWorkspace` would do. Read-only; used to show and confirm the change first. */
export async function planDetach(ws: Workspace, options: { keepSkills: boolean }): Promise<DetachPlan> {
  const plan: DetachPlan = { keepSkills: options.keepSkills, kept: [], remove: [], keptModified: [], files: [] };
  for (const id of Object.keys(ws.lock.resolved)) {
    if (options.keepSkills) {
      if (await pathExists(path.join(skillDir(ws.scope, id), SKILL_FILE))) plan.kept.push(id);
      continue;
    }
    const entry = ws.lock.resolved[id]!;
    const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
    if (state.status === 'clean') plan.remove.push(id);
    else if (state.status === 'modified' || state.status === 'local') plan.keptModified.push(id);
  }
  const keepPersonalConfig = ws.scope.kind === 'global' && (await personalConfigHasSettings(ws.scope.configPath));
  for (const file of keepPersonalConfig ? [ws.scope.lockPath] : [ws.scope.configPath, ws.scope.lockPath]) {
    if (await pathExists(file)) plan.files.push(file);
  }
  return plan;
}

/**
 * Stop using AgileFlow in a scope (`agileflow remove --all`, `migrate --detach`).
 *
 * With `keepSkills` (the default) every skill stays as a standalone Agent
 * Skill: the managed notice is removed, and Claude links stay so Claude keeps
 * seeing them. Nothing depends on AgileFlow afterwards.
 */
export async function detachWorkspace(
  services: Services,
  ws: Workspace,
  options: { keepSkills: boolean },
): Promise<DetachReport> {
  const report: DetachReport = {
    keptSkills: [],
    removedSkills: [],
    keptModified: [],
    removedFiles: [],
    providerArtifacts: 0,
  };
  const ids = Object.keys(ws.lock.resolved);

  if (options.keepSkills) {
    for (const id of ids) {
      const file = path.join(skillDir(ws.scope, id), SKILL_FILE);
      try {
        const text = await fs.promises.readFile(file, 'utf8');
        const stripped = stripManagedNotice(text);
        if (stripped !== text) await writeFileAtomic(file, stripped);
        report.keptSkills.push(id);
      } catch {
        // skill missing on disk; nothing to keep
      }
    }
    // Generated mirrors become plain copies owned by the user.
    for (const adapter of services.adapters) {
      const pctx = { ctx: services.ctx, scope: ws.scope, settings: ws.providerSettings[adapter.id] };
      for (const change of await adapter.removeManagedArtifacts(pctx, ids)) {
        if (change.kind !== 'remove') continue;
        const state = await classifyEntry(change.path, skillDir(ws.scope, change.skillId));
        if (state.state === 'mirror') {
          await removePath(path.join(change.path, MIRROR_MARKER));
          // The user-owned copy must not keep telling people to run `agileflow fork`.
          const mirrored = path.join(change.path, SKILL_FILE);
          const text = await fs.promises.readFile(mirrored, 'utf8').catch(() => null);
          if (text !== null && stripManagedNotice(text) !== text) await writeFileAtomic(mirrored, stripManagedNotice(text));
          report.providerArtifacts++;
        }
      }
    }
  } else {
    for (const id of ids) {
      const entry = ws.lock.resolved[id]!;
      const state = await inspectSkill(ws.scope, id, { ...entry, enabled: undefined });
      if (state.status === 'clean') {
        await removePath(skillDir(ws.scope, id));
        report.removedSkills.push(id);
      } else if (state.status === 'modified' || state.status === 'local') {
        report.keptModified.push(id);
      }
    }
    const removedIds = report.removedSkills;
    const snapshot = { ...ws, lock: { version: 1 as const, resolved: {} } };
    const exposure = await exposeProviders(services, snapshot, { removedIds });
    report.providerArtifacts = exposure.results.filter((r) => r.outcome === 'done').length;
  }

  // The personal config also holds defaults, provider settings, and the
  // registry; only its skill list belongs to what is being detached.
  const keepPersonalConfig = ws.scope.kind === 'global' && (await personalConfigHasSettings(ws.scope.configPath));
  if (keepPersonalConfig) {
    await setConfigValue(ws.scope, ['globalSkills'], {});
  }
  for (const file of keepPersonalConfig ? [ws.scope.lockPath] : [ws.scope.configPath, ws.scope.lockPath]) {
    try {
      await fs.promises.unlink(file);
      report.removedFiles.push(file);
    } catch {
      // already absent
    }
  }
  await removePath(projectStateDir(services.ctx, ws.scope));
  return report;
}
