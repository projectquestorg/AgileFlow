/**
 * Claude Code skill mirror.
 *
 * Plugin skills are sourced under `apps/cli/content/plugins/<id>/skills/<skill-id>/`
 * and copied into `.agileflow/plugins/<id>/skills/<skill-id>/` by the
 * sync engine. But Claude Code discovers skills from `.claude/skills/<skill-id>/`,
 * so this module mirrors enabled plugin skills to that canonical
 * location and prunes orphaned skills when plugins are disabled.
 *
 * We use copy (not symlink) for portability — Windows symlink behavior
 * is inconsistent and Claude Code itself runs there. The duplication
 * cost is negligible at v4-alpha skill counts.
 */
const fs = require('fs');
const path = require('path');

/**
 * @typedef {import('../plugins/registry.js').PluginManifest} PluginManifest
 *
 * @typedef {Object} MirrorResult
 * @property {string[]} mirrored - skill ids written to .claude/skills/
 * @property {string[]} pruned - skill ids removed from .claude/skills/ (orphans)
 */

/**
 * Recursively copy a directory tree.
 * @param {string} src
 * @param {string} dest
 */
async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d);
    } else if (e.isFile()) {
      await fs.promises.copyFile(s, d);
    }
  }
}

/**
 * Recursively remove a directory tree (no-op when missing).
 * @param {string} dir
 */
async function rmDir(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

/**
 * Collect every skill declared by an enabled plugin manifest. Returns
 * a list of `{ skillId, sourceDir }` where sourceDir is absolute.
 *
 * @param {PluginManifest[]} orderedPlugins
 * @returns {Array<{ skillId: string, sourceDir: string }>}
 */
function collectPluginSkills(orderedPlugins) {
  /** @type {Array<{ skillId: string, sourceDir: string }>} */
  const out = [];
  for (const plugin of orderedPlugins) {
    const skills =
      plugin.provides && Array.isArray(plugin.provides.skills)
        ? plugin.provides.skills
        : [];
    for (const s of skills) {
      if (!s || typeof s.id !== 'string' || typeof s.dir !== 'string') continue;
      out.push({
        skillId: s.id,
        sourceDir: path.join(plugin.dir, s.dir),
      });
    }
  }
  return out;
}

/**
 * Mirror enabled plugin skills into `<projectRoot>/.claude/skills/<skill-id>/`
 * and remove any `.claude/skills/<id>/` whose id is not in the current
 * enabled set.
 *
 * Only AgileFlow-tracked skills are pruned: a skill is "tracked" iff
 * its dir contains a `SKILL.md` whose first line is `---` AND its name
 * appears in any plugin's `provides.skills` (i.e., we recognize it).
 * To stay safe, we limit pruning to skills we've seen previously by
 * recording the install set in the file index — but for v4-alpha
 * simplicity, we prune every dir under `.claude/skills/` whose name
 * matches an `agileflow-*` convention OR is in the previously-mirrored
 * set on disk. Unknown user-placed skill dirs without that prefix are
 * left alone.
 *
 * @param {PluginManifest[]} orderedPlugins
 * @param {string} projectRoot
 * @returns {Promise<MirrorResult>}
 */
async function mirrorClaudeCodeSkills(orderedPlugins, projectRoot) {
  const claudeSkills = path.join(projectRoot, '.claude', 'skills');
  await fs.promises.mkdir(claudeSkills, { recursive: true });

  const want = collectPluginSkills(orderedPlugins);
  const wantIds = new Set(want.map((w) => w.skillId));

  /** @type {string[]} */
  const mirrored = [];
  for (const { skillId, sourceDir } of want) {
    const dest = path.join(claudeSkills, skillId);
    // Replace the destination wholesale so removed files in source
    // don't linger in the user's .claude/skills/.
    await rmDir(dest);
    await copyDir(sourceDir, dest);
    mirrored.push(skillId);
  }

  /** @type {string[]} */
  const pruned = [];
  let entries;
  try {
    entries = await fs.promises.readdir(claudeSkills, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { mirrored, pruned };
    throw err;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (wantIds.has(e.name)) continue;
    // Only prune skills that LOOK like ours: agileflow-* prefix. This
    // avoids blasting a user-placed third-party skill whose id we
    // don't manage. A dedicated prune-from-index approach can replace
    // this heuristic in a later phase.
    if (!e.name.startsWith('agileflow-')) continue;
    await rmDir(path.join(claudeSkills, e.name));
    pruned.push(e.name);
  }

  return { mirrored, pruned };
}

/**
 * Remove all AgileFlow-mirrored skills from `.claude/skills/`. Used
 * when switching to a non-skill IDE.
 *
 * @param {string} projectRoot
 * @returns {Promise<string[]>} ids that were removed
 */
async function unmirrorClaudeCodeSkills(projectRoot) {
  const claudeSkills = path.join(projectRoot, '.claude', 'skills');
  /** @type {string[]} */
  const removed = [];
  let entries;
  try {
    entries = await fs.promises.readdir(claudeSkills, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return removed;
    throw err;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith('agileflow-')) continue;
    await rmDir(path.join(claudeSkills, e.name));
    removed.push(e.name);
  }
  return removed;
}

module.exports = {
  mirrorClaudeCodeSkills,
  unmirrorClaudeCodeSkills,
  collectPluginSkills,
};
