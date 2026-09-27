import path from 'node:path';
import type { ProviderContext } from '@agileflow/core';
import { createLinkAdapter } from './link-adapter';
import { detectBySpec, tildify } from './util';

/**
 * Claude Code reads `.claude/skills` (and `~/.claude/skills`, or
 * `$CLAUDE_CONFIG_DIR/skills` when that is set), not `.agents/skills`. The
 * adapter makes each canonical skill visible there with a per-skill link
 * (symlink, junction on Windows, or a marked mirror as a last resort). It
 * owns only the links/mirrors it created; the `.claude/skills` directory and
 * everything else in it belong to the user. It never touches
 * `.claude/settings.json`.
 */

/** Claude's user config directory: `$CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export function claudeConfigDir(pctx: ProviderContext): string {
  const env = pctx.ctx.env.CLAUDE_CONFIG_DIR;
  return env ? path.resolve(pctx.ctx.homeDir, env) : path.join(pctx.ctx.homeDir, '.claude');
}

function claudeSkillsDir(pctx: ProviderContext): string {
  return pctx.scope.kind === 'project'
    ? path.join(pctx.scope.root, '.claude', 'skills')
    : path.join(claudeConfigDir(pctx), 'skills');
}

export const claudeAdapter = createLinkAdapter({
  id: 'claude',
  displayName: 'Claude',
  support: 'adapted',
  detect: (pctx) =>
    detectBySpec(pctx, {
      executables: ['claude'],
      homeMarkers: ['.claude'],
      projectMarkers: ['.claude', 'CLAUDE.md'],
      envMarkers: (p) => (p.ctx.env.CLAUDE_CONFIG_DIR ? [{ path: claudeConfigDir(p), label: '$CLAUDE_CONFIG_DIR' }] : []),
    }),
  linkDir: claudeSkillsDir,
  linkLabel: (pctx) => (pctx.scope.kind === 'project' ? '.claude/skills' : tildify(claudeSkillsDir(pctx), pctx.ctx.homeDir)),
  manualInvocation: 'hard',
  manualFlag: { key: ['disable-model-invocation'], value: true },
});
