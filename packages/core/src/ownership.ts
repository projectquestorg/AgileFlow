import fs from 'node:fs';
import path from 'node:path';
import type { LockEntry } from './config';
import { OperationError } from './errors';
import { isNotFound, listUnhashedEntries, readTree, toPosix, type TreeFile } from './fs';
import { hashTree, matchesRenderedHash, sha256Hex } from './hash';
import { tracksExecBits } from './platform';
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
  /** Entries hashing cannot see (symlinks, nested .git, empty dirs); they make a skill "modified". */
  unhashed?: string[];
  /** Exactly what is on disk, for the recheck before a write replaces it. */
  snapshot: SkillSnapshot;
  /**
   * Clean content whose executable bits differ from the lock (for example a
   * repository committed from Windows, where Git records every file as
   * non-executable). AgileFlow wrote that content, so this is drift `sync`
   * repairs, not a local modification.
   */
  modeDrift?: boolean;
}

/**
 * Exactly what is on disk at a skill path: absent, or a fingerprint of every
 * file (exact bytes and exec bits) plus the entries hashing cannot see.
 * Writes compare it immediately before replacing a skill, so an edit made
 * after AgileFlow planned the change (during a prompt or a download) is
 * never lost.
 */
export type SkillSnapshot = { exists: false } | { exists: true; hash: string; unhashed: string[] };

export function sameSnapshot(a: SkillSnapshot, b: SkillSnapshot): boolean {
  if (!a.exists || !b.exists) return a.exists === b.exists;
  return a.hash === b.hash && a.unhashed.join('\n') === b.unhashed.join('\n');
}

async function readSkillPath(scope: ScopeTarget, id: string): Promise<{ files: TreeFile[] | null; snapshot: SkillSnapshot }> {
  const dir = skillDir(scope, id);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(dir);
  } catch (err) {
    if (isNotFound(err)) return { files: null, snapshot: { exists: false } };
    throw err;
  }
  let files: TreeFile[] | null = null;
  try {
    files = await readTree(dir);
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!files) {
    // A file or dangling link where a skill directory belongs: present, never a skill.
    const what = stat.isSymbolicLink() ? `link:${await fs.promises.readlink(dir)}` : `entry:${stat.size}:${stat.mtimeMs}`;
    return { files: null, snapshot: { exists: true, hash: `sha256:${sha256Hex(what)}`, unhashed: ['.'] } };
  }
  const kind = stat.isSymbolicLink() ? `link:${await fs.promises.readlink(dir)}:` : '';
  return { files, snapshot: { exists: true, hash: kind + hashTree(files), unhashed: await listUnhashedEntries(dir) } };
}

/** What is on disk for a skill right now (see `SkillSnapshot`). */
export async function snapshotSkill(scope: ScopeTarget, id: string): Promise<SkillSnapshot> {
  return (await readSkillPath(scope, id)).snapshot;
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
  const { files, snapshot } = await readSkillPath(scope, id);
  const currentHash = files ? hashTree(files) : null;
  const base = { files, currentHash, snapshot };
  if (entry.enabled === false) return { status: 'disabled', ...base };
  // A file where the skill directory belongs is not the skill, but it is not AgileFlow's to replace either.
  if (!files) return { status: snapshot.exists ? 'modified' : 'missing', ...base };
  if (entry.ownership === 'local') return { status: 'local', ...base };
  if (!matchesRenderedHash(files, entry)) return { status: 'modified', ...base };
  const unhashed = snapshot.exists ? snapshot.unhashed : [];
  if (unhashed.length) return { status: 'modified', ...base, unhashed };
  // Executable bits count where the filesystem keeps them (not on Windows, not with core.fileMode=false).
  const modeDrift = (await tracksExecBits(scope.root)) && !matchesRenderedHash(files, entry, { execBits: true });
  return { status: 'clean', ...base, ...(modeDrift ? { modeDrift } : {}) };
}

/**
 * Who owns what is at a skill path, from the lockfile only:
 * - `absent`: nothing there;
 * - `clean`: managed by AgileFlow (lock) and exactly as rendered;
 * - `modified`: managed, but edited (or holding entries hashing cannot see);
 * - `local`: locally owned (fork or local skill);
 * - `unmanaged`: exists and the lock does not record it. A name in
 *   agileflow.yaml never makes a directory AgileFlow's.
 */
export type TargetOwnership = 'absent' | 'clean' | 'modified' | 'local' | 'unmanaged';

export interface ReplaceTarget {
  ownership: TargetOwnership;
  snapshot: SkillSnapshot;
  unhashed?: string[];
}

export async function classifyTarget(scope: ScopeTarget, id: string, entry: LockEntry | undefined): Promise<ReplaceTarget> {
  if (entry?.ownership === 'managed') {
    const state = await inspectSkill(scope, id, { ...entry, enabled: undefined });
    const ownership = state.status === 'missing' ? 'absent' : state.status === 'clean' ? 'clean' : 'modified';
    return { ownership, snapshot: state.snapshot, ...(state.unhashed?.length ? { unhashed: state.unhashed } : {}) };
  }
  const snapshot = await snapshotSkill(scope, id);
  if (!snapshot.exists) return { ownership: 'absent', snapshot };
  return { ownership: entry ? 'local' : 'unmanaged', snapshot };
}

/** True when AgileFlow may replace or delete the target without asking: nothing there, or its own clean copy. */
export function isReplaceable(target: ReplaceTarget): boolean {
  return target.ownership === 'absent' || target.ownership === 'clean';
}

/**
 * The one ownership check before AgileFlow writes a skill directory, used
 * when planning (`add`, `update`) and again when applying. Throws for
 * anything AgileFlow does not own: a hand-written directory, a locally owned
 * skill, or (unless `allowModified`, when the caller asks the user first) a
 * managed skill with local modifications.
 */
export async function assertReplaceable(
  scope: ScopeTarget,
  id: string,
  entry: LockEntry | undefined,
  options: { allowModified?: boolean } = {},
): Promise<ReplaceTarget> {
  const target = await classifyTarget(scope, id, entry);
  const rel = toPosix(path.relative(scope.root, skillDir(scope, id)));
  if (target.ownership === 'unmanaged') {
    throw new OperationError(`${rel} already exists and is not managed by AgileFlow`, [
      'AgileFlow never overwrites skills it does not own. Rename or move that directory first.',
    ]);
  }
  if (target.ownership === 'local') {
    throw new OperationError(`${id} is locally owned (${rel}); AgileFlow will not replace it`, [
      `Remove it from AgileFlow first: \`agileflow remove ${id}\` (your files are kept), then move them aside.`,
    ]);
  }
  if (target.ownership === 'modified' && !options.allowModified) {
    throw new OperationError(`${id} has local modifications`, [
      ...(target.unhashed?.length ? [`It contains files AgileFlow does not track: ${target.unhashed.join(', ')}`] : []),
      `Keep them: \`agileflow fork ${id}\``,
      `Discard them: \`agileflow remove ${id} --force\`, then add again`,
      `Inspect: \`agileflow diff ${id}\``,
    ]);
  }
  return target;
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
