/**
 * CLI dispatcher — wires commander up with the v4 command surface.
 *
 * Phase 1 ships `status`, `setup` (stub), and `doctor` (stub). Phase 2 adds
 * `enable`, `disable`, and a real `setup`. Phase 5 adds `uninstall`.
 */
const { Command } = require('commander');
const pkg = require('../../package.json');

const status = require('./commands/status.js');
const setup = require('./commands/setup.js');
const doctor = require('./commands/doctor.js');

/**
 * Build the commander program. Exported so tests can construct it without
 * parsing argv.
 * @returns {Command}
 */
function buildProgram() {
  const program = new Command();

  program
    .name('agileflow')
    .description('AgileFlow v4 — skills-first agile toolkit for Claude Code')
    .version(pkg.version, '-v, --version', 'print version');

  program
    .command('status')
    .description('print install state, enabled plugins, and hook health')
    .option('--json', 'output machine-readable JSON')
    .action(status);

  program
    .command('setup')
    .description('run interactive install wizard (Phase 2)')
    .option('--yes', 'skip prompts, install with defaults')
    .option('--plugins <ids>', 'comma-separated plugin list to enable')
    .action(setup);

  program
    .command('doctor')
    .description('validate config, plugins, skills, and hook manifest (Phase 5)')
    .action(doctor);

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
