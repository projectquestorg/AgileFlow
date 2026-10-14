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
  return findIgnoredPaths(paths.projectRoot, probes);
}

/**
 * Which of these project-relative paths Git would ignore. Null when the
 * project is not a Git work tree or `git` is not available. Never throws.
 */
export async function findIgnoredPaths(projectRoot: string, probes: string[]): Promise<IgnoredWorkPath[] | null> {
  // --no-index: also report rules that match files already tracked, since new
  // files next to them would be ignored. Exit 0 = some ignored, 1 = none, 128 = not a repository.
  const result = await git(projectRoot, ['check-ignore', '--no-index', '--verbose', '--', ...probes]);
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

function git(cwd: string, args: string[]): Promise<{ code: number; stdout: string } | null> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 10_000 }, (err, stdout) => {
      if (!err) return resolve({ code: 0, stdout });
      const code = (err as { code?: unknown }).code;
      resolve(typeof code === 'number' ? { code, stdout } : null);
    });
  });
}

/** The commit checked out in the project (full SHA), or null outside Git or before the first commit. */
export async function gitHead(projectRoot: string): Promise<string | null> {
  const result = await git(projectRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const sha = result?.code === 0 ? result.stdout.trim() : '';
  return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

/**
 * One warning per ignored location, naming exactly what is ignored: the whole
 * workspace when every probe is ignored, otherwise the ignored folder or file
 * (e.g. `docs/agile/03-stories/`). Empty when nothing is ignored.
 */
export function describeIgnoredWorkPaths(paths: WorkPaths, ignored: IgnoredWorkPath[]): string[] {
  if (!ignored.length) return [];
  const where = (probe: string) => {
    const rel = probe.slice(paths.root.length + 1);
    return rel.includes('/') ? `${paths.root}/${rel.slice(0, rel.indexOf('/'))}/` : probe;
  };
  const rules = [...new Set(ignored.map((i) => `${i.source}: ${i.pattern}`))];
  if (ignored.length >= 6 && rules.length === 1) {
    const rule = ignored[0]!;
    const top = paths.root.split('/')[0]!;
    const dirRule = top !== paths.root && rule.pattern.replace(/^\//, '').replace(/\/$/, '') === top;
    return [
      `${paths.root}/ is ignored by Git (${rules[0]}), so epics and stories would not be committed or shared. ` +
        `Pick another --root, or change ${rule.source.replace(/:\d+$/, '')} so it no longer matches` +
        (dirRule ? ` (a directory rule like \`${rule.pattern}\` cannot be re-included; use \`/${top}/*\` plus \`!/${paths.root}/\`).` : '.'),
    ];
  }
  const byPlace = new Map<string, IgnoredWorkPath>();
  for (const i of ignored) if (!byPlace.has(where(i.path))) byPlace.set(where(i.path), i);
  return [...byPlace].map(
    ([place, i]) =>
      `${place} is ignored by Git (${i.source}: ${i.pattern}), so files there would not be committed or shared. ` +
      `Change ${i.source.replace(/:\d+$/, '')} so it no longer matches.`,
  );
}
