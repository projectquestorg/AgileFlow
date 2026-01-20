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
const { execSync, exec } = require('child_process');

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
 * Safely execute a shell command.
 * @param {string} cmd - Command to execute
 * @returns {string|null} Command output or null
 */
function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
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
 * Execute a command asynchronously.
 * @param {string} cmd - Command to execute
 * @returns {Promise<string|null>} Command output or null
 */
async function safeExecAsync(cmd) {
  return new Promise(resolve => {
    exec(cmd, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
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
