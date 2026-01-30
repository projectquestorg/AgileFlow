#!/usr/bin/env node
/**
 * session-manager.js - Multi-session coordination for Claude Code
 *
 * Manages parallel Claude Code sessions with:
 * - Numbered session IDs (1, 2, 3...)
 * - PID-based liveness detection
 * - Git worktree automation
 * - Registry persistence
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync, spawn } = require('child_process');

// Shared utilities
const { c } = require('../lib/colors');
const {
  getProjectRoot,
  getStatusPath,
  getSessionStatePath,
  getAgileflowDir,
} = require('../lib/paths');
const { safeReadJSON } = require('../lib/errors');
const { isValidBranchName, isValidSessionNickname } = require('../lib/validate');

const { SessionRegistry } = require('../lib/session-registry');

const ROOT = getProjectRoot();
const SESSIONS_DIR = path.join(getAgileflowDir(ROOT), 'sessions');
const REGISTRY_PATH = path.join(SESSIONS_DIR, 'registry.json');

// Injectable registry instance for testing
let _registryInstance = null;

/**
 * Get the registry instance (singleton, injectable for testing)
 * @returns {SessionRegistry}
 */
function getRegistryInstance() {
  if (!_registryInstance) {
    _registryInstance = new SessionRegistry(ROOT);
  }
  return _registryInstance;
}

/**
 * Inject a mock registry for testing
 * @param {SessionRegistry|null} registry - Registry to inject, or null to reset
 */
function injectRegistry(registry) {
  _registryInstance = registry;
}

// Ensure sessions directory exists
function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Load or create registry (uses injectable SessionRegistry)
// Preserves original behavior: saves default registry if file didn't exist
function loadRegistry() {
  const registryInstance = getRegistryInstance();
  const fileExistedBefore = fs.existsSync(registryInstance.registryPath);
  const data = registryInstance.loadSync();

  // If file didn't exist, save the default to disk (original behavior)
  if (!fileExistedBefore) {
    registryInstance.saveSync(data);
  }

  return data;
}

// Save registry (uses injectable SessionRegistry)
function saveRegistry(registryData) {
  const registry = getRegistryInstance();
  return registry.saveSync(registryData);
}

// Check if PID is alive
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Get lock file path for session
function getLockPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.lock`);
}

// Read lock file (sync version for backward compatibility)
function readLock(sessionId) {
  const lockPath = getLockPath(sessionId);
  if (!fs.existsSync(lockPath)) return null;

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const lock = {};
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) lock[key.trim()] = value.trim();
    });
    return lock;
  } catch (e) {
    return null;
  }
}

// Read lock file (async version for parallel operations)
async function readLockAsync(sessionId) {
  const lockPath = getLockPath(sessionId);
  try {
    const content = await fs.promises.readFile(lockPath, 'utf8');
    const lock = {};
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) lock[key.trim()] = value.trim();
    });
    return lock;
  } catch (e) {
    return null;
  }
}

// Write lock file
function writeLock(sessionId, pid) {
  const lockPath = getLockPath(sessionId);
  const content = `pid=${pid}\nstarted=${Math.floor(Date.now() / 1000)}\n`;
  fs.writeFileSync(lockPath, content);
}

// Remove lock file
function removeLock(sessionId) {
  const lockPath = getLockPath(sessionId);
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

// Check if session is active (has lock with alive PID)
function isSessionActive(sessionId) {
  const lock = readLock(sessionId);
  if (!lock || !lock.pid) return false;
  return isPidAlive(parseInt(lock.pid, 10));
}

// Clean up stale locks (with detailed tracking) - sync version for backward compatibility
function cleanupStaleLocks(registry, options = {}) {
  const { verbose = false, dryRun = false } = options;
  let cleaned = 0;
  const cleanedSessions = [];

  for (const [id, session] of Object.entries(registry.sessions)) {
    const lock = readLock(id);
    if (lock) {
      const pid = parseInt(lock.pid, 10);
      const isAlive = isPidAlive(pid);

      if (!isAlive) {
        // Track what we're cleaning and why
        cleanedSessions.push({
          id,
          nickname: session.nickname,
          branch: session.branch,
          pid,
          reason: 'pid_dead',
          path: session.path,
        });

        if (!dryRun) {
          removeLock(id);
        }
        cleaned++;
      }
    }
  }

  // Return detailed info for display
  return { count: cleaned, sessions: cleanedSessions };
}

// Clean up stale locks (async parallel version - faster for many sessions)
async function cleanupStaleLocksAsync(registry, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const cleanedSessions = [];

  const sessionEntries = Object.entries(registry.sessions);
  if (sessionEntries.length === 0) {
    return { count: 0, sessions: [] };
  }

  // Read all locks in parallel
  const lockResults = await Promise.all(
    sessionEntries.map(async ([id, session]) => {
      const lock = await readLockAsync(id);
      return { id, session, lock };
    })
  );

  // Process results (sequential - fast since it's just memory operations)
  for (const { id, session, lock } of lockResults) {
    if (lock) {
      const pid = parseInt(lock.pid, 10);
      const isAlive = isPidAlive(pid);

      if (!isAlive) {
        cleanedSessions.push({
          id,
          nickname: session.nickname,
          branch: session.branch,
          pid,
          reason: 'pid_dead',
          path: session.path,
        });

        if (!dryRun) {
          removeLock(id);
        }
      }
    }
  }

  return { count: cleanedSessions.length, sessions: cleanedSessions };
}

/**
 * Get detailed file information for a session's changes
 * @param {string} sessionPath - Path to session worktree
 * @param {string[]} changes - Array of git status lines
 * @returns {Object[]} Array of file details with analysis
 */
function getFileDetails(sessionPath, changes) {
  return changes.map(change => {
    const status = change.substring(0, 2).trim();
    const file = change.substring(3);

    const detail = { status, file, trivial: false, existsInMain: false, diffLines: 0 };

    // For modified files, get diff stats
    if (status === 'M') {
      try {
        const diffStat = spawnSync('git', ['diff', '--numstat', file], {
          cwd: sessionPath,
          encoding: 'utf8',
          timeout: 3000,
        });
        if (diffStat.stdout) {
          const parts = diffStat.stdout.trim().split('\t');
          const added = parseInt(parts[0], 10) || 0;
          const removed = parseInt(parts[1], 10) || 0;
          detail.diffLines = added + removed;
          // Trivial if only 1-2 lines changed (likely whitespace)
          detail.trivial = detail.diffLines <= 2;
        }
      } catch (e) {
        // Can't get diff, assume not trivial
      }
    }

    // For untracked files, check if exists in main
    if (status === '??') {
      detail.existsInMain = fs.existsSync(path.join(ROOT, file));
      // Trivial if it's a duplicate
      detail.trivial = detail.existsInMain;
    }

    // Config/cache files are trivial
    if (file.includes('.claude/') || file.includes('.agileflow/cache')) {
      detail.trivial = true;
    }

    return detail;
  });
}

/**
 * Get health status for all sessions
 * Detects: stale sessions, uncommitted changes, orphaned entries
 * @param {Object} options - { staleDays: 7, detailed: false }
 * @returns {Object} Health report
 */
function getSessionsHealth(options = {}) {
  const { staleDays = 7, detailed = false } = options;
  const registry = loadRegistry();
  const now = Date.now();
  const staleThreshold = staleDays * 24 * 60 * 60 * 1000;

  const health = {
    stale: [], // Sessions with no activity > staleDays
    uncommitted: [], // Sessions with uncommitted git changes
    orphanedRegistry: [], // Registry entries where path doesn't exist
    orphanedWorktrees: [], // Worktrees not in registry
    healthy: 0,
  };

  // Check each registered session
  for (const [id, session] of Object.entries(registry.sessions)) {
    if (session.is_main) continue; // Skip main session

    const age = now - new Date(session.last_active).getTime();
    const pathExists = fs.existsSync(session.path);

    // Check for orphaned registry entry (path missing)
    if (!pathExists) {
      health.orphanedRegistry.push({ id, ...session, reason: 'path_missing' });
      continue;
    }

    // Check for stale session
    if (age > staleThreshold) {
      health.stale.push({
        id,
        ...session,
        ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
      });
    }

    // Check for uncommitted changes
    try {
      const result = spawnSync('git', ['status', '--porcelain'], {
        cwd: session.path,
        encoding: 'utf8',
        timeout: 5000,
      });
      if (result.stdout && result.stdout.trim()) {
        // Don't use trim() on the whole string - it removes leading space from first status
        // Split by newline and filter empty lines instead
        const changes = result.stdout.split('\n').filter(line => line.length > 0);
        const sessionData = {
          id,
          ...session,
          changeCount: changes.length,
          changes: detailed ? changes : changes.slice(0, 5), // All or first 5
        };

        // Add detailed file analysis if requested
        if (detailed) {
          sessionData.fileDetails = getFileDetails(session.path, changes);
          // Calculate if session is safe to delete (all changes trivial)
          sessionData.allTrivial = sessionData.fileDetails.every(f => f.trivial);
        }

        health.uncommitted.push(sessionData);
      } else {
        health.healthy++;
      }
    } catch (e) {
      // Can't check, skip
    }
  }

  // Check for orphaned worktrees (directories not in registry)
  try {
    const worktreeList = spawnSync('git', ['worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    if (worktreeList.stdout) {
      const worktrees = worktreeList.stdout
        .split('\n')
        .filter(line => line.startsWith('worktree '))
        .map(line => line.replace('worktree ', ''));

      const mainPath = ROOT;
      for (const wtPath of worktrees) {
        const inRegistry = Object.values(registry.sessions).some(s => s.path === wtPath);
        if (!inRegistry && wtPath !== mainPath) {
          // Check if it's an AgileFlow worktree (has .agileflow folder)
          if (fs.existsSync(path.join(wtPath, '.agileflow'))) {
            health.orphanedWorktrees.push({ path: wtPath });
          }
        }
      }
    }
  } catch (e) {
    // Can't list worktrees, skip
  }

  return health;
}

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

// Get current git branch (cached for performance)
function getCurrentBranch() {
  const cacheKey = `branch:${ROOT}`;
  const cached = gitCache.get(cacheKey);
  if (cached !== null) return cached;

  try {
    const branch = execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf8' }).trim();
    gitCache.set(cacheKey, branch);
    return branch;
  } catch (e) {
    return 'unknown';
  }
}

// Get current story from status.json
function getCurrentStory() {
  const statusPath = getStatusPath(ROOT);
  const result = safeReadJSON(statusPath, { defaultValue: null });

  if (!result.ok || !result.data) return null;

  for (const [id, story] of Object.entries(result.data.stories || {})) {
    if (story.status === 'in_progress') {
      return { id, title: story.title };
    }
  }
  return null;
}

// Thread type enum values
const THREAD_TYPES = ['base', 'parallel', 'chained', 'fusion', 'big', 'long'];

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

// Auto-detect thread type from context
function detectThreadType(session, isWorktree = false) {
  // Worktree sessions are parallel threads
  if (isWorktree || (session && !session.is_main)) {
    return 'parallel';
  }
  // Default to base
  return 'base';
}

// Register current session (called on startup)
function registerSession(nickname = null, threadType = null) {
  const registry = loadRegistry();
  const cwd = process.cwd();
  const branch = getCurrentBranch();
  const story = getCurrentStory();
  const pid = process.ppid || process.pid; // Parent PID (Claude Code) or current

  // Check if this path already has a session
  let existingId = null;
  for (const [id, session] of Object.entries(registry.sessions)) {
    if (session.path === cwd) {
      existingId = id;
      break;
    }
  }

  if (existingId) {
    // Update existing session
    registry.sessions[existingId].branch = branch;
    registry.sessions[existingId].story = story ? story.id : null;
    registry.sessions[existingId].last_active = new Date().toISOString();
    if (nickname) registry.sessions[existingId].nickname = nickname;
    // Update thread_type if explicitly provided
    if (threadType && THREAD_TYPES.includes(threadType)) {
      registry.sessions[existingId].thread_type = threadType;
    }

    writeLock(existingId, pid);
    saveRegistry(registry);

    return { id: existingId, isNew: false };
  }

  // Create new session
  const sessionId = String(registry.next_id);
  registry.next_id++;

  // A session is "main" only if it's at the project root AND not a git worktree
  // Worktrees have .git as a file (not directory), pointing to the main repo
  const isMain = cwd === ROOT && !isGitWorktree(cwd);
  const detectedType =
    threadType && THREAD_TYPES.includes(threadType) ? threadType : detectThreadType(null, !isMain);

  registry.sessions[sessionId] = {
    path: cwd,
    branch,
    story: story ? story.id : null,
    nickname: nickname || null,
    created: new Date().toISOString(),
    last_active: new Date().toISOString(),
    is_main: isMain,
    thread_type: detectedType,
  };

  writeLock(sessionId, pid);
  saveRegistry(registry);

  return { id: sessionId, isNew: true, thread_type: detectedType };
}

// Unregister session (called on exit)
function unregisterSession(sessionId) {
  const registry = loadRegistry();

  if (registry.sessions[sessionId]) {
    registry.sessions[sessionId].last_active = new Date().toISOString();
    removeLock(sessionId);
    saveRegistry(registry);
  }
}

// Get session by ID
function getSession(sessionId) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];
  if (!session) {
    return null;
  }
  // Ensure thread_type exists (migration for legacy sessions)
  const threadType = session.thread_type || (session.is_main ? 'base' : 'parallel');
  return {
    id: sessionId,
    ...session,
    thread_type: threadType,
    active: isSessionActive(sessionId),
  };
}

// Default worktree timeout (2 minutes)
const DEFAULT_WORKTREE_TIMEOUT_MS = 120000;

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
  // But only if it has no commits beyond the parent (i.e., we just created it)
  if (branchCreatedByUs) {
    try {
      // Check if branch exists and has no unique commits
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

// Create new session with worktree
async function createSession(options = {}) {
  const registry = loadRegistry();
  const sessionId = String(registry.next_id);
  const projectName = registry.project_name;

  const nickname = options.nickname || null;
  const branchName = options.branch || `session-${sessionId}`;
  const dirName = nickname || sessionId;

  // SECURITY: Validate branch name to prevent command injection
  if (!isValidBranchName(branchName)) {
    return {
      success: false,
      error: `Invalid branch name: "${branchName}". Use only letters, numbers, hyphens, underscores, and forward slashes.`,
    };
  }

  // SECURITY: Validate nickname if provided
  if (nickname && !isValidSessionNickname(nickname)) {
    return {
      success: false,
      error: `Invalid nickname: "${nickname}". Use only letters, numbers, hyphens, and underscores.`,
    };
  }

  const worktreePath = path.resolve(ROOT, '..', `${projectName}-${dirName}`);

  // Check if directory already exists
  if (fs.existsSync(worktreePath)) {
    return {
      success: false,
      error: `Directory already exists: ${worktreePath}`,
    };
  }

  // Create branch if it doesn't exist (using spawnSync for safety)
  const checkRef = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );

  let branchCreatedByUs = false;
  if (checkRef.status !== 0) {
    // Branch doesn't exist, create it
    const createBranch = spawnSync('git', ['branch', branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    if (createBranch.status !== 0) {
      return {
        success: false,
        error: `Failed to create branch: ${createBranch.stderr || 'unknown error'}`,
      };
    }
    branchCreatedByUs = true;
  }

  // Get timeout from options (default: 2 minutes)
  const timeoutMs = options.timeout || DEFAULT_WORKTREE_TIMEOUT_MS;

  // Create worktree with timeout and progress feedback
  const stopProgress = progressIndicator(
    'Creating worktree (this may take a while for large repos)'
  );
  try {
    await createWorktreeWithTimeout(worktreePath, branchName, timeoutMs);
    stopProgress();
    process.stderr.write(`✓ Worktree created successfully\n`);
  } catch (error) {
    stopProgress();
    // Clean up partial state
    cleanupFailedWorktree(worktreePath, branchName, branchCreatedByUs);
    return {
      success: false,
      error: error.message,
    };
  }

  // Copy environment files to new worktree (they don't copy automatically)
  const envFiles = ['.env', '.env.local', '.env.development', '.env.test', '.env.production'];
  const copiedEnvFiles = [];
  for (const envFile of envFiles) {
    const src = path.join(ROOT, envFile);
    const dest = path.join(worktreePath, envFile);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest);
        copiedEnvFiles.push(envFile);
      } catch (e) {
        // Non-fatal: log but continue
        console.warn(`Warning: Could not copy ${envFile}: ${e.message}`);
      }
    }
  }

  // Copy Claude Code and AgileFlow config folders (gitignored contents won't copy with worktree)
  // Note: The folder may exist with some tracked files, but gitignored subfolders (commands/, agents/) won't be there
  const configFoldersToCopy = ['.claude', '.agileflow'];
  const copiedFolders = [];
  for (const folder of configFoldersToCopy) {
    const src = path.join(ROOT, folder);
    const dest = path.join(worktreePath, folder);
    if (fs.existsSync(src)) {
      try {
        // Use force to overwrite existing files, recursive for subdirs
        fs.cpSync(src, dest, { recursive: true, force: true });
        copiedFolders.push(folder);
      } catch (e) {
        // Non-fatal: log but continue
        console.warn(`Warning: Could not copy ${folder}: ${e.message}`);
      }
    }
  }

  // Symlink .agileflow/sessions/ to main project (shared session registry across worktrees)
  // This ensures all sessions see the same registry, preventing is_main bugs and sync issues
  const sessionsSymlinkSrc = path.join(ROOT, '.agileflow', 'sessions');
  const sessionsSymlinkDest = path.join(worktreePath, '.agileflow', 'sessions');
  if (fs.existsSync(sessionsSymlinkSrc)) {
    try {
      // Remove the copied sessions directory (it was copied above with .agileflow)
      if (fs.existsSync(sessionsSymlinkDest)) {
        fs.rmSync(sessionsSymlinkDest, { recursive: true, force: true });
      }
      // Create relative symlink to main project's sessions directory
      const relPath = path.relative(path.dirname(sessionsSymlinkDest), sessionsSymlinkSrc);
      fs.symlinkSync(relPath, sessionsSymlinkDest, 'dir');
    } catch (e) {
      // Non-fatal: log but continue - the copied version will work, just won't be synchronized
      console.warn(`Warning: Could not symlink sessions directory: ${e.message}`);
    }
  }

  // Symlink docs/ to main project docs (shared state: status.json, session-state.json, bus/)
  // This enables story claiming, status bus, and session coordination across worktrees
  const foldersToSymlink = ['docs'];
  const symlinkedFolders = [];
  for (const folder of foldersToSymlink) {
    const src = path.join(ROOT, folder);
    const dest = path.join(worktreePath, folder);
    if (fs.existsSync(src)) {
      try {
        // Remove if exists (worktree may have empty/partial tracked folder)
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true });
        }

        // Create relative symlink (works across project moves)
        const relPath = path.relative(worktreePath, src);
        fs.symlinkSync(relPath, dest, 'dir');
        symlinkedFolders.push(folder);
      } catch (e) {
        // Fallback to copy if symlink fails (e.g., Windows without dev mode)
        console.warn(`Warning: Could not symlink ${folder}, copying instead: ${e.message}`);
        try {
          fs.cpSync(src, dest, { recursive: true, force: true });
          copiedFolders.push(folder);
        } catch (copyErr) {
          console.warn(`Warning: Could not copy ${folder}: ${copyErr.message}`);
        }
      }
    }
  }

  // Register session - worktree sessions are always parallel threads
  registry.next_id++;
  registry.sessions[sessionId] = {
    path: worktreePath,
    branch: branchName,
    story: null,
    nickname,
    created: new Date().toISOString(),
    last_active: new Date().toISOString(),
    is_main: false,
    thread_type: options.thread_type || 'parallel', // Worktrees default to parallel
  };

  saveRegistry(registry);

  return {
    success: true,
    sessionId,
    path: worktreePath,
    branch: branchName,
    thread_type: registry.sessions[sessionId].thread_type,
    command: `cd "${worktreePath}" && claude`,
    envFilesCopied: copiedEnvFiles,
    foldersCopied: copiedFolders,
    foldersSymlinked: symlinkedFolders,
  };
}

// Get all sessions with status
function getSessions() {
  const registry = loadRegistry();
  const cleanupResult = cleanupStaleLocks(registry);

  const sessions = [];
  for (const [id, session] of Object.entries(registry.sessions)) {
    sessions.push({
      id,
      ...session,
      active: isSessionActive(id),
      current: session.path === process.cwd(),
    });
  }

  // Sort by ID (numeric)
  sessions.sort((a, b) => parseInt(a.id) - parseInt(b.id));

  // Return count for backward compat, plus detailed info
  return {
    sessions,
    cleaned: cleanupResult.count,
    cleanedSessions: cleanupResult.sessions,
  };
}

// Get count of active sessions (excluding current)
function getActiveSessionCount() {
  const { sessions } = getSessions();
  const cwd = process.cwd();
  return sessions.filter(s => s.active && s.path !== cwd).length;
}

// Delete session (and optionally worktree)
function deleteSession(sessionId, removeWorktree = false) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot delete main session' };
  }

  // Remove lock
  removeLock(sessionId);

  // Remove worktree if requested
  if (removeWorktree && fs.existsSync(session.path)) {
    try {
      execSync(`git worktree remove "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      // Try force remove
      try {
        execSync(`git worktree remove --force "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
      } catch (e2) {
        return { success: false, error: `Failed to remove worktree: ${e2.message}` };
      }
    }
  }

  // Remove from registry
  delete registry.sessions[sessionId];
  saveRegistry(registry);

  return { success: true };
}

// Get main branch name (main or master) - cached since it rarely changes
function getMainBranch() {
  const cacheKey = `mainBranch:${ROOT}`;
  const cached = gitCache.get(cacheKey);
  if (cached !== null) return cached;

  const checkMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/main'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkMain.status === 0) {
    gitCache.set(cacheKey, 'main');
    return 'main';
  }

  const checkMaster = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/master'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkMaster.status === 0) {
    gitCache.set(cacheKey, 'master');
    return 'master';
  }

  gitCache.set(cacheKey, 'main');
  return 'main'; // Default fallback
}

// Check if session branch is mergeable to main
function checkMergeability(sessionId) {
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
  // First, stash any changes in ROOT and ensure we're on main
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

// Get merge preview (commits and files to be merged)
function getMergePreview(sessionId) {
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

// Execute merge operation
function integrateSession(sessionId, options = {}) {
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

  // Delete worktree first (before branch, as worktree holds ref)
  if (deleteWorktree && session.path !== ROOT && fs.existsSync(session.path)) {
    try {
      execSync(`git worktree remove "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
      result.worktreeDeleted = true;
    } catch (e) {
      try {
        execSync(`git worktree remove --force "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
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

// Session phases for Kanban-style visualization
const SESSION_PHASES = {
  TODO: 'todo',
  CODING: 'coding',
  REVIEW: 'review',
  MERGED: 'merged',
};

// Detect session phase based on git state (with caching for performance)
function getSessionPhase(session) {
  // If merged_at field exists, session was merged
  if (session.merged_at) {
    return SESSION_PHASES.MERGED;
  }

  // If is_main, it's the merged/main column
  if (session.is_main) {
    return SESSION_PHASES.MERGED;
  }

  // Check git state for the session
  try {
    const sessionPath = session.path;
    if (!fs.existsSync(sessionPath)) {
      return SESSION_PHASES.TODO;
    }

    // Cache key for this session's git state
    const cacheKey = `phase:${sessionPath}`;
    const cached = gitCache.get(cacheKey);
    if (cached !== null) return cached;

    // Count commits since branch diverged from main
    const mainBranch = getMainBranch();
    const commitCount = execSync(`git rev-list --count ${mainBranch}..HEAD 2>/dev/null || echo 0`, {
      cwd: sessionPath,
      encoding: 'utf8',
    }).trim();

    const commits = parseInt(commitCount, 10);

    if (commits === 0) {
      gitCache.set(cacheKey, SESSION_PHASES.TODO);
      return SESSION_PHASES.TODO;
    }

    // Check for uncommitted changes
    const status = execSync('git status --porcelain 2>/dev/null || echo ""', {
      cwd: sessionPath,
      encoding: 'utf8',
    }).trim();

    let phase;
    if (status === '') {
      // No uncommitted changes = ready for review
      phase = SESSION_PHASES.REVIEW;
    } else {
      // Has commits but also uncommitted changes = still coding
      phase = SESSION_PHASES.CODING;
    }

    gitCache.set(cacheKey, phase);
    return phase;
  } catch (e) {
    // On error, assume coding phase
    return SESSION_PHASES.CODING;
  }
}

// Render Kanban-style board visualization
function renderKanbanBoard(sessions) {
  const lines = [];

  // Group sessions by phase
  const byPhase = {
    [SESSION_PHASES.TODO]: [],
    [SESSION_PHASES.CODING]: [],
    [SESSION_PHASES.REVIEW]: [],
    [SESSION_PHASES.MERGED]: [],
  };

  for (const session of sessions) {
    const phase = getSessionPhase(session);
    byPhase[phase].push(session);
  }

  // Calculate column widths (min 12 chars)
  const colWidth = 14;
  const separator = '  ';

  // Header
  lines.push(`${c.cyan}Sessions (Kanban View):${c.reset}`);
  lines.push('');

  // Column headers
  const headers = [
    `${c.dim}TO DO${c.reset}`,
    `${c.yellow}CODING${c.reset}`,
    `${c.blue}REVIEW${c.reset}`,
    `${c.green}MERGED${c.reset}`,
  ];
  lines.push(headers.map(h => h.padEnd(colWidth + 10)).join(separator)); // +10 for ANSI codes

  // Top borders
  const topBorder = `┌${'─'.repeat(colWidth)}┐`;
  lines.push([topBorder, topBorder, topBorder, topBorder].join(separator));

  // Find max rows needed
  const maxRows = Math.max(
    1,
    byPhase[SESSION_PHASES.TODO].length,
    byPhase[SESSION_PHASES.CODING].length,
    byPhase[SESSION_PHASES.REVIEW].length,
    byPhase[SESSION_PHASES.MERGED].length
  );

  // Render rows
  for (let i = 0; i < maxRows; i++) {
    const cells = [
      SESSION_PHASES.TODO,
      SESSION_PHASES.CODING,
      SESSION_PHASES.REVIEW,
      SESSION_PHASES.MERGED,
    ].map(phase => {
      const session = byPhase[phase][i];
      if (!session) {
        return `│${' '.repeat(colWidth)}│`;
      }

      // Format session info
      const id = `[${session.id}]`;
      const name = session.nickname || session.branch || '';
      const truncName = name.length > colWidth - 5 ? name.slice(0, colWidth - 8) + '...' : name;
      const content = `${id} ${truncName}`.slice(0, colWidth);

      return `│${content.padEnd(colWidth)}│`;
    });
    lines.push(cells.join(separator));

    // Second line with story
    const storyCells = [
      SESSION_PHASES.TODO,
      SESSION_PHASES.CODING,
      SESSION_PHASES.REVIEW,
      SESSION_PHASES.MERGED,
    ].map(phase => {
      const session = byPhase[phase][i];
      if (!session) {
        return `│${' '.repeat(colWidth)}│`;
      }

      const story = session.story || '-';
      const storyTrunc = story.length > colWidth - 2 ? story.slice(0, colWidth - 5) + '...' : story;

      return `│${c.dim}${storyTrunc.padEnd(colWidth)}${c.reset}│`;
    });
    lines.push(storyCells.join(separator));
  }

  // Bottom borders
  const bottomBorder = `└${'─'.repeat(colWidth)}┘`;
  lines.push([bottomBorder, bottomBorder, bottomBorder, bottomBorder].join(separator));

  // Summary
  lines.push('');
  const summary = [
    `${c.dim}To Do: ${byPhase[SESSION_PHASES.TODO].length}${c.reset}`,
    `${c.yellow}Coding: ${byPhase[SESSION_PHASES.CODING].length}${c.reset}`,
    `${c.blue}Review: ${byPhase[SESSION_PHASES.REVIEW].length}${c.reset}`,
    `${c.green}Merged: ${byPhase[SESSION_PHASES.MERGED].length}${c.reset}`,
  ].join(' │ ');
  lines.push(summary);

  return lines.join('\n');
}

// Format sessions for display
function formatSessionsTable(sessions) {
  const lines = [];

  lines.push(`${c.cyan}Active Sessions:${c.reset}`);
  lines.push(`${'─'.repeat(70)}`);

  for (const session of sessions) {
    const status = session.active ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
    const current = session.current ? ` ${c.yellow}(current)${c.reset}` : '';
    const name = session.nickname ? `"${session.nickname}"` : session.branch;
    const story = session.story ? `${c.blue}${session.story}${c.reset}` : `${c.dim}-${c.reset}`;

    lines.push(`  ${status} [${c.bold}${session.id}${c.reset}] ${name}${current}`);
    lines.push(`      ${c.dim}Story:${c.reset} ${story} ${c.dim}│ Path:${c.reset} ${session.path}`);
  }

  lines.push(`${'─'.repeat(70)}`);

  return lines.join('\n');
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'register': {
      const nickname = args[1] || null;
      const result = registerSession(nickname);
      console.log(JSON.stringify(result));
      break;
    }

    case 'unregister': {
      const sessionId = args[1];
      if (sessionId) {
        unregisterSession(sessionId);
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
      }
      break;
    }

    case 'create': {
      const options = {};
      // SECURITY: Only accept whitelisted option keys
      const allowedKeys = ['nickname', 'branch', 'timeout'];
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2).split('=')[0];
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          // Handle --key=value or --key value formats
          const eqIndex = arg.indexOf('=');
          if (eqIndex !== -1) {
            options[key] = arg.slice(eqIndex + 1);
          } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
            options[key] = args[++i];
          }
        }
      }
      // Parse timeout as number (milliseconds)
      if (options.timeout) {
        options.timeout = parseInt(options.timeout, 10);
        if (isNaN(options.timeout) || options.timeout < 1000) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Timeout must be a number >= 1000 (milliseconds)',
            })
          );
          return;
        }
      }
      // Handle async createSession
      createSession(options)
        .then(result => {
          console.log(JSON.stringify(result));
        })
        .catch(err => {
          console.log(JSON.stringify({ success: false, error: err.message }));
        });
      break;
    }

    case 'list': {
      const { sessions, cleaned } = getSessions();
      if (args.includes('--json')) {
        console.log(JSON.stringify({ sessions, cleaned }));
      } else if (args.includes('--kanban')) {
        console.log(renderKanbanBoard(sessions));
        if (cleaned > 0) {
          console.log(`${c.dim}Cleaned ${cleaned} stale lock(s)${c.reset}`);
        }
      } else {
        console.log(formatSessionsTable(sessions));
        if (cleaned > 0) {
          console.log(`${c.dim}Cleaned ${cleaned} stale lock(s)${c.reset}`);
        }
      }
      break;
    }

    case 'count': {
      const count = getActiveSessionCount();
      console.log(JSON.stringify({ count }));
      break;
    }

    case 'delete': {
      const sessionId = args[1];
      const removeWorktree = args.includes('--remove-worktree');
      const result = deleteSession(sessionId, removeWorktree);
      console.log(JSON.stringify(result));
      break;
    }

    case 'status': {
      const { sessions } = getSessions();
      const cwd = process.cwd();
      const current = sessions.find(s => s.path === cwd);
      const others = sessions.filter(s => s.active && s.path !== cwd);

      console.log(
        JSON.stringify({
          current: current || null,
          otherActive: others.length,
          total: sessions.length,
        })
      );
      break;
    }

    case 'health': {
      // Get health status for all sessions
      // Usage: health [staleDays] [--detailed]
      const staleDaysArg = args.find(a => /^\d+$/.test(a));
      const staleDays = staleDaysArg ? parseInt(staleDaysArg, 10) : 7;
      const detailed = args.includes('--detailed');
      const health = getSessionsHealth({ staleDays, detailed });
      console.log(JSON.stringify(health));
      break;
    }

    case 'get': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      // Use the exported getSession function for consistency
      const session = getSession(sessionId);
      if (!session) {
        console.log(JSON.stringify({ success: false, error: `Session ${sessionId} not found` }));
        return;
      }
      console.log(JSON.stringify({ success: true, ...session }));
      break;
    }

    // PERFORMANCE: Combined command for welcome script (saves ~200ms from 3 subprocess calls)
    case 'full-status': {
      const nickname = args[1] || null;
      const cwd = process.cwd();

      // Register in single pass (combines register + count + status)
      const registry = loadRegistry();
      const branch = getCurrentBranch();
      const story = getCurrentStory();
      const pid = process.ppid || process.pid;

      // Find or create session FIRST (so we don't clean our own stale lock)
      let sessionId = null;
      let isNew = false;
      for (const [id, session] of Object.entries(registry.sessions)) {
        if (session.path === cwd) {
          sessionId = id;
          break;
        }
      }

      if (sessionId) {
        // Update existing
        registry.sessions[sessionId].branch = branch;
        registry.sessions[sessionId].story = story ? story.id : null;
        registry.sessions[sessionId].last_active = new Date().toISOString();
        if (nickname) registry.sessions[sessionId].nickname = nickname;
        // Ensure thread_type exists (migration for old sessions)
        if (!registry.sessions[sessionId].thread_type) {
          registry.sessions[sessionId].thread_type = registry.sessions[sessionId].is_main
            ? 'base'
            : 'parallel';
        }
        writeLock(sessionId, pid);
      } else {
        // Create new
        sessionId = String(registry.next_id);
        registry.next_id++;
        // A session is "main" only if it's at the project root AND not a git worktree
        // Worktrees have .git as a file (not directory), pointing to the main repo
        const isMain = cwd === ROOT && !isGitWorktree(cwd);
        registry.sessions[sessionId] = {
          path: cwd,
          branch,
          story: story ? story.id : null,
          nickname: nickname || null,
          created: new Date().toISOString(),
          last_active: new Date().toISOString(),
          is_main: isMain,
          thread_type: isMain ? 'base' : 'parallel',
        };
        writeLock(sessionId, pid);
        isNew = true;
      }
      saveRegistry(registry);

      // Clean up stale locks AFTER registering current session (so we don't clean our own lock)
      const cleanupResult = cleanupStaleLocks(registry);

      // Filter out the current session from cleanup reports (its lock was just refreshed)
      // Use String() to ensure consistent comparison (sessionId is string, cleanup.id may vary)
      const filteredCleanup = {
        count: cleanupResult.sessions.filter(s => String(s.id) !== String(sessionId)).length,
        sessions: cleanupResult.sessions.filter(s => String(s.id) !== String(sessionId)),
      };

      // Build session list and counts
      const sessions = [];
      let otherActive = 0;
      for (const [id, session] of Object.entries(registry.sessions)) {
        const active = isSessionActive(id);
        const isCurrent = session.path === cwd;
        sessions.push({ id, ...session, active, current: isCurrent });
        if (active && !isCurrent) otherActive++;
      }

      const current = sessions.find(s => s.current) || null;

      console.log(
        JSON.stringify({
          registered: true,
          id: sessionId,
          isNew,
          current,
          otherActive,
          total: sessions.length,
          cleaned: filteredCleanup.count,
          cleanedSessions: filteredCleanup.sessions,
        })
      );
      break;
    }

    case 'check-merge': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const result = checkMergeability(sessionId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'merge-preview': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const result = getMergePreview(sessionId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'integrate': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const options = {};
      const allowedKeys = ['strategy', 'deleteBranch', 'deleteWorktree', 'message'];
      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const eqIndex = arg.indexOf('=');
          let key, value;
          if (eqIndex !== -1) {
            key = arg.slice(2, eqIndex);
            value = arg.slice(eqIndex + 1);
          } else {
            key = arg.slice(2);
            value = args[++i];
          }
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          // Convert boolean strings
          if (key === 'deleteBranch' || key === 'deleteWorktree') {
            options[key] = value !== 'false';
          } else {
            options[key] = value;
          }
        }
      }
      const result = integrateSession(sessionId, options);
      console.log(JSON.stringify(result));
      break;
    }

    case 'smart-merge': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const options = {};
      const allowedKeys = ['strategy', 'deleteBranch', 'deleteWorktree', 'message'];
      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const eqIndex = arg.indexOf('=');
          let key, value;
          if (eqIndex !== -1) {
            key = arg.slice(2, eqIndex);
            value = arg.slice(eqIndex + 1);
          } else {
            key = arg.slice(2);
            value = args[++i];
          }
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          // Convert boolean strings
          if (key === 'deleteBranch' || key === 'deleteWorktree') {
            options[key] = value !== 'false';
          } else {
            options[key] = value;
          }
        }
      }
      const result = smartMerge(sessionId, options);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'merge-history': {
      const result = getMergeHistory();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'switch': {
      const sessionIdOrNickname = args[1];
      if (!sessionIdOrNickname) {
        console.log(JSON.stringify({ success: false, error: 'Session ID or nickname required' }));
        return;
      }
      const result = switchSession(sessionIdOrNickname);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'active': {
      const result = getActiveSession();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'clear-active': {
      const result = clearActiveSession();
      console.log(JSON.stringify(result));
      break;
    }

    case 'thread-type': {
      const subCommand = args[1];
      if (subCommand === 'set') {
        const sessionId = args[2];
        const threadType = args[3];
        if (!sessionId || !threadType) {
          console.log(
            JSON.stringify({ success: false, error: 'Usage: thread-type set <sessionId> <type>' })
          );
          return;
        }
        const result = setSessionThreadType(sessionId, threadType);
        console.log(JSON.stringify(result));
      } else {
        // Default: get thread type
        const sessionId = args[1] || null;
        const result = getSessionThreadType(sessionId);
        console.log(JSON.stringify(result));
      }
      break;
    }

    case 'help':
    default:
      console.log(`
${c.brand}${c.bold}Session Manager${c.reset} - Multi-session coordination for Claude Code

${c.cyan}Commands:${c.reset}
  register [nickname]     Register current directory as a session
  unregister <id>         Unregister a session (remove lock)
  create [--nickname X] [--timeout MS]  Create session with worktree (default timeout: 120000ms)
  list [--json]           List all sessions
  count                   Count other active sessions
  delete <id> [--remove-worktree]  Delete session
  status                  Get current session status
  get <id>                Get specific session by ID
  full-status             Combined register+count+status (optimized)
  switch <id|nickname>    Switch active session context (for /add-dir)
  active                  Get currently switched session (if any)
  clear-active            Clear switched session (back to main)
  thread-type [id]        Get thread type for session (default: current)
  thread-type set <id> <type>  Set thread type (base|parallel|chained|fusion|big|long)
  check-merge <id>        Check if session is mergeable to main
  merge-preview <id>      Preview commits/files to be merged
  integrate <id> [opts]   Merge session to main and cleanup
  smart-merge <id> [opts] Auto-resolve conflicts and merge
  merge-history           View merge audit log
  help                    Show this help

${c.cyan}Merge Options (integrate & smart-merge):${c.reset}
  --strategy=squash|merge   Merge strategy (default: squash)
  --deleteBranch=true|false Delete branch after merge (default: true)
  --deleteWorktree=true|false Delete worktree after merge (default: true)
  --message="..."           Custom commit message

${c.cyan}Smart Merge Resolution Strategies:${c.reset}
  docs (.md, README)      → accept_both (keep changes from both)
  tests (.test., .spec.)  → accept_both (keep changes from both)
  schema (.sql, prisma)   → take_theirs (use session version)
  config (.json, .yaml)   → merge_keys (keep main, log for review)
  source code             → take_theirs (use session version)

${c.cyan}Examples:${c.reset}
  node session-manager.js register
  node session-manager.js create --nickname auth
  node session-manager.js list
  node session-manager.js delete 2 --remove-worktree
  node session-manager.js check-merge 2
  node session-manager.js integrate 2 --strategy=squash
  node session-manager.js smart-merge 2 --strategy=squash
  node session-manager.js merge-history
`);
  }
}

// File tracking integration for smart merge
let fileTracking;
try {
  fileTracking = require('./lib/file-tracking.js');
} catch (e) {
  // File tracking not available
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
 * @returns {{ strategy: string, gitStrategy: string, description: string }}
 */
function getMergeStrategy(category) {
  const strategies = {
    docs: {
      strategy: 'accept_both',
      gitStrategy: 'union', // Git's union strategy for text files
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
      gitStrategy: 'ours', // Conservative - keep main, log for review
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
 * Smart merge with automatic conflict resolution.
 * Resolves conflicts based on file type categorization.
 *
 * @param {string} sessionId - Session ID to merge
 * @param {object} [options] - Options
 * @param {string} [options.strategy='squash'] - Merge strategy
 * @param {boolean} [options.deleteBranch=true] - Delete branch after merge
 * @param {boolean} [options.deleteWorktree=true] - Delete worktree after merge
 * @param {string} [options.message=null] - Custom commit message
 * @returns {{ success: boolean, merged?: boolean, autoResolved?: object[], error?: string }}
 */
function smartMerge(sessionId, options = {}) {
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
  const checkResult = checkMergeability(sessionId);
  if (!checkResult.success) {
    return checkResult;
  }

  // If no conflicts, use regular merge
  if (!checkResult.hasConflicts) {
    return integrateSession(sessionId, options);
  }

  // We have conflicts - try smart resolution
  console.log(`${c.amber}Conflicts detected - attempting auto-resolution...${c.reset}`);

  // Get list of conflicting files
  const conflictFiles = getConflictingFiles(sessionId);
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
        execSync(`git worktree remove "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
        result.worktreeDeleted = true;
      } catch (e) {
        try {
          execSync(`git worktree remove --force "${session.path}"`, {
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
        execSync(`git branch -D "${branchName}"`, { cwd: ROOT, encoding: 'utf8' });
        result.branchDeleted = true;
      } catch (e) {
        result.branchDeleted = false;
      }
    }

    // Clear file tracking for this session
    if (fileTracking) {
      try {
        fileTracking.clearSessionFiles({ rootDir: session.path });
      } catch (e) {
        // Ignore file tracking errors
      }
    }

    // Unregister the session
    unregisterSession(sessionId);

    return result;
  }

  // Merge succeeded without conflicts (shouldn't happen given our check, but handle it)
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

/**
 * Get list of files that would conflict during merge.
 * @param {string} sessionId - Session ID
 * @returns {{ success: boolean, files?: string[], error?: string }}
 */
function getConflictingFiles(sessionId) {
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
 * @param {object} resolution - Resolution info from categorization
 * @returns {{ success: boolean, error?: string }}
 */
function resolveConflict(resolution) {
  const { file, gitStrategy } = resolution;

  try {
    switch (gitStrategy) {
      case 'union':
        // Union merge - concatenate both versions (works for additive files like docs/tests)
        // Use git merge-file with --union flag for true union merge
        // This keeps both ours and theirs changes, separated by markers only if truly conflicting
        try {
          // Get the base, ours, and theirs versions
          const base = spawnSync('git', ['show', `:1:${file}`], { cwd: ROOT, encoding: 'utf8' });
          const ours = spawnSync('git', ['show', `:2:${file}`], { cwd: ROOT, encoding: 'utf8' });
          const theirs = spawnSync('git', ['show', `:3:${file}`], { cwd: ROOT, encoding: 'utf8' });

          // If we can get all three, use merge-file with union
          if (base.status === 0 && ours.status === 0 && theirs.status === 0) {
            // Write temp files for merge-file
            const tmpBase = path.join(ROOT, '.git', 'MERGE_BASE_TMP');
            const tmpOurs = path.join(ROOT, '.git', 'MERGE_OURS_TMP');
            const tmpTheirs = path.join(ROOT, '.git', 'MERGE_THEIRS_TMP');

            fs.writeFileSync(tmpBase, base.stdout);
            fs.writeFileSync(tmpOurs, ours.stdout);
            fs.writeFileSync(tmpTheirs, theirs.stdout);

            // Run merge-file with --union (keeps both sides for conflicts)
            spawnSync('git', ['merge-file', '--union', tmpOurs, tmpBase, tmpTheirs], {
              cwd: ROOT,
              encoding: 'utf8',
            });

            // Copy merged result to working tree
            fs.copyFileSync(tmpOurs, path.join(ROOT, file));

            // Cleanup temp files
            fs.unlinkSync(tmpBase);
            fs.unlinkSync(tmpOurs);
            fs.unlinkSync(tmpTheirs);
          } else {
            // Fallback: accept theirs for docs/tests (session's additions are more important)
            execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
          }
        } catch (unionError) {
          // Fallback to theirs on any error
          execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        }
        break;

      case 'theirs':
        // Accept the session's version
        execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'ours':
        // Keep main's version
        execSync(`git checkout --ours "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'recursive':
      default:
        // For source code conflicts, favor theirs (the session's work)
        execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;
    }

    // Stage the resolved file
    execSync(`git add "${file}"`, { cwd: ROOT, encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Save merge log for audit trail.
 * @param {object} log - Merge log entry
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
 * @returns {{ success: boolean, merges?: object[], error?: string }}
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

// Session state file path
const SESSION_STATE_PATH = getSessionStatePath(ROOT);

/**
 * Switch active session context (for use with /add-dir).
 * Updates session-state.json with active_session info.
 *
 * @param {string} sessionIdOrNickname - Session ID or nickname to switch to
 * @returns {{ success: boolean, session?: object, path?: string, error?: string }}
 */
function switchSession(sessionIdOrNickname) {
  const registry = loadRegistry();

  // Find session by ID or nickname
  let targetSession = null;
  let targetId = null;

  for (const [id, session] of Object.entries(registry.sessions)) {
    if (id === sessionIdOrNickname || session.nickname === sessionIdOrNickname) {
      targetSession = session;
      targetId = id;
      break;
    }
  }

  if (!targetSession) {
    return { success: false, error: `Session "${sessionIdOrNickname}" not found` };
  }

  // Verify the session path exists
  if (!fs.existsSync(targetSession.path)) {
    return {
      success: false,
      error: `Session directory does not exist: ${targetSession.path}`,
    };
  }

  // Load or create session-state.json
  let sessionState = {};
  if (fs.existsSync(SESSION_STATE_PATH)) {
    try {
      sessionState = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    } catch (e) {
      // Start fresh
    }
  }

  // Update active_session
  sessionState.active_session = {
    id: targetId,
    nickname: targetSession.nickname,
    path: targetSession.path,
    branch: targetSession.branch,
    switched_at: new Date().toISOString(),
    original_cwd: ROOT,
  };

  // Save session-state.json
  const stateDir = path.dirname(SESSION_STATE_PATH);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  fs.writeFileSync(SESSION_STATE_PATH, JSON.stringify(sessionState, null, 2) + '\n');

  // Update session last_active
  registry.sessions[targetId].last_active = new Date().toISOString();
  saveRegistry(registry);

  return {
    success: true,
    session: {
      id: targetId,
      nickname: targetSession.nickname,
      path: targetSession.path,
      branch: targetSession.branch,
    },
    path: targetSession.path,
    addDirCommand: `/add-dir ${targetSession.path}`,
  };
}

/**
 * Clear active session (switch back to main/original).
 * @returns {{ success: boolean }}
 */
function clearActiveSession() {
  if (!fs.existsSync(SESSION_STATE_PATH)) {
    return { success: true };
  }

  try {
    const sessionState = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    delete sessionState.active_session;
    fs.writeFileSync(SESSION_STATE_PATH, JSON.stringify(sessionState, null, 2) + '\n');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get current active session (if switched).
 * @returns {{ active: boolean, session?: object }}
 */
function getActiveSession() {
  if (!fs.existsSync(SESSION_STATE_PATH)) {
    return { active: false };
  }

  try {
    const sessionState = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    if (sessionState.active_session) {
      return { active: true, session: sessionState.active_session };
    }
    return { active: false };
  } catch (e) {
    return { active: false };
  }
}

/**
 * Get thread type for a session.
 * @param {string} sessionId - Session ID (or null for current session)
 * @returns {{ success: boolean, thread_type?: string, error?: string }}
 */
function getSessionThreadType(sessionId = null) {
  const registry = loadRegistry();
  const cwd = process.cwd();

  // Find session
  let targetId = sessionId;
  if (!targetId) {
    // Find current session by path
    for (const [id, session] of Object.entries(registry.sessions)) {
      if (session.path === cwd) {
        targetId = id;
        break;
      }
    }
  }

  if (!targetId || !registry.sessions[targetId]) {
    return { success: false, error: 'Session not found' };
  }

  const session = registry.sessions[targetId];
  // Return thread_type or auto-detect for legacy sessions
  const threadType = session.thread_type || (session.is_main ? 'base' : 'parallel');

  return {
    success: true,
    thread_type: threadType,
    session_id: targetId,
    is_main: session.is_main,
  };
}

/**
 * Update thread type for a session.
 * @param {string} sessionId - Session ID
 * @param {string} threadType - New thread type
 * @returns {{ success: boolean, error?: string }}
 */
function setSessionThreadType(sessionId, threadType) {
  if (!THREAD_TYPES.includes(threadType)) {
    return {
      success: false,
      error: `Invalid thread type: ${threadType}. Valid: ${THREAD_TYPES.join(', ')}`,
    };
  }

  const registry = loadRegistry();
  if (!registry.sessions[sessionId]) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  registry.sessions[sessionId].thread_type = threadType;
  saveRegistry(registry);

  return { success: true, thread_type: threadType };
}

// Export for use as module
module.exports = {
  // Registry injection (for testing)
  injectRegistry,
  getRegistryInstance,
  // Registry access (backward compatible)
  loadRegistry,
  saveRegistry,
  // Session management
  registerSession,
  unregisterSession,
  getSession,
  createSession,
  getSessions,
  getActiveSessionCount,
  deleteSession,
  isSessionActive,
  cleanupStaleLocks,
  cleanupStaleLocksAsync,
  // Merge operations
  getMainBranch,
  checkMergeability,
  getMergePreview,
  integrateSession,
  // Smart merge (auto-resolution)
  smartMerge,
  getConflictingFiles,
  categorizeFile,
  getMergeStrategy,
  getMergeHistory,
  // Session switching
  switchSession,
  clearActiveSession,
  getActiveSession,
  // Thread type tracking
  THREAD_TYPES,
  detectThreadType,
  getSessionThreadType,
  setSessionThreadType,
  // Kanban visualization
  SESSION_PHASES,
  getSessionPhase,
  renderKanbanBoard,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
