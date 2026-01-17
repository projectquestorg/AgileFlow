/**
 * AgileFlow CLI - TUI Command
 *
 * Launches the Terminal User Interface for real-time session monitoring.
 * Uses React/Ink for a proper live-updating terminal UI.
 */

const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('fs');

module.exports = {
  name: 'tui',
  description: 'Launch Terminal User Interface for session monitoring',
  options: [['-d, --directory <path>', 'Project directory (default: current directory)']],
  action: async options => {
    const directory = path.resolve(options.directory || '.');

    // Check if AgileFlow is installed
    const agileflowDir = path.join(directory, '.agileflow');
    if (!fs.existsSync(agileflowDir)) {
      console.error('Error: AgileFlow is not installed in this directory');
      console.log("Run 'npx agileflow setup' first\n");
      process.exit(1);
    }

    // Find the TUI script - relative to this file in packages/cli
    const cliRoot = path.join(__dirname, '..', '..', '..');
    const tuiScript = path.join(cliRoot, 'scripts', 'tui', 'index.js');

    if (!fs.existsSync(tuiScript)) {
      console.error('Error: TUI script not found at', tuiScript);
      process.exit(1);
    }

    // Spawn the TUI process from packages/cli directory to use correct deps
    const child = spawn('node', [tuiScript], {
      cwd: cliRoot, // Run from packages/cli to use its node_modules
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        AGILEFLOW_PROJECT_DIR: directory, // Pass project dir as env var
      },
    });

    child.on('error', err => {
      console.error('Error launching TUI:', err.message);
      process.exit(1);
    });

    child.on('exit', code => {
      process.exit(code || 0);
    });
  },
};
