/**
 * `agileflow setup` — interactive install wizard.
 *
 * Phase 1 ships a minimal Clack preview so the UX direction is visible
 * (see skills.sh/vercel-labs/skills for the reference aesthetic).
 *
 * The real installer lands in Phase 2: plugin picker (multiselect with
 * search), personalization (3 selects), spinner-gated install, non-
 * interactive `--yes --plugins core,seo` path.
 */
const prompts = require('@clack/prompts');
const pkg = require('../../../package.json');

/** @param {{ yes?: boolean, plugins?: string }} _options */
async function setup(_options = {}) {
  prompts.intro(`agileflow v${pkg.version} setup`);

  prompts.log.info(
    [
      'Phase 1 skeleton — the installer + plugin loader ship in Phase 2.',
      '',
      'Phase 2 will wire:',
      '  • plugin picker (multiselect, pre-checked core, seo/ads/audit opt-ins)',
      '  • personalization prompts (tone, ask_level, verbosity)',
      '  • SHA256 safe-update engine (ported from v3 installer.js:349-455)',
      '  • --yes --plugins <ids> non-interactive path',
      '',
      'Plan: /home/bk/.claude/plans/fizzy-stirring-kahan.md',
    ].join('\n'),
  );

  prompts.outro('Phase 2 is the next task.');
  process.exitCode = 2;
}

module.exports = setup;
