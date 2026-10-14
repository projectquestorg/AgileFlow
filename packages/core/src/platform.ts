import fs from 'node:fs';
import path from 'node:path';

/**
 * Whether executable bits in `root` mean anything, so installed skills can
 * compare them (`matchesRenderedHash` `execBits`).
 *
 * - Windows has no executable bit: never.
 * - A Git repository with `core.fileMode=false` (Git sets it when the
 *   filesystem cannot keep modes, e.g. a Windows drive mounted in WSL, some
 *   network shares) makes every checkout's bits arbitrary: never.
 * - Otherwise (POSIX, no repository or `core.fileMode` true): always, so a
 *   script that lost or gained `+x` is reported as modified.
 *
 * Reads only the repository's own `config` (the setting Git itself writes on
 * `init`/`clone`); results are cached per root for the process.
 */
export async function tracksExecBits(root: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform === 'win32') return false;
  const key = path.resolve(root);
  let cached = cache.get(key);
  if (!cached) {
    cached = readFileMode(key).then((mode) => mode !== false);
    cache.set(key, cached);
  }
  return cached;
}

const cache = new Map<string, Promise<boolean>>();

/** Forget cached results (tests change `.git/config` between calls). */
export function clearPlatformCache(): void {
  cache.clear();
}

/** `core.fileMode` of the repository containing `start`: true/false, or null when unset or not a repository. */
export async function readFileMode(start: string): Promise<boolean | null> {
  const gitDir = await findGitDir(start);
  if (!gitDir) return null;
  // Linked worktrees keep the shared config in the common directory.
  const common = await readText(path.join(gitDir, 'commondir'));
  const configDir = common ? path.resolve(gitDir, common.trim()) : gitDir;
  const config = await readText(path.join(configDir, 'config'));
  return config === null ? null : parseCoreFileMode(config);
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function findGitDir(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  for (;;) {
    const dotGit = path.join(dir, '.git');
    try {
      const stat = await fs.promises.stat(dotGit);
      if (stat.isDirectory()) return dotGit;
      // Worktrees and submodules: a `.git` file with `gitdir: <path>`.
      const m = /^gitdir:\s*(.+?)\s*$/m.exec((await readText(dotGit)) ?? '');
      return m ? path.resolve(dir, m[1]!) : null;
    } catch {
      // not here; keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The last `filemode` value in `[core]` (Git config: sections and keys are case-insensitive). */
export function parseCoreFileMode(config: string): boolean | null {
  let inCore = false;
  let value: boolean | null = null;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)[#;].*$/, '').trim();
    if (!line) continue;
    const section = /^\[\s*([^\s\]"]+)\s*("[^"]*")?\s*\]\s*(.*)$/.exec(line);
    if (section) {
      inCore = section[1]!.toLowerCase() === 'core' && !section[2];
      if (!section[3]) continue;
    }
    if (!inCore) continue;
    const kv = /^filemode\s*(?:=\s*(.*))?$/i.exec(section ? section[3]! : line);
    if (!kv) continue;
    // A bare key is true; an empty value is false (Git's boolean rules).
    const v = kv[1] === undefined ? 'true' : kv[1].trim().replace(/^"(.*)"$/, '$1').toLowerCase();
    if (['false', 'no', 'off', '0', ''].includes(v)) value = false;
    else if (['true', 'yes', 'on', '1'].includes(v)) value = true;
  }
  return value;
}
