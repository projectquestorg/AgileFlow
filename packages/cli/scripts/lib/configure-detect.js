/**
 * configure-detect.js - Detection and validation for agileflow-configure
 *
 * Extracted from agileflow-configure.js (US-0094)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { c, log, header, readJSON } = require('./configure-utils');
const { tryOptional } = require('../../lib/errors');
const { FEATURES } = require('./configure-features');

// ============================================================================
// CONTENT HASH HELPERS
// ============================================================================

/**
 * Hash a file's content using SHA-256 (first 16 hex chars)
 * @param {string} filePath - Path to the file
 * @returns {string|null} 16-char hex hash, or null if file can't be read
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Find the directory containing package source scripts.
 * Checks require.resolve first, then common fallback locations.
 * @returns {string|null} Path to the scripts directory, or null
 */
function findPackageScriptDir() {
  try {
    const pkgPath = require.resolve('agileflow/package.json');
    return path.join(path.dirname(pkgPath), 'scripts');
  } catch {
    // Fallback: check common locations
    const candidates = [
      path.join(process.cwd(), 'node_modules', 'agileflow', 'scripts'),
      path.join(process.cwd(), 'packages', 'cli', 'scripts'), // monorepo dev
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir;
    }
    return null;
  }
}

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect current AgileFlow configuration status
 * @param {string} version - Current VERSION string
 * @returns {object} Configuration status object
 */
function detectConfig(version) {
  const status = {
    git: { initialized: false, remote: null },
    settingsExists: false,
    settingsValid: true,
    settingsIssues: [],
    features: {
      sessionstart: { enabled: false, valid: true, issues: [], version: null, outdated: false },
      precompact: { enabled: false, valid: true, issues: [], version: null, outdated: false },
      ralphloop: { enabled: false, valid: true, issues: [], version: null, outdated: false },
      selfimprove: { enabled: false, valid: true, issues: [], version: null, outdated: false },
      archival: { enabled: false, threshold: null, version: null, outdated: false },
      statusline: { enabled: false, valid: true, issues: [], version: null, outdated: false },
      damagecontrol: {
        enabled: false,
        valid: true,
        issues: [],
        version: null,
        outdated: false,
        level: null,
        patternCount: 0,
      },
      noaiattribution: {
        enabled: false,
        valid: true,
        issues: [],
        version: null,
        outdated: false,
      },
      askuserquestion: {
        enabled: false,
        valid: true,
        issues: [],
        version: null,
        outdated: false,
        mode: null,
      },
      tmuxautospawn: {
        enabled: true, // Default to enabled (opt-out feature)
        valid: true,
        issues: [],
        version: null,
        outdated: false,
      },
    },
    metadata: { exists: false, version: null },
    currentVersion: version,
    hasOutdated: false,
  };

  // Git detection
  if (fs.existsSync('.git')) {
    status.git.initialized = true;
    status.git.remote =
      tryOptional(
        () =>
          execFileSync('git', ['remote', 'get-url', 'origin'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim(),
        'git remote'
      ) ?? null;
  }

  // Settings file detection
  if (fs.existsSync('.claude/settings.json')) {
    status.settingsExists = true;
    const settings = readJSON('.claude/settings.json');

    if (!settings) {
      status.settingsValid = false;
      status.settingsIssues.push('Invalid JSON in settings.json');
    } else {
      detectHooks(settings, status);
      detectStatusLine(settings, status);
    }
  }

  // Metadata detection
  detectMetadata(status, version);

  return status;
}

/**
 * Detect hook configurations in settings
 */
function detectHooks(settings, status) {
  if (!settings.hooks) return;

  // SessionStart detection
  if (settings.hooks.SessionStart) {
    detectSessionStartHook(settings.hooks.SessionStart, status);
  }

  // PreCompact detection
  if (settings.hooks.PreCompact) {
    detectPreCompactHook(settings.hooks.PreCompact, status);
  }

  // Stop hooks detection (ralphloop and selfimprove)
  if (settings.hooks.Stop) {
    detectStopHooks(settings.hooks.Stop, status);
  }

  // PreToolUse hooks detection (damage control)
  if (settings.hooks.PreToolUse) {
    detectPreToolUseHooks(settings.hooks.PreToolUse, status);
  }
}

/**
 * Detect SessionStart hook configuration
 */
function detectSessionStartHook(hook, status) {
  if (Array.isArray(hook) && hook.length > 0) {
    const first = hook[0];
    if (first.matcher !== undefined && first.hooks) {
      status.features.sessionstart.enabled = true;
    } else {
      status.features.sessionstart.enabled = true;
      status.features.sessionstart.valid = false;
      status.features.sessionstart.issues.push('Old format - needs migration');
    }
  } else if (typeof hook === 'string') {
    status.features.sessionstart.enabled = true;
    status.features.sessionstart.valid = false;
    status.features.sessionstart.issues.push('String format - needs migration');
  }
}

/**
 * Detect PreCompact hook configuration
 */
function detectPreCompactHook(hook, status) {
  if (Array.isArray(hook) && hook.length > 0) {
    const first = hook[0];
    if (first.matcher !== undefined && first.hooks) {
      status.features.precompact.enabled = true;
    } else {
      status.features.precompact.enabled = true;
      status.features.precompact.valid = false;
      status.features.precompact.issues.push('Old format - needs migration');
    }
  } else if (typeof hook === 'string') {
    status.features.precompact.enabled = true;
    status.features.precompact.valid = false;
    status.features.precompact.issues.push('String format - needs migration');
  }
}

/**
 * Detect Stop hook configuration (ralphloop, selfimprove)
 */
function detectStopHooks(hook, status) {
  if (Array.isArray(hook) && hook.length > 0) {
    const first = hook[0];
    if (first.matcher !== undefined && first.hooks) {
      for (const h of first.hooks) {
        if (h.command?.includes('ralph-loop')) {
          status.features.ralphloop.enabled = true;
        }
        if (h.command?.includes('auto-self-improve')) {
          status.features.selfimprove.enabled = true;
        }
      }
    }
  }
}

/**
 * Detect PreToolUse hooks (damage control, no AI attribution)
 */
function detectPreToolUseHooks(hooks, status) {
  if (!Array.isArray(hooks) || hooks.length === 0) return;

  const hasBashHook = hooks.some(
    h => h.matcher === 'Bash' && h.hooks?.some(hk => hk.command?.includes('damage-control'))
  );
  const hasEditHook = hooks.some(
    h => h.matcher === 'Edit' && h.hooks?.some(hk => hk.command?.includes('damage-control'))
  );
  const hasWriteHook = hooks.some(
    h => h.matcher === 'Write' && h.hooks?.some(hk => hk.command?.includes('damage-control'))
  );

  if (hasBashHook || hasEditHook || hasWriteHook) {
    status.features.damagecontrol.enabled = true;
    const hookCount = [hasBashHook, hasEditHook, hasWriteHook].filter(Boolean).length;
    if (hookCount < 3) {
      status.features.damagecontrol.valid = false;
      status.features.damagecontrol.issues.push(`Only ${hookCount}/3 hooks configured`);
    }
  }

  // Detect no AI attribution hook
  const hasNoAiHook = hooks.some(
    h =>
      h.matcher === 'Bash' &&
      Array.isArray(h.hooks) &&
      h.hooks.some(hk => hk.command?.includes('strip-ai-attribution'))
  );
  if (hasNoAiHook) {
    status.features.noaiattribution.enabled = true;
  }
}

/**
 * Detect statusLine configuration
 */
function detectStatusLine(settings, status) {
  if (!settings.statusLine) return;

  status.features.statusline.enabled = true;
  if (typeof settings.statusLine === 'string') {
    status.features.statusline.valid = false;
    status.features.statusline.issues.push('String format - needs type:command');
  } else if (!settings.statusLine.type) {
    status.features.statusline.valid = false;
    status.features.statusline.issues.push('Missing type:command');
  }
}

/**
 * Detect metadata file configuration
 */
function detectMetadata(status, version) {
  const metaPath = 'docs/00-meta/agileflow-metadata.json';
  if (!fs.existsSync(metaPath)) return;

  status.metadata.exists = true;
  const meta = readJSON(metaPath);
  if (!meta) return;

  status.metadata.version = meta.version;

  // Archival settings
  if (meta.archival?.enabled) {
    status.features.archival.enabled = true;
    status.features.archival.threshold = meta.archival.threshold_days;
  }

  // Damage control metadata
  if (meta.features?.damagecontrol?.enabled) {
    status.features.damagecontrol.level = meta.features.damagecontrol.protectionLevel || 'standard';
  }

  // AskUserQuestion metadata
  if (meta.features?.askUserQuestion?.enabled) {
    status.features.askuserquestion.enabled = true;
    status.features.askuserquestion.mode = meta.features.askUserQuestion.mode || 'all';
  }

  // TmuxAutoSpawn metadata (default to true if not explicitly set)
  if (meta.features?.tmuxAutoSpawn !== undefined) {
    status.features.tmuxautospawn.enabled = meta.features.tmuxAutoSpawn.enabled !== false;
  } else {
    status.features.tmuxautospawn.enabled = true; // Default enabled
  }

  // No AI attribution metadata
  if (meta.features?.noaiattribution?.enabled) {
    status.features.noaiattribution.enabled = true;
  }

  // Read feature versions and check if outdated (content-based)
  if (meta.features) {
    const featureKeyMap = { askUserQuestion: 'askuserquestion', tmuxAutoSpawn: 'tmuxautospawn' };
    const packageScriptDir = findPackageScriptDir();

    Object.entries(meta.features).forEach(([feature, data]) => {
      const statusKey = featureKeyMap[feature] || feature.toLowerCase();
      if (status.features[statusKey] && data.version) {
        status.features[statusKey].version = data.version;

        if (!status.features[statusKey].enabled) return;

        // Content-based outdated detection
        const featureConfig = FEATURES[statusKey];
        const scriptsToCheck =
          featureConfig?.scripts || (featureConfig?.script ? [featureConfig.script] : []);

        if (scriptsToCheck.length > 0 && packageScriptDir) {
          // Compare installed scripts against package source
          let isOutdated = false;
          for (const scriptName of scriptsToCheck) {
            const packageScript = path.join(packageScriptDir, scriptName);
            const installedScript = path.join(process.cwd(), '.agileflow', 'scripts', scriptName);
            const packageHash = hashFile(packageScript);
            const installedHash = hashFile(installedScript);

            if (packageHash && installedHash && packageHash !== installedHash) {
              isOutdated = true;
              break;
            }
          }
          if (isOutdated) {
            status.features[statusKey].outdated = true;
            status.hasOutdated = true;
          }
        } else if (featureConfig?.metadataOnly) {
          // Metadata-only features: use version comparison (no scripts to hash)
          if (data.version !== version) {
            status.features[statusKey].outdated = true;
            status.hasOutdated = true;
          }
        }
        // If no package source found or no scripts, don't mark outdated (fail open)
      }
    });
  }
}

// ============================================================================
// STATUS PRINTING
// ============================================================================

/**
 * Print configuration status to console
 * @param {object} status - Status object from detectConfig
 * @returns {{ hasIssues: boolean, hasOutdated: boolean }}
 */
function printStatus(status) {
  header('Current Configuration');

  // Git status
  log(
    `Git: ${status.git.initialized ? '' : ''} ${status.git.initialized ? 'initialized' : 'not initialized'}${status.git.remote ? ` (${status.git.remote})` : ''}`,
    status.git.initialized ? c.green : c.dim
  );

  // Settings status
  if (!status.settingsExists) {
    log('Settings:  .claude/settings.json not found', c.dim);
  } else if (!status.settingsValid) {
    log('Settings:  Invalid JSON', c.red);
  } else {
    log('Settings:  .claude/settings.json exists', c.green);
  }

  // Features status
  header('Features:');

  const printFeature = (name, label) => {
    const f = status.features[name];
    let statusIcon = f.enabled ? '' : '';
    let statusText = f.enabled ? 'enabled' : 'disabled';
    let color = f.enabled ? c.green : c.dim;

    if (f.enabled && !f.valid) {
      statusIcon = '';
      statusText = 'INVALID FORMAT';
      color = c.yellow;
    } else if (f.enabled && f.outdated) {
      statusIcon = '';
      statusText = `outdated (v${f.version} -> v${status.currentVersion})`;
      color = c.yellow;
    }

    log(`  ${statusIcon} ${label}: ${statusText}`, color);

    if (f.issues?.length > 0) {
      f.issues.forEach(issue => log(`     - ${issue}`, c.yellow));
    }
  };

  printFeature('sessionstart', 'SessionStart Hook');
  printFeature('precompact', 'PreCompact Hook');
  printFeature('ralphloop', 'RalphLoop (Stop)');
  printFeature('selfimprove', 'SelfImprove (Stop)');

  // Archival (special display)
  const arch = status.features.archival;
  log(
    `  ${arch.enabled ? '' : ''} Archival: ${arch.enabled ? `${arch.threshold} days` : 'disabled'}`,
    arch.enabled ? c.green : c.dim
  );

  printFeature('statusline', 'Status Line');

  // Damage Control (special display)
  const dc = status.features.damagecontrol;
  if (dc.enabled) {
    let dcStatusText = 'enabled';
    if (dc.level) dcStatusText += ` (${dc.level})`;
    if (!dc.valid) dcStatusText = 'INCOMPLETE';
    const dcIcon = dc.enabled && dc.valid ? '' : '';
    const dcColor = dc.enabled && dc.valid ? c.green : c.yellow;
    log(`  ${dcIcon} Damage Control: ${dcStatusText}`, dcColor);
    if (dc.issues?.length > 0) {
      dc.issues.forEach(issue => log(`     - ${issue}`, c.yellow));
    }
  } else {
    log(`   Damage Control: disabled`, c.dim);
  }

  // No AI Attribution
  const naa = status.features.noaiattribution;
  if (naa.enabled) {
    log(`   No AI Attribution: enabled`, c.green);
  } else {
    log(`   No AI Attribution: disabled`, c.dim);
  }

  // AskUserQuestion
  const auq = status.features.askuserquestion;
  if (auq.enabled) {
    let auqStatusText = 'enabled';
    if (auq.mode) auqStatusText += ` (mode: ${auq.mode})`;
    log(`   AskUserQuestion: ${auqStatusText}`, c.green);
  } else {
    log(`   AskUserQuestion: disabled`, c.dim);
  }

  // TmuxAutoSpawn
  const tas = status.features.tmuxautospawn;
  if (tas.enabled) {
    log(`   Tmux Auto-Spawn: enabled`, c.green);
  } else {
    log(`   Tmux Auto-Spawn: disabled`, c.dim);
  }

  // Metadata version
  if (status.metadata.exists) {
    log(`\nMetadata: v${status.metadata.version}`, c.dim);
  }

  // Issues summary
  const hasIssues = Object.values(status.features).some(f => f.issues?.length > 0);
  if (hasIssues) {
    log('\n  Format issues detected! Run with --migrate to fix.', c.yellow);
  }

  if (status.hasOutdated) {
    log('\n Outdated scripts detected! Run with --upgrade to update.', c.yellow);
  }

  return { hasIssues, hasOutdated: status.hasOutdated };
}

module.exports = {
  detectConfig,
  printStatus,
  // Export helper functions for testing
  detectHooks,
  detectSessionStartHook,
  detectPreCompactHook,
  detectStopHooks,
  detectPreToolUseHooks,
  detectStatusLine,
  detectMetadata,
  hashFile,
  findPackageScriptDir,
};
