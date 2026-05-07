/**
 * `agileflow skills <action>` — inspect and manage installed skill packs.
 *
 * Actions:
 *   list              Print a table of every skill installed for the configured IDE,
 *                     including name, version, learns status, and accumulated learning count.
 *   enable  <plugin>  Enable a plugin (skill pack) and re-sync the install.
 *   disable <plugin>  Disable a plugin (skill pack) and remove its skills.
 *
 * Usage:
 *   agileflow skills list
 *   agileflow skills list --json
 *   agileflow skills enable  ads
 *   agileflow skills disable council
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const pkg = require("../../../package.json");
const yaml = require("js-yaml");
const { loadConfig } = require("../../runtime/config/loader.js");
const { writeConfig } = require("../../runtime/config/writer.js");
const {
  IDE_CAPABILITIES,
  capabilitiesFor,
  hookEventsForIdes,
} = require("../../runtime/ide/capabilities.js");
const { readLearnings } = require("../../runtime/skills/learnings.js");
const { discoverPlugins } = require("../../runtime/plugins/registry.js");
const { installPlugins } = require("../../runtime/installer/install.js");
const {
  normalizeBehaviorsForEvents,
} = require("../wizard/behaviors-picker.js");

/**
 * Read and parse SKILL.md frontmatter from an installed skill directory.
 * Returns null when SKILL.md is absent or unparseable.
 *
 * @param {string} skillDir
 * @returns {{ name: string, version: string, description: string, learns: object } | null}
 */
function readSkillMeta(skillDir) {
  const mdPath = path.join(skillDir, "SKILL.md");
  let text;
  try {
    text = fs.readFileSync(mdPath, "utf8");
  } catch {
    return null;
  }
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    const fm = yaml.load(match[1]) || {};
    return {
      name: fm.name || path.basename(skillDir),
      version: fm.version || "?",
      description: (typeof fm.description === "string" ? fm.description : "")
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 80),
      learns: fm.learns || { enabled: false },
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ json?: boolean }} options
 */
async function skillsList(options = {}) {
  const cwd = process.cwd();
  const { config } = await loadConfig(cwd);

  const primaryIde =
    Array.isArray(config?.ide?.targets) && config.ide.targets.length > 0
      ? config.ide.targets[0]
      : "claude-code";

  const caps = IDE_CAPABILITIES[primaryIde];
  if (!caps || !caps.skills) {
    if (options.json) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          ide: primaryIde,
          skills: [],
          note: "IDE does not support skills",
        }),
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`(${primaryIde} does not support skills)`);
    }
    return;
  }

  const skillsDir = path.join(cwd, caps.skillsDir);
  if (!fs.existsSync(skillsDir)) {
    if (options.json) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          ide: primaryIde,
          skillsDir: caps.skillsDir,
          skills: [],
          note: "Skills directory not found — run `agileflow setup`",
        }),
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `Skills not installed — run \`agileflow setup\` to install to ${caps.skillsDir}/`,
      );
    }
    return;
  }

  const entries = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, "SKILL.md")));

  if (entries.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`(no skills installed in ${caps.skillsDir}/)`);
    return;
  }

  const rows = [];
  for (const skillId of entries.sort()) {
    const meta = readSkillMeta(path.join(skillsDir, skillId));
    if (!meta) continue;

    let learningCount = 0;
    if (meta.learns && meta.learns.enabled) {
      try {
        const { entries: le } = await readLearnings(skillId, cwd);
        learningCount = le.length;
      } catch {
        // learnings file absent or unreadable — treat as 0
      }
    }

    rows.push({
      id: skillId,
      version: meta.version,
      learns:
        meta.learns && meta.learns.enabled ? `yes (${learningCount})` : "no",
      description: meta.description,
    });
  }

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { ide: primaryIde, skillsDir: caps.skillsDir, skills: rows },
        null,
        2,
      ),
    );
    return;
  }

  // Plain-text table
  const idW = Math.max(4, ...rows.map((r) => r.id.length));
  const verW = Math.max(3, ...rows.map((r) => r.version.length));
  const learnW = Math.max(7, ...rows.map((r) => r.learns.length));
  const header = `${"Skill".padEnd(idW)}  ${"Ver".padEnd(verW)}  ${"Learns".padEnd(learnW)}  Description`;
  const sep = `${"-".repeat(idW)}  ${"-".repeat(verW)}  ${"-".repeat(learnW)}  ${"-".repeat(40)}`;
  // eslint-disable-next-line no-console
  console.log(`\nInstalled skills (${primaryIde} — ${caps.skillsDir}/):\n`);
  // eslint-disable-next-line no-console
  console.log(header);
  // eslint-disable-next-line no-console
  console.log(sep);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `${r.id.padEnd(idW)}  ${r.version.padEnd(verW)}  ${r.learns.padEnd(learnW)}  ${r.description}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`\n${rows.length} skill(s) installed.`);
}

// ---------------------------------------------------------------------------
// enable / disable helpers
// ---------------------------------------------------------------------------

/**
 * Toggle a plugin on or off, write config, then re-run the installer.
 *
 * @param {'enable'|'disable'} action
 * @param {string} pluginId
 * @param {object} options
 */
async function togglePlugin(action, pluginId, options) {
  const enable = action === "enable";
  const cwd = process.cwd();

  // Validate plugin exists in the registry
  const all = discoverPlugins();
  const plugin = all.find((p) => p.id === pluginId);
  if (!plugin) {
    const ids = all.map((p) => p.id).join(", ");
    // eslint-disable-next-line no-console
    console.error(
      `agileflow skills ${action}: unknown plugin "${pluginId}". Available: ${ids}`,
    );
    process.exit(1);
  }
  if (plugin.cannotDisable && !enable) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow skills disable: "${pluginId}" cannot be disabled (it is always active).`,
    );
    process.exit(1);
  }

  // Load current config
  const { config, source } = await loadConfig(cwd);
  if (source === "defaults") {
    // eslint-disable-next-line no-console
    console.error(
      "agileflow skills: no agileflow.config.json found — run `agileflow setup` first.",
    );
    process.exit(1);
  }

  // Patch the plugin entry
  if (!config.plugins) config.plugins = {};
  if (!config.plugins[pluginId]) config.plugins[pluginId] = {};
  config.plugins[pluginId].enabled = enable;

  // Write config atomically
  await writeConfig(cwd, config);
  // eslint-disable-next-line no-console
  console.log(
    `✓ ${enable ? "Enabled" : "Disabled"} plugin "${pluginId}" in agileflow.config.json`,
  );

  // Re-run installer to materialize / remove the skill files
  const agileflowDir = path.join(cwd, ".agileflow");
  const userSelected = Object.entries(config.plugins || {})
    .filter(([id, v]) => v && v.enabled && id !== "core")
    .map(([id]) => id);

  const supportedHookEvents = hookEventsForIdes(config.ide.targets || []);
  const normalizedBehaviors = normalizeBehaviorsForEvents(
    config.behaviors,
    supportedHookEvents,
  );

  let result;
  try {
    result = await installPlugins({
      discovered: all,
      userSelected,
      agileflowDir,
      cliVersion: pkg.version,
      ides: config.ide.targets || ["claude-code"],
      behaviors: normalizedBehaviors,
      learningsEnabled: Boolean(config.learnings && config.learnings.enabled),
      force: Boolean(options.force),
      config,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow skills ${action}: install sync failed: ${err.message}`,
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(
    `  created=${result.ops.created} updated=${result.ops.updated} unchanged=${result.ops.unchanged} removed=${result.ops.removed}`,
  );
}

/**
 * @param {string} action - 'list' | 'enable' | 'disable'
 * @param {string} [pluginOrSkillId] - required for enable/disable
 * @param {{ json?: boolean, force?: boolean }} options
 */
async function skills(action, pluginOrSkillId, options = {}) {
  if (action === "list") {
    return skillsList(options);
  }
  if (action === "enable" || action === "disable") {
    if (!pluginOrSkillId) {
      // eslint-disable-next-line no-console
      console.error(`agileflow skills ${action}: plugin name required`);
      process.exit(1);
    }
    return togglePlugin(action, pluginOrSkillId, options);
  }
  // eslint-disable-next-line no-console
  console.error(
    `agileflow skills: unknown action "${action}" — use list, enable, or disable`,
  );
  process.exit(1);
}

module.exports = skills;
