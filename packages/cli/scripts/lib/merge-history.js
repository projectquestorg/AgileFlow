/**
 * merge-history.js - Append-only JSONL merge audit log
 *
 * Provides an immutable audit trail of all merge operations for:
 * - Investigation of merge failures
 * - Rollback planning
 * - Session registry corruption recovery
 * - Compliance and observability
 *
 * Format: One JSON object per line (JSONL/JSON Lines)
 * Location: .agileflow/sessions/merge-history.jsonl
 *
 * FAIL-OPEN SEMANTICS:
 * ====================
 * Logging failures never block merge operations.
 * All functions catch errors internally and return gracefully.
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins
 */

const fs = require('fs');
const path = require('path');

// Lazy-loaded paths
let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../lib/paths');
    } catch (e) {
      _paths = require('../../lib/paths');
    }
  }
  return _paths;
}

const HISTORY_FILENAME = 'merge-history.jsonl';
const MAX_ENTRIES = 500;
const ROTATION_KEEP = 200;

/**
 * Get the path to the merge history file
 * @returns {string} History file path
 */
function getHistoryPath() {
  try {
    const { getProjectRoot, getAgileflowDir } = getPaths();
    const root = getProjectRoot();
    const sessionsDir = path.join(getAgileflowDir(root), 'sessions');
    return path.join(sessionsDir, HISTORY_FILENAME);
  } catch (e) {
    return path.join(process.cwd(), '.agileflow', 'sessions', HISTORY_FILENAME);
  }
}

/**
 * Append a merge event entry to the JSONL log
 *
 * @param {object} entry - Merge event data
 * @param {string} entry.sessionId - Session that was merged
 * @param {boolean} entry.success - Whether merge succeeded
 * @param {string} [entry.strategy] - Merge strategy used (squash, merge, smart)
 * @param {string} [entry.branchName] - Branch that was merged
 * @param {string} [entry.error] - Error message if failed
 * @param {Array} [entry.autoResolved] - Files auto-resolved during smart merge
 * @returns {boolean} True if appended successfully
 */
function appendEntry(entry) {
  try {
    const historyPath = getHistoryPath();
    const dir = path.dirname(historyPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const record = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...entry,
    };

    // Append as a single line (JSONL format)
    fs.appendFileSync(historyPath, JSON.stringify(record) + '\n', 'utf8');

    // Check if rotation is needed
    maybeRotate(historyPath);

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read all entries from the history log
 *
 * @param {object} [options={}] - Read options
 * @param {number} [options.limit] - Maximum entries to return (from end)
 * @param {string} [options.sessionId] - Filter by session ID
 * @param {boolean} [options.successOnly] - Only return successful merges
 * @param {boolean} [options.failuresOnly] - Only return failed merges
 * @returns {{ entries: Array, total: number }}
 */
function readHistory(options = {}) {
  try {
    const historyPath = getHistoryPath();

    if (!fs.existsSync(historyPath)) {
      return { entries: [], total: 0 };
    }

    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    let entries = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
      }
    }

    // Apply filters
    if (options.sessionId) {
      entries = entries.filter(e => e.sessionId === options.sessionId);
    }

    if (options.successOnly) {
      entries = entries.filter(e => e.success === true);
    }

    if (options.failuresOnly) {
      entries = entries.filter(e => e.success === false);
    }

    const total = entries.length;

    // Apply limit (from end)
    if (options.limit && options.limit > 0) {
      entries = entries.slice(-options.limit);
    }

    return { entries, total };
  } catch (e) {
    return { entries: [], total: 0, error: e.message };
  }
}

/**
 * Get the last N merge entries
 *
 * @param {number} [n=10] - Number of entries to return
 * @returns {Array} Last N entries
 */
function getLastN(n = 10) {
  const { entries } = readHistory({ limit: n });
  return entries;
}

/**
 * Get merge statistics
 *
 * @returns {object} Statistics summary
 */
function getStats() {
  try {
    const { entries, total } = readHistory();

    if (total === 0) {
      return { total: 0, successful: 0, failed: 0, successRate: 0, strategies: {} };
    }

    const successful = entries.filter(e => e.success).length;
    const failed = entries.filter(e => !e.success).length;

    // Count strategies
    const strategies = {};
    for (const entry of entries) {
      const strategy = entry.strategy || 'unknown';
      strategies[strategy] = (strategies[strategy] || 0) + 1;
    }

    // Find most recent merge
    const lastMerge = entries[entries.length - 1];

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      strategies,
      lastMerge: lastMerge ? lastMerge.timestamp : null,
    };
  } catch (e) {
    return { total: 0, successful: 0, failed: 0, successRate: 0, strategies: {}, error: e.message };
  }
}

/**
 * Rotate the history file when it exceeds MAX_ENTRIES
 * Keeps the most recent ROTATION_KEEP entries
 *
 * @param {string} historyPath - Path to history file
 */
function maybeRotate(historyPath) {
  try {
    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (lines.length > MAX_ENTRIES) {
      const kept = lines.slice(-ROTATION_KEEP);
      fs.writeFileSync(historyPath, kept.join('\n') + '\n', 'utf8');
    }
  } catch (e) {
    // Rotation failure is not critical
  }
}

/**
 * Clear the merge history (for testing or manual reset)
 * @returns {boolean} True if cleared
 */
function clearHistory() {
  try {
    const historyPath = getHistoryPath();
    if (fs.existsSync(historyPath)) {
      fs.unlinkSync(historyPath);
    }
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  appendEntry,
  readHistory,
  getLastN,
  getStats,
  clearHistory,
  // For testing
  _getHistoryPath: getHistoryPath,
  _maybeRotate: maybeRotate,
  _MAX_ENTRIES: MAX_ENTRIES,
  _ROTATION_KEEP: ROTATION_KEEP,
};
