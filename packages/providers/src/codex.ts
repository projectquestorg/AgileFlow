import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  isNotFound,
  readFileText,
  readGlobalState,
  replaceFile,
  writeFileAtomic,
  writeGlobalState,
  type Context,
  type FeatureChange,
  type ProviderAdapter,
  type ProviderContext,
  type ResolvedSkill,
  type TreeFile,
} from '@agileflow/core';
import { createStandardAdapter, readSkillText } from './standard-agent-skills';
import { readTomlValue, removeTomlValue, setTomlValue, TomlEditError, type TomlValueState } from './toml-patch';

export const CODEX_OPENAI_YAML = 'agents/openai.yaml';
export const STRUCTURED_QUESTIONS_FEATURE = 'structured-questions';
const FEATURE_TABLE = 'features';
const FEATURE_KEY = 'default_mode_request_user_input';
const PATCH_PATH = `${FEATURE_TABLE}.${FEATURE_KEY}`;

/** `$CODEX_HOME` (Codex honors it for config.toml), else `~/.codex`. */
export function codexHome(ctx: Context): string {
  return ctx.env.CODEX_HOME ? path.resolve(ctx.env.CODEX_HOME) : path.join(ctx.homeDir, '.codex');
}

export function codexConfigPath(ctx: Context): string {
  return path.join(codexHome(ctx), 'config.toml');
}

async function readConfigText(file: string): Promise<string> {
  return (await readConfigFile(file)) ?? '';
}

async function readConfigFile(file: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Current value of `[features] default_mode_request_user_input` (null when unreadable). */
export async function readStructuredQuestions(ctx: Context): Promise<boolean | null> {
  try {
    const state = readTomlValue(await readConfigText(codexConfigPath(ctx)), FEATURE_TABLE, FEATURE_KEY);
    return state.existed ? state.value === true : false;
  } catch {
    return null;
  }
}

/** Wrap TOML problems with the file and what to do; nothing has been written. */
function tomlStep<T>(file: string, step: () => T): T {
  try {
    return step();
  } catch (err) {
    if (err instanceof TomlEditError) {
      throw new Error(
        `Cannot change ${file}: ${err.message}. Nothing was written. Fix the file or set [${FEATURE_TABLE}] ${FEATURE_KEY} yourself.`,
      );
    }
    throw err;
  }
}

async function isSymlink(file: string): Promise<boolean> {
  try {
    return (await fs.promises.lstat(file)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Enable or disable Codex's Default-mode `request_user_input` feature.
 *
 * Only ever touches `[features] default_mode_request_user_input` in
 * `$CODEX_HOME/config.toml` (`~/.codex/config.toml`), and only when the user
 * explicitly asks. The previous state is recorded in AgileFlow's machine
 * state; `enabled: false` means "keep Codex's default" and restores exactly
 * what was there before AgileFlow's change (including "not set"), but only
 * while the value is still the one AgileFlow applied. A value AgileFlow did
 * not set, or that the user changed since, is never changed.
 *
 * The write goes through `writeFileAtomic`, which keeps the file mode (a
 * 0600 config stays 0600) and writes through a symlinked config.
 */
export async function configureStructuredQuestions(
  ctx: Context,
  enabled: boolean,
  options: { dryRun?: boolean } = {},
): Promise<FeatureChange> {
  const file = codexConfigPath(ctx);
  const existing = await readConfigFile(file);
  const text = existing ?? '';
  const before: TomlValueState = tomlStep(file, () => readTomlValue(text, FEATURE_TABLE, FEATURE_KEY));
  const state = await readGlobalState(ctx);
  const patches = state.providerPatches.codex ?? [];
  const recorded = patches.find((p) => p.path === PATCH_PATH && p.file === file);
  const others = patches.filter((p) => !(p.path === PATCH_PATH && p.file === file));
  const current = before.existed ? before.value : undefined;

  const saveState = async (next: typeof patches) => {
    state.providerPatches.codex = next;
    if (!next.length) delete state.providerPatches.codex;
    await writeGlobalState(ctx, state);
  };

  if (enabled) {
    if (before.existed && before.value === true) {
      return { file, setting: PATCH_PATH, before: true, after: true, changed: false };
    }
    const result = tomlStep(file, () => setTomlValue(text, FEATURE_TABLE, FEATURE_KEY, true));
    const change: FeatureChange = { file, setting: PATCH_PATH, before: current, after: true, changed: true };
    if (options.dryRun) return change;
    // Record first, so a crash or failed write never leaves a value applied
    // without the record needed to restore it. Roll the record back when the
    // config write fails.
    const previousState = structuredClone(state);
    await saveState([
      ...others,
      {
        file,
        path: PATCH_PATH,
        previous: before.existed ? { existed: true, value: before.value } : { existed: false },
        applied: true,
        ...(result.createdTable ? { createdTable: true } : {}),
        ...(existing === null ? { createdFile: true } : {}),
        at: new Date().toISOString(),
      },
    ]);
    try {
      await writeFileAtomic(file, result.text);
    } catch (err) {
      await writeGlobalState(ctx, previousState).catch(() => undefined);
      throw err;
    }
    return change;
  }

  if (!recorded) {
    // Nothing AgileFlow changed: the current value is the user's own and stays.
    return { file, setting: PATCH_PATH, before: current, after: current, changed: false };
  }
  if (!before.existed || before.value !== recorded.applied) {
    // The user changed (or removed) the value after AgileFlow set it. Their
    // value wins; the record no longer describes the file, so drop it.
    if (!options.dryRun) await saveState(others);
    return {
      file,
      setting: PATCH_PATH,
      before: current,
      after: current,
      changed: false,
      note: 'The value was changed since AgileFlow set it, so it was left as is.',
    };
  }
  // Restore the exact previous state AgileFlow recorded.
  let nextText: string;
  let after: unknown;
  if (recorded.previous.existed) {
    nextText = tomlStep(file, () => setTomlValue(text, FEATURE_TABLE, FEATURE_KEY, recorded.previous.value as boolean).text);
    after = recorded.previous.value;
  } else {
    nextText = tomlStep(file, () => removeTomlValue(text, FEATURE_TABLE, FEATURE_KEY, recorded.createdTable === true));
    after = undefined;
  }
  const change: FeatureChange = { file, setting: PATCH_PATH, before: current, after, changed: nextText !== text };
  if (options.dryRun) return change;
  if (change.changed) {
    if (recorded.createdFile && !nextText.trim() && !(await isSymlink(file))) {
      // AgileFlow created this file; restoring means it no longer exists.
      await fs.promises.unlink(file);
    } else {
      await writeFileAtomic(file, nextText);
    }
  }
  await saveState(others);
  return change;
}

/** Merge `policy.allow_implicit_invocation: false` into agents/openai.yaml. */
function applyCodexManual(files: TreeFile[], skillId: string): TreeFile[] {
  const existing = readFileText(files, CODEX_OPENAI_YAML);
  const doc = YAML.parseDocument(existing ?? '');
  if (doc.errors.length) {
    throw new Error(
      `${skillId}: ${CODEX_OPENAI_YAML} is not valid YAML (${doc.errors[0]!.message.split('\n')[0]}); fix it so AgileFlow can add the Codex manual-only policy`,
    );
  }
  if (!doc.contents || !YAML.isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  if (!YAML.isMap(doc.getIn(['policy'], true))) doc.setIn(['policy'], doc.createNode({}));
  doc.setIn(['policy', 'allow_implicit_invocation'], false);
  return replaceFile(files, CODEX_OPENAI_YAML, doc.toString({ lineWidth: 0 }));
}

async function hasCodexManualFlag(skill: ResolvedSkill): Promise<boolean> {
  const text = await readSkillText(skill, CODEX_OPENAI_YAML);
  if (!text) return false;
  try {
    return (YAML.parse(text) as { policy?: { allow_implicit_invocation?: unknown } })?.policy?.allow_implicit_invocation === false;
  } catch {
    return false;
  }
}

const base = createStandardAdapter({
  id: 'codex',
  displayName: 'Codex',
  support: 'native',
  detection: {
    executables: ['codex'],
    homeMarkers: ['.codex'],
    projectMarkers: ['.codex'],
    envMarkers: (pctx) => (pctx.ctx.env.CODEX_HOME ? [{ path: codexHome(pctx.ctx), label: '$CODEX_HOME' }] : []),
  },
  manualInvocation: 'hard',
  manualMechanism: '`policy.allow_implicit_invocation: false` in agents/openai.yaml',
  applyManualActivation: applyCodexManual,
  hasManualFlag: hasCodexManualFlag,
  async optionalFeatures(pctx: ProviderContext) {
    return [
      {
        id: STRUCTURED_QUESTIONS_FEATURE,
        label: 'structured questions (Default mode request_user_input)',
        enabled: await readStructuredQuestions(pctx.ctx),
      },
    ];
  },
});

export const codexAdapter: ProviderAdapter = {
  ...base,
  async configureOptionalFeature(pctx, feature, enabled, options) {
    if (feature !== STRUCTURED_QUESTIONS_FEATURE) throw new Error(`Unknown Codex feature: ${feature}`);
    return configureStructuredQuestions(pctx.ctx, enabled, options);
  },
};
