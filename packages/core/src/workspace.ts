import YAML from 'yaml';
import type { Context } from './context';
import {
  deleteIfEmpty,
  editYamlConfig,
  emptyLockfile,
  GlobalConfigSchema,
  INITIAL_GLOBAL_CONFIG,
  initialProjectConfig,
  ProjectConfigSchema,
  readGlobalConfig,
  readLockfile,
  readProjectConfig,
  specToYaml,
  writeLockfile,
  type Lockfile,
  type ProviderSettings,
  type QuestionPreference,
  type SkillSpec,
} from './config';
import type { ScopeTarget } from './scope';
import type { PackageFetcher, ProviderAdapter } from './types';

/** What operations need from the outside world. */
export interface Services {
  ctx: Context;
  fetcher: PackageFetcher;
  adapters: ProviderAdapter[];
}

export interface Workspace {
  scope: ScopeTarget;
  configExists: boolean;
  specs: Record<string, SkillSpec>;
  questionPreference: QuestionPreference;
  providerSettings: Record<string, ProviderSettings>;
  registry: string | undefined;
  lock: Lockfile;
  lockExists: boolean;
}

export async function loadWorkspace(scope: ScopeTarget): Promise<Workspace> {
  const lock = await readLockfile(scope.lockPath);
  if (scope.kind === 'project') {
    const config = await readProjectConfig(scope.configPath);
    return {
      scope,
      configExists: config !== null,
      specs: config?.skills ?? {},
      questionPreference: config?.interaction?.questionPreference ?? 'provider-default',
      providerSettings: config?.providers ?? {},
      registry: config?.registry,
      lock: lock ?? emptyLockfile(),
      lockExists: lock !== null,
    };
  }
  const config = await readGlobalConfig(scope.configPath);
  return {
    scope,
    configExists: config !== null,
    specs: config?.globalSkills ?? {},
    questionPreference: config?.defaults?.questionPreference ?? 'provider-default',
    providerSettings: config?.providers ?? {},
    registry: config?.registry,
    lock: lock ?? emptyLockfile(),
    lockExists: lock !== null,
  };
}

function skillsKey(scope: ScopeTarget): string {
  return scope.kind === 'project' ? 'skills' : 'globalSkills';
}

/** Edit the scope's config file (agileflow.yaml or ~/.config/agileflow/config.yaml). */
export async function editScopeConfig(
  scope: ScopeTarget,
  mutate: (doc: YAML.Document, skillsKey: string) => void,
  options: { questionPreference?: QuestionPreference } = {},
): Promise<void> {
  if (scope.kind === 'project') {
    await editYamlConfig(
      scope.configPath,
      ProjectConfigSchema,
      initialProjectConfig(options.questionPreference ?? 'provider-default'),
      (doc) => mutate(doc, 'skills'),
    );
  } else {
    await editYamlConfig(scope.configPath, GlobalConfigSchema, INITIAL_GLOBAL_CONFIG, (doc) =>
      mutate(doc, 'globalSkills'),
    );
  }
}

export async function setSkillSpecs(scope: ScopeTarget, specs: Record<string, SkillSpec>): Promise<void> {
  await editScopeConfig(scope, (doc, key) => {
    if (!YAML.isMap(doc.getIn([key], true))) doc.setIn([key], doc.createNode({}));
    // Block style reads better than the `{}` placeholder the template starts with.
    (doc.getIn([key], true) as YAML.YAMLMap).flow = false;
    for (const [id, spec] of Object.entries(specs)) {
      doc.setIn([key, id], doc.createNode(specToYaml(spec)));
    }
  });
}

export async function removeSkillSpecs(scope: ScopeTarget, ids: string[]): Promise<void> {
  await editScopeConfig(scope, (doc, key) => {
    for (const id of ids) doc.deleteIn([key, id]);
    if (!doc.hasIn([key])) doc.setIn([key], doc.createNode({}));
  });
}

/** Set a nested config value, e.g. `['interaction', 'questionPreference']`. */
export async function setConfigValue(scope: ScopeTarget, keyPath: string[], value: unknown): Promise<void> {
  await editScopeConfig(scope, (doc) => {
    if (value === undefined) {
      doc.deleteIn(keyPath);
      if (keyPath.length > 1) deleteIfEmpty(doc, keyPath.slice(0, -1));
    } else {
      doc.setIn(keyPath, value);
    }
  });
}

export function scopeSkillsKey(scope: ScopeTarget): string {
  return skillsKey(scope);
}

export async function saveLock(ws: Workspace): Promise<void> {
  await writeLockfile(ws.scope.lockPath, ws.lock);
  ws.lockExists = true;
}
