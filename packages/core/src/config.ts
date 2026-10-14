import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import YAML from 'yaml';
import { z } from 'zod';
import { isNotFound, writeFileAtomic } from './fs';
import { HASH_VERSION } from './hash';
import { formatZodError, SKILL_NAME_RE } from './skill';

export const PROJECT_CONFIG_FILE = 'agileflow.yaml';
export const LOCK_FILE = 'agileflow.lock';
export const GLOBAL_CONFIG_FILE = 'config.yaml';
export const GLOBAL_LOCK_FILE = 'agileflow.lock';

const UPGRADE_HINT = 'Upgrade the CLI: npm install -g agileflow@latest';

export const ActivationSchema = z.enum(['auto', 'manual']);
export type Activation = z.infer<typeof ActivationSchema>;

export const InteractionPreferenceSchema = z.enum(['provider-default', 'prefer', 'minimize']);
export type InteractionPreference = z.infer<typeof InteractionPreferenceSchema>;

/**
 * Git branch, tag, or commit. Refs reach `git` as arguments, so anything that
 * could be read as an option (leading `-`), a revision expression, or a
 * control character is rejected (git check-ref-format rules, simplified).
 */
export const GIT_REF_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\.lock$)(?!.*\/$)(?!.*\.$)[A-Za-z0-9._/+-]{1,200}$/;
/** A full git commit id (SHA-1 or SHA-256). */
export const COMMIT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** A package hash as AgileFlow records it: `sha256-<base64>`. */
export const INTEGRITY_RE = /^sha256-[A-Za-z0-9+/]{43}=$/;

export function isSafeGitRef(ref: string): boolean {
  return GIT_REF_RE.test(ref);
}

const GitRefSchema = z.string().refine(isSafeGitRef, {
  message: 'must be a branch, tag, or commit (letters, digits, . _ / + -; not starting with -)',
});

const SkillIdSchema = z
  .string()
  .regex(SKILL_NAME_RE, 'skill ids must be lowercase letters, digits, and single hyphens');

export const SkillSpecSchema = z
  .object({
    source: z.string().min(1),
    /** Semver range for registry sources. */
    version: z
      .string()
      .min(1)
      .refine((v) => semver.validRange(v) !== null, { message: 'must be a semver version or range, e.g. ^1.2.0' })
      .optional(),
    /** Branch, tag, or commit for git sources. */
    ref: GitRefSchema.optional(),
    activation: ActivationSchema.optional(),
    enabled: z.boolean().optional(),
    provenance: z.object({ forkedFrom: z.string().min(1) }).strict().optional(),
  })
  .strict();
export type SkillSpec = z.infer<typeof SkillSpecSchema>;

export const ProviderSettingsSchema = z
  .object({
    enabled: z.union([z.literal('auto'), z.boolean()]).optional(),
    structuredQuestions: z.enum(['inherit', 'enabled', 'disabled']).optional(),
    /** Custom providers: project-relative directory the agent reads skills from. */
    skillsDir: z.string().min(1).optional(),
    /** Custom providers: home-relative directory for personal skills. */
    userSkillsDir: z.string().min(1).optional(),
    /** Custom providers: name shown in `list` and `check`. */
    displayName: z.string().min(1).optional(),
  })
  .strict();
export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

/**
 * AgileFlow Work (opt-in): where the Agile workspace lives. The folder layout
 * under `root` is fixed by the Work spec and is not configurable.
 */
export const WorkConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Workspace directory relative to the project root. */
    root: z.string().min(1).default('docs/agile'),
  })
  .strict();
export type WorkConfig = z.infer<typeof WorkConfigSchema>;

/** Semver range of AgileFlow CLI versions a project requires, e.g. `>=5.1.0`. */
const CliRangeSchema = z
  .string()
  .min(1)
  .refine((v) => semver.validRange(v) !== null, { message: 'must be a semver range, e.g. >=5.1.0' });

export const ProjectConfigSchema = z
  .object({
    version: z.literal(1),
    /** AgileFlow CLI versions this project needs; older CLIs refuse to change it. */
    agileflow: CliRangeSchema.optional(),
    registry: z.string().min(1).optional(),
    skills: z.record(SkillIdSchema, SkillSpecSchema).default({}),
    providers: z.record(z.string(), ProviderSettingsSchema).optional(),
    interaction: z
      .object({ questionPreference: InteractionPreferenceSchema.default('provider-default') })
      .strict()
      .optional(),
    work: WorkConfigSchema.optional(),
  })
  .strict();
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const GlobalConfigSchema = z
  .object({
    version: z.literal(1),
    registry: z.string().min(1).optional(),
    defaults: z
      .object({ questionPreference: InteractionPreferenceSchema.default('provider-default') })
      .strict()
      .optional(),
    providers: z.record(z.string(), ProviderSettingsSchema).optional(),
    globalSkills: z.record(SkillIdSchema, SkillSpecSchema).default({}),
  })
  .strict();
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const LockEntrySchema = z
  .object({
    source: z.string().min(1),
    version: z.string().min(1),
    /** Git sources: the commit the ref resolved to. */
    resolved: z.string().regex(COMMIT_RE, 'must be a full git commit id').optional(),
    /** Git sources: the ref from agileflow.yaml that `resolved` came from. */
    ref: GitRefSchema.optional(),
    /** Hash of the source package as published (absent for locally owned skills). */
    integrity: z.string().regex(INTEGRITY_RE, 'must be a sha256- package hash').optional(),
    /** Install location relative to the scope root (POSIX separators). */
    path: z.string().min(1),
    /**
     * Hash of the rendered skill directory as AgileFlow wrote it: source plus
     * render inputs (managed notice, interaction overlay, activation metadata),
     * compared under the rule `hashVersion` names (see `matchesRenderedHash`).
     */
    renderedHash: z.string().min(1).optional(),
    /**
     * Installed-file comparison rule of `renderedHash` (absent: legacy, exact or
     * line-ending/exec-bit insensitive). A rule newer than this CLI knows is
     * refused: this CLI could not tell a local edit from a clean copy.
     */
    hashVersion: z
      .number()
      .int()
      .min(2)
      .max(HASH_VERSION, { message: `uses a newer installed-file hash rule than this AgileFlow supports; ${UPGRADE_HINT}` })
      .optional(),
    /** Files written executable (hash version 2; absent means none). */
    executables: z.array(z.string().min(1)).optional(),
    /**
     * `RENDERER_REVISION` of the CLI that rendered this entry. Its presence
     * also means the render inputs below were recorded.
     */
    renderer: z.number().int().min(1).optional(),
    /** Render input: the question-preference overlay that was rendered (absent: none). */
    questionOverlay: z.enum(['prefer', 'minimize']).optional(),
    activation: ActivationSchema.default('auto'),
    /** `managed`: AgileFlow owns the content. `local`: the user owns it (forks, local skills). */
    ownership: z.enum(['managed', 'local']).default('managed'),
    enabled: z.literal(false).optional(),
  })
  // Unknown fields are informational and kept, not rejected, so teammates on
  // different CLI versions can share one lockfile. Anything that changes what
  // AgileFlow may do is gated instead: the lockfile `version` (older CLIs
  // refuse a newer format), `hashVersion` (refused above), and `renderer`
  // (a newer render is never rewritten by an older CLI).
  .loose()
  // A managed entry without its package hash would make AgileFlow trust
  // whatever the source serves next, so the lockfile is malformed instead.
  .refine((entry) => entry.ownership !== 'managed' || entry.integrity !== undefined, {
    message:
      'managed entries must record the package integrity; restore agileflow.lock from version control, or delete this entry from agileflow.lock and run `agileflow update <skill>` to resolve it again',
    path: ['integrity'],
  });
export type LockEntry = z.infer<typeof LockEntrySchema>;

/**
 * Lockfile format written by this CLI. Format 2 adds the installed-file hash
 * rule (`hashVersion`, `executables`) and the recorded render (`renderer`,
 * `questionOverlay`). It is written only when an entry uses them, so a
 * project whose lock has none stays readable by format-1 CLIs, and a CLI
 * that predates format 2 refuses to touch one that does (see
 * `assertSupportedVersion`) instead of ignoring fields it cannot honor.
 */
export const LOCK_FORMAT_VERSION = 2;

export const LockfileSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    resolved: z.record(SkillIdSchema, LockEntrySchema).default({}),
  })
  .loose();
export type Lockfile = z.infer<typeof LockfileSchema>;

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

async function readYamlFile(file: string): Promise<unknown | undefined> {
  let text: string;
  try {
    text = await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
  try {
    return YAML.parse(text) ?? {};
  } catch (err) {
    throw new ConfigError(`${path.basename(file)} is not valid YAML: ${(err as Error).message}`, file);
  }
}

/** Highest config file format version this CLI reads (agileflow.yaml, config.yaml). */
export const SUPPORTED_FORMAT_VERSION = 1;

function assertSupportedVersion(raw: unknown, file: string, supported: number): void {
  const version = (raw as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > supported) {
    throw new ConfigError(
      `${path.basename(file)} uses format version ${version}, written by a newer AgileFlow. ${UPGRADE_HINT}`,
      file,
    );
  }
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown, file: string, supported = SUPPORTED_FORMAT_VERSION): T {
  assertSupportedVersion(raw, file, supported);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`${path.basename(file)} is invalid: ${formatZodError(result.error)}`, file);
  }
  return result.data;
}

export async function readProjectConfig(file: string): Promise<ProjectConfig | null> {
  const raw = await readYamlFile(file);
  if (raw === undefined) return null;
  return parseWith(ProjectConfigSchema, raw, file);
}

export async function readGlobalConfig(file: string): Promise<GlobalConfig | null> {
  const raw = await readYamlFile(file);
  if (raw === undefined) return null;
  return parseWith(GlobalConfigSchema, raw, file);
}

export async function readLockfile(file: string): Promise<Lockfile | null> {
  const raw = await readYamlFile(file);
  if (raw === undefined) return null;
  return parseWith(LockfileSchema, raw, file, LOCK_FORMAT_VERSION);
}

const LOCK_HEADER =
  '# Generated by AgileFlow. Do not edit by hand.\n' +
  '# Records the exact skill versions `agileflow sync` reproduces.\n';

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const KNOWN_LOCK_KEYS = new Set([
  'source',
  'version',
  'resolved',
  'ref',
  'integrity',
  'path',
  'renderedHash',
  'hashVersion',
  'executables',
  'renderer',
  'questionOverlay',
  'activation',
  'ownership',
  'enabled',
]);

export function serializeLockfile(lock: Lockfile): string {
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(sortRecord(lock.resolved))) {
    // Stable key order keeps lockfile diffs readable.
    const ordered: Record<string, unknown> = {
      source: entry.source,
      version: entry.version,
    };
    if (entry.resolved) ordered.resolved = entry.resolved;
    if (entry.ref) ordered.ref = entry.ref;
    if (entry.integrity) ordered.integrity = entry.integrity;
    ordered.path = entry.path;
    if (entry.renderedHash) ordered.renderedHash = entry.renderedHash;
    if (entry.hashVersion !== undefined) ordered.hashVersion = entry.hashVersion;
    if (entry.executables?.length) ordered.executables = entry.executables;
    if (entry.renderer !== undefined) ordered.renderer = entry.renderer;
    if (entry.questionOverlay) ordered.questionOverlay = entry.questionOverlay;
    ordered.activation = entry.activation;
    ordered.ownership = entry.ownership;
    if (entry.enabled === false) ordered.enabled = false;
    // Unknown fields from a newer CLI survive a rewrite by this one.
    for (const [key, value] of Object.entries(entry)) {
      if (!(key in ordered) && value !== undefined && !KNOWN_LOCK_KEYS.has(key)) ordered[key] = value;
    }
    resolved[id] = ordered;
  }
  const extra = Object.fromEntries(Object.entries(lock).filter(([k]) => k !== 'version' && k !== 'resolved'));
  return LOCK_HEADER + YAML.stringify({ version: lockFormatFor(lock), ...extra, resolved }, { lineWidth: 0 });
}

/** The lowest lockfile format that can carry `lock`: 2 once any entry uses format-2 fields. */
export function lockFormatFor(lock: Lockfile): 1 | 2 {
  return Object.values(lock.resolved).some((e) => e.hashVersion !== undefined || e.renderer !== undefined) ? 2 : 1;
}

export async function writeLockfile(file: string, lock: Lockfile): Promise<void> {
  await writeFileAtomic(file, serializeLockfile(lock));
}

export function emptyLockfile(): Lockfile {
  return { version: 1, resolved: {} };
}

// ---------------------------------------------------------------------------
// Comment-preserving config edits
// ---------------------------------------------------------------------------

/**
 * Apply `mutate` to the YAML document at `file`, preserving comments and
 * formatting of untouched nodes. Creates the file from `initial` when absent.
 * The result is validated with `schema` before it is written.
 */
export async function editYamlConfig<T>(
  file: string,
  schema: z.ZodType<T>,
  initial: string,
  mutate: (doc: YAML.Document) => void,
): Promise<T> {
  let text: string;
  try {
    text = await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (!isNotFound(err)) throw err;
    text = initial;
  }
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) {
    throw new ConfigError(`${path.basename(file)} is not valid YAML: ${doc.errors[0]!.message}`, file);
  }
  if (!doc.contents || !YAML.isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  mutate(doc);
  const value = parseWith(schema, doc.toJS(), file);
  await writeFileAtomic(file, doc.toString({ lineWidth: 0 }));
  return value;
}

/** Remove an empty map at `keyPath` so edits don't leave `skills: {}` noise behind. */
export function deleteIfEmpty(doc: YAML.Document, keyPath: string[]): void {
  const node = doc.getIn(keyPath, true);
  if (YAML.isMap(node) && node.items.length === 0) doc.deleteIn(keyPath);
}

export function initialProjectConfig(questionPreference: InteractionPreference): string {
  return (
    '# AgileFlow project configuration: which skills this repository uses.\n' +
    '# Edit freely, then run `agileflow update` (new versions) or `agileflow sync`.\n' +
    'version: 1\n' +
    'skills: {}\n' +
    'providers:\n' +
    '  claude:\n' +
    '    enabled: auto\n' +
    '  codex:\n' +
    '    enabled: auto\n' +
    '    structuredQuestions: inherit\n' +
    'interaction:\n' +
    `  questionPreference: ${questionPreference}\n`
  );
}

export const INITIAL_GLOBAL_CONFIG =
  '# AgileFlow personal configuration.\n' +
  'version: 1\n' +
  'defaults:\n' +
  '  questionPreference: provider-default\n' +
  'globalSkills: {}\n';

/** Convert a spec to a plain object with stable key order for YAML output. */
export function specToYaml(spec: SkillSpec): Record<string, unknown> {
  const out: Record<string, unknown> = { source: spec.source };
  if (spec.version) out.version = spec.version;
  if (spec.ref) out.ref = spec.ref;
  if (spec.activation) out.activation = spec.activation;
  if (spec.enabled === false) out.enabled = false;
  if (spec.provenance) out.provenance = { forkedFrom: spec.provenance.forkedFrom };
  return out;
}
