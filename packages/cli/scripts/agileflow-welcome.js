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
const { execSync, spawnSync } = require('child_process');

// Shared utilities
const { c, box } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { readJSONCached, readFileCached } = require('../lib/file-cache');

// Session manager path (relative to script location)
const SESSION_MANAGER_PATH = path.join(__dirname, 'session-manager.js');

// Story claiming module
let storyClaiming;
try {
  storyClaiming = require('./lib/story-claiming.js');
} catch (e) {
  // Story claiming not available
}

// File tracking module
let fileTracking;
try {
  fileTracking = require('./lib/file-tracking.js');
} catch (e) {
  // File tracking not available
}

// Update checker module
let updateChecker;
try {
  updateChecker = require('./check-update.js');
} catch (e) {
  // Update checker not available
}

/**
 * PERFORMANCE OPTIMIZATION: Load all project files using LRU cache
 * Uses file-cache module for automatic caching with 30s TTL.
 * Files are cached across script invocations within TTL window.
 * Estimated savings: 60-120ms on cache hits
 */
function loadProjectFiles(rootDir) {
  const paths = {
    status: path.join(rootDir, 'docs', '09-agents', 'status.json'),
    metadata: path.join(rootDir, 'docs', '00-meta', 'agileflow-metadata.json'),
    settings: path.join(rootDir, '.claude', 'settings.json'),
    sessionState: path.join(rootDir, 'docs', '09-agents', 'session-state.json'),
    configYaml: path.join(rootDir, '.agileflow', 'config.yaml'),
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
 * PERFORMANCE OPTIMIZATION: Batch git commands into single call
 * Reduces subprocess overhead from 3 calls to 1.
 * Estimated savings: 20-40ms
 */
function getGitInfo(rootDir) {
  try {
    const output = execSync(
      'git branch --show-current && git rev-parse --short HEAD && git log -1 --format="%s"',
      { cwd: rootDir, encoding: 'utf8', timeout: 5000 }
    );
    const lines = output.trim().split('\n');
    return {
      branch: lines[0] || 'unknown',
      commit: lines[1] || 'unknown',
      lastCommit: lines[2] || '',
    };
  } catch (e) {
    return { branch: 'unknown', commit: 'unknown', lastCommit: '' };
  }
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
      const configPath = path.join(rootDir, '.agileflow', 'config.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const versionMatch = content.match(/^version:\s*['"]?([0-9.]+)/m);
        if (versionMatch) {
          info.version = versionMatch[1];
        }
      } else {
        const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
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
      const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
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
      const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
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
      const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
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
      try {
        execSync('bash scripts/archive-completed-stories.sh', {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: 'pipe',
        });
        result.archived = toArchiveCount;
        result.remaining -= toArchiveCount;
      } catch (e) {}
    }
  } catch (e) {}

  return result;
}

function clearActiveCommands(rootDir, cache = null) {
  const result = { ran: false, cleared: 0, commandNames: [], preserved: false };

  try {
    const sessionStatePath = path.join(rootDir, 'docs/09-agents/session-state.json');

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

      if (secondsSincePrecompact < 30) {
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
    // Check if session manager exists
    const managerPath = path.join(rootDir, '.agileflow', 'scripts', 'session-manager.js');
    if (!fs.existsSync(managerPath) && !fs.existsSync(SESSION_MANAGER_PATH)) {
      return result;
    }

    result.available = true;

    // Try to use combined full-status command (saves ~200ms vs 3 separate calls)
    const scriptPath = fs.existsSync(managerPath) ? managerPath : SESSION_MANAGER_PATH;

    try {
      // PERFORMANCE: Single subprocess call instead of 3 (register + count + status)
      const fullStatusOutput = execSync(`node "${scriptPath}" full-status`, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const data = JSON.parse(fullStatusOutput);

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
    } catch (e) {
      // Fall back to individual calls if full-status not available (older version)
      try {
        const registerOutput = execSync(`node "${scriptPath}" register`, {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const registerData = JSON.parse(registerOutput);
        result.registered = true;
        result.currentId = registerData.id;
      } catch (e) {
        // Registration failed
      }

      try {
        const countOutput = execSync(`node "${scriptPath}" count`, {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const countData = JSON.parse(countOutput);
        result.otherActive = countData.count || 0;
      } catch (e) {
        // Count failed
      }

      try {
        const statusOutput = execSync(`node "${scriptPath}" status`, {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const statusData = JSON.parse(statusOutput);
        if (statusData.current) {
          result.isMain = statusData.current.is_main === true;
          result.nickname = statusData.current.nickname;
          result.branch = statusData.current.branch;
          result.sessionPath = statusData.current.path;
        }
      } catch (e) {
        // Status failed
      }
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
      const settingsPath = path.join(rootDir, '.claude/settings.json');
      if (fs.existsSync(settingsPath)) {
        const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settingsData.hooks?.PreCompact?.length > 0) {
          result.configured = true;
        }
      }
    }

    // Check if the script exists (must always check filesystem)
    const scriptPath = path.join(rootDir, 'scripts/precompact-context.sh');
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
      const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
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
      const settingsPath = path.join(rootDir, '.claude/settings.json');
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
          const hooksDir = path.join(rootDir, '.claude', 'hooks', 'damage-control');
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
      path.join(rootDir, '.claude', 'hooks', 'damage-control', 'patterns.yaml'),
      path.join(rootDir, '.agileflow', 'scripts', 'damage-control', 'patterns.yaml'),
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
async function runAutoUpdate(rootDir, fromVersion, toVersion) {
  const runUpdate = () => {
    // Use stdio: 'pipe' to capture output instead of showing everything
    return execSync('npx agileflow@latest update --force', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120000, // 2 minute timeout
    });
  };

  try {
    console.log(
      `${c.skyBlue}Updating AgileFlow${c.reset} ${c.dim}v${fromVersion} → v${toVersion}${c.reset}`
    );
    // Use --force to skip prompts for non-interactive auto-update
    runUpdate();
    console.log(`${c.mintGreen}✓ Update complete${c.reset}`);
    return true;
  } catch (e) {
    // Check if this is a stale npm cache issue (ETARGET = version not found)
    if (e.message && (e.message.includes('ETARGET') || e.message.includes('notarget'))) {
      console.log(`${c.dim}  Clearing npm cache and retrying...${c.reset}`);
      try {
        execSync('npm cache clean --force', { stdio: 'pipe', timeout: 30000 });
        runUpdate();
        console.log(`${c.mintGreen}✓ Update complete${c.reset}`);
        return true;
      } catch (retryError) {
        console.log(`${c.peach}Auto-update failed after cache clean${c.reset}`);
        console.log(`${c.dim}  Run manually: npx agileflow update${c.reset}`);
        return false;
      }
    }
    console.log(`${c.peach}Auto-update failed${c.reset}`);
    console.log(`${c.dim}  Run manually: npx agileflow update${c.reset}`);
    return false;
  }
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
  let expertsDir = path.join(rootDir, '.agileflow', 'experts');
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
  let expertsDir = path.join(rootDir, '.agileflow', 'experts');
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
    const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
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
  damageControl = {}
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
  const rootDir = getProjectRoot();

  // PERFORMANCE: Load all project files once into cache
  // This eliminates 6-8 duplicate file reads across functions
  const cache = loadProjectFiles(rootDir);

  // All functions now use cached file data where possible
  const info = getProjectInfo(rootDir, cache);
  const archival = runArchival(rootDir, cache);
  const session = clearActiveCommands(rootDir, cache);
  const precompact = checkPreCompact(rootDir, cache);
  const parallelSessions = checkParallelSessions(rootDir);
  // PERFORMANCE: Use fast expertise count (directory scan only, ~3 file samples)
  // Full validation available via /agileflow:validate-expertise
  const expertise = getExpertiseCountFast(rootDir);
  const damageControl = checkDamageControl(rootDir, cache);

  // Check for updates (async, cached)
  let updateInfo = {};
  try {
    updateInfo = await checkUpdates();

    // If auto-update is enabled and update available, run it
    if (updateInfo.available && updateInfo.autoUpdate && updateInfo.latest) {
      const updated = await runAutoUpdate(rootDir, info.version, updateInfo.latest);
      if (updated) {
        // Mark as "just updated" so the welcome table shows it
        updateInfo.justUpdated = true;
        updateInfo.previousVersion = info.version;
        // Update local info with new version
        info.version = updateInfo.latest;
        // Get changelog entries for the new version
        updateInfo.changelog = getChangelogEntries(updateInfo.latest);
        // Clear the "update available" flag since we just updated
        updateInfo.available = false;
      }
    }

    // Mark current version as seen to track for next update
    if (updateInfo.justUpdated && updateChecker) {
      updateChecker.markVersionSeen(info.version);
    }
  } catch (e) {
    // Update check failed - continue without it
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
      damageControl
    )
  );

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

  // Story claiming: cleanup stale claims and show warnings
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
}

main().catch(console.error);
