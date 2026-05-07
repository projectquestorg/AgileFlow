/**
 * IDE / CLI picker — Clack multiselect prompt.
 *
 * Asks the user which agentic IDEs / CLIs to install AgileFlow into.
 * Multiple selections are supported (space toggles); the result is
 * persisted to `agileflow.config.json` at `ide.targets`. The installer
 * mirrors skills into each selected IDE's dotdir and writes hooks /
 * settings only into IDEs whose capability map declares them.
 */
const prompts = require("@clack/prompts");
const {
  IDE_CAPABILITIES,
  SUPPORTED_IDES,
  capabilitiesFor,
} = require("../../runtime/ide/capabilities.js");
const { questionMessage } = require("../../lib/brand.js");

/**
 * @param {string[]} currentTargets - existing config's ide.targets
 * @returns {Promise<string[]>} selected ide ids (>=1)
 */
async function pickIdes(currentTargets) {
  const valid = (currentTargets || []).filter((id) =>
    SUPPORTED_IDES.includes(id),
  );
  const initialValues = valid.length ? valid : ["claude-code"];

  const choice = await prompts.multiselect({
    message: questionMessage(
      "Which IDEs / CLIs should AgileFlow install into?",
    ),
    options: SUPPORTED_IDES.map((id) => {
      const caps = IDE_CAPABILITIES[id];
      const features = ["hooks", "skills", "agents"]
        .filter((f) => caps[f])
        .join(", ");
      return {
        value: id,
        label: caps.description,
        hint: features || "(limited)",
      };
    }),
    initialValues,
    required: true,
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const targets = /** @type {string[]} */ (choice);

  // Surface what each target won't get — so a user picking only Cursor
  // isn't surprised that hooks/agents weren't installed.
  for (const id of targets) {
    const caps = capabilitiesFor(id);
    const disabled = ["hooks", "skills", "agents"].filter((f) => !caps[f]);
    if (disabled.length) {
      prompts.log.warn(
        `${caps.description}: ${disabled.join(", ")} are not available here.`,
      );
    }
  }

  return targets;
}

module.exports = { pickIdes };
