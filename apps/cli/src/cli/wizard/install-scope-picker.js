/**
 * Install scope picker — choose project-local or user-global install roots.
 */
const prompts = require("@clack/prompts");
const { optionLabel, questionMessage } = require("../../lib/brand.js");

const INSTALL_SCOPE_OPTIONS = [
  {
    value: "project",
    label: optionLabel(
      "Project install",
      "Writes AgileFlow into this repository only.",
    ),
    hint: "Best when each repo has its own plugins, hooks, and state.",
  },
  {
    value: "global",
    label: optionLabel(
      "Global install",
      "Writes AgileFlow once under your home directory.",
    ),
    hint: "Best when you want the same commands and agents available everywhere.",
  },
];

/**
 * @param {string | undefined} currentScope
 * @returns {'project' | 'global'}
 */
function initialInstallScope(currentScope) {
  return currentScope === "global" ? "global" : "project";
}

/**
 * @param {string | undefined} currentScope
 * @returns {Promise<'project' | 'global'>}
 */
async function pickInstallScope(currentScope = "project") {
  const choice = await prompts.select({
    message: questionMessage("Where should AgileFlow install?"),
    options: INSTALL_SCOPE_OPTIONS,
    initialValue: initialInstallScope(currentScope),
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  return /** @type {'project' | 'global'} */ (choice);
}

module.exports = {
  INSTALL_SCOPE_OPTIONS,
  initialInstallScope,
  pickInstallScope,
};
