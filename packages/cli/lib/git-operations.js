/**
 * git-operations.js - Git command execution and phase detection
 *
 * Provides cached git operations and session phase detection for Kanban visualization.
 */

const { execFileSync, spawnSync, spawn } = require('child_process');
const fs = require('fs');

const { getProjectRoot } = require('./paths');

const ROOT = getProjectRoot();

// Git command cache (10 second TTL to avoid stale data)
const gitCache = {
  data: new Map(),
  ttlMs: 10000,
  get(key) {
    const entry = this.data.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttlMs) {
      return entry.value;
    }
    this.data.delete(key);
    return null;
  },
  set(key, value) {
    this.data.set(key, { value, timestamp: Date.now() });
  },
  invalidate(key) {
    if (key) {
      this.data.delete(key);
    } else {
      this.data.clear();
    }
  },
};

/**
 * Execute git command asynchronously (Promise-based, non-blocking)
 * @param {string[]} args - Git command arguments
 * @param {string} cwd - Working directory
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function execGitAsync(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data;
    });
    proc.stderr.on('data', data => {
      stderr += data;
    });

    proc.on('error', err => {
      reject(err);
    });

    proc.on('close', code => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

/**
 * Get current git branch (cached for performance)
 * @param {string} [cwd=ROOT] - Working directory
 * @returns {string} Current branch name
 */
function getCurrentBranch(cwd = ROOT) {
  const cacheKey = `branch:${cwd}`;
  const cached = gitCache.get(cacheKey);
  if (cached !== null) return cached;

  try {
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
    gitCache.set(cacheKey, branch);
    return branch;
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Get main branch name (main or master) - cached since it rarely changes
 * @param {string} [cwd=ROOT] - Working directory
 * @returns {string} Main branch name ('main' or 'master')
 */
function getMainBranch(cwd = ROOT) {
  const cacheKey = `mainBranch:${cwd}`;
  const cached = gitCache.get(cacheKey);
  if (cached !== null) return cached;

  const checkMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/main'], {
    cwd,
    encoding: 'utf8',
  });

  if (checkMain.status === 0) {
    gitCache.set(cacheKey, 'main');
    return 'main';
  }

  const checkMaster = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/master'], {
    cwd,
    encoding: 'utf8',
  });

  if (checkMaster.status === 0) {
    gitCache.set(cacheKey, 'master');
    return 'master';
  }

  gitCache.set(cacheKey, 'main');
  return 'main'; // Default fallback
}

// Session phases for Kanban-style visualization
const SESSION_PHASES = {
  TODO: 'todo',
  CODING: 'coding',
  REVIEW: 'review',
  MERGED: 'merged',
};

/**
 * Determine phase from git state (commits and status)
 * @param {number} commits - Number of commits ahead of main
 * @param {boolean} hasUncommittedChanges - Whether there are uncommitted changes
 * @returns {string} Phase constant
 */
function determinePhaseFromGitState(commits, hasUncommittedChanges) {
  if (commits === 0) {
    return SESSION_PHASES.TODO;
  }
  // Has commits - check for uncommitted changes
  return hasUncommittedChanges ? SESSION_PHASES.CODING : SESSION_PHASES.REVIEW;
}

/**
 * Check early-exit conditions for session phase
 * Returns phase if early exit, null if git state check needed
 * @param {Object} session - Session object
 * @returns {string|null} Phase if determinable without git, null otherwise
 */
function getSessionPhaseEarlyExit(session) {
  if (session.merged_at || session.is_main) {
    return SESSION_PHASES.MERGED;
  }
  if (!fs.existsSync(session.path)) {
    return SESSION_PHASES.TODO;
  }
  return null;
}

/**
 * Get session phase synchronously (with caching)
 * @param {Object} session - Session object
 * @returns {string} Phase constant
 */
function getSessionPhase(session) {
  // Early exit checks
  const earlyExit = getSessionPhaseEarlyExit(session);
  if (earlyExit) return earlyExit;

  const sessionPath = session.path;
  const cacheKey = `phase:${sessionPath}`;
  const cached = gitCache.get(cacheKey);
  if (cached !== null) return cached;

  try {
    const mainBranch = getMainBranch(sessionPath);
    let commitCount;
    try {
      commitCount = execFileSync('git', ['rev-list', '--count', `${mainBranch}..HEAD`], {
        cwd: sessionPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      commitCount = '0';
    }
    const commits = parseInt(commitCount, 10);

    let status = '';
    try {
      status = execFileSync('git', ['status', '--porcelain'], {
        cwd: sessionPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // git status failed, treat as no changes
    }

    const phase = determinePhaseFromGitState(commits, status !== '');
    gitCache.set(cacheKey, phase);
    return phase;
  } catch (e) {
    return SESSION_PHASES.CODING;
  }
}

/**
 * Detect session phase asynchronously (non-blocking git calls)
 * @param {Object} session - Session object
 * @returns {Promise<string>} Phase constant
 */
async function getSessionPhaseAsync(session) {
  // Early exit checks (shared with sync version)
  const earlyExit = getSessionPhaseEarlyExit(session);
  if (earlyExit) return earlyExit;

  const sessionPath = session.path;
  const cacheKey = `phase:${sessionPath}`;
  const cached = gitCache.get(cacheKey);
  if (cached !== null) return cached;

  try {
    const mainBranch = getMainBranch(sessionPath);
    const commitResult = await execGitAsync(
      ['rev-list', '--count', `${mainBranch}..HEAD`],
      sessionPath
    );
    const commits = parseInt(commitResult.stdout || '0', 10);

    const statusResult = await execGitAsync(['status', '--porcelain'], sessionPath);

    const phase = determinePhaseFromGitState(commits, statusResult.stdout !== '');
    gitCache.set(cacheKey, phase);
    return phase;
  } catch (e) {
    return SESSION_PHASES.CODING;
  }
}

/**
 * Get phases for multiple sessions in parallel (Promise.all batching)
 * @param {Object[]} sessions - Array of session objects
 * @returns {Promise<Object[]>} Sessions with phase property added
 */
async function getSessionPhasesAsync(sessions) {
  const phasePromises = sessions.map(async session => {
    const phase = await getSessionPhaseAsync(session);
    return { session, phase };
  });

  const results = await Promise.all(phasePromises);

  // Return as array with phase included
  return results.map(({ session, phase }) => ({
    ...session,
    phase,
  }));
}

module.exports = {
  // Git cache
  gitCache,
  // Git command execution
  execGitAsync,
  // Branch operations
  getCurrentBranch,
  getMainBranch,
  // Phase detection
  SESSION_PHASES,
  determinePhaseFromGitState,
  getSessionPhaseEarlyExit,
  getSessionPhase,
  getSessionPhaseAsync,
  getSessionPhasesAsync,
};
