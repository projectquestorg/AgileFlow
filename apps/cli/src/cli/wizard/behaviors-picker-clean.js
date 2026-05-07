/**
 * Behaviors picker with plain labels and muted hints.
 *
 * This is the user-facing version used by setup/update. It keeps the
 * underlying behavior mapping intact, but removes hook names from the
 * main option labels so the wizard reads as outcomes instead of
 * implementation detail.
 */
const prompts = require("@clack/prompts");
const { questionMessage } = require("../../lib/brand.js");

const BEHAVIOR_DEFS = [
  {
    key: "loadContext",
    event: "SessionStart",
    label: "Load project context",
    hint: "Shows stories, dirty files, and recent commits at the start of a session.",
  },
  {
    key: "babysitDefault",
    event: "SessionStart",
    label: "Enable guidance on start",
    hint: "Inject your configured guidance preferences at the start of every session.",
  },
  {
    key: "damageControlBash",
    event: "PreToolUse",
    label: "Block risky commands",
    hint: "Warns before dangerous shell commands.",
  },
  {
    key: "damageControlEdit",
    event: "PreToolUse",
    label: "Protect sensitive edits",
    hint: "Warns before editing protected files.",
  },
  {
    key: "damageControlWrite",
    event: "PreToolUse",
    label: "Protect sensitive writes",
    hint: "Warns before writing protected files.",
  },
  {
    key: "preCompactState",
    event: "PostCompact",
    label: "Preserve context on start",
    hint: "Re-inject story, command, and git state after compaction so nothing is lost.",
  },
];

const BEHAVIOR_KEYS = BEHAVIOR_DEFS.map((def) => def.key);

/**
 * @param {Record<string, boolean> | undefined} behaviors
 * @param {Set<string> | string[] | undefined} supportedHookEvents
 * @returns {Record<string, boolean>}
 */
function normalizeBehaviorsForEvents(
  behaviors = {},
  supportedHookEvents = new Set(),
) {
  const supported =
    supportedHookEvents instanceof Set
      ? supportedHookEvents
      : new Set(supportedHookEvents || []);
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const def of BEHAVIOR_DEFS) {
    out[def.key] =
      Boolean(behaviors && behaviors[def.key]) && supported.has(def.event);
  }
  return out;
}

/**
 * @param {Record<string, boolean> | undefined} currentBehaviors
 * @param {Set<string> | string[] | undefined} supportedHookEvents
 * @returns {Promise<Record<string, boolean>>}
 */
async function pickBehaviors(
  currentBehaviors = {},
  supportedHookEvents = new Set(),
) {
  const supported =
    supportedHookEvents instanceof Set
      ? supportedHookEvents
      : new Set(supportedHookEvents || []);
  const options = BEHAVIOR_DEFS.filter((def) => supported.has(def.event)).map(
    (def) => ({
      value: def.key,
      label: def.label,
      hint: def.hint,
    }),
  );

  const initialValues = options
    .filter((option) =>
      Boolean(currentBehaviors && currentBehaviors[option.value]),
    )
    .map((option) => option.value);

  const choice = await prompts.multiselect({
    message: questionMessage("Which behaviors should AgileFlow enable?"),
    options,
    initialValues,
    required: false,
  });

  if (prompts.isCancel(choice)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const selected = new Set(/** @type {string[]} */ (choice));
  /** @type {Record<string, boolean>} */
  const next = {};
  for (const key of BEHAVIOR_KEYS) {
    next[key] = selected.has(key);
  }
  return normalizeBehaviorsForEvents(next, supported);
}

module.exports = {
  BEHAVIOR_DEFS,
  normalizeBehaviorsForEvents,
  pickBehaviors,
};
