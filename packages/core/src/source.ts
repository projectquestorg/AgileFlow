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
    // A leading dash would be parsed by git as an option.
    if (!url || url.startsWith('-')) throw new Error(`Invalid git source: ${source}`);
    return { kind: 'git', url, subpath };
  }
  if (isScopedName(trimmed)) return { kind: 'registry', name: trimmed };
  if (isPathSource(trimmed)) {
    return { kind: 'path', path: trimmed.startsWith('file:') ? trimmed.slice(5) : trimmed };
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    return { kind: 'registry', name: `${DEFAULT_SCOPE}/${trimmed}` };
  }
  throw new Error(
    `Unrecognized skill source "${source}". Use @scope/name, git+<url>[#path], or a ./relative path.`,
  );
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
}

/**
 * Parse an `agileflow add` argument:
 * `diagnosing-bugs`, `diagnosing-bugs@^1`, `@agileflow/github`,
 * `@agileflow/filing-pr@1.2.0`, `git+https://...`, `./skills/mine`.
 */
export function parseAddTarget(arg: string): AddTarget {
  const value = arg.trim();
  if (value.startsWith('git+') || isPathSource(value)) {
    return { source: value, range: null, ref: parseSource(value) };
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
