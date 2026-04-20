/**
 * Personalization prompts — three Clack selects for tone, ask-level, verbosity.
 *
 * v4.0-alpha scope: three enum flags that render into a short
 * `{{PERSONALIZATION_BLOCK}}` in each installed SKILL.md (the renderer lands
 * in Phase 5). ADR-0015 covers the future XML-tag matrix.
 */
const prompts = require('@clack/prompts');

/**
 * @param {import('../../runtime/config/defaults.js').Personalization} current
 * @returns {Promise<import('../../runtime/config/defaults.js').Personalization>}
 */
async function personalizationPrompts(current) {
  const tone = await prompts.select({
    message: 'How should AgileFlow respond?',
    options: [
      { value: 'concise', label: 'Concise', hint: 'Tight answers, low ceremony' },
      { value: 'detailed', label: 'Detailed', hint: 'More context and explanation' },
      { value: 'teaching', label: 'Teaching', hint: 'Walk through the why' },
    ],
    initialValue: current.tone,
  });
  if (prompts.isCancel(tone)) {
    prompts.cancel('Setup cancelled.');
    process.exit(0);
  }

  const askLevel = await prompts.select({
    message: 'When should AgileFlow ask for confirmation?',
    options: [
      { value: 'none', label: 'Never', hint: 'Fully autonomous' },
      { value: 'decision_points', label: 'At decision points', hint: 'Standard' },
      { value: 'always', label: 'Always', hint: 'Confirm before each step' },
    ],
    initialValue: current.ask_level,
  });
  if (prompts.isCancel(askLevel)) {
    prompts.cancel('Setup cancelled.');
    process.exit(0);
  }

  const verbosity = await prompts.select({
    message: 'Output length preference?',
    options: [
      { value: 'low', label: 'Low', hint: 'Short responses' },
      { value: 'medium', label: 'Medium', hint: 'Balanced' },
      { value: 'high', label: 'High', hint: 'Full context' },
    ],
    initialValue: current.verbosity,
  });
  if (prompts.isCancel(verbosity)) {
    prompts.cancel('Setup cancelled.');
    process.exit(0);
  }

  return {
    tone: /** @type {any} */ (tone),
    ask_level: /** @type {any} */ (askLevel),
    verbosity: /** @type {any} */ (verbosity),
  };
}

module.exports = { personalizationPrompts };
