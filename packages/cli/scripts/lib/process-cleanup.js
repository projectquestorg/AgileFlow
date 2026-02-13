#!/usr/bin/env node

/**
 * process-cleanup.js - Detect and optionally kill duplicate Claude processes
 *
 * Purpose: Prevent freezing caused by multiple Claude Code instances
 * competing for resources in the same working directory.
 *
 * Safety mechanisms:
 * - Never kill current session (excluded via PID comparison)
 * - Require explicit opt-in for auto-kill via /configure
 * - Grace period: SIGTERM first, SIGKILL only after timeout
 * - Process limit: Max 5 kills per startup
 * - Same-cwd only: Worktrees in different directories are safe
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { executeCommandSync } = require('../../lib/process-executor');

// Configuration constants
const KILL_GRACE_PERIOD_MS = 5000; // Wait before SIGKILL
const MAX_PROCESSES_TO_KILL = 5; // Safety limit

/**
 * Check if a PID is alive using signal 0
 * @param {number} pid - Process ID
 * @returns {boolean}
 */
function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0); // Signal 0 = test without killing
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Parse /proc cmdline format (null-separated args)
 * @param {string} cmdline - Raw cmdline content
 * @returns {string[]} Array of arguments
 */
function parseCmdline(cmdline) {
  if (!cmdline) return [];
  return cmdline
    .split('\0')
    .filter(Boolean)
    .map(arg => arg.trim());
}

/**
 * Check if a process is Claude Code based on command line args
 * @param {string[]} args - Command line arguments
 * @returns {boolean}
 */
function isClaudeProcess(args) {
  if (!args || args.length === 0) return false;

  // Check first 3 args for claude indicators
  const firstArgs = args.slice(0, 3).join(' ').toLowerCase();

  return (
    firstArgs.includes('claude') ||
    firstArgs.includes('@anthropic') ||
    firstArgs.includes('claude-code')
  );
}

/**
 * Get working directory for a PID via /proc (Linux only)
 * @param {number} pid - Process ID
 * @returns {string|null}
 */
function getCwdForPid(pid) {
  if (process.platform !== 'linux') return null;
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch (e) {
    return null;
  }
}

/**
 * Get process start time in milliseconds.
 * Used for safety checks when deciding whether a process is older/newer.
 *
 * @param {number} pid - Process ID
 * @returns {number|null}
 */
function getProcessStartTime(pid) {
  if (!pid || typeof pid !== 'number') return null;

  if (process.platform === 'linux') {
    try {
      const stat = fs.statSync(`/proc/${pid}`);
      return Number.isFinite(stat.ctimeMs) ? stat.ctimeMs : null;
    } catch (e) {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    const result = executeCommandSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      timeout: 2000, fallback: null,
    });
    if (result.data === null) return null;
    const ts = new Date(result.data).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  return null;
}

/**
 * Get parent PID for a process.
 * Works on Linux (/proc) and macOS (ps).
 *
 * @param {number} pid - Process ID
 * @returns {number|null}
 */
function getParentPid(pid) {
  if (!pid || typeof pid !== 'number') return null;

  if (process.platform === 'linux') {
    try {
      // /proc/<pid>/stat format:
      // pid (comm) state ppid ...
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const closeParen = stat.lastIndexOf(')');
      if (closeParen === -1) return null;
      const remainder = stat.slice(closeParen + 2).trim(); // state ppid ...
      const fields = remainder.split(/\s+/);
      const ppid = parseInt(fields[1], 10);
      return Number.isFinite(ppid) ? ppid : null;
    } catch (e) {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    const result = executeCommandSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      timeout: 2000, fallback: null,
    });
    if (result.data === null) return null;
    const ppid = parseInt(result.data, 10);
    return Number.isFinite(ppid) ? ppid : null;
  }

  return null;
}

/**
 * Get command-line args for a PID.
 *
 * @param {number} pid - Process ID
 * @returns {string[]}
 */
function getArgsForPid(pid) {
  if (!pid || typeof pid !== 'number') return [];

  if (process.platform === 'linux') {
    try {
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return parseCmdline(cmdline);
    } catch (e) {
      return [];
    }
  }

  if (process.platform === 'darwin') {
    const result = executeCommandSync('ps', ['-o', 'command=', '-p', String(pid)], {
      timeout: 2000, fallback: null,
    });
    if (result.data === null) return [];
    return result.data ? [result.data] : [];
  }

  return [];
}

/**
 * Walk process ancestry and find the nearest Claude process.
 *
 * Hooks are typically executed as:
 *   claude -> shell (bash/sh) -> hook command (node)
 * so `process.ppid` is often the shell, not Claude.
 *
 * @param {number} startPid - PID to start from (defaults to current process)
 * @param {number} maxDepth - Max parent hops
 * @returns {number|null}
 */
function findClaudeAncestorPid(startPid = process.pid, maxDepth = 12) {
  let pid = startPid;
  const visited = new Set();

  for (let depth = 0; depth < maxDepth; depth++) {
    const parentPid = getParentPid(pid);
    if (!parentPid || parentPid <= 1 || visited.has(parentPid)) {
      return null;
    }
    visited.add(parentPid);

    const parentArgs = getArgsForPid(parentPid);
    if (isClaudeProcess(parentArgs)) {
      return parentPid;
    }

    pid = parentPid;
  }

  return null;
}

/**
 * Find all Claude Code processes on the system
 * @returns {Array<{pid: number, cwd: string|null, cmdline: string, startTime: number}>}
 */
function findClaudeProcesses() {
  const processes = [];
  const currentPid = process.pid;
  const parentPid = process.ppid;

  if (process.platform === 'linux') {
    // Use /proc filesystem (more reliable)
    try {
      const procDirs = fs.readdirSync('/proc').filter(f => /^\d+$/.test(f));

      for (const pidStr of procDirs) {
        const pid = parseInt(pidStr, 10);

        // Skip current process and its parent
        if (pid === currentPid || pid === parentPid) continue;

        try {
          const cmdlinePath = `/proc/${pid}/cmdline`;
          if (!fs.existsSync(cmdlinePath)) continue;

          const cmdline = fs.readFileSync(cmdlinePath, 'utf8');
          const args = parseCmdline(cmdline);

          if (isClaudeProcess(args)) {
            const cwd = getCwdForPid(pid);
            let startTime = Date.now();

            try {
              const stat = fs.statSync(`/proc/${pid}`);
              startTime = stat.ctimeMs;
            } catch (e) {
              // Use current time as fallback
            }

            processes.push({
              pid,
              cwd,
              cmdline: args.join(' '),
              startTime,
            });
          }
        } catch (e) {
          // Process may have exited during scan
        }
      }
    } catch (e) {
      // /proc access failed
    }
  } else if (process.platform === 'darwin') {
    // macOS: Use ps command
    // Note: uses bash -c for pipeline (grep) which can't be expressed with execFileSync
    const psResult = executeCommandSync(
      'bash',
      ['-c', "ps -axo pid,lstart,command | grep -E 'claude' | grep -v grep"],
      { timeout: 5000, fallback: '' }
    );

    for (const line of psResult.data.split('\n')) {
      if (!line.trim()) continue;

      // Parse: PID  LSTART                       COMMAND
      // e.g.:  1234 Mon Feb  3 08:00:00 2026    claude --flag
      const match = line.match(/^\s*(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
      if (!match) continue;

      const pid = parseInt(match[1], 10);
      if (pid === currentPid || pid === parentPid) continue;

      const cmdline = match[3];
      if (!isClaudeProcess([cmdline])) continue;

      // Get cwd via lsof (slower but works on macOS)
      let cwd = null;
      const lsofResult = executeCommandSync('lsof', ['-p', String(pid)], {
        timeout: 1000, fallback: null,
      });
      if (lsofResult.data) {
        const cwdLine = lsofResult.data.split('\n').find(l => l.includes('cwd'));
        cwd = cwdLine ? cwdLine.split(/\s+/).pop().trim() : null;
      }

      processes.push({
        pid,
        cwd,
        cmdline,
        startTime: new Date(match[2]).getTime(),
      });
    }
  }

  return processes;
}

/**
 * Find duplicate Claude processes in the same working directory
 *
 * @param {string} currentCwd - Current working directory
 * @param {number} currentPid - Current session's PID (to exclude)
 * @returns {Array} Duplicate processes (excluding current if known)
 */
function findDuplicatesInCwd(currentCwd, currentPid) {
  const allClaude = findClaudeProcesses();

  return allClaude.filter(proc => {
    // Exclude current session when known
    if (currentPid && proc.pid === currentPid) return false;

    // Must have cwd to compare
    if (!proc.cwd || !currentCwd) return false;

    // Exact match only - worktrees have different cwds
    return proc.cwd === currentCwd;
  });
}

/**
 * Kill a process gracefully (SIGTERM, then SIGKILL after grace period)
 *
 * @param {number} pid - Process ID to kill
 * @param {object} options - { dryRun, gracePeriodMs }
 * @returns {{success: boolean, method: string, pid: number, error?: string}}
 */
function killProcessGracefully(pid, options = {}) {
  const { dryRun = false, gracePeriodMs = KILL_GRACE_PERIOD_MS } = options;

  if (dryRun) {
    return { success: true, method: 'dryrun', pid };
  }

  if (!isPidAlive(pid)) {
    return { success: true, method: 'already_dead', pid };
  }

  try {
    // Try SIGTERM first (graceful shutdown)
    process.kill(pid, 'SIGTERM');

    // Wait for grace period
    const start = Date.now();
    const checkInterval = 100; // ms

    while (Date.now() - start < gracePeriodMs) {
      if (!isPidAlive(pid)) {
        return { success: true, method: 'SIGTERM', pid };
      }
      // Brief synchronous sleep
      spawnSync('sleep', ['0.1']);
    }

    // Still alive after grace period - use SIGKILL
    if (isPidAlive(pid)) {
      process.kill(pid, 'SIGKILL');

      // Wait a bit for SIGKILL to take effect
      spawnSync('sleep', ['0.2']);

      if (!isPidAlive(pid)) {
        return { success: true, method: 'SIGKILL', pid };
      } else {
        return {
          success: false,
          method: 'SIGKILL_failed',
          pid,
          error: 'Process did not respond to SIGKILL',
        };
      }
    }

    return { success: true, method: 'SIGTERM', pid };
  } catch (e) {
    return { success: false, method: 'error', pid, error: e.message };
  }
}

/**
 * Get current session's PID from process ancestry
 *
 * The Claude process is usually an ancestor (often grandparent):
 *   claude -> bash -> node hook
 *
 * If no Claude ancestor is found, returns null.
 *
 * @returns {number|null}
 */
function getCurrentSessionPid() {
  return findClaudeAncestorPid(process.pid);
}

/**
 * Main cleanup function - detect and optionally kill duplicates
 *
 * @param {object} options
 * @param {string} options.rootDir - Project root directory
 * @param {boolean} options.autoKill - Whether to auto-kill (from config)
 * @param {boolean} options.dryRun - Preview only, don't actually kill
 * @returns {{duplicates: number, processes: Array, killed: Array, errors: Array, autoKillEnabled: boolean}}
 */
function cleanupDuplicateProcesses(options = {}) {
  const { rootDir, autoKill = false, dryRun = false } = options;

  const currentCwd = rootDir || process.cwd();
  const currentPid = getCurrentSessionPid();
  const currentStartTime = getProcessStartTime(currentPid);
  const duplicates = findDuplicatesInCwd(currentCwd, currentPid);

  const result = {
    duplicates: duplicates.length,
    processes: duplicates,
    killed: [],
    errors: [],
    autoKillEnabled: autoKill && !!currentPid,
    currentPid,
    currentStartTime,
  };

  if (duplicates.length === 0) {
    return result;
  }

  if (!autoKill) {
    // Just report, don't kill
    return result;
  }

  // Safety gate: if we can't identify the current Claude session PID,
  // never auto-kill anything.
  if (!currentPid) {
    result.errors.push({
      error: 'Could not determine current Claude session PID; auto-kill skipped',
    });
    return result;
  }

  // Safety gate: only kill processes that are clearly older than current session.
  // This prevents terminating the session that just started.
  const olderDuplicates = duplicates.filter(proc => {
    if (!proc || !proc.pid || proc.pid === currentPid) return false;
    if (!currentStartTime || !proc.startTime) return false;
    return proc.startTime < currentStartTime;
  });

  if (olderDuplicates.length === 0) {
    result.errors.push({
      error: 'No clearly older duplicate processes found; auto-kill skipped',
    });
    return result;
  }

  // Safety limit - don't kill more than MAX_PROCESSES_TO_KILL
  const toKill = olderDuplicates.slice(0, MAX_PROCESSES_TO_KILL);

  for (const proc of toKill) {
    const killResult = killProcessGracefully(proc.pid, { dryRun });

    if (killResult.success) {
      result.killed.push({ ...proc, method: killResult.method });
    } else {
      result.errors.push({ ...proc, error: killResult.error });
    }
  }

  return result;
}

/**
 * Format process info for display
 * @param {Array} processes - Array of process objects
 * @returns {string}
 */
function formatProcessList(processes) {
  if (!processes || processes.length === 0) return '';

  return processes
    .map(p => {
      const cmd = p.cmdline.length > 50 ? p.cmdline.slice(0, 47) + '...' : p.cmdline;
      return `   PID ${p.pid}: ${cmd}`;
    })
    .join('\n');
}

module.exports = {
  // Main functions
  findClaudeProcesses,
  findDuplicatesInCwd,
  killProcessGracefully,
  cleanupDuplicateProcesses,
  getCurrentSessionPid,
  formatProcessList,

  // Utility functions (exposed for testing)
  isPidAlive,
  parseCmdline,
  isClaudeProcess,
  getCwdForPid,
  getProcessStartTime,
  getParentPid,
  getArgsForPid,
  findClaudeAncestorPid,

  // Constants
  KILL_GRACE_PERIOD_MS,
  MAX_PROCESSES_TO_KILL,
};
