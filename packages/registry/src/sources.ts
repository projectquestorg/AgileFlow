import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DEFAULT_SCOPE,
  hashTree,
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

async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      // Only standard transports: never `ext::` (arbitrary command execution).
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https:http:ssh:git:file' },
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string; code?: string };
    if (e.code === 'ENOENT') throw new Error('git is required for git+ skill sources but was not found on PATH');
    throw new Error(`git ${args[0]} failed: ${(e.stderr || e.message).trim().split('\n').slice(-2).join(' ')}`);
  }
}

const SHA_RE = /^[0-9a-f]{40}$/;

/** Check out `ref` (branch, tag, or commit; default branch when omitted) into a temp dir. */
async function checkoutGit(url: string, ref: string | undefined): Promise<{ dir: string; commit: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-git-'));
  try {
    await git(['init', '--quiet'], dir);
    await git(['remote', 'add', 'origin', url], dir);
    const target = ref ?? 'HEAD';
    try {
      await git(['fetch', '--quiet', '--depth', '1', 'origin', target], dir);
    } catch (err) {
      if (!ref || !SHA_RE.test(ref)) throw err;
      // Some servers refuse fetching an unadvertised commit; fall back to full history.
      await git(['fetch', '--quiet', 'origin'], dir);
    }
    await git(['checkout', '--quiet', ref && SHA_RE.test(ref) ? ref : 'FETCH_HEAD'], dir);
    const commit = await git(['rev-parse', 'HEAD'], dir);
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

/** Build the PackageFetcher used by all commands. */
export function createFetcher(options: FetcherOptions): PackageFetcher & { registry: RegistryClient } {
  const { ctx } = options;
  const registry = new RegistryClient(resolveRegistryLocation(options), ctx);

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
    const { dir, commit } = await checkoutGit(url, ref);
    try {
      const skillRoot = subpath ? path.join(dir, ...subpath.split('/')) : dir;
      const files = await readSkillAt(skillRoot, `${url}${subpath ? `#${subpath}` : ''}`);
      const integrity = verifyIntegrity(`${url}@${commit}`, files, lockedIntegrity);
      const version = versionFromSidecar(files) ?? `0.0.0-git.${commit.slice(0, 7)}`;
      await writeFileAtomic(gitCachePath(ctx, url, commit, subpath), encodeBundle(url, version, files));
      return { source, version, resolved: commit, files, integrity } satisfies FetchedPackage;
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
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
    const integrity = hashTree(files);
    if (lockedIntegrity && integrity !== lockedIntegrity) {
      throw new IntegrityError(
        `${p} (local source changed since it was locked; run \`agileflow update\` to pick up the changes)`,
        lockedIntegrity,
        integrity,
      );
    }
    return { source, version: versionFromSidecar(files) ?? 'local', files, integrity };
  }

  const fetcher: PackageFetcher & { registry: RegistryClient } = {
    registry,

    async resolve(_id: string, spec: SkillSpec, root: string): Promise<FetchedPackage> {
      const ref = parseSource(spec.source);
      if (ref.kind === 'registry') return fromRegistry(ref.name, spec.version, spec.source);
      if (ref.kind === 'git') return fromGit(ref.url, ref.subpath, spec.ref, spec.source);
      return fromPath(ref.path, root, spec.source);
    },

    async fetchLocked(id: string, entry: LockEntry, root: string): Promise<FetchedPackage> {
      if (entry.ownership === 'local') throw new Error(`${id} is locally owned; there is no package to fetch`);
      const ref = parseSource(entry.source);
      if (ref.kind === 'registry') {
        const cached = await readCachedBundle(ctx, ref.name, entry.version);
        if (cached) {
          const actual = hashTree(cached);
          if (actual === entry.integrity) {
            return { source: entry.source, version: entry.version, files: cached, integrity: actual };
          }
        }
        const meta = await registry.getVersion(ref.name, entry.version);
        if (!meta) throw new RegistryError(`${ref.name}@${entry.version} is no longer available from the registry`);
        const files = await registry.download(meta, entry.integrity);
        return { source: entry.source, version: entry.version, files, integrity: meta.integrity };
      }
      if (ref.kind === 'git') {
        if (!entry.resolved) throw new Error(`${id}: lockfile entry has no resolved commit`);
        return fromGit(ref.url, ref.subpath, entry.resolved, entry.source, entry.integrity);
      }
      return fromPath(ref.path, root, entry.source, entry.integrity);
    },

    async getPack(name: string): Promise<PackDefinition | null> {
      const full = name.startsWith('@') ? name : `${DEFAULT_SCOPE}/${name}`;
      return registry.getPack(full);
    },

    async hasSkill(name: string): Promise<boolean> {
      return (await registry.getSkill(name)) !== null;
    },

    async discover(source: string, root: string): Promise<DiscoveredSkill[]> {
      const ref = parseSource(source);
      if (ref.kind === 'path') return findSkills(resolvePathSource(ref.path, root, ctx.homeDir));
      if (ref.kind === 'git') {
        const { dir } = await checkoutGit(ref.url, undefined);
        try {
          return await findSkills(ref.subpath ? path.join(dir, ...ref.subpath.split('/')) : dir);
        } finally {
          await fs.promises.rm(dir, { recursive: true, force: true });
        }
      }
      return [];
    },

    async listSkills() {
      const index = await registry.listSkills();
      if (!index) throw registryUnavailable(registry.base);
      return (index?.skills ?? []).map((s) => ({ name: s.name, description: s.description, latest: s.latest }));
    },
  };
  return fetcher;
}
