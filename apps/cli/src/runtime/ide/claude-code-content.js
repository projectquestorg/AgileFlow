/**
 * Mirrors plugin-provided slash commands and subagents into Claude Code.
 *
 * Plugin source files live under:
 *   apps/cli/content/plugins/<id>/commands/...
 *   apps/cli/content/plugins/<id>/agents/...
 *
 * Claude Code discovers them from project-local dotdirs:
 *   .claude/commands/agileflow/...
 *   .claude/agents/agileflow/...
 */
const fs = require("fs");
const path = require("path");

/**
 * @typedef {import('../plugins/registry.js').PluginManifest} PluginManifest
 *
 * @typedef {Object} MirrorContentResult
 * @property {string[]} mirrored
 * @property {Array<{ id: string, error: string }>} skipped
 */

/**
 * @param {string} p
 * @returns {string}
 */
function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function mkdirFor(filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
async function rmDir(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

/**
 * @param {PluginManifest[]} orderedPlugins
 * @param {"commands" | "agents"} kind
 * @returns {Array<{ id: string, sourcePath: string, relativePath: string }>}
 */
function collectPluginContent(orderedPlugins, kind) {
  /** @type {Array<{ id: string, sourcePath: string, relativePath: string }>} */
  const out = [];
  for (const plugin of orderedPlugins) {
    const entries =
      plugin.provides && Array.isArray(plugin.provides[kind])
        ? plugin.provides[kind]
        : [];
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        !entry.id ||
        typeof entry.path !== "string" ||
        !entry.path
      ) {
        continue;
      }
      const relativePath = entry.path.startsWith(`${kind}/`)
        ? entry.path.slice(kind.length + 1)
        : entry.path;
      out.push({
        id: entry.id,
        sourcePath: path.join(plugin.dir, entry.path),
        relativePath: toPosix(relativePath),
      });
    }
  }
  return out;
}

/**
 * @param {PluginManifest[]} orderedPlugins
 * @param {string} projectRoot
 * @param {string} targetDirRel
 * @param {"commands" | "agents"} kind
 * @returns {Promise<MirrorContentResult>}
 */
async function mirrorClaudeCodeContent(
  orderedPlugins,
  projectRoot,
  targetDirRel,
  kind,
) {
  const targetRoot = path.join(projectRoot, targetDirRel);
  await rmDir(targetRoot);
  await fs.promises.mkdir(targetRoot, { recursive: true });

  const items = collectPluginContent(orderedPlugins, kind);
  /** @type {string[]} */
  const mirrored = [];
  /** @type {Array<{ id: string, error: string }>} */
  const skipped = [];

  for (const item of items) {
    const dest = path.join(targetRoot, item.relativePath);
    try {
      await mkdirFor(dest);
      await fs.promises.copyFile(item.sourcePath, dest);
      mirrored.push(item.id);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        skipped.push({
          id: item.id,
          error: `source not found: ${item.sourcePath}`,
        });
        continue;
      }
      throw err;
    }
  }

  return { mirrored, skipped };
}

/**
 * @param {PluginManifest[]} orderedPlugins
 * @param {string} projectRoot
 * @returns {Promise<MirrorContentResult>}
 */
function mirrorClaudeCodeCommands(orderedPlugins, projectRoot) {
  return mirrorClaudeCodeContent(
    orderedPlugins,
    projectRoot,
    ".claude/commands/agileflow",
    "commands",
  );
}

/**
 * @param {PluginManifest[]} orderedPlugins
 * @param {string} projectRoot
 * @returns {Promise<MirrorContentResult>}
 */
function mirrorClaudeCodeAgents(orderedPlugins, projectRoot) {
  return mirrorClaudeCodeContent(
    orderedPlugins,
    projectRoot,
    ".claude/agents/agileflow",
    "agents",
  );
}

/**
 * @param {string} projectRoot
 * @returns {Promise<void>}
 */
async function unmirrorClaudeCodeCommands(projectRoot) {
  await rmDir(path.join(projectRoot, ".claude/commands/agileflow"));
}

/**
 * @param {string} projectRoot
 * @returns {Promise<void>}
 */
async function unmirrorClaudeCodeAgents(projectRoot) {
  await rmDir(path.join(projectRoot, ".claude/agents/agileflow"));
}

module.exports = {
  collectPluginContent,
  mirrorClaudeCodeCommands,
  mirrorClaudeCodeAgents,
  unmirrorClaudeCodeCommands,
  unmirrorClaudeCodeAgents,
};
