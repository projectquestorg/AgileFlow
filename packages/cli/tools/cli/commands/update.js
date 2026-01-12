/**
 * AgileFlow CLI - Update Command
 *
 * Updates an existing AgileFlow installation.
 * Includes self-update capability to always use the latest CLI.
 */

const chalk = require('chalk');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const semver = require('semver');
const { Installer } = require('../installers/core/installer');
const { IdeManager } = require('../installers/ide/manager');
const {
  displayLogo,
  displaySection,
  success,
  warning,
  error,
  info,
  confirm,
} = require('../lib/ui');
const { createDocsStructure, getDocsFolderName } = require('../lib/docs-setup');
const { getLatestVersion } = require('../lib/npm-utils');
const { ErrorHandler } = require('../lib/error-handler');

const installer = new Installer();
const ideManager = new IdeManager();

module.exports = {
  name: 'update',
  description: 'Update existing AgileFlow installation',
  options: [
    ['-d, --directory <path>', 'Project directory (default: current directory)'],
    ['--force', 'Force reinstall (skip prompts; overwrites local changes)'],
    ['--ides <list>', 'Comma-separated list of IDEs to update (overrides manifest)'],
    ['--no-self-update', 'Skip automatic CLI self-update check'],
    ['--self-updated', 'Internal flag: indicates CLI was already self-updated'],
  ],
  action: async options => {
    try {
      const directory = path.resolve(options.directory || '.');

      // Get local CLI version and npm registry version early to decide on self-update
      const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
      const localCliVersion = packageJson.version;
      const npmLatestVersion = await getLatestVersion('agileflow');

      // Self-update check: if CLI is outdated and we haven't already self-updated, re-run with latest
      const shouldSelfUpdate = options.selfUpdate !== false && !options.selfUpdated;
      if (npmLatestVersion && semver.lt(localCliVersion, npmLatestVersion) && shouldSelfUpdate) {
        // Don't show logo - the self-updated process will show it
        console.log(chalk.hex('#e8683a').bold('\n  AgileFlow CLI Update\n'));
        info(`Updating CLI from v${localCliVersion} to v${npmLatestVersion}...`);
        console.log(chalk.dim('  Fetching latest version from npm...\n'));

        // Build the command with all current options forwarded
        const args = ['agileflow@latest', 'update', '--self-updated'];
        if (options.directory) args.push('-d', options.directory);
        if (options.force) args.push('--force');
        if (options.ides) args.push('--ides', options.ides);

        const result = spawnSync('npx', args, {
          stdio: 'inherit',
          cwd: process.cwd(),
          shell: process.platform === 'win32',
        });

        // Exit with the same code as the spawned process
        process.exit(result.status ?? 0);
      }

      // Now show the logo (either first run without update, or after self-update)
      displayLogo();

      // Check for existing installation
      const status = await installer.getStatus(directory);

      if (!status.installed) {
        const handler = new ErrorHandler('update');
        handler.warning(
          'No AgileFlow installation found',
          'Initialize AgileFlow first',
          'npx agileflow setup'
        );
      }

      displaySection('Updating AgileFlow', `Current version: ${status.version}`);

      if (!npmLatestVersion) {
        warning('Could not check npm registry for latest version');
        console.log(chalk.dim('Continuing with local CLI version...\n'));
      }

      const latestVersion = npmLatestVersion || localCliVersion;

      console.log(chalk.bold('Currently installed:'), status.version);
      console.log(chalk.bold('CLI version:        '), localCliVersion);
      if (npmLatestVersion) {
        console.log(chalk.bold('Latest (npm):       '), npmLatestVersion);
      }

      // If we self-updated, show confirmation
      if (options.selfUpdated) {
        success(`CLI updated to v${localCliVersion}`);
        console.log();
      }

      // Check if CLI itself is still outdated (only if self-update was disabled)
      if (npmLatestVersion && semver.lt(localCliVersion, npmLatestVersion) && !shouldSelfUpdate) {
        console.log();
        warning('Your global CLI is outdated!');
        console.log(
          chalk.dim(
            `  You have a global installation at v${localCliVersion}, but v${npmLatestVersion} is available.\n`
          )
        );
        console.log(chalk.dim(`  Options:`));
        console.log(chalk.dim(`  1. Cancel and run: `) + chalk.cyan(`npx agileflow@latest update`));
        console.log(
          chalk.dim(`  2. Remove global:  `) +
            chalk.cyan(`npm uninstall -g agileflow`) +
            chalk.dim(` (recommended)`)
        );
        console.log(
          chalk.dim(`  3. Update global:  `) + chalk.cyan(`npm install -g agileflow@latest\n`)
        );

        const useOutdated = options.force
          ? true
          : await confirm('Continue with outdated CLI anyway?');
        if (!useOutdated) {
          console.log(chalk.dim('\nUpdate cancelled. Run: npx agileflow@latest update\n'));
          process.exit(0);
        }
      }

      // Check if project installation is up to date
      if (status.version === latestVersion && !options.force) {
        success('Already on the latest version');
        process.exit(0);
      }

      // Confirm update
      if (!options.force) {
        const proceed = await confirm(`Update to v${latestVersion}?`);
        if (!proceed) {
          console.log(chalk.dim('\nUpdate cancelled\n'));
          process.exit(0);
        }
      }

      console.log();

      // Get docs folder name from metadata (or default to 'docs')
      const docsFolder = await getDocsFolderName(directory);

      // Determine which IDEs to update
      let idesToUpdate;
      if (options.ides) {
        // User explicitly specified IDEs via --ides flag
        idesToUpdate = options.ides.split(',').map(ide => ide.trim().toLowerCase());
        console.log(chalk.dim(`Updating specified IDEs: ${idesToUpdate.join(', ')}`));
      } else {
        // Use IDEs from manifest
        idesToUpdate = status.ides || ['claude-code'];
        if (idesToUpdate.length > 1) {
          console.log(chalk.dim(`IDEs to update (from manifest): ${idesToUpdate.join(', ')}`));
          console.log(chalk.dim(`  Tip: Use --ides=claude-code to update only specific IDEs\n`));
        }
      }

      // Re-run installation with existing config from manifest
      const config = {
        directory,
        ides: idesToUpdate,
        userName: status.userName || 'Developer',
        agileflowFolder: status.agileflowFolder || path.basename(status.path),
        docsFolder: status.docsFolder || docsFolder,
      };

      // Run core installation
      const coreResult = await installer.install(config, { force: options.force });

      if (!coreResult.success) {
        const handler = new ErrorHandler('update');
        handler.warning(
          'Update failed',
          'Try running doctor to diagnose issues',
          'npx agileflow doctor --fix'
        );
      }

      success('Updated core content');
      if (coreResult.fileOps) {
        info(
          `Files: ${coreResult.fileOps.created} added, ${coreResult.fileOps.updated} updated, ${coreResult.fileOps.preserved} preserved`
        );
        if (coreResult.fileOps.updatesPath) {
          info(`Preserved-file updates saved to: ${coreResult.fileOps.updatesPath}`);
        }
        if (coreResult.fileOps.backupPath) {
          info(`Backup saved to: ${coreResult.fileOps.backupPath}`);
        }
        if (coreResult.fileOps.preserved > 0 && !options.force) {
          warning('Some local changes were preserved; use --force to overwrite them.');
        }
      }

      // Re-setup IDEs
      ideManager.setAgileflowFolder(config.agileflowFolder);
      ideManager.setDocsFolder(config.docsFolder);

      for (const ide of config.ides) {
        await ideManager.setup(ide, directory, status.path);
      }

      // Create/update docs structure (idempotent - only creates missing files)
      displaySection('Updating Documentation Structure', `Folder: ${config.docsFolder}/`);
      const docsResult = await createDocsStructure(directory, config.docsFolder, {
        updateGitignore: false,
      });

      if (!docsResult.success) {
        warning('Failed to update docs structure');
        if (docsResult.errors.length > 0) {
          docsResult.errors.forEach(err => error(`  ${err}`));
        }
      }

      console.log(chalk.green(`\n✨ Update complete! (${status.version} → ${latestVersion})\n`));

      // If running from outdated global installation, remind user to update it
      if (
        npmLatestVersion &&
        semver.lt(localCliVersion, npmLatestVersion) &&
        !options.selfUpdated
      ) {
        console.log(chalk.yellow('💡 Tip: Your global AgileFlow CLI is outdated.'));
        console.log(chalk.dim('   To avoid this message, either:'));
        console.log(chalk.dim('   • Remove global: npm uninstall -g agileflow (recommended)'));
        console.log(chalk.dim('   • Use npx:       npx agileflow@latest update'));
        console.log(chalk.dim('   • Update global: npm install -g agileflow@latest\n'));
      }

      process.exit(0);
    } catch (err) {
      const handler = new ErrorHandler('update');
      handler.critical(
        'Update failed',
        'Check network connection and disk space',
        'npx agileflow doctor',
        err
      );
    }
  },
};
