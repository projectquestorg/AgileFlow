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
import { readTomlValue, removeTomlValue, setTomlValue } from './toml-patch';

export const CODEX_OPENAI_YAML = 'agents/openai.yaml';
export const STRUCTURED_QUESTIONS_FEATURE = 'structured-questions';
const FEATURE_TABLE = 'features';
const FEATURE_KEY = 'default_mode_request_user_input';
const PATCH_PATH = `${FEATURE_TABLE}.${FEATURE_KEY}`;

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

/**
 * Enable or disable Codex's Default-mode `request_user_input` feature.
 *
 * Only ever touches `[features] default_mode_request_user_input` in
 * `~/.codex/config.toml`, and only when the user explicitly asks. The
 * previous state is recorded in AgileFlow's machine state; `enabled: false`
 * means "keep Codex's default" and restores exactly what was there before
 * AgileFlow's change (including "not set"). A value AgileFlow did not set
 * is never changed.
 */
export async function configureStructuredQuestions(
  ctx: Context,
  enabled: boolean,
  options: { dryRun?: boolean } = {},
): Promise<FeatureChange> {
  const file = codexConfigPath(ctx);
  const existing = await readConfigFile(file);
  const text = existing ?? '';
  const before = readTomlValue(text, FEATURE_TABLE, FEATURE_KEY);
  const state = await readGlobalState(ctx);
  const patches = state.providerPatches.codex ?? [];
  const recorded = patches.find((p) => p.path === PATCH_PATH && p.file === file);

  let nextText = text;
  let createdTable = false;
  let after: unknown;
  if (enabled) {
    if (before.existed && before.value === true) {
      return { file, setting: PATCH_PATH, before: true, after: true, changed: false };
    }
    const result = setTomlValue(text, FEATURE_TABLE, FEATURE_KEY, true);
    nextText = result.text;
    createdTable = result.createdTable;
    after = true;
  } else if (recorded) {
    // Restore the exact previous state AgileFlow recorded.
    if (recorded.previous.existed) {
      nextText = setTomlValue(text, FEATURE_TABLE, FEATURE_KEY, recorded.previous.value as boolean).text;
      after = recorded.previous.value;
    } else {
      nextText = removeTomlValue(text, FEATURE_TABLE, FEATURE_KEY, recorded.createdTable === true);
      after = undefined;
    }
  } else {
    // Nothing AgileFlow changed: the current value is the user's own and stays.
    return {
      file,
      setting: PATCH_PATH,
      before: before.existed ? before.value : undefined,
      after: before.existed ? before.value : undefined,
      changed: false,
    };
  }

  const change: FeatureChange = {
    file,
    setting: PATCH_PATH,
    before: before.existed ? before.value : undefined,
    after,
    changed: nextText !== text,
  };
  if (options.dryRun || !change.changed) return change;

  if (!enabled && recorded?.createdFile && !nextText.trim()) {
    // AgileFlow created this file; restoring means it no longer exists.
    await fs.promises.unlink(file);
  } else {
    await writeFileAtomic(file, nextText);
  }
  const others = patches.filter((p) => !(p.path === PATCH_PATH && p.file === file));
  if (enabled) {
    others.push({
      file,
      path: PATCH_PATH,
      previous: before.existed ? { existed: true, value: before.value } : { existed: false },
      applied: after,
      ...(createdTable ? { createdTable: true } : {}),
      ...(existing === null ? { createdFile: true } : {}),
      at: new Date().toISOString(),
    });
  }
  state.providerPatches.codex = others;
  if (!others.length) delete state.providerPatches.codex;
  await writeGlobalState(ctx, state);
  return change;
}

/** Merge `policy.allow_implicit_invocation: false` into agents/openai.yaml. */
function applyCodexManual(files: TreeFile[]): TreeFile[] {
  const existing = readFileText(files, CODEX_OPENAI_YAML);
  const doc = YAML.parseDocument(existing ?? '');
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
  detection: { executables: ['codex'], homeMarkers: ['.codex'], projectMarkers: ['.codex'] },
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
