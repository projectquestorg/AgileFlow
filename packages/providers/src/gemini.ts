import fs from 'node:fs';
import path from 'node:path';
import type { Diagnostic, ProviderContext } from '@agileflow/core';
import { createStandardAdapter } from './standard-agent-skills';

/**
 * Gemini CLI behavior modeled here was verified against the published
 * `@google/gemini-cli` package (0.61.0):
 * - project skills (including `.agents/skills`) load only in trusted folders;
 * - folder trust is on unless `security.folderTrust.enabled` is false (the
 *   system settings file overrides the user's);
 * - `GEMINI_CLI_TRUST_WORKSPACE=true|false` and `GEMINI_RESTRICTED_MODE=true`
 *   override the trust rules;
 * - trust rules in `trustedFolders.json` apply by the longest matching rule
 *   path, so a `DO_NOT_TRUST` project inside a `TRUST_FOLDER` parent is untrusted;
 * - `skills.enabled: false` turns Agent Skills off;
 * - `.agents/skills` is read since 0.36.0.
 */

function readJson(file: string): Record<string, unknown> | null {
  try {
    // Gemini allows comments in these files; strip whole-line `//` comments.
    const text = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getIn(obj: Record<string, unknown> | null, keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function geminiHome(pctx: ProviderContext): string {
  const env = pctx.ctx.env.GEMINI_CLI_HOME;
  return path.join(env ? path.resolve(env) : pctx.ctx.homeDir, '.gemini');
}

function systemSettingsPath(pctx: ProviderContext): string {
  const env = pctx.ctx.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  if (env) return env;
  if (pctx.ctx.platform === 'darwin') return '/Library/Application Support/GeminiCli/settings.json';
  if (pctx.ctx.platform === 'win32') return 'C:\\ProgramData\\gemini-cli\\settings.json';
  return '/etc/gemini-cli/settings.json';
}

/** A setting as Gemini resolves it: system settings override user settings. */
function setting(pctx: ProviderContext, keys: string[]): unknown {
  const system = getIn(readJson(systemSettingsPath(pctx)), keys);
  if (system !== undefined) return system;
  return getIn(readJson(path.join(geminiHome(pctx), 'settings.json')), keys);
}

function realOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function normalizeFor(p: string, platform: NodeJS.Platform): string {
  const abs = path.resolve(realOrSelf(p));
  return platform === 'win32' || platform === 'darwin' ? abs.toLowerCase() : abs;
}

function within(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Gemini's own rule: the longest matching rule path decides; undefined when no rule matches. */
export function geminiFolderTrust(
  rules: Record<string, unknown>,
  folder: string,
  platform: NodeJS.Platform,
): boolean | undefined {
  const location = normalizeFor(folder, platform);
  let bestLength = -1;
  let best: unknown;
  for (const [rulePath, level] of Object.entries(rules)) {
    const effective = level === 'TRUST_PARENT' ? path.dirname(rulePath) : rulePath;
    if (!within(location, normalizeFor(effective, platform))) continue;
    if (rulePath.length > bestLength) {
      bestLength = rulePath.length;
      best = level;
    }
  }
  if (best === 'DO_NOT_TRUST') return false;
  if (best === 'TRUST_FOLDER' || best === 'TRUST_PARENT') return true;
  return undefined;
}

/**
 * Gemini CLI loads project skills only from trusted folders. Returns null
 * when folder trust is off or the folder is trusted, else a hint.
 */
export function geminiTrustHint(pctx: ProviderContext): Diagnostic | null {
  if (pctx.scope.kind !== 'project') return null;
  const env = pctx.ctx.env;
  const forcedUntrusted = env.GEMINI_RESTRICTED_MODE === 'true' || env.GEMINI_CLI_TRUST_WORKSPACE === 'false';
  if (!forcedUntrusted) {
    if (env.GEMINI_CLI_TRUST_WORKSPACE === 'true') return null;
    if (setting(pctx, ['security', 'folderTrust', 'enabled']) === false) return null;
    const rulesFile = env.GEMINI_CLI_TRUSTED_FOLDERS_PATH || path.join(geminiHome(pctx), 'trustedFolders.json');
    if (geminiFolderTrust(readJson(rulesFile) ?? {}, pctx.scope.root, pctx.ctx.platform) === true) return null;
  }
  return {
    level: 'warn',
    message: 'Gemini loads project skills only in trusted folders',
    detail: [
      forcedUntrusted
        ? 'The environment marks this workspace untrusted (GEMINI_RESTRICTED_MODE or GEMINI_CLI_TRUST_WORKSPACE=false).'
        : 'Open this folder in Gemini CLI and choose to trust it, or `gemini skills list` will not show .agents/skills.',
    ],
  };
}

/** `skills.enabled: false` in Gemini settings turns Agent Skills off entirely. */
export function geminiSkillsDisabled(pctx: ProviderContext): Diagnostic | null {
  if (setting(pctx, ['skills', 'enabled']) !== false) return null;
  return {
    level: 'warn',
    message: 'Gemini Agent Skills are turned off (skills.enabled: false)',
    detail: ['Remove `skills.enabled: false` from your Gemini settings.json to load skills.'],
  };
}

/**
 * Gemini CLI reads `.agents/skills` as an alias of its native skill location.
 * There is no hard manual-only switch to rely on, so manual skills depend on
 * their descriptions; `check` reports that as "semantic" rather than
 * pretending otherwise.
 */
export const geminiAdapter = createStandardAdapter({
  id: 'gemini',
  displayName: 'Gemini',
  support: 'native',
  detection: {
    executables: ['gemini'],
    homeMarkers: ['.gemini'],
    projectMarkers: ['.gemini', 'GEMINI.md'],
  },
  manualInvocation: 'semantic',
  minimumVersion: {
    version: '0.36.0',
    feature: 'reading .agents/skills',
    upgrade: 'Upgrade Gemini CLI (`npm install -g @google/gemini-cli@latest`); older versions only read .gemini/skills.',
  },
  async extraValidate(pctx) {
    return [geminiSkillsDisabled(pctx), geminiTrustHint(pctx)].filter((d): d is Diagnostic => d !== null);
  },
});
