/**
 * Hook manifest loader.
 *
 * Reads `.agileflow/hook-manifest.yaml` and returns a normalized array
 * of hook entries. Schema:
 *
 *   version: 1
 *   hooks:
 *     - id: babysit-clear-restore
 *       event: SessionStart
 *       script: .agileflow/plugins/core/hooks/babysit-clear-restore.js
 *       runAfter: []                   # optional, default []
 *       timeout: 5000                  # optional, default 10000 ms
 *       skipOnError: true              # optional, default true
 *       enabled: true                  # optional, default true
 *
 * Returns null when the file does not exist (treated as "no hooks
 * registered" by callers). Throws with a clear message on invalid
 * YAML or schema violations — partial/silent acceptance is the
 * v3 anti-pattern that caused the cascade failures we're fixing.
 */
const fs = require('fs');
const yaml = require('js-yaml');

/** @type {ReadonlySet<string>} */
const VALID_EVENTS = new Set([
  'SessionStart',
  'PreCompact',
  'Stop',
  'PreToolUse:Bash',
  'PreToolUse:Edit',
  'PreToolUse:Write',
]);

const MANIFEST_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @typedef {Object} HookEntry
 * @property {string} id
 * @property {string} event
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
 * Validate one raw hook entry from YAML.
 * @param {*} raw
 * @param {number} index - position in the manifest, used for error messages
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
      `hook[${index} (${raw.id})].event must be one of: ${[...VALID_EVENTS].join(', ')}`,
    );
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
  return { id: raw.id, event: raw.event, script: raw.script, runAfter, timeout, skipOnError, enabled };
}

/**
 * Parse a manifest object from any source (YAML string, parsed object).
 * Used both by `loadHookManifest` and by the installer when aggregating
 * plugin-supplied hooks at install time.
 *
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
  /** @type {HookEntry[]} */
  const hooks = parsed.hooks.map(normalizeHook);
  // Reject duplicate ids — uniqueness is required for runAfter resolution.
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
 * @returns {Promise<HookManifest|null>} null when the file does not exist
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
  MANIFEST_VERSION,
  DEFAULT_TIMEOUT_MS,
};
