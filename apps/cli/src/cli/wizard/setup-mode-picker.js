/**
 * Setup mode picker — choose between a one-confirm Quick start and the
 * full Customize wizard.
 *
 * Uses the dependency-injection deps-bag pattern (accept `deps = {}` and
 * destructure a @clack/prompts default) so tests can inject a stub prompts
 * module instead of relying on unreliable CJS module mocking.
 */
const prompts = require("@clack/prompts");
const { optionLabel, questionMessage } = require("../../lib/brand.js");

const SETUP_MODE_OPTIONS = [
  {
    value: "quick",
    label: optionLabel(
      "Quick start (recommended defaults)",
      "Install the recommended setup with a single confirm.",
    ),
    hint: "Claude Code, core skill pack, guided babysit mode.",
  },
  {
    value: "customize",
    label: optionLabel(
      "Customize (advanced)",
      "Choose scope, IDEs, skill packs, behaviors, and more.",
    ),
    hint: "Full control over every option.",
  },
];

/**
 * @param {{ prompts?: any }} [deps]
 * @returns {Promise<'quick' | 'customize'>}
 */
async function pickSetupMode(deps = {}) {
  const p = deps.prompts || prompts;
  const choice = await p.select({
    message: questionMessage("How would you like to set up AgileFlow?"),
    options: SETUP_MODE_OPTIONS,
    initialValue: "quick",
  });

  if (p.isCancel(choice)) {
    p.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  return /** @type {'quick' | 'customize'} */ (choice);
}

module.exports = {
  SETUP_MODE_OPTIONS,
  pickSetupMode,
};
