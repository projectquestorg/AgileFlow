/**
 * file-lock.js - Atomic file writing with locking for multi-agent safety
 *
 * FAIL-OPEN SEMANTICS:
 * ====================
 * This module prioritizes availability over strict consistency.
 * On lock contention, timeout, or errors, operations proceed
 * with best-effort semantics rather than blocking or crashing.
 *
 * USAGE:
 * ======
 * // Simple atomic JSON write
 * atomicWriteJSON('docs/09-agents/status.json', { stories: {...} });
 *
 * // Read-modify-write (handles concurrency gracefully)
 * atomicReadModifyWrite('docs/09-agents/status.json', (data) => {
 *   data.stories['US-0040'].status = 'in-review';
 *   return data;
 * });
 *
 * // Manual lock management (use for complex sequences)
 * const lock = acquireLock('docs/09-agents/status.json');
 * if (lock.acquired) {
 *   try {
 *     // ... do work ...
 *   } finally {
 *     releaseLock(lock.lockPath);
 *   }
 * }
 *
 * IMPLEMENTATION:
 * ===============
 * Lock file + temp file + rename pattern for atomic writes:
 * 1. Create lock file (filePath + '.lock') with PID
 * 2. If lock exists, check if PID is alive. If stale, remove and retry.
 * 3. Write to temp file (filePath + '.tmp.' + random)
 * 4. Rename temp to target (atomic on POSIX)
 * 5. Remove lock file
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
// Inline colors (no external dependency)
const c = {
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

// Default timeout for lock acquisition
const DEFAULT_LOCK_TIMEOUT_MS = 5000;

// Retry configuration
const LOCK_RETRY_INTERVAL_MS = 50;
const MAX_LOCK_RETRIES = Math.ceil(DEFAULT_LOCK_TIMEOUT_MS / LOCK_RETRY_INTERVAL_MS);

/**
 * Check if a process with given PID is alive
 * Uses process.kill(pid, 0) which is safe (sends no signal, just checks existence)
 *
 * @param {number} pid - Process ID
 * @returns {boolean} True if process exists
 * @private
 */
function isPidAlive(pid) {
  if (typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
    return false;
  }
  try {
    // process.kill with signal 0 checks if process exists without sending a signal
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH = no such process, EPERM = process exists but no permission
    return e.code === 'EPERM';
  }
}

/**
 * Acquire a lock file for a given file path
 * Returns immediately with success/failure - does not wait on lock contention
 *
 * @param {string} filePath - File to lock
 * @param {number} [timeoutMs=5000] - Timeout in milliseconds
 * @returns {{ acquired: boolean, lockPath: string, error?: string }}
 * @public
 */
function acquireLock(filePath, timeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {
  try {
    const lockPath = filePath + '.lock';
    const startTime = Date.now();
    let retries = 0;

    while (retries < MAX_LOCK_RETRIES) {
      try {
        // Try to create lock file exclusively
        // fs.openSync with 'wx' flag fails if file exists
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, `${process.pid}\n`);
        fs.closeSync(fd);

        return {
          acquired: true,
          lockPath: lockPath,
        };
      } catch (e) {
        if (e.code !== 'EEXIST') {
          // Real error (not lock contention)
          return {
            acquired: false,
            lockPath: lockPath,
            error: `Failed to create lock: ${e.message}`,
          };
        }

        // Lock file exists - check if PID is alive
        try {
          const lockContent = fs.readFileSync(lockPath, 'utf8').trim();
          const lockPid = parseInt(lockContent, 10);

          if (isNaN(lockPid)) {
            // Corrupted lock file - try to remove and retry
            try {
              fs.unlinkSync(lockPath);
            } catch (unlinkErr) {
              // Ignore unlink errors
            }
          } else if (!isPidAlive(lockPid)) {
            // PID is stale - remove lock and retry
            try {
              fs.unlinkSync(lockPath);
            } catch (unlinkErr) {
              // Ignore unlink errors
            }
          } else {
            // Lock is held by live process
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
              return {
                acquired: false,
                lockPath: lockPath,
                error: `Lock timeout after ${timeoutMs}ms (held by PID ${lockPid})`,
              };
            }

            // Wait and retry
            const delay = Math.min(LOCK_RETRY_INTERVAL_MS, 10 + Math.random() * 40);
            const now = Date.now();
            while (Date.now() - now < delay) {
              // Busy-wait for short delays (avoid complexity of setTimeout)
            }
          }
        } catch (readErr) {
          // Could not read lock file - assume stale, retry
        }
      }

      retries++;
    }

    // Timeout reached
    return {
      acquired: false,
      lockPath: lockPath,
      error: `Could not acquire lock within ${timeoutMs}ms`,
    };
  } catch (e) {
    // Unexpected error - fail open
    return {
      acquired: false,
      lockPath: filePath + '.lock',
      error: `Unexpected error: ${e.message}`,
    };
  }
}

/**
 * Release a lock file
 * Best-effort - does not throw on errors
 *
 * @param {string} lockPath - Path to lock file (from acquireLock result)
 * @returns {boolean} True if lock was removed, false if already gone or error
 * @public
 */
function releaseLock(lockPath) {
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      return true;
    }
    return true; // Already gone is success
  } catch (e) {
    // Fail open - don't throw
    return false;
  }
}

/**
 * Generate random string for temp file
 * @returns {string} Random hex string
 * @private
 */
function generateRandomSuffix() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Write JSON data atomically to a file
 * Uses temp file + rename pattern for safety
 *
 * @param {string} filePath - Target file path
 * @param {object} data - Data to write
 * @param {object} [options={}] - Options
 * @param {boolean} [options.force=false] - Skip lock (for non-critical files)
 * @param {number} [options.lockTimeoutMs=5000] - Lock timeout
 * @returns {{ success: boolean, error?: string }}
 * @public
 */
function atomicWriteJSON(filePath, data, options = {}) {
  const { force = false, lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS } = options;

  try {
    const dir = path.dirname(filePath);
    const tempPath = filePath + '.tmp.' + generateRandomSuffix();
    const lock = force ? null : acquireLock(filePath, lockTimeoutMs);

    if (!force && !lock.acquired) {
      // Fall back to direct write without lock
      // Log warning in dim text to not clutter output
      if (process.stderr && process.stderr.isTTY) {
        process.stderr.write(
          `${c.dim}[file-lock] Write without lock: ${path.basename(filePath)}${c.reset}\n`
        );
      }
    }

    try {
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to temp file
      const jsonStr = JSON.stringify(data, null, 2) + '\n';
      fs.writeFileSync(tempPath, jsonStr, 'utf8');

      // Atomic rename
      fs.renameSync(tempPath, filePath);

      return { success: true };
    } finally {
      // Clean up temp file if rename failed
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Release lock
      if (!force && lock && lock.acquired) {
        releaseLock(lock.lockPath);
      }
    }
  } catch (e) {
    // Fail open - return error but don't throw
    return {
      success: false,
      error: e.message,
    };
  }
}

/**
 * Read, modify, and write JSON file atomically
 * Handles concurrent access gracefully with retry logic
 *
 * @param {string} filePath - Target file path
 * @param {function} modifyFn - Function that takes data, returns modified data
 * @param {object} [options={}] - Options
 * @param {number} [options.lockTimeoutMs=5000] - Lock timeout
 * @param {number} [options.maxRetries=3] - Max retries on write conflict
 * @returns {{ success: boolean, data?: object, error?: string }}
 * @public
 */
function atomicReadModifyWrite(filePath, modifyFn, options = {}) {
  const { lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS, maxRetries = 3 } = options;

  try {
    let retries = 0;

    while (retries < maxRetries) {
      const lock = acquireLock(filePath, lockTimeoutMs);

      if (!lock.acquired) {
        // Could not acquire lock - fail open and return last known good data
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          return {
            success: false,
            data: data,
            error: `Could not acquire lock (${lock.error || 'unknown'}), returning last known good data`,
          };
        }

        return {
          success: false,
          error: `Could not acquire lock: ${lock.error || 'unknown'}`,
        };
      }

      try {
        // Read current data
        if (!fs.existsSync(filePath)) {
          return {
            success: false,
            error: `File does not exist: ${filePath}`,
          };
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        // Apply modification
        const modifiedData = modifyFn(data);

        // Write atomically
        const dir = path.dirname(filePath);
        const tempPath = filePath + '.tmp.' + generateRandomSuffix();

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write to temp
        const jsonStr = JSON.stringify(modifiedData, null, 2) + '\n';
        fs.writeFileSync(tempPath, jsonStr, 'utf8');

        // Atomic rename
        fs.renameSync(tempPath, filePath);

        return { success: true, data: modifiedData };
      } catch (e) {
        // Clean up temp file if it exists
        const tempPath = filePath + '.tmp.' + generateRandomSuffix();
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
        }

        throw e;
      } finally {
        // Release lock
        if (lock && lock.acquired) {
          releaseLock(lock.lockPath);
        }
      }
    }

    return {
      success: false,
      error: `Max retries (${maxRetries}) exceeded`,
    };
  } catch (e) {
    // Fail open - return error but don't throw
    return {
      success: false,
      error: e.message,
    };
  }
}

// Export public API
module.exports = {
  acquireLock,
  releaseLock,
  atomicWriteJSON,
  atomicReadModifyWrite,

  // For testing only
  _generateRandomSuffix: generateRandomSuffix,
  _isPidAlive: isPidAlive,
};
