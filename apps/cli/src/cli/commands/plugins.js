/**
 * `agileflow plugins <action>` — inspect the plugin registry.
 *
 * Actions:
 *   list           Print all discoverable plugins with enabled status, skill
 *                  count, and description. Supports --enabled / --disabled
 *                  filters.
 *   search <query> Find plugins whose id, name, description, or provided
 *                  skill ids contain the query (case-insensitive substring).
 *   show <id>      Print full detail for a single plugin: version, depends,
 *                  and the complete provides breakdown.
 *
 * All actions support --json for machine-readable output. The enable state
 * is resolved from agileflow.config.json when present, otherwise from each
 * plugin's `enabledByDefault` / `cannotDisable` flags.
 */
const { loadConfig } = require("../../runtime/config/loader.js");
const { discoverPlugins } = require("../../runtime/plugins/registry.js");
const { InvalidArgumentError, fail } = require("../../lib/errors.js");

/**
 * Resolve enabled state for a plugin given the user's config and the plugin's
 * own defaults. Mirrors the rules used by the original `list` action.
 */
function resolveEnabled(plugin, configPlugins) {
  const cfgEntry = configPlugins[plugin.id];
  if (cfgEntry !== undefined) {
    return Boolean(cfgEntry && cfgEntry.enabled);
  }
  return Boolean(plugin.enabledByDefault) || Boolean(plugin.cannotDisable);
}

function buildRow(plugin, configPlugins) {
  const enabled = resolveEnabled(plugin, configPlugins);
  const skillCount =
    plugin.provides && plugin.provides.skills
      ? plugin.provides.skills.length
      : 0;
  const description = (plugin.description || "")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 72);
  return {
    id: plugin.id,
    enabled,
    cannotDisable: Boolean(plugin.cannotDisable),
    skills: skillCount,
    description,
  };
}

async function loadContext() {
  const cwd = process.cwd();
  const { config, source } = await loadConfig(cwd);
  const configPlugins = source === "file" ? config.plugins || {} : {};
  const discovered = discoverPlugins();
  return { source, configPlugins, discovered };
}

function printList(
  rows,
  source,
  options,
  { heading = "Available plugins:" } = {},
) {
  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ source, plugins: rows }, null, 2));
    return;
  }

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log("\nNo plugins match the current filter.");
    return;
  }

  const idW = Math.max(6, ...rows.map((r) => r.id.length));
  const statusW = 8; // "disabled" length
  const skillsW = 6; // "skills" length

  const header = `${"Plugin".padEnd(idW)}  ${"Status".padEnd(statusW)}  ${"Skills".padEnd(skillsW)}  Description`;
  const sep = `${"-".repeat(idW)}  ${"-".repeat(statusW)}  ${"-".repeat(skillsW)}  ${"-".repeat(40)}`;

  if (heading) {
    // eslint-disable-next-line no-console
    console.log(`\n${heading}\n`);
  }
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
  console.log(`\n${rows.length} plugin(s) shown, ${enabledCount} enabled.`);
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

async function listAction(options) {
  const { source, configPlugins, discovered } = await loadContext();
  let rows = discovered.map((p) => buildRow(p, configPlugins));

  if (options.enabled && options.disabled) {
    fail(
      new InvalidArgumentError(
        "--enabled and --disabled are mutually exclusive",
        { suggestion: "use one filter at a time" },
      ),
      { command: "plugins" },
    );
  }
  if (options.enabled) {
    rows = rows.filter((r) => r.enabled || r.cannotDisable);
  } else if (options.disabled) {
    rows = rows.filter((r) => !r.enabled && !r.cannotDisable);
  }

  printList(rows, source, options);
}

function matchesQuery(plugin, query) {
  const q = query.toLowerCase();
  if (plugin.id.toLowerCase().includes(q)) return true;
  if ((plugin.name || "").toLowerCase().includes(q)) return true;
  if ((plugin.description || "").toLowerCase().includes(q)) return true;
  const skills = (plugin.provides && plugin.provides.skills) || [];
  return skills.some((s) => (s.id || "").toLowerCase().includes(q));
}

async function searchAction(query, options) {
  if (!query || !query.trim()) {
    fail(
      new InvalidArgumentError("search requires a query string", {
        suggestion: "agileflow plugins search <query>",
      }),
      { command: "plugins" },
    );
  }

  const { source, configPlugins, discovered } = await loadContext();
  const matches = discovered.filter((p) => matchesQuery(p, query));
  const rows = matches.map((p) => buildRow(p, configPlugins));

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ source, query, plugins: rows }, null, 2));
    return;
  }

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`\nNo plugins match "${query}".`);
    return;
  }

  printList(rows, source, options, {
    heading: `Plugins matching "${query}":`,
  });
}

function formatProvides(provides) {
  const sections = [
    ["Skills", provides.skills],
    ["Agents", provides.agents],
    ["Hooks", provides.hooks],
    ["Templates", provides.templates],
  ];
  const lines = [];
  for (const [label, items] of sections) {
    const list = Array.isArray(items) ? items : [];
    lines.push(`  ${label} (${list.length}):`);
    if (list.length === 0) {
      lines.push("    (none)");
      continue;
    }
    for (const item of list) {
      const id = item.id || item.name || "(unnamed)";
      const dir = item.dir ? `  ${item.dir}` : "";
      lines.push(`    - ${id}${dir}`);
    }
  }
  return lines.join("\n");
}

async function showAction(id, options) {
  if (!id || !id.trim()) {
    fail(
      new InvalidArgumentError("show requires a plugin id", {
        suggestion: "agileflow plugins show <id>",
      }),
      { command: "plugins" },
    );
  }

  const { source, configPlugins, discovered } = await loadContext();
  const plugin = discovered.find((p) => p.id === id);
  if (!plugin) {
    fail(
      new InvalidArgumentError(`plugin "${id}" not found`, {
        suggestion: "agileflow plugins list",
      }),
      { command: "plugins" },
    );
  }

  const enabled = resolveEnabled(plugin, configPlugins);
  const provides = plugin.provides || {
    skills: [],
    agents: [],
    hooks: [],
    templates: [],
  };

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          source,
          plugin: {
            id: plugin.id,
            name: plugin.name,
            description: plugin.description,
            version: plugin.version,
            enabled,
            cannotDisable: Boolean(plugin.cannotDisable),
            enabledByDefault: Boolean(plugin.enabledByDefault),
            depends: plugin.depends || [],
            provides,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const status = plugin.cannotDisable
    ? "always (cannot disable)"
    : enabled
      ? "enabled"
      : "disabled";
  const depends =
    plugin.depends && plugin.depends.length
      ? plugin.depends.join(", ")
      : "(none)";

  // eslint-disable-next-line no-console
  console.log(`\n${plugin.name} (${plugin.id})`);
  // eslint-disable-next-line no-console
  console.log(`  Version:     ${plugin.version}`);
  // eslint-disable-next-line no-console
  console.log(`  Status:      ${status}`);
  // eslint-disable-next-line no-console
  console.log(`  Depends:     ${depends}`);
  // eslint-disable-next-line no-console
  console.log(`  Description: ${plugin.description}`);
  // eslint-disable-next-line no-console
  console.log("\n  Provides:");
  // eslint-disable-next-line no-console
  console.log(formatProvides(provides));
  // eslint-disable-next-line no-console
  console.log("");
}

/**
 * @param {string} action - 'list' | 'search' | 'show'
 * @param {string} [arg]  - query for search, id for show
 * @param {{ json?: boolean, enabled?: boolean, disabled?: boolean }} options
 */
async function plugins(action, arg, options = {}) {
  // Commander invokes action handlers with (...args, command). When no
  // <arg> is declared on a subcommand, the second positional may be the
  // options object instead of a string. Normalize defensively so direct
  // calls and commander dispatch both work.
  if (
    arg &&
    typeof arg === "object" &&
    options &&
    Object.keys(options).length === 0
  ) {
    options = arg;
    arg = undefined;
  }
  options = options || {};

  switch (action) {
    case "list":
      return listAction(options);
    case "search":
      return searchAction(arg, options);
    case "show":
      return showAction(arg, options);
    default:
      fail(
        new InvalidArgumentError(`unknown action "${action}"`, {
          suggestion: "agileflow plugins list | search <query> | show <id>",
        }),
        { command: "plugins" },
      );
  }
}

module.exports = plugins;
