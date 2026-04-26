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
const {
  writeAggregatedManifest,
  removeAggregatedManifest,
} = require('../hooks/aggregator.js');
const { capabilitiesFor } = require('../ide/capabilities.js');
const {
  writeClaudeCodeSettings,
  removeClaudeCodeSettings,
} = require('../ide/claude-code-settings.js');
const {
  mirrorClaudeCodeSkills,
  unmirrorClaudeCodeSkills,
} = require('../ide/claude-code-skills.js');

/**
 * @typedef {import('../plugins/registry.js').PluginManifest} PluginManifest
 *
 * @typedef {Object} InstallOptions
 * @property {PluginManifest[]} discovered
 * @property {Iterable<string>} userSelected
 * @property {string} agileflowDir - target install root (typically `<cwd>/.agileflow`)
 * @property {string} cliVersion - written into the file index header
 * @property {string} [ide='claude-code'] - target IDE for capability gating
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
    ide = 'claude-code',
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

  // 4-6 wrapped in try/finally so the file index is ALWAYS persisted,
  // even if a sync fails mid-loop. Otherwise on-disk files would exist
  // without index entries and the next run would misclassify them as
  // "user-modified" and stash them.
  const ops = emptyCounters();
  const timestamp = makeTimestamp();
  /** @type {string[]} */
  let removed = [];

  try {
    // 4. Sync each plugin in order.
    for (const plugin of ordered) {
      await installOnePlugin(plugin, agileflowDir, fileIndex, ops, timestamp, force);
    }

    // 5. Remove disabled plugin directories.
    const enabledIds = new Set(ordered.map((p) => p.id));
    const knownIds = new Set(discovered.map((p) => p.id));
    removed = await removeDisabledPlugins(
      enabledIds,
      knownIds,
      agileflowDir,
      fileIndex,
      ops,
    );
  } finally {
    // 6. Persist the file index. Always.
    await writeFileIndex(indexPath, fileIndex);
  }

  // 7. Write or remove the aggregated hook manifest based on IDE
  //    capabilities. Hooks are Claude Code only today; switching to a
  //    non-hook IDE removes any stale manifest so the orchestrator
  //    never runs hooks that won't fire from the IDE.
  const caps = capabilitiesFor(ide);
  let hookManifestPath = null;
  if (caps.hooks) {
    hookManifestPath = await writeAggregatedManifest(ordered, agileflowDir);
  } else {
    await removeAggregatedManifest(agileflowDir);
  }

  // 8. Register or unregister our hook dispatchers in
  //    `.claude/settings.json` so Claude Code actually invokes them.
  //    Only when ide=claude-code; other IDEs get their stale entries
  //    cleaned up.
  const projectRoot = path.dirname(agileflowDir);
  let settingsPath = null;
  if (ide === 'claude-code') {
    settingsPath = await writeClaudeCodeSettings(projectRoot);
  } else {
    await removeClaudeCodeSettings(projectRoot);
  }

  // 9. Mirror skills into `.claude/skills/<id>/` so Claude Code
  //    discovers them. Plugin-source skills live under
  //    `.agileflow/plugins/<id>/skills/...` (sync-engine-managed) but
  //    Claude Code's discovery mechanism uses `.claude/skills/`. We
  //    copy (not symlink) for Windows portability.
  let skillsMirrored = [];
  let skillsPruned = [];
  if (caps.skills) {
    const r = await mirrorClaudeCodeSkills(ordered, projectRoot);
    skillsMirrored = r.mirrored;
    skillsPruned = r.pruned;
  } else {
    skillsPruned = await unmirrorClaudeCodeSkills(projectRoot);
  }

  return {
    ordered: ordered.map((p) => p.id),
    autoEnabled,
    removed,
    ops,
    agileflowDir,
    indexPath,
    timestamp,
    hookManifestPath,
    settingsPath,
    skillsMirrored,
    skillsPruned,
    ide,
  };
}

module.exports = { installPlugins };
