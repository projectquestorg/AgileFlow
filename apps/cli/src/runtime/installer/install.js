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
  mirrorClaudeCodeAgents,
  unmirrorClaudeCodeAgents,
} = require("../ide/claude-code-content.js");
const {
  writeAgentsMd,
  ensureClaudeMdImport,
  injectAgentPrefs,
} = require("../ide/agents-md.js");
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
 * @property {string[]} agentsMirrored - Claude Code subagents mirrored from enabled plugins
 * @property {Array<{id:string, error:string}>} [agentsSkipped] - agents with missing source
 * @property {string[]} [agentsPrefsInjected] - agent .md files that had the managed prefs block written/refreshed
 * @property {string} [agentsMdPath] - absolute path of the written canonical AGENTS.md
 * @property {string} [claudeMdPath] - absolute path of the CLAUDE.md carrying the @AGENTS.md import
 * @property {string[]} docsScaffolded - doc dirs created on first install
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
 * Standard docs folder layout that AgileFlow expects at the project root.
 * Only created on first install (dirs that already exist are skipped).
 */
const DOCS_DIRS = [
  "docs/00-meta",
  "docs/01-brainstorming",
  "docs/02-practices",
  "docs/03-decisions",
  "docs/04-architecture",
  "docs/05-epics",
  "docs/06-stories",
  "docs/07-testing",
  "docs/08-project",
  "docs/09-agents",
  "docs/10-research",
];

/**
 * Scaffold the project docs folder on first install.
 * Returns the list of dirs that were newly created.
 * @param {string} projectRoot
 * @returns {Promise<string[]>}
 */
async function scaffoldDocs(projectRoot) {
  const created = [];
  for (const rel of DOCS_DIRS) {
    const dir = path.join(projectRoot, rel);
    try {
      await fs.promises.access(dir);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      await fs.promises.mkdir(dir, { recursive: true });
      created.push(rel);
    }
  }

  // Seed docs/09-agents/status.json only when newly created.
  if (created.includes("docs/09-agents")) {
    const statusPath = path.join(projectRoot, "docs/09-agents/status.json");
    const seed = JSON.stringify(
      { updated: new Date().toISOString(), epics: {}, stories: {} },
      null,
      2,
    );
    await fs.promises.writeFile(statusPath, seed + "\n", "utf8");
  }

  // Seed docs/00-meta/agileflow-metadata.json only when newly created.
  if (created.includes("docs/00-meta")) {
    const metaPath = path.join(
      projectRoot,
      "docs/00-meta/agileflow-metadata.json",
    );
    const seed = JSON.stringify(
      {
        version: "4.0.0",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        docsFolder: "docs",
        archival: { threshold_days: 30, enabled: true },
        features: {},
      },
      null,
      2,
    );
    await fs.promises.writeFile(metaPath, seed + "\n", "utf8");
  }

  return created;
}

/**
 * @param {InstallOptions} options
 * @returns {Promise<InstallResult>}
 */
/**
 * A stale install lock older than this is assumed abandoned (a crashed
 * install) and stolen, so a single crash can't wedge every future install.
 */
const STALE_LOCK_MS = 60000;

/**
 * Acquire an advisory install lock so two concurrent `agileflow setup`
 * runs against the same project can't race their read-modify-write file
 * operations (AGENTS.md, CLAUDE.md, agent .md files, files.json) and
 * silently clobber each other. Fails fast with a clear message when a
 * live lock is held; steals a stale one.
 *
 * @param {string} cfgDir - the `.agileflow/_cfg` directory
 * @returns {Promise<() => Promise<void>>} release function (idempotent)
 */
async function acquireInstallLock(cfgDir) {
  const lockPath = path.join(cfgDir, "install.lock");
  await fs.promises.mkdir(cfgDir, { recursive: true });
  const payload = JSON.stringify({
    pid: process.pid,
    at: new Date().toISOString(),
  });
  try {
    await fs.promises.writeFile(lockPath, payload, { flag: "wx" });
  } catch (err) {
    if (!err || err.code !== "EEXIST") throw err;
    // Lock exists. Steal it only if it looks abandoned.
    let stale = false;
    try {
      const st = await fs.promises.stat(lockPath);
      stale = Date.now() - st.mtimeMs > STALE_LOCK_MS;
    } catch {
      stale = true; // vanished under us — treat as free
    }
    if (!stale) {
      throw new Error(
        `another agileflow install appears to be in progress (lock: ${lockPath}). ` +
          `If no other install is running, delete that file and retry.`,
      );
    }
    await fs.promises.writeFile(lockPath, payload, { flag: "w" });
  }
  return async function release() {
    try {
      await fs.promises.unlink(lockPath);
    } catch {
      /* already gone — release is best-effort */
    }
  };
}

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

  // Validate BEFORE acquiring the lock or touching the filesystem, so a bad
  // plugin set fails fast without creating any .agileflow artifacts. runInstall
  // re-validates (cheap, read-only) as its own step 1.
  const preIssues = validatePluginSet(discovered);
  if (hasErrors(preIssues)) {
    const errors = preIssues
      .filter((i) => i.severity === "error")
      .map((i) => `  ${i.pluginId}: ${i.message}`)
      .join("\n");
    throw new Error(`Plugin validation failed:\n${errors}`);
  }

  // Serialize installs on this project so concurrent runs can't clobber each
  // other's read-modify-write file operations. Released in the finally.
  const releaseInstallLock = await acquireInstallLock(
    path.join(agileflowDir, "_cfg"),
  );
  try {
    return await runInstall(options, {
      discovered,
      userSelected,
      agileflowDir,
      cliVersion,
      ide,
      ides,
      behaviors,
      learningsEnabled,
      force,
      config,
    });
  } finally {
    await releaseInstallLock();
  }
}

/**
 * The install body, run while the advisory lock is held.
 * @param {any} options - original options (unused fields tolerated)
 * @param {any} resolved - destructured + defaulted option values
 */
async function runInstall(options, resolved) {
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
  } = resolved;

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
    try {
      hookManifestPath = await writeAggregatedManifest(
        ordered,
        agileflowDir,
        behaviors,
      );
    } catch (err) {
      throw new Error(`hook manifest write failed: ${err.message}`);
    }
  } else {
    await removeAggregatedManifest(agileflowDir);
  }

  // 8. Register hook dispatchers in `.claude/settings.json` iff
  //    claude-code is in the target set; otherwise remove any prior
  //    registration we may have written.
  const projectRoot = path.dirname(agileflowDir);
  let settingsPath = null;
  let agentsMirrored = [];
  let agentsSkipped = [];
  /** @type {string[]} */
  let agentsPrefsInjected = [];
  /** @type {Array<{ file: string, error: string }>} */
  let agentsPrefsFailed = [];
  if (targetIdes.includes("claude-code")) {
    try {
      settingsPath = await writeClaudeCodeSettings(projectRoot);
    } catch (err) {
      throw new Error(`settings.json write failed: ${err.message}`);
    }
    const agentMirror = await mirrorClaudeCodeAgents(ordered, projectRoot);
    agentsMirrored = agentMirror.mirrored;
    agentsSkipped = agentMirror.skipped;
    // Bake the babysit preference block into each mirrored subagent. They
    // inherit CLAUDE.md but never receive SessionStart hook output, so this
    // is the only path that reaches them. Idempotent, marker-delimited.
    const prefsResult = await injectAgentPrefs(
      path.join(projectRoot, ".claude", "agents", "agileflow"),
      config,
    );
    agentsPrefsInjected = prefsResult.touched;
    agentsPrefsFailed = prefsResult.failed;
  } else {
    await removeClaudeCodeSettings(projectRoot);
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

  // 10. Scaffold the project docs folder on first install.
  const docsScaffolded = await scaffoldDocs(projectRoot);

  // 11. Scaffold persistent learnings files for skills that opt in.
  //     Lives in .agileflow/skills/_learnings/ — outside the mirror wipe
  //     zone so re-installs never destroy accumulated signals.
  const learningsScaffolded =
    anySkills && learningsEnabled
      ? await scaffoldSkillLearnings(ordered, projectRoot)
      : [];

  // 12. Emit the portable AGENTS.md and bridge it into CLAUDE.md. AGENTS.md
  //     is universal — every supported IDE either reads it directly or, for
  //     Claude Code, imports it via the @AGENTS.md line in CLAUDE.md. Both
  //     writes are idempotent and preserve user content outside the managed
  //     marker blocks.
  let agentsMdPath;
  try {
    agentsMdPath = await writeAgentsMd(projectRoot, config);
  } catch (err) {
    throw new Error(`AGENTS.md write failed: ${err.message}`);
  }
  // The CLAUDE.md @AGENTS.md bridge only matters for Claude Code — the one
  // supported tool that does not read AGENTS.md natively. Don't create a
  // CLAUDE.md for projects that never target it.
  let claudeMdPath = null;
  if (targetIdes.includes("claude-code")) {
    try {
      claudeMdPath = await ensureClaudeMdImport(projectRoot);
    } catch (err) {
      throw new Error(`CLAUDE.md write failed: ${err.message}`);
    }
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
    codexConfigPath,
    skillsMirrored,
    skillsPruned,
    skillsSkipped,
    agentsMirrored,
    agentsSkipped,
    agentsPrefsInjected,
    agentsPrefsFailed,
    agentsMdPath,
    claudeMdPath,
    docsScaffolded,
    learningsScaffolded,
    ides: targetIdes,
    // Back-compat: keep `ide` as the primary so existing callers /
    // test assertions keep working without a sweep.
    ide: primaryIde,
  };
}

module.exports = { installPlugins };
