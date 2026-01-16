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
const { IdeRegistry } = require('../lib/ide-registry');

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
        displaySection('Removing IDE Configuration', `IDE: ${IdeRegistry.getDisplayName(ideName)}`);

        if (!status.ides || !status.ides.includes(ideName)) {
          warning(`${IdeRegistry.getDisplayName(ideName)} is not configured in this installation`);
          console.log(chalk.dim(`Configured IDEs: ${(status.ides || []).join(', ') || 'none'}\n`));
          process.exit(0);
        }

        // Confirm removal
        if (!options.force) {
          const proceed = await confirm(`Remove ${IdeRegistry.getDisplayName(ideName)} configuration?`, false);
          if (!proceed) {
            console.log(chalk.dim('\nCancelled\n'));
            process.exit(0);
          }
        }

        console.log();

        // Remove the IDE configuration
        const configPath = IdeRegistry.getConfigPath(ideName, directory);
        if (await fs.pathExists(configPath)) {
          await fs.remove(configPath);
          success(`Removed ${IdeRegistry.getDisplayName(ideName)} configuration`);
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
          const { safeLoad, safeDump } = require('../../../lib/yaml-utils');
          const manifestContent = await fs.readFile(manifestPath, 'utf8');
          const manifest = safeLoad(manifestContent);
          manifest.ides = (manifest.ides || []).filter(ide => ide !== ideName);
          manifest.updated_at = new Date().toISOString();
          await fs.writeFile(manifestPath, safeDump(manifest), 'utf8');
          success('Updated manifest');
        }

        console.log(chalk.green(`\n${IdeRegistry.getDisplayName(ideName)} has been removed.\n`));
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
          const configPath = IdeRegistry.getConfigPath(ide, directory);
          if (await fs.pathExists(configPath)) {
            await fs.remove(configPath);
            success(`Removed ${IdeRegistry.getDisplayName(ide)} configuration`);
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

