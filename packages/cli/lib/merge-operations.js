/**
 * merge-operations.js - Session merge and conflict resolution
 *
 * Provides merge checking, smart conflict resolution, and change management operations.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync, spawnSync } = require('child_process');

const { getProjectRoot, getAgileflowDir } = require('./paths');
const { getMainBranch, getCurrentBranch, gitCache } = require('./git-operations');

const ROOT = getProjectRoot();
const SESSIONS_DIR = path.join(getAgileflowDir(ROOT), 'sessions');

/**
 * Check if session branch is mergeable to main
 * @param {string} sessionId - Session ID
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Mergeability result
 */
function checkMergeability(sessionId, loadRegistry) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot merge main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Check for uncommitted changes in the session worktree
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: session.path,
    encoding: 'utf8',
  });

  if (statusResult.stdout && statusResult.stdout.trim()) {
    return {
      success: true,
      mergeable: false,
      reason: 'uncommitted_changes',
      details: statusResult.stdout.trim(),
      branchName,
      mainBranch,
    };
  }

  // Check if branch has commits ahead of main
  const aheadBehind = spawnSync(
    'git',
    ['rev-list', '--left-right', '--count', `${mainBranch}...${branchName}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );

  const [behind, ahead] = (aheadBehind.stdout || '0\t0').trim().split('\t').map(Number);

  if (ahead === 0) {
    return {
      success: true,
      mergeable: false,
      reason: 'no_changes',
      details: 'Branch has no commits ahead of main',
      branchName,
      mainBranch,
      commitsAhead: 0,
      commitsBehind: behind,
    };
  }

  // Try merge --no-commit --no-ff to check for conflicts (dry run)
  const currentBranch = getCurrentBranch();

  // Checkout main in ROOT for the test merge
  const checkoutMain = spawnSync('git', ['checkout', mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkoutMain.status !== 0) {
    return {
      success: false,
      error: `Failed to checkout ${mainBranch}: ${checkoutMain.stderr}`,
    };
  }

  // Try the merge
  const testMerge = spawnSync('git', ['merge', '--no-commit', '--no-ff', branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const hasConflicts = testMerge.status !== 0;

  // Abort the test merge
  spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });

  // Go back to original branch if different
  if (currentBranch && currentBranch !== mainBranch) {
    spawnSync('git', ['checkout', currentBranch], { cwd: ROOT, encoding: 'utf8' });
  }

  return {
    success: true,
    mergeable: !hasConflicts,
    branchName,
    mainBranch,
    commitsAhead: ahead,
    commitsBehind: behind,
    hasConflicts,
    conflictDetails: hasConflicts ? testMerge.stderr : null,
  };
}

/**
 * Get merge preview (commits and files to be merged)
 * @param {string} sessionId - Session ID
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Preview result
 */
function getMergePreview(sessionId, loadRegistry) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot preview merge for main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Get commits that would be merged
  const logResult = spawnSync('git', ['log', '--oneline', `${mainBranch}..${branchName}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const commits = (logResult.stdout || '').trim().split('\n').filter(Boolean);

  // Get files changed
  const diffResult = spawnSync('git', ['diff', '--name-status', `${mainBranch}...${branchName}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const filesChanged = (diffResult.stdout || '').trim().split('\n').filter(Boolean);

  return {
    success: true,
    branchName,
    mainBranch,
    nickname: session.nickname,
    commits,
    commitCount: commits.length,
    filesChanged,
    fileCount: filesChanged.length,
  };
}

/**
 * Execute merge operation
 * @param {string} sessionId - Session ID
 * @param {Object} options - Merge options
 * @param {Function} loadRegistry - Registry loader function
 * @param {Function} saveRegistry - Registry saver function
 * @param {Function} removeLock - Lock remover function
 * @returns {Object} Merge result
 */
function integrateSession(sessionId, options = {}, loadRegistry, saveRegistry, removeLock) {
  const {
    strategy = 'squash',
    deleteBranch = true,
    deleteWorktree = true,
    message = null,
  } = options;

  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot merge main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Ensure we're on main branch in ROOT
  const checkoutMain = spawnSync('git', ['checkout', mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkoutMain.status !== 0) {
    return { success: false, error: `Failed to checkout ${mainBranch}: ${checkoutMain.stderr}` };
  }

  // Pull latest main (optional, for safety) - ignore errors for local-only repos
  spawnSync('git', ['pull', '--ff-only'], { cwd: ROOT, encoding: 'utf8' });

  // Build commit message
  const commitMessage =
    message ||
    `Merge session ${sessionId}${session.nickname ? ` "${session.nickname}"` : ''}: ${branchName}`;

  // Execute merge based on strategy
  let mergeResult;

  if (strategy === 'squash') {
    mergeResult = spawnSync('git', ['merge', '--squash', branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    if (mergeResult.status === 0) {
      // Create the squash commit
      const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
        cwd: ROOT,
        encoding: 'utf8',
      });

      if (commitResult.status !== 0) {
        return { success: false, error: `Failed to create squash commit: ${commitResult.stderr}` };
      }
    }
  } else {
    // Regular merge commit
    mergeResult = spawnSync('git', ['merge', '--no-ff', '-m', commitMessage, branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }

  if (mergeResult.status !== 0) {
    // Abort if merge failed
    spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });
    return { success: false, error: `Merge failed: ${mergeResult.stderr}`, hasConflicts: true };
  }

  const result = {
    success: true,
    merged: true,
    strategy,
    branchName,
    mainBranch,
    commitMessage,
    mainPath: ROOT,
  };

  // Write merge notification for other sessions to pick up
  try {
    const notifyDir = path.join(getAgileflowDir(ROOT), 'sessions');
    if (!fs.existsSync(notifyDir)) {
      fs.mkdirSync(notifyDir, { recursive: true });
    }
    const notifyPath = path.join(notifyDir, 'last-merge.json');
    fs.writeFileSync(
      notifyPath,
      JSON.stringify(
        {
          merged_at: new Date().toISOString(),
          session_id: sessionId,
          branch: branchName,
          strategy,
          commit_message: commitMessage,
        },
        null,
        2
      )
    );
  } catch (e) {
    /* ignore notification write failures */
  }

  // Delete worktree first (before branch, as worktree holds ref)
  if (deleteWorktree && session.path !== ROOT && fs.existsSync(session.path)) {
    try {
      execFileSync('git', ['worktree', 'remove', session.path], { cwd: ROOT, encoding: 'utf8' });
      result.worktreeDeleted = true;
    } catch (e) {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', session.path], {
          cwd: ROOT,
          encoding: 'utf8',
        });
        result.worktreeDeleted = true;
      } catch (e2) {
        result.worktreeDeleted = false;
        result.worktreeError = e2.message;
      }
    }
  }

  // Delete branch if requested
  if (deleteBranch) {
    const deleteBranchResult = spawnSync('git', ['branch', '-d', branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    result.branchDeleted = deleteBranchResult.status === 0;
    if (!result.branchDeleted) {
      // Try force delete if normal delete fails
      const forceDelete = spawnSync('git', ['branch', '-D', branchName], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      result.branchDeleted = forceDelete.status === 0;
    }
  }

  // Remove from registry
  removeLock(sessionId);
  delete registry.sessions[sessionId];
  saveRegistry(registry);

  return result;
}

/**
 * Generate auto commit message for session
 * @param {Object} session - Session object
 * @returns {string} Generated commit message
 */
function generateCommitMessage(session) {
  const nickname = session.nickname || `session-${session.id || 'unknown'}`;
  const branch = session.branch || 'unknown';
  return `chore: commit uncommitted changes from ${nickname}\n\nBranch: ${branch}`;
}

/**
 * Commit all changes in session worktree
 * @param {string} sessionId - Session ID
 * @param {Object} options - Options including message
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Commit result
 */
function commitChanges(sessionId, options = {}, loadRegistry) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (!fs.existsSync(session.path)) {
    return { success: false, error: `Session directory not found: ${session.path}` };
  }

  // Stage all changes
  const addResult = spawnSync('git', ['add', '-A'], {
    cwd: session.path,
    encoding: 'utf8',
  });

  if (addResult.status !== 0) {
    return { success: false, error: `Failed to stage changes: ${addResult.stderr}` };
  }

  // Generate commit message if not provided
  const message = options.message || generateCommitMessage({ ...session, id: sessionId });

  // Create commit
  const commitResult = spawnSync('git', ['commit', '-m', message], {
    cwd: session.path,
    encoding: 'utf8',
  });

  if (commitResult.status !== 0) {
    // Check if nothing to commit (all changes already staged/committed)
    if (commitResult.stdout && commitResult.stdout.includes('nothing to commit')) {
      return { success: true, message: 'No changes to commit', commitHash: null };
    }
    return {
      success: false,
      error: `Failed to commit: ${commitResult.stderr || commitResult.stdout}`,
    };
  }

  // Get commit hash
  const hashResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: session.path,
    encoding: 'utf8',
  });

  return {
    success: true,
    commitHash: hashResult.stdout?.trim(),
    message,
  };
}

/**
 * Stash changes in session worktree
 * @param {string} sessionId - Session ID
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Stash result
 */
function stashChanges(sessionId, loadRegistry) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (!fs.existsSync(session.path)) {
    return { success: false, error: `Session directory not found: ${session.path}` };
  }

  const stashMsg = `AgileFlow: session ${sessionId} merge prep`;
  const result = spawnSync('git', ['stash', 'push', '-m', stashMsg], {
    cwd: session.path,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return { success: false, error: `Failed to stash: ${result.stderr}` };
  }

  // Check if stash was actually created (might be "No local changes to save")
  if (result.stdout && result.stdout.includes('No local changes to save')) {
    return { success: true, message: 'No changes to stash', stashCreated: false };
  }

  return { success: true, message: stashMsg, stashCreated: true };
}

/**
 * Unstash changes (pop stash)
 * @param {string} sessionId - Session ID (for error messages)
 * @returns {Object} Unstash result
 */
function unstashChanges(sessionId) {
  // Note: After merge, the session worktree is deleted. Stash is popped on main.
  const result = spawnSync('git', ['stash', 'pop'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    // Check if no stash exists
    if (result.stderr && result.stderr.includes('No stash entries found')) {
      return { success: true, message: 'No stash to pop' };
    }
    return { success: false, error: `Failed to unstash: ${result.stderr}` };
  }

  return { success: true };
}

/**
 * Discard all uncommitted changes in session worktree
 * @param {string} sessionId - Session ID
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Discard result
 */
function discardChanges(sessionId, loadRegistry) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (!fs.existsSync(session.path)) {
    return { success: false, error: `Session directory not found: ${session.path}` };
  }

  // Reset staged changes
  spawnSync('git', ['reset', 'HEAD'], {
    cwd: session.path,
    encoding: 'utf8',
  });

  // Discard working directory changes
  const checkoutResult = spawnSync('git', ['checkout', '--', '.'], {
    cwd: session.path,
    encoding: 'utf8',
  });

  if (checkoutResult.status !== 0) {
    return { success: false, error: `Failed to discard changes: ${checkoutResult.stderr}` };
  }

  return { success: true };
}

/**
 * Categorize a file by type for merge strategy selection.
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
 * Get merge strategy for a file category.
 * @param {string} category - File category
 * @returns {Object} Strategy info with strategy, gitStrategy, description
 */
function getMergeStrategy(category) {
  const strategies = {
    docs: {
      strategy: 'accept_both',
      gitStrategy: 'union',
      description: 'Documentation is additive - both changes kept',
    },
    test: {
      strategy: 'accept_both',
      gitStrategy: 'union',
      description: 'Tests are additive - both test files kept',
    },
    schema: {
      strategy: 'take_theirs',
      gitStrategy: 'theirs',
      description: 'Schemas evolve forward - session version used',
    },
    config: {
      strategy: 'merge_keys',
      gitStrategy: 'ours',
      description: 'Config changes need review - main version kept',
    },
    source: {
      strategy: 'intelligent_merge',
      gitStrategy: 'recursive',
      description: 'Source code merged by git recursive strategy',
    },
  };

  return strategies[category] || strategies.source;
}

/**
 * Get list of files that would conflict during merge.
 * @param {string} sessionId - Session ID
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Conflicting files result
 */
function getConflictingFiles(sessionId, loadRegistry) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Get files changed in both branches since divergence
  const mergeBase = spawnSync('git', ['merge-base', mainBranch, branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (mergeBase.status !== 0) {
    return { success: false, error: 'Could not find merge base' };
  }

  const base = mergeBase.stdout.trim();

  // Files changed in main since base
  const mainFiles = spawnSync('git', ['diff', '--name-only', base, mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // Files changed in session branch since base
  const branchFiles = spawnSync('git', ['diff', '--name-only', base, branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const mainSet = new Set((mainFiles.stdout || '').trim().split('\n').filter(Boolean));
  const branchSet = new Set((branchFiles.stdout || '').trim().split('\n').filter(Boolean));

  // Find intersection (files changed in both)
  const conflicting = [...mainSet].filter(f => branchSet.has(f));

  return { success: true, files: conflicting };
}

/**
 * Resolve a single file conflict using the designated strategy.
 * @param {Object} resolution - Resolution info from categorization
 * @returns {Object} Resolution result
 */
function resolveConflict(resolution) {
  const { file, gitStrategy } = resolution;

  try {
    switch (gitStrategy) {
      case 'union':
        // Union merge - concatenate both versions
        try {
          const base = spawnSync('git', ['show', `:1:${file}`], { cwd: ROOT, encoding: 'utf8' });
          const ours = spawnSync('git', ['show', `:2:${file}`], { cwd: ROOT, encoding: 'utf8' });
          const theirs = spawnSync('git', ['show', `:3:${file}`], { cwd: ROOT, encoding: 'utf8' });

          if (base.status === 0 && ours.status === 0 && theirs.status === 0) {
            const tmpBase = path.join(ROOT, '.git', 'MERGE_BASE_TMP');
            const tmpOurs = path.join(ROOT, '.git', 'MERGE_OURS_TMP');
            const tmpTheirs = path.join(ROOT, '.git', 'MERGE_THEIRS_TMP');

            fs.writeFileSync(tmpBase, base.stdout);
            fs.writeFileSync(tmpOurs, ours.stdout);
            fs.writeFileSync(tmpTheirs, theirs.stdout);

            spawnSync('git', ['merge-file', '--union', tmpOurs, tmpBase, tmpTheirs], {
              cwd: ROOT,
              encoding: 'utf8',
            });

            fs.copyFileSync(tmpOurs, path.join(ROOT, file));

            fs.unlinkSync(tmpBase);
            fs.unlinkSync(tmpOurs);
            fs.unlinkSync(tmpTheirs);
          } else {
            execFileSync('git', ['checkout', '--theirs', '--', file], {
              cwd: ROOT,
              encoding: 'utf8',
            });
          }
        } catch (unionError) {
          execFileSync('git', ['checkout', '--theirs', '--', file], {
            cwd: ROOT,
            encoding: 'utf8',
          });
        }
        break;

      case 'theirs':
        execFileSync('git', ['checkout', '--theirs', '--', file], { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'ours':
        execFileSync('git', ['checkout', '--ours', '--', file], { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'recursive':
      default:
        execFileSync('git', ['checkout', '--theirs', '--', file], { cwd: ROOT, encoding: 'utf8' });
        break;
    }

    execFileSync('git', ['add', '--', file], { cwd: ROOT, encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Save merge log for audit trail.
 * @param {Object} log - Merge log entry
 */
function saveMergeLog(log) {
  const logPath = path.join(SESSIONS_DIR, 'merge-log.json');

  let logs = { merges: [] };
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      // Start fresh
    }
  }

  logs.merges.push(log);

  // Keep only last 50 merges
  if (logs.merges.length > 50) {
    logs.merges = logs.merges.slice(-50);
  }

  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

/**
 * Get merge history from audit log.
 * @returns {Object} Merge history result
 */
function getMergeHistory() {
  const logPath = path.join(SESSIONS_DIR, 'merge-log.json');

  if (!fs.existsSync(logPath)) {
    return { success: true, merges: [] };
  }

  try {
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    return { success: true, merges: logs.merges || [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Smart merge with automatic conflict resolution.
 * @param {string} sessionId - Session ID
 * @param {Object} options - Merge options
 * @param {Function} loadRegistry - Registry loader
 * @param {Function} saveRegistry - Registry saver
 * @param {Function} removeLock - Lock remover
 * @param {Function} unregisterSession - Session unregisterer
 * @returns {Object} Smart merge result
 */
function smartMerge(
  sessionId,
  options = {},
  loadRegistry,
  saveRegistry,
  removeLock,
  unregisterSession
) {
  const { c } = require('./colors');
  const {
    strategy = 'squash',
    deleteBranch = true,
    deleteWorktree = true,
    message = null,
  } = options;

  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot merge main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // First, try normal merge
  const checkResult = checkMergeability(sessionId, loadRegistry);
  if (!checkResult.success) {
    return checkResult;
  }

  // If no conflicts, use regular merge
  if (!checkResult.hasConflicts) {
    return integrateSession(sessionId, options, loadRegistry, saveRegistry, removeLock);
  }

  // We have conflicts - try smart resolution
  console.log(`${c.amber}Conflicts detected - attempting auto-resolution...${c.reset}`);

  // Get list of conflicting files
  const conflictFiles = getConflictingFiles(sessionId, loadRegistry);
  if (!conflictFiles.success) {
    return conflictFiles;
  }

  // Categorize and plan resolutions
  const resolutions = conflictFiles.files.map(file => {
    const category = categorizeFile(file);
    const strategyInfo = getMergeStrategy(category);
    return {
      file,
      category,
      ...strategyInfo,
    };
  });

  // Log merge audit
  const mergeLog = {
    session: sessionId,
    started_at: new Date().toISOString(),
    files_to_resolve: resolutions,
  };

  // Ensure we're on main branch
  const checkoutMain = spawnSync('git', ['checkout', mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkoutMain.status !== 0) {
    return { success: false, error: `Failed to checkout ${mainBranch}: ${checkoutMain.stderr}` };
  }

  // Start the merge
  const startMerge = spawnSync('git', ['merge', '--no-commit', '--no-ff', branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // If merge started but has conflicts, resolve them
  if (startMerge.status !== 0) {
    const resolvedFiles = [];
    const unresolvedFiles = [];

    for (const resolution of resolutions) {
      const resolveResult = resolveConflict(resolution);
      if (resolveResult.success) {
        resolvedFiles.push({
          file: resolution.file,
          strategy: resolution.strategy,
          description: resolution.description,
        });
      } else {
        unresolvedFiles.push({
          file: resolution.file,
          error: resolveResult.error,
        });
      }
    }

    // If any files couldn't be resolved, abort
    if (unresolvedFiles.length > 0) {
      spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });
      return {
        success: false,
        error: 'Some conflicts could not be auto-resolved',
        autoResolved: resolvedFiles,
        unresolved: unresolvedFiles,
        hasConflicts: true,
      };
    }

    // All conflicts resolved - commit the merge
    const commitMessage =
      message ||
      `Merge session ${sessionId}${session.nickname ? ` "${session.nickname}"` : ''}: ${branchName} (auto-resolved)`;

    // Stage all resolved files
    spawnSync('git', ['add', '-A'], { cwd: ROOT, encoding: 'utf8' });

    // Create commit
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    if (commitResult.status !== 0) {
      spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });
      return { success: false, error: `Failed to commit merge: ${commitResult.stderr}` };
    }

    // Log successful merge
    mergeLog.merged_at = new Date().toISOString();
    mergeLog.files_auto_resolved = resolvedFiles;
    mergeLog.commits_merged = checkResult.commitsAhead;
    saveMergeLog(mergeLog);

    const result = {
      success: true,
      merged: true,
      autoResolved: resolvedFiles,
      strategy,
      branchName,
      mainBranch,
      commitMessage,
      mainPath: ROOT,
    };

    // Cleanup worktree and branch
    if (deleteWorktree && session.path !== ROOT && fs.existsSync(session.path)) {
      try {
        execFileSync('git', ['worktree', 'remove', session.path], { cwd: ROOT, encoding: 'utf8' });
        result.worktreeDeleted = true;
      } catch (e) {
        try {
          execFileSync('git', ['worktree', 'remove', '--force', session.path], {
            cwd: ROOT,
            encoding: 'utf8',
          });
          result.worktreeDeleted = true;
        } catch (e2) {
          result.worktreeDeleted = false;
        }
      }
    }

    if (deleteBranch) {
      try {
        execFileSync('git', ['branch', '-D', branchName], { cwd: ROOT, encoding: 'utf8' });
        result.branchDeleted = true;
      } catch (e) {
        result.branchDeleted = false;
      }
    }

    // Unregister the session
    unregisterSession(sessionId);

    return result;
  }

  // Merge succeeded without conflicts
  const commitMessage =
    message ||
    `Merge session ${sessionId}${session.nickname ? ` "${session.nickname}"` : ''}: ${branchName}`;

  const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (commitResult.status !== 0) {
    return { success: false, error: `Failed to commit: ${commitResult.stderr}` };
  }

  return {
    success: true,
    merged: true,
    strategy,
    branchName,
    mainBranch,
    commitMessage,
  };
}

module.exports = {
  // Merge checks
  checkMergeability,
  getMergePreview,
  // Merge execution
  integrateSession,
  generateCommitMessage,
  // Changes handling
  commitChanges,
  stashChanges,
  unstashChanges,
  discardChanges,
  // Smart merge
  categorizeFile,
  getMergeStrategy,
  smartMerge,
  getConflictingFiles,
  resolveConflict,
  // Merge history
  saveMergeLog,
  getMergeHistory,
};
