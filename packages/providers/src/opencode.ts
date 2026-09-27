import path from 'node:path';
import type { Diagnostic, ProviderContext } from '@agileflow/core';
import { createStandardAdapter } from './standard-agent-skills';

/** OpenCode env flags that stop it from reading `.agents/skills` (and `.claude/skills`). */
const EXTERNAL_SKILL_FLAGS = ['OPENCODE_DISABLE_EXTERNAL_SKILLS', 'OPENCODE_DISABLE_CLAUDE_CODE_SKILLS', 'OPENCODE_DISABLE_CLAUDE_CODE'];

const truthy = (value: string | undefined) => value !== undefined && ['1', 'true'].includes(value.toLowerCase());

export function opencodeExternalSkillsDisabled(pctx: ProviderContext): Diagnostic | null {
  const flag = EXTERNAL_SKILL_FLAGS.find((name) => truthy(pctx.ctx.env[name]));
  if (!flag) return null;
  return {
    level: 'warn',
    message: `OpenCode does not read .agents/skills while ${flag} is set`,
    detail: [`Unset ${flag}, or list the skills directory under \`skills.paths\` in opencode.json.`],
  };
}

/**
 * OpenCode discovers `.agents/skills` natively. It has no manual-only switch:
 * its skill loader keeps only name, description, location, and content, and
 * lists every discovered skill (verified with OpenCode 1.4.6; there is no
 * `autoinvoke` setting). Manual skills therefore rely on their descriptions,
 * and `check` reports that as "semantic", as for Gemini. The only hard
 * control, a `permission.skill` deny rule, also hides the skill from
 * explicit use.
 */
export const opencodeAdapter = createStandardAdapter({
  id: 'opencode',
  displayName: 'OpenCode',
  support: 'native',
  detection: {
    executables: ['opencode'],
    homeMarkers: ['.config/opencode'],
    projectMarkers: ['.opencode', 'opencode.json', 'opencode.jsonc'],
    envMarkers: (pctx) => {
      const xdg = pctx.ctx.env.XDG_CONFIG_HOME;
      return xdg && path.isAbsolute(xdg) ? [{ path: path.join(xdg, 'opencode'), label: '$XDG_CONFIG_HOME/opencode' }] : [];
    },
  },
  manualInvocation: 'semantic',
  async extraValidate(pctx) {
    const hint = opencodeExternalSkillsDisabled(pctx);
    return hint ? [hint] : [];
  },
});
