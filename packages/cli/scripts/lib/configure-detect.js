/**
 * configure-detect.js - Detection and validation for agileflow-configure
 *
 * Extracted from agileflow-configure.js (US-0094)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { c, log, header, readJSON } = require('./configure-utils');

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
      askuserquestion: {
        enabled: false,
        valid: true,
        issues: [],
        version: null,
        outdated: false,
        mode: null,
      },
    },
    metadata: { exists: false, version: null },
    currentVersion: version,
    hasOutdated: false,
  };

  // Git detection
  if (fs.existsSync('.git')) {
    status.git.initialized = true;
    try {
      status.git.remote = execSync('git remote get-url origin 2>/dev/null', {
        encoding: 'utf8',
      }).trim();
    } catch {}
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
 * Detect PreToolUse hooks (damage control)
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

  // Read feature versions and check if outdated
  if (meta.features) {
    const featureKeyMap = { askUserQuestion: 'askuserquestion' };
    Object.entries(meta.features).forEach(([feature, data]) => {
      const statusKey = featureKeyMap[feature] || feature.toLowerCase();
      if (status.features[statusKey] && data.version) {
        status.features[statusKey].version = data.version;
        if (data.version !== version && status.features[statusKey].enabled) {
          status.features[statusKey].outdated = true;
          status.hasOutdated = true;
        }
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

  // AskUserQuestion
  const auq = status.features.askuserquestion;
  if (auq.enabled) {
    let auqStatusText = 'enabled';
    if (auq.mode) auqStatusText += ` (mode: ${auq.mode})`;
    log(`   AskUserQuestion: ${auqStatusText}`, c.green);
  } else {
    log(`   AskUserQuestion: disabled`, c.dim);
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
};
