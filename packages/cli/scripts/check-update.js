#!/usr/bin/env node

/**
 * check-update.js - Check for AgileFlow updates
 *
 * Simple update checker:
 * - Always checks npm registry for latest version
 * - Auto-updates if update is available (enabled by default)
 * - Fast npm metadata lookup (~100-500ms)
 *
 * Usage:
 *   node check-update.js [--json]
 *
 * Environment:
 *   DEBUG_UPDATE=1  Enable debug logging
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Shared utilities
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../lib/errors');

// Debug mode
const DEBUG = process.env.DEBUG_UPDATE === '1';

function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[check-update] ${message}`, data ? JSON.stringify(data) : '');
  }
}

// Get installed AgileFlow version
function getInstalledVersion(rootDir) {
  // First check .agileflow/config.yaml (installed version)
  try {
    const configPath = path.join(rootDir, '.agileflow', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const versionMatch = content.match(/^version:\s*['"]?([0-9.]+)/m);
      if (versionMatch) {
        return versionMatch[1];
      }
    }
  } catch (err) {
    debugLog('Error reading .agileflow/config.yaml', err.message);
  }

  // Fallback: check if this is the AgileFlow dev repo
  const cliPkg = path.join(rootDir, 'packages/cli/package.json');
  const cliResult = safeReadJSON(cliPkg);
  if (cliResult.ok && cliResult.data?.name === 'agileflow' && cliResult.data?.version) {
    return cliResult.data.version;
  }

  return null;
}

// Get update configuration from metadata
function getUpdateConfig(rootDir) {
  const defaults = {
    autoUpdate: true, // Auto-update enabled by default
    showChangelog: true,
    lastSeenVersion: null,
  };

  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (!result.ok) {
    debugLog('Error reading update config', result.error);
    return defaults;
  }

  if (result.data?.updates) {
    return { ...defaults, ...result.data.updates };
  }

  return defaults;
}

// Save update configuration
function saveUpdateConfig(rootDir, config) {
  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');

  // Read existing metadata
  const readResult = safeReadJSON(metadataPath, { defaultValue: {} });
  const metadata = readResult.ok ? readResult.data : {};

  // Update and write
  metadata.updates = config;
  const writeResult = safeWriteJSON(metadataPath, metadata, { createDir: true });

  if (!writeResult.ok) {
    debugLog('Error saving update config', writeResult.error);
    return false;
  }

  return true;
}

// Fetch latest version from npm
async function fetchLatestVersion() {
  return new Promise(resolve => {
    const options = {
      hostname: 'registry.npmjs.org',
      port: 443,
      path: '/agileflow/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'agileflow-cli',
      },
    };

    debugLog('Fetching from npm registry');

    const req = https.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          debugLog('Non-200 status', { statusCode: res.statusCode });
          return resolve(null);
        }

        try {
          const json = JSON.parse(data);
          debugLog('Version found', { version: json.version });
          resolve(json.version || null);
        } catch (err) {
          debugLog('JSON parse error', err.message);
          resolve(null);
        }
      });
    });

    req.on('error', err => {
      debugLog('Network error', err.message);
      resolve(null);
    });

    req.setTimeout(5000, () => {
      debugLog('Request timeout');
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

// Compare semantic versions: returns -1 if a < b, 0 if equal, 1 if a > b
function compareVersions(a, b) {
  if (!a || !b) return 0;
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

// Main check function - always checks npm
async function checkForUpdates() {
  const rootDir = getProjectRoot();
  const installedVersion = getInstalledVersion(rootDir);
  const config = getUpdateConfig(rootDir);

  const result = {
    installed: installedVersion,
    latest: null,
    updateAvailable: false,
    autoUpdate: config.autoUpdate,
    justUpdated: false,
    previousVersion: config.lastSeenVersion,
    error: null,
  };

  // No installed version found
  if (!installedVersion) {
    result.error = 'Could not determine installed version';
    return result;
  }

  // Check if we just updated (lastSeenVersion < installed)
  if (config.lastSeenVersion && compareVersions(config.lastSeenVersion, installedVersion) < 0) {
    result.justUpdated = true;
    result.previousVersion = config.lastSeenVersion;
  }

  // Always fetch from npm
  result.latest = await fetchLatestVersion();

  // Compare versions
  if (result.latest && compareVersions(installedVersion, result.latest) < 0) {
    result.updateAvailable = true;
  }

  return result;
}

// Mark version as seen (after update or dismissal)
function markVersionSeen(version) {
  const rootDir = getProjectRoot();
  const config = getUpdateConfig(rootDir);
  config.lastSeenVersion = version;
  saveUpdateConfig(rootDir, config);
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const markSeen = args.includes('--mark-seen');

  if (markSeen) {
    const version = args[args.indexOf('--mark-seen') + 1];
    if (version) {
      markVersionSeen(version);
      if (jsonOutput) {
        console.log(JSON.stringify({ success: true, version }));
      } else {
        console.log(`Marked version ${version} as seen`);
      }
    }
    return;
  }

  const result = await checkForUpdates();

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.error) {
      console.log(`Error: ${result.error}`);
    } else if (result.justUpdated) {
      console.log(`Updated from v${result.previousVersion} to v${result.installed}`);
    } else if (result.updateAvailable) {
      console.log(`Update available: v${result.installed} -> v${result.latest}`);
      console.log(`Run: npx agileflow update`);
    } else {
      console.log(`AgileFlow v${result.installed} is up to date`);
    }
  }
}

// Export for use as module
module.exports = {
  checkForUpdates,
  markVersionSeen,
  getUpdateConfig,
  saveUpdateConfig,
  compareVersions,
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
