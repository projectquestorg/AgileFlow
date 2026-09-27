import path from 'node:path';
import { pathExists } from './fs';
import type { Context } from './context';
import { GLOBAL_CONFIG_FILE, GLOBAL_LOCK_FILE, LOCK_FILE, PROJECT_CONFIG_FILE } from './config';

export type ScopeKind = 'project' | 'global';

/** Where one set of skills lives and is recorded. */
export interface ScopeTarget {
  kind: ScopeKind;
  /** Project root, or the user's home directory for global scope. */
  root: string;
  /** Canonical skill directory: `<root>/.agents/skills`. */
  skillsDir: string;
  configPath: string;
  lockPath: string;
}

export const CANONICAL_SKILLS_REL = '.agents/skills';

export function projectScope(root: string): ScopeTarget {
  return {
    kind: 'project',
    root,
    skillsDir: path.join(root, '.agents', 'skills'),
    configPath: path.join(root, PROJECT_CONFIG_FILE),
    lockPath: path.join(root, LOCK_FILE),
  };
}

export function globalScope(ctx: Context): ScopeTarget {
  return {
    kind: 'global',
    root: ctx.homeDir,
    skillsDir: path.join(ctx.homeDir, '.agents', 'skills'),
    configPath: path.join(ctx.configDir, GLOBAL_CONFIG_FILE),
    lockPath: path.join(ctx.configDir, GLOBAL_LOCK_FILE),
  };
}

/**
 * Nearest ancestor of `start` containing `agileflow.yaml`, or null.
 *
 * The home directory is never a project: `~/.agents/skills` belongs to the
 * personal scope, and a project rooted at `~` would capture every repository
 * below it. The search stops before `homeDir`.
 */
export async function findProjectRoot(start: string, options: { homeDir?: string } = {}): Promise<string | null> {
  let dir = path.resolve(start);
  const home = options.homeDir ? path.resolve(options.homeDir) : null;
  for (;;) {
    if (home && isSameDir(dir, home)) return null;
    if (await pathExists(path.join(dir, PROJECT_CONFIG_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Path equality that follows the platform's case rules (Windows and macOS are case-insensitive). */
export function isSameDir(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return platform === 'win32' || platform === 'darwin' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** Nearest ancestor containing `.git`, or null. */
export async function findGitRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  for (;;) {
    if (await pathExists(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Relative install path recorded in the lockfile, e.g. `.agents/skills/filing-pr`. */
export function skillRelPath(id: string): string {
  return `${CANONICAL_SKILLS_REL}/${id}`;
}

export function skillDir(scope: ScopeTarget, id: string): string {
  return path.join(scope.skillsDir, id);
}
