import fs from 'node:fs';
import path from 'node:path';
import type { Diagnostic, ProviderContext } from '@agileflow/core';
import { createStandardAdapter } from './standard-agent-skills';

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function within(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Gemini CLI loads project skills only from trusted folders. Returns null when
 * trust is disabled or the folder is trusted, else a hint.
 */
export function geminiTrustHint(pctx: ProviderContext): Diagnostic | null {
  if (pctx.scope.kind !== 'project') return null;
  const geminiDir = path.join(pctx.ctx.homeDir, '.gemini');
  const settings = readJson(path.join(geminiDir, 'settings.json'));
  const folderTrust = (settings?.security as { folderTrust?: { enabled?: unknown } } | undefined)?.folderTrust;
  if (folderTrust?.enabled === false) return null;
  const trusted = readJson(path.join(geminiDir, 'trustedFolders.json')) ?? {};
  const root = path.resolve(pctx.scope.root);
  for (const [entry, value] of Object.entries(trusted)) {
    const abs = path.resolve(entry);
    if (value === 'TRUST_FOLDER' && within(root, abs)) return null;
    if (value === 'TRUST_PARENT' && within(root, path.dirname(abs))) return null;
  }
  return {
    level: 'warn',
    message: 'Gemini loads project skills only in trusted folders',
    detail: ['Open this folder in Gemini CLI and choose to trust it, or `gemini skills list` will not show .agents/skills.'],
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
  async extraValidate(pctx) {
    const hint = geminiTrustHint(pctx);
    return hint ? [hint] : [];
  },
});
