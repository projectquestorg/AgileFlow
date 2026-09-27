import { execFile } from 'node:child_process';
import { DIRS, README_FILE } from './constants';
import type { WorkPaths } from './types';

export interface IgnoredWorkPath {
  /** Probe path relative to the project root (POSIX). */
  path: string;
  /** Where the matching rule lives, e.g. `.gitignore:57`. */
  source: string;
  /** The matching pattern, e.g. `/docs/`. */
  pattern: string;
}

/**
 * Work files must be committed ("Git is part of the state"). Returns the
 * workspace paths Git would ignore, or null when the project is not a Git
 * work tree or `git` is not available. Never throws; purely informational.
 */
export async function findIgnoredWorkPaths(paths: WorkPaths): Promise<IgnoredWorkPath[] | null> {
  const probes = [
    README_FILE,
    `${DIRS.product}/product.md`,
    `${DIRS.roadmap}/roadmap.md`,
    `${DIRS.epic}/EPIC-00000000.md`,
    `${DIRS.story}/STORY-00000000.md`,
    `${DIRS.decision}/DEC-00000000.md`,
  ].map((p) => `${paths.root}/${p}`);
  // --no-index: also report rules that match files already tracked, since new
  // files next to them would be ignored. Exit 0 = some ignored, 1 = none, 128 = not a repository.
  const result = await new Promise<{ code: number; stdout: string } | null>((resolve) => {
    execFile(
      'git',
      ['check-ignore', '--no-index', '--verbose', '--', ...probes],
      { cwd: paths.projectRoot, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 10_000 },
      (err, stdout) => {
        if (!err) return resolve({ code: 0, stdout });
        const code = (err as { code?: unknown }).code;
        resolve(typeof code === 'number' ? { code, stdout } : null);
      },
    );
  });
  if (!result || (result.code !== 0 && result.code !== 1)) return null;
  const ignored: IgnoredWorkPath[] = [];
  for (const line of result.stdout.split('\n')) {
    // <source>:<line>:<pattern>\t<path>
    const m = /^(.*?):(\d+):(.*)\t(.*)$/.exec(line);
    if (!m) continue;
    const [, file, lineNo, pattern, probe] = m;
    // A negated match (`!pattern`) means the path is explicitly not ignored.
    if (pattern!.startsWith('!')) continue;
    ignored.push({ path: probe!, source: `${file}:${lineNo}`, pattern: pattern! });
  }
  return ignored;
}
