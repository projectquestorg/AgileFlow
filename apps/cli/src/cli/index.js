/**
 * CLI dispatcher — wires commander up with the v4 command surface.
 *
 * Phase 1 ships `status`, `setup` (stub), and `doctor` (stub). Phase 2 adds
 * `enable`, `disable`, and a real `setup`. Phase 5 adds `uninstall`.
 */
const { Command } = require("commander");
const pkg = require("../../package.json");
const { SUPPORTED_IDES } = require("../runtime/ide/capabilities.js");

const status = require("./commands/status.js");
const setup = require("./commands/setup.js");
const update = require("./commands/update.js");
const doctor = require("./commands/doctor.js");
const hook = require("./commands/hook.js");
const learn = require("./commands/learn.js");
const skills = require("./commands/skills.js");
const plugins = require("./commands/plugins.js");

/**
 * Build the commander program. Exported so tests can construct it without
 * parsing argv.
 * @returns {Command}
 */
function buildProgram() {
  const program = new Command();

  program
    .name("agileflow")
    .description("AgileFlow v4 — skills-first agile toolkit for Claude Code")
    .version(pkg.version, "-v, --version", "print version");

  program
    .command("status")
    .description("print install state, enabled plugins, and hook health")
    .option("--json", "output machine-readable JSON")
    .action(status);

  program
    .command("setup")
    .description("run interactive install wizard")
    .option("--yes", "skip prompts, install with defaults")
    .option("--plugins <ids>", "comma-separated plugin list to enable")
    .option(
      "--ide <id>",
      `target IDE / CLI(s): ${SUPPORTED_IDES.join(" | ")} | all`,
      "claude-code",
    )
    .option("--scope <scope>", "install scope: project | global", "project")
    .action(setup);

  program
    .command("update")
    .description(
      "re-install plugins from the current agileflow.config.json (no prompts)",
    )
    .option(
      "--force",
      "overwrite local modifications instead of preserving them",
    )
    .option("--scope <scope>", "install scope: project | global", "project")
    .action(update);

  program
    .command("doctor")
    .description(
      "validate config, plugins, skills, and hook manifest (Phase 5)",
    )
    .action(doctor);

  program
    .command("learn <action> <skillId> [observation]")
    .description("append or list skill learnings (action: append | list)")
    .option("--confidence <level>", "high | medium | low", "medium")
    .option(
      "--source <type>",
      "correction | confirmation | observation",
      "correction",
    )
    .action(learn);

  program
    .command("skills <action> [pluginId]")
    .description(
      "manage skill packs (actions: list, enable <plugin>, disable <plugin>)",
    )
    .option("--json", "output as JSON")
    .option(
      "--force",
      "overwrite local modifications when syncing after enable/disable",
    )
    .action(skills);

  program
    .command("plugins <action>")
    .description("inspect the plugin registry (action: list)")
    .option("--json", "output as JSON")
    .action(plugins);

  program
    .command("hook <event>")
    .description(
      "internal: dispatch a Claude Code hook event (used by settings.json)",
    )
    .option(
      "--matcher <name>",
      "tool name for tool-related events (Bash / Edit / Write / etc.)",
    )
    .action(hook);

  return program;
}

/**
 * Execute the CLI against the given argv.
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function run(argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}

module.exports = { buildProgram, run };
