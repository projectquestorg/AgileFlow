/**
 * Hook manifest loader.
 *
 * Reads `.agileflow/hook-manifest.yaml` and returns a normalized array
 * of hook entries. Schema:
 *
 *   version: 1
 *   hooks:
 *     - id: damage-control-bash
 *       event: PreToolUse              # one of VALID_EVENTS
 *       matcher: Bash                  # optional; only meaningful on tool events
 *       script: .agileflow/plugins/core/hooks/damage-control-bash.js
 *       runAfter: []                   # optional, default []
 *       timeout: 3000                  # optional, default 10000 ms
 *       skipOnError: false             # optional, default true
 *       enabled: true                  # optional, default true
 *
 * Returns null when the file does not exist (treated as "no hooks
 * registered" by callers). Throws with a clear message on invalid
 * YAML or schema violations — partial/silent acceptance is the v3
 * anti-pattern that caused the cascade failures we're fixing.
 *
 * Event list mirrors the official Claude Code hooks reference
 * (https://code.claude.com/docs/en/hooks); kept in sync manually.
 * The docs grow over time — when a new event lands, add it here.
 */
const fs = require('fs');
const yaml = require('js-yaml');

/** @type {ReadonlySet<string>} */
const VALID_EVENTS = new Set([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PreToolUse',
  'PermissionRequest',
  'PermissionDenied',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'PreCompact',
  'PostCompact',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'InstructionsLoaded',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'WorktreeCreate',
  'WorktreeRemove',
  'Notification',
  'Elicitation',
  'ElicitationResult',
]);

/**
 * Events that support a `matcher` field (per the Claude Code docs).
 * Specifying a `matcher` on any other event is a manifest error.
 * @type {ReadonlySet<string>}
 */
const MATCHER_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
]);

const MANIFEST_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @typedef {Object} HookEntry
 * @property {string} id
 * @property {string} event
 * @property {string|null} matcher
 * @property {string} script
 * @property {string[]} runAfter
 * @property {number} timeout
 * @property {boolean} skipOnError
 * @property {boolean} enabled
 *
 * @typedef {Object} HookManifest
 * @property {1} version
 * @property {HookEntry[]} hooks
 */

/**
 * @param {*} raw
 * @param {number} index
 * @returns {HookEntry}
 */
function normalizeHook(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`hook[${index}] must be an object`);
  }
  if (typeof raw.id !== 'string' || !raw.id) {
    throw new Error(`hook[${index}].id must be a non-empty string`);
  }
  if (typeof raw.event !== 'string' || !VALID_EVENTS.has(raw.event)) {
    throw new Error(
      `hook[${index} (${raw.id})].event must be one of: ${[...VALID_EVENTS].sort().join(', ')}`,
    );
  }
  /** @type {string|null} */
  let matcher = null;
  if (raw.matcher != null) {
    if (typeof raw.matcher !== 'string') {
      throw new Error(`hook[${raw.id}].matcher must be a string`);
    }
    if (!MATCHER_EVENTS.has(raw.event)) {
      throw new Error(
        `hook[${raw.id}].matcher is not allowed on event "${raw.event}"; matcher is only valid on tool-related events: ${[...MATCHER_EVENTS].join(', ')}`,
      );
    }
    matcher = raw.matcher;
  }
  if (typeof raw.script !== 'string' || !raw.script) {
    throw new Error(`hook[${index} (${raw.id})].script must be a non-empty string`);
  }
  let runAfter = [];
  if (raw.runAfter != null) {
    if (!Array.isArray(raw.runAfter)) {
      throw new Error(`hook[${raw.id}].runAfter must be an array`);
    }
    for (const dep of raw.runAfter) {
      if (typeof dep !== 'string' || !dep) {
        throw new Error(`hook[${raw.id}].runAfter contains invalid entry: ${JSON.stringify(dep)}`);
      }
    }
    runAfter = raw.runAfter;
  }
  let timeout = DEFAULT_TIMEOUT_MS;
  if (raw.timeout != null) {
    if (typeof raw.timeout !== 'number' || !Number.isFinite(raw.timeout) || raw.timeout < 0) {
      throw new Error(`hook[${raw.id}].timeout must be a non-negative number (ms)`);
    }
    timeout = raw.timeout;
  }
  let skipOnError = true;
  if (raw.skipOnError != null) {
    if (typeof raw.skipOnError !== 'boolean') {
      throw new Error(`hook[${raw.id}].skipOnError must be a boolean`);
    }
    skipOnError = raw.skipOnError;
  }
  let enabled = true;
  if (raw.enabled != null) {
    if (typeof raw.enabled !== 'boolean') {
      throw new Error(`hook[${raw.id}].enabled must be a boolean`);
    }
    enabled = raw.enabled;
  }
  return {
    id: raw.id,
    event: raw.event,
    matcher,
    script: raw.script,
    runAfter,
    timeout,
    skipOnError,
    enabled,
  };
}

/**
 * @param {*} parsed
 * @returns {HookManifest}
 */
function normalizeManifest(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('hook manifest must be an object');
  }
  if (parsed.version !== MANIFEST_VERSION) {
    throw new Error(
      `hook manifest version must be ${MANIFEST_VERSION}, got ${JSON.stringify(parsed.version)}`,
    );
  }
  if (!Array.isArray(parsed.hooks)) {
    throw new Error('hook manifest `hooks` must be an array');
  }
  const hooks = parsed.hooks.map(normalizeHook);
  const seen = new Set();
  for (const h of hooks) {
    if (seen.has(h.id)) {
      throw new Error(`duplicate hook id: ${h.id}`);
    }
    seen.add(h.id);
  }
  return { version: MANIFEST_VERSION, hooks };
}

/**
 * @param {string} manifestPath
 * @returns {Promise<HookManifest|null>}
 */
async function loadHookManifest(manifestPath) {
  let raw;
  try {
    raw = await fs.promises.readFile(manifestPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${manifestPath}: ${err.message}`);
  }
  return normalizeManifest(parsed);
}

module.exports = {
  loadHookManifest,
  normalizeManifest,
  normalizeHook,
  VALID_EVENTS,
  MATCHER_EVENTS,
  MANIFEST_VERSION,
  DEFAULT_TIMEOUT_MS,
};
