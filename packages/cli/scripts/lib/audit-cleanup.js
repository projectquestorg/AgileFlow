/**
 * audit-cleanup.js - Orphan cleanup for ULTRADEEP audit sessions
 *
 * Cleans up abandoned tmux sessions and incomplete sentinel directories
 * from ULTRADEEP audit runs. Designed to be called from Stop hooks or
 * manually for maintenance.
 *
 * Usage:
 *   const { cleanupOrphanSessions } = require('./audit-cleanup');
 *   cleanupOrphanSessions(rootDir);
 *
 * CLI:
 *   node scripts/lib/audit-cleanup.js [--max-age=60] [--dry-run]
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_AGE_MINUTES = 60;

/**
 * Find all ultradeep trace directories.
 * @param {string} rootDir - Project root
 * @returns {Array<{ traceId: string, dir: string, status: object|null }>}
 */
function findTraceDirectories(rootDir) {
  const ultradeepDir = path.join(rootDir, 'docs', '09-agents', 'ultradeep');

  if (!fs.existsSync(ultradeepDir)) {
    return [];
  }

  const traces = [];
  try {
    const entries = fs.readdirSync(ultradeepDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const traceDir = path.join(ultradeepDir, entry.name);
      const statusFile = path.join(traceDir, '_status.json');
      let status = null;

      try {
        if (fs.existsSync(statusFile)) {
          status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        }
      } catch (_) {
        // Corrupt status file
      }

      traces.push({
        traceId: entry.name,
        dir: traceDir,
        status,
      });
    }
  } catch (_) {
    // Directory read failure
  }

  return traces;
}

/**
 * Check if a trace is stale (older than maxAge).
 * @param {object} trace - Trace info from findTraceDirectories
 * @param {number} maxAgeMinutes - Maximum age in minutes
 * @returns {boolean}
 */
function isStaleTrace(trace, maxAgeMinutes) {
  if (!trace.status || !trace.status.started_at) {
    // No status = assume stale
    return true;
  }

  const startedAt = new Date(trace.status.started_at).getTime();
  if (isNaN(startedAt)) return true; // Invalid date = treat as stale
  const age = Date.now() - startedAt;
  return age > maxAgeMinutes * 60 * 1000;
}

/**
 * Check if a trace is incomplete (not all analyzers have findings).
 * @param {object} trace - Trace info from findTraceDirectories
 * @returns {boolean}
 */
function isIncompleteTrace(trace) {
  if (!trace.status || !trace.status.analyzers) return true;

  const expected = trace.status.analyzers;
  const completed = trace.status.completed || [];

  return completed.length < expected.length;
}

/**
 * Find orphaned tmux sessions matching audit pattern.
 * @returns {string[]} Array of session names
 */
function findOrphanedTmuxSessions() {
  try {
    const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!output) return [];

    return output.split('\n').filter(name => name.startsWith('audit-'));
  } catch (_) {
    return [];
  }
}

/**
 * Kill a tmux session by name.
 * @param {string} sessionName - Session name to kill
 * @returns {boolean} True if killed successfully
 */
function killTmuxSession(sessionName) {
  try {
    execFileSync('tmux', ['kill-session', '-t', sessionName], {
      stdio: 'pipe',
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Remove a sentinel directory.
 * @param {string} dir - Directory to remove
 * @returns {boolean} True if removed successfully
 */
function removeSentinelDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Clean up orphaned ULTRADEEP audit sessions and stale sentinel dirs.
 *
 * @param {string} rootDir - Project root directory
 * @param {object} [options] - Options
 * @param {number} [options.maxAgeMinutes] - Max age for stale traces (default: 60)
 * @param {boolean} [options.dryRun] - If true, report but don't delete
 * @returns {{ sessionsKilled: string[], tracesRemoved: string[], errors: string[] }}
 */
function cleanupOrphanSessions(rootDir, options) {
  const maxAge = (options && options.maxAgeMinutes) || MAX_AGE_MINUTES;
  const dryRun = (options && options.dryRun) || false;

  const result = {
    sessionsKilled: [],
    tracesRemoved: [],
    errors: [],
  };

  // 1. Find and kill orphaned tmux sessions
  const orphanedSessions = findOrphanedTmuxSessions();
  for (const session of orphanedSessions) {
    // Extract trace ID from session name: audit-{type}-{traceId}
    const parts = session.split('-');
    if (parts.length < 3) continue; // Malformed session name, skip
    const traceId = parts.slice(2).join('-');

    if (dryRun) {
      result.sessionsKilled.push(`${session} (dry-run)`);
      continue;
    }

    if (killTmuxSession(session)) {
      result.sessionsKilled.push(session);
    } else {
      result.errors.push(`Failed to kill session: ${session}`);
    }
  }

  // 2. Clean up stale sentinel directories
  const traces = findTraceDirectories(rootDir);
  for (const trace of traces) {
    if (isStaleTrace(trace, maxAge) && isIncompleteTrace(trace)) {
      if (dryRun) {
        result.tracesRemoved.push(`${trace.traceId} (dry-run)`);
        continue;
      }

      if (removeSentinelDir(trace.dir)) {
        result.tracesRemoved.push(trace.traceId);
      } else {
        result.errors.push(`Failed to remove trace dir: ${trace.traceId}`);
      }
    }
  }

  return result;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  let maxAge = MAX_AGE_MINUTES;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--max-age=')) {
      const parsed = parseInt(arg.split('=')[1], 10);
      maxAge = isNaN(parsed) ? MAX_AGE_MINUTES : parsed;
    }
    if (arg === '--dry-run') dryRun = true;
  }

  const rootDir = process.cwd();
  const result = cleanupOrphanSessions(rootDir, { maxAgeMinutes: maxAge, dryRun });

  if (result.sessionsKilled.length > 0) {
    console.log(`Killed ${result.sessionsKilled.length} orphaned session(s):`);
    result.sessionsKilled.forEach(s => console.log(`  - ${s}`));
  }

  if (result.tracesRemoved.length > 0) {
    console.log(`Removed ${result.tracesRemoved.length} stale trace(s):`);
    result.tracesRemoved.forEach(t => console.log(`  - ${t}`));
  }

  if (result.errors.length > 0) {
    console.error(`${result.errors.length} error(s):`);
    result.errors.forEach(e => console.error(`  - ${e}`));
  }

  if (result.sessionsKilled.length === 0 && result.tracesRemoved.length === 0) {
    console.log('No orphaned sessions or stale traces found.');
  }
}

module.exports = {
  findTraceDirectories,
  isStaleTrace,
  isIncompleteTrace,
  findOrphanedTmuxSessions,
  killTmuxSession,
  removeSentinelDir,
  cleanupOrphanSessions,
};
