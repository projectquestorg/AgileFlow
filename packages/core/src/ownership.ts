import fs from 'node:fs';
import path from 'node:path';
import type { LockEntry } from './config';
import { isNotFound, readTree, type TreeFile } from './fs';
import { hashTree } from './hash';
import type { ScopeTarget } from './scope';
import { skillDir } from './scope';
import { SKILL_FILE } from './skill';

export type SkillStatus =
  /** Managed content matches what AgileFlow installed. */
  | 'clean'
  /** Managed content differs from the installed base. */
  | 'modified'
  /** Recorded in the lockfile but absent on disk. */
  | 'missing'
  /** Locally owned (fork or local skill): AgileFlow never rewrites it. */
  | 'local'
  /** Disabled in agileflow.yaml. */
  | 'disabled';

export interface SkillState {
  status: SkillStatus;
  files: TreeFile[] | null;
  currentHash: string | null;
}

export async function readSkillTree(scope: ScopeTarget, id: string): Promise<TreeFile[] | null> {
  try {
    return await readTree(skillDir(scope, id));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Determine ownership state of a locked skill without modifying anything. */
export async function inspectSkill(scope: ScopeTarget, id: string, entry: LockEntry): Promise<SkillState> {
  const files = await readSkillTree(scope, id);
  const currentHash = files ? hashTree(files) : null;
  if (entry.enabled === false) return { status: 'disabled', files, currentHash };
  if (!files) return { status: 'missing', files, currentHash };
  if (entry.ownership === 'local') return { status: 'local', files, currentHash };
  return { status: currentHash === entry.baseHash ? 'clean' : 'modified', files, currentHash };
}

/** Directories in `.agents/skills` that look like skills (contain SKILL.md). */
export async function listSkillDirs(scope: ScopeTarget): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(scope.skillsDir, { withFileTypes: true });
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    try {
      await fs.promises.access(path.join(scope.skillsDir, entry.name, SKILL_FILE));
      out.push(entry.name);
    } catch {
      // not a skill directory
    }
  }
  return out.sort();
}

/**
 * Skill directories AgileFlow does not manage. Ownership comes only from
 * the lockfile; names are never used to infer it.
 */
export async function listUnmanagedSkills(scope: ScopeTarget, lockIds: Iterable<string>): Promise<string[]> {
  const managed = new Set(lockIds);
  return (await listSkillDirs(scope)).filter((name) => !managed.has(name));
}
