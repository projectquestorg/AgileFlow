/**
 * AgileFlow CLI - Setup Command
 *
 * Sets up AgileFlow in a project directory.
 * Includes self-update capability to always use the latest CLI.
 */

const chalk = require('chalk');
const path = require('node:path');
const fs = require('node:fs');
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
          claudeMdReinforcement: true,
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

      // Report shell alias setup
      if (coreResult.shellAliases) {
        if (coreResult.shellAliases.configured.length > 0) {
          success(`Added 'claude' alias to: ${coreResult.shellAliases.configured.join(', ')}`);
        }
        if (coreResult.shellAliases.skipped.length > 0) {
          info(`Shell aliases skipped: ${coreResult.shellAliases.skipped.join(', ')}`);
        }
      }

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

      // CLAUDE.md reinforcement for /babysit AskUserQuestion rules
      if (config.claudeMdReinforcement) {
        const claudeMdPath = path.join(config.directory, 'CLAUDE.md');
        const claudeMdMarker = '<!-- AGILEFLOW_BABYSIT_RULES -->';
        const claudeMdContent = `

${claudeMdMarker}
## AgileFlow /babysit Context Preservation Rules

When \`/agileflow:babysit\` is active (check session-state.json), these rules are MANDATORY:

1. **ALWAYS end responses with the AskUserQuestion tool** - Not text like "What next?" but the ACTUAL TOOL CALL
2. **Use Plan Mode for non-trivial tasks** - Call \`EnterPlanMode\` before complex implementations
3. **Delegate complex work to domain experts** - Use \`Task\` tool with appropriate \`subagent_type\`
4. **Track progress with TodoWrite** - For any task with 3+ steps

These rules persist across conversation compaction. Check \`docs/09-agents/session-state.json\` for active commands.
${claudeMdMarker}
`;

        try {
          let existingContent = '';
          if (fs.existsSync(claudeMdPath)) {
            existingContent = fs.readFileSync(claudeMdPath, 'utf8');
          }

          // Only append if marker doesn't exist
          if (!existingContent.includes(claudeMdMarker)) {
            fs.appendFileSync(claudeMdPath, claudeMdContent);
            success('Added /babysit rules to CLAUDE.md');
          } else {
            info('CLAUDE.md already has /babysit rules');
          }
        } catch (err) {
          warning(`Could not update CLAUDE.md: ${err.message}`);
        }
      }

      // Update metadata with config tracking
      try {
        const metadataPath = path.join(config.directory, config.docsFolder, '00-meta', 'agileflow-metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));

          // Track config schema version and profile
          metadata.config_schema_version = packageJson.version;
          metadata.active_profile = options.yes ? 'default' : null; // null = custom

          // Track config options that were configured
          if (!metadata.agileflow) metadata.agileflow = {};
          if (!metadata.agileflow.config_options) metadata.agileflow.config_options = {};

          metadata.agileflow.config_options.claudeMdReinforcement = {
            available_since: '2.92.0',
            configured: true,
            enabled: config.claudeMdReinforcement,
            configured_at: new Date().toISOString(),
            description: 'Add /babysit AskUserQuestion rules to CLAUDE.md',
          };

          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
        }
      } catch (err) {
        // Silently fail - metadata tracking is non-critical
      }

      // Final summary
      console.log(chalk.green('\n✨ Setup complete!\n'));

      console.log(chalk.bold('Get started:'));
      info('Open your IDE and use /agileflow:help');
      info(`Run 'npx agileflow status' to check setup`);
      info(`Run 'npx agileflow update' to get updates`);

      // Shell alias reload reminder
      if (coreResult.shellAliases?.configured?.length > 0) {
        console.log(chalk.bold('\nShell aliases:'));
        info(`Reload shell to use: ${chalk.cyan('source ~/.bashrc')} or ${chalk.cyan('source ~/.zshrc')}`);
        info(`Then run ${chalk.cyan('claude')} to auto-start in tmux session`);
      }

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
