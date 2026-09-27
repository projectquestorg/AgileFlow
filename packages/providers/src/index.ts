import {
  readGlobalConfig,
  readProjectConfig,
  globalScope,
  type Context,
  type ProviderAdapter,
  type ProviderSettings,
  type ScopeTarget,
} from '@agileflow/core';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { cursorAdapter } from './cursor';
import { builtinSettingsProblems, createCustomAdapter, isBuiltinProvider, withConfigProblems } from './custom';
import { geminiAdapter } from './gemini';
import { opencodeAdapter } from './opencode';

export * from './types';
export * from './util';
export * from './toml-patch';
export * from './standard-agent-skills';
export { createLinkAdapter, type LinkAdapterDefinition } from './link-adapter';
export { builtinSettingsProblems, createCustomAdapter, skillsDirProblem } from './custom';
export { versionDiagnostics, type MinimumVersion } from './versions';
export { claudeAdapter, claudeConfigDir } from './claude';
export {
  codexAdapter,
  codexConfigPath,
  codexHome,
  configureStructuredQuestions,
  readStructuredQuestions,
  CODEX_OPENAI_YAML,
  STRUCTURED_QUESTIONS_FEATURE,
} from './codex';
export { cursorAdapter } from './cursor';
export { opencodeAdapter } from './opencode';
export { geminiAdapter, geminiFolderTrust, geminiTrustHint } from './gemini';

/**
 * Every provider adapter. Order is the display order in `list`/`check`:
 * built-ins first, then custom link providers declared in `settings`
 * (`providers.<id>.skillsDir` / `userSkillsDir`), sorted by id.
 * Without settings, only the built-ins.
 */
export function allAdapters(settings: Record<string, ProviderSettings> = {}): ProviderAdapter[] {
  const builtins = [codexAdapter, claudeAdapter, cursorAdapter, opencodeAdapter, geminiAdapter].map((adapter) =>
    withConfigProblems(adapter, builtinSettingsProblems(adapter.id, settings[adapter.id])),
  );
  const custom = Object.keys(settings)
    .filter((id) => !isBuiltinProvider(id))
    .sort()
    .map((id) => createCustomAdapter(id, settings[id]!));
  return [...builtins, ...custom];
}

/** Personal provider settings overlaid by the project's, per provider id and field. */
export function mergeProviderSettings(
  personal: Record<string, ProviderSettings> | undefined,
  project: Record<string, ProviderSettings> | undefined,
): Record<string, ProviderSettings> {
  const out: Record<string, ProviderSettings> = {};
  for (const source of [personal ?? {}, project ?? {}]) {
    for (const [id, value] of Object.entries(source)) out[id] = { ...out[id], ...value };
  }
  return out;
}

/**
 * Adapters for a scope, including custom providers from the personal config
 * and (for project scope) agileflow.yaml. Unreadable config is ignored here;
 * the command reports it.
 */
export async function adaptersFor(ctx: Context, scope: ScopeTarget): Promise<ProviderAdapter[]> {
  const personal = await readGlobalConfig(globalScope(ctx).configPath).catch(() => null);
  const project = scope.kind === 'project' ? await readProjectConfig(scope.configPath).catch(() => null) : null;
  return allAdapters(mergeProviderSettings(personal?.providers, project?.providers));
}
