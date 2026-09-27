import fs from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_PROVIDER_IDS,
  type Diagnostic,
  type ProviderAdapter,
  type ProviderContext,
  type ProviderSettings,
} from '@agileflow/core';
import { createLinkAdapter } from './link-adapter';

/**
 * Custom link providers, declared in agileflow.yaml or the personal config:
 *
 *   providers:
 *     windsurf:
 *       skillsDir: .windsurf/skills            # project-relative
 *       userSkillsDir: .codeium/windsurf/skills # home-relative, for --global
 *       displayName: Windsurf
 *
 * Any id that is not a built-in and has `skillsDir`/`userSkillsDir` gets
 * per-skill links exactly like Claude: same link/mirror machinery, same
 * ownership rules (only links/mirrors AgileFlow created, never the
 * directory). There is no plugin runtime; this is data only.
 */

const CUSTOM_ID_RE = /^[a-z][a-z0-9-]*$/;

const isBuiltin = (id: string) => (BUILTIN_PROVIDER_IDS as readonly string[]).includes(id);

/** Reason a `skillsDir`/`userSkillsDir` value is unusable, or null when it is fine. */
export function skillsDirProblem(value: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value)) return 'contains control characters';
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('~')) {
    return 'must be a relative path';
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, '/')).replace(/\/+$/, '');
  if (!normalized || normalized === '.') return 'must name a directory';
  if (normalized.split('/').includes('..')) return 'must not contain `..`';
  const lower = normalized.toLowerCase();
  if (lower === '.agents/skills' || lower.startsWith('.agents/skills/')) {
    return 'is the canonical .agents/skills directory; a provider that reads it needs no links';
  }
  if (lower === '.claude/skills') return 'is managed by the built-in Claude adapter';
  return null;
}

function normalizedDir(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, '/')).replace(/\/+$/, '');
}

/** Config problems for a built-in provider (custom-only settings are rejected). */
export function builtinSettingsProblems(id: string, settings: ProviderSettings | undefined): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const field of ['skillsDir', 'userSkillsDir'] as const) {
    if (settings?.[field] !== undefined) {
      out.push({
        level: 'error',
        message: `providers.${id}.${field} is not supported: ${id} is a built-in provider`,
        detail: [`Remove \`${field}\`; AgileFlow already knows where ${id} reads skills.`],
      });
    }
  }
  if (settings?.displayName !== undefined) {
    out.push({ level: 'warn', message: `providers.${id}.displayName is ignored for the built-in ${id} provider` });
  }
  return out;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Adapter for a non-built-in provider id from config. */
export function createCustomAdapter(id: string, settings: ProviderSettings): ProviderAdapter {
  const displayName = settings.displayName ?? id;
  const configured = settings.skillsDir !== undefined || settings.userSkillsDir !== undefined;

  const problems = (): Diagnostic[] => {
    if (!CUSTOM_ID_RE.test(id)) {
      return [
        {
          level: 'error',
          message: `providers.${id}: provider ids must start with a letter and use lowercase letters, digits, and hyphens`,
        },
      ];
    }
    if (!configured) {
      return [
        {
          level: 'warn',
          message: `providers.${id} is not a built-in provider and has no skillsDir; nothing is linked for it`,
          detail: [
            `Built-in providers: ${BUILTIN_PROVIDER_IDS.join(', ')}.`,
            'For another agent, set `skillsDir` (project-relative) and/or `userSkillsDir` (home-relative) to the directory it reads skills from.',
          ],
        },
      ];
    }
    const out: Diagnostic[] = [];
    for (const field of ['skillsDir', 'userSkillsDir'] as const) {
      const value = settings[field];
      const problem = value === undefined ? null : skillsDirProblem(value);
      if (problem) out.push({ level: 'error', message: `providers.${id}.${field} ${problem}`, detail: [`Got: ${JSON.stringify(value)}`] });
    }
    return out;
  };

  /** Configured directory for the scope, relative to the scope root. */
  const relDir = (pctx: ProviderContext): string | null => {
    const value = pctx.scope.kind === 'project' ? settings.skillsDir : settings.userSkillsDir;
    return value === undefined || skillsDirProblem(value) ? null : normalizedDir(value);
  };

  return createLinkAdapter({
    id,
    displayName,
    support: 'experimental',
    async detect(pctx) {
      if (!configured) return { detected: true, evidence: [`providers.${id} in config`] };
      const rel = relDir(pctx);
      if (!rel) return { detected: false, evidence: [] };
      // Declared in this scope's own config: that is the user's statement
      // that they use it here.
      if (pctx.settings?.skillsDir !== undefined || pctx.settings?.userSkillsDir !== undefined) {
        return { detected: true, evidence: [`configured in ${pctx.scope.kind === 'project' ? 'agileflow.yaml' : 'personal config'}`] };
      }
      // Declared only in the personal config: link where the agent's folder
      // already exists (e.g. `.windsurf/` for `.windsurf/skills`).
      const marker = rel.split('/')[0]!;
      const where = path.join(pctx.scope.root, marker);
      if (await exists(where)) {
        return { detected: true, evidence: [pctx.scope.kind === 'project' ? `${marker} in project` : `~/${marker} exists`] };
      }
      return { detected: false, evidence: [] };
    },
    linkDir: (pctx) => {
      const rel = relDir(pctx);
      return rel ? path.join(pctx.scope.root, ...rel.split('/')) : null;
    },
    linkLabel: (pctx) => {
      const rel = relDir(pctx) ?? '';
      return pctx.scope.kind === 'project' ? rel : `~/${rel}`;
    },
    manualInvocation: 'semantic',
    configProblems: problems,
    noDirMessage: (pctx) =>
      pctx.scope.kind === 'project'
        ? `${displayName}: no skillsDir configured; project skills are not linked`
        : `${displayName}: no userSkillsDir configured; personal skills are not linked`,
  });
}

/** Wrap a built-in adapter so `check`/`sync` report unsupported custom settings on it. */
export function withConfigProblems(adapter: ProviderAdapter, problems: Diagnostic[]): ProviderAdapter {
  if (!problems.length) return adapter;
  return {
    ...adapter,
    async validate(pctx, skills) {
      return [...problems, ...(await adapter.validate(pctx, skills))];
    },
  };
}

export { isBuiltin as isBuiltinProvider };
