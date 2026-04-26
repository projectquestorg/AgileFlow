/**
 * Default user config.
 *
 * Returned when `agileflow.config.json` is absent. Also merged into
 * user-supplied config so missing sections get sensible defaults.
 *
 * @typedef {Object} Personalization
 * @property {'concise'|'detailed'|'teaching'} tone
 * @property {'none'|'decision_points'|'always'} ask_level
 * @property {'low'|'medium'|'high'} verbosity
 *
 * @typedef {Object} PluginEntry
 * @property {boolean} enabled
 * @property {Record<string, unknown>} [settings]
 *
 * @typedef {Object} Behaviors
 * @property {boolean} loadContext       - SessionStart context dump
 * @property {boolean} babysitDefault    - HARD mentor mode at SessionStart
 * @property {boolean} damageControl     - PreToolUse guards on Bash/Edit/Write
 * @property {boolean} preCompactState   - PreCompact state preservation
 *
 * @typedef {Object} AgileflowConfig
 * @property {1} version
 * @property {Record<string, PluginEntry>} plugins
 * @property {Record<string, { enabled?: boolean, timeout?: number, skipOnError?: boolean }>} hooks
 * @property {Behaviors} behaviors
 * @property {Personalization} personalization
 * @property {{ primary: 'claude-code'|'cursor'|'windsurf'|'codex' }} ide
 * @property {string} language
 */

/** @returns {AgileflowConfig} */
function defaultConfig() {
  return {
    version: 1,
    plugins: {
      core: { enabled: true },
    },
    hooks: {},
    behaviors: {
      // Behaviors are presets that map to one or more hooks. The
      // wizard surfaces these as a curated multiselect; advanced
      // users can override individual hooks via the `hooks:` map.
      loadContext: true,
      babysitDefault: true,
      damageControl: true,
      preCompactState: true,
    },
    personalization: {
      tone: "concise",
      ask_level: "decision_points",
      verbosity: "medium",
    },
    ide: {
      primary: "claude-code",
    },
    language: "en",
  };
}

module.exports = { defaultConfig };
