import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import YAML from 'yaml';
import { z } from 'zod';
import { isNotFound, writeFileAtomic } from './fs';
import { formatZodError, SKILL_NAME_RE } from './skill';

export const PROJECT_CONFIG_FILE = 'agileflow.yaml';
export const LOCK_FILE = 'agileflow.lock';
export const GLOBAL_CONFIG_FILE = 'config.yaml';
export const GLOBAL_LOCK_FILE = 'agileflow.lock';

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
    integrity: z.string().min(1).optional(),
    /** Install location relative to the scope root (POSIX separators). */
    path: z.string().min(1),
    /**
     * Hash of the rendered skill directory as AgileFlow wrote it: source plus
     * render inputs (managed notice, interaction overlay, activation metadata).
     * Same `integrity` with a different `renderedHash` means only the render
     * inputs changed, and `sync` re-renders clean skills.
     */
    renderedHash: z.string().min(1).optional(),
    activation: ActivationSchema.default('auto'),
    /** `managed`: AgileFlow owns the content. `local`: the user owns it (forks, local skills). */
    ownership: z.enum(['managed', 'local']).default('managed'),
    enabled: z.literal(false).optional(),
  })
  // Fields written by a newer AgileFlow are kept, not rejected, so teammates
  // on different CLI versions can share one lockfile.
  .loose();
export type LockEntry = z.infer<typeof LockEntrySchema>;

export const LockfileSchema = z
  .object({
    version: z.literal(1),
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

/** Highest file format version this CLI reads. */
export const SUPPORTED_FORMAT_VERSION = 1;

function assertSupportedVersion(raw: unknown, file: string): void {
  const version = (raw as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > SUPPORTED_FORMAT_VERSION) {
    throw new ConfigError(
      `${path.basename(file)} uses format version ${version}, written by a newer AgileFlow. Upgrade the CLI: npm install -g agileflow@latest`,
      file,
    );
  }
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  assertSupportedVersion(raw, file);
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
  return parseWith(LockfileSchema, raw, file);
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
  return LOCK_HEADER + YAML.stringify({ version: 1, ...extra, resolved }, { lineWidth: 0 });
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
