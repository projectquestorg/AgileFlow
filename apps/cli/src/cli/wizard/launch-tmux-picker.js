/**
 * tmux preferences picker for `agileflow launch setup`.
 *
 * Asks:
 *   1. tmux on/off (confirm)
 *   2. if on: status bar position (top/bottom)
 *   3. if on: keybind preset (default/minimal/none)
 *
 * Left/right status positions are NOT offered in slice 1 — tmux doesn't
 * have a native left/right status; faking it requires pane layout
 * hackery, which is a slice 2+ concern.
 *
 * Returned shape is exactly the `tmux` + `keybinds` blocks of LaunchPrefs.
 */
const prompts = require("@clack/prompts");
const { questionMessage } = require("../../lib/brand.js");
const {
  STATUS_POSITIONS,
  KEYBIND_PRESETS,
} = require("../../runtime/launch/defaults.js");

/**
 * Pure helper: build the status-position select options. Extracted for
 * unit testing — the labels need to stay aligned with STATUS_POSITIONS.
 *
 * @param {string} current
 * @returns {{ options: { value: string, label: string }[], initialValue: string }}
 */
function buildStatusOptions(current) {
  const options = STATUS_POSITIONS.map((id) => ({
    value: id,
    label: id === "top" ? "Top of terminal" : "Bottom of terminal",
  }));
  const initialValue = STATUS_POSITIONS.includes(current) ? current : "bottom";
  return { options, initialValue };
}

/**
 * Pure helper: keybind preset options.
 *
 * @param {string} current
 * @returns {{ options: { value: string, label: string, hint?: string }[], initialValue: string }}
 */
function buildKeybindOptions(current) {
  const options = [
    {
      value: "default",
      label: "Default",
      hint: "Worktree (Alt+N), same-dir (Alt+S), freeze recovery (Alt+k/K/R), detach (Alt+q)",
    },
    {
      value: "minimal",
      label: "Minimal",
      hint: "Only detach (Alt+q). Lets your existing tmux config shine.",
    },
    {
      value: "none",
      label: "None",
      hint: "No keybinds installed. You wire your own.",
    },
  ];
  const initialValue = KEYBIND_PRESETS.includes(current) ? current : "default";
  return { options, initialValue };
}

/**
 * @param {{ tmux: { enabled: boolean, statusPosition: string }, keybinds: { preset: string } }} currentPrefs
 * @returns {Promise<{ tmux: { enabled: boolean, statusPosition: 'top' | 'bottom' }, keybinds: { preset: string } }>}
 */
async function pickTmux(currentPrefs) {
  const enabledRaw = await prompts.confirm({
    message: questionMessage(
      "Run sessions inside tmux?",
      "tmux gives you persistent sessions, parallel panes, and freeze recovery. " +
        "Disable if you're on Windows or prefer plain shell.",
    ),
    initialValue:
      typeof currentPrefs.tmux.enabled === "boolean"
        ? currentPrefs.tmux.enabled
        : true,
  });

  if (prompts.isCancel(enabledRaw)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const enabled = /** @type {boolean} */ (enabledRaw);

  if (!enabled) {
    return {
      tmux: {
        enabled: false,
        statusPosition: /** @type {'bottom'} */ ("bottom"),
      },
      keybinds: { preset: "none" },
    };
  }

  const statusOpts = buildStatusOptions(currentPrefs.tmux.statusPosition);
  const statusRaw = await prompts.select({
    message: questionMessage("Where should the tmux status bar live?"),
    options: statusOpts.options,
    initialValue: statusOpts.initialValue,
  });

  if (prompts.isCancel(statusRaw)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  const keybindOpts = buildKeybindOptions(currentPrefs.keybinds.preset);
  const presetRaw = await prompts.select({
    message: questionMessage("Which keybind preset?"),
    options: keybindOpts.options,
    initialValue: keybindOpts.initialValue,
  });

  if (prompts.isCancel(presetRaw)) {
    prompts.cancel("Setup cancelled. No changes made.");
    process.exit(1);
  }

  return {
    tmux: {
      enabled: true,
      statusPosition: /** @type {'top' | 'bottom'} */ (statusRaw),
    },
    keybinds: { preset: /** @type {string} */ (presetRaw) },
  };
}

module.exports = { pickTmux, buildStatusOptions, buildKeybindOptions };
