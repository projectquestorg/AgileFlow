/**
 * AgileFlow CLI - Self-Update Module
 *
 * Provides self-update capability for the CLI to ensure users
 * always run the latest version.
 *
 * Usage:
 *   const { checkSelfUpdate, performSelfUpdate } = require('./lib/self-update');
 *   await checkSelfUpdate(options, 'update');
 */

const path = require('path');
const { spawnSync } = require('node:child_process');
const semver = require('semver');
const chalk = require('chalk');
const { getLatestVersion } = require('./npm-utils');
const { info } = require('./ui');

/**
 * Get the local CLI version from package.json
 * @returns {string} Local CLI version
 */
function getLocalVersion() {
  const packageJson = require(path.join(__dirname, '..', '..', '..', 'package.json'));
  return packageJson.version;
}

/**
 * Check if a self-update is needed
 * @param {Object} options - Command options
 * @param {boolean} [options.selfUpdate=true] - Whether self-update is enabled
 * @param {boolean} [options.selfUpdated=false] - Whether already self-updated
 * @returns {Promise<{needed: boolean, localVersion: string, latestVersion: string|null}>}
 */
async function checkSelfUpdate(options = {}) {
  const shouldCheck = options.selfUpdate !== false && !options.selfUpdated;

  if (!shouldCheck) {
    return {
      needed: false,
      localVersion: getLocalVersion(),
      latestVersion: null,
    };
  }

  const localVersion = getLocalVersion();
  const latestVersion = await getLatestVersion('agileflow');

  if (!latestVersion) {
    return {
      needed: false,
      localVersion,
      latestVersion: null,
    };
  }

  const needed = semver.lt(localVersion, latestVersion);

  return {
    needed,
    localVersion,
    latestVersion,
  };
}

/**
 * Perform self-update by re-running with latest CLI version
 * @param {string} command - Command name to re-run
 * @param {Object} options - Command options
 * @param {Object} versionInfo - Version info from checkSelfUpdate
 * @returns {number} Exit code from spawned process
 */
function performSelfUpdate(command, options, versionInfo) {
  const { localVersion, latestVersion } = versionInfo;

  // Display update notice
  console.log(chalk.hex('#e8683a').bold('\n  AgileFlow CLI Update\n'));
  info(`Updating CLI from v${localVersion} to v${latestVersion}...`);
  console.log(chalk.dim('  Fetching latest version from npm...\n'));

  // Build the command with all current options forwarded
  const args = ['agileflow@latest', command, '--self-updated'];

  // Forward common options
  if (options.directory) args.push('-d', options.directory);
  if (options.force) args.push('--force');

  // Forward command-specific options
  if (command === 'update' && options.ides) {
    args.push('--ides', options.ides);
  }

  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: process.platform === 'win32',
  });

  return result.status ?? 0;
}

/**
 * Check and perform self-update if needed
 * Returns true if the caller should exit (because update was performed)
 * @param {string} command - Command name
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if caller should exit
 */
async function handleSelfUpdate(command, options) {
  const versionInfo = await checkSelfUpdate(options);

  if (versionInfo.needed) {
    const exitCode = performSelfUpdate(command, options, versionInfo);
    process.exit(exitCode);
    return true; // Never reached, but for type safety
  }

  return false;
}

/**
 * Middleware for self-update check
 * @param {string} command - Command name
 * @returns {Function} Middleware function
 */
function selfUpdateMiddleware(command) {
  return async (ctx, next) => {
    const versionInfo = await checkSelfUpdate(ctx.options);

    if (versionInfo.needed) {
      const exitCode = performSelfUpdate(command, ctx.options, versionInfo);
      process.exit(exitCode);
      return; // Never reached
    }

    // Store version info in context for later use
    ctx.versionInfo = versionInfo;
    await next();
  };
}

module.exports = {
  getLocalVersion,
  checkSelfUpdate,
  performSelfUpdate,
  handleSelfUpdate,
  selfUpdateMiddleware,
};
