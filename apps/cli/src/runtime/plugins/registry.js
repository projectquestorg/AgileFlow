/**
 * Plugin registry — discovers plugin manifests under apps/cli/content/plugins/.
 *
 * Phase 2a scope: discover + shallow-validate plugin.yaml. Full validation
 * (depends resolution, cycle detection, command/skill cross-refs) lands
 * with the full validator in Phase 2b.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PLUGINS_DIR = path.join(__dirname, '..', '..', '..', 'content', 'plugins');

const REQUIRED_FIELDS = ['id', 'name', 'description', 'version'];

/**
 * @typedef {Object} PluginManifest
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {boolean} [enabledByDefault]
 * @property {boolean} [cannotDisable]
 * @property {string[]} [depends]
 * @property {{
 *   commands?: object[],
 *   skills?: object[],
 *   agents?: object[],
 *   hooks?: object[],
 *   templates?: object[],
 * }} [provides]
 * @property {string} dir - absolute path of the plugin directory (computed)
 */

/**
 * Parse and validate a single plugin.yaml.
 * @param {string} pluginDir
 * @returns {PluginManifest}
 */
function loadPlugin(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.yaml');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing plugin.yaml at ${pluginDir}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read ${manifestPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${manifestPath}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Empty or non-object plugin.yaml at ${manifestPath}`);
  }
  const missing = REQUIRED_FIELDS.filter((k) => parsed[k] == null);
  if (missing.length) {
    throw new Error(
      `Plugin ${path.basename(pluginDir)} missing required fields: ${missing.join(', ')}`,
    );
  }
  // `depends` is optional, but if present it MUST be an array — silently
  // coercing `depends: "core"` to `[]` would drop the author's intent.
  let depends = [];
  if (parsed.depends != null) {
    if (!Array.isArray(parsed.depends)) {
      throw new Error(
        `Plugin ${path.basename(pluginDir)}: 'depends' must be an array of plugin ids (got ${typeof parsed.depends})`,
      );
    }
    depends = parsed.depends;
  }
  return {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    version: parsed.version,
    enabledByDefault: Boolean(parsed.enabledByDefault),
    cannotDisable: Boolean(parsed.cannotDisable),
    depends,
    provides: parsed.provides || {
      commands: [],
      skills: [],
      agents: [],
      hooks: [],
      templates: [],
    },
    dir: pluginDir,
  };
}

/**
 * Discover all plugins in the bundled content/plugins/ directory.
 * @param {string} [root=PLUGINS_DIR]
 * @returns {PluginManifest[]} sorted: required (cannotDisable) first, then alpha by id
 */
function discoverPlugins(root = PLUGINS_DIR) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const plugins = entries
    .filter((e) => e.isDirectory())
    .map((e) => loadPlugin(path.join(root, e.name)));
  plugins.sort((a, b) => {
    if (a.cannotDisable !== b.cannotDisable) {
      return a.cannotDisable ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
  const ids = new Set();
  for (const p of plugins) {
    if (ids.has(p.id)) {
      throw new Error(`Duplicate plugin id: ${p.id}`);
    }
    ids.add(p.id);
  }
  return plugins;
}

/**
 * @param {string} id
 * @param {string} [root=PLUGINS_DIR]
 * @returns {PluginManifest|null}
 */
function getPlugin(id, root = PLUGINS_DIR) {
  return discoverPlugins(root).find((p) => p.id === id) || null;
}

module.exports = { discoverPlugins, getPlugin, loadPlugin, PLUGINS_DIR };
