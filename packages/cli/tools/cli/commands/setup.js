/**
 * AgileFlow CLI - Setup Command
 *
 * Sets up AgileFlow in a project directory.
 * Includes self-update capability to always use the latest CLI.
 */

const chalk = require('chalk');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const semver = require('semver');
const { Installer } = require('../installers/core/installer');
const { IdeManager } = require('../installers/ide/manager');
const {
  promptInstall,
  success,
  error,
  info,
  displaySection,
  displayLogo,
  warning,
} = require('../lib/ui');
const { createDocsStructure } = require('../lib/docs-setup');
const { getLatestVersion } = require('../lib/npm-utils');
const { ErrorHandler } = require('../lib/error-handler');

const installer = new Installer();
const ideManager = new IdeManager();

module.exports = {
  name: 'setup',
  description: 'Set up AgileFlow in a project',
  options: [
    ['-d, --directory <path>', 'Installation directory (default: current directory)'],
    ['-y, --yes', 'Skip prompts and use defaults'],
    ['--no-self-update', 'Skip automatic CLI self-update check'],
    ['--self-updated', 'Internal flag: indicates CLI was already self-updated'],
  ],
  action: async options => {
    try {
      // Self-update check: fetch latest version if CLI is outdated
      const shouldSelfUpdate = options.selfUpdate !== false && !options.selfUpdated;

      if (shouldSelfUpdate) {
        const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
        const localCliVersion = packageJson.version;
        const npmLatestVersion = await getLatestVersion('agileflow');

        if (npmLatestVersion && semver.lt(localCliVersion, npmLatestVersion)) {
          // Don't show logo here - it will be shown by promptInstall() or after self-update
          console.log(chalk.hex('#e8683a').bold('\n  AgileFlow Update Available\n'));
          info(`Newer version available: v${localCliVersion} → v${npmLatestVersion}`);
          console.log(chalk.dim('  Fetching latest version from npm...\n'));

          // Build the command with all current options forwarded
          const args = ['agileflow@latest', 'setup', '--self-updated'];
          if (options.directory) args.push('-d', options.directory);
          if (options.yes) args.push('-y');

          const result = spawnSync('npx', args, {
            stdio: 'inherit',
            cwd: process.cwd(),
            shell: process.platform === 'win32',
          });

          // Exit with the same code as the spawned process
          process.exit(result.status ?? 0);
        }
      }

      // If we self-updated, show confirmation
      if (options.selfUpdated) {
        const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
        // Only show logo here if using -y flag (since promptInstall won't be called)
        if (options.yes) {
          displayLogo();
        }
        success(`Using latest CLI v${packageJson.version}`);
        console.log();
      }

      let config;

      if (options.yes) {
        // Use defaults
        config = {
          directory: path.resolve(options.directory || '.'),
          ides: ['claude-code'],
          userName: 'Developer',
          agileflowFolder: '.agileflow',
          docsFolder: 'docs',
          updateGitignore: true,
        };
      } else {
        // Interactive prompts
        config = await promptInstall();
      }

      displaySection('Setting Up AgileFlow', `Target: ${config.directory}`);

      // Run core installation
      const coreResult = await installer.install(config);

      if (!coreResult.success) {
        const handler = new ErrorHandler('setup');
        handler.warning('Core setup failed', 'Check directory permissions', 'npx agileflow doctor');
      }

      success(`Installed ${coreResult.counts.agents} agents`);
      success(`Installed ${coreResult.counts.commands} commands`);
      success(`Installed ${coreResult.counts.skills} skills`);

      // Setup IDE configurations
      displaySection('Configuring IDEs');

      ideManager.setAgileflowFolder(config.agileflowFolder);
      ideManager.setDocsFolder(config.docsFolder);

      for (const ide of config.ides) {
        await ideManager.setup(ide, config.directory, coreResult.path);
      }

      // Create docs structure
      displaySection('Creating Documentation Structure', `Folder: ${config.docsFolder}/`);
      const docsResult = await createDocsStructure(config.directory, config.docsFolder, {
        updateGitignore: config.updateGitignore,
      });

      if (!docsResult.success) {
        error('Failed to create docs structure');
        if (docsResult.errors.length > 0) {
          docsResult.errors.forEach(err => error(`  ${err}`));
        }
      }

      // Final summary
      console.log(chalk.green('\n✨ Setup complete!\n'));

      console.log(chalk.bold('Get started:'));
      info('Open your IDE and use /agileflow:help');
      info(`Run 'npx agileflow status' to check setup`);
      info(`Run 'npx agileflow update' to get updates`);

      console.log(chalk.dim(`\nInstalled to: ${coreResult.path}\n`));

      process.exit(0);
    } catch (err) {
      const handler = new ErrorHandler('setup');
      handler.critical(
        'Setup failed',
        'Check directory exists and has write permissions',
        'npx agileflow doctor',
        err
      );
    }
  },
};
