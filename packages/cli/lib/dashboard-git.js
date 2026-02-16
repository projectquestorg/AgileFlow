'use strict';

/**
 * dashboard-git.js - Git Operations for Dashboard
 *
 * Git status, diff, and action handlers used by the dashboard server.
 * Extracted from dashboard-server.js for testability.
 */

// Lazy-loaded dependencies
let _childProcess, _validatePaths;

function getChildProcess() {
  if (!_childProcess) _childProcess = require('child_process');
  return _childProcess;
}
function getValidatePaths() {
  if (!_validatePaths) _validatePaths = require('./validate-paths');
  return _validatePaths;
}

/**
 * Get current git status
 * @param {string} projectRoot - Project root directory
 * @returns {{ branch: string, staged: Array, unstaged: Array }}
 */
function getGitStatus(projectRoot) {
  try {
    const branch = getChildProcess()
      .execFileSync('git', ['branch', '--show-current'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      .trim();

    const statusOutput = getChildProcess().execFileSync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const staged = [];
    const unstaged = [];

    for (const line of statusOutput.split('\n').filter(Boolean)) {
      if (line.length < 4) continue; // Skip malformed lines (need XY + space + filename)
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const file = line.slice(3);

      // Parse the status character to a descriptive status
      const parseStatus = char => {
        switch (char) {
          case 'A':
            return 'added';
          case 'M':
            return 'modified';
          case 'D':
            return 'deleted';
          case 'R':
            return 'renamed';
          case 'C':
            return 'copied';
          case '?':
            return 'untracked';
          default:
            return 'modified';
        }
      };

      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({ path: file, file, status: parseStatus(indexStatus) });
      }
      if (workTreeStatus !== ' ') {
        unstaged.push({
          path: file,
          file,
          status: workTreeStatus === '?' ? 'untracked' : parseStatus(workTreeStatus),
        });
      }
    }

    return { branch, staged, unstaged };
  } catch {
    return { branch: 'unknown', staged: [], unstaged: [] };
  }
}

/**
 * Get diff for a specific file
 * @param {string} filePath - Path to the file
 * @param {string} projectRoot - Project root directory
 * @param {boolean} staged - Whether to get staged diff
 * @returns {string} - The diff content
 */
function getFileDiff(filePath, projectRoot, staged = false) {
  // Validate filePath stays within project root
  const pathResult = getValidatePaths().validatePath(filePath, projectRoot, {
    allowSymlinks: true,
  });
  if (!pathResult.ok) {
    return '';
  }

  try {
    const diffArgs = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];

    const diff = getChildProcess().execFileSync('git', diffArgs, {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    // If no diff, file might be untracked - show entire file content as addition
    if (!diff && !staged) {
      const statusOutput = getChildProcess()
        .execFileSync('git', ['status', '--porcelain', '--', filePath], {
          cwd: projectRoot,
          encoding: 'utf8',
        })
        .trim();

      // Check if file is untracked
      if (statusOutput.startsWith('??')) {
        try {
          const content = require('fs').readFileSync(
            require('path').join(projectRoot, filePath),
            'utf8'
          );
          // Format as a new file diff
          const lines = content.split('\n');
          return [
            `diff --git a/${filePath} b/${filePath}`,
            `new file mode 100644`,
            `--- /dev/null`,
            `+++ b/${filePath}`,
            `@@ -0,0 +1,${lines.length} @@`,
            ...lines.map(line => `+${line}`),
          ].join('\n');
        } catch {
          return '';
        }
      }
    }

    return diff;
  } catch (error) {
    console.error('[Diff Error]', error.message);
    return '';
  }
}

/**
 * Parse diff statistics from diff content
 * @param {string} diff - The diff content
 * @returns {{ additions: number, deletions: number }}
 */
function parseDiffStats(diff) {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Execute a git action (stage, unstage, revert, commit)
 * @param {string} type - Action type (git_stage, git_unstage, git_revert, git_commit)
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Action options
 * @param {string[]} [options.files] - Files to operate on
 * @param {string} [options.commitMessage] - Commit message (for git_commit)
 * @param {Object} protocol - Protocol module reference
 */
function handleGitAction(type, projectRoot, options, protocol) {
  const { files, commitMessage } = options;

  // Validate file paths - reject path traversal attempts
  if (files && files.length > 0) {
    for (const f of files) {
      if (typeof f !== 'string' || f.includes('\0')) {
        throw new Error('Invalid file path');
      }
      const resolved = require('path').resolve(projectRoot, f);
      if (!resolved.startsWith(projectRoot)) {
        throw new Error('File path outside project');
      }
    }
  }

  // Validate commit message
  if (commitMessage !== undefined && commitMessage !== null) {
    if (
      typeof commitMessage !== 'string' ||
      commitMessage.length > 10000 ||
      commitMessage.includes('\0')
    ) {
      throw new Error('Invalid commit message');
    }
  }

  const fileArgs = files && files.length > 0 ? files : null;

  switch (type) {
    case protocol.InboundMessageType.GIT_STAGE:
      if (fileArgs) {
        getChildProcess().execFileSync('git', ['add', '--', ...fileArgs], {
          cwd: projectRoot,
        });
      } else {
        getChildProcess().execFileSync('git', ['add', '-A'], { cwd: projectRoot });
      }
      break;
    case protocol.InboundMessageType.GIT_UNSTAGE:
      if (fileArgs) {
        getChildProcess().execFileSync('git', ['restore', '--staged', '--', ...fileArgs], {
          cwd: projectRoot,
        });
      } else {
        getChildProcess().execFileSync('git', ['restore', '--staged', '.'], {
          cwd: projectRoot,
        });
      }
      break;
    case protocol.InboundMessageType.GIT_REVERT:
      if (fileArgs) {
        getChildProcess().execFileSync('git', ['checkout', '--', ...fileArgs], {
          cwd: projectRoot,
        });
      }
      break;
    case protocol.InboundMessageType.GIT_COMMIT:
      if (commitMessage) {
        getChildProcess().execFileSync('git', ['commit', '-m', commitMessage], {
          cwd: projectRoot,
        });
      }
      break;
  }
}

module.exports = {
  getGitStatus,
  getFileDiff,
  parseDiffStats,
  handleGitAction,
};
