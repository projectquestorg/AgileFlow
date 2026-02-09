/**
 * session-operations.js - Session CRUD, listing, and cleanup operations
 *
 * Extracted from session-manager.js to reduce file size.
 * Uses factory pattern for dependency injection.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { getStatusPath } = require('./paths');
const { safeReadJSON } = require('./errors');
const { isValidBranchName, isValidSessionNickname } = require('./validate');
const { getInheritedFlags } = require('./flag-detection');

const {
  THREAD_TYPES,
  DEFAULT_WORKTREE_TIMEOUT_MS,
  isGitWorktree,
  detectThreadType,
  progressIndicator,
  createWorktreeWithTimeout,
  cleanupFailedWorktree,
} = require('./worktree-operations');

const { isPidAlive } = require('./lock-file');
const { getCurrentBranch } = require('./git-operations');

// Agent Teams integration (lazy-loaded)
let _featureFlags, _teamManager;
function getFeatureFlags() {
  if (!_featureFlags) {
    try {
      _featureFlags = require('./feature-flags');
    } catch (e) {
      _featureFlags = null;
    }
  }
  return _featureFlags;
}
function getTeamManager() {
  if (!_teamManager) {
    try {
      _teamManager = require('../scripts/team-manager');
    } catch (e) {
      _teamManager = null;
    }
  }
  return _teamManager;
}

/**
 * Create session operations bound to the given dependencies.
 *
 * @param {object} deps
 * @param {string} deps.ROOT - Project root path
 * @param {Function} deps.loadRegistry - Load registry data
 * @param {Function} deps.saveRegistry - Save registry data
 * @param {Function} deps.readLock - Read lock file for session
 * @param {Function} deps.readLockAsync - Async read lock file
 * @param {Function} deps.writeLock - Write lock file for session
 * @param {Function} deps.removeLock - Remove lock file for session
 * @param {Function} deps.isSessionActive - Check if session is active
 * @param {Function} deps.isSessionActiveAsync - Async check if session is active
 * @param {object} deps.c - Color utilities
 */
function createSessionOperations(deps) {
  const {
    ROOT,
    loadRegistry,
    saveRegistry,
    readLock,
    readLockAsync,
    writeLock,
    removeLock,
    isSessionActive,
    isSessionActiveAsync,
    c,
  } = deps;

  // ============================================================================
  // Stale Lock Cleanup
  // ============================================================================

  function processStalelock(id, session, lock, dryRun) {
    if (!lock) return null;
    const pid = parseInt(lock.pid, 10);
    if (isPidAlive(pid)) return null;
    if (!dryRun) removeLock(id);
    return {
      id,
      nickname: session.nickname,
      branch: session.branch,
      pid,
      reason: 'pid_dead',
      path: session.path,
    };
  }

  function cleanupStaleLocks(registry, options = {}) {
    const { dryRun = false } = options;
    const cleanedSessions = [];
    for (const [id, session] of Object.entries(registry.sessions)) {
      const result = processStalelock(id, session, readLock(id), dryRun);
      if (result) cleanedSessions.push(result);
    }
    return { count: cleanedSessions.length, sessions: cleanedSessions };
  }

  async function cleanupStaleLocksAsync(registry, options = {}) {
    const { dryRun = false } = options;
    const sessionEntries = Object.entries(registry.sessions);
    if (sessionEntries.length === 0) return { count: 0, sessions: [] };

    const lockResults = await Promise.all(
      sessionEntries.map(async ([id, session]) => ({
        id,
        session,
        lock: await readLockAsync(id),
      }))
    );

    const cleanedSessions = lockResults
      .map(({ id, session, lock }) => processStalelock(id, session, lock, dryRun))
      .filter(Boolean);

    return { count: cleanedSessions.length, sessions: cleanedSessions };
  }

  // ============================================================================
  // Current Story Helper
  // ============================================================================

  function getCurrentStory() {
    const statusPath = getStatusPath(ROOT);
    const result = safeReadJSON(statusPath, { defaultValue: null });
    if (!result.ok || !result.data) return null;
    for (const [id, story] of Object.entries(result.data.stories || {})) {
      if (story.status === 'in_progress') return { id, title: story.title };
    }
    return null;
  }

  // ============================================================================
  // Session CRUD Operations
  // ============================================================================

  function registerSession(nickname = null, threadType = null) {
    const registry = loadRegistry();
    const cwd = process.cwd();
    const branch = getCurrentBranch();
    const story = getCurrentStory();
    const pid = process.ppid || process.pid;

    let existingId = null;
    for (const [id, session] of Object.entries(registry.sessions)) {
      if (session.path === cwd) {
        existingId = id;
        break;
      }
    }

    if (existingId) {
      registry.sessions[existingId].branch = branch;
      registry.sessions[existingId].story = story ? story.id : null;
      registry.sessions[existingId].last_active = new Date().toISOString();
      if (nickname) registry.sessions[existingId].nickname = nickname;
      if (threadType && THREAD_TYPES.includes(threadType)) {
        registry.sessions[existingId].thread_type = threadType;
      }
      writeLock(existingId, pid);
      saveRegistry(registry);
      return { id: existingId, isNew: false };
    }

    const sessionId = String(registry.next_id);
    registry.next_id++;
    const isMain = cwd === ROOT && !isGitWorktree(cwd);
    const detectedType =
      threadType && THREAD_TYPES.includes(threadType)
        ? threadType
        : detectThreadType(null, !isMain);

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

  function unregisterSession(sessionId) {
    const registry = loadRegistry();
    if (registry.sessions[sessionId]) {
      registry.sessions[sessionId].last_active = new Date().toISOString();
      removeLock(sessionId);
      saveRegistry(registry);
    }
  }

  function getSession(sessionId) {
    const registry = loadRegistry();
    const session = registry.sessions[sessionId];
    if (!session) return null;
    const threadType = session.thread_type || (session.is_main ? 'base' : 'parallel');
    return {
      id: sessionId,
      ...session,
      thread_type: threadType,
      active: isSessionActive(sessionId),
    };
  }

  async function createSession(options = {}) {
    const registry = loadRegistry();
    const sessionId = String(registry.next_id);
    const projectName = registry.project_name;

    const nickname = options.nickname || null;
    const branchName = options.branch || `session-${sessionId}`;
    const dirName = nickname || sessionId;

    if (!isValidBranchName(branchName)) {
      return {
        success: false,
        error: `Invalid branch name: "${branchName}". Use only letters, numbers, hyphens, underscores, and forward slashes.`,
      };
    }
    if (nickname && !isValidSessionNickname(nickname)) {
      return {
        success: false,
        error: `Invalid nickname: "${nickname}". Use only letters, numbers, hyphens, and underscores.`,
      };
    }

    const worktreePath = path.resolve(ROOT, '..', `${projectName}-${dirName}`);
    if (fs.existsSync(worktreePath)) {
      return { success: false, error: `Directory already exists: ${worktreePath}` };
    }

    // Create branch if needed
    const checkRef = spawnSync(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
      { cwd: ROOT, encoding: 'utf8' }
    );
    let branchCreatedByUs = false;
    if (checkRef.status !== 0) {
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

    const timeoutMs = options.timeout || DEFAULT_WORKTREE_TIMEOUT_MS;
    const stopProgress = progressIndicator(
      'Creating worktree (this may take a while for large repos)'
    );

    try {
      await createWorktreeWithTimeout(worktreePath, branchName, timeoutMs);
      stopProgress();
      process.stderr.write(`✓ Worktree created successfully\n`);
    } catch (error) {
      stopProgress();
      cleanupFailedWorktree(worktreePath, branchName, branchCreatedByUs);
      return { success: false, error: error.message };
    }

    // Copy env files
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
          /* ignore */
        }
      }
    }

    // Copy config folders
    const configFoldersToCopy = ['.claude', '.agileflow'];
    const copiedFolders = [];
    for (const folder of configFoldersToCopy) {
      const src = path.join(ROOT, folder);
      const dest = path.join(worktreePath, folder);
      if (fs.existsSync(src)) {
        try {
          fs.cpSync(src, dest, { recursive: true, force: true });
          copiedFolders.push(folder);
        } catch (e) {
          /* ignore */
        }
      }
    }

    // Symlink sessions directory
    const sessionsSymlinkSrc = path.join(ROOT, '.agileflow', 'sessions');
    const sessionsSymlinkDest = path.join(worktreePath, '.agileflow', 'sessions');
    if (fs.existsSync(sessionsSymlinkSrc)) {
      try {
        if (fs.existsSync(sessionsSymlinkDest))
          fs.rmSync(sessionsSymlinkDest, { recursive: true, force: true });
        const relPath = path.relative(path.dirname(sessionsSymlinkDest), sessionsSymlinkSrc);
        fs.symlinkSync(relPath, sessionsSymlinkDest, 'dir');
      } catch (e) {
        /* ignore */
      }
    }

    // Symlink docs
    const foldersToSymlink = ['docs'];
    const symlinkedFolders = [];
    for (const folder of foldersToSymlink) {
      const src = path.join(ROOT, folder);
      const dest = path.join(worktreePath, folder);
      if (fs.existsSync(src)) {
        try {
          if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
          const relPath = path.relative(worktreePath, src);
          fs.symlinkSync(relPath, dest, 'dir');
          symlinkedFolders.push(folder);
        } catch (e) {
          try {
            fs.cpSync(src, dest, { recursive: true, force: true });
            copiedFolders.push(folder);
          } catch (copyErr) {
            /* ignore */
          }
        }
      }
    }

    // Detect inherited flags from parent Claude session
    const inheritedFlags = options.inheritFlags !== false ? getInheritedFlags() : '';

    registry.next_id++;
    registry.sessions[sessionId] = {
      path: worktreePath,
      branch: branchName,
      story: null,
      nickname,
      created: new Date().toISOString(),
      last_active: new Date().toISOString(),
      is_main: false,
      thread_type: options.thread_type || 'parallel',
      inherited_flags: inheritedFlags || null,
    };
    saveRegistry(registry);

    // Build the command with inherited flags
    const claudeCmd = inheritedFlags ? `claude ${inheritedFlags}` : 'claude';

    return {
      success: true,
      sessionId,
      path: worktreePath,
      branch: branchName,
      thread_type: registry.sessions[sessionId].thread_type,
      command: `cd "${worktreePath}" && ${claudeCmd}`,
      inheritedFlags: inheritedFlags || null,
      envFilesCopied: copiedEnvFiles,
      foldersCopied: copiedFolders,
      foldersSymlinked: symlinkedFolders,
    };
  }

  function createTeamSession(options = {}) {
    const ff = getFeatureFlags();
    const templateName = options.template || 'fullstack';

    if (!ff || !ff.isAgentTeamsEnabled({ rootDir: ROOT })) {
      console.error(`${c.yellow}Agent Teams not enabled. Falling back to worktree mode.${c.reset}`);
      return createSession({
        nickname: options.nickname || `team-${templateName}`,
        thread_type: 'parallel',
      });
    }

    const tm = getTeamManager();
    if (!tm) {
      return { success: false, error: 'team-manager module not available' };
    }

    const teamResult = tm.startTeam(ROOT, templateName);
    if (!teamResult.ok) {
      return { success: false, error: teamResult.error || 'Failed to start team' };
    }

    const registry = loadRegistry();
    const sessionId = String(registry.next_id);
    registry.next_id++;

    registry.sessions[sessionId] = {
      path: ROOT,
      branch: getCurrentBranch(),
      story: null,
      nickname: options.nickname || `team-${templateName}`,
      created: new Date().toISOString(),
      last_active: new Date().toISOString(),
      is_main: true,
      type: 'team',
      thread_type: 'team',
      team_name: templateName,
      team_lead: teamResult.lead || null,
      teammates: teamResult.teammates || [],
    };
    saveRegistry(registry);

    return {
      success: true,
      sessionId,
      type: 'team',
      template: templateName,
      mode: teamResult.mode,
      teammates: teamResult.teammates || [],
      path: ROOT,
      branch: getCurrentBranch(),
    };
  }

  // ============================================================================
  // Session Listing
  // ============================================================================

  function buildSessionsList(registrySessions, activeChecks, cwd) {
    const sessions = Object.entries(registrySessions).map(([id, session]) => ({
      id,
      ...session,
      active: activeChecks[id] || false,
      current: session.path === cwd,
    }));
    sessions.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    return sessions;
  }

  function getSessions() {
    const registry = loadRegistry();
    const cleanupResult = cleanupStaleLocks(registry);
    const cwd = process.cwd();
    const activeChecks = {};
    for (const id of Object.keys(registry.sessions)) activeChecks[id] = isSessionActive(id);
    return {
      sessions: buildSessionsList(registry.sessions, activeChecks, cwd),
      cleaned: cleanupResult.count,
      cleanedSessions: cleanupResult.sessions,
    };
  }

  async function getSessionsAsync() {
    const registry = loadRegistry();
    const cleanupResult = await cleanupStaleLocksAsync(registry);
    const sessionEntries = Object.entries(registry.sessions);
    const cwd = process.cwd();
    const activeResults = await Promise.all(
      sessionEntries.map(async ([id]) => [id, await isSessionActiveAsync(id)])
    );
    const activeChecks = Object.fromEntries(activeResults);
    return {
      sessions: buildSessionsList(registry.sessions, activeChecks, cwd),
      cleaned: cleanupResult.count,
      cleanedSessions: cleanupResult.sessions,
    };
  }

  function getActiveSessionCount() {
    const { sessions } = getSessions();
    const cwd = process.cwd();
    return sessions.filter(s => s.active && s.path !== cwd).length;
  }

  function fullStatus(nickname = null) {
    const cwd = process.cwd();
    const registry = loadRegistry();
    const branch = getCurrentBranch();
    const story = getCurrentStory();
    const pid = process.ppid || process.pid;

    let sessionId = null,
      isNew = false;
    for (const [id, session] of Object.entries(registry.sessions)) {
      if (session.path === cwd) {
        sessionId = id;
        break;
      }
    }

    if (sessionId) {
      registry.sessions[sessionId].branch = branch;
      registry.sessions[sessionId].story = story ? story.id : null;
      registry.sessions[sessionId].last_active = new Date().toISOString();
      if (nickname) registry.sessions[sessionId].nickname = nickname;
      if (!registry.sessions[sessionId].thread_type)
        registry.sessions[sessionId].thread_type = registry.sessions[sessionId].is_main
          ? 'base'
          : 'parallel';
      writeLock(sessionId, pid);
    } else {
      sessionId = String(registry.next_id);
      registry.next_id++;
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

    const cleanupResult = cleanupStaleLocks(registry);
    const filteredCleanup = {
      count: cleanupResult.sessions.filter(s => String(s.id) !== String(sessionId)).length,
      sessions: cleanupResult.sessions.filter(s => String(s.id) !== String(sessionId)),
    };

    const sessions = [];
    let otherActive = 0;
    for (const [id, session] of Object.entries(registry.sessions)) {
      const active = isSessionActive(id);
      const isCurrent = session.path === cwd;
      sessions.push({ id, ...session, active, current: isCurrent });
      if (active && !isCurrent) otherActive++;
    }

    return {
      registered: true,
      id: sessionId,
      isNew,
      current: sessions.find(s => s.current) || null,
      otherActive,
      total: sessions.length,
      cleaned: filteredCleanup.count,
      cleanedSessions: filteredCleanup.sessions,
    };
  }

  function deleteSession(sessionId, removeWorktree = false) {
    const registry = loadRegistry();
    const session = registry.sessions[sessionId];
    if (!session) return { success: false, error: `Session ${sessionId} not found` };
    if (session.is_main) return { success: false, error: 'Cannot delete main session' };

    removeLock(sessionId);
    if (removeWorktree && fs.existsSync(session.path)) {
      const { execFileSync } = require('child_process');
      try {
        execFileSync('git', ['worktree', 'remove', session.path], { cwd: ROOT, encoding: 'utf8' });
      } catch (e) {
        try {
          execFileSync('git', ['worktree', 'remove', '--force', session.path], {
            cwd: ROOT,
            encoding: 'utf8',
          });
        } catch (e2) {
          return { success: false, error: `Failed to remove worktree: ${e2.message}` };
        }
      }
    }
    delete registry.sessions[sessionId];
    saveRegistry(registry);
    return { success: true };
  }

  return {
    processStalelock,
    cleanupStaleLocks,
    cleanupStaleLocksAsync,
    getCurrentStory,
    registerSession,
    unregisterSession,
    getSession,
    createSession,
    createTeamSession,
    buildSessionsList,
    getSessions,
    getSessionsAsync,
    getActiveSessionCount,
    fullStatus,
    deleteSession,
  };
}

module.exports = { createSessionOperations };
