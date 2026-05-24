/**
 * AI CLI picker for `agileflow launch setup`.
 *
 * Two-step flow:
 *   1. multiselect — which detected CLIs to include in the fallback order
 *   2. select       — which of those is the preferred / default
 *
 * Only CLIs actually present on PATH are offered. If zero are detected
 * the picker still surfaces the known set so the user can configure
 * AgileFlow before they install the underlying CLI (with a warning).
 */
const prompts = require("@clack/prompts");
const { questionMessage } = require("../../lib/brand.js");
const {
  KNOWN_CLIS,
  availableClis,
} = require("../../runtime/launch/detect-clis.js");

/**
 * Pure helper extracted for unit testing: decide what to offer in the
 * multiselect given a list of detected descriptors and the user's current
 * fallbackOrder.
 *
 * @param {import('../../runtime/launch/detect-clis.js').CliDescriptor[]} detected
 * @param {string[]} currentFallback
 * @returns {{
 *   choices: import('../../runtime/launch/detect-clis.js').CliDescriptor[],
 *   initial: string[],
 *   noneDetected: boolean,
 * }}
 */
function buildCliChoices(detected, currentFallback) {
  const noneDetected = detected.length === 0;
  const choices = noneDetected ? KNOWN_CLIS : detected;
  const choiceIds = new Set(choices.map((c) => c.id));
  const initial = (currentFallback || []).filter((id) => choiceIds.has(id));
  return { choices, initial, noneDetected };
}

/**
 * Pure helper: pick the default for the "preferred CLI" select. Prefers
 * the user's existing preference if it's still in the selected set,
 * otherwise the first selected id.
 *
 * @param {string[]} selected
 * @param {string} currentPreferred
 * @returns {string}
 */
function pickInitialPreferred(selected, currentPreferred) {
  if (selected.includes(currentPreferred)) return currentPreferred;
  return selected[0];
}

/**
 * Run the picker.
 *
 * @param {{
 *   cli: { preferred: string, fallbackOrder: string[] },
 * }} currentPrefs
 * @param {(name: string) => boolean} [exists] - injectable for tests; defaults to PATH probe
 * @returns {Promise<{ preferred: string, fallbackOrder: string[] }>}
 */
async function pickCli(currentPrefs, exists) {
  const detected = availableClis(exists);
  const { choices, initial, noneDetected } = buildCliChoices(
    detected,
    currentPrefs.cli.fallbackOrder,
  );

  if (noneDetected) {
    prompts.log.warn(
      "No supported AI CLIs detected on PATH (claude, codex, cursor-agent, aider). " +
        "You can still pick which CLIs `agileflow launch` should target — install them later.",
    );
  }

  const selectedRaw = await prompts.multiselect({
    message: questionMessage(
      "Which AI CLIs should `agileflow launch` know about?",
      "Order is preserved as fallback order if your preferred CLI is missing.",
    ),
    options: choices.map((c) => ({
      value: c.id,
      label: c.label,
      hint: c.hint,
    })),
    initialValues: initial.length ? initial : choices.map((c) => c.id),
    required: true,
  });

  if (prompts.isCancel(selectedRaw)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const selected = /** @type {string[]} */ (selectedRaw);

  const preferredRaw = await prompts.select({
    message: questionMessage(
      "Which CLI should `agileflow launch` use by default?",
    ),
    options: selected.map((id) => {
      const desc = choices.find((c) => c.id === id);
      return {
        value: id,
        label: desc ? desc.label : id,
        hint: desc && desc.hint,
      };
    }),
    initialValue: pickInitialPreferred(selected, currentPrefs.cli.preferred),
  });

  if (prompts.isCancel(preferredRaw)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const preferred = /** @type {string} */ (preferredRaw);

  // Fallback order = preferred first, then the rest in user's multiselect order.
  const fallbackOrder = [
    preferred,
    ...selected.filter((id) => id !== preferred),
  ];

  return { preferred, fallbackOrder };
}

module.exports = { pickCli, buildCliChoices, pickInitialPreferred };
