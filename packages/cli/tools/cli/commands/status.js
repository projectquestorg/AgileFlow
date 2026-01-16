/**
 * AgileFlow CLI - Status Command
 *
 * Shows installation status for the current project.
 */

const chalk = require('chalk');
const path = require('node:path');
const fs = require('fs-extra');
const ora = require('ora');
const { Installer } = require('../installers/core/installer');
const { displayLogo, displaySection, success, warning, info } = require('../lib/ui');
const { checkForUpdate } = require('../lib/version-checker');
const { IdeRegistry } = require('../lib/ide-registry');
const { formatKeyValue, formatList, isTTY } = require('../../../lib/table-formatter');

const installer = new Installer();

module.exports = {
  name: 'status',
  description: 'Show AgileFlow installation status',
  options: [['-d, --directory <path>', 'Project directory (default: current directory)']],
  action: async options => {
    try {
      const directory = path.resolve(options.directory || '.');

      displayLogo();
      displaySection('Installation Status');

      const status = await installer.getStatus(directory);

      if (!status.installed) {
        warning('No AgileFlow installation found in this directory');
        console.log(chalk.dim(`\nRun 'npx agileflow setup' to set up AgileFlow\n`));
        process.exit(0);
      }

      // Show installation info using formatKeyValue
      console.log(formatKeyValue({
        Location: status.path,
        Version: status.version,
      }));

      // Count installed items
      const counts = await installer.countInstalledItems(status.path);

      console.log(formatKeyValue({
        '\nCore': chalk.green('✓ Installed'),
      }, { alignValues: false }));
      info(`${counts.agents} agents`);
      info(`${counts.commands} commands`);
      info(`${counts.skills} skills`);

      // Show configured IDEs
      if (status.ides && status.ides.length > 0) {
        console.log(chalk.bold('\nConfigured IDEs:'));
        for (const ide of status.ides) {
          // Check if IDE config exists
          const ideConfigPath = IdeRegistry.getConfigPath(ide, directory);
          const exists = await fs.pathExists(ideConfigPath);

          if (exists) {
            success(IdeRegistry.getDisplayName(ide));
          } else {
            warning(`${IdeRegistry.getDisplayName(ide)} (config missing)`);
          }
        }
      }

      // Check for updates
      const spinner = ora('Checking for updates...').start();
      const updateInfo = await checkForUpdate();
      spinner.stop();

      if (updateInfo.updateAvailable) {
        console.log(chalk.bold('\nUpdate Available:'));
        console.log(chalk.yellow(`  ${updateInfo.current} → ${updateInfo.latest}`));
        console.log(chalk.dim(`  Run 'npx agileflow update' to update\n`));
      } else if (updateInfo.error) {
        console.log(chalk.dim(`\n${updateInfo.error}\n`));
      } else {
        console.log(chalk.green('\n✓ You are on the latest version\n'));
      }

      process.exit(0);
    } catch (err) {
      console.error(chalk.red('Error:'), err.message);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  },
};

