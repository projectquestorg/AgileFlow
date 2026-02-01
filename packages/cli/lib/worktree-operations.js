/**
 * worktree-operations.js - Git worktree creation and management
 *
 * Provides worktree creation with timeout, cleanup, and thread type detection.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const { getProjectRoot } = require('./paths');

const ROOT = getProjectRoot();

// Thread type enum values
const THREAD_TYPES = ['base', 'parallel', 'chained', 'fusion', 'big', 'long'];

// Default worktree timeout (2 minutes)
const DEFAULT_WORKTREE_TIMEOUT_MS = 120000;

/**
 * Check if a directory is a git worktree (not the main repo).
 * In a worktree, .git is a file pointing to the main repo's .git/worktrees/<name>
 * In the main repo, .git is a directory.
 *
 * @param {string} dir - Directory to check
 * @returns {boolean} True if dir is a git worktree
 */
function isGitWorktree(dir) {
  const gitPath = path.join(dir, '.git');
  try {
    const stat = fs.lstatSync(gitPath);
    // In a worktree, .git is a file containing "gitdir: /path/to/main/.git/worktrees/<name>"
    // In the main repo, .git is a directory
    return stat.isFile();
  } catch (e) {
    // .git doesn't exist - not a git repo at all
    return false;
  }
}

/**
 * Auto-detect thread type from context
 * @param {Object} session - Session object
 * @param {boolean} [isWorktree=false] - Whether this is a worktree
 * @returns {string} Thread type
 */
function detectThreadType(session, isWorktree = false) {
  // Worktree sessions are parallel threads
  if (isWorktree || (session && !session.is_main)) {
    return 'parallel';
  }
  // Default to base
  return 'base';
}

/**
 * Display progress feedback during long operations.
 * Returns a function to stop the progress indicator.
 *
 * @param {string} message - Progress message
 * @returns {function} Stop function
 */
function progressIndicator(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let elapsed = 0;

  // For TTY (interactive terminal), show spinner
  if (process.stderr.isTTY) {
    const interval = setInterval(() => {
      process.stderr.write(`\r${frames[frameIndex++ % frames.length]} ${message}`);
    }, 80);
    return () => {
      clearInterval(interval);
      process.stderr.write(`\r${' '.repeat(message.length + 2)}\r`);
    };
  }

  // For non-TTY (Claude Code, piped output), emit periodic updates to stderr
  process.stderr.write(`⏳ ${message}...\n`);
  const interval = setInterval(() => {
    elapsed += 10;
    process.stderr.write(`⏳ Still working... (${elapsed}s elapsed)\n`);
  }, 10000); // Update every 10 seconds

  return () => {
    clearInterval(interval);
  };
}

/**
 * Create a git worktree with timeout and progress feedback.
 * Uses async spawn instead of spawnSync for timeout support.
 *
 * @param {string} worktreePath - Path for the new worktree
 * @param {string} branchName - Branch name for the worktree
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function createWorktreeWithTimeout(
  worktreePath,
  branchName,
  timeoutMs = DEFAULT_WORKTREE_TIMEOUT_MS
) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn('git', ['worktree', 'add', worktreePath, branchName], {
      cwd: ROOT,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      // Give it a moment to terminate gracefully, then SIGKILL
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch (e) {
          // Process may have already exited
        }
      }, 1000);
    }, timeoutMs);

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(
          new Error(
            `Worktree creation timed out after ${timeoutMs / 1000}s. Try increasing timeout or check disk space.`
          )
        );
        return;
      }

      if (signal) {
        reject(new Error(`Worktree creation was terminated by signal: ${signal}`));
        return;
      }

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Failed to create worktree: ${stderr || 'unknown error'}`));
      }
    });
  });
}

/**
 * Clean up partial state after failed worktree creation.
 * Removes partial directory and prunes git worktree registry.
 *
 * @param {string} worktreePath - Path of the failed worktree
 * @param {string} branchName - Branch name that was being used
 * @param {boolean} branchCreatedByUs - Whether we created the branch
 */
function cleanupFailedWorktree(worktreePath, branchName, branchCreatedByUs = false) {
  // Remove partial worktree directory if it exists
  if (fs.existsSync(worktreePath)) {
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
      process.stderr.write(`🧹 Cleaned up partial worktree directory\n`);
    } catch (e) {
      process.stderr.write(`⚠️  Could not remove partial directory: ${e.message}\n`);
    }
  }

  // Prune git worktree registry to clean up any references
  try {
    spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    // Non-fatal
  }

  // If we created the branch and the worktree failed, optionally clean up the branch too
  if (branchCreatedByUs) {
    try {
      const result = spawnSync('git', ['branch', '-d', branchName], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      if (result.status === 0) {
        process.stderr.write(`🧹 Cleaned up unused branch: ${branchName}\n`);
      }
    } catch (e) {
      // Non-fatal - branch may have commits or not exist
    }
  }
}

module.exports = {
  // Constants
  THREAD_TYPES,
  DEFAULT_WORKTREE_TIMEOUT_MS,
  // Detection
  isGitWorktree,
  detectThreadType,
  // Progress indicator
  progressIndicator,
  // Worktree management
  createWorktreeWithTimeout,
  cleanupFailedWorktree,
};
