/**
 * `agileflow plugins <action>` — inspect the plugin registry.
 *
 * Actions:
 *   list   Print all discoverable plugins with enabled status, skill count,
 *          and description. Reads agileflow.config.json for the enable state;
 *          falls back to the plugin's `enabledByDefault` flag when no config
 *          is present.
 *
 * Usage:
 *   agileflow plugins list
 *   agileflow plugins list --json
 */
const path = require("path");
const { loadConfig } = require("../../runtime/config/loader.js");
const { discoverPlugins } = require("../../runtime/plugins/registry.js");

/**
 * @param {string} action - 'list'
 * @param {{ json?: boolean }} options
 */
async function plugins(action, options = {}) {
  if (action !== "list") {
    // eslint-disable-next-line no-console
    console.error(`agileflow plugins: unknown action "${action}" — use list`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const { config, source } = await loadConfig(cwd);
  const configPlugins = source === "file" ? config.plugins || {} : {};

  const discovered = discoverPlugins();

  const rows = discovered.map((p) => {
    const cfgEntry = configPlugins[p.id];
    let enabled;
    if (cfgEntry !== undefined) {
      enabled = Boolean(cfgEntry && cfgEntry.enabled);
    } else {
      enabled = Boolean(p.enabledByDefault) || Boolean(p.cannotDisable);
    }

    const skillCount =
      p.provides && p.provides.skills ? p.provides.skills.length : 0;
    const description = (p.description || "")
      .replace(/\n/g, " ")
      .trim()
      .slice(0, 72);

    return {
      id: p.id,
      enabled,
      cannotDisable: Boolean(p.cannotDisable),
      skills: skillCount,
      description,
    };
  });

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ source, plugins: rows }, null, 2));
    return;
  }

  const idW = Math.max(6, ...rows.map((r) => r.id.length));
  const statusW = 8; // "disabled" length
  const skillsW = 6; // "skills" length

  const header = `${"Plugin".padEnd(idW)}  ${"Status".padEnd(statusW)}  ${"Skills".padEnd(skillsW)}  Description`;
  const sep = `${"-".repeat(idW)}  ${"-".repeat(statusW)}  ${"-".repeat(skillsW)}  ${"-".repeat(40)}`;

  // eslint-disable-next-line no-console
  console.log("\nAvailable plugins:\n");
  // eslint-disable-next-line no-console
  console.log(header);
  // eslint-disable-next-line no-console
  console.log(sep);

  for (const r of rows) {
    const status = r.cannotDisable
      ? "always  "
      : r.enabled
        ? "enabled "
        : "disabled";
    const skillsStr = String(r.skills).padEnd(skillsW);
    // eslint-disable-next-line no-console
    console.log(
      `${r.id.padEnd(idW)}  ${status}  ${skillsStr}  ${r.description}`,
    );
  }

  const enabledCount = rows.filter((r) => r.enabled || r.cannotDisable).length;
  // eslint-disable-next-line no-console
  console.log(`\n${rows.length} plugin(s) available, ${enabledCount} enabled.`);
  if (source === "defaults") {
    // eslint-disable-next-line no-console
    console.log(
      "  (no agileflow.config.json — showing defaults; run `agileflow setup` to configure)",
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "  Use `agileflow skills enable <plugin>` or `agileflow skills disable <plugin>` to change.",
    );
  }
}

module.exports = plugins;
