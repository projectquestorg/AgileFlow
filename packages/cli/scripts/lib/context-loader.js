#!/usr/bin/env node
/**
 * context-loader.js
 *
 * Data loading module for obtain-context.js (US-0148)
 *
 * Responsibilities:
 * - Synchronous and asynchronous file/JSON/directory reading
 * - Git command execution
 * - Parallel pre-fetching of all required data
 * - Context budget tracking from Claude session files
 * - Lazy loading configuration and section determination
 * - Command argument parsing
 *
 * Performance optimization: Uses Promise.all() for parallel I/O (US-0092)
 * Lazy evaluation: Conditionally loads sections based on command (US-0093)
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

// Try to use cached reads if available
let readJSONCached, readFileCached;
try {
  const fileCache = require('../../lib/file-cache');
  readJSONCached = fileCache.readJSONCached;
  readFileCached = fileCache.readFileCached;
} catch {
  // Fallback if file-cache not available
  readJSONCached = null;
  readFileCached = null;
}

// =============================================================================
// Command Whitelist for safeExec (US-0120)
// =============================================================================

/**
 * Whitelisted git subcommands with allowed arguments (US-0187)
 * Only these specific read-only git operations are permitted.
 *
 * Format: { subcommand: true } allows any args (read-only commands)
 *         { subcommand: ['--flag1', '--flag2'] } allows only listed first args
 */
const SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS = {
  // Read-only git operations
  branch: ['--show-current', '-a', '--list', '-r', '--all'],
  log: true, // All log flags are read-only
  status: ['--short', '--porcelain', '-s', '--ignored'],
  diff: true, // All diff flags are read-only
  'rev-parse': ['HEAD', '--git-dir', '--show-toplevel', '--abbrev-ref', '--is-inside-work-tree'],
  describe: true, // Read-only
  show: true, // Read-only
  config: ['--get', '--list', '-l', '--get-all'], // Read-only config operations only
  remote: ['-v', '--verbose', 'get-url'],
  tag: ['--list', '-l'],
  'ls-files': true, // Read-only listing
};

/**
 * Dangerous patterns that should never be executed
 */
const SAFEEXEC_BLOCKED_PATTERNS = [
  /\|/, // Pipe
  /;/, // Command separator
  /&&/, // AND operator
  /\|\|/, // OR operator
  /`/, // Backticks
  /\$\(/, // Command substitution
  />/, // Redirect output
  /</, // Redirect input
  /\bsudo\b/, // Sudo
  /\brm\b/, // Remove
  /\bmv\b/, // Move
  /\bcp\b/, // Copy
  /\bchmod\b/, // Change permissions
  /\bchown\b/, // Change owner
  /\bcurl\b/, // curl (network)
  /\bwget\b/, // wget (network)
];

/**
 * Logger for safeExec operations (configurable)
 */
let _safeExecLogger = null;

/**
 * Configure the safeExec logger
 * @param {Function|null} logger - Logger function or null to disable
 */
function configureSafeExecLogger(logger) {
  _safeExecLogger = logger;
}

/**
 * Log a safeExec operation
 * @param {string} level - Log level ('debug', 'warn', 'error')
 * @param {string} message - Log message
 * @param {Object} [details] - Additional details
 */
function logSafeExec(level, message, details = {}) {
  if (_safeExecLogger) {
    _safeExecLogger(level, message, details);
  }
}

/**
 * Parse a git command string into executable and arguments (US-0187)
 * @param {string} cmd - Command string (e.g., "git branch --show-current")
 * @returns {{ ok: boolean, data?: { executable: string, subcommand: string, args: string[], fullArgs: string[] }, error?: string }}
 */
function parseGitCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') {
    return { ok: false, error: 'Invalid command' };
  }

  const parts = cmd.trim().split(/\s+/);
  if (parts.length < 1 || parts[0] !== 'git') {
    return { ok: false, error: 'Only git commands are supported' };
  }

  // Handle bare 'git' command
  if (parts.length < 2) {
    return { ok: false, error: 'Git subcommand required' };
  }

  return {
    ok: true,
    data: {
      executable: 'git',
      subcommand: parts[1],
      args: parts.slice(2),
      fullArgs: parts.slice(1), // ['branch', '--show-current']
    },
  };
}

/**
 * Check if a git subcommand with args is allowed (US-0187)
 * @param {string} subcommand - Git subcommand (e.g., 'branch')
 * @param {string[]} args - Arguments to subcommand
 * @returns {{ allowed: boolean, reason?: string }}
 */
function isGitCommandAllowed(subcommand, args) {
  // First check blocked patterns in arguments
  const fullCmd = `git ${subcommand} ${args.join(' ')}`;
  for (const pattern of SAFEEXEC_BLOCKED_PATTERNS) {
    if (pattern.test(fullCmd)) {
      return { allowed: false, reason: `Blocked pattern: ${pattern}` };
    }
  }

  // Check against allowed subcommands
  const allowedArgs = SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS[subcommand];
  if (!allowedArgs) {
    return { allowed: false, reason: `Git subcommand '${subcommand}' not in whitelist` };
  }

  // If allowedArgs is true, any args are allowed for this subcommand (read-only)
  if (allowedArgs === true) {
    return { allowed: true };
  }

  // If allowedArgs is an array, first arg must match one of the allowed values
  // (or args can be empty for commands like 'git status')
  if (args.length === 0) {
    return { allowed: true };
  }

  if (allowedArgs.includes(args[0])) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Argument '${args[0]}' not allowed for 'git ${subcommand}'` };
}

/**
 * Check if a command is allowed (legacy wrapper for backwards compatibility)
 * @param {string} cmd - Command to check
 * @returns {{allowed: boolean, reason?: string}}
 */
function isCommandAllowed(cmd) {
  const parsed = parseGitCommand(cmd);
  if (!parsed.ok) {
    return { allowed: false, reason: parsed.error };
  }
  return isGitCommandAllowed(parsed.data.subcommand, parsed.data.args);
}

// =============================================================================
// Synchronous I/O Helpers
// =============================================================================

/**
 * Safely read a file, returning null on error.
 * @param {string} filePath - Path to file
 * @returns {string|null} File contents or null
 */
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Safely read and parse JSON file, using cache when available.
 * @param {string} filePath - Path to JSON file
 * @returns {Object|null} Parsed JSON or null
 */
function safeReadJSON(filePath) {
  if (readJSONCached) {
    const absPath = path.resolve(filePath);
    return readJSONCached(absPath);
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Safely list directory contents.
 * @param {string} dirPath - Directory path
 * @returns {string[]} Array of filenames or empty array
 */
function safeLs(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

/**
 * Safely execute a git command with whitelist validation (US-0187).
 *
 * Uses spawnSync with shell: false to prevent shell injection.
 * Only whitelisted read-only git commands are allowed.
 * Dangerous patterns (pipes, redirects, etc.) are blocked.
 *
 * @param {string} cmd - Command to execute (must be a git command)
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassWhitelist=false] - Skip whitelist check (use with caution)
 * @returns {string|null} Command output or null
 */
function safeExec(cmd, options = {}) {
  const { bypassWhitelist = false } = options;

  // Parse command into executable and arguments
  const parsed = parseGitCommand(cmd);
  if (!parsed.ok) {
    logSafeExec('warn', 'Invalid command format', {
      cmd: cmd?.substring(0, 100),
      error: parsed.error,
    });
    return null;
  }

  // Validate command unless bypassed
  if (!bypassWhitelist) {
    const check = isGitCommandAllowed(parsed.data.subcommand, parsed.data.args);
    if (!check.allowed) {
      logSafeExec('warn', 'Command blocked by whitelist', {
        cmd: cmd?.substring(0, 100),
        reason: check.reason,
      });
      return null;
    }
  }

  logSafeExec('debug', 'Executing command', {
    cmd: cmd?.substring(0, 100),
    bypassed: bypassWhitelist,
  });

  try {
    // Use spawnSync with array arguments - NO SHELL INTERPRETATION (US-0187)
    const result = spawnSync(parsed.data.executable, parsed.data.fullArgs, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // CRITICAL: Prevents shell injection
    });

    if (result.error) {
      logSafeExec('error', 'Command spawn failed', {
        cmd: cmd?.substring(0, 50),
        error: result.error.message,
      });
      return null;
    }

    if (result.status !== 0) {
      logSafeExec('debug', 'Command exited non-zero', {
        cmd: cmd?.substring(0, 50),
        status: result.status,
        stderr: result.stderr?.substring(0, 100),
      });
      return null;
    }

    const output = (result.stdout || '').trim();
    logSafeExec('debug', 'Command succeeded', {
      cmd: cmd?.substring(0, 50),
      outputLength: output.length,
    });
    return output;
  } catch (error) {
    logSafeExec('error', 'Command execution error', {
      cmd: cmd?.substring(0, 50),
      error: error?.message?.substring(0, 100),
    });
    return null;
  }
}

// =============================================================================
// Asynchronous I/O Helpers
// =============================================================================

/**
 * Asynchronously read a file.
 * @param {string} filePath - Path to file
 * @returns {Promise<string|null>} File contents or null
 */
async function safeReadAsync(filePath) {
  try {
    return await fsPromises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Asynchronously read and parse JSON file.
 * @param {string} filePath - Path to JSON file
 * @returns {Promise<Object|null>} Parsed JSON or null
 */
async function safeReadJSONAsync(filePath) {
  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Asynchronously list directory contents.
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>} Array of filenames or empty array
 */
async function safeLsAsync(dirPath) {
  try {
    return await fsPromises.readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Execute a git command asynchronously with whitelist validation (US-0187).
 *
 * Uses spawn with shell: false to prevent shell injection.
 * Only whitelisted read-only git commands are allowed.
 * Dangerous patterns (pipes, redirects, etc.) are blocked.
 *
 * @param {string} cmd - Command to execute (must be a git command)
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassWhitelist=false] - Skip whitelist check (use with caution)
 * @returns {Promise<string|null>} Command output or null
 */
async function safeExecAsync(cmd, options = {}) {
  const { bypassWhitelist = false } = options;

  // Parse command into executable and arguments
  const parsed = parseGitCommand(cmd);
  if (!parsed.ok) {
    logSafeExec('warn', 'Invalid async command format', {
      cmd: cmd?.substring(0, 100),
      error: parsed.error,
    });
    return null;
  }

  // Validate command unless bypassed
  if (!bypassWhitelist) {
    const check = isGitCommandAllowed(parsed.data.subcommand, parsed.data.args);
    if (!check.allowed) {
      logSafeExec('warn', 'Async command blocked by whitelist', {
        cmd: cmd?.substring(0, 100),
        reason: check.reason,
      });
      return null;
    }
  }

  logSafeExec('debug', 'Executing async command', {
    cmd: cmd?.substring(0, 100),
    bypassed: bypassWhitelist,
  });

  return new Promise(resolve => {
    // Use spawn with array arguments - NO SHELL INTERPRETATION (US-0187)
    const proc = spawn(parsed.data.executable, parsed.data.fullArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // CRITICAL: Prevents shell injection
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data;
    });

    proc.stderr.on('data', data => {
      stderr += data;
    });

    proc.on('error', error => {
      logSafeExec('error', 'Async spawn error', {
        cmd: cmd?.substring(0, 50),
        error: error.message,
      });
      resolve(null);
    });

    proc.on('close', code => {
      if (code !== 0) {
        logSafeExec('debug', 'Async command exited non-zero', {
          cmd: cmd?.substring(0, 50),
          code,
          stderr: stderr?.substring(0, 100),
        });
        resolve(null);
      } else {
        const result = stdout.trim();
        logSafeExec('debug', 'Async command succeeded', {
          cmd: cmd?.substring(0, 50),
          outputLength: result.length,
        });
        resolve(result);
      }
    });
  });
}

// =============================================================================
// Context Budget Tracking (GSD Integration)
// =============================================================================

/**
 * Get current context usage percentage from Claude's session files.
 * Reads token counts from the active session JSONL file.
 *
 * @returns {{ percent: number, tokens: number, max: number } | null}
 */
function getContextPercentage() {
  try {
    const homeDir = os.homedir();
    const cwd = process.cwd();

    // Convert current dir to Claude's session file path format
    const projectDir = cwd
      .replace(homeDir, '~')
      .replace('~', homeDir)
      .replace(/\//g, '-')
      .replace(/^-/, '');
    const sessionDir = path.join(homeDir, '.claude', 'projects', `-${projectDir}`);

    if (!fs.existsSync(sessionDir)) {
      return null;
    }

    // Find most recent .jsonl session file
    const files = fs
      .readdirSync(sessionDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        mtime: fs.statSync(path.join(sessionDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      return null;
    }

    const sessionFile = path.join(sessionDir, files[0].name);
    const content = fs.readFileSync(sessionFile, 'utf8');
    const lines = content.trim().split('\n').slice(-20); // Last 20 lines

    // Find latest usage entry
    let latestTokens = 0;
    for (const line of lines.reverse()) {
      try {
        const entry = JSON.parse(line);
        if (entry?.message?.usage) {
          const usage = entry.message.usage;
          latestTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
          if (latestTokens > 0) break;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (latestTokens === 0) {
      return null;
    }

    // Default to 200K context for modern Claude models
    const maxContext = 200000;
    const percent = Math.min(100, Math.round((latestTokens * 100) / maxContext));

    return { percent, tokens: latestTokens, max: maxContext };
  } catch {
    return null;
  }
}

// =============================================================================
// Lazy Evaluation Configuration (US-0093)
// =============================================================================

/**
 * Commands that need full research notes content
 */
const RESEARCH_COMMANDS = ['research', 'ideate', 'mentor', 'rpi'];

/**
 * Determine which sections need to be loaded based on command and environment.
 *
 * @param {string} cmdName - Command name being executed
 * @param {Object} lazyConfig - Lazy context configuration from metadata
 * @param {boolean} isMultiSession - Whether multiple sessions are detected
 * @returns {Object} Sections to load { researchContent, sessionClaims, fileOverlaps }
 */
function determineSectionsToLoad(cmdName, lazyConfig, isMultiSession) {
  // If lazy loading is disabled, load everything
  if (!lazyConfig?.enabled) {
    return {
      researchContent: true,
      sessionClaims: true,
      fileOverlaps: true,
    };
  }

  // Research notes: load for research-related commands or if 'always'
  const needsResearch =
    lazyConfig.researchNotes === 'always' ||
    (lazyConfig.researchNotes === 'conditional' && RESEARCH_COMMANDS.includes(cmdName));

  // Session claims: load if multi-session environment or if 'always'
  const needsClaims =
    lazyConfig.sessionClaims === 'always' ||
    (lazyConfig.sessionClaims === 'conditional' && isMultiSession);

  // File overlaps: load if multi-session environment or if 'always'
  const needsOverlaps =
    lazyConfig.fileOverlaps === 'always' ||
    (lazyConfig.fileOverlaps === 'conditional' && isMultiSession);

  return {
    researchContent: needsResearch,
    sessionClaims: needsClaims,
    fileOverlaps: needsOverlaps,
  };
}

// =============================================================================
// Command Argument Parsing
// =============================================================================

/**
 * Parse command-line arguments and determine which sections to activate.
 *
 * @param {string[]} args - Command-line arguments after command name
 * @returns {Object} { activeSections: string[], params: Object }
 */
function parseCommandArgs(args) {
  const activeSections = [];
  const params = {};

  for (const arg of args) {
    // Parse KEY=VALUE arguments
    const match = arg.match(/^([A-Z_]+)=(.+)$/i);
    if (match) {
      const [, key, value] = match;
      params[key.toUpperCase()] = value;
    }
  }

  // Activate sections based on parameters
  if (params.MODE === 'loop') {
    activeSections.push('loop-mode');
  }

  if (params.VISUAL === 'true') {
    activeSections.push('visual-e2e');
  }

  // Query mode: QUERY=<pattern> triggers targeted codebase search (US-0127)
  if (params.QUERY) {
    activeSections.push('query-mode');
  }

  // Check for multi-session environment
  const registryPath = '.agileflow/sessions/registry.json';
  if (fs.existsSync(registryPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const sessionCount = Object.keys(registry.sessions || {}).length;
      if (sessionCount > 1) {
        activeSections.push('multi-session');
      }
    } catch {
      // Silently ignore registry read errors
    }
  }

  return { activeSections, params };
}

/**
 * Extract command type from frontmatter (output-only vs interactive).
 *
 * @param {string} cmdName - Command name
 * @returns {string} Command type ('interactive', 'output-only', etc.)
 */
function getCommandType(cmdName) {
  // Handle nested command paths like "research/ask" -> "research/ask.md"
  const cmdPath = cmdName.includes('/')
    ? `${cmdName.substring(0, cmdName.lastIndexOf('/'))}/${cmdName.substring(cmdName.lastIndexOf('/') + 1)}.md`
    : `${cmdName}.md`;

  const possiblePaths = [
    `packages/cli/src/core/commands/${cmdPath}`,
    `.agileflow/commands/${cmdPath}`,
    `.claude/commands/agileflow/${cmdPath}`,
    `packages/cli/src/core/commands/${cmdName.replace(/\//g, '-')}.md`,
  ];

  for (const searchPath of possiblePaths) {
    if (fs.existsSync(searchPath)) {
      try {
        const content = fs.readFileSync(searchPath, 'utf8');
        const match = content.match(/^---\n[\s\S]*?type:\s*(\S+)/m);
        if (match) {
          return match[1].replace(/['"]/g, '');
        }
      } catch {
        // Continue to next path
      }
    }
  }
  return 'interactive';
}

// =============================================================================
// Parallel Data Pre-fetching
// =============================================================================

/**
 * Pre-fetch all required data in parallel for optimal performance.
 * This dramatically reduces I/O wait time by overlapping file reads and git commands.
 *
 * @param {Object} options - Options for prefetching
 * @param {Object} options.sectionsToLoad - Which sections need full content
 * @returns {Promise<Object>} Pre-fetched data for content generation
 */
async function prefetchAllData(options = {}) {
  const sectionsToLoad = options.sectionsToLoad || {
    researchContent: true,
    sessionClaims: true,
    fileOverlaps: true,
  };

  // Define all files to read
  const jsonFiles = {
    metadata: 'docs/00-meta/agileflow-metadata.json',
    statusJson: 'docs/09-agents/status.json',
    sessionState: 'docs/09-agents/session-state.json',
  };

  const textFiles = {
    busLog: 'docs/09-agents/bus/log.jsonl',
    claudeMd: 'CLAUDE.md',
    readmeMd: 'README.md',
    archReadme: 'docs/04-architecture/README.md',
    practicesReadme: 'docs/02-practices/README.md',
    roadmap: 'docs/08-project/roadmap.md',
  };

  const directories = {
    docs: 'docs',
    research: 'docs/10-research',
    epics: 'docs/05-epics',
  };

  // Git commands to run in parallel
  const gitCommands = {
    branch: 'git branch --show-current',
    commitShort: 'git log -1 --format="%h"',
    commitMsg: 'git log -1 --format="%s"',
    commitFull: 'git log -1 --format="%h %s"',
    status: 'git status --short',
  };

  // Create all promises for parallel execution
  const jsonPromises = Object.entries(jsonFiles).map(async ([key, filePath]) => {
    const data = await safeReadJSONAsync(filePath);
    return [key, data];
  });

  const textPromises = Object.entries(textFiles).map(async ([key, filePath]) => {
    const data = await safeReadAsync(filePath);
    return [key, data];
  });

  const dirPromises = Object.entries(directories).map(async ([key, dirPath]) => {
    const files = await safeLsAsync(dirPath);
    return [key, files];
  });

  const gitPromises = Object.entries(gitCommands).map(async ([key, cmd]) => {
    const data = await safeExecAsync(cmd);
    return [key, data];
  });

  // Execute all I/O operations in parallel
  const [jsonResults, textResults, dirResults, gitResults] = await Promise.all([
    Promise.all(jsonPromises),
    Promise.all(textPromises),
    Promise.all(dirPromises),
    Promise.all(gitPromises),
  ]);

  // Convert arrays back to objects
  const json = Object.fromEntries(jsonResults);
  const text = Object.fromEntries(textResults);
  const dirs = Object.fromEntries(dirResults);
  const git = Object.fromEntries(gitResults);

  // Determine most recent research file
  const researchFiles = dirs.research
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .reverse();

  // Lazy loading (US-0093): Only fetch research content if needed
  let mostRecentResearch = null;
  if (sectionsToLoad.researchContent && researchFiles.length > 0) {
    mostRecentResearch = await safeReadAsync(path.join('docs/10-research', researchFiles[0]));
  }

  return {
    json,
    text,
    dirs,
    git,
    researchFiles,
    mostRecentResearch,
    sectionsToLoad,
  };
}

/**
 * Check if multi-session environment is detected.
 * @returns {boolean} True if multiple sessions exist
 */
function isMultiSessionEnvironment() {
  const registryPath = '.agileflow/sessions/registry.json';
  if (fs.existsSync(registryPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const sessionCount = Object.keys(registry.sessions || {}).length;
      return sessionCount > 1;
    } catch {
      return false;
    }
  }
  return false;
}

module.exports = {
  // Sync helpers
  safeRead,
  safeReadJSON,
  safeLs,
  safeExec,

  // Async helpers
  safeReadAsync,
  safeReadJSONAsync,
  safeLsAsync,
  safeExecAsync,

  // Command whitelist (US-0120, US-0187)
  SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS,
  SAFEEXEC_BLOCKED_PATTERNS,
  configureSafeExecLogger,
  parseGitCommand,
  isGitCommandAllowed,
  isCommandAllowed, // Legacy wrapper for backward compatibility

  // Context tracking
  getContextPercentage,

  // Lazy loading
  RESEARCH_COMMANDS,
  determineSectionsToLoad,

  // Command parsing
  parseCommandArgs,
  getCommandType,

  // Data prefetching
  prefetchAllData,
  isMultiSessionEnvironment,
};
