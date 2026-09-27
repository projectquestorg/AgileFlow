import path from 'node:path';
import semver from 'semver';

export const DEFAULT_SCOPE = '@agileflow';

export type SourceRef =
  | { kind: 'registry'; name: string }
  | { kind: 'git'; url: string; subpath: string | null }
  | { kind: 'path'; path: string };

/** True for `@scope/name` package names. */
export function isScopedName(value: string): boolean {
  return /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(value);
}

export function isPathSource(source: string): boolean {
  return (
    source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('.\\') ||
    source.startsWith('..\\') ||
    source === '.' ||
    source.startsWith('/') ||
    source.startsWith('~/') ||
    source.startsWith('.agents/') ||
    source.startsWith('file:') ||
    /^[a-zA-Z]:[\\/]/.test(source) ||
    (source.includes('/') && !source.startsWith('@') && !source.includes(':'))
  );
}

/**
 * Parse a `source` value from agileflow.yaml.
 *
 * - `@agileflow/diagnosing-bugs` -> registry
 * - `git+https://host/repo.git#skills/foo` -> git (fragment = path inside repo)
 * - `./skills/foo`, `.agents/skills/foo`, `/abs/path` -> path
 */
export function parseSource(source: string): SourceRef {
  const trimmed = source.trim();
  if (trimmed.startsWith('git+')) {
    const rest = trimmed.slice(4);
    const hash = rest.indexOf('#');
    const url = hash === -1 ? rest : rest.slice(0, hash);
    const subpath = hash === -1 ? null : rest.slice(hash + 1).replace(/^\/+|\/+$/g, '') || null;
    assertSafeGitUrl(url, source);
    if (subpath && (subpath.split('/').includes('..') || /[\u0000-\u001f\u007f\\:]/.test(subpath))) {
      throw new Error(`Invalid path inside git source: ${source}`);
    }
    return { kind: 'git', url, subpath };
  }
  if (isScopedName(trimmed)) return { kind: 'registry', name: trimmed };
  if (isPathSource(trimmed)) {
    const p = trimmed.startsWith('file:') ? trimmed.slice(5) : trimmed;
    // `.\skills\foo` from a Windows shell means the same as `./skills/foo`.
    return { kind: 'path', path: /^\.\.?\\/.test(p) ? p.replace(/\\/g, '/') : p };
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    return { kind: 'registry', name: `${DEFAULT_SCOPE}/${trimmed}` };
  }
  throw new Error(
    `Unrecognized skill source "${source}". Use @scope/name, git+<url>[#path], or a ./relative path.`,
  );
}

/**
 * Git URLs reach `git` as arguments: a leading dash would be read as an
 * option, and whitespace or control characters have no business in a URL.
 */
export function assertSafeGitUrl(url: string, source = url): void {
  if (!url || url.startsWith('-') || /[\s\u0000-\u001f\u007f]/.test(url)) {
    throw new Error(`Invalid git source: ${source}`);
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();
  const scpLike = !scheme && /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^/]/.test(url);
  if (!scpLike && !['https', 'http', 'ssh', 'git', 'file'].includes(scheme ?? '')) {
    throw new Error(`Unsupported git URL scheme in ${source}: use https://, ssh://, git@host:path, or file://`);
  }
}

/** A GitHub repository reference written as `owner/repo[/skill][@ref]` or `github:owner/repo`. */
export interface GitHubShorthand {
  owner: string;
  repo: string;
  /** Skill name inside the repository (skills.sh ids are `owner/repo/skill`). */
  skill: string | null;
  ref: string | null;
}

const GITHUB_SHORTHAND_RE =
  /^(?:github:)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?(?:@([A-Za-z0-9._/+-]+))?$/;
const GITHUB_URL_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+?)(?:\.git)?\/?(?:tree\/([A-Za-z0-9._+-]+)(?:\/(.+?))?)?\/?$/;

export function parseGitHubShorthand(value: string): GitHubShorthand | null {
  const m = GITHUB_SHORTHAND_RE.exec(value.trim());
  if (!m) return null;
  const [, owner, repo, skill, ref] = m;
  if (repo === '.' || repo === '..') return null;
  return { owner: owner!, repo: repo!, skill: skill ?? null, ref: ref ?? null };
}

/** `https://github.com/o/r`, `.../tree/<ref>/<path>` as a git source + ref. */
export function parseGitHubUrl(value: string): { source: string; ref: string | null } | null {
  const m = GITHUB_URL_RE.exec(value.trim());
  if (!m) return null;
  const [, owner, repo, ref, subpath] = m;
  const clean = subpath?.replace(/^\/+|\/+$/g, '');
  return {
    source: `git+https://github.com/${owner}/${repo}.git${clean ? `#${clean}` : ''}`,
    ref: ref ?? null,
  };
}

export function gitHubSource(owner: string, repo: string): string {
  return `git+https://github.com/${owner}/${repo}.git`;
}

/** Expand `~` and resolve a path source against the scope root. */
export function resolvePathSource(p: string, root: string, homeDir: string): string {
  if (p === '~' || p.startsWith('~/')) return path.join(homeDir, p.slice(1));
  return path.resolve(root, p);
}

/** Skill id for a registry package name: `@agileflow/filing-pr` -> `filing-pr`. */
export function skillIdFromPackageName(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}

export interface AddTarget {
  /** Source string to write into agileflow.yaml. */
  source: string;
  /** Semver range when the argument pinned one (`name@^1`). */
  range: string | null;
  ref: SourceRef;
  /** Git branch, tag, or commit when the argument named one (`owner/repo@v1`). */
  gitRef?: string | null;
  /** Only this skill from a multi-skill source (`owner/repo/skill`). */
  skill?: string | null;
}

/**
 * Parse an `agileflow add` argument:
 * `diagnosing-bugs`, `diagnosing-bugs@^1`, `@agileflow/github`,
 * `@agileflow/filing-pr@1.2.0`, `git+https://...`, `./skills/mine`,
 * `owner/repo`, `owner/repo/skill`, `owner/repo@ref`, `github:owner/repo`,
 * `https://github.com/owner/repo[/tree/<ref>/<path>]`.
 *
 * `a/b` is ambiguous between a relative path and a GitHub repository; pass
 * `localPathExists` (does `./a/b` exist?) so an existing directory wins.
 */
export function parseAddTarget(arg: string, options: { localPathExists?: boolean } = {}): AddTarget {
  const value = arg.trim();
  const url = parseGitHubUrl(value);
  if (url) return { source: url.source, range: null, ref: parseSource(url.source), gitRef: url.ref };
  if (!options.localPathExists && !value.startsWith('.') && !value.startsWith('/')) {
    const gh = parseGitHubShorthand(value);
    if (gh) {
      const source = gitHubSource(gh.owner, gh.repo);
      return { source, range: null, ref: parseSource(source), gitRef: gh.ref, skill: gh.skill };
    }
  }
  if (value.startsWith('git+') || isPathSource(value)) {
    const ref = parseSource(value);
    return { source: ref.kind === 'path' ? ref.path : value, range: null, ref };
  }
  let name = value;
  let range: string | null = null;
  const at = value.indexOf('@', value.startsWith('@') ? 1 : 0);
  if (at !== -1) {
    name = value.slice(0, at);
    range = value.slice(at + 1) || null;
    if (range && !semver.validRange(range)) {
      throw new Error(`Invalid version range "${range}" in ${arg}`);
    }
  }
  const ref = parseSource(name);
  if (ref.kind !== 'registry') throw new Error(`Unrecognized skill: ${arg}`);
  return { source: ref.name, range, ref };
}

/**
 * Highest version satisfying `range`. Prereleases are only considered when
 * the range itself names one, matching npm semantics.
 */
export function pickVersion(versions: string[], range: string | undefined | null): string | null {
  const valid = versions.filter((v) => semver.valid(v));
  return semver.maxSatisfying(valid, range && range.trim() ? range : '*') ?? null;
}

/** Default constraint written for a newly added registry skill (`^<major>` style). */
export function defaultRange(version: string): string {
  const parsed = semver.parse(version);
  if (!parsed) return version;
  if (parsed.prerelease.length) return version;
  return parsed.major > 0 ? `^${parsed.major}.${parsed.minor}.${parsed.patch}` : `~${version}`;
}

export function describeSource(source: string): 'official' | 'registry' | 'git' | 'local' {
  const ref = parseSource(source);
  if (ref.kind === 'registry') return ref.name.startsWith(`${DEFAULT_SCOPE}/`) ? 'official' : 'registry';
  if (ref.kind === 'git') return 'git';
  return 'local';
}
