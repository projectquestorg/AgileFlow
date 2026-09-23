import type { Context } from './context';
import type { ScopeTarget } from './scope';
import type { Activation, LockEntry, ProviderSettings, SkillSpec } from './config';
import type { TreeFile } from './fs';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticLevel = 'ok' | 'info' | 'warn' | 'error';

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  /** Extra lines shown under the message. */
  detail?: string[];
  /** Only shown with `check --verbose`. */
  verboseOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

/** Skill content fetched from a registry, git repository, or local path. */
export interface FetchedPackage {
  /** Source string as recorded in config/lock. */
  source: string;
  version: string;
  /** Git commit or registry download URL. */
  resolved?: string;
  files: TreeFile[];
  /** hashTree(files). */
  integrity: string;
}

export interface PackDefinition {
  name: string;
  version: number | string;
  description?: string;
  /** Entries like `@agileflow/filing-pr@^1`. */
  skills: string[];
}

export interface DiscoveredSkill {
  /** Skill name from SKILL.md (or directory name). */
  id: string;
  /** Path inside the source, POSIX, '' for the root. */
  subpath: string;
}

/**
 * Resolves and downloads skill packages. Implemented by @agileflow/registry.
 * `root` is the scope root used to resolve relative path sources.
 */
export interface PackageFetcher {
  /** Newest version allowed by `spec` (network for registry/git sources). */
  resolve(id: string, spec: SkillSpec, root: string): Promise<FetchedPackage>;
  /** Exact content recorded in the lockfile (cache first; verifies integrity). */
  fetchLocked(id: string, entry: LockEntry, root: string): Promise<FetchedPackage>;
  /** Pack lookup; null when no such pack exists. */
  getPack(name: string): Promise<PackDefinition | null>;
  /** True when the registry knows a skill package with this name. */
  hasSkill(name: string): Promise<boolean>;
  /** Skills available at a git/path source (for multi-skill repositories). */
  discover(source: string, root: string): Promise<DiscoveredSkill[]>;
  /** Registry catalog for interactive pickers. */
  listSkills(): Promise<Array<{ name: string; description: string; latest: string }>>;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export type ProviderId = 'claude' | 'codex' | 'cursor' | 'opencode' | 'gemini';
export type SupportLevel = 'native' | 'adapted' | 'experimental' | 'unsupported';

export interface ProviderContext {
  ctx: Context;
  scope: ScopeTarget;
  settings: ProviderSettings | undefined;
  /** Allows slower probes (e.g. `--version`) for `check --verbose`. */
  verbose?: boolean;
}

export interface ProviderDetection {
  detected: boolean;
  /** Human-readable reasons, e.g. "`codex` on PATH", "~/.codex exists". */
  evidence: string[];
  executable?: string;
}

export interface ProviderCapabilities {
  /** Directories the provider reads skills from, relative to scope root. */
  skillLocations: string[];
  /** How the provider exposes the canonical `.agents/skills` directory. */
  exposure: 'native' | 'linked';
  /** `hard`: provider enforces manual-only; `semantic`: only the description does. */
  manualInvocation: 'hard' | 'semantic';
  version?: string;
  optionalFeatures?: Array<{ id: string; label: string; enabled: boolean | null }>;
}

/** A skill the adapter should make visible. */
export interface ResolvedSkill {
  id: string;
  /** Absolute canonical directory, `<scope>/.agents/skills/<id>`. */
  dir: string;
  activation: Activation;
}

export type PlannedChange =
  | { kind: 'link'; provider: ProviderId; skillId: string; path: string; target: string }
  | { kind: 'refresh-mirror'; provider: ProviderId; skillId: string; path: string; target: string }
  | { kind: 'remove'; provider: ProviderId; skillId: string; path: string; reason: string }
  | { kind: 'warn'; provider: ProviderId; skillId?: string; message: string };

export interface FeatureChange {
  file: string;
  setting: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  support: SupportLevel;
  detect(pctx: ProviderContext): Promise<ProviderDetection>;
  inspect(pctx: ProviderContext): Promise<ProviderCapabilities>;
  planProjectSkillExposure(pctx: ProviderContext, skills: ResolvedSkill[]): Promise<PlannedChange[]>;
  planUserSkillExposure(pctx: ProviderContext, skills: ResolvedSkill[]): Promise<PlannedChange[]>;
  validate(pctx: ProviderContext, skills: ResolvedSkill[]): Promise<Diagnostic[]>;
  /** Plan removal of this adapter's artifacts for the given skill ids (all known when omitted). */
  removeManagedArtifacts(pctx: ProviderContext, skillIds?: string[]): Promise<PlannedChange[]>;
  /**
   * Translate `activation: manual` into this provider's mechanism by
   * editing the canonical skill files (frontmatter flag, sidecar metadata).
   */
  applyManualActivation?(files: TreeFile[], skillId: string): TreeFile[];
  /** Explicit, user-selected provider features (e.g. Codex structured questions). */
  configureOptionalFeature?(
    pctx: ProviderContext,
    feature: string,
    enabled: boolean,
    options?: { dryRun?: boolean },
  ): Promise<FeatureChange>;
}
