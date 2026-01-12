/**
 * AgileFlow CLI - Config Command
 *
 * Manage AgileFlow configuration without re-running setup.
 */

const chalk = require('chalk');
const path = require('node:path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const { Installer } = require('../installers/core/installer');
const { IdeManager } = require('../installers/ide/manager');
const { displayLogo, displaySection, success, warning, error, info } = require('../lib/ui');
const { ErrorHandler } = require('../lib/error-handler');

const installer = new Installer();
const ideManager = new IdeManager();

module.exports = {
  name: 'config',
  description: 'Manage AgileFlow configuration',
  arguments: [
    ['<subcommand>', 'Subcommand: list, get, set'],
    ['[key]', 'Config key (for get/set)'],
    ['[value]', 'Config value (for set)'],
  ],
  options: [['-d, --directory <path>', 'Project directory (default: current directory)']],
  action: async (subcommand, keyOrValue, valueOrUndefined, options) => {
    try {
      const directory = path.resolve(options.directory || '.');

      // Get installation status
      const status = await installer.getStatus(directory);

      if (!status.installed) {
        displayLogo();
        const handler = new ErrorHandler('config');
        handler.warning(
          'No AgileFlow installation found',
          'Initialize AgileFlow first',
          'npx agileflow setup'
        );
      }

      const manifestPath = path.join(status.path, '_cfg', 'manifest.yaml');

      // Handle subcommands
      switch (subcommand) {
        case 'list':
          await handleList(status);
          break;

        case 'get':
          await handleGet(status, keyOrValue);
          break;

        case 'set':
          await handleSet(directory, status, manifestPath, keyOrValue, valueOrUndefined);
          break;

        default:
          displayLogo();
          console.log(chalk.bold('Usage:\n'));
          console.log('  npx agileflow config list');
          console.log('  npx agileflow config get <key>');
          console.log('  npx agileflow config set <key> <value>\n');
          console.log(chalk.bold('Keys:\n'));
          console.log('  userName           Your name for config files');
          console.log(
            '  ides               Comma-separated IDE list (claude-code,cursor,windsurf)'
          );
          console.log('  agileflowFolder    AgileFlow folder name (e.g., .agileflow)');
          console.log('  docsFolder         Documentation folder name (e.g., docs)\n');
          console.log(chalk.bold('Examples:\n'));
          console.log('  npx agileflow config get userName');
          console.log('  npx agileflow config set userName "Jane Developer"');
          console.log('  npx agileflow config set ides "claude-code,cursor"\n');
          process.exit(0);
      }

      process.exit(0);
    } catch (err) {
      const handler = new ErrorHandler('config');
      handler.critical(
        'Configuration operation failed',
        'Check manifest file integrity',
        'npx agileflow doctor --fix',
        err
      );
    }
  },
};

/**
 * Handle list subcommand
 */
async function handleList(status) {
  displayLogo();
  displaySection('AgileFlow Configuration');

  console.log(chalk.bold('User Settings:'));
  console.log(`  userName:         ${chalk.cyan(status.userName || 'Developer')}`);
  console.log();

  console.log(chalk.bold('IDE Settings:'));
  const ides = status.ides || ['claude-code'];
  console.log(`  ides:             ${chalk.cyan(ides.join(', '))}`);
  console.log();

  console.log(chalk.bold('Folder Settings:'));
  console.log(`  agileflowFolder:  ${chalk.cyan(status.agileflowFolder || '.agileflow')}`);
  console.log(`  docsFolder:       ${chalk.cyan(status.docsFolder || 'docs')}`);
  console.log();

  console.log(chalk.bold('System Info:'));
  console.log(`  version:          ${chalk.cyan(status.version || 'unknown')}`);
  console.log(
    `  installed:        ${chalk.cyan(status.installedAt ? new Date(status.installedAt).toLocaleDateString() : 'unknown')}`
  );
  console.log(
    `  updated:          ${chalk.cyan(status.updatedAt ? new Date(status.updatedAt).toLocaleDateString() : 'unknown')}`
  );
  console.log();
}

/**
 * Handle get subcommand
 */
async function handleGet(status, key) {
  const handler = new ErrorHandler('config');

  if (!key) {
    handler.warning(
      'Missing key',
      'Provide a config key to get',
      'npx agileflow config get <key>'
    );
  }

  const validKeys = ['userName', 'ides', 'agileflowFolder', 'docsFolder', 'version'];

  if (!validKeys.includes(key)) {
    handler.warning(
      `Invalid key: ${key}`,
      `Valid keys: ${validKeys.join(', ')}`,
      'npx agileflow config list'
    );
  }

  let value;
  switch (key) {
    case 'userName':
      value = status.userName || 'Developer';
      break;
    case 'ides':
      value = (status.ides || ['claude-code']).join(',');
      break;
    case 'agileflowFolder':
      value = status.agileflowFolder || '.agileflow';
      break;
    case 'docsFolder':
      value = status.docsFolder || 'docs';
      break;
    case 'version':
      value = status.version || 'unknown';
      break;
  }

  console.log(value);
}

/**
 * Handle set subcommand
 */
async function handleSet(directory, status, manifestPath, key, value) {
  const handler = new ErrorHandler('config');

  if (!key || value === undefined) {
    handler.warning(
      'Missing arguments',
      'Provide both key and value',
      'npx agileflow config set <key> <value>'
    );
  }

  const validKeys = ['userName', 'ides', 'agileflowFolder', 'docsFolder'];

  if (!validKeys.includes(key)) {
    handler.warning(
      `Invalid key: ${key}`,
      `Valid keys: ${validKeys.join(', ')}`,
      'npx agileflow config list'
    );
  }

  displayLogo();
  displaySection('Updating Configuration');

  // Read current manifest
  const manifestContent = await fs.readFile(manifestPath, 'utf8');
  const manifest = yaml.load(manifestContent);

  // Track if we need to update IDE configs
  let needsIdeUpdate = false;
  const oldIdes = manifest.ides || [];

  // Update the value
  switch (key) {
    case 'userName':
      manifest.user_name = value;
      info(`Setting userName to: ${chalk.cyan(value)}`);
      break;

    case 'ides': {
      const newIdes = value.split(',').map(ide => ide.trim());
      const validIdes = ['claude-code', 'cursor', 'windsurf'];

      // Validate IDEs
      for (const ide of newIdes) {
        if (!validIdes.includes(ide)) {
          handler.warning(
            `Invalid IDE: ${ide}`,
            `Valid IDEs: ${validIdes.join(', ')}`,
            'npx agileflow config set ides "claude-code,cursor"'
          );
        }
      }

      manifest.ides = newIdes;
      needsIdeUpdate = true;
      info(`Setting ides to: ${chalk.cyan(newIdes.join(', '))}`);
      break;
    }

    case 'agileflowFolder':
      warning('Changing agileflowFolder requires moving the installation directory.');
      console.log(
        chalk.dim('This change will only update the config - you must move files manually.\n')
      );
      manifest.agileflow_folder = value;
      info(`Setting agileflowFolder to: ${chalk.cyan(value)}`);
      break;

    case 'docsFolder':
      manifest.docs_folder = value;
      info(`Setting docsFolder to: ${chalk.cyan(value)}`);
      break;
  }

  // Update timestamp
  manifest.updated_at = new Date().toISOString();

  // Write manifest
  await fs.writeFile(manifestPath, yaml.dump(manifest), 'utf8');
  success('Configuration updated');

  // Update IDE configs if needed
  if (needsIdeUpdate) {
    console.log();
    info('Updating IDE configurations...');

    ideManager.setAgileflowFolder(manifest.agileflow_folder || '.agileflow');
    ideManager.setDocsFolder(manifest.docs_folder || 'docs');

    // Remove old IDE configs
    for (const ide of oldIdes) {
      if (!manifest.ides.includes(ide)) {
        const configPath = getIdeConfigPath(directory, ide);
        if (await fs.pathExists(configPath)) {
          await fs.remove(configPath);
          info(`Removed ${formatIdeName(ide)} configuration`);
        }
      }
    }

    // Add new IDE configs
    for (const ide of manifest.ides) {
      await ideManager.setup(ide, directory, status.path);
      success(`Updated ${formatIdeName(ide)} configuration`);
    }

    console.log();
    success('IDE configurations updated');
  }

  console.log();
}

/**
 * Get IDE config path
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
 */
function formatIdeName(ide) {
  const names = {
    'claude-code': 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
  };

  return names[ide] || ide;
}
