/**
 * configure-features.js - Feature enable/disable handlers for agileflow-configure
 *
 * Extracted from agileflow-configure.js (US-0094)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
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
  tmuxautospawn: { metadataOnly: true },
  shellaliases: {
    metadataOnly: false,
    description: 'Shell aliases (af/agileflow) for tmux-wrapped Claude',
  },
  claudemdreinforcement: {
    metadataOnly: false,
    description: 'Add /babysit rules to CLAUDE.md for context preservation',
  },
  processcleanup: {
    metadataOnly: true,
    description: 'Auto-kill duplicate Claude processes in same directory to prevent freezing',
  },
  claudeflags: {
    metadataOnly: false,
    description:
      'Default flags for Claude CLI (sets permissions.defaultMode in .claude/settings.json)',
  },
  agentteams: {
    metadataOnly: false,
    description: 'Enable Claude Code native Agent Teams (sets env var in .claude/settings.json)',
  },
  noaiattribution: {
    preToolUseHook: true,
    script: 'strip-ai-attribution.js',
    description: 'Block git commits containing AI attribution (Co-Authored-By, etc.)',
  },
  browserqa: {
    metadataOnly: false,
    description:
      'Agentic browser testing with Playwright (Bowser four-layer pattern). Screenshot evidence, 80% pass rate threshold.',
  },
  contextverbosity: {
    metadataOnly: true,
    description: 'Control how much context is loaded per command (full/lite/minimal)',
  },
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
      'tmuxautospawn',
      'noaiattribution',
    ],
    archivalDays: 30,
  },
  basic: {
    description: 'Essential hooks + archival (SessionStart + PreCompact + Archival)',
    enable: [
      'sessionstart',
      'precompact',
      'archival',
      'askuserquestion',
      'tmuxautospawn',
      'noaiattribution',
    ],
    disable: ['statusline', 'ralphloop', 'selfimprove'],
    archivalDays: 30,
    contextVerbosity: 'lite',
  },
  minimal: {
    description: 'SessionStart + archival only',
    enable: ['sessionstart', 'archival'],
    disable: [
      'precompact',
      'statusline',
      'ralphloop',
      'selfimprove',
      'askuserquestion',
      'tmuxautospawn',
    ],
    archivalDays: 30,
    contextVerbosity: 'lite',
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
      'tmuxautospawn',
      'noaiattribution',
    ],
  },
  experimental: {
    description:
      '⚠️ CONTEXT HEAVY: Full command file injection during compact (uses more tokens but may be more reliable)',
    enable: [
      'sessionstart',
      'precompact',
      'archival',
      'statusline',
      'ralphloop',
      'selfimprove',
      'askuserquestion',
      'tmuxautospawn',
      'noaiattribution',
    ],
    archivalDays: 30,
    experimental: {
      fullFileInjection: true,
      description:
        'Instead of compact summaries, injects entire command files during context compaction',
    },
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

  // Handle tmuxautospawn (metadata only)
  if (feature === 'tmuxautospawn') {
    updateMetadata(
      {
        features: {
          tmuxAutoSpawn: {
            enabled: true,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Tmux auto-spawn enabled');
    info('Running "af" or "agileflow" will auto-start Claude in tmux session');
    return true;
  }

  // Handle processcleanup (metadata only)
  if (feature === 'processcleanup') {
    updateMetadata(
      {
        features: {
          processCleanup: {
            enabled: true,
            autoKill: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Process cleanup enabled');
    info('Duplicate Claude processes will be detected and reported on session start');
    info('Auto-kill is disabled by default for safety');
    info('   Only affects processes in the SAME working directory (worktrees are safe)');
    info('   Set AGILEFLOW_PROCESS_CLEANUP_AUTOKILL=1 to opt in to auto-kill at runtime');
    return true;
  }

  // Handle claude flags (e.g., --dangerously-skip-permissions)
  // Also sets permissions.defaultMode in .claude/settings.json
  if (feature === 'claudeflags') {
    const defaultFlags = options.flags || '--dangerously-skip-permissions';

    // Map CLI flags to settings.json defaultMode values
    const flagToMode = {
      '--dangerously-skip-permissions': 'bypassPermissions',
      '--permission-mode acceptEdits': 'acceptEdits',
    };
    const defaultMode = flagToMode[defaultFlags];

    if (defaultMode) {
      settings.permissions = settings.permissions || {};
      settings.permissions.defaultMode = defaultMode;
      writeJSON('.claude/settings.json', settings);
      info(`Set permissions.defaultMode = "${defaultMode}" in .claude/settings.json`);
    }

    updateMetadata(
      {
        features: {
          claudeFlags: {
            enabled: true,
            defaultFlags,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success(`Default Claude flags configured: ${defaultFlags}`);
    info('These flags will be passed to Claude when launched via "af" or "agileflow"');
    if (defaultMode) {
      info('Restart Claude Code for the new default mode to take effect');
    }
    return true;
  }

  // Handle agent teams - set env var in .claude/settings.json
  if (feature === 'agentteams') {
    settings.env = settings.env || {};
    settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
    writeJSON('.claude/settings.json', settings);
    updateMetadata(
      {
        features: {
          agentTeams: {
            enabled: true,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Native Agent Teams enabled');
    info('Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.json');
    info('Claude Code will use native TeamCreate/SendMessage tools');
    info('Fallback: subagent mode (Task/TaskOutput) when native is unavailable');
    return true;
  }

  // Handle shell aliases
  if (feature === 'shellaliases') {
    const result = enableShellAliases();
    if (
      result.configured.length > 0 ||
      result.skipped.some(s => s.includes('already configured'))
    ) {
      updateMetadata(
        {
          features: {
            shellAliases: {
              enabled: true,
              version,
              at: new Date().toISOString(),
              shells: result.configured,
            },
          },
        },
        version
      );
      if (result.configured.length > 0) {
        success(`Shell aliases added to: ${result.configured.join(', ')}`);
        info('Reload shell: source ~/.bashrc or source ~/.zshrc');
        info('Then use "af" or "agileflow" to start Claude in tmux');
      } else {
        info('Shell aliases already configured');
      }
      return true;
    }
    if (result.skipped.length > 0) {
      warn(`Shell aliases skipped: ${result.skipped.join(', ')}`);
    }
    return false;
  }

  // Handle CLAUDE.md reinforcement
  if (feature === 'claudemdreinforcement') {
    const result = enableClaudeMdReinforcement();
    if (result.success) {
      updateMetadata(
        {
          features: {
            claudeMdReinforcement: {
              enabled: true,
              version,
              at: new Date().toISOString(),
            },
          },
        },
        version
      );
      if (result.added) {
        success('Added /babysit rules to CLAUDE.md');
      } else {
        info('CLAUDE.md already has /babysit rules');
      }
      return true;
    }
    error(`Failed to update CLAUDE.md: ${result.error}`);
    return false;
  }

  // Handle damage control
  if (feature === 'damagecontrol') {
    return enableDamageControl(settings, options, version);
  }

  // Handle no AI attribution
  if (feature === 'noaiattribution') {
    return enableNoAiAttribution(settings, version);
  }

  // Handle browser QA (agentic browser testing)
  if (feature === 'browserqa') {
    return enableBrowserQa(version);
  }

  // Handle context verbosity (metadata only)
  if (feature === 'contextverbosity') {
    const mode = options.mode || 'lite';
    const validModes = ['full', 'lite', 'minimal'];
    if (!validModes.includes(mode)) {
      error(`Invalid verbosity mode: ${mode}. Valid: ${validModes.join(', ')}`);
      return false;
    }
    updateMetadata(
      {
        features: {
          contextVerbosity: {
            enabled: true,
            mode,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success(`Context verbosity set to: ${mode}`);
    if (mode === 'lite') {
      info('Lite: summary table + git status + active stories + smart recommendations');
      info('Skips: full file dumps, feature catalog, research content, ideation');
    } else if (mode === 'minimal') {
      info('Minimal: summary table only with story counts');
      info('Skips: everything except compact summary');
    }
    return true;
  }

  const featureConfig = FEATURES[feature];
  const contentHash = featureConfig?.script
    ? hashFile(path.join(SCRIPTS_DIR, featureConfig.script))
    : null;
  writeJSON('.claude/settings.json', settings);
  updateMetadata(
    {
      features: {
        [feature]: {
          enabled: true,
          version,
          ...(contentHash ? { contentHash } : {}),
          at: new Date().toISOString(),
        },
      },
    },
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

  const primaryHash = hashFile(path.join(SCRIPTS_DIR, 'damage-control-bash.js'));
  updateMetadata(
    {
      features: {
        damagecontrol: {
          enabled: true,
          protectionLevel: level,
          version,
          ...(primaryHash ? { contentHash: primaryHash } : {}),
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

/**
 * Enable no AI attribution feature
 */
function enableNoAiAttribution(settings, version) {
  const scriptName = 'strip-ai-attribution.js';

  if (!scriptExists(scriptName)) {
    error(`Script not found: ${getScriptPath(scriptName)}`);
    info('Run "npx agileflow update" to reinstall scripts');
    return false;
  }

  // Initialize PreToolUse array
  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }

  const scriptFullPath = path.join(process.cwd(), '.agileflow', 'scripts', scriptName);

  // Remove existing hook if any
  for (const entry of settings.hooks.PreToolUse) {
    if (entry.matcher === 'Bash' && Array.isArray(entry.hooks)) {
      entry.hooks = entry.hooks.filter(h => !h.command?.includes('strip-ai-attribution'));
    }
  }
  // Clean up empty entries
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    h => Array.isArray(h.hooks) && h.hooks.length > 0
  );

  // Add to existing Bash matcher or create new one
  const bashEntry = settings.hooks.PreToolUse.find(h => h.matcher === 'Bash');
  if (bashEntry) {
    bashEntry.hooks.push({ type: 'command', command: `node ${scriptFullPath}`, timeout: 5 });
  } else {
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: `node ${scriptFullPath}`, timeout: 5 }],
    });
  }

  const contentHash = hashFile(path.join(SCRIPTS_DIR, scriptName));
  updateMetadata(
    {
      features: {
        noaiattribution: {
          enabled: true,
          version,
          ...(contentHash ? { contentHash } : {}),
          at: new Date().toISOString(),
        },
      },
    },
    version
  );

  writeJSON('.claude/settings.json', settings);
  updateGitignore();

  success('AI attribution blocking enabled');
  info('Git commits with AI footers (Co-Authored-By, etc.) will be blocked');
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

  // Disable tmuxautospawn
  if (feature === 'tmuxautospawn') {
    updateMetadata(
      {
        features: {
          tmuxAutoSpawn: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Tmux auto-spawn disabled');
    info('Running "af" or "agileflow" will start Claude directly without tmux');
    return true;
  }

  // Disable processcleanup
  if (feature === 'processcleanup') {
    updateMetadata(
      {
        features: {
          processCleanup: {
            enabled: false,
            autoKill: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Process cleanup disabled');
    info('Duplicate Claude processes will only trigger a warning (no auto-kill)');
    return true;
  }

  // Disable claude flags - also reset permissions.defaultMode in settings.json
  if (feature === 'claudeflags') {
    if (settings.permissions?.defaultMode) {
      delete settings.permissions.defaultMode;
      writeJSON('.claude/settings.json', settings);
      info('Removed permissions.defaultMode from .claude/settings.json');
    }
    updateMetadata(
      {
        features: {
          claudeFlags: {
            enabled: false,
            defaultFlags: '',
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Default Claude flags disabled');
    info('Claude will launch with default permissions (prompts for each action)');
    info('Restart Claude Code for the change to take effect');
    return true;
  }

  // Disable agent teams - remove env var from .claude/settings.json
  if (feature === 'agentteams') {
    if (settings.env) {
      delete settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      if (Object.keys(settings.env).length === 0) {
        delete settings.env;
      }
    }
    writeJSON('.claude/settings.json', settings);
    updateMetadata(
      {
        features: {
          agentTeams: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Native Agent Teams disabled');
    info('Removed CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS from .claude/settings.json');
    info('AgileFlow will use subagent mode (Task/TaskOutput) for multi-agent orchestration');
    return true;
  }

  // Disable shell aliases
  if (feature === 'shellaliases') {
    const result = disableShellAliases();
    updateMetadata(
      {
        features: {
          shellAliases: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    if (result.removed.length > 0) {
      success(`Shell aliases removed from: ${result.removed.join(', ')}`);
      info('Reload shell: source ~/.bashrc or source ~/.zshrc');
    } else {
      info('No shell aliases found to remove');
    }
    return true;
  }

  // Disable CLAUDE.md reinforcement
  if (feature === 'claudemdreinforcement') {
    const result = disableClaudeMdReinforcement();
    updateMetadata(
      {
        features: {
          claudeMdReinforcement: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    if (result.removed) {
      success('Removed /babysit rules from CLAUDE.md');
    } else {
      info('CLAUDE.md did not have /babysit rules');
    }
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

  // Disable browser QA
  if (feature === 'browserqa') {
    updateMetadata(
      {
        features: {
          browserqa: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Browser QA disabled');
    info('Agentic browser testing deactivated');
    return true;
  }

  // Disable context verbosity (reset to full)
  if (feature === 'contextverbosity') {
    updateMetadata(
      {
        features: {
          contextVerbosity: {
            enabled: false,
            mode: 'full',
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    success('Context verbosity reset to full');
    return true;
  }

  // Disable no AI attribution
  if (feature === 'noaiattribution') {
    if (settings.hooks?.PreToolUse && Array.isArray(settings.hooks.PreToolUse)) {
      for (const entry of settings.hooks.PreToolUse) {
        if (entry.matcher === 'Bash' && Array.isArray(entry.hooks)) {
          entry.hooks = entry.hooks.filter(h => !h.command?.includes('strip-ai-attribution'));
        }
      }
      // Clean up empty entries
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        h => Array.isArray(h.hooks) && h.hooks.length > 0
      );
      if (settings.hooks.PreToolUse.length === 0) {
        delete settings.hooks.PreToolUse;
      }
    }

    updateMetadata(
      {
        features: {
          noaiattribution: {
            enabled: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );

    writeJSON('.claude/settings.json', settings);
    success('AI attribution blocking disabled');
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

  // Apply context verbosity if specified in profile
  if (profile.contextVerbosity) {
    enableFeature('contextverbosity', { mode: profile.contextVerbosity }, version);
  }

  // Handle experimental profile settings
  if (profile.experimental) {
    updateMetadata(
      {
        features: {
          experimental: {
            enabled: true,
            fullFileInjection: profile.experimental.fullFileInjection || false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
    if (profile.experimental.fullFileInjection) {
      warn('⚠️  EXPERIMENTAL: Full file injection enabled');
      info('   PreCompact will inject entire command files instead of compact summaries');
      info('   This uses more context tokens but may provide better instruction adherence');
    }
  } else {
    // Disable experimental mode if switching to non-experimental profile
    updateMetadata(
      {
        features: {
          experimental: {
            enabled: false,
            fullFileInjection: false,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
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

// ============================================================================
// STARTUP MODE (atomic command)
// ============================================================================

/**
 * Valid startup modes and their mappings
 */
const STARTUP_MODES = {
  'skip-permissions': {
    flags: '--dangerously-skip-permissions',
    defaultMode: 'bypassPermissions',
    description: 'Skip all permission prompts (trusted mode)',
  },
  'accept-edits': {
    flags: '--permission-mode acceptEdits',
    defaultMode: 'acceptEdits',
    description: 'Auto-accept file edits, prompt for other actions',
  },
  normal: {
    flags: null,
    defaultMode: null,
    description: 'Standard Claude with permission prompts',
  },
  'no-claude': {
    flags: null,
    defaultMode: null,
    description: 'Create worktree only, start Claude manually',
  },
};

/**
 * Set startup mode atomically - updates BOTH metadata AND .claude/settings.json
 * This replaces the fragile two-step process of updating metadata + running --enable=claudeflags
 *
 * @param {string} mode - One of: skip-permissions, accept-edits, normal, no-claude
 * @param {string} version - Current version string
 * @returns {boolean} Success
 */
function enableStartupMode(mode, version) {
  const modeConfig = STARTUP_MODES[mode];
  if (!modeConfig) {
    error(`Unknown startup mode: ${mode}`);
    log(`  Valid modes: ${Object.keys(STARTUP_MODES).join(', ')}`, c.dim);
    return false;
  }

  ensureDir('.claude');
  const settings = readJSON('.claude/settings.json') || {};
  settings.permissions = settings.permissions || { allow: [], deny: [], ask: [] };

  if (mode === 'normal' || mode === 'no-claude') {
    // Remove defaultMode from settings
    if (settings.permissions.defaultMode) {
      delete settings.permissions.defaultMode;
    }
    writeJSON('.claude/settings.json', settings);

    // Disable claudeflags + set defaultStartupMode in metadata (single write)
    updateMetadata(
      {
        features: {
          claudeFlags: {
            enabled: false,
            defaultFlags: '',
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
  } else {
    // Set defaultMode in settings.json
    settings.permissions.defaultMode = modeConfig.defaultMode;
    writeJSON('.claude/settings.json', settings);

    // Enable claudeflags + set defaultStartupMode in metadata (single write)
    updateMetadata(
      {
        features: {
          claudeFlags: {
            enabled: true,
            defaultFlags: modeConfig.flags,
            version,
            at: new Date().toISOString(),
          },
        },
      },
      version
    );
  }

  // Set defaultStartupMode in metadata (updateMetadata already created file if missing)
  const metaPath = 'docs/00-meta/agileflow-metadata.json';
  const meta = readJSON(metaPath) || {};
  meta.defaultStartupMode = mode;
  meta.updated = new Date().toISOString();
  writeJSON(metaPath, meta);

  success(`Default startup mode set to: ${mode}`);
  if (modeConfig.defaultMode) {
    info(`Set permissions.defaultMode = "${modeConfig.defaultMode}" in .claude/settings.json`);
  } else {
    info('Removed permissions.defaultMode from .claude/settings.json');
  }
  info(`Metadata: defaultStartupMode = "${mode}"`);
  if (mode !== 'normal') {
    info('Restart Claude Code for the new mode to take effect');
  }

  return true;
}

// ============================================================================
// SHELL ALIASES
// ============================================================================

const SHELL_ALIAS_MARKER = '# AgileFlow tmux wrapper';
const SHELL_ALIAS_BLOCK = `
${SHELL_ALIAS_MARKER}
# Use 'af' or 'agileflow' for tmux, 'claude' stays normal
alias af="bash .agileflow/scripts/af"
alias agileflow="bash .agileflow/scripts/af"
`;

/**
 * Enable shell aliases by adding them to ~/.bashrc and ~/.zshrc
 * @returns {object} Result with configured and skipped shells
 */
function enableShellAliases() {
  const result = {
    configured: [],
    skipped: [],
    error: null,
  };

  // Only set up aliases on Unix-like systems
  if (process.platform === 'win32') {
    result.skipped.push('Windows (not supported)');
    return result;
  }

  const homeDir = os.homedir();
  const rcFiles = [
    { name: 'bash', path: path.join(homeDir, '.bashrc') },
    { name: 'zsh', path: path.join(homeDir, '.zshrc') },
  ];

  // Lines that belong to AgileFlow alias blocks (old and new markers)
  const ALIAS_BLOCK_LINES = [
    '# AgileFlow tmux wrapper',
    '# AgileFlow tmux shortcuts (claude stays normal)',
    "# Use 'af' or 'agileflow' for tmux, 'claude' stays normal",
    'alias af="bash .agileflow/scripts/af"',
    'alias agileflow="bash .agileflow/scripts/af"',
  ];

  for (const rc of rcFiles) {
    try {
      // Check if RC file exists
      if (!fs.existsSync(rc.path)) {
        result.skipped.push(`${rc.name} (no ${path.basename(rc.path)})`);
        continue;
      }

      const content = fs.readFileSync(rc.path, 'utf8');

      // Check for ANY existing af alias (covers old and new markers)
      if (content.includes('alias af="bash .agileflow/scripts/af"')) {
        // Clean up: remove ALL existing alias block lines, then re-add one clean copy
        const lines = content.split('\n');
        const cleaned = lines.filter(line => {
          const trimmed = line.trim();
          return !ALIAS_BLOCK_LINES.includes(trimmed);
        });
        // Remove trailing empty lines from cleanup
        while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
          cleaned.pop();
        }
        fs.writeFileSync(rc.path, cleaned.join('\n') + SHELL_ALIAS_BLOCK);
        result.configured.push(rc.name);
        continue;
      }

      // First time: just append
      fs.appendFileSync(rc.path, SHELL_ALIAS_BLOCK);
      result.configured.push(rc.name);
    } catch (err) {
      result.skipped.push(`${rc.name} (error: ${err.message})`);
    }
  }

  return result;
}

/**
 * Disable shell aliases by removing them from ~/.bashrc and ~/.zshrc
 * @returns {object} Result with removed shells
 */
function disableShellAliases() {
  const result = {
    removed: [],
    skipped: [],
  };

  if (process.platform === 'win32') {
    return result;
  }

  const homeDir = os.homedir();
  const rcFiles = [
    { name: 'bash', path: path.join(homeDir, '.bashrc') },
    { name: 'zsh', path: path.join(homeDir, '.zshrc') },
  ];

  // Lines that belong to AgileFlow alias blocks (old and new markers)
  const ALIAS_BLOCK_LINES = [
    '# AgileFlow tmux wrapper',
    '# AgileFlow tmux shortcuts (claude stays normal)',
    "# Use 'af' or 'agileflow' for tmux, 'claude' stays normal",
    'alias af="bash .agileflow/scripts/af"',
    'alias agileflow="bash .agileflow/scripts/af"',
  ];

  for (const rc of rcFiles) {
    try {
      if (!fs.existsSync(rc.path)) {
        continue;
      }

      const content = fs.readFileSync(rc.path, 'utf8');

      // Check for any AgileFlow alias (covers old and new markers)
      if (
        !content.includes('alias af="bash .agileflow/scripts/af"') &&
        !content.includes(SHELL_ALIAS_MARKER)
      ) {
        continue;
      }

      // Remove all alias block lines
      const lines = content.split('\n');
      const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        return !ALIAS_BLOCK_LINES.includes(trimmed);
      });

      // Remove trailing empty lines from cleanup
      while (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].trim() === '') {
        filteredLines.pop();
      }

      fs.writeFileSync(rc.path, filteredLines.join('\n') + '\n', 'utf8');
      result.removed.push(rc.name);
    } catch (err) {
      result.skipped.push(`${rc.name} (error: ${err.message})`);
    }
  }

  return result;
}

// ============================================================================
// CLAUDE.MD REINFORCEMENT
// ============================================================================

// ============================================================================
// BROWSER QA
// ============================================================================

/**
 * Enable browser QA (agentic browser testing)
 * Creates evidence directory structure, deploys spec template, updates metadata
 */
function enableBrowserQa(version) {
  // Create evidence directory structure + screenshots dir for visual verification
  const dirs = [
    '.agileflow/ui-review',
    '.agileflow/ui-review/runs',
    '.agileflow/ui-review/specs',
    '.agileflow/ui-review/baselines',
    'screenshots',
  ];
  for (const dir of dirs) {
    ensureDir(dir);
  }

  // Deploy spec template if not exists
  const templateDest = path.join(
    process.cwd(),
    '.agileflow',
    'ui-review',
    'specs',
    '_template.yaml'
  );
  if (!fs.existsSync(templateDest)) {
    const templateSrc = path.join(process.cwd(), '.agileflow', 'templates', 'browser-qa-spec.yaml');
    if (fs.existsSync(templateSrc)) {
      fs.copyFileSync(templateSrc, templateDest);
      success('Deployed browser-qa spec template');
    } else {
      info('No spec template found - create YAML specs manually in .agileflow/ui-review/specs/');
    }
  }

  // Check for Playwright
  let playwrightAvailable = false;
  try {
    require.resolve('playwright');
    playwrightAvailable = true;
  } catch {
    // Not installed
  }

  if (!playwrightAvailable) {
    warn('Playwright not found - install for browser automation:');
    info('  npm install --save-optional playwright');
    info('  npx playwright install chromium');
  }

  // Update gitignore - evidence runs should not be committed
  updateGitignore();

  updateMetadata(
    {
      features: {
        browserqa: {
          enabled: true,
          version,
          at: new Date().toISOString(),
          playwright_detected: playwrightAvailable,
        },
      },
    },
    version
  );

  success('UI Testing enabled (agentic browser testing + visual verification)');
  info('Evidence directory: .agileflow/ui-review/');
  info('Screenshots directory: screenshots/ (for visual verification with VISUAL=true)');
  info('Spec template: .agileflow/ui-review/specs/_template.yaml');
  info('Agentic testing: /agileflow:browser-qa SCENARIO=<spec.yaml>');
  info('Visual verification: /agileflow:babysit EPIC=EP-XXXX MODE=loop VISUAL=true');
  if (playwrightAvailable) {
    info('Playwright: detected');
  }

  return true;
}

const CLAUDE_MD_MARKER = '<!-- AGILEFLOW_BABYSIT_RULES -->';
const CLAUDE_MD_CONTENT = `

${CLAUDE_MD_MARKER}
## AgileFlow /babysit Context Preservation Rules

When \`/agileflow:babysit\` is active (check session-state.json), these rules are MANDATORY:

1. **ALWAYS end responses with the AskUserQuestion tool** - Not text like "What next?" but the ACTUAL TOOL CALL
2. **Use Plan Mode for non-trivial tasks** - Call \`EnterPlanMode\` before complex implementations
3. **Delegate complex work to domain experts** - Use \`Task\` tool with appropriate \`subagent_type\`
4. **Track progress with TaskCreate/TaskUpdate** - For any task with 3+ steps

These rules persist across conversation compaction. Check \`docs/09-agents/session-state.json\` for active commands.
${CLAUDE_MD_MARKER}
`;

/**
 * Enable CLAUDE.md reinforcement by adding babysit rules
 * @returns {object} Result with success, added, and error
 */
function enableClaudeMdReinforcement() {
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');

  try {
    let existingContent = '';
    if (fs.existsSync(claudeMdPath)) {
      existingContent = fs.readFileSync(claudeMdPath, 'utf8');
    }

    // Only append if marker doesn't exist
    if (existingContent.includes(CLAUDE_MD_MARKER)) {
      return { success: true, added: false };
    }

    fs.appendFileSync(claudeMdPath, CLAUDE_MD_CONTENT);
    return { success: true, added: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Disable CLAUDE.md reinforcement by removing babysit rules
 * @returns {object} Result with removed flag
 */
function disableClaudeMdReinforcement() {
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    return { removed: false };
  }

  try {
    const content = fs.readFileSync(claudeMdPath, 'utf8');

    if (!content.includes(CLAUDE_MD_MARKER)) {
      return { removed: false };
    }

    // Remove the section between markers (inclusive)
    const startIdx = content.indexOf(CLAUDE_MD_MARKER);
    const endMarkerIdx = content.indexOf(CLAUDE_MD_MARKER, startIdx + CLAUDE_MD_MARKER.length);

    if (startIdx === -1 || endMarkerIdx === -1) {
      return { removed: false };
    }

    // Find the start of the line containing the first marker
    let lineStart = content.lastIndexOf('\n', startIdx);
    if (lineStart === -1) lineStart = 0;

    // Find the end of the line containing the second marker
    let lineEnd = content.indexOf('\n', endMarkerIdx + CLAUDE_MD_MARKER.length);
    if (lineEnd === -1) lineEnd = content.length;

    const newContent = content.slice(0, lineStart) + content.slice(lineEnd);

    // Clean up any trailing newlines
    fs.writeFileSync(claudeMdPath, newContent.trimEnd() + '\n', 'utf8');
    return { removed: true };
  } catch (err) {
    return { removed: false, error: err.message };
  }
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
  // Startup mode
  enableStartupMode,
  STARTUP_MODES,
  // Shell aliases
  enableShellAliases,
  disableShellAliases,
  // CLAUDE.md reinforcement
  enableClaudeMdReinforcement,
  disableClaudeMdReinforcement,
};
