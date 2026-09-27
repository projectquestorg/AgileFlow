import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';
import { z } from 'zod';
import {
  formatZodError,
  isNotFound,
  isScopedName,
  PackSchema,
  sha256Hex,
  writeFileAtomic,
  type Context,
  type PackDefinition,
  type TreeFile,
} from '@agileflow/core';
import { decodeBundle, IntegrityError, verifyIntegrity } from './integrity';
import { OFFICIAL_PINS } from './official-pins';

/** Official static registry, served from the AgileFlow repository. */
export const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/projectquestorg/AgileFlow/main/registry';

// ---------------------------------------------------------------------------
// Documents (validated on every read; generated JSON Schemas live in schemas/registry)
// ---------------------------------------------------------------------------

const Integrity = z.string().regex(/^sha256-[A-Za-z0-9+/]+=*$/, 'must be a sha256- integrity');
const Version = z.string().refine((v) => semver.valid(v) === v, { message: 'must be a canonical semver version' });
const PackageName = z.string().refine(isScopedName, { message: 'must be @scope/name' });

export const RegistryVersionSchema = z.object({
  name: PackageName,
  version: Version,
  integrity: Integrity,
  /** Bundle location relative to the registry root. */
  url: z.string().min(1),
  metadata: z.object({
    description: z.string(),
    activation: z.enum(['auto', 'manual']),
    files: z.number().int().nonnegative(),
    references: z.array(z.string()),
    scripts: z.array(z.string()),
    requirements: z.object({
      commands: z.array(z.string()),
      network: z.enum(['none', 'optional', 'required']),
    }),
    /** SPDX license from SKILL.md frontmatter, when declared. */
    license: z.string().optional(),
    /** Agent Skills `compatibility` note from SKILL.md frontmatter, when declared. */
    compatibility: z.string().optional(),
  }),
  compatibility: z.object({ agentSkills: z.boolean(), bundleFormat: z.number().int().positive() }),
});
export type RegistryVersion = z.infer<typeof RegistryVersionSchema>;

export const RegistrySkillSchema = z.object({
  schema: z.literal(1),
  name: PackageName,
  description: z.string(),
  latest: Version,
  versions: z.record(z.string(), RegistryVersionSchema),
});
export type RegistrySkill = z.infer<typeof RegistrySkillSchema>;

export const RegistrySkillIndexSchema = z.object({
  schema: z.literal(1),
  skills: z.array(
    z.object({ name: PackageName, description: z.string(), latest: Version, versions: z.array(Version) }),
  ),
});
export type RegistrySkillIndex = z.infer<typeof RegistrySkillIndexSchema>;

export const RegistryPackIndexSchema = z.object({
  schema: z.literal(1),
  packs: z.array(
    z.object({ name: z.string(), description: z.string().optional(), version: z.union([z.number(), z.string()]) }),
  ),
});
export type RegistryPackIndex = z.infer<typeof RegistryPackIndexSchema>;

/** Every published version and its integrity; the registry's append-only record. */
export const RegistryManifestSchema = z.object({
  schema: z.literal(1),
  packages: z.record(z.string(), z.record(z.string(), Integrity)),
});
export type RegistryManifest = z.infer<typeof RegistryManifestSchema>;

/** Newest registry document and bundle format this client understands. */
export const SUPPORTED_BUNDLE_FORMAT = 1;

export class RegistryError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

const UPGRADE_HINT = 'This registry was written by a newer AgileFlow. Upgrade the CLI: npm install -g agileflow@latest';

export interface RegistryClientOptions {
  timeoutMs?: number;
  /** Known-good integrities (defaults to the pins shipped with this CLI). */
  pins?: Record<string, Record<string, string>>;
}

/**
 * Client for a static registry laid out as:
 *   v1/skills/index.json                  GET /v1/skills
 *   v1/skills/<name>/index.json           GET /v1/skills/{name}
 *   v1/skills/<name>/<version>.json       GET /v1/skills/{name}/{version}
 *   v1/packs/index.json, v1/packs/<name>.json
 *   v1/manifest.json                      every published name@version -> integrity
 *   packages/<name>/<version>.json        skill bundles
 *
 * `location` may be an https URL, a file:// URL, or a local directory.
 * Plain http is refused except for loopback hosts or with
 * AGILEFLOW_ALLOW_INSECURE=1. Every JSON document is schema-checked, and
 * official packages are verified against integrities pinned into this CLI.
 */
export class RegistryClient {
  readonly base: string;
  private readonly memo = new Map<string, Promise<unknown>>();
  private readonly pins: Record<string, Record<string, string>>;

  constructor(
    location: string,
    private readonly ctx: Context,
    private readonly options: RegistryClientOptions = {},
  ) {
    this.base = normalizeLocation(location, ctx.cwd);
    this.pins = options.pins ?? OFFICIAL_PINS;
    if (/^http:\/\//i.test(this.base) && !isLoopback(this.base) && !insecure(ctx.env)) {
      throw new RegistryError(`Refusing plain-http registry ${this.base}`, [
        'Use an https:// URL or a local directory.',
        'To allow it anyway (not recommended), set AGILEFLOW_ALLOW_INSECURE=1.',
      ]);
    }
  }

  get isRemote(): boolean {
    return /^https?:\/\//.test(this.base);
  }

  get offline(): boolean {
    return this.ctx.env.AGILEFLOW_OFFLINE === '1' || this.ctx.env.AGILEFLOW_OFFLINE === 'true';
  }

  private resolveUrl(rel: string): string {
    return new URL(rel.replace(/^\/+/, ''), this.base.endsWith('/') ? this.base : `${this.base}/`).toString();
  }

  /**
   * Bundle URLs come from registry documents. They must stay inside this
   * registry: a remote registry may not point the client at local files or
   * another host.
   */
  private bundleUrl(rel: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith('//')) {
      throw new RegistryError(`Registry bundle URL must be relative to the registry: ${rel}`);
    }
    const url = this.resolveUrl(rel);
    const base = this.base.endsWith('/') ? this.base : `${this.base}/`;
    if (!url.startsWith(base)) throw new RegistryError(`Registry bundle URL escapes the registry: ${rel}`);
    return url;
  }

  private indexCachePath(rel: string): string {
    return path.join(this.ctx.cacheDir, 'registry', sha256Hex(this.base).slice(0, 16), ...rel.split('/'));
  }

  private async fetchBytes(url: string): Promise<Buffer | null> {
    if (url.startsWith('file://')) {
      try {
        return await fs.promises.readFile(fileURLToPath(url));
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    }
    if (this.offline) throw new RegistryError(`Offline (AGILEFLOW_OFFLINE): cannot fetch ${url}`);
    let lastError: RegistryError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 20000), redirect: 'follow' });
      } catch (err) {
        lastError = new RegistryError(`Could not reach the skill registry (${url}): ${(err as Error).message}`, [
          'Check your network, or set AGILEFLOW_OFFLINE=1 to work from the package cache.',
        ]);
        continue;
      }
      // A redirect may never downgrade to plain http.
      if (res.url && /^http:\/\//i.test(res.url) && !isLoopback(res.url) && !insecure(this.ctx.env)) {
        throw new RegistryError(`Registry redirected ${url} to insecure ${res.url}`);
      }
      if (res.status === 404) return null;
      if (res.status === 403 || res.status === 429) {
        throw new RegistryError(`Registry request was rate limited or refused (${res.status}) for ${url}`, [
          'Wait a few minutes and retry, or point AGILEFLOW_REGISTRY at a mirror.',
        ]);
      }
      if (res.status >= 500) {
        lastError = new RegistryError(`Registry request failed (${res.status}) for ${url}`);
        continue;
      }
      if (!res.ok) throw new RegistryError(`Registry request failed (${res.status}) for ${url}`);
      try {
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        lastError = new RegistryError(`Download of ${url} was interrupted: ${(err as Error).message}`);
      }
    }
    throw lastError!;
  }

  private fetchJson<T>(rel: string, schema: z.ZodType<T>, options: { cacheForOffline?: boolean } = {}): Promise<T | null> {
    const cached = this.memo.get(rel);
    if (cached) return cached as Promise<T | null>;
    const url = this.resolveUrl(rel);
    const load = async (): Promise<T | null> => {
      let buf: Buffer | null;
      try {
        buf = await this.fetchBytes(url);
      } catch (err) {
        // Catalog documents are cached so `search` and pickers work offline.
        if (options.cacheForOffline && this.isRemote) {
          const fallback = await fs.promises.readFile(this.indexCachePath(rel)).catch(() => null);
          if (fallback) buf = fallback;
          else throw err;
        } else {
          throw err;
        }
      }
      if (!buf) return null;
      let raw: unknown;
      try {
        raw = JSON.parse(buf.toString('utf8'));
      } catch {
        throw new RegistryError(`Registry returned invalid JSON for ${url}`);
      }
      const schemaVersion = (raw as { schema?: unknown } | null)?.schema;
      if (typeof schemaVersion === 'number' && schemaVersion > 1) throw new RegistryError(`Unsupported registry document ${url}`, [UPGRADE_HINT]);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new RegistryError(`Registry returned a malformed document ${url}: ${formatZodError(parsed.error)}`);
      }
      if (options.cacheForOffline && this.isRemote) {
        await writeFileAtomic(this.indexCachePath(rel), buf).catch(() => undefined);
      }
      return parsed.data;
    };
    const promise = load();
    // A transient failure must not poison later calls in a long-running process.
    promise.catch(() => this.memo.delete(rel));
    this.memo.set(rel, promise);
    return promise;
  }

  listSkills(): Promise<RegistrySkillIndex | null> {
    return this.fetchJson('v1/skills/index.json', RegistrySkillIndexSchema, { cacheForOffline: true });
  }

  async getSkill(name: string): Promise<RegistrySkill | null> {
    assertPackageName(name);
    const doc = await this.fetchJson(`v1/skills/${name}/index.json`, RegistrySkillSchema, { cacheForOffline: true });
    if (!doc) return null;
    if (doc.name !== name) throw new RegistryError(`Registry index for ${name} describes ${doc.name}`);
    for (const [key, meta] of Object.entries(doc.versions)) {
      if (meta.name !== name || meta.version !== key) {
        throw new RegistryError(`Registry index for ${name} lists ${meta.name}@${meta.version} under version ${key}`);
      }
      checkFormat(meta);
    }
    return doc;
  }

  async getVersion(name: string, version: string): Promise<RegistryVersion | null> {
    assertPackageName(name);
    if (semver.valid(version) !== version) throw new RegistryError(`Invalid version "${version}" for ${name}`);
    const meta = await this.fetchJson(`v1/skills/${name}/${version}.json`, RegistryVersionSchema);
    if (!meta) return null;
    if (meta.name !== name || meta.version !== version) {
      throw new RegistryError(`Registry document for ${name}@${version} describes ${meta.name}@${meta.version}`);
    }
    checkFormat(meta);
    return meta;
  }

  getPack(name: string): Promise<PackDefinition | null> {
    return this.fetchJson(`v1/packs/${name}.json`, PackSchema as z.ZodType<PackDefinition>, { cacheForOffline: true });
  }

  listPacks(): Promise<RegistryPackIndex | null> {
    return this.fetchJson('v1/packs/index.json', RegistryPackIndexSchema, { cacheForOffline: true });
  }

  getManifest(): Promise<RegistryManifest | null> {
    return this.fetchJson('v1/manifest.json', RegistryManifestSchema);
  }

  /**
   * Official packages published before this CLI was built have their
   * integrity pinned in the CLI itself (which npm ships with Sigstore
   * provenance). A registry or mirror serving different bytes for a pinned
   * version is refused even if its own metadata agrees with the bytes.
   */
  checkPin(name: string, version: string, integrity: string): void {
    const pinned = this.pins[name]?.[version];
    if (pinned && pinned !== integrity) {
      throw new IntegrityError(`${name}@${version} (does not match the integrity pinned in this AgileFlow release)`, pinned, integrity);
    }
  }

  /** True when this CLI release pins `name@version`. */
  isPinned(name: string, version: string): boolean {
    return !!this.pins[name]?.[version];
  }

  /**
   * Download a skill version, verifying integrity. Uses and fills the
   * package cache (`<cacheDir>/packages/<name>/<version>/bundle.json`), so
   * locked versions install offline once cached.
   */
  async download(meta: RegistryVersion, expectedIntegrity?: string): Promise<TreeFile[]> {
    assertPackageName(meta.name);
    if (semver.valid(meta.version) !== meta.version) throw new RegistryError(`Invalid version "${meta.version}" for ${meta.name}`);
    checkFormat(meta);
    this.checkPin(meta.name, meta.version, meta.integrity);
    if (expectedIntegrity && expectedIntegrity !== meta.integrity) {
      throw new IntegrityError(`${meta.name}@${meta.version} (registry vs lockfile)`, expectedIntegrity, meta.integrity);
    }
    const cached = await readCachedBundle(this.ctx, meta.name, meta.version);
    if (cached) {
      try {
        verifyIntegrity(`${meta.name}@${meta.version} (cache)`, cached, meta.integrity);
        return cached;
      } catch {
        // Corrupt or stale cache entry; fall through to a fresh download.
      }
    }
    const url = this.bundleUrl(meta.url);
    let bytes = await this.fetchBytes(url);
    if (!bytes) {
      // Right after a publish a CDN can briefly serve the index before the bundle.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      bytes = await this.fetchBytes(url);
    }
    if (!bytes) throw new RegistryError(`Package ${meta.name}@${meta.version} not found at ${url}`);
    let bundle: ReturnType<typeof decodeBundle>;
    try {
      bundle = decodeBundle(bytes);
    } catch (err) {
      throw new RegistryError(`Package ${meta.name}@${meta.version} from ${url} is unreadable: ${(err as Error).message}`);
    }
    if (bundle.name !== meta.name || bundle.version !== meta.version) {
      throw new RegistryError(`Bundle at ${url} contains ${bundle.name}@${bundle.version}, expected ${meta.name}@${meta.version}`);
    }
    verifyIntegrity(`${meta.name}@${meta.version}`, bundle.tree, meta.integrity);
    await writeFileAtomic(cachedBundlePath(this.ctx, meta.name, meta.version), bytes);
    return bundle.tree;
  }
}

function assertPackageName(name: string): void {
  if (!isScopedName(name)) throw new RegistryError(`Invalid package name "${name}"`);
}

function checkFormat(meta: RegistryVersion): void {
  if (meta.compatibility.bundleFormat > SUPPORTED_BUNDLE_FORMAT) {
    throw new RegistryError(`${meta.name}@${meta.version} uses bundle format ${meta.compatibility.bundleFormat}`, [UPGRADE_HINT]);
  }
}

function insecure(env: Record<string, string | undefined>): boolean {
  return env.AGILEFLOW_ALLOW_INSECURE === '1' || env.AGILEFLOW_ALLOW_INSECURE === 'true';
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

export function cachedBundlePath(ctx: Context, name: string, version: string): string {
  if (!isScopedName(name) || semver.valid(version) !== version) {
    throw new RegistryError(`Invalid package ${name}@${version}`);
  }
  return path.join(ctx.cacheDir, 'packages', ...name.split('/'), version, 'bundle.json');
}

export async function readCachedBundle(ctx: Context, name: string, version: string): Promise<TreeFile[] | null> {
  try {
    const bundle = decodeBundle(await fs.promises.readFile(cachedBundlePath(ctx, name, version)));
    if (bundle.name !== name || bundle.version !== version) return null;
    return bundle.tree;
  } catch {
    return null;
  }
}

function normalizeLocation(location: string, cwd: string): string {
  if (/^(https?|file):\/\//.test(location)) return location.replace(/\/+$/, '');
  return pathToFileURL(path.resolve(cwd, location)).toString();
}
