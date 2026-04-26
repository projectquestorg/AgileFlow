/**
 * Behaviors picker — curated multiselect for the 4 hook-driven presets.
 *
 * Behaviors map 1:N to hooks declared in plugin manifests via the
 * `behavior: <key>` field. Disabling a behavior here excludes its hooks
 * from the generated `.agileflow/hook-manifest.yaml` at install time.
 *
 * Pure logic lives in `buildBehaviorsMap()` so it can be unit-tested
 * without spawning a TTY.
 */
const prompts = require("@clack/prompts");

/**
 * @typedef {import('../../runtime/config/defaults.js').Behaviors} Behaviors
 */

/** Stable list of presets surfaced in the wizard, in display order. */
const BEHAVIOR_OPTIONS = [
  {
    key: "loadContext",
    label: "Load project context at session start",
    hint: "SessionStart hook prints stories, dirty files, and recent commits so Claude has project context immediately.",
  },
  {
    key: "babysitDefault",
    label: "Activate Babysit mentor by default",
    hint: "SessionStart hook injects the mentor pattern so Claude defaults to mentor mode without /agileflow:babysit.",
  },
  {
    key: "damageControl",
    label: "Damage control on Bash, Edit, Write",
    hint: "PreToolUse hooks block dangerous commands (rm -rf /, fork bombs) and risky writes (.env, .ssh/) — fail-closed.",
  },
  {
    key: "preCompactState",
    label: "Save context before compaction",
    hint: "PreCompact hook dumps active stories, current command, and dirty git state so they survive compaction.",
  },
];

/**
 * Build a complete Behaviors map from a set of selected keys, falling
 * back to current values for any key not represented in the selection
 * input. Missing keys default to `false` (the user actively saw the
 * option and chose not to enable it).
 *
 * @param {Iterable<string>} selectedKeys
 * @returns {Behaviors}
 */
function buildBehaviorsMap(selectedKeys) {
  const set = new Set(selectedKeys);
  /** @type {Behaviors} */
  const result = {
    loadContext: set.has("loadContext"),
    babysitDefault: set.has("babysitDefault"),
    damageControl: set.has("damageControl"),
    preCompactState: set.has("preCompactState"),
  };
  return result;
}

/**
 * Pre-check options whose keys are currently enabled (or — when no
 * existing config — fall back to the preset's enabledByDefault). The
 * default-on shape lives in `defaults.js`; this just reads it.
 *
 * @param {Partial<Behaviors>} [current]
 * @returns {string[]}
 */
function initialSelectedKeys(current) {
  if (!current) return BEHAVIOR_OPTIONS.map((o) => o.key);
  return BEHAVIOR_OPTIONS.filter((o) => current[o.key] !== false).map(
    (o) => o.key,
  );
}

/**
 * Interactive picker. Returns a complete Behaviors object.
 *
 * @param {Partial<Behaviors>} [currentBehaviors]
 * @returns {Promise<Behaviors>}
 */
async function pickBehaviors(currentBehaviors) {
  const picked = await prompts.multiselect({
    message: "Which behaviors should AgileFlow run? (Recommended: all)",
    options: BEHAVIOR_OPTIONS.map((o) => ({
      value: o.key,
      label: o.label,
      hint: o.hint,
    })),
    initialValues: initialSelectedKeys(currentBehaviors),
    required: false,
  });

  if (prompts.isCancel(picked)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  return buildBehaviorsMap(/** @type {string[]} */ (picked));
}

module.exports = {
  pickBehaviors,
  buildBehaviorsMap,
  initialSelectedKeys,
  BEHAVIOR_OPTIONS,
};
