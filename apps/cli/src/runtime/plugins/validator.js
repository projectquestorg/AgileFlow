/**
 * Strict plugin.yaml validator.
 *
 * Layered on top of `registry.js::loadPlugin`, which already does
 * lightweight YAML-parse + required-field checks. The strict validator
 * adds quality / consistency rules that we want to enforce in CI and in
 * the upcoming `agileflow doctor` command, but which we don't want to
 * fail on at first-load (so a slightly nonconforming third-party plugin
 * still partially loads for diagnostic purposes).
 *
 * Returns an array of `Issue` objects. Empty array means valid.
 */

/**
 * @typedef {Object} Issue
 * @property {'error' | 'warning'} severity
 * @property {string} pluginId
 * @property {string} message
 *
 * @typedef {import('./registry.js').PluginManifest} PluginManifest
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Permissive semver: MAJOR.MINOR.PATCH with optional -prerelease and +build.
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** @type {ReadonlySet<string>} */
const VALID_PROVIDES_KEYS = new Set([
  'commands',
  'skills',
  'agents',
  'hooks',
  'templates',
]);

/**
 * Validate a single plugin manifest. Pure: no I/O.
 *
 * @param {PluginManifest} plugin
 * @returns {Issue[]}
 */
function validatePlugin(plugin) {
  /** @type {Issue[]} */
  const issues = [];
  const id = plugin && typeof plugin.id === 'string' ? plugin.id : '<unknown>';

  const error = (msg) => issues.push({ severity: 'error', pluginId: id, message: msg });
  const warn = (msg) => issues.push({ severity: 'warning', pluginId: id, message: msg });

  if (!plugin || typeof plugin !== 'object') {
    return [{ severity: 'error', pluginId: id, message: 'Plugin manifest is not an object.' }];
  }

  // id format
  if (typeof plugin.id !== 'string') {
    error('`id` must be a string.');
  } else if (!ID_PATTERN.test(plugin.id)) {
    error(
      `\`id\` "${plugin.id}" must match /^[a-z0-9][a-z0-9-]{0,63}$/ (lowercase, kebab-case, max 64 chars).`,
    );
  }

  // name
  if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
    error('`name` must be a non-empty string.');
  }

  // description
  if (typeof plugin.description !== 'string' || !plugin.description.trim()) {
    error('`description` must be a non-empty string.');
  } else if (plugin.description.length < 16) {
    warn('`description` is very short — aim for at least one meaningful sentence.');
  }

  // version
  if (typeof plugin.version !== 'string') {
    error('`version` must be a string (semver).');
  } else if (!SEMVER_PATTERN.test(plugin.version)) {
    error(`\`version\` "${plugin.version}" must be a valid semver (MAJOR.MINOR.PATCH).`);
  }

  // booleans
  if (typeof plugin.enabledByDefault !== 'boolean') {
    error('`enabledByDefault` must be a boolean.');
  }
  if (typeof plugin.cannotDisable !== 'boolean') {
    error('`cannotDisable` must be a boolean.');
  }

  // cannotDisable implies enabledByDefault
  if (plugin.cannotDisable === true && plugin.enabledByDefault === false) {
    error('A plugin with `cannotDisable: true` must also have `enabledByDefault: true`.');
  }

  // depends
  if (!Array.isArray(plugin.depends)) {
    error('`depends` must be an array of plugin ids.');
  } else {
    for (const dep of plugin.depends) {
      if (typeof dep !== 'string' || !ID_PATTERN.test(dep)) {
        error(`\`depends\` entry ${JSON.stringify(dep)} must be a valid plugin id.`);
      }
      if (typeof dep === 'string' && dep === plugin.id) {
        error('A plugin cannot depend on itself.');
      }
    }
    const seen = new Set();
    for (const dep of plugin.depends) {
      if (typeof dep === 'string') {
        if (seen.has(dep)) {
          warn(`Duplicate dependency "${dep}" in \`depends\` (deduplicate).`);
        }
        seen.add(dep);
      }
    }
  }

  // provides — allowed shape
  if (plugin.provides != null) {
    if (typeof plugin.provides !== 'object' || Array.isArray(plugin.provides)) {
      error('`provides` must be an object with arrays of commands/skills/agents/hooks/templates.');
    } else {
      for (const key of Object.keys(plugin.provides)) {
        if (!VALID_PROVIDES_KEYS.has(key)) {
          warn(`\`provides.${key}\` is not a recognized key — expected one of: ${[...VALID_PROVIDES_KEYS].join(', ')}.`);
        }
      }
      for (const key of VALID_PROVIDES_KEYS) {
        const v = plugin.provides[key];
        if (v != null && !Array.isArray(v)) {
          error(`\`provides.${key}\` must be an array (got ${typeof v}).`);
        }
      }
    }
  }

  return issues;
}

/**
 * Validate all plugins together, including cross-plugin invariants:
 *   - unique ids (registry already detects this, but we double-check)
 *   - depends references resolve to known ids
 *
 * @param {PluginManifest[]} plugins
 * @returns {Issue[]}
 */
function validatePluginSet(plugins) {
  /** @type {Issue[]} */
  const issues = [];
  for (const p of plugins) {
    issues.push(...validatePlugin(p));
  }
  const ids = new Set();
  for (const p of plugins) {
    if (typeof p.id === 'string') {
      if (ids.has(p.id)) {
        issues.push({
          severity: 'error',
          pluginId: p.id,
          message: `Duplicate plugin id "${p.id}".`,
        });
      }
      ids.add(p.id);
    }
  }
  for (const p of plugins) {
    for (const dep of p.depends || []) {
      if (typeof dep === 'string' && !ids.has(dep)) {
        issues.push({
          severity: 'error',
          pluginId: p.id,
          message: `Depends on unknown plugin "${dep}".`,
        });
      }
    }
  }
  return issues;
}

/**
 * @param {Issue[]} issues
 * @returns {boolean}
 */
function hasErrors(issues) {
  return issues.some((i) => i.severity === 'error');
}

module.exports = {
  validatePlugin,
  validatePluginSet,
  hasErrors,
  ID_PATTERN,
  SEMVER_PATTERN,
};
