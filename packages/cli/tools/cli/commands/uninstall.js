/**
 * AgileFlow CLI - Uninstall Command
 *
 * Removes AgileFlow from a project.
 */

const chalk = require('chalk');
const path = require('node:path');
const fs = require('fs-extra');
const { Installer } = require('../installers/core/installer');
const { IdeManager } = require('../installers/ide/manager');
const { displayLogo, displaySection, success, warning, error, confirm } = require('../lib/ui');
const { ErrorHandler } = require('../lib/error-handler');

const installer = new Installer();
const ideManager = new IdeManager();

module.exports = {
  name: 'uninstall',
  description: 'Remove AgileFlow from a project',
  options: [
    ['-d, --directory <path>', 'Project directory (default: current directory)'],
    ['--ide <name>', 'Remove only a specific IDE (e.g., windsurf, cursor)'],
    ['--force', 'Skip confirmation prompt'],
  ],
  action: async options => {
    try {
      const directory = path.resolve(options.directory || '.');

      displayLogo();

      // Check for existing installation
      const status = await installer.getStatus(directory);

      if (!status.installed) {
        warning('No AgileFlow installation found');
        process.exit(0);
      }

      // Check if removing just one IDE
      if (options.ide) {
        const ideName = options.ide.toLowerCase();
        displaySection('Removing IDE Configuration', `IDE: ${formatIdeName(ideName)}`);

        if (!status.ides || !status.ides.includes(ideName)) {
          warning(`${formatIdeName(ideName)} is not configured in this installation`);
          console.log(chalk.dim(`Configured IDEs: ${(status.ides || []).join(', ') || 'none'}\n`));
          process.exit(0);
        }

        // Confirm removal
        if (!options.force) {
          const proceed = await confirm(`Remove ${formatIdeName(ideName)} configuration?`, false);
          if (!proceed) {
            console.log(chalk.dim('\nCancelled\n'));
            process.exit(0);
          }
        }

        console.log();

        // Remove the IDE configuration
        const configPath = getIdeConfigPath(directory, ideName);
        if (await fs.pathExists(configPath)) {
          await fs.remove(configPath);
          success(`Removed ${formatIdeName(ideName)} configuration`);
        }

        // Also remove spawnable agents for claude-code
        if (ideName === 'claude-code') {
          const agentsPath = path.join(directory, '.claude', 'agents', 'agileflow');
          if (await fs.pathExists(agentsPath)) {
            await fs.remove(agentsPath);
            success('Removed spawnable agents');
          }
        }

        // Update the manifest to remove this IDE
        const manifestPath = path.join(status.path, '_cfg', 'manifest.yaml');
        if (await fs.pathExists(manifestPath)) {
          const yaml = require('js-yaml');
          const manifestContent = await fs.readFile(manifestPath, 'utf8');
          const manifest = yaml.load(manifestContent);
          manifest.ides = (manifest.ides || []).filter(ide => ide !== ideName);
          manifest.updated_at = new Date().toISOString();
          await fs.writeFile(manifestPath, yaml.dump(manifest), 'utf8');
          success('Updated manifest');
        }

        console.log(chalk.green(`\n${formatIdeName(ideName)} has been removed.\n`));
        if (status.ides.length > 1) {
          console.log(
            chalk.dim(`Remaining IDEs: ${status.ides.filter(i => i !== ideName).join(', ')}\n`)
          );
        }

        process.exit(0);
      }

      // Full uninstall
      displaySection('Uninstalling AgileFlow', `Location: ${status.path}`);

      // Confirm uninstall
      if (!options.force) {
        const proceed = await confirm('Are you sure you want to uninstall AgileFlow?', false);
        if (!proceed) {
          console.log(chalk.dim('\nUninstall cancelled\n'));
          process.exit(0);
        }
      }

      console.log();

      // Remove IDE configurations
      if (status.ides && status.ides.length > 0) {
        for (const ide of status.ides) {
          const configPath = getIdeConfigPath(directory, ide);
          if (await fs.pathExists(configPath)) {
            await fs.remove(configPath);
            success(`Removed ${formatIdeName(ide)} configuration`);
          }
          // Also remove spawnable agents for claude-code
          if (ide === 'claude-code') {
            const agentsPath = path.join(directory, '.claude', 'agents', 'agileflow');
            if (await fs.pathExists(agentsPath)) {
              await fs.remove(agentsPath);
            }
          }
        }
      }

      // Remove AgileFlow directory
      if (await fs.pathExists(status.path)) {
        await fs.remove(status.path);
        success(`Removed ${path.basename(status.path)}/`);
      }

      console.log(chalk.green('\nAgileFlow has been uninstalled.\n'));

      process.exit(0);
    } catch (err) {
      const handler = new ErrorHandler('uninstall');
      handler.critical(
        'Uninstall failed',
        'Check file permissions',
        'sudo npx agileflow uninstall --force',
        err
      );
    }
  },
};

/**
 * Get IDE config path
 * @param {string} projectDir - Project directory
 * @param {string} ide - IDE name
 * @returns {string}
 */
function getIdeConfigPath(projectDir, ide) {
  const paths = {
    'claude-code': '.claude/commands/agileflow',
    cursor: '.cursor/rules/agileflow',
    windsurf: '.windsurf/workflows/agileflow',
  };

  return path.join(projectDir, paths[ide] || '');
}

/**
 * Format IDE name for display
 * @param {string} ide - IDE name
 * @returns {string}
 */
function formatIdeName(ide) {
  const names = {
    'claude-code': 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
  };

  return names[ide] || ide;
}
