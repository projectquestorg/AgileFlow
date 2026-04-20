/**
 * Unified config loader for AgileFlow v4.
 *
 * Reads `agileflow.config.json` from a project root, validates against the
 * JSON Schema, merges with defaults, and returns a frozen config object.
 *
 * Missing file → returns defaults (not an error — first-run case).
 * Invalid JSON → throws with the file path.
 * Schema violation → throws with a JSON Pointer to the offending field.
 */
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const schema = require('./schema.json');
const { defaultConfig } = require('./defaults.js');

const CONFIG_FILENAME = 'agileflow.config.json';

const ajv = new Ajv({ allErrors: true, useDefaults: false, strict: false });
const validate = ajv.compile(schema);

/**
 * Shallow-merge user config on top of defaults. `plugins`, `hooks`, and
 * `personalization` sub-objects are deep-merged at one level so that
 * partial user configs don't wipe defaults.
 *
 * @param {import('./defaults.js').AgileflowConfig} defaults
 * @param {Partial<import('./defaults.js').AgileflowConfig>} user
 * @returns {import('./defaults.js').AgileflowConfig}
 */
function mergeConfig(defaults, user) {
  return {
    version: user.version ?? defaults.version,
    plugins: { ...defaults.plugins, ...(user.plugins || {}) },
    hooks: { ...defaults.hooks, ...(user.hooks || {}) },
    personalization: {
      ...defaults.personalization,
      ...(user.personalization || {}),
    },
    ide: { ...defaults.ide, ...(user.ide || {}) },
    language: user.language ?? defaults.language,
  };
}

/**
 * Format Ajv errors as a single human-readable message with JSON Pointers.
 * @param {import('ajv').ErrorObject[]} errors
 * @returns {string}
 */
function formatSchemaErrors(errors) {
  return errors
    .map((e) => `  • ${e.instancePath || '/'} ${e.message}`)
    .join('\n');
}

/**
 * Load config from the given project root.
 *
 * @param {string} cwd - project root directory
 * @returns {Promise<{
 *   config: import('./defaults.js').AgileflowConfig,
 *   path: string | null,
 *   source: 'file' | 'defaults'
 * }>}
 */
async function loadConfig(cwd) {
  const configPath = path.join(cwd, CONFIG_FILENAME);

  // Read directly and treat ENOENT as "no config → use defaults". This
  // eliminates the existsSync-then-readFileSync TOCTOU window; between
  // the two calls another process could delete the file and the user
  // would get a misleading "Failed to read" error instead of defaults.
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return Object.freeze({
        config: Object.freeze(defaultConfig()),
        path: null,
        source: 'defaults',
      });
    }
    throw new Error(`Failed to read ${configPath}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${configPath}: ${err.message}`);
  }

  if (!validate(parsed)) {
    const details = formatSchemaErrors(validate.errors || []);
    throw new Error(
      `Config validation failed for ${configPath}:\n${details}`,
    );
  }

  const merged = mergeConfig(defaultConfig(), parsed);
  // Core plugin cannot be disabled — enforce at load time.
  merged.plugins.core = { ...merged.plugins.core, enabled: true };

  return Object.freeze({
    config: Object.freeze(merged),
    path: configPath,
    source: 'file',
  });
}

module.exports = {
  CONFIG_FILENAME,
  loadConfig,
  mergeConfig,
  formatSchemaErrors,
};
