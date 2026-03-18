/**
 * AgileFlow CLI - Version Checker
 *
 * Checks for updates from npm registry.
 */

const semver = require('semver');
const path = require('node:path');
const { getLatestVersion } = require('./npm-utils');

// Load package.json for current version
const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
const packageJson = require(packageJsonPath);

/**
 * Check if an update is available
 * @returns {Promise<Object>} Update info
 */
async function checkForUpdate() {
  const currentVersion = packageJson.version;
  const latestVersion = await getLatestVersion();

  if (!latestVersion) {
    return {
      current: currentVersion,
      latest: null,
      updateAvailable: false,
      error: 'Could not check for updates',
    };
  }

  const updateAvailable = semver.gt(latestVersion, currentVersion);

  return {
    current: currentVersion,
    latest: latestVersion,
    updateAvailable,
    error: null,
  };
}

/**
 * Get current version
 * @returns {string}
 */
function getCurrentVersion() {
  return packageJson.version;
}

module.exports = {
  checkForUpdate,
  getCurrentVersion,
};
