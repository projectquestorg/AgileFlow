import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isNotFound, writeFileAtomic, type Context, type PackDefinition } from '@agileflow/core';
import { decodeBundle, IntegrityError, verifyIntegrity } from './integrity';

/** Official static registry, served from the AgileFlow repository. */
export const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/projectquestorg/AgileFlow/main/registry';

export interface RegistryVersion {
  name: string;
  version: string;
  integrity: string;
  /** Bundle location, relative to the registry root or absolute. */
  url: string;
  metadata: {
    description: string;
    activation: 'auto' | 'manual';
    files: number;
    references: string[];
    scripts: string[];
    requirements: { commands: string[]; network: 'none' | 'optional' | 'required' };
  };
  compatibility: { agentSkills: boolean; bundleFormat: number };
}

export interface RegistrySkill {
  schema: 1;
  name: string;
  description: string;
  latest: string;
  versions: Record<string, RegistryVersion>;
}

export interface RegistrySkillIndex {
  schema: 1;
  skills: Array<{ name: string; description: string; latest: string; versions: string[] }>;
}

export interface RegistryPackIndex {
  schema: 1;
  packs: Array<{ name: string; description?: string; version: number | string }>;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

/**
 * Client for a static registry laid out as:
 *   v1/skills/index.json                  GET /v1/skills
 *   v1/skills/<name>/index.json           GET /v1/skills/{name}
 *   v1/skills/<name>/<version>.json       GET /v1/skills/{name}/{version}
 *   v1/packs/<name>.json                  GET /v1/packs/{name}
 *   packages/<name>/<version>.json        skill bundles
 *
 * `location` may be an https URL, a file:// URL, or a local directory.
 */
export class RegistryClient {
  readonly base: string;
  private readonly memo = new Map<string, Promise<unknown>>();

  constructor(
    location: string,
    private readonly ctx: Context,
    private readonly options: { timeoutMs?: number } = {},
  ) {
    this.base = normalizeLocation(location, ctx.cwd);
  }

  get isRemote(): boolean {
    return /^https?:\/\//.test(this.base);
  }

  private resolveUrl(rel: string): string {
    if (/^(https?|file):\/\//.test(rel)) return rel;
    return new URL(rel.replace(/^\/+/, ''), this.base.endsWith('/') ? this.base : `${this.base}/`).toString();
  }

  private async fetchBytes(rel: string): Promise<Buffer | null> {
    const url = this.resolveUrl(rel);
    if (url.startsWith('file://')) {
      try {
        return await fs.promises.readFile(fileURLToPath(url));
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    }
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 20000) });
    } catch (err) {
      throw new RegistryError(`Could not reach the skill registry (${url}): ${(err as Error).message}`);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new RegistryError(`Registry request failed (${res.status}) for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private fetchJson<T>(rel: string): Promise<T | null> {
    const cached = this.memo.get(rel);
    if (cached) return cached as Promise<T | null>;
    const promise = this.fetchBytes(rel).then((buf) => {
      if (!buf) return null;
      try {
        return JSON.parse(buf.toString('utf8')) as T;
      } catch {
        throw new RegistryError(`Registry returned invalid JSON for ${rel}`);
      }
    });
    this.memo.set(rel, promise);
    return promise;
  }

  listSkills(): Promise<RegistrySkillIndex | null> {
    return this.fetchJson<RegistrySkillIndex>('v1/skills/index.json');
  }

  getSkill(name: string): Promise<RegistrySkill | null> {
    return this.fetchJson<RegistrySkill>(`v1/skills/${name}/index.json`);
  }

  getVersion(name: string, version: string): Promise<RegistryVersion | null> {
    return this.fetchJson<RegistryVersion>(`v1/skills/${name}/${version}.json`);
  }

  getPack(name: string): Promise<PackDefinition | null> {
    return this.fetchJson<PackDefinition>(`v1/packs/${name}.json`);
  }

  listPacks(): Promise<RegistryPackIndex | null> {
    return this.fetchJson<RegistryPackIndex>('v1/packs/index.json');
  }

  /**
   * Download a skill version, verifying integrity. Uses and fills the
   * package cache (`<cacheDir>/packages/<name>/<version>/bundle.json`), so
   * locked versions install offline once cached.
   */
  async download(meta: RegistryVersion, expectedIntegrity?: string) {
    const cached = await readCachedBundle(this.ctx, meta.name, meta.version);
    if (cached) {
      try {
        verifyIntegrity(`${meta.name}@${meta.version} (cache)`, cached, expectedIntegrity ?? meta.integrity);
        return cached;
      } catch {
        // Corrupt or stale cache entry; fall through to a fresh download.
      }
    }
    const bytes = await this.fetchBytes(meta.url);
    if (!bytes) throw new RegistryError(`Package ${meta.name}@${meta.version} not found at ${this.resolveUrl(meta.url)}`);
    const bundle = decodeBundle(bytes);
    verifyIntegrity(`${meta.name}@${meta.version}`, bundle.tree, meta.integrity);
    if (expectedIntegrity && expectedIntegrity !== meta.integrity) {
      throw new IntegrityError(`${meta.name}@${meta.version} (registry vs lockfile)`, expectedIntegrity, meta.integrity);
    }
    await writeFileAtomic(cachedBundlePath(this.ctx, meta.name, meta.version), bytes);
    return bundle.tree;
  }
}

export function cachedBundlePath(ctx: Context, name: string, version: string): string {
  return path.join(ctx.cacheDir, 'packages', ...name.split('/'), version, 'bundle.json');
}

export async function readCachedBundle(ctx: Context, name: string, version: string) {
  try {
    return decodeBundle(await fs.promises.readFile(cachedBundlePath(ctx, name, version))).tree;
  } catch (err) {
    if (isNotFound(err)) return null;
    return null;
  }
}

function normalizeLocation(location: string, cwd: string): string {
  if (/^(https?|file):\/\//.test(location)) return location.replace(/\/+$/, '');
  return pathToFileURL(path.resolve(cwd, location)).toString();
}
