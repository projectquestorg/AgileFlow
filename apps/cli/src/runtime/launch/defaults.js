/**
 * Default preferences for `agileflow launch`.
 *
 * `launch-prefs.json` is the first user-level config in v4 (lives under
 * `~/.agileflow/`). Returned when the file is absent and merged into a
 * partial user file so missing keys take sensible values.
 *
 * @typedef {Object} LaunchCliPrefs
 * @property {string} preferred                     - CLI to invoke by default
 * @property {string[]} fallbackOrder               - order to try if preferred is missing
 *
 * @typedef {Object} LaunchTmuxPrefs
 * @property {boolean} enabled                      - false skips tmux entirely
 * @property {'top' | 'bottom'} statusPosition      - tmux status-position value
 *
 * @typedef {Object} LaunchKeybindPrefs
 * @property {'default' | 'minimal' | 'none'} preset - keybind preset name
 *
 * @typedef {Object} LaunchAliasPref
 * @property {boolean} enabled  - install `af` symlink to ~/.local/bin/af
 *
 * @typedef {Object} LaunchAliasesPrefs
 * @property {LaunchAliasPref} af
 *
 * @typedef {Object} LaunchPrefs
 * @property {1} version
 * @property {LaunchCliPrefs} cli
 * @property {LaunchTmuxPrefs} tmux
 * @property {LaunchKeybindPrefs} keybinds
 * @property {LaunchAliasesPrefs} aliases
 * @property {string[]} pinned                      - reserved for slice 3 (pinning UI)
 * @property {string} [lastUpdated]                 - ISO timestamp stamped by writePrefs
 */

const KNOWN_CLI_IDS = ["claude", "codex", "cursor-agent", "aider"];
const STATUS_POSITIONS = ["top", "bottom"];
const KEYBIND_PRESETS = ["default", "minimal", "none"];

/** @returns {LaunchPrefs} */
function defaultPrefs() {
  return {
    version: 1,
    cli: {
      preferred: "claude",
      fallbackOrder: [...KNOWN_CLI_IDS],
    },
    tmux: {
      enabled: true,
      statusPosition: "bottom",
    },
    keybinds: {
      preset: "default",
    },
    aliases: {
      af: { enabled: false },
    },
    pinned: [],
  };
}

module.exports = {
  defaultPrefs,
  KNOWN_CLI_IDS,
  STATUS_POSITIONS,
  KEYBIND_PRESETS,
};
