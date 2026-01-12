/**
 * file-tracking.js - Inter-session file awareness
 *
 * Tracks which files each session is editing to warn about potential conflicts.
 * Uses PID-based liveness detection to auto-cleanup stale entries.
 *
 * Key Principle: Warn, don't block. Overlapping files get warnings but work continues.
 *
 * Usage:
 *   const { recordFileTouch, getFileOverlaps, getSessionFiles } = require('./lib/file-tracking');
 *
 *   // Record that this session touched a file
 *   recordFileTouch('src/HomePage.tsx');
 *
 *   // Get all file overlaps across sessions
 *   const overlaps = getFileOverlaps();
 *   // → [{ file: 'src/HomePage.tsx', sessions: ['1', '2'] }]
 */

const fs = require('fs');
const path = require('path');

// Shared utilities
const { getProjectRoot } = require('../../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../../lib/errors');
const { c } = require('../../lib/colors');
const { getCurrentSession, isPidAlive } = require('./story-claiming');

// Default touch expiration: 4 hours (matches story claiming)
const DEFAULT_TOUCH_TTL_HOURS = 4;

/**
 * Get the path to the file-touches.json file.
 *
 * @param {string} [rootDir] - Project root directory
 * @returns {string} Path to file-touches.json
 */
function getFileTouchesPath(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, '.agileflow', 'sessions', 'file-touches.json');
}

/**
 * Ensure the file-touches.json file exists with default structure.
 *
 * @param {string} [rootDir] - Project root directory
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
function ensureFileTouchesFile(rootDir) {
  const filePath = getFileTouchesPath(rootDir);
  const dirPath = path.dirname(filePath);

  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (e) {
      return { ok: false, error: `Could not create directory: ${e.message}` };
    }
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    const defaultData = {
      version: 1,
      sessions: {},
      updated: new Date().toISOString(),
    };
    const writeResult = safeWriteJSON(filePath, defaultData);
    if (!writeResult.ok) {
      return { ok: false, error: writeResult.error };
    }
    return { ok: true, data: defaultData };
  }

  // Read existing file
  const result = safeReadJSON(filePath, { defaultValue: null });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Could not read file-touches.json' };
  }

  return { ok: true, data: result.data };
}

/**
 * Record that the current session touched a file.
 *
 * @param {string} filePath - Path to the file (relative or absolute)
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, error?: string }}
 */
function recordFileTouch(filePath, options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();

  // Get current session
  const currentSession = getCurrentSession(root);
  if (!currentSession) {
    return { ok: false, error: 'Could not determine current session' };
  }

  const sessionId = currentSession.session_id;

  // Normalize file path to be relative to project root
  let normalizedPath = filePath;
  if (path.isAbsolute(filePath)) {
    normalizedPath = path.relative(root, filePath);
  }

  // Load file-touches.json
  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;

  // Initialize session entry if needed
  if (!data.sessions[sessionId]) {
    data.sessions[sessionId] = {
      files: [],
      pid: currentSession.pid,
      path: currentSession.path,
      last_updated: new Date().toISOString(),
    };
  }

  // Add file if not already tracked
  const sessionData = data.sessions[sessionId];
  if (!sessionData.files.includes(normalizedPath)) {
    sessionData.files.push(normalizedPath);
  }
  sessionData.last_updated = new Date().toISOString();
  sessionData.pid = currentSession.pid;

  // Save
  data.updated = new Date().toISOString();
  const touchesPath = getFileTouchesPath(root);
  const writeResult = safeWriteJSON(touchesPath, data);
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error };
  }

  return { ok: true };
}

/**
 * Record multiple files touched by the current session.
 *
 * @param {string[]} filePaths - Array of file paths
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, error?: string }}
 */
function recordFileTouches(filePaths, options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();

  // Get current session
  const currentSession = getCurrentSession(root);
  if (!currentSession) {
    return { ok: false, error: 'Could not determine current session' };
  }

  const sessionId = currentSession.session_id;

  // Load file-touches.json
  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;

  // Initialize session entry if needed
  if (!data.sessions[sessionId]) {
    data.sessions[sessionId] = {
      files: [],
      pid: currentSession.pid,
      path: currentSession.path,
      last_updated: new Date().toISOString(),
    };
  }

  const sessionData = data.sessions[sessionId];

  // Normalize and add files
  for (const filePath of filePaths) {
    let normalizedPath = filePath;
    if (path.isAbsolute(filePath)) {
      normalizedPath = path.relative(root, filePath);
    }
    if (!sessionData.files.includes(normalizedPath)) {
      sessionData.files.push(normalizedPath);
    }
  }

  sessionData.last_updated = new Date().toISOString();
  sessionData.pid = currentSession.pid;

  // Save
  data.updated = new Date().toISOString();
  const touchesPath = getFileTouchesPath(root);
  const writeResult = safeWriteJSON(touchesPath, data);
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error };
  }

  return { ok: true };
}

/**
 * Get files touched by a specific session.
 *
 * @param {string} sessionId - Session ID
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, files?: string[], error?: string }}
 */
function getSessionFiles(sessionId, options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();

  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;
  const sessionData = data.sessions[sessionId];

  if (!sessionData) {
    return { ok: true, files: [] };
  }

  return { ok: true, files: sessionData.files || [] };
}

/**
 * Check if a session entry is still valid (PID alive, not expired).
 *
 * @param {object} sessionData - Session data from file-touches.json
 * @returns {boolean}
 */
function isSessionTouchValid(sessionData) {
  if (!sessionData) return false;

  // Check PID liveness
  if (sessionData.pid && !isPidAlive(sessionData.pid)) {
    return false;
  }

  // Check TTL expiration
  if (sessionData.last_updated) {
    const lastUpdated = new Date(sessionData.last_updated);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);

    if (hoursSinceUpdate > DEFAULT_TOUCH_TTL_HOURS) {
      return false;
    }
  }

  return true;
}

/**
 * Get all file overlaps across active sessions.
 * Returns files that are touched by multiple sessions.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @param {boolean} [options.includeCurrentSession=false] - Include overlaps with current session
 * @returns {{ ok: boolean, overlaps?: Array<{ file: string, sessions: Array<{ id: string, path: string }> }>, error?: string }}
 */
function getFileOverlaps(options = {}) {
  const { rootDir, includeCurrentSession = false } = options;
  const root = rootDir || getProjectRoot();

  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;

  // Get current session
  const currentSession = getCurrentSession(root);
  const mySessionId = currentSession ? currentSession.session_id : null;

  // Build file -> sessions map
  const fileMap = {};

  for (const [sessionId, sessionData] of Object.entries(data.sessions || {})) {
    // Skip current session if not including
    if (!includeCurrentSession && sessionId === mySessionId) {
      continue;
    }

    // Skip invalid sessions
    if (!isSessionTouchValid(sessionData)) {
      continue;
    }

    for (const file of sessionData.files || []) {
      if (!fileMap[file]) {
        fileMap[file] = [];
      }
      fileMap[file].push({
        id: sessionId,
        path: sessionData.path,
        pid: sessionData.pid,
      });
    }
  }

  // Find overlaps (files touched by multiple sessions)
  const overlaps = [];

  for (const [file, sessions] of Object.entries(fileMap)) {
    if (sessions.length > 1) {
      overlaps.push({ file, sessions });
    }
  }

  // Sort by file path
  overlaps.sort((a, b) => a.file.localeCompare(b.file));

  return { ok: true, overlaps };
}

/**
 * Get files that this session shares with other sessions.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, overlaps?: Array<{ file: string, otherSessions: Array<{ id: string, path: string }> }>, error?: string }}
 */
function getMyFileOverlaps(options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();

  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;

  // Get current session
  const currentSession = getCurrentSession(root);
  if (!currentSession) {
    return { ok: true, overlaps: [] };
  }

  const mySessionId = currentSession.session_id;
  const mySessionData = data.sessions[mySessionId];

  if (!mySessionData || !mySessionData.files || mySessionData.files.length === 0) {
    return { ok: true, overlaps: [] };
  }

  const myFiles = new Set(mySessionData.files);
  const overlaps = [];

  // Check each of my files against other sessions
  for (const [sessionId, sessionData] of Object.entries(data.sessions || {})) {
    // Skip my session
    if (sessionId === mySessionId) continue;

    // Skip invalid sessions
    if (!isSessionTouchValid(sessionData)) continue;

    // Find shared files
    for (const file of sessionData.files || []) {
      if (myFiles.has(file)) {
        // Find or create overlap entry
        let overlap = overlaps.find(o => o.file === file);
        if (!overlap) {
          overlap = { file, otherSessions: [] };
          overlaps.push(overlap);
        }
        overlap.otherSessions.push({
          id: sessionId,
          path: sessionData.path,
          pid: sessionData.pid,
        });
      }
    }
  }

  // Sort by file path
  overlaps.sort((a, b) => a.file.localeCompare(b.file));

  return { ok: true, overlaps };
}

/**
 * Clean up stale file touches (dead PIDs or expired TTL).
 * Should be called on session startup.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, cleaned?: number, error?: string }}
 */
function cleanupStaleTouches(options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();

  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;
  let cleanedCount = 0;

  for (const [sessionId, sessionData] of Object.entries(data.sessions || {})) {
    if (!isSessionTouchValid(sessionData)) {
      delete data.sessions[sessionId];
      cleanedCount++;
    }
  }

  // Save if anything was cleaned
  if (cleanedCount > 0) {
    data.updated = new Date().toISOString();
    const touchesPath = getFileTouchesPath(root);
    const writeResult = safeWriteJSON(touchesPath, data);
    if (!writeResult.ok) {
      return { ok: false, error: writeResult.error };
    }
  }

  return { ok: true, cleaned: cleanedCount };
}

/**
 * Clear all file touches for the current session.
 * Used when ending a session.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, error?: string }}
 */
function clearSessionFiles(options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();

  // Get current session
  const currentSession = getCurrentSession(root);
  if (!currentSession) {
    return { ok: false, error: 'Could not determine current session' };
  }

  const sessionId = currentSession.session_id;

  const result = ensureFileTouchesFile(root);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;

  // Remove session entry
  if (data.sessions[sessionId]) {
    delete data.sessions[sessionId];

    data.updated = new Date().toISOString();
    const touchesPath = getFileTouchesPath(root);
    const writeResult = safeWriteJSON(touchesPath, data);
    if (!writeResult.ok) {
      return { ok: false, error: writeResult.error };
    }
  }

  return { ok: true };
}

/**
 * Format file overlaps for display.
 *
 * @param {Array} overlaps - Array of overlap objects from getMyFileOverlaps
 * @returns {string} Formatted display string
 */
function formatFileOverlaps(overlaps) {
  if (!overlaps || overlaps.length === 0) {
    return '';
  }

  const lines = [];
  lines.push(`${c.amber}⚠️  File overlaps detected:${c.reset}`);

  for (let i = 0; i < overlaps.length; i++) {
    const overlap = overlaps[i];
    const isLast = i === overlaps.length - 1;
    const prefix = isLast ? '└─' : '├─';

    // Format session info
    const sessionInfo = overlap.otherSessions
      .map(s => {
        const dir = path.basename(s.path);
        return `Session ${s.id} (${dir})`;
      })
      .join(', ');

    lines.push(
      `  ${prefix} ${c.lavender}${overlap.file}${c.reset} ${c.dim}→ Also edited by ${sessionInfo}${c.reset}`
    );
  }

  lines.push(`  ${c.dim}Tip: Conflicts will be auto-resolved during session merge${c.reset}`);

  return lines.join('\n');
}

/**
 * Categorize a file by type for merge strategy selection.
 *
 * @param {string} filePath - File path
 * @returns {string} Category: 'docs', 'test', 'schema', 'config', 'source'
 */
function categorizeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const dirname = path.dirname(filePath).toLowerCase();

  // Documentation files
  if (ext === '.md' || basename === 'readme' || basename.startsWith('readme.')) {
    return 'docs';
  }

  // Test files
  if (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__') ||
    dirname.includes('test') ||
    dirname.includes('tests')
  ) {
    return 'test';
  }

  // Schema/migration files
  if (
    ext === '.sql' ||
    filePath.includes('schema') ||
    filePath.includes('migration') ||
    filePath.includes('prisma')
  ) {
    return 'schema';
  }

  // Config files
  if (
    ext === '.json' ||
    ext === '.yaml' ||
    ext === '.yml' ||
    ext === '.toml' ||
    basename.includes('config') ||
    basename.startsWith('.') // dotfiles
  ) {
    return 'config';
  }

  // Default: source code
  return 'source';
}

/**
 * Get merge strategy recommendation for a file type.
 *
 * @param {string} category - File category from categorizeFile()
 * @returns {{ strategy: string, description: string }}
 */
function getMergeStrategy(category) {
  const strategies = {
    docs: {
      strategy: 'accept_both',
      description: 'Documentation is additive - both changes kept',
    },
    test: {
      strategy: 'accept_both',
      description: 'Tests are additive - both test files kept',
    },
    schema: {
      strategy: 'take_newer',
      description: 'Schemas evolve forward - newer version used',
    },
    config: {
      strategy: 'merge_keys',
      description: 'Config changes merged by key',
    },
    source: {
      strategy: 'intelligent_merge',
      description: 'Source code merged intelligently by diff region',
    },
  };

  return strategies[category] || strategies.source;
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'touch': {
      const filePath = args[1];
      if (!filePath) {
        console.log(JSON.stringify({ ok: false, error: 'File path required' }));
        return;
      }
      const result = recordFileTouch(filePath);
      console.log(JSON.stringify(result));
      break;
    }

    case 'files': {
      const sessionId = args[1];
      if (!sessionId) {
        const currentSession = getCurrentSession();
        if (currentSession) {
          const result = getSessionFiles(currentSession.session_id);
          console.log(JSON.stringify(result));
        } else {
          console.log(JSON.stringify({ ok: false, error: 'Session ID required' }));
        }
        return;
      }
      const result = getSessionFiles(sessionId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'overlaps': {
      const result = getMyFileOverlaps();
      if (result.ok && result.overlaps.length > 0) {
        console.log(formatFileOverlaps(result.overlaps));
      } else if (result.ok) {
        console.log('No file overlaps detected.');
      } else {
        console.log(JSON.stringify(result));
      }
      break;
    }

    case 'all-overlaps': {
      const result = getFileOverlaps({ includeCurrentSession: true });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'cleanup': {
      const result = cleanupStaleTouches();
      console.log(JSON.stringify(result));
      break;
    }

    case 'clear': {
      const result = clearSessionFiles();
      console.log(JSON.stringify(result));
      break;
    }

    case 'categorize': {
      const filePath = args[1];
      if (!filePath) {
        console.log(JSON.stringify({ ok: false, error: 'File path required' }));
        return;
      }
      const category = categorizeFile(filePath);
      const strategy = getMergeStrategy(category);
      console.log(JSON.stringify({ ok: true, file: filePath, category, ...strategy }));
      break;
    }

    case 'help':
    default:
      console.log(`
${c.brand}${c.bold}File Tracking${c.reset} - Inter-session file awareness

${c.cyan}Commands:${c.reset}
  touch <file>           Record that this session touched a file
  files [session-id]     List files touched by session (current if not specified)
  overlaps               Show files shared with other sessions (formatted)
  all-overlaps           Show all file overlaps across all sessions (JSON)
  cleanup                Remove stale session entries (dead PIDs)
  clear                  Clear all file touches for current session
  categorize <file>      Show merge strategy for a file type
  help                   Show this help

${c.cyan}Examples:${c.reset}
  node file-tracking.js touch src/HomePage.tsx
  node file-tracking.js overlaps
  node file-tracking.js categorize src/HomePage.tsx
`);
  }
}

// Export for use as module
module.exports = {
  // Core functions
  recordFileTouch,
  recordFileTouches,
  getSessionFiles,
  clearSessionFiles,

  // Overlap detection
  getFileOverlaps,
  getMyFileOverlaps,

  // Cleanup
  cleanupStaleTouches,

  // Utilities
  formatFileOverlaps,
  categorizeFile,
  getMergeStrategy,
  isSessionTouchValid,

  // Path utilities
  getFileTouchesPath,
  ensureFileTouchesFile,

  // Constants
  DEFAULT_TOUCH_TTL_HOURS,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
