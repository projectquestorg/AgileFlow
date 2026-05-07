/**
 * Behaviors picker — one prompt per behavior so each gets its own
 * decision point, plus a sub-multiselect for damage-control tools so
 * users can keep Bash blocking while loosening Edit/Write (or vice
 * versa).
 *
 * Each behavior maps 1:N to hooks declared in plugin manifests via
 * `behavior: <key>`. Disabling a behavior excludes its hooks from the
 * generated `.agileflow/hook-manifest.yaml` at install time.
 *
 * Pure logic lives in `buildBehaviorsMap()` so it can be unit-tested
 * without spawning a TTY.
 */
const prompts = require("@clack/prompts");
const chalk = require("chalk");
const { questionMessage } = require("../../lib/brand.js");

/**
 * @typedef {import('../../runtime/config/defaults.js').Behaviors} Behaviors
 */

/** Stable list of presets surfaced in the wizard, in display order. */
const BEHAVIOR_OPTIONS = [
  {
    key: "loadContext",
    label: "Load project context",
    hint: "Show stories, dirty files, and recent commits at session start.",
  },
  {
    key: "babysitDefault",
    label: "Enable guidance on start",
    hint: "Inject your configured guidance preferences at the start of every session.",
  },
  {
    key: "preCompactState",
    label: "Preserve context on start",
    hint: "Re-inject story, command, and git state after compaction so nothing is lost.",
  },
];

const DAMAGE_CONTROL_TOOLS = [
  {
    key: "damageControlBash",
    label: "Bash",
    hint: "Block risky shell commands.",
  },
  {
    key: "damageControlEdit",
    label: "Edit",
    hint: "Block edits to sensitive paths.",
  },
  {
    key: "damageControlWrite",
    label: "Write",
    hint: "Block writes to sensitive paths.",
  },
];

/**
 * Build a complete Behaviors map from a partial set of toggles. Missing
 * keys fall back to `false` (the user actively saw the option and chose
 * not to enable it).
 *
 * @param {Partial<Behaviors>} input
 * @returns {Behaviors}
 */
function buildBehaviorsMap(input) {
  return {
    loadContext: Boolean(input.loadContext),
    babysitDefault: Boolean(input.babysitDefault),
    damageControlBash: Boolean(input.damageControlBash),
    damageControlEdit: Boolean(input.damageControlEdit),
    damageControlWrite: Boolean(input.damageControlWrite),
    preCompactState: Boolean(input.preCompactState),
  };
}

/**
 * Initial value lookup: respect existing config, else fall back to
 * "default-on" — every behavior is enabled out of the box.
 *
 * @param {Partial<Behaviors>|undefined} current
 * @param {string} key
 * @returns {boolean}
 */
function initialFor(current, key) {
  if (!current) return true;
  return current[key] !== false;
}

/**
 * @param {Set<string>|string[]|undefined} supportedHookEvents
 * @param {string} event
 * @returns {boolean}
 */
function supportsEvent(supportedHookEvents, event) {
  if (!supportedHookEvents) return true;
  if (Array.isArray(supportedHookEvents))
    return supportedHookEvents.includes(event);
  return supportedHookEvents.has(event);
}

/**
 * Normalize a behaviors object against the supported hook events for the
 * active IDE targets.
 *
 * Unsupported behaviors are forced to false so the resulting config does
 * not advertise hooks the selected IDEs cannot run.
 *
 * @param {Partial<Behaviors>} input
 * @param {Set<string>|string[]|undefined} supportedHookEvents
 * @returns {Behaviors}
 */
function normalizeBehaviorsForEvents(input, supportedHookEvents) {
  return buildBehaviorsMap({
    loadContext: supportsEvent(supportedHookEvents, "SessionStart")
      ? input.loadContext
      : false,
    babysitDefault: supportsEvent(supportedHookEvents, "SessionStart")
      ? input.babysitDefault
      : false,
    damageControlBash: supportsEvent(supportedHookEvents, "PreToolUse")
      ? input.damageControlBash
      : false,
    damageControlEdit: supportsEvent(supportedHookEvents, "PreToolUse")
      ? input.damageControlEdit
      : false,
    damageControlWrite: supportsEvent(supportedHookEvents, "PreToolUse")
      ? input.damageControlWrite
      : false,
    preCompactState: supportsEvent(supportedHookEvents, "PostCompact")
      ? input.preCompactState
      : false,
  });
}

/**
 * Wrap each Clack prompt to handle Ctrl+C / Esc consistently.
 *
 * @template T
 * @param {T | symbol} value
 * @returns {T}
 */
function ensureNotCancelled(value) {
  if (prompts.isCancel(value)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }
  return /** @type {T} */ (value);
}

/**
 * Interactive picker. Asks one question per behavior, with a follow-up
 * multiselect for damage control when enabled.
 *
 * @param {Partial<Behaviors>} [currentBehaviors]
 * @param {Set<string>|string[]} [supportedHookEvents]
 * @returns {Promise<Behaviors>}
 */
async function pickBehaviors(currentBehaviors, supportedHookEvents) {
  /** @type {Partial<Behaviors>} */
  const result = {};

  const supportsSessionStart = supportsEvent(
    supportedHookEvents,
    "SessionStart",
  );
  const supportsPreCompact = supportsEvent(supportedHookEvents, "PostCompact");
  const supportsPreToolUse = supportsEvent(supportedHookEvents, "PreToolUse");

  if (supportsSessionStart) {
    for (const opt of BEHAVIOR_OPTIONS.filter(
      (o) => o.key !== "preCompactState",
    )) {
      const choice = ensureNotCancelled(
        await prompts.confirm({
          message: questionMessage(opt.label, opt.hint),
          initialValue: initialFor(currentBehaviors, opt.key),
        }),
      );
      result[opt.key] = Boolean(choice);
    }
  } else {
    result.loadContext = false;
    result.babysitDefault = false;
  }

  if (supportsPreCompact) {
    const opt = BEHAVIOR_OPTIONS.find((o) => o.key === "preCompactState");
    const choice = ensureNotCancelled(
      await prompts.confirm({
        message: questionMessage(opt.label, opt.hint),
        initialValue: initialFor(currentBehaviors, opt.key),
      }),
    );
    result[opt.key] = Boolean(choice);
  } else {
    result.preCompactState = false;
  }

  if (supportsPreToolUse) {
    // Damage control: master toggle, then per-tool sub-toggles when on.
    const anyDamageOn =
      initialFor(currentBehaviors, "damageControlBash") ||
      initialFor(currentBehaviors, "damageControlEdit") ||
      initialFor(currentBehaviors, "damageControlWrite");

    const damageOn = ensureNotCancelled(
      await prompts.confirm({
        message: questionMessage(
          "Enable damage control hooks",
          "Block risky Bash, Edit, and Write actions before they run.",
        ),
        initialValue: anyDamageOn,
      }),
    );

    if (!damageOn) {
      result.damageControlBash = false;
      result.damageControlEdit = false;
      result.damageControlWrite = false;
    } else {
      const initialTools = DAMAGE_CONTROL_TOOLS.filter((t) =>
        initialFor(currentBehaviors, t.key),
      ).map((t) => t.key);

      const picked = ensureNotCancelled(
        await prompts.multiselect({
          message: questionMessage("Which tools should be guarded?"),
          options: DAMAGE_CONTROL_TOOLS.map((t) => ({
            value: t.key,
            label: chalk.bold(t.label),
            hint: t.hint,
          })),
          initialValues: initialTools.length
            ? initialTools
            : DAMAGE_CONTROL_TOOLS.map((t) => t.key),
          required: false,
        }),
      );
      const set = new Set(/** @type {string[]} */ (picked));
      for (const t of DAMAGE_CONTROL_TOOLS) {
        result[t.key] = set.has(t.key);
      }
    }
  } else {
    result.damageControlBash = false;
    result.damageControlEdit = false;
    result.damageControlWrite = false;
  }

  return normalizeBehaviorsForEvents(result, supportedHookEvents);
}

module.exports = {
  pickBehaviors,
  buildBehaviorsMap,
  BEHAVIOR_OPTIONS,
  DAMAGE_CONTROL_TOOLS,
  supportsEvent,
  normalizeBehaviorsForEvents,
};
