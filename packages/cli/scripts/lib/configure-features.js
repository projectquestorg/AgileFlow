/**
 * configure-features.js - Feature enable/disable handlers for agileflow-configure
 *
 * Extracted from agileflow-configure.js (US-0094)
 */

const fs = require('fs');
const path = require('path');
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
  writeJSON,
  updateGitignore,
} = require('./configure-utils');

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const FEATURES = {
  sessionstart: { hook: 'SessionStart', script: 'agileflow-welcome.js', type: 'node' },
  precompact: { hook: 'PreCompact', script: 'precompact-context.sh', type: 'bash' },
  ralphloop: { hook: 'Stop', script: 'ralph-loop.js', type: 'node' },
  selfimprove: { hook: 'Stop', script: 'auto-self-improve.js', type: 'node' },
  archival: { script: 'archive-completed-stories.sh', requiresHook: 'sessionstart' },
  statusline: { script: 'agileflow-statusline.sh' },
  autoupdate: { metadataOnly: true },
  damagecontrol: {
    preToolUseHooks: true,
    scripts: ['damage-control-bash.js', 'damage-control-edit.js', 'damage-control-write.js'],
    patternsFile: 'damage-control-patterns.yaml',
  },
  askuserquestion: { metadataOnly: true },
};

const PROFILES = {
  full: {
    description: 'All features enabled (including experimental Stop hooks)',
    enable: [
      'sessionstart',
      'precompact',
      'archival',
      'statusline',
      'ralphloop',
      'selfimprove',
      'askuserquestion',
    ],
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
    disable: [
      'sessionstart',
      'precompact',
      'archival',
      'statusline',
      'ralphloop',
      'selfimprove',
      'askuserquestion',
    ],
  },
};

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

// Scripts directory
const SCRIPTS_DIR = path.join(process.cwd(), '.agileflow', 'scripts');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const scriptExists = scriptName => fs.existsSync(path.join(SCRIPTS_DIR, scriptName));
const getScriptPath = scriptName => `.agileflow/scripts/${scriptName}`;

// ============================================================================
// METADATA MANAGEMENT
// ============================================================================

/**
 * Update metadata file with provided updates
 * @param {object} updates - Updates to apply (archival, features, updates)
 * @param {string} version - Current version string
 */
function updateMetadata(updates, version) {
  const metaPath = 'docs/00-meta/agileflow-metadata.json';

  if (!fs.existsSync(metaPath)) {
    ensureDir('docs/00-meta');
    writeJSON(metaPath, { version, created: new Date().toISOString() });
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

  meta.version = version;
  meta.updated = new Date().toISOString();

  writeJSON(metaPath, meta);
}

// ============================================================================
// ENABLE FEATURE
// ============================================================================

/**
 * Enable a feature
 * @param {string} feature - Feature name
 * @param {object} options - Options (archivalDays, mode, protectionLevel, isUpgrade)
 * @param {string} version - Current version string
 * @returns {boolean} Success
 */
function enableFeature(feature, options = {}, version) {
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
    if (!enableHookFeature(feature, config, settings, version)) {
      return false;
    }
  }

  // Handle archival
  if (feature === 'archival') {
    if (!enableArchival(settings, options, version)) {
      return false;
    }
  }

  // Handle statusLine
  if (feature === 'statusline') {
    if (!enableStatusLine(settings, version)) {
      return false;
    }
  }

  // Handle autoupdate (metadata only)
  if (feature === 'autoupdate') {
    updateMetadata({ updates: { autoUpdate: true, showChangelog: true } }, version);
    success('Auto-update enabled');
    info('AgileFlow will check for updates every session and update automatically');
    return true;
  }

  // Handle askuserquestion (metadata only)
  if (feature === 'askuserquestion') {
    const mode = options.mode || 'all';
    updateMetadata(
      {
        features: {
          askUserQuestion: {
            enabled: true,
            mode,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success(`AskUserQuestion enabled (mode: ${mode})`);
    info('All commands will end with AskUserQuestion tool for guided interaction');
    return true;
  }

  // Handle damage control
  if (feature === 'damagecontrol') {
    return enableDamageControl(settings, options, version);
  }

  writeJSON('.claude/settings.json', settings);
  updateMetadata(
    { features: { [feature]: { enabled: true, version, at: new Date().toISOString() } } },
    version
  );
  updateGitignore();

  return true;
}

/**
 * Enable a hook-based feature
 */
function enableHookFeature(feature, config, settings, version) {
  const scriptPath = getScriptPath(config.script);

  if (!scriptExists(config.script)) {
    error(`Script not found: ${scriptPath}`);
    info('Run "npx agileflow update" to reinstall scripts');
    return false;
  }

  const absoluteScriptPath = path.join(process.cwd(), scriptPath);
  const isStopHook = config.hook === 'Stop';
  const command =
    config.type === 'node'
      ? `node ${absoluteScriptPath}${isStopHook ? ' 2>/dev/null || true' : ''}`
      : `bash ${absoluteScriptPath}${isStopHook ? ' 2>/dev/null || true' : ''}`;

  if (isStopHook) {
    // Stop hooks stack - add to existing
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [{ matcher: '', hooks: [] }];
    } else if (!Array.isArray(settings.hooks.Stop) || settings.hooks.Stop.length === 0) {
      settings.hooks.Stop = [{ matcher: '', hooks: [] }];
    } else if (!settings.hooks.Stop[0].hooks) {
      settings.hooks.Stop[0].hooks = [];
    }

    const hasHook = settings.hooks.Stop[0].hooks.some(h => h.command?.includes(config.script));
    if (!hasHook) {
      settings.hooks.Stop[0].hooks.push({ type: 'command', command });
      success(`Stop hook added (${config.script})`);
    } else {
      info(`${feature} already enabled`);
    }
  } else {
    // Other hooks replace entirely
    settings.hooks[config.hook] = [{ matcher: '', hooks: [{ type: 'command', command }] }];
    success(`${config.hook} hook enabled (${config.script})`);
  }

  return true;
}

/**
 * Enable archival feature
 */
function enableArchival(settings, options, version) {
  const days = options.archivalDays || 30;
  const scriptPath = getScriptPath('archive-completed-stories.sh');

  if (!scriptExists('archive-completed-stories.sh')) {
    error(`Script not found: ${scriptPath}`);
    info('Run "npx agileflow update" to reinstall scripts');
    return false;
  }

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

  updateMetadata({ archival: { enabled: true, threshold_days: days } }, version);
  success(`Archival enabled (${days} days)`);
  return true;
}

/**
 * Enable status line feature
 */
function enableStatusLine(settings, version) {
  const scriptPath = getScriptPath('agileflow-statusline.sh');

  if (!scriptExists('agileflow-statusline.sh')) {
    error(`Script not found: ${scriptPath}`);
    info('Run "npx agileflow update" to reinstall scripts');
    return false;
  }

  const absoluteScriptPath = path.join(process.cwd(), scriptPath);
  settings.statusLine = {
    type: 'command',
    command: `bash ${absoluteScriptPath}`,
    padding: 0,
  };
  success('Status line enabled');
  return true;
}

/**
 * Enable damage control feature
 */
function enableDamageControl(settings, options, version) {
  const level = options.protectionLevel || 'standard';

  // Verify all required scripts exist
  const requiredScripts = [
    'damage-control-bash.js',
    'damage-control-edit.js',
    'damage-control-write.js',
  ];
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
    const templatePath = path.join(
      process.cwd(),
      '.agileflow',
      'templates',
      'damage-control-patterns.yaml'
    );
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, patternsDest);
      success('Deployed damage control patterns');
    } else {
      warn('No patterns template found - hooks will use defaults');
    }
  }

  // Initialize PreToolUse array
  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }

  const addPreToolUseHook = (matcher, scriptName) => {
    const scriptFullPath = path.join(process.cwd(), '.agileflow', 'scripts', scriptName);
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => h.matcher !== matcher);
    settings.hooks.PreToolUse.push({
      matcher,
      hooks: [{ type: 'command', command: `node ${scriptFullPath}`, timeout: 5 }],
    });
  };

  addPreToolUseHook('Bash', 'damage-control-bash.js');
  addPreToolUseHook('Edit', 'damage-control-edit.js');
  addPreToolUseHook('Write', 'damage-control-write.js');

  success('Damage control PreToolUse hooks enabled');

  updateMetadata(
    {
      features: {
        damagecontrol: {
          enabled: true,
          protectionLevel: level,
          version,
          at: new Date().toISOString(),
        },
      },
    },
    version
  );

  writeJSON('.claude/settings.json', settings);
  updateGitignore();

  return true;
}

// ============================================================================
// DISABLE FEATURE
// ============================================================================

/**
 * Disable a feature
 * @param {string} feature - Feature name
 * @param {string} version - Current version string
 * @returns {boolean} Success
 */
function disableFeature(feature, version) {
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
      // Stop hooks stack - remove only this script
      if (settings.hooks.Stop?.[0]?.hooks) {
        const before = settings.hooks.Stop[0].hooks.length;
        settings.hooks.Stop[0].hooks = settings.hooks.Stop[0].hooks.filter(
          h => !h.command?.includes(config.script)
        );
        const after = settings.hooks.Stop[0].hooks.length;

        if (before > after) {
          success(`Stop hook removed (${config.script})`);
        }

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
    if (settings.hooks?.SessionStart?.[0]?.hooks) {
      settings.hooks.SessionStart[0].hooks = settings.hooks.SessionStart[0].hooks.filter(
        h => !h.command?.includes('archive-completed-stories')
      );
    }
    updateMetadata({ archival: { enabled: false } }, version);
    success('Archival disabled');
  }

  // Disable statusLine
  if (feature === 'statusline' && settings.statusLine) {
    delete settings.statusLine;
    success('Status line disabled');
  }

  // Disable autoupdate
  if (feature === 'autoupdate') {
    updateMetadata({ updates: { autoUpdate: false } }, version);
    success('Auto-update disabled');
    return true;
  }

  // Disable askuserquestion
  if (feature === 'askuserquestion') {
    updateMetadata(
      {
        features: {
          askUserQuestion: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('AskUserQuestion disabled');
    info('Commands will end with natural text questions instead of AskUserQuestion tool');
    return true;
  }

  // Disable damage control
  if (feature === 'damagecontrol') {
    if (settings.hooks?.PreToolUse && Array.isArray(settings.hooks.PreToolUse)) {
      const before = settings.hooks.PreToolUse.length;
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => {
        const isDamageControlHook = h.hooks?.some(hk => hk.command?.includes('damage-control'));
        return !isDamageControlHook;
      });
      const after = settings.hooks.PreToolUse.length;

      if (before > after) {
        success(`Removed ${before - after} damage control PreToolUse hook(s)`);
      }

      if (settings.hooks.PreToolUse.length === 0) {
        delete settings.hooks.PreToolUse;
      }
    }

    updateMetadata(
      {
        features: {
          damagecontrol: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );

    writeJSON('.claude/settings.json', settings);
    success('Damage control disabled');
    return true;
  }

  writeJSON('.claude/settings.json', settings);
  updateMetadata(
    { features: { [feature]: { enabled: false, version, at: new Date().toISOString() } } },
    version
  );

  return true;
}

// ============================================================================
// PROFILES
// ============================================================================

/**
 * Apply a preset profile
 * @param {string} profileName - Profile name
 * @param {object} options - Options
 * @param {string} version - Current version string
 * @returns {boolean} Success
 */
function applyProfile(profileName, options = {}, version) {
  const profile = PROFILES[profileName];
  if (!profile) {
    error(`Unknown profile: ${profileName}`);
    log('Available: ' + Object.keys(PROFILES).join(', '));
    return false;
  }

  header(`Applying "${profileName}" profile`);
  log(profile.description, c.dim);

  if (profile.enable) {
    profile.enable.forEach(f =>
      enableFeature(f, { archivalDays: profile.archivalDays || options.archivalDays }, version)
    );
  }

  if (profile.disable) {
    profile.disable.forEach(f => disableFeature(f, version));
  }

  return true;
}

// ============================================================================
// STATUSLINE COMPONENTS
// ============================================================================

/**
 * Set statusline component visibility
 * @param {string[]} enableComponents - Components to enable
 * @param {string[]} disableComponents - Components to disable
 * @returns {boolean} Success
 */
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

  meta.features = meta.features || {};
  meta.features.statusline = meta.features.statusline || {};
  meta.features.statusline.components = meta.features.statusline.components || {};

  // Set defaults
  STATUSLINE_COMPONENTS.forEach(comp => {
    if (meta.features.statusline.components[comp] === undefined) {
      meta.features.statusline.components[comp] = true;
    }
  });

  // Enable specified
  enableComponents.forEach(comp => {
    if (STATUSLINE_COMPONENTS.includes(comp)) {
      meta.features.statusline.components[comp] = true;
      success(`Statusline component enabled: ${comp}`);
    } else {
      warn(`Unknown component: ${comp} (available: ${STATUSLINE_COMPONENTS.join(', ')})`);
    }
  });

  // Disable specified
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

/**
 * List statusline components
 */
function listStatuslineComponents() {
  const metaPath = 'docs/00-meta/agileflow-metadata.json';

  header('Statusline Components');

  if (!fs.existsSync(metaPath)) {
    log('  No configuration found (defaults: all enabled)', c.dim);
    STATUSLINE_COMPONENTS.forEach(comp => {
      log(`   ${comp}: enabled (default)`, c.green);
    });
    return;
  }

  const meta = readJSON(metaPath);
  const components = meta?.features?.statusline?.components || {};

  STATUSLINE_COMPONENTS.forEach(comp => {
    const enabled = components[comp] !== false;
    const icon = enabled ? '' : '';
    const color = enabled ? c.green : c.dim;
    log(`  ${icon} ${comp}: ${enabled ? 'enabled' : 'disabled'}`, color);
  });

  log('\nTo toggle: --show=<component> or --hide=<component>', c.dim);
  log(`Components: ${STATUSLINE_COMPONENTS.join(', ')}`, c.dim);
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * Migrate settings to new format
 * @returns {boolean} Whether migration occurred
 */
function migrateSettings() {
  header('Migrating Settings...');

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

      if (typeof hook === 'string') {
        const isNode = hook.includes('node ') || hook.endsWith('.js');
        settings.hooks[hookName] = [
          { matcher: '', hooks: [{ type: 'command', command: isNode ? hook : `bash ${hook}` }] },
        ];
        success(`Migrated ${hookName} from string format`);
        migrated = true;
      } else if (Array.isArray(hook) && hook.length > 0) {
        const first = hook[0];
        if (first.enabled !== undefined || first.command !== undefined) {
          if (first.command) {
            settings.hooks[hookName] = [
              { matcher: '', hooks: [{ type: 'command', command: first.command }] },
            ];
            success(`Migrated ${hookName} from old object format`);
            migrated = true;
          }
        } else if (first.matcher === undefined) {
          settings.hooks[hookName] = [
            { matcher: '', hooks: first.hooks || [{ type: 'command', command: 'echo "hook"' }] },
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
      settings.statusLine = { type: 'command', command: settings.statusLine, padding: 0 };
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
    fs.copyFileSync('.claude/settings.json', '.claude/settings.json.backup');
    info('Backed up to .claude/settings.json.backup');
    writeJSON('.claude/settings.json', settings);
    success('Settings migrated successfully!');
  } else {
    info('No migration needed - formats are correct');
  }

  return migrated;
}

/**
 * Upgrade outdated features to latest version
 * @param {object} status - Status object from detectConfig
 * @param {string} version - Current version
 * @returns {boolean} Whether any features were upgraded
 */
function upgradeFeatures(status, version) {
  header('Upgrading Outdated Features...');

  let upgraded = 0;

  Object.entries(status.features).forEach(([feature, data]) => {
    if (data.enabled && data.outdated) {
      log(`\nUpgrading ${feature}...`, c.cyan);
      if (
        enableFeature(feature, { archivalDays: data.threshold || 30, isUpgrade: true }, version)
      ) {
        upgraded++;
      }
    }
  });

  if (upgraded === 0) {
    info('No features needed upgrading');
  } else {
    success(`Upgraded ${upgraded} feature(s) to v${version}`);
  }

  return upgraded > 0;
}

module.exports = {
  // Constants
  FEATURES,
  PROFILES,
  STATUSLINE_COMPONENTS,
  // Feature management
  enableFeature,
  disableFeature,
  applyProfile,
  updateMetadata,
  // Statusline components
  setStatuslineComponents,
  listStatuslineComponents,
  // Migration
  migrateSettings,
  upgradeFeatures,
  // Helpers
  scriptExists,
  getScriptPath,
};
