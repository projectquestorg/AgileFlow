#!/usr/bin/env node

/**
 * agileflow-welcome.js - Beautiful SessionStart welcome display
 *
 * Shows a transparent ASCII table with:
 * - Project info (name, version, branch, commit)
 * - Story stats (WIP, blocked, completed)
 * - Archival status
 * - Session cleanup status
 * - Last commit
 */

const fs = require('fs');
const path = require('path');
const { executeCommandSync, git, spawnBackground } = require('../lib/process-executor');

// Shared utilities
const { c, box } = require('../lib/colors');
const {
  getProjectRoot,
  getStatusPath,
  getMetadataPath,
  getSessionStatePath,
  getAgileflowDir,
  getClaudeDir,
} = require('../lib/paths');
const { readJSONCached, readFileCached } = require('../lib/file-cache');

// Session manager path (relative to script location)
const SESSION_MANAGER_PATH = path.join(__dirname, 'session-manager.js');

// PERFORMANCE OPTIMIZATION: Lazy-loaded session-manager module
// Importing directly avoids ~50-150ms subprocess overhead per call.
let _sessionManager;
function getSessionManager() {
  if (_sessionManager === undefined) {
    try {
      _sessionManager = require('./session-manager.js');
    } catch (e) {
      _sessionManager = null;
    }
  }
  return _sessionManager;
}

// Hook metrics module (kept at top level - needed early for timer)
let hookMetrics;
try {
  hookMetrics = require('./lib/hook-metrics.js');
} catch (e) {
  // Hook metrics not available
}

/**
 * PERFORMANCE OPTIMIZATION: Load all project files using LRU cache
 * Uses file-cache module for automatic caching with 15s TTL.
 * Files are cached across script invocations within TTL window.
 * Estimated savings: 60-120ms on cache hits
 *
 * Additional optimizations in this file (US-0356):
 * - Git batching: 3 subprocess calls → 1 (~20-40ms savings)
 * - Session-manager inline: subprocess → direct require() (~50-150ms savings)
 * - Tmux cache: subprocess → session-state lookup (~10-20ms after first run)
 * Total estimated savings: ~130-260ms
 */
function loadProjectFiles(rootDir) {
  const paths = {
    status: getStatusPath(rootDir),
    metadata: getMetadataPath(rootDir),
    settings: path.join(getClaudeDir(rootDir), 'settings.json'),
    sessionState: getSessionStatePath(rootDir),
    configYaml: path.join(getAgileflowDir(rootDir), 'config.yaml'),
    cliPackage: path.join(rootDir, 'packages', 'cli', 'package.json'),
  };

  return {
    status: readJSONCached(paths.status),
    metadata: readJSONCached(paths.metadata),
    settings: readJSONCached(paths.settings),
    sessionState: readJSONCached(paths.sessionState),
    configYaml: readFileCached(paths.configYaml),
    cliPackage: readJSONCached(paths.cliPackage),
  };
}

/**
 * Detect the user's platform for install guidance
 */
function detectPlatform() {
  const platform = process.platform;

  if (platform === 'darwin') {
    return { os: 'macOS', installCmd: 'brew install tmux', hasSudo: true };
  }

  if (platform === 'linux') {
    // Try to detect Linux distribution
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      if (
        osRelease.includes('Ubuntu') ||
        osRelease.includes('Debian') ||
        osRelease.includes('Pop!_OS') ||
        osRelease.includes('Mint')
      ) {
        return { os: 'Ubuntu/Debian', installCmd: 'sudo apt install tmux', hasSudo: true };
      }
      if (
        osRelease.includes('Fedora') ||
        osRelease.includes('Red Hat') ||
        osRelease.includes('CentOS') ||
        osRelease.includes('Rocky')
      ) {
        return { os: 'Fedora/RHEL', installCmd: 'sudo dnf install tmux', hasSudo: true };
      }
      if (osRelease.includes('Arch')) {
        return { os: 'Arch', installCmd: 'sudo pacman -S tmux', hasSudo: true };
      }
    } catch (e) {
      // Can't read /etc/os-release
    }
    return { os: 'Linux', installCmd: 'sudo apt install tmux', hasSudo: true };
  }

  // Windows WSL or unknown
  return { os: 'Unknown', installCmd: null, hasSudo: false };
}

/**
 * Check if tmux is installed
 * PERFORMANCE OPTIMIZATION: Caches result in session-state.json (~10-20ms savings on subsequent runs)
 * Returns object with availability info and platform-specific install suggestion
 */
function checkTmuxAvailability(cache) {
  // Check session state cache first (tmux availability doesn't change within a session)
  if (cache?.sessionState?.tmux_available !== undefined) {
    if (cache.sessionState.tmux_available) return { available: true };
    return { available: false, platform: detectPlatform(), noSudoCmd: 'conda install -c conda-forge tmux' };
  }

  // Actually check (first run or no cache)
  const result = executeCommandSync('which', ['tmux'], { fallback: null });
  const available = result.data !== null;

  // Cache in session state for next invocation
  try {
    const rootDir = getProjectRoot();
    const sessionStatePath = getSessionStatePath(rootDir);
    if (fs.existsSync(sessionStatePath)) {
      const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      state.tmux_available = available;
      fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    }
  } catch (e) {
    // Cache write failed, non-critical
  }

  if (available) return { available: true };
  return { available: false, platform: detectPlatform(), noSudoCmd: 'conda install -c conda-forge tmux' };
}

/**
 * PERFORMANCE OPTIMIZATION: Batch git commands into single call
 * Uses `git log -1 --format=%D%n%h%n%s` to get branch, short hash, and subject
 * in a single subprocess instead of 3 separate calls.
 * Savings: ~20-40ms (eliminates 2 subprocess spawns)
 */
function getGitInfo(rootDir) {
  const opts = { cwd: rootDir, timeout: 5000, fallback: '' };
  const result = git(['log', '-1', '--format=%D%n%h%n%s'], opts);
  if (result.data) {
    const lines = result.data.split('\n');
    // %D gives decorations like "HEAD -> main, origin/main, tag: v3.0.0"
    const branchMatch = (lines[0] || '').match(/HEAD -> ([^,\s]+)/);
    return {
      branch: branchMatch ? branchMatch[1] : 'detached',
      commit: (lines[1] || 'unknown').trim(),
      lastCommit: lines.slice(2).join('\n').trim(),
    };
  }
  return { branch: 'unknown', commit: 'unknown', lastCommit: '' };
}

function getProjectInfo(rootDir, cache = null) {
  const info = {
    name: 'agileflow',
    version: 'unknown',
    branch: 'unknown',
    commit: 'unknown',
    lastCommit: '',
    wipCount: 0,
    blockedCount: 0,
    completedCount: 0,
    readyCount: 0,
    totalStories: 0,
    currentStory: null,
  };

  // Get AgileFlow version (check multiple sources in priority order)
  // 1. .agileflow/config.yaml (installed user projects - primary source)
  // 2. AgileFlow metadata (installed user projects - legacy)
  // 3. packages/cli/package.json (AgileFlow dev project)
  try {
    // Primary: .agileflow/config.yaml (use cache if available)
    if (cache?.configYaml) {
      const versionMatch = cache.configYaml.match(/^version:\s*['"]?([0-9.]+)/m);
      if (versionMatch) {
        info.version = versionMatch[1];
      }
    } else if (cache?.metadata?.version) {
      // Fallback: metadata from cache
      info.version = cache.metadata.version;
    } else if (cache?.cliPackage?.version) {
      // Dev project: from cache
      info.version = cache.cliPackage.version;
    } else {
      // No cache - fall back to file reads (for backwards compatibility)
      const configPath = path.join(getAgileflowDir(rootDir), 'config.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const versionMatch = content.match(/^version:\s*['"]?([0-9.]+)/m);
        if (versionMatch) {
          info.version = versionMatch[1];
        }
      } else {
        const metadataPath = getMetadataPath(rootDir);
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          info.version = metadata.version || info.version;
        } else {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(rootDir, 'packages/cli/package.json'), 'utf8')
          );
          info.version = pkg.version || info.version;
        }
      }
    }
  } catch (e) {
    // Silently fail - version will remain 'unknown'
  }

  // Get git info (batched into single command for performance)
  const gitInfo = getGitInfo(rootDir);
  info.branch = gitInfo.branch;
  info.commit = gitInfo.commit;
  info.lastCommit = gitInfo.lastCommit;

  // Get status info (use cache if available)
  try {
    const status = cache?.status;
    if (status?.stories) {
      for (const [id, story] of Object.entries(status.stories)) {
        info.totalStories++;
        if (story.status === 'in_progress') {
          info.wipCount++;
          if (!info.currentStory) {
            info.currentStory = { id, title: story.title };
          }
        } else if (story.status === 'blocked') {
          info.blockedCount++;
        } else if (story.status === 'completed') {
          info.completedCount++;
        } else if (story.status === 'ready') {
          info.readyCount++;
        }
      }
    } else if (!cache) {
      // No cache - fall back to file read
      const statusPath = getStatusPath(rootDir);
      if (fs.existsSync(statusPath)) {
        const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        if (statusData.stories) {
          for (const [id, story] of Object.entries(statusData.stories)) {
            info.totalStories++;
            if (story.status === 'in_progress') {
              info.wipCount++;
              if (!info.currentStory) {
                info.currentStory = { id, title: story.title };
              }
            } else if (story.status === 'blocked') {
              info.blockedCount++;
            } else if (story.status === 'completed') {
              info.completedCount++;
            } else if (story.status === 'ready') {
              info.readyCount++;
            }
          }
        }
      }
    }
  } catch (e) {}

  return info;
}

function runArchival(rootDir, cache = null) {
  const result = { ran: false, threshold: 7, archived: 0, remaining: 0 };

  try {
    // Use cached metadata if available
    const metadata = cache?.metadata;
    if (metadata) {
      if (metadata.archival?.enabled === false) {
        result.disabled = true;
        return result;
      }
      result.threshold = metadata.archival?.threshold_days || 7;
    } else {
      // No cache - fall back to file read
      const metadataPath = getMetadataPath(rootDir);
      if (fs.existsSync(metadataPath)) {
        const metadataData = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadataData.archival?.enabled === false) {
          result.disabled = true;
          return result;
        }
        result.threshold = metadataData.archival?.threshold_days || 7;
      }
    }

    // Use cached status if available
    const status = cache?.status;
    if (!status && !cache) {
      const statusPath = getStatusPath(rootDir);
      if (!fs.existsSync(statusPath)) return result;
    }

    const stories = (status || {}).stories || {};

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - result.threshold);

    let toArchiveCount = 0;
    for (const [id, story] of Object.entries(stories)) {
      if (story.status === 'completed' && story.completed_at) {
        if (new Date(story.completed_at) < cutoffDate) {
          toArchiveCount++;
        }
      }
    }

    result.ran = true;
    result.remaining = Object.keys(stories).length;

    if (toArchiveCount > 0) {
      // Run archival
      const archiveResult = executeCommandSync('bash', ['scripts/archive-completed-stories.sh'], {
        cwd: rootDir,
      });
      if (archiveResult.ok) {
        result.archived = toArchiveCount;
        result.remaining -= toArchiveCount;
      }
    }
  } catch (e) {}

  return result;
}

function clearActiveCommands(rootDir, cache = null) {
  const result = { ran: false, cleared: 0, commandNames: [], preserved: false };

  try {
    const sessionStatePath = getSessionStatePath(rootDir);

    // Use cached sessionState if available, but we still need to read fresh for clearing
    // because we need to write back. Cache is only useful to check if file exists.
    let state;
    if (cache?.sessionState) {
      state = cache.sessionState;
      result.ran = true;
    } else {
      if (!fs.existsSync(sessionStatePath)) return result;
      state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      result.ran = true;
    }

    // Check if PreCompact just ran (within last 30 seconds)
    // If so, preserve active_commands instead of clearing them (post-compact session start)
    if (state.last_precompact_at) {
      const precompactTime = new Date(state.last_precompact_at).getTime();
      const now = Date.now();
      const secondsSincePrecompact = (now - precompactTime) / 1000;

      if (secondsSincePrecompact < 600) {
        // 10 minutes - compacts can take a while with background tasks
        // This is a post-compact session start - preserve active commands
        result.preserved = true;
        // Capture command names for display (but don't clear)
        if (state.active_commands && state.active_commands.length > 0) {
          for (const cmd of state.active_commands) {
            if (cmd.name) result.commandNames.push(cmd.name);
          }
        }
        // Clear the precompact timestamp so next true session start will clear
        delete state.last_precompact_at;
        fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
        return result;
      }
      // Precompact was too long ago - clear as normal
      delete state.last_precompact_at;
    }

    // Handle new array format (active_commands)
    if (state.active_commands && state.active_commands.length > 0) {
      result.cleared = state.active_commands.length;
      // Capture command names before clearing
      for (const cmd of state.active_commands) {
        if (cmd.name) result.commandNames.push(cmd.name);
      }
      state.active_commands = [];
    }

    // Handle legacy singular format (active_command) - only capture if not already in array
    if (state.active_command !== undefined) {
      const legacyName = state.active_command.name;
      // Only add to count/names if not already captured from array (avoid duplicates)
      if (legacyName && !result.commandNames.includes(legacyName)) {
        result.cleared++;
        result.commandNames.push(legacyName);
      }
      delete state.active_command;
    }

    if (result.cleared > 0) {
      fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    }
  } catch (e) {}

  return result;
}

function checkParallelSessions(rootDir) {
  const result = {
    available: false,
    registered: false,
    otherActive: 0,
    currentId: null,
    cleaned: 0,
    cleanedSessions: [], // Detailed info about cleaned sessions
    // Extended session info for non-main sessions
    isMain: true,
    nickname: null,
    branch: null,
    sessionPath: null,
    mainPath: rootDir,
  };

  try {
    // PERFORMANCE OPTIMIZATION: Import session-manager directly instead of subprocess
    // Saves ~50-150ms by avoiding Node subprocess spawn overhead
    const sm = getSessionManager();
    if (sm && sm.fullStatus) {
      result.available = true;
      const data = sm.fullStatus();
      result.registered = data.registered;
      result.currentId = data.id;
      result.otherActive = data.otherActive || 0;
      result.cleaned = data.cleaned || 0;
      result.cleanedSessions = data.cleanedSessions || [];

      if (data.current) {
        result.isMain = data.current.is_main === true;
        result.nickname = data.current.nickname;
        result.branch = data.current.branch;
        result.sessionPath = data.current.path;
      }
      return result;
    }

    // Fallback: check if session manager script exists for subprocess call
    const managerPath = path.join(getAgileflowDir(rootDir), 'scripts', 'session-manager.js');
    if (!fs.existsSync(managerPath) && !fs.existsSync(SESSION_MANAGER_PATH)) {
      return result;
    }

    result.available = true;
    const scriptPath = fs.existsSync(managerPath) ? managerPath : SESSION_MANAGER_PATH;

    const fullStatusResult = executeCommandSync('node', [scriptPath, 'full-status'], {
      cwd: rootDir,
      fallback: null,
    });

    if (fullStatusResult.data) {
      try {
        const data = JSON.parse(fullStatusResult.data);
        result.registered = data.registered;
        result.currentId = data.id;
        result.otherActive = data.otherActive || 0;
        result.cleaned = data.cleaned || 0;
        result.cleanedSessions = data.cleanedSessions || [];

        if (data.current) {
          result.isMain = data.current.is_main === true;
          result.nickname = data.current.nickname;
          result.branch = data.current.branch;
          result.sessionPath = data.current.path;
        }
      } catch (e) {}
    }
  } catch (e) {
    // Session system not available
  }

  return result;
}

function checkPreCompact(rootDir, cache = null) {
  const result = { configured: false, scriptExists: false, version: null, outdated: false };

  try {
    // Check if PreCompact hook is configured in settings (use cache if available)
    const settings = cache?.settings;
    if (settings) {
      if (settings.hooks?.PreCompact?.length > 0) {
        result.configured = true;
      }
    } else {
      // No cache - fall back to file read
      const settingsPath = path.join(getClaudeDir(rootDir), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settingsData.hooks?.PreCompact?.length > 0) {
          result.configured = true;
        }
      }
    }

    // Check if the script exists (must always check filesystem)
    const scriptPath = path.join(rootDir, 'scripts', 'precompact-context.sh');
    if (fs.existsSync(scriptPath)) {
      result.scriptExists = true;
    }

    // Check configured version from metadata (use cache if available)
    const metadata = cache?.metadata;
    if (metadata) {
      if (metadata.features?.precompact?.configured_version) {
        result.version = metadata.features.precompact.configured_version;
        // PreCompact v2.40.0+ has multi-command support
        result.outdated = compareVersions(result.version, '2.40.0') < 0;
      } else if (result.configured) {
        // Hook exists but no version tracked = definitely outdated
        result.outdated = true;
        result.version = 'unknown';
      }
    } else if (!cache) {
      // No cache - fall back to file read
      const metadataPath = getMetadataPath(rootDir);
      if (fs.existsSync(metadataPath)) {
        const metadataData = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadataData.features?.precompact?.configured_version) {
          result.version = metadataData.features.precompact.configured_version;
          result.outdated = compareVersions(result.version, '2.40.0') < 0;
        } else if (result.configured) {
          result.outdated = true;
          result.version = 'unknown';
        }
      }
    }
  } catch (e) {}

  return result;
}

function checkDamageControl(rootDir, cache = null) {
  const result = { configured: false, level: 'standard', patternCount: 0, scriptsOk: true };

  try {
    // Check if PreToolUse hooks are configured in settings (use cache if available)
    let settings = cache?.settings;
    if (!settings && !cache) {
      // No cache - fall back to file read
      const settingsPath = path.join(getClaudeDir(rootDir), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    }

    if (settings) {
      if (settings.hooks?.PreToolUse && Array.isArray(settings.hooks.PreToolUse)) {
        // Check for damage-control hooks
        const hasDamageControlHooks = settings.hooks.PreToolUse.some(h =>
          h.hooks?.some(hk => hk.command?.includes('damage-control'))
        );
        if (hasDamageControlHooks) {
          result.configured = true;

          // Count how many hooks are present (should be 3: Bash, Edit, Write)
          const dcHooks = settings.hooks.PreToolUse.filter(h =>
            h.hooks?.some(hk => hk.command?.includes('damage-control'))
          );
          result.hooksCount = dcHooks.length;

          // Check for enhanced mode (has prompt hook)
          const hasPromptHook = settings.hooks.PreToolUse.some(h =>
            h.hooks?.some(hk => hk.type === 'prompt')
          );
          if (hasPromptHook) {
            result.level = 'enhanced';
          }

          // Check if all required scripts exist (in .claude/hooks/damage-control/)
          const hooksDir = path.join(getClaudeDir(rootDir), 'hooks', 'damage-control');
          const requiredScripts = [
            'bash-tool-damage-control.js',
            'edit-tool-damage-control.js',
            'write-tool-damage-control.js',
          ];
          for (const script of requiredScripts) {
            if (!fs.existsSync(path.join(hooksDir, script))) {
              result.scriptsOk = false;
              break;
            }
          }
        }
      }
    }

    // Count patterns in patterns.yaml
    const patternsLocations = [
      path.join(getClaudeDir(rootDir), 'hooks', 'damage-control', 'patterns.yaml'),
      path.join(getAgileflowDir(rootDir), 'scripts', 'damage-control', 'patterns.yaml'),
    ];
    for (const patternsPath of patternsLocations) {
      if (fs.existsSync(patternsPath)) {
        const content = fs.readFileSync(patternsPath, 'utf8');
        // Count pattern entries (lines starting with "  - pattern:")
        const patternMatches = content.match(/^\s*-\s*pattern:/gm);
        result.patternCount = patternMatches ? patternMatches.length : 0;
        break;
      }
    }
  } catch (e) {}

  return result;
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

/**
 * All available config options with their version requirements
 * These are the options that can be configured through /agileflow:configure
 */
const ALL_CONFIG_OPTIONS = {
  claudeMdReinforcement: {
    since: '2.92.0',
    description: 'Add /babysit rules to CLAUDE.md',
    autoApplyable: true,
  },
  sessionStartHook: {
    since: '2.35.0',
    description: 'Welcome display on session start',
    autoApplyable: false,
  },
  precompactHook: {
    since: '2.40.0',
    description: 'Context preservation during /compact',
    autoApplyable: false,
  },
  damageControlHooks: {
    since: '2.50.0',
    description: 'Block destructive commands',
    autoApplyable: false,
  },
  statusLine: { since: '2.35.0', description: 'Custom status bar display', autoApplyable: false },
  autoArchival: {
    since: '2.35.0',
    description: 'Auto-archive completed stories',
    autoApplyable: false,
  },
  autoUpdate: {
    since: '2.70.0',
    description: 'Auto-update on session start',
    autoApplyable: false,
  },
  ralphLoop: { since: '2.60.0', description: 'Autonomous story processing', autoApplyable: false },
  tmuxAutoSpawn: {
    since: '2.92.0',
    description: 'Auto-start Claude in tmux session',
    autoApplyable: true,
  },
};

/**
 * Check for new config options that haven't been presented to the user
 * Returns info about outdated config and whether to auto-apply (for "full" profile)
 */
function checkConfigStaleness(rootDir, currentVersion, cache = null) {
  const result = {
    outdated: false,
    newOptionsCount: 0,
    newOptions: [],
    configSchemaVersion: null,
    activeProfile: null,
    autoApply: false,
  };

  try {
    const metadata = cache?.metadata;
    if (!metadata) return result;

    result.configSchemaVersion = metadata.config_schema_version || null;
    result.activeProfile = metadata.active_profile || null;

    const configOptions = metadata.agileflow?.config_options || {};

    // If no config_schema_version, this is an old installation - all options are "new"
    if (!result.configSchemaVersion) {
      // For old installations, detect which features are actually configured via settings.json
      const settings = cache?.settings || {};
      const hooks = settings.hooks || {};

      // Check each option against actual configuration
      for (const [name, optionInfo] of Object.entries(ALL_CONFIG_OPTIONS)) {
        const isConfigured = isOptionActuallyConfigured(name, hooks, settings);
        if (!isConfigured) {
          result.outdated = true;
          result.newOptionsCount++;
          result.newOptions.push({
            name,
            description: optionInfo.description,
            autoApplyable: optionInfo.autoApplyable,
          });
        }
      }
    } else {
      // Check for unconfigured options in metadata
      for (const [name, option] of Object.entries(configOptions)) {
        if (option.configured === false) {
          const optionInfo = ALL_CONFIG_OPTIONS[name] || {
            description: name,
            autoApplyable: false,
          };
          result.outdated = true;
          result.newOptionsCount++;
          result.newOptions.push({
            name,
            description: optionInfo.description,
            autoApplyable: optionInfo.autoApplyable,
          });
        }
      }

      // Check for options that might not be in metadata yet (added after their install)
      for (const [name, optionInfo] of Object.entries(ALL_CONFIG_OPTIONS)) {
        if (!configOptions[name]) {
          // Option doesn't exist in metadata - check if it was added after their config_schema_version
          if (compareVersions(result.configSchemaVersion, optionInfo.since) < 0) {
            const alreadyAdded = result.newOptions.some(o => o.name === name);
            if (!alreadyAdded) {
              result.outdated = true;
              result.newOptionsCount++;
              result.newOptions.push({
                name,
                description: optionInfo.description,
                autoApplyable: optionInfo.autoApplyable,
              });
            }
          }
        }
      }
    }

    // If profile is "full", auto-apply features that support it
    if (result.outdated && result.activeProfile === 'full') {
      const autoApplyableOptions = result.newOptions.filter(o => o.autoApplyable);
      if (autoApplyableOptions.length > 0) {
        result.autoApply = true;
        // Only auto-apply the auto-applyable ones
        result.autoApplyOptions = autoApplyableOptions;
      }
    }
  } catch (e) {
    // Silently fail - config check is non-critical
  }

  return result;
}

/**
 * Check if a config option is actually configured in settings
 */
function isOptionActuallyConfigured(optionName, hooks, settings) {
  switch (optionName) {
    case 'sessionStartHook':
      return hooks.SessionStart && hooks.SessionStart.length > 0;
    case 'precompactHook':
      return hooks.PreCompact && hooks.PreCompact.length > 0;
    case 'damageControlHooks':
      return (
        hooks.PreToolUse &&
        hooks.PreToolUse.some(h => h.hooks?.some(hk => hk.command?.includes('damage-control')))
      );
    case 'statusLine':
      return settings.statusLine && settings.statusLine.command;
    case 'autoArchival':
      // Archival is tied to SessionStart hook running archive script
      return (
        hooks.SessionStart &&
        hooks.SessionStart.some(h => h.hooks?.some(hk => hk.command?.includes('archive')))
      );
    case 'autoUpdate':
      // Would need to check metadata for autoUpdate setting
      return false; // Default to not configured
    case 'ralphLoop':
      return (
        hooks.Stop && hooks.Stop.some(h => h.hooks?.some(hk => hk.command?.includes('ralph-loop')))
      );
    case 'claudeMdReinforcement':
      // Check if CLAUDE.md has the marker - can't easily check from here
      return false; // Let welcome script handle this
    case 'tmuxAutoSpawn':
      // Check metadata for tmuxAutoSpawn setting (default is enabled)
      return false; // Let welcome script handle this via metadata
    default:
      return false;
  }
}

/**
 * Auto-apply new config options for "full" profile
 * Returns true if any options were applied
 */
function autoApplyConfigOptions(rootDir, newOptions) {
  let applied = 0;

  for (const option of newOptions) {
    try {
      if (option.name === 'claudeMdReinforcement') {
        // Apply CLAUDE.md reinforcement
        const claudeMdPath = path.join(rootDir, 'CLAUDE.md');
        const marker = '<!-- AGILEFLOW_BABYSIT_RULES -->';
        const content = `

${marker}
## AgileFlow /babysit Context Preservation Rules

When \`/agileflow:babysit\` is active (check session-state.json), these rules are MANDATORY:

1. **ALWAYS end responses with the AskUserQuestion tool** - Not text like "What next?" but the ACTUAL TOOL CALL
2. **Use Plan Mode for non-trivial tasks** - Call \`EnterPlanMode\` before complex implementations
3. **Delegate complex work to domain experts** - Use \`Task\` tool with appropriate \`subagent_type\`
4. **Track progress with TaskCreate/TaskUpdate** - For any task with 3+ steps

These rules persist across conversation compaction. Check \`docs/09-agents/session-state.json\` for active commands.
${marker}
`;

        let existingContent = '';
        if (fs.existsSync(claudeMdPath)) {
          existingContent = fs.readFileSync(claudeMdPath, 'utf8');
        }

        if (!existingContent.includes(marker)) {
          fs.appendFileSync(claudeMdPath, content);
          applied++;
        }
      } else if (option.name === 'tmuxAutoSpawn') {
        // Auto-enable tmux auto-spawn via metadata
        const metadataPath = getMetadataPath(rootDir);
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          if (!metadata.features) metadata.features = {};
          if (
            !metadata.features.tmuxAutoSpawn ||
            metadata.features.tmuxAutoSpawn.enabled === undefined
          ) {
            metadata.features.tmuxAutoSpawn = {
              enabled: true,
              version: metadata.version || '2.92.0',
              at: new Date().toISOString(),
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
            applied++;
          }
        }
      }
      // Add more option handlers here as new options are added
    } catch (e) {
      // Silently fail individual options
    }
  }

  // Update metadata to mark options as configured
  if (applied > 0) {
    try {
      const metadataPath = getMetadataPath(rootDir);
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // Get current CLI version for updating config_schema_version
        let currentVersion = '2.92.0';
        try {
          const pkgPath = path.join(__dirname, '..', 'package.json');
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            currentVersion = pkg.version;
          }
        } catch (e) {}

        // Update config_schema_version
        metadata.config_schema_version = currentVersion;

        // Mark applied options as configured
        if (!metadata.agileflow) metadata.agileflow = {};
        if (!metadata.agileflow.config_options) metadata.agileflow.config_options = {};

        for (const option of newOptions) {
          metadata.agileflow.config_options[option.name] = {
            ...metadata.agileflow.config_options[option.name],
            configured: true,
            enabled: true,
            configured_at: new Date().toISOString(),
          };
        }

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
      }
    } catch (e) {
      // Silently fail metadata update
    }
  }

  return applied;
}

// Check for updates (async but we'll use sync approach for welcome)
async function checkUpdates() {
  const result = {
    available: false,
    installed: null,
    latest: null,
    justUpdated: false,
    previousVersion: null,
    autoUpdate: false,
    changelog: [],
  };

  let updateChecker;
  try {
    updateChecker = require('./check-update.js');
  } catch (e) {}
  if (!updateChecker) return result;

  try {
    const updateInfo = await updateChecker.checkForUpdates();
    result.installed = updateInfo.installed;
    result.latest = updateInfo.latest;
    result.available = updateInfo.updateAvailable;
    result.justUpdated = updateInfo.justUpdated;
    result.previousVersion = updateInfo.previousVersion;
    result.autoUpdate = updateInfo.autoUpdate;

    // If just updated, try to get changelog entries
    if (result.justUpdated && result.installed) {
      result.changelog = getChangelogEntries(result.installed);
    }
  } catch (e) {
    // Silently fail - update check is non-critical
  }

  return result;
}

// Parse CHANGELOG.md for entries of a specific version
function getChangelogEntries(version) {
  const entries = [];

  try {
    // Look for CHANGELOG.md in .agileflow or package location
    const possiblePaths = [
      path.join(__dirname, '..', 'CHANGELOG.md'),
      path.join(__dirname, 'CHANGELOG.md'),
    ];

    let changelogContent = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        changelogContent = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    if (!changelogContent) return entries;

    // Find the section for this version
    const versionPattern = new RegExp(`## \\[${version}\\].*?\\n([\\s\\S]*?)(?=## \\[|$)`);
    const match = changelogContent.match(versionPattern);

    if (match) {
      // Extract bullet points from Added/Changed/Fixed sections
      const lines = match[1].split('\n');
      for (const line of lines) {
        const bulletMatch = line.match(/^- (.+)$/);
        if (bulletMatch && entries.length < 3) {
          entries.push(bulletMatch[1]);
        }
      }
    }
  } catch (e) {
    // Silently fail
  }

  return entries;
}

// Run auto-update if enabled (quiet mode - minimal output)
// DEPRECATED: Use spawnAutoUpdateInBackground() instead for non-blocking updates
async function runAutoUpdate(rootDir, fromVersion, toVersion) {
  const runUpdate = () => {
    return executeCommandSync('npx', ['agileflow@latest', 'update', '--force'], {
      cwd: rootDir,
      timeout: 120000,
    });
  };

  console.log(
    `${c.skyBlue}Updating AgileFlow${c.reset} ${c.dim}v${fromVersion} → v${toVersion}${c.reset}`
  );
  const result = runUpdate();
  if (result.ok) {
    console.log(`${c.mintGreen}✓ Update complete${c.reset}`);
    return true;
  }

  // Check if this is a stale npm cache issue (ETARGET = version not found)
  if (result.error && (result.error.includes('ETARGET') || result.error.includes('notarget'))) {
    console.log(`${c.dim}  Clearing npm cache and retrying...${c.reset}`);
    executeCommandSync('npm', ['cache', 'clean', '--force'], { timeout: 30000 });
    const retryResult = runUpdate();
    if (retryResult.ok) {
      console.log(`${c.mintGreen}✓ Update complete${c.reset}`);
      return true;
    }
    console.log(`${c.peach}Auto-update failed after cache clean${c.reset}`);
    console.log(`${c.dim}  Run manually: npx agileflow update${c.reset}`);
    return false;
  }
  console.log(`${c.peach}Auto-update failed${c.reset}`);
  console.log(`${c.dim}  Run manually: npx agileflow update${c.reset}`);
  return false;
}

/**
 * Spawn auto-update in a detached background process
 * This allows the welcome hook to return immediately while the update runs
 *
 * @param {string} rootDir - Project root directory
 * @param {string} fromVersion - Current version
 * @param {string} toVersion - Target version
 */
function spawnAutoUpdateInBackground(rootDir, fromVersion, toVersion) {
  // Track pending update in session-state.json
  try {
    const sessionStatePath = getSessionStatePath(rootDir);
    let state = {};
    if (fs.existsSync(sessionStatePath)) {
      state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    }
    state.pending_update = {
      from: fromVersion,
      to: toVersion,
      started_at: new Date().toISOString(),
    };
    fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    // Silently continue - tracking is optional
  }

  // Create detached subprocess that survives parent exit
  spawnBackground('npx', ['agileflow@latest', 'update', '--force'], { cwd: rootDir });

  console.log(`${c.dim}  Auto-update starting in background...${c.reset}`);
}

/**
 * PERFORMANCE OPTIMIZATION: Fast expertise count (directory scan only)
 * Just counts expert directories without reading/validating each expertise.yaml.
 * Saves ~50-150ms by avoiding 29 file reads.
 * Full validation is available via /agileflow:validate-expertise command.
 */
function getExpertiseCountFast(rootDir) {
  const result = { total: 0, passed: 0, warnings: 0, failed: 0, issues: [], validated: false };

  // Find experts directory
  let expertsDir = path.join(getAgileflowDir(rootDir), 'experts');
  if (!fs.existsSync(expertsDir)) {
    expertsDir = path.join(rootDir, 'packages', 'cli', 'src', 'core', 'experts');
  }
  if (!fs.existsSync(expertsDir)) {
    return result;
  }

  try {
    const domains = fs
      .readdirSync(expertsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'templates');

    result.total = domains.length;

    // Quick check: just verify expertise.yaml exists in each directory
    // Full validation (staleness, required fields) deferred to separate command
    for (const domain of domains) {
      const filePath = path.join(expertsDir, domain.name, 'expertise.yaml');
      if (!fs.existsSync(filePath)) {
        result.failed++;
        result.issues.push(`${domain.name}: missing file`);
      } else {
        // Spot-check first few files for staleness (sample 3 max for speed)
        if (result.passed < 3) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lastUpdatedMatch = content.match(/^last_updated:\s*['"]?(\d{4}-\d{2}-\d{2})/m);
            if (lastUpdatedMatch) {
              const lastDate = new Date(lastUpdatedMatch[1]);
              const daysSince = Math.floor(
                (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysSince > 30) {
                result.warnings++;
                result.issues.push(`${domain.name}: stale (${daysSince}d)`);
              } else {
                result.passed++;
              }
            } else {
              result.passed++;
            }
          } catch (e) {
            result.passed++;
          }
        } else {
          // Assume rest are ok for fast display
          result.passed++;
        }
      }
    }
  } catch (e) {
    // Silently fail
  }

  return result;
}

// Full validation function (kept for /agileflow:validate-expertise command)
function validateExpertise(rootDir) {
  const result = { total: 0, passed: 0, warnings: 0, failed: 0, issues: [] };

  // Find experts directory
  let expertsDir = path.join(getAgileflowDir(rootDir), 'experts');
  if (!fs.existsSync(expertsDir)) {
    expertsDir = path.join(rootDir, 'packages', 'cli', 'src', 'core', 'experts');
  }
  if (!fs.existsSync(expertsDir)) {
    return result; // No experts directory found
  }

  const STALE_DAYS = 30;
  const MAX_LINES = 200;

  try {
    const domains = fs
      .readdirSync(expertsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'templates')
      .map(d => d.name);

    for (const domain of domains) {
      const filePath = path.join(expertsDir, domain, 'expertise.yaml');
      if (!fs.existsSync(filePath)) {
        result.total++;
        result.failed++;
        result.issues.push(`${domain}: missing file`);
        continue;
      }

      result.total++;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      let status = 'pass';
      let issue = '';

      // Check required fields (use multiline flag)
      const hasVersion = /^version:/m.test(content);
      const hasDomain = /^domain:/m.test(content);
      const hasLastUpdated = /^last_updated:/m.test(content);

      if (!hasVersion || !hasDomain || !hasLastUpdated) {
        status = 'fail';
        issue = 'missing required fields';
      }

      // Check staleness
      const lastUpdatedMatch = content.match(/^last_updated:\s*['"]?(\d{4}-\d{2}-\d{2})/m);
      if (lastUpdatedMatch && status !== 'fail') {
        const lastDate = new Date(lastUpdatedMatch[1]);
        const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > STALE_DAYS) {
          status = 'warn';
          issue = `stale (${daysSince}d)`;
        }
      }

      // Check file size
      if (lines.length > MAX_LINES && status === 'pass') {
        status = 'warn';
        issue = `large (${lines.length} lines)`;
      }

      if (status === 'pass') {
        result.passed++;
      } else if (status === 'warn') {
        result.warnings++;
        result.issues.push(`${domain}: ${issue}`);
      } else {
        result.failed++;
        result.issues.push(`${domain}: ${issue}`);
      }
    }
  } catch (e) {
    // Silently fail
  }

  return result;
}

function getFeatureVersions(rootDir) {
  const result = {
    hooks: { version: null, outdated: false },
    archival: { version: null, outdated: false },
    statusline: { version: null, outdated: false },
    precompact: { version: null, outdated: false },
  };

  // Minimum compatible versions for each feature
  const minVersions = {
    hooks: '2.35.0',
    archival: '2.35.0',
    statusline: '2.35.0',
    precompact: '2.40.0', // Multi-command support
  };

  try {
    const metadataPath = getMetadataPath(rootDir);
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

      for (const feature of Object.keys(result)) {
        if (metadata.features?.[feature]?.configured_version) {
          result[feature].version = metadata.features[feature].configured_version;
          result[feature].outdated =
            compareVersions(result[feature].version, minVersions[feature]) < 0;
        }
      }
    }
  } catch (e) {}

  return result;
}

function pad(str, len, align = 'left') {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = len - stripped.length;
  if (diff <= 0) return str;
  if (align === 'right') return ' '.repeat(diff) + str;
  if (align === 'center')
    return ' '.repeat(Math.floor(diff / 2)) + str + ' '.repeat(Math.ceil(diff / 2));
  return str + ' '.repeat(diff);
}

// Truncate string to max length, respecting ANSI codes
function truncate(str, maxLen, suffix = '..') {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (stripped.length <= maxLen) return str;

  // Find position in original string that corresponds to maxLen - suffix.length visible chars
  const targetLen = maxLen - suffix.length;
  let visibleCount = 0;
  let cutIndex = 0;
  let inEscape = false;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\x1b') {
      inEscape = true;
    } else if (inEscape && str[i] === 'm') {
      inEscape = false;
    } else if (!inEscape) {
      visibleCount++;
      if (visibleCount >= targetLen) {
        cutIndex = i + 1;
        break;
      }
    }
  }

  return str.substring(0, cutIndex) + suffix;
}

function formatTable(
  info,
  archival,
  session,
  precompact,
  parallelSessions,
  updateInfo = {},
  expertise = {},
  damageControl = {},
  agentTeamsInfo = {},
  scaleDetection = {}
) {
  const W = 58; // inner width (total table = W + 2 = 60)
  const R = W - 25; // right column width (33 chars) to match total of 60
  const lines = [];

  // Helper to create a row (auto-truncates right content to fit)
  const row = (left, right, leftColor = '', rightColor = '') => {
    const leftStr = `${leftColor}${left}${leftColor ? c.reset : ''}`;
    const rightTrunc = truncate(right, R);
    const rightStr = `${rightColor}${rightTrunc}${rightColor ? c.reset : ''}`;
    return `${c.dim}${box.v}${c.reset} ${pad(leftStr, 20)} ${c.dim}${box.v}${c.reset} ${pad(rightStr, R)} ${c.dim}${box.v}${c.reset}`;
  };

  // Helper for full-width row (spans both columns)
  // Content width = W - 2 (for the two spaces after │ and before │)
  const fullRow = (content, color = '') => {
    const contentStr = `${color}${content}${color ? c.reset : ''}`;
    return `${c.dim}${box.v}${c.reset} ${pad(contentStr, W - 2)} ${c.dim}${box.v}${c.reset}`;
  };

  // Two-column dividers: ├ + 22 dashes + ┼ + 35 dashes + ┤ = 60 total
  const divider = () =>
    `${c.dim}${box.lT}${box.h.repeat(22)}${box.cross}${box.h.repeat(W - 23)}${box.rT}${c.reset}`;
  // Full-width divider: ├ + 58 dashes + ┤ = 60 total
  const fullDivider = () => `${c.dim}${box.lT}${box.h.repeat(W)}${box.rT}${c.reset}`;
  // Transition: full-width TO two-column
  const splitDivider = () =>
    `${c.dim}${box.lT}${box.h.repeat(22)}${box.tT}${box.h.repeat(W - 23)}${box.rT}${c.reset}`;
  // Transition: two-column TO full-width
  const mergeDivider = () =>
    `${c.dim}${box.lT}${box.h.repeat(22)}${box.bT}${box.h.repeat(W - 23)}${box.rT}${c.reset}`;
  // Borders
  const topBorder = `${c.dim}${box.tl}${box.h.repeat(W)}${box.tr}${c.reset}`;
  const bottomBorder = `${c.dim}${box.bl}${box.h.repeat(22)}${box.bT}${box.h.repeat(W - 23)}${box.br}${c.reset}`;

  // Header with version and optional update indicator
  // Use vibrant colors for branch
  const branchColor =
    info.branch === 'main' ? c.mintGreen : info.branch.startsWith('fix') ? c.coral : c.skyBlue;

  // Build version string with update status (vibrant colors)
  let versionStr = `v${info.version}`;
  if (updateInfo.justUpdated && updateInfo.previousVersion) {
    versionStr = `v${info.version} ${c.mintGreen}✓${c.reset}${c.slate} (was v${updateInfo.previousVersion})`;
  } else if (updateInfo.available && updateInfo.latest) {
    versionStr = `v${info.version} ${c.amber}↑${updateInfo.latest}${c.reset}`;
  }

  // Calculate remaining space for branch
  const versionVisibleLen = updateInfo.justUpdated
    ? info.version.length + 20 + (updateInfo.previousVersion?.length || 0)
    : updateInfo.available
      ? info.version.length + 3 + (updateInfo.latest?.length || 0)
      : info.version.length;
  const maxBranchLen = W - 1 - 15 - versionVisibleLen;
  const branchDisplay =
    info.branch.length > maxBranchLen
      ? info.branch.substring(0, Math.max(5, maxBranchLen - 2)) + '..'
      : info.branch;

  const header = `${c.brand}${c.bold}agileflow${c.reset} ${c.dim}${versionStr}${c.reset}  ${branchColor}${branchDisplay}${c.reset} ${c.dim}(${info.commit})${c.reset}`;
  const headerLine = `${c.dim}${box.v}${c.reset} ${pad(header, W - 2)} ${c.dim}${box.v}${c.reset}`;

  lines.push(topBorder);
  lines.push(headerLine);

  // Show update available notification (using vibrant colors)
  if (updateInfo.available && updateInfo.latest && !updateInfo.justUpdated) {
    lines.push(fullDivider());
    lines.push(
      fullRow(
        `${c.amber}↑${c.reset} Update available: ${c.softGold}v${updateInfo.latest}${c.reset}`,
        ''
      )
    );
    lines.push(fullRow(`  Run: ${c.skyBlue}npx agileflow update${c.reset}`, ''));
  }

  // Always show "What's new" section with current version changelog
  // Get changelog entries for current version (even if not just updated)
  const changelogEntries =
    updateInfo.changelog && updateInfo.changelog.length > 0
      ? updateInfo.changelog
      : getChangelogEntries(info.version);

  if (changelogEntries && changelogEntries.length > 0) {
    lines.push(fullDivider());
    const headerText = updateInfo.justUpdated
      ? `${c.mintGreen}✨${c.reset} Just updated to ${c.softGold}v${info.version}${c.reset}:`
      : `${c.teal}📋${c.reset} What's new in ${c.softGold}v${info.version}${c.reset}:`;
    lines.push(fullRow(headerText, ''));
    for (const entry of changelogEntries.slice(0, 2)) {
      lines.push(fullRow(`  ${c.teal}•${c.reset} ${truncate(entry, W - 6)}`, ''));
    }
    lines.push(fullRow(`  Run ${c.skyBlue}/agileflow:whats-new${c.reset} for full changelog`, ''));
  }

  // Transition from full-width sections to two-column stories section
  lines.push(splitDivider());

  // Stories section (always colorful labels like obtain-context)
  lines.push(
    row(
      'In Progress',
      info.wipCount > 0 ? `${info.wipCount}` : '0',
      c.peach,
      info.wipCount > 0 ? c.peach : c.dim
    )
  );
  lines.push(
    row(
      'Blocked',
      info.blockedCount > 0 ? `${info.blockedCount}` : '0',
      c.coral,
      info.blockedCount > 0 ? c.coral : c.dim
    )
  );
  lines.push(
    row(
      'Ready',
      info.readyCount > 0 ? `${info.readyCount}` : '0',
      c.skyBlue,
      info.readyCount > 0 ? c.skyBlue : c.dim
    )
  );
  const completedColor = `${c.bold}${c.mintGreen}`;
  lines.push(
    row(
      'Completed',
      info.completedCount > 0 ? `${info.completedCount}` : '0',
      completedColor,
      info.completedCount > 0 ? completedColor : c.dim
    )
  );

  lines.push(divider());

  // System section (colorful labels like obtain-context)
  if (archival.disabled) {
    lines.push(row('Auto-archival', 'disabled', c.lavender, c.slate));
  } else if (archival.skippedByScale) {
    lines.push(row('Auto-archival', 'skipped (small project)', c.lavender, c.dim));
  } else {
    const archivalStatus =
      archival.archived > 0 ? `archived ${archival.archived} stories` : `nothing to archive`;
    lines.push(
      row('Auto-archival', archivalStatus, c.lavender, archival.archived > 0 ? c.mintGreen : c.dim)
    );
  }

  // Session cleanup
  let sessionStatus, sessionColor;
  if (session.preserved) {
    sessionStatus = `preserved ${session.commandNames.length} command(s)`;
    sessionColor = c.mintGreen;
  } else if (session.cleared > 0) {
    sessionStatus = `cleared ${session.cleared} command(s)`;
    sessionColor = c.mintGreen;
  } else {
    sessionStatus = `clean`;
    sessionColor = c.dim;
  }
  lines.push(row('Session state', sessionStatus, c.lavender, sessionColor));

  // PreCompact status with version check
  if (precompact.configured && precompact.scriptExists) {
    if (precompact.outdated) {
      const verStr = precompact.version ? ` (v${precompact.version})` : '';
      lines.push(row('Context preserve', `outdated${verStr}`, c.peach, c.peach));
    } else if (session.commandNames && session.commandNames.length > 0) {
      // Show the preserved command names
      const cmdDisplay = session.commandNames.map(n => `/agileflow:${n}`).join(', ');
      lines.push(row('Context preserve', cmdDisplay, c.lavender, c.mintGreen));
    } else {
      lines.push(row('Context preserve', 'ready', c.lavender, c.dim));
    }
  } else if (precompact.configured) {
    lines.push(row('Context preserve', 'script missing', c.peach, c.peach));
  } else {
    lines.push(row('Context preserve', 'not configured', c.slate, c.slate));
  }

  // Parallel sessions status
  if (parallelSessions && parallelSessions.available) {
    if (parallelSessions.otherActive > 0) {
      const sessionStr = `⚠️ ${parallelSessions.otherActive} other active`;
      lines.push(row('Sessions', sessionStr, c.peach, c.peach));
    } else {
      const sessionStr = parallelSessions.currentId
        ? `✓ Session ${parallelSessions.currentId} (only)`
        : '✓ Only session';
      lines.push(row('Sessions', sessionStr, c.lavender, c.mintGreen));
    }
  }

  // Agent expertise validation (always show with color)
  if (expertise && expertise.total > 0) {
    if (expertise.failed > 0) {
      const expertStr = `❌ ${expertise.failed} failed, ${expertise.warnings} warnings`;
      lines.push(row('Expertise', expertStr, c.coral, c.coral));
    } else if (expertise.warnings > 0) {
      const expertStr = `⚠️ ${expertise.warnings} warnings (${expertise.passed} ok)`;
      lines.push(row('Expertise', expertStr, c.peach, c.peach));
    } else {
      lines.push(row('Expertise', `✓ ${expertise.total} valid`, c.lavender, c.mintGreen));
    }
  }

  // Damage control status (PreToolUse hooks for dangerous command protection)
  if (damageControl && damageControl.configured) {
    if (!damageControl.scriptsOk) {
      lines.push(row('Damage control', '⚠️ scripts missing', c.coral, c.coral));
    } else {
      const levelStr = damageControl.level || 'standard';
      const patternStr =
        damageControl.patternCount > 0 ? `${damageControl.patternCount} patterns` : '';
      const dcStatus = `🛡️ ${levelStr}${patternStr ? ` (${patternStr})` : ''}`;
      lines.push(row('Damage control', dcStatus, c.lavender, c.mintGreen));
    }
  } else {
    lines.push(row('Damage control', 'not configured', c.slate, c.slate));
  }

  // Agent Teams status
  if (agentTeamsInfo && agentTeamsInfo.status === 'enabled') {
    lines.push(row('Agent Teams', `${agentTeamsInfo.value}`, c.lavender, c.mintGreen));
  } else if (agentTeamsInfo && agentTeamsInfo.status === 'fallback') {
    lines.push(row('Agent Teams', `${agentTeamsInfo.value}`, c.lavender, c.dim));
  }

  // Scale detection (EP-0033)
  if (scaleDetection && scaleDetection.scale) {
    const scaleColors = {
      micro: c.cyan,
      small: c.teal,
      medium: c.mintGreen,
      large: c.peach,
      enterprise: c.coral,
    };
    const scaleIcons = {
      micro: '◦',
      small: '○',
      medium: '◎',
      large: '●',
      enterprise: '◉',
    };
    const scale = scaleDetection.scale;
    const icon = scaleIcons[scale] || '◎';
    const label = scale.charAt(0).toUpperCase() + scale.slice(1);
    const cacheNote = scaleDetection.fromCache ? '' : ` (${scaleDetection.detection_ms}ms)`;
    lines.push(
      row('Scale', `${icon} ${label}${cacheNote}`, c.lavender, scaleColors[scale] || c.dim)
    );
  }

  lines.push(divider());

  // Current story (colorful like obtain-context)
  if (info.currentStory) {
    lines.push(
      row(
        'Current',
        `${c.lightYellow}${info.currentStory.id}${c.reset}: ${info.currentStory.title}`,
        c.skyBlue,
        ''
      )
    );
  } else {
    lines.push(row('Current', 'No active story', c.skyBlue, c.dim));
  }

  // Last commit (colorful like obtain-context)
  lines.push(
    row('Last commit', `${c.peach}${info.commit}${c.reset} ${info.lastCommit}`, c.lavender, '')
  );

  lines.push(bottomBorder);

  return lines.join('\n');
}

// Format session banner for non-main sessions
function formatSessionBanner(parallelSessions) {
  if (!parallelSessions.available || parallelSessions.isMain) {
    return null;
  }

  const W = 62; // banner width
  const lines = [];

  // Get display name
  const sessionName = parallelSessions.nickname
    ? `SESSION ${parallelSessions.currentId} "${parallelSessions.nickname}"`
    : `SESSION ${parallelSessions.currentId}`;

  lines.push(`${c.dim}${box.tl}${box.h.repeat(W)}${box.tr}${c.reset}`);
  lines.push(
    `${c.dim}${box.v}${c.reset} ${c.teal}${c.bold}${pad(sessionName, W - 2)}${c.reset} ${c.dim}${box.v}${c.reset}`
  );
  lines.push(
    `${c.dim}${box.v}${c.reset}    ${c.slate}Branch:${c.reset} ${pad(parallelSessions.branch || 'unknown', W - 13)} ${c.dim}${box.v}${c.reset}`
  );

  // Show relative path to main
  if (parallelSessions.sessionPath) {
    const relPath = path.relative(parallelSessions.sessionPath, parallelSessions.mainPath) || '.';
    lines.push(
      `${c.dim}${box.v}${c.reset}    ${c.slate}Main at:${c.reset} ${pad(relPath, W - 14)} ${c.dim}${box.v}${c.reset}`
    );
  }

  lines.push(`${c.dim}${box.bl}${box.h.repeat(W)}${box.br}${c.reset}`);

  return lines.join('\n');
}

// Main
async function main() {
  // Start hook timer for metrics
  const timer = hookMetrics ? hookMetrics.startHookTimer('SessionStart', 'welcome') : null;

  const rootDir = getProjectRoot();

  // PERFORMANCE: Load all project files once into cache
  // This eliminates 6-8 duplicate file reads across functions
  const cache = loadProjectFiles(rootDir);

  // ============================================
  // PHASE 1: INSTANT WELCOME (< 300ms)
  // All fast operations - no network, no auto-update
  // ============================================
  const info = getProjectInfo(rootDir, cache);

  // Smart hook scheduling: skip archival for micro/small projects (EP-0033)
  // Scale detection is done early to inform hook scheduling
  let earlyScale = null;
  try {
    const scaleDetector = require('./lib/scale-detector');
    // Check cache only (fast path, no full detection yet)
    earlyScale = scaleDetector.detectScale({
      rootDir,
      statusJson: cache?.status,
      sessionState: cache?.sessionState,
    });
  } catch (e) {
    // Scale detection not available
  }

  const scaleRecommendations = earlyScale
    ? (() => {
        try {
          return require('./lib/scale-detector').getScaleRecommendations(earlyScale.scale);
        } catch {
          return null;
        }
      })()
    : null;

  const archival =
    scaleRecommendations && scaleRecommendations.skipArchival
      ? { ran: false, threshold: 0, archived: 0, remaining: 0, skippedByScale: true }
      : runArchival(rootDir, cache);
  const session = clearActiveCommands(rootDir, cache);
  const precompact = checkPreCompact(rootDir, cache);
  const parallelSessions = checkParallelSessions(rootDir);
  // PERFORMANCE: Use fast expertise count (directory scan only, ~3 file samples)
  // Full validation available via /agileflow:validate-expertise
  const expertise = getExpertiseCountFast(rootDir);
  const damageControl = checkDamageControl(rootDir, cache);

  // Use early scale detection result (already computed for hook scheduling)
  const scaleDetection = earlyScale || { scale: 'medium' };

  // Agent Teams feature flag detection
  let featureFlags;
  try {
    featureFlags = require('../lib/feature-flags');
  } catch (e) {}
  let agentTeamsInfo = {};
  if (featureFlags) {
    try {
      agentTeamsInfo = featureFlags.getAgentTeamsDisplayInfo({
        rootDir,
        metadata: cache?.metadata,
      });
    } catch (e) {
      // Silently fail - Agent Teams info is non-critical
    }
  }

  // Check if a previous background update completed successfully
  // This allows us to show "just updated" even for background updates
  let updateInfo = {};
  try {
    const sessionStatePath = getSessionStatePath(rootDir);
    if (fs.existsSync(sessionStatePath)) {
      const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));

      // Check if pending update from previous session completed
      if (state.pending_update) {
        const pendingUpdate = state.pending_update;
        const startedAt = new Date(pendingUpdate.started_at);
        const minutesAgo = (Date.now() - startedAt.getTime()) / (1000 * 60);

        // If current version matches target, update succeeded
        if (info.version === pendingUpdate.to) {
          updateInfo.justUpdated = true;
          updateInfo.previousVersion = pendingUpdate.from;
          updateInfo.changelog = getChangelogEntries(info.version);
          // Clear pending update
          delete state.pending_update;
          fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
        } else if (minutesAgo > 5) {
          // Update timed out (5 minutes) - clear it
          delete state.pending_update;
          fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
        }
        // If still pending and < 5 minutes, leave it (update may still be running)
      }
    }
  } catch (e) {
    // Silently continue - pending update check is non-critical
  }

  // Check for new config options
  let configStaleness = { outdated: false, autoApply: false };
  let configAutoApplied = 0;
  try {
    configStaleness = checkConfigStaleness(rootDir, info.version, cache);

    // Auto-apply new options if profile is "full" (only auto-applyable ones)
    if (configStaleness.autoApply && configStaleness.autoApplyOptions?.length > 0) {
      configAutoApplied = autoApplyConfigOptions(rootDir, configStaleness.autoApplyOptions);
      if (configAutoApplied > 0) {
        // Remove auto-applied options from the list, keep non-auto-applyable ones
        configStaleness.newOptions = configStaleness.newOptions.filter(o => !o.autoApplyable);
        configStaleness.newOptionsCount = configStaleness.newOptions.length;
        if (configStaleness.newOptionsCount === 0) {
          configStaleness.outdated = false;
        }
      }
    }
  } catch (e) {
    // Config check failed - continue without it
  }

  // Check tmux availability (only if tmuxAutoSpawn is enabled)
  let tmuxCheck = { available: true };
  const tmuxAutoSpawnEnabled = cache?.metadata?.features?.tmuxAutoSpawn?.enabled !== false;
  if (tmuxAutoSpawnEnabled) {
    tmuxCheck = checkTmuxAvailability(cache);
  }

  // Show session banner FIRST if in a non-main session
  const sessionBanner = formatSessionBanner(parallelSessions);
  if (sessionBanner) {
    console.log(sessionBanner);
  }

  console.log(
    formatTable(
      info,
      archival,
      session,
      precompact,
      parallelSessions,
      updateInfo,
      expertise,
      damageControl,
      agentTeamsInfo,
      scaleDetection
    )
  );

  // ============================================
  // PHASE 2: BACKGROUND UPDATE CHECK (after table displays)
  // This runs async and shows notification AFTER the table
  // ============================================
  try {
    // Only check for updates if we didn't already detect a "just updated" from previous session
    if (!updateInfo.justUpdated) {
      const freshUpdateInfo = await checkUpdates();

      // If update is available, show notification AFTER the table
      if (freshUpdateInfo.available && freshUpdateInfo.latest) {
        console.log('');
        console.log(
          `${c.amber}↑ Update available:${c.reset} v${info.version} → ${c.softGold}v${freshUpdateInfo.latest}${c.reset}`
        );
        console.log(`  Run: ${c.skyBlue}npx agileflow update${c.reset}`);

        // If auto-update is enabled, spawn it in background (non-blocking)
        if (freshUpdateInfo.autoUpdate) {
          spawnAutoUpdateInBackground(rootDir, info.version, freshUpdateInfo.latest);
        }
      }

      // Mark current version as seen to track for next update
      let updateChecker;
      try {
        updateChecker = require('./check-update.js');
      } catch (e) {}
      if (freshUpdateInfo.justUpdated && updateChecker) {
        updateChecker.markVersionSeen(info.version);
      }
    } else {
      // Mark current version as seen (for "just updated" case)
      let updateChecker;
      try {
        updateChecker = require('./check-update.js');
      } catch (e) {}
      if (updateChecker) {
        updateChecker.markVersionSeen(info.version);
      }
    }
  } catch (e) {
    // Update check failed - continue without it (non-critical)
  }

  // Show config auto-apply confirmation (for "full" profile)
  if (configAutoApplied > 0) {
    console.log('');
    console.log(
      `${c.mintGreen}✨ Auto-applied ${configAutoApplied} new config option(s)${c.reset}`
    );
    console.log(`   ${c.slate}Profile "full" enables all new features automatically.${c.reset}`);
  }

  // Show config staleness notification (for custom profiles)
  if (configStaleness.outdated && configStaleness.newOptionsCount > 0) {
    console.log('');
    console.log(
      `${c.amber}⚙️  ${configStaleness.newOptionsCount} new configuration option(s) available${c.reset}`
    );
    for (const opt of configStaleness.newOptions.slice(0, 3)) {
      console.log(`   ${c.dim}• ${opt.description}${c.reset}`);
    }
    console.log(
      `   ${c.slate}Run ${c.skyBlue}/agileflow:configure${c.reset}${c.slate} to enable them.${c.reset}`
    );
  }

  // Show tmux installation notice if tmux auto-spawn is enabled but tmux not installed
  if (tmuxAutoSpawnEnabled && !tmuxCheck.available) {
    console.log('');
    console.log(
      `${c.amber}📦 tmux not installed${c.reset} ${c.dim}(enables parallel sessions in one terminal)${c.reset}`
    );

    // Show platform-specific install command
    if (tmuxCheck.platform?.installCmd) {
      console.log(`   ${c.slate}Install for ${tmuxCheck.platform.os}:${c.reset}`);
      console.log(`   ${c.cyan}${tmuxCheck.platform.installCmd}${c.reset}`);
      console.log('');
      console.log(`   ${c.dim}No sudo? Use: ${c.cyan}${tmuxCheck.noSudoCmd}${c.reset}`);
    } else {
      // Unknown platform - show all options
      console.log(`   ${c.slate}Install with one of:${c.reset}`);
      console.log(`   ${c.dim}• macOS:${c.reset}  ${c.cyan}brew install tmux${c.reset}`);
      console.log(`   ${c.dim}• Ubuntu:${c.reset} ${c.cyan}sudo apt install tmux${c.reset}`);
      console.log(`   ${c.dim}• No sudo:${c.reset} ${c.cyan}${tmuxCheck.noSudoCmd}${c.reset}`);
    }
    console.log(
      `   ${c.dim}Or disable this notice: ${c.skyBlue}/agileflow:configure --disable=tmuxautospawn${c.reset}`
    );
  }

  // Show warning and tip if other sessions are active (vibrant colors)
  if (parallelSessions.otherActive > 0) {
    console.log('');
    console.log(`${c.amber}⚠️  Other Claude session(s) active in this repo.${c.reset}`);
    console.log(
      `${c.slate}   Run ${c.skyBlue}/agileflow:session:status${c.reset}${c.slate} to see all sessions.${c.reset}`
    );
    console.log(
      `${c.slate}   Run ${c.skyBlue}/agileflow:session:new${c.reset}${c.slate} to create isolated workspace.${c.reset}`
    );
  }

  // Show detailed message if sessions were cleaned (VISIBLE - not hidden!)
  if (parallelSessions.cleaned > 0 && parallelSessions.cleanedSessions) {
    console.log('');
    console.log(`${c.amber}📋 Cleaned ${parallelSessions.cleaned} inactive session(s):${c.reset}`);
    parallelSessions.cleanedSessions.forEach(sess => {
      const name = sess.nickname ? `${sess.id} "${sess.nickname}"` : `Session ${sess.id}`;
      const reason = sess.reason === 'pid_dead' ? 'process ended' : sess.reason;
      console.log(`   ${c.dim}└─ ${name} (${reason}, PID ${sess.pid})${c.reset}`);
    });
    console.log(
      `   ${c.slate}Sessions are cleaned when their Claude Code process is no longer running.${c.reset}`
    );
  }

  // === SESSION HEALTH WARNINGS ===
  // Check for forgotten sessions with uncommitted changes, stale sessions, orphaned entries
  // PERFORMANCE OPTIMIZATION: Direct function call instead of subprocess (~50-100ms savings)
  try {
    const sm = getSessionManager();
    const health = sm ? sm.getSessionsHealth({ staleDays: 7 }) : null;

    if (health) {
      const hasIssues =
        health.uncommitted.length > 0 ||
        health.stale.length > 0 ||
        health.orphanedRegistry.length > 0;

      if (hasIssues) {
        console.log('');

        // Uncommitted changes - MOST IMPORTANT (potential data loss)
        if (health.uncommitted.length > 0) {
          console.log(
            `${c.coral}⚠️  ${health.uncommitted.length} session(s) have uncommitted changes:${c.reset}`
          );
          health.uncommitted.slice(0, 3).forEach(sess => {
            const name = sess.nickname ? `"${sess.nickname}"` : `Session ${sess.id}`;
            console.log(`${c.dim}   └─ ${name}: ${sess.changeCount} file(s)${c.reset}`);
          });
          if (health.uncommitted.length > 3) {
            console.log(`${c.dim}   └─ ... and ${health.uncommitted.length - 3} more${c.reset}`);
          }
          console.log(
            `${c.slate}   Run: ${c.skyBlue}/agileflow:session:status${c.slate} to see details${c.reset}`
          );
        }

        // Stale sessions (inactive 7+ days)
        if (health.stale.length > 0) {
          console.log(
            `${c.amber}📅 ${health.stale.length} session(s) inactive for 7+ days${c.reset}`
          );
        }

        // Orphaned registry entries (path doesn't exist)
        if (health.orphanedRegistry.length > 0) {
          console.log(
            `${c.peach}🗑️  ${health.orphanedRegistry.length} session(s) have missing directories${c.reset}`
          );
        }
      }
    }
  } catch (e) {
    // Health check failed, skip silently
  }

  // === DUPLICATE CLAUDE PROCESS DETECTION ===
  // Check for multiple Claude processes in the same working directory
  let processCleanup;
  try {
    processCleanup = require('./lib/process-cleanup.js');
  } catch (e) {}
  if (processCleanup) {
    try {
      // Auto-kill is explicitly opt-in at runtime.
      // Even if metadata has autoKill=true from older configs, we require
      // AGILEFLOW_PROCESS_CLEANUP_AUTOKILL=1 to prevent accidental session kills.
      const metadata = cache?.metadata;
      const autoKillConfigured = metadata?.features?.processCleanup?.autoKill === true;
      const autoKill = autoKillConfigured && process.env.AGILEFLOW_PROCESS_CLEANUP_AUTOKILL === '1';

      const cleanupResult = processCleanup.cleanupDuplicateProcesses({
        rootDir,
        autoKill,
        dryRun: false,
      });

      if (cleanupResult.duplicates > 0) {
        console.log('');

        if (cleanupResult.killed.length > 0) {
          // Auto-kill was enabled and processes were terminated
          console.log(
            `${c.mintGreen}🔧 Cleaned ${cleanupResult.killed.length} duplicate Claude process(es)${c.reset}`
          );
          cleanupResult.killed.forEach(proc => {
            console.log(`${c.dim}   └─ PID ${proc.pid} (${proc.method})${c.reset}`);
          });
        } else {
          // Warn only (auto-kill disabled or skipped by safety guards)
          console.log(
            `${c.amber}⚠️  ${cleanupResult.duplicates} other Claude process(es) in same directory${c.reset}`
          );
          console.log(`${c.slate}   This may cause slowdowns and freezing. Options:${c.reset}`);
          console.log(`${c.slate}   • Close duplicate Claude windows/tabs${c.reset}`);
          if (autoKillConfigured) {
            console.log(
              `${c.slate}   • Auto-kill configured but runtime opt-in is off (safer default)${c.reset}`
            );
          }
        }

        if (cleanupResult.errors.length > 0) {
          cleanupResult.errors.forEach(err => {
            console.log(`${c.coral}   ⚠ Failed to kill PID ${err.pid}: ${err.error}${c.reset}`);
          });
        }
      }
    } catch (e) {
      // Silently ignore process cleanup errors
    }
  }

  // Story claiming: cleanup stale claims and show warnings
  let storyClaiming;
  try {
    storyClaiming = require('./lib/story-claiming.js');
  } catch (e) {}
  if (storyClaiming) {
    try {
      // Clean up stale claims (dead PIDs, expired TTL)
      const cleanupResult = storyClaiming.cleanupStaleClaims({ rootDir });
      if (cleanupResult.ok && cleanupResult.cleaned > 0) {
        console.log('');
        console.log(`${c.dim}Cleaned ${cleanupResult.cleaned} stale story claim(s)${c.reset}`);
      }

      // Show stories claimed by other sessions
      const othersResult = storyClaiming.getStoriesClaimedByOthers({ rootDir });
      if (othersResult.ok && othersResult.stories && othersResult.stories.length > 0) {
        console.log('');
        console.log(storyClaiming.formatClaimedStories(othersResult.stories));
        console.log('');
        console.log(
          `${c.slate}   These stories are locked - pick a different one to avoid conflicts.${c.reset}`
        );
      }
    } catch (e) {
      // Silently ignore story claiming errors
    }
  }

  // File tracking: cleanup stale touches and show overlap warnings
  let fileTracking;
  try {
    fileTracking = require('./lib/file-tracking.js');
  } catch (e) {}
  if (fileTracking) {
    try {
      // Clean up stale file touches (dead PIDs, expired TTL)
      const cleanupResult = fileTracking.cleanupStaleTouches({ rootDir });
      if (cleanupResult.ok && cleanupResult.cleaned > 0) {
        console.log('');
        console.log(
          `${c.dim}Cleaned ${cleanupResult.cleaned} stale file tracking session(s)${c.reset}`
        );
      }

      // Show file overlaps with other sessions
      const overlapsResult = fileTracking.getMyFileOverlaps({ rootDir });
      if (overlapsResult.ok && overlapsResult.overlaps && overlapsResult.overlaps.length > 0) {
        console.log('');
        console.log(fileTracking.formatFileOverlaps(overlapsResult.overlaps));
      }
    } catch (e) {
      // Silently ignore file tracking errors
    }
  }

  // Epic completion check: auto-complete epics where all stories are done
  let storyStateMachine;
  try {
    storyStateMachine = require('./lib/story-state-machine.js');
  } catch (e) {}
  if (storyStateMachine && cache.status) {
    try {
      const statusPath = getStatusPath(rootDir);
      const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const incompleteEpics = storyStateMachine.findIncompleteEpics(statusData);

      if (incompleteEpics.length > 0) {
        let autoCompleted = 0;
        for (const { epicId, completed, total } of incompleteEpics) {
          const result = storyStateMachine.autoCompleteEpic(statusData, epicId);
          if (result.updated) {
            autoCompleted++;
            console.log('');
            console.log(
              `${c.mintGreen}✅ Auto-completed ${c.bold}${epicId}${c.reset}${c.mintGreen} (${completed}/${total} stories done)${c.reset}`
            );
          }
        }
        if (autoCompleted > 0) {
          fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2) + '\n');
        }
      }
    } catch (e) {
      // Silently ignore epic completion errors
    }
  }

  // Ideation sync: mark ideas as implemented when linked epics complete
  let syncIdeationStatus;
  try {
    syncIdeationStatus = require('./lib/sync-ideation-status.js');
  } catch (e) {}
  if (syncIdeationStatus) {
    try {
      const syncResult = syncIdeationStatus.syncImplementedIdeas(rootDir);
      if (syncResult.ok && syncResult.updated > 0) {
        console.log('');
        console.log(`${c.dim}📊 Synced ${syncResult.updated} idea(s) as implemented${c.reset}`);
      }
    } catch (e) {
      // Silently ignore ideation sync errors
    }
  }

  // === SCHEDULED AUTOMATIONS ===
  // Check for and run due automations (non-blocking)
  let automationRegistry, automationRunner;
  try {
    automationRegistry = require('./lib/automation-registry.js');
    automationRunner = require('./lib/automation-runner.js');
  } catch (e) {
    // Automation system not available
  }
  if (automationRegistry && automationRunner) {
    try {
      const registry = automationRegistry.getAutomationRegistry({ rootDir });
      const runner = automationRunner.getAutomationRunner({ rootDir });
      const dueStatus = runner.getDueStatus();

      if (dueStatus.due > 0) {
        console.log('');
        console.log(`${c.teal}🤖 ${dueStatus.due} automation(s) due to run${c.reset}`);

        // Show what's due
        for (const auto of dueStatus.dueAutomations.slice(0, 3)) {
          console.log(`${c.dim}   └─ ${auto.name}${c.reset}`);
        }
        if (dueStatus.due > 3) {
          console.log(`${c.dim}   └─ ... and ${dueStatus.due - 3} more${c.reset}`);
        }

        // Run due automations in background (spawn detached process)
        // This prevents blocking the welcome hook
        const runnerScriptPath = path.join(__dirname, 'automation-run-due.js');

        // Only spawn if the runner script exists
        if (fs.existsSync(runnerScriptPath)) {
          spawnBackground('node', [runnerScriptPath], { cwd: rootDir });
          console.log(`${c.dim}   Running in background...${c.reset}`);
        } else {
          console.log(`${c.slate}   Run: ${c.skyBlue}/agileflow:automate ACTION=run-due${c.reset}`);
        }
      }
    } catch (e) {
      // Silently ignore automation errors
    }
  }

  // Record hook metrics
  if (timer && hookMetrics) {
    hookMetrics.recordHookMetrics(timer, 'success', null, { rootDir });
  }
}

main().catch(err => {
  console.error(err);
  // Record error in metrics if possible
  if (hookMetrics) {
    try {
      const rootDir = getProjectRoot();
      const timer = hookMetrics.startHookTimer('SessionStart', 'welcome');
      hookMetrics.recordHookMetrics(timer, 'error', err.message, { rootDir });
    } catch (e) {
      // Silently ignore metrics errors
    }
  }
});
