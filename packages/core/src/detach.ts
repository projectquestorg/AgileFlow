import fs from 'node:fs';
import path from 'node:path';
import { removePath, writeFileAtomic } from './fs';
import { exposeProviders } from './installer';
import { MIRROR_MARKER, classifyEntry } from './links';
import { inspectSkill } from './ownership';
import { stripManagedNotice } from './render';
import { skillDir } from './scope';
import { SKILL_FILE } from './skill';
import { projectStateDir } from './state';
import type { Services, Workspace } from './workspace';

export interface DetachReport {
  keptSkills: string[];
  removedSkills: string[];
  keptModified: string[];
  removedFiles: string[];
  providerArtifacts: number;
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

  for (const file of [ws.scope.configPath, ws.scope.lockPath]) {
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
