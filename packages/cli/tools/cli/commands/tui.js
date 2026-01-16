/**
 * AgileFlow CLI - TUI Command
 *
 * Launches the Terminal User Interface for real-time session monitoring.
 */

const chalk = require('chalk');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('fs-extra');

module.exports = {
  name: 'tui',
  description: 'Launch Terminal User Interface for session monitoring',
  options: [['-d, --directory <path>', 'Project directory (default: current directory)']],
  action: async options => {
    try {
      const directory = path.resolve(options.directory || '.');

      // Check if AgileFlow is installed
      const agileflowDir = path.join(directory, '.agileflow');
      if (!(await fs.pathExists(agileflowDir))) {
        console.error(chalk.red('Error:'), 'AgileFlow is not installed in this directory');
        console.log(chalk.dim(`Run 'npx agileflow setup' first\n`));
        process.exit(1);
      }

      // Find the TUI script
      const tuiScript = path.join(__dirname, '../../..', 'scripts', 'tui', 'index.js');

      if (!(await fs.pathExists(tuiScript))) {
        console.error(chalk.red('Error:'), 'TUI script not found');
        process.exit(1);
      }

      // Spawn the TUI process with inherited stdio for interactive mode
      const child = spawn('node', [tuiScript], {
        cwd: directory,
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      child.on('error', err => {
        console.error(chalk.red('Error launching TUI:'), err.message);
        process.exit(1);
      });

      child.on('exit', code => {
        process.exit(code || 0);
      });
    } catch (err) {
      console.error(chalk.red('Error:'), err.message);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  },
};
