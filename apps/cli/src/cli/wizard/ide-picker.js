/**
 * IDE / CLI picker — Clack select prompt.
 *
 * Asks the user which agentic IDE or CLI they're targeting. Defaults to
 * Claude Code (the full-feature target). The choice is persisted to
 * `agileflow.config.json` at `ide.primary` and gates which plugin
 * content the installer writes (hooks, skills, etc. — see
 * `runtime/ide/capabilities.js`).
 */
const prompts = require('@clack/prompts');
const {
  IDE_CAPABILITIES,
  SUPPORTED_IDES,
  capabilitiesFor,
} = require('../../runtime/ide/capabilities.js');

/**
 * @param {string} currentIde - existing config's ide.primary
 * @returns {Promise<string>} selected ide id
 */
async function pickIde(currentIde) {
  const initialValue = SUPPORTED_IDES.includes(currentIde) ? currentIde : 'claude-code';

  const choice = await prompts.select({
    message: 'Which IDE / CLI are you using?',
    options: SUPPORTED_IDES.map((id) => {
      const caps = IDE_CAPABILITIES[id];
      const featureList = ['hooks', 'skills', 'commands', 'agents', 'mcp']
        .filter((f) => caps[f])
        .join(', ');
      return {
        value: id,
        label: caps.description,
        hint: featureList ? `enables: ${featureList}` : '(very limited support)',
      };
    }),
    initialValue,
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel('Setup cancelled. No changes made.');
    process.exit(1);
  }

  const caps = capabilitiesFor(/** @type {string} */ (choice));
  const disabled = ['hooks', 'skills', 'commands', 'agents']
    .filter((f) => !caps[f]);
  if (disabled.length) {
    prompts.log.warn(
      `${choice}: ${disabled.join(', ')} won't be installed (not supported by this IDE).`,
    );
  }

  return /** @type {string} */ (choice);
}

module.exports = { pickIde };
