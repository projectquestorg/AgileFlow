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
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const schema = require("./schema.json");
const { defaultConfig } = require("./defaults.js");

const CONFIG_FILENAME = "agileflow.config.json";

const ajv = new Ajv({ allErrors: true, useDefaults: false, strict: false });
const validate = ajv.compile(schema);

/**
 * Migrate older config shapes into the current schema before validation.
 * This keeps `agileflow setup` usable across alpha bumps even when a
 * project already has an older config checked in.
 *
 * @param {any} parsed
 * @returns {any}
 */
function migrateLegacyConfig(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const migrated = { ...parsed };

  if (
    migrated.behaviors &&
    typeof migrated.behaviors === "object" &&
    !Array.isArray(migrated.behaviors)
  ) {
    const behaviors = { ...migrated.behaviors };
    if (Object.prototype.hasOwnProperty.call(behaviors, "damageControl")) {
      const damageControl = Boolean(behaviors.damageControl);
      delete behaviors.damageControl;
      behaviors.damageControlBash = damageControl;
      behaviors.damageControlEdit = damageControl;
      behaviors.damageControlWrite = damageControl;
    }
    migrated.behaviors = behaviors;
  }

  if (
    migrated.ide &&
    typeof migrated.ide === "object" &&
    !Array.isArray(migrated.ide)
  ) {
    const ide = { ...migrated.ide };
    if (!Array.isArray(ide.targets) || ide.targets.length === 0) {
      if (typeof ide.primary === "string") {
        ide.targets = [ide.primary];
      }
    }
    migrated.ide = ide;
  }

  return migrated;
}

/**
 * Shallow-merge user config on top of defaults. `plugins` and `hooks`
 * sub-objects are deep-merged at one level so that partial user configs
 * don't wipe defaults.
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
    install: { ...defaults.install, ...(user.install || {}) },
    behaviors: { ...defaults.behaviors, ...(user.behaviors || {}) },
    learnings: { ...defaults.learnings, ...(user.learnings || {}) },
    ide: mergeIde(defaults.ide, user.ide),
    language: user.language ?? defaults.language,
  };
}

/**
 * Merge user `ide` block onto defaults, normalizing legacy `primary` into
 * `targets`. Old configs (alpha.1 / alpha.2) shipped only `primary`; we
 * migrate them in-memory so a single re-install moves them onto the new
 * shape without forcing the user to hand-edit JSON.
 *
 * @param {{ targets: string[], primary?: string }} defaultsIde
 * @param {{ targets?: string[], primary?: string } | undefined} userIde
 * @returns {{ targets: string[], primary?: string }}
 */
function mergeIde(defaultsIde, userIde) {
  const merged = { ...defaultsIde, ...(userIde || {}) };
  if (!Array.isArray(merged.targets) || merged.targets.length === 0) {
    merged.targets =
      typeof merged.primary === "string"
        ? [merged.primary]
        : [...defaultsIde.targets];
  }
  return merged;
}

/**
 * Format Ajv errors as a single human-readable message with JSON Pointers.
 * @param {import('ajv').ErrorObject[]} errors
 * @returns {string}
 */
function formatSchemaErrors(errors) {
  return errors
    .map((e) => `  • ${e.instancePath || "/"} ${e.message}`)
    .join("\n");
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
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return Object.freeze({
        config: Object.freeze(defaultConfig()),
        path: null,
        source: "defaults",
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

  parsed = migrateLegacyConfig(parsed);

  if (!validate(parsed)) {
    const details = formatSchemaErrors(validate.errors || []);
    throw new Error(`Config validation failed for ${configPath}:\n${details}`);
  }

  const merged = mergeConfig(defaultConfig(), parsed);
  // Core plugin cannot be disabled — enforce at load time.
  merged.plugins.core = { ...merged.plugins.core, enabled: true };

  return Object.freeze({
    config: Object.freeze(merged),
    path: configPath,
    source: "file",
  });
}

module.exports = {
  CONFIG_FILENAME,
  loadConfig,
  mergeConfig,
  formatSchemaErrors,
};
