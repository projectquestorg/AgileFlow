/**
 * configure-repair.js - Repair and diagnostic functions for agileflow-configure
 *
 * Extracted from agileflow-configure.js (US-0094)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {
  c,
  log,
  success,
  warn,
  error,
  info,
  header,
  ensureDir,
  readJSON,
} = require('./configure-utils');
const { FEATURES } = require('./configure-features');

// ============================================================================
// SCRIPT REGISTRY
// ============================================================================

const ALL_SCRIPTS = {
  // Core feature scripts (linked to FEATURES)
  'agileflow-welcome.js': { feature: 'sessionstart', required: true },
  'precompact-context.sh': { feature: 'precompact', required: true },
  'ralph-loop.js': { feature: 'ralphloop', required: true },
  'auto-self-improve.js': { feature: 'selfimprove', required: true },
  'archive-completed-stories.sh': { feature: 'archival', required: true },
  'agileflow-statusline.sh': { feature: 'statusline', required: true },
  'damage-control-bash.js': { feature: 'damagecontrol', required: true },
  'damage-control-edit.js': { feature: 'damagecontrol', required: true },
  'damage-control-write.js': { feature: 'damagecontrol', required: true },

  // Support scripts (used by commands/agents)
  'obtain-context.js': { usedBy: ['/babysit', '/mentor', '/sprint'] },
  'session-manager.js': { usedBy: ['/session:new', '/session:resume'] },
  'check-update.js': { usedBy: ['SessionStart hook'] },
  'get-env.js': { usedBy: ['SessionStart hook'] },
  'clear-active-command.js': { usedBy: ['session commands'] },

  // Utility scripts
  'compress-status.sh': { usedBy: ['/compress'] },
  'validate-expertise.sh': { usedBy: ['/validate-expertise'] },
  'expertise-metrics.sh': { usedBy: ['agent experts'] },
  'session-coordinator.sh': { usedBy: ['session management'] },
  'validate-tokens.sh': { usedBy: ['token validation'] },
  'worktree-create.sh': { usedBy: ['/session:new'] },
  'resume-session.sh': { usedBy: ['/session:resume'] },
  'init.sh': { usedBy: ['/session:init'] },
  'agileflow-configure.js': { usedBy: ['/configure'] },
  'generate-all.sh': { usedBy: ['content generation'] },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate SHA256 hash of data
 * @param {Buffer|string} data - Data to hash
 * @returns {string} Hex hash string
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Get the source scripts directory (from npm package)
 * @returns {string|null} Path to source scripts or null
 */
function getSourceScriptsDir() {
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'scripts'), // npm package structure
    path.join(__dirname, '..'), // Same directory (for development)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'agileflow-welcome.js'))) {
      return p;
    }
  }

  return null;
}

// ============================================================================
// LIST SCRIPTS
// ============================================================================

/**
 * List all scripts with their status
 */
function listScripts() {
  header('Installed Scripts');

  const scriptsDir = path.join(process.cwd(), '.agileflow', 'scripts');
  const fileIndexPath = path.join(process.cwd(), '.agileflow', '_cfg', 'files.json');
  const fileIndex = readJSON(fileIndexPath);

  let missing = 0;
  let modified = 0;
  let present = 0;

  Object.entries(ALL_SCRIPTS).forEach(([script, info]) => {
    const scriptPath = path.join(scriptsDir, script);
    const exists = fs.existsSync(scriptPath);

    // Check if modified
    let isModified = false;
    if (exists && fileIndex?.files?.[`scripts/${script}`]) {
      try {
        const currentHash = sha256(fs.readFileSync(scriptPath));
        const indexHash = fileIndex.files[`scripts/${script}`].sha256;
        isModified = currentHash !== indexHash;
      } catch {}
    }

    // Print status
    if (!exists) {
      log(`   ${script}: MISSING`, c.red);
      if (info.usedBy) log(`     - Used by: ${info.usedBy.join(', ')}`, c.dim);
      if (info.feature) log(`     - Feature: ${info.feature}`, c.dim);
      missing++;
    } else if (isModified) {
      log(`   ${script}: modified (local changes)`, c.yellow);
      modified++;
    } else {
      log(`   ${script}: present`, c.green);
      present++;
    }
  });

  // Summary
  log('');
  log(`Summary: ${present} present, ${modified} modified, ${missing} missing`, c.dim);

  if (missing > 0) {
    log('\n Run with --repair to restore missing scripts', c.yellow);
  }
}

// ============================================================================
// VERSION INFO
// ============================================================================

/**
 * Show version information
 * @param {string} version - Current CLI version
 */
function showVersionInfo(version) {
  header('Version Information');

  const meta = readJSON('docs/00-meta/agileflow-metadata.json') || {};
  const installedVersion = meta.version || 'unknown';

  log(`Installed:  v${installedVersion}`);
  log(`CLI:        v${version}`);

  // Check npm for latest
  let latestVersion = null;
  try {
    latestVersion = execSync('npm view agileflow version 2>/dev/null', { encoding: 'utf8' }).trim();
    log(`Latest:     v${latestVersion}`);

    if (installedVersion !== 'unknown' && latestVersion && installedVersion !== latestVersion) {
      const installed = installedVersion.split('.').map(Number);
      const latest = latestVersion.split('.').map(Number);

      if (
        latest[0] > installed[0] ||
        (latest[0] === installed[0] && latest[1] > installed[1]) ||
        (latest[0] === installed[0] && latest[1] === installed[1] && latest[2] > installed[2])
      ) {
        log('\n Update available! Run: npx agileflow update', c.yellow);
      }
    }
  } catch {
    log('Latest:     (could not check npm)', c.dim);
  }

  // Show per-feature versions
  if (meta.features && Object.keys(meta.features).length > 0) {
    header('Feature Versions:');
    Object.entries(meta.features).forEach(([feature, data]) => {
      if (!data) return;
      const featureVersion = data.version || 'unknown';
      const enabled = data.enabled !== false;
      const outdated = featureVersion !== version && enabled;

      let icon = '';
      let color = c.dim;
      let statusText = `v${featureVersion}`;

      if (!enabled) {
        statusText = 'disabled';
      } else if (outdated) {
        icon = '';
        color = c.yellow;
        statusText = `v${featureVersion} -> v${version}`;
      } else {
        icon = '';
        color = c.green;
      }

      log(`  ${icon} ${feature}: ${statusText}`, color);
    });
  }

  // Show installation metadata
  if (meta.created || meta.updated) {
    header('Installation:');
    if (meta.created) log(`  Created:  ${new Date(meta.created).toLocaleDateString()}`, c.dim);
    if (meta.updated) log(`  Updated:  ${new Date(meta.updated).toLocaleDateString()}`, c.dim);
  }
}

// ============================================================================
// REPAIR SCRIPTS
// ============================================================================

/**
 * Repair missing or corrupted scripts
 * @param {string|null} targetFeature - Specific feature to repair, or null for all
 * @returns {boolean} Whether any repairs were made
 */
function repairScripts(targetFeature = null) {
  header('Repairing Scripts...');

  const scriptsDir = path.join(process.cwd(), '.agileflow', 'scripts');
  const sourceDir = getSourceScriptsDir();

  if (!sourceDir) {
    warn('Could not find source scripts directory');
    info('Try running: npx agileflow@latest update');
    return false;
  }

  let repaired = 0;
  let errors = 0;
  let skipped = 0;

  // Determine which scripts to check
  const scriptsToCheck = targetFeature
    ? Object.entries(ALL_SCRIPTS).filter(([_, info]) => info.feature === targetFeature)
    : Object.entries(ALL_SCRIPTS);

  if (scriptsToCheck.length === 0 && targetFeature) {
    error(`Unknown feature: ${targetFeature}`);
    log(`Available features: ${Object.keys(FEATURES).join(', ')}`, c.dim);
    return false;
  }

  // Ensure scripts directory exists
  ensureDir(scriptsDir);

  for (const [script, info] of scriptsToCheck) {
    const destPath = path.join(scriptsDir, script);
    const srcPath = path.join(sourceDir, script);

    if (!fs.existsSync(destPath)) {
      // Script is missing - reinstall from source
      if (fs.existsSync(srcPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
          try {
            fs.chmodSync(destPath, 0o755);
          } catch {}
          success(`Restored ${script}`);
          repaired++;
        } catch (err) {
          error(`Failed to restore ${script}: ${err.message}`);
          errors++;
        }
      } else {
        warn(`Source not found for ${script}`);
        errors++;
      }
    } else {
      skipped++;
    }
  }

  // Summary
  log('');
  if (repaired === 0 && errors === 0) {
    info('All scripts present - nothing to repair');
  } else {
    log(`Repaired: ${repaired}, Errors: ${errors}, Skipped: ${skipped}`, c.dim);
  }

  if (errors > 0) {
    log('\n For comprehensive repair, run: npx agileflow update --force', c.yellow);
  }

  return repaired > 0;
}

module.exports = {
  // Script registry
  ALL_SCRIPTS,
  // Utility functions
  sha256,
  getSourceScriptsDir,
  // Main functions
  listScripts,
  showVersionInfo,
  repairScripts,
};
