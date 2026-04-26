/**
 * `installPlugins` — end-to-end orchestrator that wires the plugin
 * registry, validator, resolver, and sync engine into a single call.
 *
 * Flow:
 *   1. Strict-validate every discovered plugin (errors → throw with
 *      a flat report; warnings ignored here, surfaced by `doctor`).
 *   2. Resolve transitive dependencies + topological order from the
 *      user's selection (resolver throws on cycles or missing deps).
 *   3. Read the existing `_cfg/files.json` (or build a fresh index).
 *   4. For each resolved plugin, walk its source directory and
 *      `syncFile` every file into `<agileflowDir>/plugins/<id>/...`.
 *   5. Remove directories of previously-installed plugins that are no
 *      longer enabled. Their entries are also pruned from the file
 *      index.
 *   6. Write the file index atomically.
 *
 * Side effects only on the destination project. The bundled `content/`
 * source tree is read-only.
 */
const fs = require('fs');
const path = require('path');

const { syncFile, emptyCounters } = require('./sync-engine.js');
const {
  emptyIndex,
  readFileIndex,
  writeFileIndex,
} = require('./file-index.js');
const { resolvePlugins } = require('../plugins/resolver.js');
const {
  validatePluginSet,
  hasErrors,
} = require('../plugins/validator.js');

/**
 * @typedef {import('../plugins/registry.js').PluginManifest} PluginManifest
 *
 * @typedef {Object} InstallOptions
 * @property {PluginManifest[]} discovered
 * @property {Iterable<string>} userSelected
 * @property {string} agileflowDir - target install root (typically `<cwd>/.agileflow`)
 * @property {string} cliVersion - written into the file index header
 * @property {boolean} [force=false] - overwrite user modifications
 *
 * @typedef {Object} InstallResult
 * @property {string[]} ordered - plugin ids in install order
 * @property {string[]} autoEnabled - ids pulled in via depends
 * @property {string[]} removed - ids whose dir was removed (no longer enabled)
 * @property {import('./sync-engine.js').FileOpsCounters} ops
 * @property {string} agileflowDir
 * @property {string} indexPath
 * @property {string} timestamp
 */

/**
 * Build a stable file-system-safe timestamp string for stash bucketing.
 * @returns {string}
 */
function makeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** @param {string} p */
function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Yield absolute paths to every file under `dir`, depth-first.
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walkFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkFiles(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

/**
 * Sync every file in `plugin.dir` into `agileflowDir/plugins/<id>/...`.
 *
 * @param {PluginManifest} plugin
 * @param {string} agileflowDir
 * @param {import('./file-index.js').FileIndex} fileIndex
 * @param {import('./sync-engine.js').FileOpsCounters} ops
 * @param {string} timestamp
 * @param {boolean} force
 */
async function installOnePlugin(plugin, agileflowDir, fileIndex, ops, timestamp, force) {
  const cfgDir = path.join(agileflowDir, '_cfg');
  const pluginRoot = path.join(agileflowDir, 'plugins', plugin.id);

  for await (const sourcePath of walkFiles(plugin.dir)) {
    const relInPlugin = path.relative(plugin.dir, sourcePath);
    const dest = path.join(pluginRoot, relInPlugin);
    const relativePath = toPosix(path.relative(agileflowDir, dest));
    const content = await fs.promises.readFile(sourcePath);
    await syncFile({
      content,
      dest,
      relativePath,
      fileIndex,
      cfgDir,
      timestamp,
      force,
      ops,
    });
  }
}

/**
 * Remove plugin directories for plugins that were previously installed
 * (have entries in the file index under `plugins/<id>/...`) but are
 * NOT in the currently enabled set. Their file index entries are also
 * pruned so a future re-enable produces fresh CREATED records.
 *
 * @param {Set<string>} enabledIds
 * @param {Set<string>} knownIds - all discovered ids (so we don't blow
 *   away unknown directories the user might have placed manually)
 * @param {string} agileflowDir
 * @param {import('./file-index.js').FileIndex} fileIndex
 * @param {import('./sync-engine.js').FileOpsCounters} ops
 * @returns {Promise<string[]>} the plugin ids that were removed
 */
async function removeDisabledPlugins(enabledIds, knownIds, agileflowDir, fileIndex, ops) {
  const pluginsRoot = path.join(agileflowDir, 'plugins');
  /** @type {string[]} */
  const removed = [];
  let entries;
  try {
    entries = await fs.promises.readdir(pluginsRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return removed;
    throw err;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    if (enabledIds.has(id)) continue;
    if (!knownIds.has(id)) continue; // leave unknown dirs alone
    const dir = path.join(pluginsRoot, id);
    await fs.promises.rm(dir, { recursive: true, force: true });
    for (const key of Object.keys(fileIndex.files)) {
      if (key.startsWith(`plugins/${id}/`)) {
        delete fileIndex.files[key];
      }
    }
    removed.push(id);
    ops.removed++;
  }
  return removed;
}

/**
 * @param {InstallOptions} options
 * @returns {Promise<InstallResult>}
 */
async function installPlugins(options) {
  const {
    discovered,
    userSelected,
    agileflowDir,
    cliVersion,
    force = false,
  } = options;

  // 1. Strict-validate. Errors abort; warnings are surfaced elsewhere.
  const issues = validatePluginSet(discovered);
  if (hasErrors(issues)) {
    const errors = issues
      .filter((i) => i.severity === 'error')
      .map((i) => `  ${i.pluginId}: ${i.message}`)
      .join('\n');
    throw new Error(`Plugin validation failed:\n${errors}`);
  }

  // 2. Resolve dependency order.
  const { ordered, autoEnabled } = resolvePlugins(discovered, userSelected);

  // 3. Read or seed the file index.
  const cfgDir = path.join(agileflowDir, '_cfg');
  const indexPath = path.join(cfgDir, 'files.json');
  const fileIndex = (await readFileIndex(indexPath)) || emptyIndex(cliVersion);

  // 4. Sync each plugin in order.
  const ops = emptyCounters();
  const timestamp = makeTimestamp();
  for (const plugin of ordered) {
    await installOnePlugin(plugin, agileflowDir, fileIndex, ops, timestamp, force);
  }

  // 5. Remove disabled plugin directories.
  const enabledIds = new Set(ordered.map((p) => p.id));
  const knownIds = new Set(discovered.map((p) => p.id));
  const removed = await removeDisabledPlugins(
    enabledIds,
    knownIds,
    agileflowDir,
    fileIndex,
    ops,
  );

  // 6. Persist the file index.
  await writeFileIndex(indexPath, fileIndex);

  return {
    ordered: ordered.map((p) => p.id),
    autoEnabled,
    removed,
    ops,
    agileflowDir,
    indexPath,
    timestamp,
  };
}

module.exports = { installPlugins };
