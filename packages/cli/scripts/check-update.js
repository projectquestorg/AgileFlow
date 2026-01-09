#!/usr/bin/env node

/**
 * check-update.js - Check for AgileFlow updates with caching
 *
 * Features:
 * - Checks npm registry for latest version
 * - Caches results to avoid excessive requests
 * - Configurable check frequency (hourly, daily, weekly)
 * - Returns structured JSON for easy parsing
 *
 * Usage:
 *   node check-update.js [--force] [--json]
 *
 * Options:
 *   --force  Bypass cache and check npm directly
 *   --json   Output as JSON (default is human-readable)
 *
 * Environment:
 *   DEBUG_UPDATE=1  Enable debug logging
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Shared utilities
const { getProjectRoot } = require('../lib/paths');

// Debug mode
const DEBUG = process.env.DEBUG_UPDATE === '1';

function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[check-update] ${message}`, data ? JSON.stringify(data) : '');
  }
}

// Get installed AgileFlow version
function getInstalledVersion(rootDir) {
  // First check .agileflow/package.json (installed version)
  const agileflowPkg = path.join(rootDir, '.agileflow', 'package.json');
  if (fs.existsSync(agileflowPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(agileflowPkg, 'utf8'));
      if (pkg.version) return pkg.version;
    } catch (e) {
      debugLog('Error reading .agileflow/package.json', e.message);
    }
  }

  // Fallback: check if this is the AgileFlow dev repo
  const cliPkg = path.join(rootDir, 'packages/cli/package.json');
  if (fs.existsSync(cliPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(cliPkg, 'utf8'));
      if (pkg.name === 'agileflow' && pkg.version) return pkg.version;
    } catch (e) {}
  }

  return null;
}

// Get update configuration from metadata
function getUpdateConfig(rootDir) {
  const defaults = {
    autoUpdate: false,
    checkFrequency: 'daily', // hourly, daily, weekly, never
    showChangelog: true,
    lastCheck: null,
    lastSeenVersion: null,
    latestVersion: null,
  };

  try {
    const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata.updates) {
        return { ...defaults, ...metadata.updates };
      }
    }
  } catch (e) {
    debugLog('Error reading update config', e.message);
  }

  return defaults;
}

// Save update configuration
function saveUpdateConfig(rootDir, config) {
  try {
    const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
    let metadata = {};

    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }

    metadata.updates = config;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
    return true;
  } catch (e) {
    debugLog('Error saving update config', e.message);
    return false;
  }
}

// Check if cache is still valid
function isCacheValid(config) {
  if (!config.lastCheck) return false;

  const now = Date.now();
  const lastCheck = new Date(config.lastCheck).getTime();
  const age = now - lastCheck;

  // Convert frequency to milliseconds
  const frequencies = {
    hourly: 60 * 60 * 1000, // 1 hour
    daily: 24 * 60 * 60 * 1000, // 24 hours
    weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    never: Infinity,
  };

  const maxAge = frequencies[config.checkFrequency] || frequencies.daily;

  debugLog('Cache check', {
    lastCheck: config.lastCheck,
    ageMs: age,
    maxAgeMs: maxAge,
    valid: age < maxAge,
  });

  return age < maxAge;
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

// Main check function
async function checkForUpdates(options = {}) {
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
    fromCache: false,
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

  // Use cache if valid and not forced
  if (!options.force && isCacheValid(config) && config.latestVersion) {
    result.latest = config.latestVersion;
    result.fromCache = true;
  } else if (config.checkFrequency !== 'never') {
    // Fetch from npm
    result.latest = await fetchLatestVersion();

    // Update cache
    if (result.latest) {
      config.lastCheck = new Date().toISOString();
      config.latestVersion = result.latest;
      saveUpdateConfig(rootDir, config);
    }
  }

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
  const force = args.includes('--force');
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

  const result = await checkForUpdates({ force });

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
