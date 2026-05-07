/**
 * `agileflow learn append|list <skill-id>` — manage skill learnings.
 *
 * Skills with `learns.enabled: true` in their frontmatter accumulate
 * persistent signals (user corrections, accepted patterns) in the
 * installed skill directory. This subcommand is the write/read entry
 * point — atomic, capped, and skill-aware.
 *
 * Usage:
 *   agileflow learn append <skill-id> "<observation>" [--confidence high|medium|low] [--source correction|confirmation|observation]
 *   agileflow learn list   <skill-id>
 */
const path = require("path");
const {
  appendLearning,
  readLearnings,
} = require("../../runtime/skills/learnings.js");
const { discoverPlugins } = require("../../runtime/plugins/registry.js");
const { loadSkill } = require("../../runtime/skills/validator.js");

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Walk discovered plugins to find the skill manifest and return its
 * learnings config. Throws when the skill is unknown or has not opted
 * into learnings.
 *
 * @param {string} skillId
 * @returns {Promise<{ file?: string, maxEntries: number }>}
 */
async function resolveLearnsConfig(skillId) {
  const plugins = discoverPlugins();
  for (const plugin of plugins) {
    const skills = (plugin.provides && plugin.provides.skills) || [];
    for (const s of skills) {
      if (!s || s.id !== skillId) continue;
      const skillDir = s.dir ? path.join(plugin.dir, s.dir) : null;
      if (!skillDir) continue;
      const manifest = await loadSkill(path.join(skillDir, "SKILL.md"));
      const learns = manifest.frontmatter && manifest.frontmatter.learns;
      if (!learns || learns.enabled !== true) {
        throw new Error(
          `skill "${skillId}" does not have learns.enabled: true`,
        );
      }
      const file =
        typeof learns.file === "string" && learns.file
          ? learns.file
          : undefined;
      const maxEntries =
        Number.isInteger(learns.maxEntries) && learns.maxEntries > 0
          ? learns.maxEntries
          : 50;
      return { file, maxEntries };
    }
  }
  throw new Error(`unknown skill: "${skillId}"`);
}

/**
 * @param {string} action - 'append' | 'list'
 * @param {string} skillId
 * @param {string} [observation]
 * @param {{ confidence?: string, source?: string }} [options]
 */
async function learn(action, skillId, observation, options = {}) {
  const projectDir = process.cwd();

  let cfg;
  try {
    cfg = await resolveLearnsConfig(skillId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`agileflow learn: ${err.message}`);
    process.exit(1);
  }

  if (action === "append") {
    if (!observation || !observation.trim()) {
      // eslint-disable-next-line no-console
      console.error(
        'agileflow learn append: usage — agileflow learn append <skill-id> "<observation>" [--confidence high|medium|low] [--source correction|confirmation|observation]',
      );
      process.exit(1);
    }
    try {
      await appendLearning(
        skillId,
        projectDir,
        {
          observation,
          confidence: options.confidence || "medium",
          source: options.source || "correction",
        },
        { maxEntries: cfg.maxEntries },
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`agileflow learn: ${err.message}`);
      process.exit(1);
    }
    const { entries } = await readLearnings(skillId, projectDir);
    // eslint-disable-next-line no-console
    console.log(`✓ learning saved (${entries.length} total) for ${skillId}`);
    return;
  }

  if (action === "list") {
    const { entries } = await readLearnings(skillId, projectDir);
    if (!entries.length) {
      // eslint-disable-next-line no-console
      console.log(`(no learnings yet for ${skillId})`);
      return;
    }
    const sorted = [...entries].sort(
      (a, b) =>
        (CONFIDENCE_ORDER[a.confidence] ?? 99) -
        (CONFIDENCE_ORDER[b.confidence] ?? 99),
    );
    for (const e of sorted) {
      // eslint-disable-next-line no-console
      console.log(`[${e.created}] (${e.confidence}) ${e.observation}`);
    }
    return;
  }

  // eslint-disable-next-line no-console
  console.error(
    `agileflow learn: unknown action "${action}" — use append or list`,
  );
  process.exit(1);
}

module.exports = learn;
