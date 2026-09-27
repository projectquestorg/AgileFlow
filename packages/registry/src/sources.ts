import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import semver from 'semver';
import {
  assertSafeGitUrl,
  COMMIT_RE,
  DEFAULT_SCOPE,
  hashTree,
  isSafeGitRef,
  normalizeTree,
  isNotFound,
  parseSidecar,
  parseSkillMarkdown,
  parseSource,
  pickVersion,
  readTree,
  resolvePathSource,
  sha256Hex,
  SIDECAR_FILE,
  SKILL_FILE,
  writeFileAtomic,
  type Context,
  type DiscoveredSkill,
  type FetchedPackage,
  type LockEntry,
  type PackageFetcher,
  type PackDefinition,
  type SkillSpec,
  type TreeFile,
} from '@agileflow/core';
import { DEFAULT_REGISTRY, RegistryClient, RegistryError, readCachedBundle } from './client';
import { decodeBundle, encodeBundle, IntegrityError, verifyIntegrity } from './integrity';

const execFileAsync = promisify(execFile);

export interface FetcherOptions {
  ctx: Context;
  /** Registry location from config; AGILEFLOW_REGISTRY overrides it. */
  registry?: string;
  /** Directory relative registry paths in config resolve against. */
  registryBase?: string;
}

/** Registry location precedence: env > config > official default. */
export function resolveRegistryLocation(options: FetcherOptions): string {
  const fromEnv = options.ctx.env.AGILEFLOW_REGISTRY;
  if (fromEnv) return /^(https?|file):\/\//.test(fromEnv) ? fromEnv : path.resolve(options.ctx.cwd, fromEnv);
  if (options.registry) {
    return /^(https?|file):\/\//.test(options.registry)
      ? options.registry
      : path.resolve(options.registryBase ?? options.ctx.cwd, options.registry);
  }
  return DEFAULT_REGISTRY;
}

function versionFromSidecar(files: TreeFile[]): string | null {
  const sidecar = files.find((f) => f.path === SIDECAR_FILE);
  if (!sidecar) return null;
  try {
    return parseSidecar(sidecar.content.toString('utf8')).package.version;
  } catch {
    return null;
  }
}

/** Transports AgileFlow lets git use. `ext::` is never allowed (arbitrary command execution). */
export function allowedGitProtocols(env: Record<string, string | undefined>): string {
  return insecureAllowed(env) ? 'https:ssh:file:http:git' : 'https:ssh:file';
}

/** `AGILEFLOW_ALLOW_INSECURE=1` permits plain http:// registries and http/git:// git remotes. */
export function insecureAllowed(env: Record<string, string | undefined>): boolean {
  return env.AGILEFLOW_ALLOW_INSECURE === '1' || env.AGILEFLOW_ALLOW_INSECURE === 'true';
}

export function isOffline(env: Record<string, string | undefined>): boolean {
  return env.AGILEFLOW_OFFLINE === '1' || env.AGILEFLOW_OFFLINE === 'true';
}

function gitTimeoutMs(env: Record<string, string | undefined>): number {
  const seconds = Number(env.AGILEFLOW_GIT_TIMEOUT);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 120_000;
}

function gitEnv(ctx: Context): NodeJS.ProcessEnv {
  // PATH and credentials come from the real environment; tests and callers
  // may pass a Context env that only overrides AgileFlow settings.
  const base = process.env;
  return {
    ...base,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: allowedGitProtocols(ctx.env),
    // Never block on an ssh host-key or passphrase prompt.
    GIT_SSH_COMMAND: base.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
    // Abort a stalled transfer instead of hanging forever.
    GIT_HTTP_LOW_SPEED_LIMIT: base.GIT_HTTP_LOW_SPEED_LIMIT ?? '1000',
    GIT_HTTP_LOW_SPEED_TIME: base.GIT_HTTP_LOW_SPEED_TIME ?? '30',
  };
}

/**
 * Config that makes checkouts byte-identical on every machine (no line-ending
 * conversion, no symlinks, no hooks), whatever the user's global git config.
 */
const GIT_CONFIG = [
  '-c', 'core.autocrlf=false',
  '-c', 'core.eol=lf',
  '-c', 'core.symlinks=false',
  '-c', 'protocol.ext.allow=never',
  '-c', 'advice.detachedHead=false',
];

async function git(ctx: Context, args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...GIT_CONFIG, ...args], {
      cwd,
      env: gitEnv(ctx),
      timeout: gitTimeoutMs(ctx.env),
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string; code?: string; killed?: boolean; signal?: string };
    if (e.code === 'ENOENT') throw new Error('git is required for git+ skill sources but was not found on PATH');
    if (e.killed || e.signal === 'SIGTERM') {
      throw new Error(`git ${args[0]} timed out after ${gitTimeoutMs(ctx.env) / 1000}s (set AGILEFLOW_GIT_TIMEOUT to raise it)`);
    }
    throw new Error(`git ${args[0]} failed: ${(e.stderr || e.message).trim().split('\n').slice(-2).join(' ')}`);
  }
}

const SHA_RE = COMMIT_RE;

function assertGitTransport(ctx: Context, url: string): void {
  if (!insecureAllowed(ctx.env) && /^(http|git):\/\//i.test(url)) {
    throw new Error(
      `Refusing unencrypted git URL ${url}. Use https:// or ssh://, or set AGILEFLOW_ALLOW_INSECURE=1 to allow it.`,
    );
  }
}

/**
 * Check out `ref` (branch, tag, or commit; default branch when omitted) into
 * a temp dir. With `subpath`, only that directory is fetched (partial clone +
 * sparse checkout) so large multi-skill repositories stay cheap.
 */
async function checkoutGit(
  ctx: Context,
  url: string,
  ref: string | undefined,
  subpath: string | null,
): Promise<{ dir: string; commit: string }> {
  if (isOffline(ctx.env)) throw new RegistryError(`Offline (AGILEFLOW_OFFLINE): cannot fetch ${url}`);
  assertSafeGitUrl(url);
  assertGitTransport(ctx, url);
  if (ref !== undefined && !isSafeGitRef(ref)) throw new Error(`Invalid git ref "${ref}" for ${url}`);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-git-'));
  try {
    await git(ctx, ['init', '--quiet'], dir);
    await git(ctx, ['remote', 'add', 'origin', url], dir);
    if (subpath) {
      await git(ctx, ['sparse-checkout', 'set', '--no-cone', `/${subpath}/`], dir);
    }
    const target = ref ?? 'HEAD';
    const fetch = (extra: string[]) =>
      git(ctx, ['fetch', '--quiet', '--no-tags', ...extra, '--end-of-options', 'origin', target], dir);
    try {
      await fetch(['--depth', '1', '--filter=blob:none']);
    } catch (err) {
      if (!ref || !SHA_RE.test(ref)) throw err;
      // Some servers refuse fetching an unadvertised commit shallowly.
      await git(ctx, ['fetch', '--quiet', '--no-tags', '--filter=blob:none', '--end-of-options', 'origin'], dir);
    }
    await git(ctx, ['checkout', '--quiet', ref && SHA_RE.test(ref) ? ref : 'FETCH_HEAD', '--'], dir);
    const commit = await git(ctx, ['rev-parse', '--verify', 'HEAD^{commit}'], dir);
    if (!SHA_RE.test(commit)) throw new Error(`git returned an unexpected commit id for ${url}`);
    return { dir, commit };
  } catch (err) {
    await fs.promises.rm(dir, { recursive: true, force: true });
    throw err;
  }
}

async function findSkills(root: string, maxDepth = 4): Promise<DiscoveredSkill[]> {
  const out: DiscoveredSkill[] = [];
  async function walk(abs: string, rel: string, depth: number): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === SKILL_FILE)) {
      let id = path.basename(abs);
      try {
        id = parseSkillMarkdown(await fs.promises.readFile(path.join(abs, SKILL_FILE), 'utf8')).name ?? id;
      } catch {
        // keep directory name
      }
      out.push({ id, subpath: rel });
      return;
    }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
      await walk(path.join(abs, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1);
    }
  }
  await walk(root, '', 0);
  return out.sort((a, b) => (a.subpath < b.subpath ? -1 : 1));
}

async function readSkillAt(dir: string, what: string): Promise<TreeFile[]> {
  let files: TreeFile[];
  try {
    files = await readTree(dir);
  } catch (err) {
    if (isNotFound(err)) throw new Error(`${what} not found`);
    throw err;
  }
  if (!files.some((f) => f.path === SKILL_FILE)) {
    throw new Error(`${what} has no ${SKILL_FILE}`);
  }
  return files;
}

function gitCachePath(ctx: Context, url: string, commit: string, subpath: string | null): string {
  return path.join(
    ctx.cacheDir,
    'git',
    sha256Hex(url).slice(0, 16),
    commit,
    `${sha256Hex(subpath ?? '').slice(0, 16)}.json`,
  );
}

function registryUnavailable(base: string): RegistryError {
  return new RegistryError(
    `No AgileFlow skill registry found at ${base} (v1/skills/index.json is missing). ` +
      'Point AgileFlow at a registry with AGILEFLOW_REGISTRY or `registry:` in agileflow.yaml.',
  );
}

// Temporary checkouts are removed when the process exits.
const liveCheckouts = new Set<string>();
let exitHook = false;
function trackCheckout(dir: string): void {
  liveCheckouts.add(dir);
  if (exitHook) return;
  exitHook = true;
  process.once('exit', () => {
    for (const d of liveCheckouts) fs.rmSync(d, { recursive: true, force: true });
  });
}

/** Build the PackageFetcher used by all commands. */
export function createFetcher(options: FetcherOptions): PackageFetcher & { registry: RegistryClient } {
  const { ctx } = options;
  const registry = new RegistryClient(resolveRegistryLocation(options), ctx, {
    timeoutMs: registryTimeoutMs(ctx.env),
  });

  // One checkout per (url, ref) per fetcher: `add owner/repo` discovers and
  // then resolves from the same clone instead of cloning twice.
  const checkouts = new Map<string, Promise<{ dir: string; commit: string }>>();
  function checkout(url: string, ref: string | undefined, subpath: string | null) {
    const full = checkouts.get(`${url}\0${ref ?? ''}\0`);
    if (full) return full;
    const key = `${url}\0${ref ?? ''}\0${subpath ?? ''}`;
    let pending = checkouts.get(key);
    if (!pending) {
      pending = checkoutGit(ctx, url, ref, subpath).then((result) => {
        trackCheckout(result.dir);
        return result;
      });
      pending.catch(() => checkouts.delete(key));
      checkouts.set(key, pending);
    }
    return pending;
  }

  async function fromRegistry(name: string, range: string | undefined, source: string): Promise<FetchedPackage> {
    const skill = await registry.getSkill(name);
    if (!skill) {
      if (!(await registry.listSkills())) throw registryUnavailable(registry.base);
      throw new RegistryError(`Skill ${name} was not found in the registry (${registry.base})`);
    }
    const version = pickVersion(Object.keys(skill.versions), range);
    if (!version) {
      throw new RegistryError(
        `No version of ${name} matches "${range}" (available: ${Object.keys(skill.versions).join(', ')})`,
      );
    }
    const meta = skill.versions[version]!;
    const files = await registry.download(meta);
    return { source, version, files, integrity: meta.integrity };
  }

  async function fromGit(url: string, subpath: string | null, ref: string | undefined, source: string, lockedIntegrity?: string) {
    if (ref && SHA_RE.test(ref)) {
      const cached = await readCachedGit(url, ref, subpath, lockedIntegrity);
      if (cached) return cached(source);
    }
    const { dir, commit } = await checkout(url, ref, subpath);
    const skillRoot = subpath ? path.join(dir, ...subpath.split('/')) : dir;
    const files = await readSkillAt(skillRoot, `${url}${subpath ? `#${subpath}` : ''}`);
    const integrity = verifyIntegrity(`${url}@${commit}`, files, lockedIntegrity);
    const version = versionFromSidecar(files) ?? `0.0.0-git.${commit.slice(0, 7)}`;
    await writeFileAtomic(gitCachePath(ctx, url, commit, subpath), encodeBundle(url, version, files));
    return { source, version, resolved: commit, files, integrity } satisfies FetchedPackage;
  }

  async function readCachedGit(url: string, commit: string, subpath: string | null, integrity?: string) {
    try {
      const bundle = decodeBundle(await fs.promises.readFile(gitCachePath(ctx, url, commit, subpath)));
      const actual = verifyIntegrity(`${url}@${commit} (cache)`, bundle.tree, integrity);
      return (source: string): FetchedPackage => ({
        source,
        version: bundle.version,
        resolved: commit,
        files: bundle.tree,
        integrity: actual,
      });
    } catch {
      return null;
    }
  }

  async function fromPath(p: string, root: string, source: string, lockedIntegrity?: string): Promise<FetchedPackage> {
    const abs = resolvePathSource(p, root, ctx.homeDir);
    const files = await readSkillAt(abs, `Local skill source ${p}`);
    // Local sources are checked out by git on each machine, so their
    // integrity is line-ending and exec-bit insensitive (older locks recorded
    // the exact hash; both are accepted).
    const exact = hashTree(files);
    const integrity = hashTree(normalizeTree(files));
    if (lockedIntegrity && lockedIntegrity !== integrity && lockedIntegrity !== exact) {
      throw new SourceChangedError(p, lockedIntegrity, integrity);
    }
    return {
      source,
      version: versionFromSidecar(files) ?? 'local',
      files,
      integrity: lockedIntegrity === exact ? exact : integrity,
    };
  }

  const fetcher: PackageFetcher & { registry: RegistryClient } = {
    registry,

    async resolve(_id: string, spec: SkillSpec, root: string): Promise<FetchedPackage> {
      const ref = parseSource(spec.source);
      if (ref.kind === 'registry') return fromRegistry(ref.name, spec.version, spec.source);
      if (ref.kind === 'git') return fromGit(ref.url, ref.subpath, spec.ref, spec.source);
      return fromPath(ref.path, root, spec.source);
    },

    async fetchLocked(id: string, entry: LockEntry, root: string, opts: { cacheOnly?: boolean } = {}): Promise<FetchedPackage> {
      if (entry.ownership === 'local') throw new Error(`${id} is locally owned; there is no package to fetch`);
      const ref = parseSource(entry.source);
      if (ref.kind === 'registry') {
        if (!isValidVersion(entry.version)) {
          throw new RegistryError(`${id}: locked version "${entry.version}" is not a valid semver version`);
        }
        if (!entry.integrity) {
          throw new IntegrityError(`${id} (the lockfile entry has no integrity; run \`agileflow update ${id}\`)`, '(recorded hash)', '(none)');
        }
        const cached = await readCachedBundle(ctx, ref.name, entry.version);
        if (cached) {
          const actual = hashTree(cached);
          if (actual === entry.integrity) {
            registry.checkPin(ref.name, entry.version, actual);
            return { source: entry.source, version: entry.version, files: cached, integrity: actual };
          }
        }
        if (opts.cacheOnly) throw new NotCachedError(`${ref.name}@${entry.version} is not in the package cache`);
        const meta = await registry.getVersion(ref.name, entry.version);
        if (!meta) throw new RegistryError(`${ref.name}@${entry.version} is no longer available from the registry`);
        const files = await registry.download(meta, entry.integrity);
        return { source: entry.source, version: entry.version, files, integrity: meta.integrity };
      }
      if (ref.kind === 'git') {
        if (!entry.resolved || !SHA_RE.test(entry.resolved)) {
          throw new Error(`${id}: lockfile entry has no valid resolved commit`);
        }
        if (opts.cacheOnly) {
          const cached = await readCachedGit(ref.url, entry.resolved, ref.subpath, entry.integrity);
          if (cached) return cached(entry.source);
          throw new NotCachedError(`${ref.url}@${entry.resolved.slice(0, 12)} is not in the package cache`);
        }
        return fromGit(ref.url, ref.subpath, entry.resolved, entry.source, entry.integrity);
      }
      return fromPath(ref.path, root, entry.source, entry.integrity);
    },

    async getPack(name: string): Promise<PackDefinition | null> {
      const full = name.startsWith('@') ? name : `${DEFAULT_SCOPE}/${name}`;
      const pack = await registry.getPack(full);
      if (!pack && !(await registry.listSkills())) throw registryUnavailable(registry.base);
      return pack;
    },

    async hasSkill(name: string): Promise<boolean> {
      if ((await registry.getSkill(name)) !== null) return true;
      if (!(await registry.listSkills())) throw registryUnavailable(registry.base);
      return false;
    },

    async discover(source: string, root: string, ref?: string): Promise<DiscoveredSkill[]> {
      const parsed = parseSource(source);
      if (parsed.kind === 'path') return findSkills(resolvePathSource(parsed.path, root, ctx.homeDir));
      if (parsed.kind === 'git') {
        const { dir } = await checkout(parsed.url, ref, null);
        return findSkills(parsed.subpath ? path.join(dir, ...parsed.subpath.split('/')) : dir);
      }
      return [];
    },

    async listSkills() {
      const index = await registry.listSkills();
      if (!index) throw registryUnavailable(registry.base);
      return index.skills.map((s) => ({ name: s.name, description: s.description, latest: s.latest }));
    },
  };
  return fetcher;
}

/** A path source whose files changed after they were locked (a normal edit, not tampering). */
export class SourceChangedError extends Error {
  constructor(p: string, expected: string, actual: string) {
    super(`${p} changed since it was locked (locked ${expected}, now ${actual}); run \`agileflow update\` to pick up the changes`);
    this.name = 'SourceChangedError';
  }
}

/** `fetchLocked(..., { cacheOnly: true })` found nothing in the cache. */
export class NotCachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotCachedError';
  }
}

function isValidVersion(version: string): boolean {
  return semver.valid(version) === version;
}

function registryTimeoutMs(env: Record<string, string | undefined>): number | undefined {
  const seconds = Number(env.AGILEFLOW_REGISTRY_TIMEOUT);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
