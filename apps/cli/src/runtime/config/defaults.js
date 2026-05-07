/**
 * Default user config.
 *
 * Returned when `agileflow.config.json` is absent. Also merged into
 * user-supplied config so missing sections get sensible defaults.
 *
 * @typedef {Object} PluginEntry
 * @property {boolean} enabled
 * @property {Record<string, unknown>} [settings]
 *
 * @typedef {Object} Behaviors
 * @property {boolean} loadContext         - SessionStart context dump
 * @property {boolean} babysitDefault      - HARD mentor mode at SessionStart
 * @property {boolean} damageControlBash   - PreToolUse guard on Bash
 * @property {boolean} damageControlEdit   - PreToolUse guard on Edit
 * @property {boolean} damageControlWrite  - PreToolUse guard on Write
 * @property {boolean} preCompactState     - PreCompact state preservation
 *
 * @typedef {Object} AgileflowConfig
 * @property {1} version
 * @property {Record<string, PluginEntry>} plugins
 * @property {Record<string, { enabled?: boolean, timeout?: number, skipOnError?: boolean }>} hooks
 * @property {{ scope: 'project' | 'global' }} install
 * @property {Behaviors} behaviors
 * @property {{ enabled: boolean }} learnings
 * @property {{ primary?: string, targets: Array<'claude-code'|'cursor'|'windsurf'|'codex'|'antigravity'> }} ide
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
    install: {
      scope: "project",
    },
    behaviors: {
      // Behaviors are presets that map to one or more hooks. The
      // wizard surfaces these as a curated multiselect; advanced
      // users can override individual hooks via the `hooks:` map.
      loadContext: true,
      babysitDefault: true,
      damageControlBash: true,
      damageControlEdit: true,
      damageControlWrite: true,
      preCompactState: true,
    },
    learnings: {
      // Global on/off for the skill self-improvement system. When false,
      // install-time scaffolding is skipped and no learnings hint is
      // injected into the session prompt — the `agileflow learn` CLI
      // still works for users who want to manually append signals.
      enabled: true,
    },
    ide: {
      targets: ["claude-code"],
    },
    language: "en",
  };
}

module.exports = { defaultConfig };
