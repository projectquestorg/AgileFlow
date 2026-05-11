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
const fs = require("fs");
const path = require("path");

const { syncFile, emptyCounters } = require("./sync-engine.js");
const {
  emptyIndex,
  readFileIndex,
  writeFileIndex,
} = require("./file-index.js");
const { resolvePlugins } = require("../plugins/resolver.js");
const { validatePluginSet, hasErrors } = require("../plugins/validator.js");
const {
  writeAggregatedManifest,
  removeAggregatedManifest,
  buildHookManifest,
} = require("../hooks/aggregator.js");
const { normalizeManifest } = require("../hooks/manifest-loader.js");
const { capabilitiesFor, SUPPORTED_IDES } = require("../ide/capabilities.js");
const {
  writeClaudeCodeSettings,
  removeClaudeCodeSettings,
} = require("../ide/claude-code-settings.js");
const {
  writeCodexConfig,
  removeCodexConfig,
} = require("../ide/codex-config.js");
const {
  mirrorClaudeCodeSkills,
  unmirrorClaudeCodeSkills,
} = require("../ide/claude-code-skills.js");
const {
  mirrorClaudeCodeCommands,
  mirrorClaudeCodeAgents,
  unmirrorClaudeCodeCommands,
  unmirrorClaudeCodeAgents,
} = require("../ide/claude-code-content.js");
const { loadSkill } = require("../skills/validator.js");
const {
  resolveSkillsDir,
  resolveLearnFile,
} = require("../skills/learnings.js");

/**
 * @typedef {import('../plugins/registry.js').PluginManifest} PluginManifest
 *
 * @typedef {Object} InstallOptions
 * @property {PluginManifest[]} discovered
 * @property {Iterable<string>} userSelected
 * @property {string} agileflowDir - target install root (typically `<cwd>/.agileflow`)
 * @property {string} cliVersion - written into the file index header
 * @property {string} [ide='claude-code'] - DEPRECATED single-target shorthand (use `ides`)
 * @property {string[]} [ides] - target IDEs for capability gating; takes precedence over `ide`
 * @property {Record<string, boolean>} [behaviors] - behavior preset toggles
 * @property {boolean} [learningsEnabled=true] - global learnings on/off
 * @property {boolean} [force=false] - overwrite user modifications
 * @property {import('../config/defaults.js').AgileflowConfig} [config] - merged config used for skill rendering
 *
 * @typedef {Object} InstallResult
 * @property {string[]} ordered - plugin ids in install order
 * @property {string[]} autoEnabled - ids pulled in via depends
 * @property {string[]} removed - ids whose dir was removed (no longer enabled)
 * @property {import('./sync-engine.js').FileOpsCounters} ops
 * @property {string} agileflowDir
 * @property {string} indexPath
 * @property {string} timestamp
 * @property {string|null} hookManifestPath - path of the written hook manifest, or null
 * @property {string|null} settingsPath - path of the written .claude/settings.json, or null
 * @property {string|null} codexConfigPath - path of the written .codex/config.toml, or null
 * @property {string[]} skillsMirrored - skill ids copied across all skill-supporting IDEs
 * @property {string[]} skillsPruned - skill ids removed from skill dirs
 * @property {Array<{skillId:string, error:string}>} [skillsSkipped] - skills with missing source
 * @property {string[]} commandsMirrored - Claude Code slash commands mirrored from enabled plugins
 * @property {string[]} agentsMirrored - Claude Code subagents mirrored from enabled plugins
 * @property {Array<{id:string, error:string}>} [commandsSkipped] - commands with missing source
 * @property {Array<{id:string, error:string}>} [agentsSkipped] - agents with missing source
 * @property {string[]} learningsScaffolded - skill ids whose learnings file was newly created
 * @property {string[]} ides - the target IDEs for this install
 */

/**
 * Build a stable file-system-safe timestamp string for stash bucketing.
 * @returns {string}
 */
function makeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** @param {string} p */
function toPosix(p) {
  return p.split(path.sep).join("/");
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
async function installOnePlugin(
  plugin,
  agileflowDir,
  fileIndex,
  ops,
  timestamp,
  force,
) {
  const cfgDir = path.join(agileflowDir, "_cfg");
  const pluginRoot = path.join(agileflowDir, "plugins", plugin.id);

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
async function removeDisabledPlugins(
  enabledIds,
  knownIds,
  agileflowDir,
  fileIndex,
  ops,
) {
  const pluginsRoot = path.join(agileflowDir, "plugins");
  /** @type {string[]} */
  const removed = [];
  let entries;
  try {
    entries = await fs.promises.readdir(pluginsRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return removed;
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
 * Scaffold `_learnings/<file>.yaml` files for every skill in the ordered
 * plugin set whose frontmatter declares `learns.enabled: true`. Idempotent:
 * existing files are left untouched.
 *
 * @param {PluginManifest[]} ordered
 * @param {string} projectRoot
 * @returns {Promise<string[]>} skill ids whose learnings file was newly created
 */
async function scaffoldSkillLearnings(ordered, projectRoot) {
  /** @type {string[]} */
  const created = [];
  const skillsDir = resolveSkillsDir(projectRoot);
  for (const plugin of ordered) {
    const skills = (plugin.provides && plugin.provides.skills) || [];
    for (const s of skills) {
      const skillDir = s && s.dir ? path.join(plugin.dir, s.dir) : null;
      if (!skillDir) continue;
      const skillPath = path.join(skillDir, "SKILL.md");
      let manifest;
      try {
        manifest = await loadSkill(skillPath);
      } catch {
        continue; // validator will surface the load failure separately
      }
      const fm = manifest.frontmatter;
      if (!fm || !fm.learns || fm.learns.enabled !== true) continue;
      const learnFile =
        typeof fm.learns.file === "string" && fm.learns.file
          ? fm.learns.file
          : undefined;
      const p = resolveLearnFile(skillsDir, manifest.skillId, learnFile);
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      try {
        await fs.promises.access(p);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
        const header = `# AgileFlow skill learnings — ${manifest.skillId}\n# Append-only signals; oldest trimmed when count exceeds maxEntries.\nentries: []\n`;
        await fs.promises.writeFile(p, header, "utf8");
        created.push(manifest.skillId);
      }
    }
  }
  return created;
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
    ide,
    ides,
    behaviors,
    learningsEnabled = true,
    force = false,
    config,
  } = options;

  // Resolve the multi-target list. Prefer `ides` (new); fall back to
  // `ide` (legacy single-target callers — including current tests).
  /** @type {string[]} */
  const targetIdes =
    Array.isArray(ides) && ides.length
      ? ides
      : typeof ide === "string" && ide
        ? [ide]
        : ["claude-code"];
  // Per-target capabilities; first target is the "primary" used to
  // decide hook-manifest / settings.json writes.
  const primaryIde = targetIdes[0];

  // 1. Strict-validate. Errors abort; warnings are surfaced elsewhere.
  const issues = validatePluginSet(discovered);
  if (hasErrors(issues)) {
    const errors = issues
      .filter((i) => i.severity === "error")
      .map((i) => `  ${i.pluginId}: ${i.message}`)
      .join("\n");
    throw new Error(`Plugin validation failed:\n${errors}`);
  }

  // 2. Resolve dependency order.
  const { ordered, autoEnabled } = resolvePlugins(discovered, userSelected);

  // 3. Read or seed the file index.
  const cfgDir = path.join(agileflowDir, "_cfg");
  const indexPath = path.join(cfgDir, "files.json");
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
      await installOnePlugin(
        plugin,
        agileflowDir,
        fileIndex,
        ops,
        timestamp,
        force,
      );
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

  // 7. Validate-before-write: build the manifest in memory and run
  //    the loader's normalizer against it. Surfacing an invalid plugin
  //    contribution NOW prevents step 8 from registering hook
  //    dispatchers in settings.json that point at an unparseable
  //    manifest.
  //
  //    Hook manifest is a global artifact (only one .agileflow/
  //    hook-manifest.yaml exists per project). We write it whenever ANY
  //    selected target supports hooks; otherwise we remove any stale
  //    manifest from a prior hook-capable install.
  const targetCaps = targetIdes.map((id) => ({
    id,
    caps: capabilitiesFor(id),
  }));
  const anyHooks = targetCaps.some(({ caps }) => caps.hooks);
  let hookManifestPath = null;
  if (anyHooks) {
    const manifestObj = buildHookManifest(ordered, behaviors);
    try {
      normalizeManifest(manifestObj);
    } catch (err) {
      throw new Error(`Hook manifest validation failed: ${err.message}`);
    }
    hookManifestPath = await writeAggregatedManifest(
      ordered,
      agileflowDir,
      behaviors,
    );
  } else {
    await removeAggregatedManifest(agileflowDir);
  }

  // 8. Register hook dispatchers in `.claude/settings.json` iff
  //    claude-code is in the target set; otherwise remove any prior
  //    registration we may have written.
  const projectRoot = path.dirname(agileflowDir);
  let settingsPath = null;
  let commandsMirrored = [];
  let agentsMirrored = [];
  let commandsSkipped = [];
  let agentsSkipped = [];
  if (targetIdes.includes("claude-code")) {
    settingsPath = await writeClaudeCodeSettings(projectRoot);
    const commandMirror = await mirrorClaudeCodeCommands(ordered, projectRoot);
    const agentMirror = await mirrorClaudeCodeAgents(ordered, projectRoot);
    commandsMirrored = commandMirror.mirrored;
    agentsMirrored = agentMirror.mirrored;
    commandsSkipped = commandMirror.skipped;
    agentsSkipped = agentMirror.skipped;
  } else {
    await removeClaudeCodeSettings(projectRoot);
    await unmirrorClaudeCodeCommands(projectRoot);
    await unmirrorClaudeCodeAgents(projectRoot);
  }

  let codexConfigPath = null;
  if (targetIdes.includes("codex")) {
    codexConfigPath = await writeCodexConfig(projectRoot);
  } else {
    await removeCodexConfig(projectRoot);
  }

  // 9. Mirror skills into EACH selected IDE's skills dir. For IDEs that
  //    don't support skills, unmirror so a previous install doesn't
  //    leave stale files behind.
  /** @type {Set<string>} */
  const mirroredSet = new Set();
  /** @type {Set<string>} */
  const prunedSet = new Set();
  /** @type {Array<{skillId:string, error:string}>} */
  let skillsSkipped = [];
  for (const target of targetCaps) {
    const { caps } = target;
    if (caps.skills) {
      const r = await mirrorClaudeCodeSkills(
        ordered,
        projectRoot,
        caps.skillsDir,
        {
          targetIde: target.id,
          config,
        },
      );
      r.mirrored.forEach((s) => mirroredSet.add(s));
      r.pruned.forEach((s) => prunedSet.add(s));
      if (r.skipped) skillsSkipped = skillsSkipped.concat(r.skipped);
    } else {
      const removed = await unmirrorClaudeCodeSkills(
        projectRoot,
        caps.skillsDir,
      );
      removed.forEach((s) => prunedSet.add(s));
    }
  }
  // Also unmirror from any *unselected* IDE's skills dir so a
  // re-install with a narrower target set actually removes the old
  // mirrors. Cheap belt-and-suspenders — unmirror is a no-op when the
  // dir doesn't exist.
  for (const id of SUPPORTED_IDES) {
    if (targetIdes.includes(id)) continue;
    const caps = capabilitiesFor(id);
    const removed = await unmirrorClaudeCodeSkills(projectRoot, caps.skillsDir);
    removed.forEach((s) => prunedSet.add(s));
  }
  const skillsMirrored = [...mirroredSet];
  const skillsPruned = [...prunedSet];
  const anySkills = targetCaps.some(({ caps }) => caps.skills);

  // 10. Scaffold persistent learnings files for skills that opt in.
  //     Lives in .agileflow/skills/_learnings/ — outside the mirror wipe
  //     zone so re-installs never destroy accumulated signals.
  const learningsScaffolded =
    anySkills && learningsEnabled
      ? await scaffoldSkillLearnings(ordered, projectRoot)
      : [];

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
    codexConfigPath,
    skillsMirrored,
    skillsPruned,
    skillsSkipped,
    commandsMirrored,
    agentsMirrored,
    commandsSkipped,
    agentsSkipped,
    learningsScaffolded,
    ides: targetIdes,
    // Back-compat: keep `ide` as the primary so existing callers /
    // test assertions keep working without a sweep.
    ide: primaryIde,
  };
}

module.exports = { installPlugins };
