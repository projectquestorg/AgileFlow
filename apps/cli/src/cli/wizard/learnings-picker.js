/**
 * Learnings picker — single confirm prompt for the global on/off toggle.
 *
 * When enabled:
 *   - install-time scaffolds `_learnings/<file>.yaml` for every skill
 *     that opts in via `learns.enabled: true` in its frontmatter
 *   - the SessionStart context-loader injects a one-line hint telling
 *     Claude to call `agileflow learn append …` on user corrections
 *
 * When disabled, neither happens. The `agileflow learn` CLI still works
 * for users who want to manage signals manually.
 */
const prompts = require("@clack/prompts");
const { questionMessage } = require("../../lib/brand.js");

/**
 * @param {{ enabled?: boolean }} [current]
 * @returns {Promise<{ enabled: boolean }>}
 */
async function pickLearnings(current) {
  const initialValue =
    current && typeof current.enabled === "boolean" ? current.enabled : true;

  const choice = await prompts.confirm({
    message: questionMessage(
      "Enable skill learnings?",
      "Skills can remember your corrections for next time.",
    ),
    initialValue,
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  return { enabled: Boolean(choice) };
}

module.exports = { pickLearnings };
