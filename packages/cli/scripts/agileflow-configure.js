#!/usr/bin/env node
/**
 * agileflow-configure.js - Comprehensive configuration management
 *
 * Features:
 *   - DETECT: Show current configuration status
 *   - MIGRATE: Fix old/invalid formats automatically
 *   - ENABLE: Turn on features
 *   - DISABLE: Turn off features
 *   - PROFILES: Quick presets (full, basic, minimal, none)
 *   - RECONFIGURE: Change settings (archival days, etc.)
 *
 * Usage:
 *   node .agileflow/scripts/agileflow-configure.js [options]
 *
 * Options:
 *   --profile=full|basic|minimal|none   Apply a preset
 *   --enable=<features>                 Enable specific features
 *   --disable=<features>                Disable specific features
 *   --archival-days=<N>                 Set archival threshold
 *   --migrate                           Fix old formats without changing features
 *   --validate                          Check for issues
 *   --detect                            Show current status
 *   --help                              Show help
 *
 * Features: sessionstart, precompact, ralphloop, selfimprove, archival, statusline, autoupdate, damagecontrol, askuserquestion
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Get version dynamically from metadata or package.json
function getVersion() {
  // Try agileflow-metadata.json first (user's installed version)
  try {
    const metaPath = path.join(process.cwd(), 'docs/00-meta/agileflow-metadata.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.version) return meta.version;
    }
  } catch {}

  // Try .agileflow/package.json
  try {
    const pkgPath = path.join(process.cwd(), '.agileflow/package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  // Fallback to script's own package.json (when running from npm package)
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  return 'unknown';
}

const VERSION = getVersion();

const FEATURES = {
  sessionstart: { hook: 'SessionStart', script: 'agileflow-welcome.js', type: 'node' },
  precompact: { hook: 'PreCompact', script: 'precompact-context.sh', type: 'bash' },
  ralphloop: { hook: 'Stop', script: 'ralph-loop.js', type: 'node' },
  selfimprove: { hook: 'Stop', script: 'auto-self-improve.js', type: 'node' },
  archival: { script: 'archive-completed-stories.sh', requiresHook: 'sessionstart' },
  statusline: { script: 'agileflow-statusline.sh' },
  autoupdate: { metadataOnly: true }, // Stored in metadata.updates.autoUpdate
  damagecontrol: {
    preToolUseHooks: true,
    scripts: ['damage-control-bash.js', 'damage-control-edit.js', 'damage-control-write.js'],
    patternsFile: 'damage-control-patterns.yaml',
  },
  askuserquestion: { metadataOnly: true }, // Stored in metadata.features.askUserQuestion
};

// Complete registry of all scripts that may need repair
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

// Statusline component names
const STATUSLINE_COMPONENTS = [
  'agileflow',
  'model',
  'story',
  'epic',
  'wip',
  'context',
  'cost',
  'git',
];

const PROFILES = {
  full: {
    description: 'All features enabled (including experimental Stop hooks)',
    enable: ['sessionstart', 'precompact', 'archival', 'statusline', 'ralphloop', 'selfimprove', 'askuserquestion'],
    archivalDays: 30,
  },
  basic: {
    description: 'Essential hooks + archival (SessionStart + PreCompact + Archival)',
    enable: ['sessionstart', 'precompact', 'archival', 'askuserquestion'],
    disable: ['statusline', 'ralphloop', 'selfimprove'],
    archivalDays: 30,
  },
  minimal: {
    description: 'SessionStart + archival only',
    enable: ['sessionstart', 'archival'],
    disable: ['precompact', 'statusline', 'ralphloop', 'selfimprove', 'askuserquestion'],
    archivalDays: 30,
  },
  none: {
    description: 'Disable all AgileFlow features',
    disable: ['sessionstart', 'precompact', 'archival', 'statusline', 'ralphloop', 'selfimprove', 'askuserquestion'],
  },
};

// ============================================================================
// COLORS & LOGGING
// ============================================================================

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = (msg, color = '') => console.log(`${color}${msg}${c.reset}`);
const success = msg => log(`✅ ${msg}`, c.green);
const warn = msg => log(`⚠️  ${msg}`, c.yellow);
const error = msg => log(`❌ ${msg}`, c.red);
const info = msg => log(`ℹ️  ${msg}`, c.dim);
const header = msg => log(`\n${msg}`, c.bold + c.cyan);

// ============================================================================
// FILE UTILITIES
// ============================================================================

const ensureDir = dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readJSON = filePath => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const writeJSON = (filePath, data) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
};

// Scripts are located in .agileflow/scripts/ (installed by AgileFlow)
const SCRIPTS_DIR = path.join(process.cwd(), '.agileflow', 'scripts');

const scriptExists = scriptName => {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  return fs.existsSync(scriptPath);
};

const getScriptPath = scriptName => {
  return `.agileflow/scripts/${scriptName}`;
};

// ============================================================================
// DETECTION & VALIDATION
// ============================================================================

function detectConfig() {
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
      damagecontrol: { enabled: false, valid: true, issues: [], version: null, outdated: false, level: null, patternCount: 0 },
      askuserquestion: { enabled: false, valid: true, issues: [], version: null, outdated: false, mode: null },
    },
    metadata: { exists: false, version: null },
    currentVersion: VERSION,
    hasOutdated: false,
  };

  // Git
  if (fs.existsSync('.git')) {
    status.git.initialized = true;
    try {
      status.git.remote = execSync('git remote get-url origin 2>/dev/null', {
        encoding: 'utf8',
      }).trim();
    } catch {}
  }

  // Settings file
  if (fs.existsSync('.claude/settings.json')) {
    status.settingsExists = true;
    const settings = readJSON('.claude/settings.json');

    if (!settings) {
      status.settingsValid = false;
      status.settingsIssues.push('Invalid JSON in settings.json');
    } else {
      // Check hooks
      if (settings.hooks) {
        // SessionStart
        if (settings.hooks.SessionStart) {
          if (
            Array.isArray(settings.hooks.SessionStart) &&
            settings.hooks.SessionStart.length > 0
          ) {
            const hook = settings.hooks.SessionStart[0];
            if (hook.matcher !== undefined && hook.hooks) {
              status.features.sessionstart.enabled = true;
            } else {
              status.features.sessionstart.enabled = true;
              status.features.sessionstart.valid = false;
              status.features.sessionstart.issues.push('Old format - needs migration');
            }
          } else if (typeof settings.hooks.SessionStart === 'string') {
            status.features.sessionstart.enabled = true;
            status.features.sessionstart.valid = false;
            status.features.sessionstart.issues.push('String format - needs migration');
          }
        }

        // PreCompact
        if (settings.hooks.PreCompact) {
          if (Array.isArray(settings.hooks.PreCompact) && settings.hooks.PreCompact.length > 0) {
            const hook = settings.hooks.PreCompact[0];
            if (hook.matcher !== undefined && hook.hooks) {
              status.features.precompact.enabled = true;
            } else {
              status.features.precompact.enabled = true;
              status.features.precompact.valid = false;
              status.features.precompact.issues.push('Old format - needs migration');
            }
          } else if (typeof settings.hooks.PreCompact === 'string') {
            status.features.precompact.enabled = true;
            status.features.precompact.valid = false;
            status.features.precompact.issues.push('String format - needs migration');
          }
        }

        // Stop hooks (ralphloop and selfimprove)
        if (settings.hooks.Stop) {
          if (Array.isArray(settings.hooks.Stop) && settings.hooks.Stop.length > 0) {
            const hook = settings.hooks.Stop[0];
            if (hook.matcher !== undefined && hook.hooks) {
              // Check for each Stop hook feature
              for (const h of hook.hooks) {
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

        // PreToolUse hooks (damage control)
        if (settings.hooks.PreToolUse) {
          if (Array.isArray(settings.hooks.PreToolUse) && settings.hooks.PreToolUse.length > 0) {
            // Check for damage-control hooks by looking for damage-control scripts
            const hasBashHook = settings.hooks.PreToolUse.some(
              h => h.matcher === 'Bash' && h.hooks?.some(hk => hk.command?.includes('damage-control'))
            );
            const hasEditHook = settings.hooks.PreToolUse.some(
              h => h.matcher === 'Edit' && h.hooks?.some(hk => hk.command?.includes('damage-control'))
            );
            const hasWriteHook = settings.hooks.PreToolUse.some(
              h => h.matcher === 'Write' && h.hooks?.some(hk => hk.command?.includes('damage-control'))
            );

            if (hasBashHook || hasEditHook || hasWriteHook) {
              status.features.damagecontrol.enabled = true;
              // Count how many of the 3 hooks are present
              const hookCount = [hasBashHook, hasEditHook, hasWriteHook].filter(Boolean).length;
              if (hookCount < 3) {
                status.features.damagecontrol.valid = false;
                status.features.damagecontrol.issues.push(`Only ${hookCount}/3 hooks configured`);
              }
            }
          }
        }
      }

      // StatusLine
      if (settings.statusLine) {
        status.features.statusline.enabled = true;
        if (typeof settings.statusLine === 'string') {
          status.features.statusline.valid = false;
          status.features.statusline.issues.push('String format - needs type:command');
        } else if (!settings.statusLine.type) {
          status.features.statusline.valid = false;
          status.features.statusline.issues.push('Missing type:command');
        }
      }
    }
  }

  // Metadata
  const metaPath = 'docs/00-meta/agileflow-metadata.json';
  if (fs.existsSync(metaPath)) {
    status.metadata.exists = true;
    const meta = readJSON(metaPath);
    if (meta) {
      status.metadata.version = meta.version;
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

      // Read feature versions from metadata and check if outdated
      if (meta.features) {
        // Map metadata keys to status keys (handle camelCase differences)
        const featureKeyMap = {
          askUserQuestion: 'askuserquestion',
        };
        Object.entries(meta.features).forEach(([feature, data]) => {
          // Use mapped key if exists, otherwise lowercase
          const statusKey = featureKeyMap[feature] || feature.toLowerCase();
          if (status.features[statusKey] && data.version) {
            status.features[statusKey].version = data.version;
            // Check if feature version differs from current VERSION
            if (data.version !== VERSION && status.features[statusKey].enabled) {
              status.features[statusKey].outdated = true;
              status.hasOutdated = true;
            }
          }
        });
      }
    }
  }

  return status;
}

function printStatus(status) {
  header('📊 Current Configuration');

  // Git
  log(
    `Git: ${status.git.initialized ? '✅' : '❌'} ${status.git.initialized ? 'initialized' : 'not initialized'}${status.git.remote ? ` (${status.git.remote})` : ''}`,
    status.git.initialized ? c.green : c.dim
  );

  // Settings
  if (!status.settingsExists) {
    log('Settings: ❌ .claude/settings.json not found', c.dim);
  } else if (!status.settingsValid) {
    log('Settings: ❌ Invalid JSON', c.red);
  } else {
    log('Settings: ✅ .claude/settings.json exists', c.green);
  }

  // Features
  header('Features:');

  const printFeature = (name, label) => {
    const f = status.features[name];
    let statusIcon = f.enabled ? '✅' : '❌';
    let statusText = f.enabled ? 'enabled' : 'disabled';
    let color = f.enabled ? c.green : c.dim;

    if (f.enabled && !f.valid) {
      statusIcon = '⚠️';
      statusText = 'INVALID FORMAT';
      color = c.yellow;
    } else if (f.enabled && f.outdated) {
      statusIcon = '🔄';
      statusText = `outdated (v${f.version} → v${status.currentVersion})`;
      color = c.yellow;
    }

    log(`  ${statusIcon} ${label}: ${statusText}`, color);

    if (f.issues?.length > 0) {
      f.issues.forEach(issue => log(`     └─ ${issue}`, c.yellow));
    }
  };

  printFeature('sessionstart', 'SessionStart Hook');
  printFeature('precompact', 'PreCompact Hook');
  printFeature('ralphloop', 'RalphLoop (Stop)');
  printFeature('selfimprove', 'SelfImprove (Stop)');

  const arch = status.features.archival;
  log(
    `  ${arch.enabled ? '✅' : '❌'} Archival: ${arch.enabled ? `${arch.threshold} days` : 'disabled'}`,
    arch.enabled ? c.green : c.dim
  );

  printFeature('statusline', 'Status Line');

  // Damage Control (special display with level info)
  const dc = status.features.damagecontrol;
  if (dc.enabled) {
    let dcStatusText = 'enabled';
    if (dc.level) dcStatusText += ` (${dc.level})`;
    if (!dc.valid) dcStatusText = 'INCOMPLETE';
    const dcIcon = dc.enabled && dc.valid ? '🛡️' : '⚠️';
    const dcColor = dc.enabled && dc.valid ? c.green : c.yellow;
    log(`  ${dcIcon} Damage Control: ${dcStatusText}`, dcColor);
    if (dc.issues?.length > 0) {
      dc.issues.forEach(issue => log(`     └─ ${issue}`, c.yellow));
    }
  } else {
    log(`  ❌ Damage Control: disabled`, c.dim);
  }

  // AskUserQuestion
  const auq = status.features.askuserquestion;
  if (auq.enabled) {
    let auqStatusText = 'enabled';
    if (auq.mode) auqStatusText += ` (mode: ${auq.mode})`;
    log(`  💬 AskUserQuestion: ${auqStatusText}`, c.green);
  } else {
    log(`  ❌ AskUserQuestion: disabled`, c.dim);
  }

  // Metadata
  if (status.metadata.exists) {
    log(`\nMetadata: v${status.metadata.version}`, c.dim);
  }

  // Issues summary
  const hasIssues = Object.values(status.features).some(f => f.issues?.length > 0);
  if (hasIssues) {
    log('\n⚠️  Format issues detected! Run with --migrate to fix.', c.yellow);
  }

  if (status.hasOutdated) {
    log('\n🔄 Outdated scripts detected! Run with --upgrade to update.', c.yellow);
  }

  return { hasIssues, hasOutdated: status.hasOutdated };
}

// ============================================================================
// MIGRATION
// ============================================================================

function migrateSettings() {
  header('🔧 Migrating Settings...');

  if (!fs.existsSync('.claude/settings.json')) {
    warn('No settings.json to migrate');
    return false;
  }

  const settings = readJSON('.claude/settings.json');
  if (!settings) {
    error('Cannot parse settings.json');
    return false;
  }

  let migrated = false;

  // Migrate hooks to new format
  if (settings.hooks) {
    ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'Stop'].forEach(hookName => {
      const hook = settings.hooks[hookName];
      if (!hook) return;

      // String format → array format
      if (typeof hook === 'string') {
        const isNode = hook.includes('node ') || hook.endsWith('.js');
        settings.hooks[hookName] = [
          {
            matcher: '',
            hooks: [{ type: 'command', command: isNode ? hook : `bash ${hook}` }],
          },
        ];
        success(`Migrated ${hookName} from string format`);
        migrated = true;
      }
      // Old object format → new format
      else if (Array.isArray(hook) && hook.length > 0) {
        const first = hook[0];
        if (first.enabled !== undefined || first.command !== undefined) {
          // Old format with enabled/command
          if (first.command) {
            settings.hooks[hookName] = [
              {
                matcher: '',
                hooks: [{ type: 'command', command: first.command }],
              },
            ];
            success(`Migrated ${hookName} from old object format`);
            migrated = true;
          }
        } else if (first.matcher === undefined) {
          // Missing matcher
          settings.hooks[hookName] = [
            {
              matcher: '',
              hooks: first.hooks || [{ type: 'command', command: 'echo "hook"' }],
            },
          ];
          success(`Migrated ${hookName} - added matcher`);
          migrated = true;
        }
      }
    });
  }

  // Migrate statusLine
  if (settings.statusLine) {
    if (typeof settings.statusLine === 'string') {
      settings.statusLine = {
        type: 'command',
        command: settings.statusLine,
        padding: 0,
      };
      success('Migrated statusLine from string format');
      migrated = true;
    } else if (!settings.statusLine.type) {
      settings.statusLine.type = 'command';
      if (settings.statusLine.refreshInterval) {
        delete settings.statusLine.refreshInterval;
        settings.statusLine.padding = 0;
      }
      success('Migrated statusLine - added type:command');
      migrated = true;
    }
  }

  if (migrated) {
    // Backup original
    fs.copyFileSync('.claude/settings.json', '.claude/settings.json.backup');
    info('Backed up to .claude/settings.json.backup');

    writeJSON('.claude/settings.json', settings);
    success('Settings migrated successfully!');
  } else {
    info('No migration needed - formats are correct');
  }

  return migrated;
}

// ============================================================================
// UPGRADE FEATURES
// ============================================================================

function upgradeFeatures(status) {
  header('🔄 Upgrading Outdated Features...');

  let upgraded = 0;

  Object.entries(status.features).forEach(([feature, data]) => {
    if (data.enabled && data.outdated) {
      log(`\nUpgrading ${feature}...`, c.cyan);
      // Re-enable the feature to deploy latest scripts
      if (enableFeature(feature, { archivalDays: data.threshold || 30, isUpgrade: true })) {
        upgraded++;
      }
    }
  });

  if (upgraded === 0) {
    info('No features needed upgrading');
  } else {
    success(`Upgraded ${upgraded} feature(s) to v${VERSION}`);
  }

  return upgraded > 0;
}

// ============================================================================
// ENABLE/DISABLE FEATURES
// ============================================================================

function enableFeature(feature, options = {}) {
  const config = FEATURES[feature];
  if (!config) {
    error(`Unknown feature: ${feature}`);
    return false;
  }

  ensureDir('.claude');

  const settings = readJSON('.claude/settings.json') || {};
  settings.hooks = settings.hooks || {};
  settings.permissions = settings.permissions || { allow: [], deny: [], ask: [] };

  // Handle hook-based features
  if (config.hook) {
    const scriptPath = getScriptPath(config.script);

    // Verify script exists
    if (!scriptExists(config.script)) {
      error(`Script not found: ${scriptPath}`);
      info('Run "npx agileflow update" to reinstall scripts');
      return false;
    }

    // Use absolute path so hooks work from any subdirectory
    const absoluteScriptPath = path.join(process.cwd(), scriptPath);

    // Stop hooks use error suppression to avoid blocking Claude
    const isStoHook = config.hook === 'Stop';
    const command =
      config.type === 'node'
        ? `node ${absoluteScriptPath}${isStoHook ? ' 2>/dev/null || true' : ''}`
        : `bash ${absoluteScriptPath}${isStoHook ? ' 2>/dev/null || true' : ''}`;

    if (isStoHook) {
      // Stop hooks stack - add to existing hooks instead of replacing
      if (!settings.hooks.Stop) {
        settings.hooks.Stop = [{ matcher: '', hooks: [] }];
      } else if (!Array.isArray(settings.hooks.Stop) || settings.hooks.Stop.length === 0) {
        settings.hooks.Stop = [{ matcher: '', hooks: [] }];
      } else if (!settings.hooks.Stop[0].hooks) {
        settings.hooks.Stop[0].hooks = [];
      }

      // Check if this script is already added
      const hasHook = settings.hooks.Stop[0].hooks.some(h => h.command?.includes(config.script));

      if (!hasHook) {
        settings.hooks.Stop[0].hooks.push({ type: 'command', command });
        success(`Stop hook added (${config.script})`);
      } else {
        info(`${feature} already enabled`);
      }
    } else {
      // Other hooks (SessionStart, PreCompact) replace entirely
      settings.hooks[config.hook] = [
        {
          matcher: '',
          hooks: [{ type: 'command', command }],
        },
      ];
      success(`${config.hook} hook enabled (${config.script})`);
    }
  }

  // Handle archival
  if (feature === 'archival') {
    const days = options.archivalDays || 30;
    const scriptPath = getScriptPath('archive-completed-stories.sh');

    if (!scriptExists('archive-completed-stories.sh')) {
      error(`Script not found: ${scriptPath}`);
      info('Run "npx agileflow update" to reinstall scripts');
      return false;
    }

    // Use absolute path so hooks work from any subdirectory
    const absoluteScriptPath = path.join(process.cwd(), scriptPath);
    if (settings.hooks.SessionStart?.[0]?.hooks) {
      const hasArchival = settings.hooks.SessionStart[0].hooks.some(h =>
        h.command?.includes('archive-completed-stories')
      );
      if (!hasArchival) {
        settings.hooks.SessionStart[0].hooks.push({
          type: 'command',
          command: `bash ${absoluteScriptPath} --quiet`,
        });
      }
    }

    // Update metadata
    updateMetadata({ archival: { enabled: true, threshold_days: days } });
    success(`Archival enabled (${days} days)`);
  }

  // Handle statusLine
  if (feature === 'statusline') {
    const scriptPath = getScriptPath('agileflow-statusline.sh');

    if (!scriptExists('agileflow-statusline.sh')) {
      error(`Script not found: ${scriptPath}`);
      info('Run "npx agileflow update" to reinstall scripts');
      return false;
    }

    // Use absolute path so hooks work from any subdirectory
    const absoluteScriptPath = path.join(process.cwd(), scriptPath);
    settings.statusLine = {
      type: 'command',
      command: `bash ${absoluteScriptPath}`,
      padding: 0,
    };
    success('Status line enabled');
  }

  // Handle autoupdate (metadata only, no hooks needed)
  if (feature === 'autoupdate') {
    const frequency = options.checkFrequency || 'daily';
    updateMetadata({
      updates: {
        autoUpdate: true,
        checkFrequency: frequency,
        showChangelog: true,
      },
    });
    success(`Auto-update enabled (check frequency: ${frequency})`);
    info('AgileFlow will automatically update on session start');
    return true; // Skip settings.json write for this feature
  }

  // Handle askuserquestion (metadata only, no hooks needed)
  if (feature === 'askuserquestion') {
    const mode = options.mode || 'all';
    updateMetadata({
      features: {
        askUserQuestion: {
          enabled: true,
          mode: mode,
          version: VERSION,
          at: new Date().toISOString(),
        },
      },
    });
    success(`AskUserQuestion enabled (mode: ${mode})`);
    info('All commands will end with AskUserQuestion tool for guided interaction');
    return true; // Skip settings.json write for this feature
  }

  // Handle damage control (PreToolUse hooks)
  if (feature === 'damagecontrol') {
    const level = options.protectionLevel || 'standard';

    // Verify all required scripts exist
    const requiredScripts = ['damage-control-bash.js', 'damage-control-edit.js', 'damage-control-write.js'];
    for (const script of requiredScripts) {
      if (!scriptExists(script)) {
        error(`Script not found: ${getScriptPath(script)}`);
        info('Run "npx agileflow update" to reinstall scripts');
        return false;
      }
    }

    // Deploy patterns file if not exists
    const patternsDir = path.join(process.cwd(), '.agileflow', 'config');
    const patternsDest = path.join(patternsDir, 'damage-control-patterns.yaml');
    if (!fs.existsSync(patternsDest)) {
      ensureDir(patternsDir);
      // Try to copy from templates
      const templatePath = path.join(process.cwd(), '.agileflow', 'templates', 'damage-control-patterns.yaml');
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, patternsDest);
        success('Deployed damage control patterns');
      } else {
        warn('No patterns template found - hooks will use defaults');
      }
    }

    // Initialize PreToolUse array if not exists
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }

    // Helper to add or update a PreToolUse hook
    const addPreToolUseHook = (matcher, scriptName) => {
      const scriptPath = path.join(process.cwd(), '.agileflow', 'scripts', scriptName);

      // Remove existing hook for this matcher if present
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => h.matcher !== matcher);

      // Add new hook
      settings.hooks.PreToolUse.push({
        matcher,
        hooks: [{ type: 'command', command: `node ${scriptPath}`, timeout: 5 }],
      });
    };

    // Add hooks for Bash, Edit, Write tools
    addPreToolUseHook('Bash', 'damage-control-bash.js');
    addPreToolUseHook('Edit', 'damage-control-edit.js');
    addPreToolUseHook('Write', 'damage-control-write.js');

    success('Damage control PreToolUse hooks enabled');

    // Update metadata with protection level
    updateMetadata({
      features: {
        damagecontrol: {
          enabled: true,
          protectionLevel: level,
          version: VERSION,
          at: new Date().toISOString(),
        },
      },
    });

    writeJSON('.claude/settings.json', settings);
    updateGitignore();

    return true;
  }

  writeJSON('.claude/settings.json', settings);
  updateMetadata({
    features: { [feature]: { enabled: true, version: VERSION, at: new Date().toISOString() } },
  });
  updateGitignore();

  return true;
}

function disableFeature(feature) {
  const config = FEATURES[feature];
  if (!config) {
    error(`Unknown feature: ${feature}`);
    return false;
  }

  if (!fs.existsSync('.claude/settings.json')) {
    info(`${feature} already disabled (no settings file)`);
    return true;
  }

  const settings = readJSON('.claude/settings.json');
  if (!settings) return false;

  // Disable hook
  if (config.hook && settings.hooks?.[config.hook]) {
    if (config.hook === 'Stop') {
      // Stop hooks stack - remove only this script, not the entire hook
      if (settings.hooks.Stop?.[0]?.hooks) {
        const before = settings.hooks.Stop[0].hooks.length;
        settings.hooks.Stop[0].hooks = settings.hooks.Stop[0].hooks.filter(
          h => !h.command?.includes(config.script)
        );
        const after = settings.hooks.Stop[0].hooks.length;

        if (before > after) {
          success(`Stop hook removed (${config.script})`);
        }

        // If no more Stop hooks, remove the entire Stop hook
        if (settings.hooks.Stop[0].hooks.length === 0) {
          delete settings.hooks.Stop;
        }
      }
    } else {
      delete settings.hooks[config.hook];
      success(`${config.hook} hook disabled`);
    }
  }

  // Disable archival
  if (feature === 'archival') {
    // Remove from SessionStart
    if (settings.hooks?.SessionStart?.[0]?.hooks) {
      settings.hooks.SessionStart[0].hooks = settings.hooks.SessionStart[0].hooks.filter(
        h => !h.command?.includes('archive-completed-stories')
      );
    }
    updateMetadata({ archival: { enabled: false } });
    success('Archival disabled');
  }

  // Disable statusLine
  if (feature === 'statusline' && settings.statusLine) {
    delete settings.statusLine;
    success('Status line disabled');
  }

  // Disable autoupdate
  if (feature === 'autoupdate') {
    updateMetadata({
      updates: {
        autoUpdate: false,
      },
    });
    success('Auto-update disabled');
    return true; // Skip settings.json write for this feature
  }

  // Disable askuserquestion
  if (feature === 'askuserquestion') {
    updateMetadata({
      features: {
        askUserQuestion: {
          enabled: false,
          version: VERSION,
          at: new Date().toISOString(),
        },
      },
    });
    success('AskUserQuestion disabled');
    info('Commands will end with natural text questions instead of AskUserQuestion tool');
    return true; // Skip settings.json write for this feature
  }

  // Disable damage control (PreToolUse hooks)
  if (feature === 'damagecontrol') {
    if (settings.hooks?.PreToolUse && Array.isArray(settings.hooks.PreToolUse)) {
      const before = settings.hooks.PreToolUse.length;

      // Remove damage-control hooks (Bash, Edit, Write matchers with damage-control scripts)
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => {
        const isDamageControlHook = h.hooks?.some(hk => hk.command?.includes('damage-control'));
        return !isDamageControlHook;
      });

      const after = settings.hooks.PreToolUse.length;

      if (before > after) {
        success(`Removed ${before - after} damage control PreToolUse hook(s)`);
      }

      // If no more PreToolUse hooks, remove the entire array
      if (settings.hooks.PreToolUse.length === 0) {
        delete settings.hooks.PreToolUse;
      }
    }

    // Update metadata
    updateMetadata({
      features: {
        damagecontrol: {
          enabled: false,
          version: VERSION,
          at: new Date().toISOString(),
        },
      },
    });

    writeJSON('.claude/settings.json', settings);
    success('Damage control disabled');
    return true;
  }

  writeJSON('.claude/settings.json', settings);
  updateMetadata({
    features: { [feature]: { enabled: false, version: VERSION, at: new Date().toISOString() } },
  });

  return true;
}

// ============================================================================
// METADATA
// ============================================================================

function updateMetadata(updates) {
  const metaPath = 'docs/00-meta/agileflow-metadata.json';

  if (!fs.existsSync(metaPath)) {
    ensureDir('docs/00-meta');
    writeJSON(metaPath, { version: VERSION, created: new Date().toISOString() });
  }

  const meta = readJSON(metaPath) || {};

  // Deep merge
  if (updates.archival) {
    meta.archival = { ...meta.archival, ...updates.archival };
  }
  if (updates.features) {
    meta.features = meta.features || {};
    Object.entries(updates.features).forEach(([key, value]) => {
      meta.features[key] = { ...meta.features[key], ...value };
    });
  }
  if (updates.updates) {
    meta.updates = { ...meta.updates, ...updates.updates };
  }

  meta.version = VERSION;
  meta.updated = new Date().toISOString();

  writeJSON(metaPath, meta);
}

function updateGitignore() {
  const entries = [
    '.claude/settings.local.json',
    '.claude/activity.log',
    '.claude/context.log',
    '.claude/hook.log',
    '.claude/prompt-log.txt',
    '.claude/session.log',
  ];

  let content = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
  let added = false;

  entries.forEach(entry => {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      added = true;
    }
  });

  if (added) {
    fs.writeFileSync('.gitignore', content.trimEnd() + '\n');
  }
}

// ============================================================================
// STATUSLINE COMPONENTS
// ============================================================================

function setStatuslineComponents(enableComponents = [], disableComponents = []) {
  const metaPath = 'docs/00-meta/agileflow-metadata.json';

  if (!fs.existsSync(metaPath)) {
    warn('No metadata file found - run with --enable=statusline first');
    return false;
  }

  const meta = readJSON(metaPath);
  if (!meta) {
    error('Cannot parse metadata file');
    return false;
  }

  // Ensure statusline.components structure exists
  meta.features = meta.features || {};
  meta.features.statusline = meta.features.statusline || {};
  meta.features.statusline.components = meta.features.statusline.components || {};

  // Set defaults for any missing components
  STATUSLINE_COMPONENTS.forEach(comp => {
    if (meta.features.statusline.components[comp] === undefined) {
      meta.features.statusline.components[comp] = true;
    }
  });

  // Enable specified components
  enableComponents.forEach(comp => {
    if (STATUSLINE_COMPONENTS.includes(comp)) {
      meta.features.statusline.components[comp] = true;
      success(`Statusline component enabled: ${comp}`);
    } else {
      warn(`Unknown component: ${comp} (available: ${STATUSLINE_COMPONENTS.join(', ')})`);
    }
  });

  // Disable specified components
  disableComponents.forEach(comp => {
    if (STATUSLINE_COMPONENTS.includes(comp)) {
      meta.features.statusline.components[comp] = false;
      success(`Statusline component disabled: ${comp}`);
    } else {
      warn(`Unknown component: ${comp} (available: ${STATUSLINE_COMPONENTS.join(', ')})`);
    }
  });

  meta.updated = new Date().toISOString();
  writeJSON(metaPath, meta);

  return true;
}

function listStatuslineComponents() {
  const metaPath = 'docs/00-meta/agileflow-metadata.json';

  header('📊 Statusline Components');

  if (!fs.existsSync(metaPath)) {
    log('  No configuration found (defaults: all enabled)', c.dim);
    STATUSLINE_COMPONENTS.forEach(comp => {
      log(`  ✅ ${comp}: enabled (default)`, c.green);
    });
    return;
  }

  const meta = readJSON(metaPath);
  const components = meta?.features?.statusline?.components || {};

  STATUSLINE_COMPONENTS.forEach(comp => {
    const enabled = components[comp] !== false; // default true
    const icon = enabled ? '✅' : '❌';
    const color = enabled ? c.green : c.dim;
    log(`  ${icon} ${comp}: ${enabled ? 'enabled' : 'disabled'}`, color);
  });

  log('\nTo toggle: --show=<component> or --hide=<component>', c.dim);
  log(`Components: ${STATUSLINE_COMPONENTS.join(', ')}`, c.dim);
}

// ============================================================================
// REPAIR & DIAGNOSTICS
// ============================================================================

const crypto = require('crypto');

/**
 * Calculate SHA256 hash of a file
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Get the source scripts directory (from npm package)
 */
function getSourceScriptsDir() {
  // When running from installed package, __dirname is .agileflow/scripts
  // The source is the same directory since it was copied during install
  // But for repair, we need the npm package source

  // Try to find the npm package (when run via npx or global install)
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'scripts'), // npm package structure
    path.join(__dirname), // Same directory (for development)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'agileflow-welcome.js'))) {
      return p;
    }
  }

  return null;
}

/**
 * List all scripts with their status (present/missing/modified)
 */
function listScripts() {
  header('📋 Installed Scripts');

  const scriptsDir = path.join(process.cwd(), '.agileflow', 'scripts');
  const fileIndexPath = path.join(process.cwd(), '.agileflow', '_cfg', 'files.json');
  const fileIndex = readJSON(fileIndexPath);

  let missing = 0;
  let modified = 0;
  let present = 0;

  Object.entries(ALL_SCRIPTS).forEach(([script, info]) => {
    const scriptPath = path.join(scriptsDir, script);
    const exists = fs.existsSync(scriptPath);

    // Check if modified (compare to file index hash)
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
      log(`  ❌ ${script}: MISSING`, c.red);
      if (info.usedBy) log(`     └─ Used by: ${info.usedBy.join(', ')}`, c.dim);
      if (info.feature) log(`     └─ Feature: ${info.feature}`, c.dim);
      missing++;
    } else if (isModified) {
      log(`  ⚠️  ${script}: modified (local changes)`, c.yellow);
      modified++;
    } else {
      log(`  ✅ ${script}: present`, c.green);
      present++;
    }
  });

  // Summary
  log('');
  log(`Summary: ${present} present, ${modified} modified, ${missing} missing`, c.dim);

  if (missing > 0) {
    log('\n💡 Run with --repair to restore missing scripts', c.yellow);
  }
}

/**
 * Show version information
 */
function showVersionInfo() {
  header('📊 Version Information');

  const meta = readJSON('docs/00-meta/agileflow-metadata.json') || {};
  const manifest = readJSON('.agileflow/_cfg/manifest.yaml');

  const installedVersion = meta.version || 'unknown';

  log(`Installed:  v${installedVersion}`);
  log(`CLI:        v${VERSION}`);

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
        log('\n🔄 Update available! Run: npx agileflow update', c.yellow);
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
      const outdated = featureVersion !== VERSION && enabled;

      let icon = '❌';
      let color = c.dim;
      let statusText = `v${featureVersion}`;

      if (!enabled) {
        statusText = 'disabled';
      } else if (outdated) {
        icon = '🔄';
        color = c.yellow;
        statusText = `v${featureVersion} → v${VERSION}`;
      } else {
        icon = '✅';
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

/**
 * Repair missing or corrupted scripts
 */
function repairScripts(targetFeature = null) {
  header('🔧 Repairing Scripts...');

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
          // Make executable
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
    log('\n💡 For comprehensive repair, run: npx agileflow update --force', c.yellow);
  }

  return repaired > 0;
}

// ============================================================================
// PROFILES
// ============================================================================

function applyProfile(profileName, options = {}) {
  const profile = PROFILES[profileName];
  if (!profile) {
    error(`Unknown profile: ${profileName}`);
    log('Available: ' + Object.keys(PROFILES).join(', '));
    return false;
  }

  header(`🚀 Applying "${profileName}" profile`);
  log(profile.description, c.dim);

  // Enable features
  if (profile.enable) {
    profile.enable.forEach(f =>
      enableFeature(f, { archivalDays: profile.archivalDays || options.archivalDays })
    );
  }

  // Disable features
  if (profile.disable) {
    profile.disable.forEach(f => disableFeature(f));
  }

  return true;
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(actions) {
  header('✅ Configuration Complete!');

  if (actions.enabled?.length > 0) {
    log('\nEnabled:', c.green);
    actions.enabled.forEach(f => log(`  ✅ ${f}`, c.green));
  }

  if (actions.disabled?.length > 0) {
    log('\nDisabled:', c.dim);
    actions.disabled.forEach(f => log(`  ❌ ${f}`, c.dim));
  }

  if (actions.migrated) {
    log('\nMigrated: Fixed format issues', c.yellow);
  }

  log('\n' + '═'.repeat(55), c.red);
  log('🔴 RESTART CLAUDE CODE NOW!', c.red + c.bold);
  log('   Quit completely, wait 5 seconds, restart', c.red);
  log('═'.repeat(55), c.red);
}

// ============================================================================
// HELP
// ============================================================================

function printHelp() {
  log(`
${c.bold}AgileFlow Configure${c.reset} - Manage AgileFlow features

${c.cyan}Usage:${c.reset}
  node .agileflow/scripts/agileflow-configure.js [options]

${c.cyan}Profiles:${c.reset}
  --profile=full      All features (hooks, Stop hooks, archival, statusline)
  --profile=basic     SessionStart + PreCompact + archival (no Stop hooks)
  --profile=minimal   SessionStart + archival only
  --profile=none      Disable all AgileFlow features

${c.cyan}Feature Control:${c.reset}
  --enable=<list>     Enable features (comma-separated)
  --disable=<list>    Disable features (comma-separated)

  Features: sessionstart, precompact, ralphloop, selfimprove, archival, statusline, damagecontrol, askuserquestion

  Stop hooks (ralphloop, selfimprove) run when Claude completes/pauses
  Damage control (damagecontrol) uses PreToolUse hooks to block dangerous commands
  AskUserQuestion (askuserquestion) makes all commands end with guided options

${c.cyan}Statusline Components:${c.reset}
  --show=<list>       Show statusline components (comma-separated)
  --hide=<list>       Hide statusline components (comma-separated)
  --components        List statusline component status

  Components: agileflow, model, story, epic, wip, context, cost, git

${c.cyan}Settings:${c.reset}
  --archival-days=N   Set archival threshold (default: 30)

${c.cyan}Maintenance:${c.reset}
  --migrate           Fix old/invalid formats
  --upgrade           Re-deploy all enabled features with latest scripts
  --validate          Check for issues (same as --detect)
  --detect            Show current configuration

${c.cyan}Repair & Diagnostics:${c.reset}
  --repair              Check for and restore missing scripts
  --repair=<feature>    Repair scripts for a specific feature (e.g., statusline)
  --version             Show installed vs latest version info
  --list-scripts        List all scripts with their status (missing/present/modified)

${c.cyan}Examples:${c.reset}
  # Quick setup with all features
  node .agileflow/scripts/agileflow-configure.js --profile=full

  # Enable specific features
  node .agileflow/scripts/agileflow-configure.js --enable=sessionstart,precompact,archival

  # Disable a feature
  node .agileflow/scripts/agileflow-configure.js --disable=statusline

  # Show only agileflow branding and context in statusline
  node .agileflow/scripts/agileflow-configure.js --hide=model,story,epic,wip,cost,git

  # Re-enable git branch in statusline
  node .agileflow/scripts/agileflow-configure.js --show=git

  # List component status
  node .agileflow/scripts/agileflow-configure.js --components

  # Fix format issues
  node .agileflow/scripts/agileflow-configure.js --migrate

  # Check current status
  node .agileflow/scripts/agileflow-configure.js --detect

  # Upgrade outdated scripts to latest version
  node .agileflow/scripts/agileflow-configure.js --upgrade

  # List all scripts with status
  node .agileflow/scripts/agileflow-configure.js --list-scripts

  # Show version information
  node .agileflow/scripts/agileflow-configure.js --version

  # Repair missing scripts
  node .agileflow/scripts/agileflow-configure.js --repair

  # Repair scripts for a specific feature
  node .agileflow/scripts/agileflow-configure.js --repair=statusline

  # Enable damage control (PreToolUse hooks to block dangerous commands)
  node .agileflow/scripts/agileflow-configure.js --enable=damagecontrol

  # Enable AskUserQuestion (all commands end with guided options)
  node .agileflow/scripts/agileflow-configure.js --enable=askuserquestion

  # Disable AskUserQuestion (commands end with natural text questions)
  node .agileflow/scripts/agileflow-configure.js --disable=askuserquestion
`);
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let profile = null;
  let enable = [];
  let disable = [];
  let show = [];
  let hide = [];
  let archivalDays = 30;
  let migrate = false;
  let detect = false;
  let upgrade = false;
  let components = false;
  let help = false;
  let repair = false;
  let repairFeature = null;
  let showVersion = false;
  let listScriptsMode = false;

  args.forEach(arg => {
    if (arg.startsWith('--profile=')) profile = arg.split('=')[1];
    else if (arg.startsWith('--enable='))
      enable = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--disable='))
      disable = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--show='))
      show = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--hide='))
      hide = arg
        .split('=')[1]
        .split(',')
        .map(s => s.trim().toLowerCase());
    else if (arg.startsWith('--archival-days=')) archivalDays = parseInt(arg.split('=')[1]) || 30;
    else if (arg === '--migrate') migrate = true;
    else if (arg === '--detect' || arg === '--validate') detect = true;
    else if (arg === '--upgrade') upgrade = true;
    else if (arg === '--components') components = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--repair') repair = true;
    else if (arg.startsWith('--repair=')) {
      repair = true;
      repairFeature = arg.split('=')[1].trim().toLowerCase();
    } else if (arg === '--version' || arg === '-v') showVersion = true;
    else if (arg === '--list-scripts' || arg === '--scripts') listScriptsMode = true;
  });

  if (help) {
    printHelp();
    return;
  }

  // List scripts mode (standalone, doesn't need detection)
  if (listScriptsMode) {
    listScripts();
    return;
  }

  // Version info mode (standalone, doesn't need detection)
  if (showVersion) {
    showVersionInfo();
    return;
  }

  // Repair mode (standalone, doesn't need detection)
  if (repair) {
    const needsRestart = repairScripts(repairFeature);
    if (needsRestart) {
      log('\n' + '═'.repeat(55), c.red);
      log('🔴 RESTART CLAUDE CODE NOW!', c.red + c.bold);
      log('   Quit completely, wait 5 seconds, restart', c.red);
      log('═'.repeat(55), c.red);
    }
    return;
  }

  // Components list mode
  if (components && show.length === 0 && hide.length === 0) {
    listStatuslineComponents();
    return;
  }

  // Component toggle mode
  if (show.length > 0 || hide.length > 0) {
    setStatuslineComponents(show, hide);
    listStatuslineComponents();
    return;
  }

  // Always detect first
  const status = detectConfig();
  const { hasIssues, hasOutdated } = printStatus(status);

  // Detect only mode
  if (detect && !migrate && !upgrade && !profile && enable.length === 0 && disable.length === 0) {
    return;
  }

  // Upgrade mode
  if (upgrade) {
    upgradeFeatures(status);
    return;
  }

  // Migrate mode
  if (migrate) {
    migrateSettings();
    return;
  }

  // Auto-migrate if issues detected
  if (hasIssues && (profile || enable.length > 0)) {
    log('\n⚠️  Auto-migrating invalid formats...', c.yellow);
    migrateSettings();
  }

  const actions = { enabled: [], disabled: [], migrated: hasIssues };

  // Apply profile
  if (profile) {
    applyProfile(profile, { archivalDays });
    const p = PROFILES[profile];
    actions.enabled = p.enable || [];
    actions.disabled = p.disable || [];
  }

  // Enable specific features
  enable.forEach(f => {
    if (enableFeature(f, { archivalDays })) {
      actions.enabled.push(f);
    }
  });

  // Disable specific features
  disable.forEach(f => {
    if (disableFeature(f)) {
      actions.disabled.push(f);
    }
  });

  // Print summary if anything changed
  if (actions.enabled.length > 0 || actions.disabled.length > 0) {
    printSummary(actions);
  } else if (!detect) {
    log('\nNo changes made. Use --help for usage.', c.dim);
  }
}

main();
