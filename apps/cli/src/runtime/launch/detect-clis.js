/**
 * Detect which AI CLIs are installed on the user's PATH.
 *
 * `agileflow launch` wraps whichever CLI the user has chosen — but the
 * onboarding picker should only offer options that actually resolve.
 * This module owns the canonical list of known AI CLIs and the routine
 * that filters it against the system.
 *
 * `commandExists` is injectable so tests don't shell out.
 */
const { commandExists: realCommandExists } = require("../../lib/path-check.js");

/**
 * @typedef {Object} CliDescriptor
 * @property {string} id     - stable id used in launch-prefs.json
 * @property {string} bin    - binary name on PATH
 * @property {string} label  - human-readable name for pickers
 * @property {string} hint   - one-line description shown in pickers
 */

/** @type {CliDescriptor[]} */
const KNOWN_CLIS = [
  {
    id: "claude",
    bin: "claude",
    label: "Claude Code",
    hint: "Anthropic's official terminal CLI",
  },
  {
    id: "codex",
    bin: "codex",
    label: "OpenAI Codex CLI",
    hint: "OpenAI's terminal coding agent",
  },
  {
    id: "cursor-agent",
    bin: "cursor-agent",
    label: "Cursor Agent",
    hint: "Cursor's standalone CLI agent",
  },
  {
    id: "aider",
    bin: "aider",
    label: "Aider",
    hint: "Open-source pair programming CLI",
  },
];

/**
 * Return descriptors for CLIs whose binary resolves on PATH.
 *
 * @param {(name: string) => boolean} [exists] - injectable for tests
 * @returns {CliDescriptor[]}
 */
function availableClis(exists = realCommandExists) {
  return KNOWN_CLIS.filter((c) => exists(c.bin));
}

/**
 * Find a descriptor by id. Returns null if unknown.
 *
 * @param {string} id
 * @returns {CliDescriptor | null}
 */
function findCli(id) {
  return KNOWN_CLIS.find((c) => c.id === id) || null;
}

module.exports = { KNOWN_CLIS, availableClis, findCli };
