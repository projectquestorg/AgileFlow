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
const { execSync, spawnSync } = require('child_process');

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
    try {
      const output = execSync("ps -axo pid,lstart,command | grep -E 'claude' | grep -v grep", {
        encoding: 'utf8',
        timeout: 5000,
      });

      for (const line of output.split('\n')) {
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
        try {
          const lsofOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $NF}'`, {
            encoding: 'utf8',
            timeout: 1000,
          });
          cwd = lsofOutput.trim() || null;
        } catch (e) {
          // lsof failed
        }

        processes.push({
          pid,
          cwd,
          cmdline,
          startTime: new Date(match[2]).getTime(),
        });
      }
    } catch (e) {
      // ps/grep failed (no claude processes found)
    }
  }

  return processes;
}

/**
 * Find duplicate Claude processes in the same working directory
 *
 * @param {string} currentCwd - Current working directory
 * @param {number} currentPid - Current session's PID (to exclude)
 * @returns {Array} Duplicate processes (excluding current)
 */
function findDuplicatesInCwd(currentCwd, currentPid) {
  const allClaude = findClaudeProcesses();

  return allClaude.filter(proc => {
    // Exclude current session
    if (proc.pid === currentPid) return false;

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
 * The Claude Code process is typically the parent of this script.
 * We use process.ppid to identify it.
 *
 * @returns {number}
 */
function getCurrentSessionPid() {
  // The claude process is our parent (this script is run by claude)
  return process.ppid || process.pid;
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
  const duplicates = findDuplicatesInCwd(currentCwd, currentPid);

  const result = {
    duplicates: duplicates.length,
    processes: duplicates,
    killed: [],
    errors: [],
    autoKillEnabled: autoKill,
    currentPid,
  };

  if (duplicates.length === 0) {
    return result;
  }

  if (!autoKill) {
    // Just report, don't kill
    return result;
  }

  // Safety limit - don't kill more than MAX_PROCESSES_TO_KILL
  const toKill = duplicates.slice(0, MAX_PROCESSES_TO_KILL);

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

  // Constants
  KILL_GRACE_PERIOD_MS,
  MAX_PROCESSES_TO_KILL,
};
