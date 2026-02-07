#!/usr/bin/env node
/**
 * session-manager.js - Multi-session coordination for Claude Code
 *
 * Manages parallel Claude Code sessions with:
 * - Numbered session IDs (1, 2, 3...)
 * - PID-based liveness detection
 * - Git worktree automation
 * - Registry persistence
 *
 * NOTE: This file has been modularized. Core logic is in:
 * - lib/git-operations.js - Git commands, caching, phase detection
 * - lib/merge-operations.js - Merge, conflict resolution, smart-merge
 * - lib/worktree-operations.js - Worktree creation, cleanup, thread types
 * - lib/session-display.js - Kanban, table formatting, health checks
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

// Session registry
const { SessionRegistry } = require('../lib/session-registry');
const { sessionThreadMachine } = require('../lib/state-machine');

// Lock file operations
const {
  getLockPath: _getLockPath,
  readLock: _readLock,
  readLockAsync: _readLockAsync,
  writeLock: _writeLock,
  removeLock: _removeLock,
  isPidAlive,
  isSessionActive: _isSessionActive,
  isSessionActiveAsync: _isSessionActiveAsync,
} = require('../lib/lock-file');

// Flag detection for session propagation
const { getInheritedFlags, detectParentSessionFlags } = require('../lib/flag-detection');

// Git operations module
const gitOps = require('../lib/git-operations');
const {
  gitCache,
  execGitAsync,
  getCurrentBranch,
  getMainBranch,
  SESSION_PHASES,
  determinePhaseFromGitState,
  getSessionPhaseEarlyExit,
  getSessionPhase,
  getSessionPhaseAsync,
  getSessionPhasesAsync,
} = gitOps;

// Worktree operations module
const worktreeOps = require('../lib/worktree-operations');
const {
  THREAD_TYPES,
  DEFAULT_WORKTREE_TIMEOUT_MS,
  isGitWorktree,
  detectThreadType,
  progressIndicator,
  createWorktreeWithTimeout,
  cleanupFailedWorktree,
} = worktreeOps;

// Session display module
const displayOps = require('../lib/session-display');
const {
  getFileDetails,
  getSessionsHealth: _getSessionsHealth,
  formatKanbanBoard,
  groupSessionsByPhase,
  renderKanbanBoard,
  renderKanbanBoardAsync,
  formatSessionsTable,
} = displayOps;

// Merge operations module
const mergeOps = require('../lib/merge-operations');

// Agent Teams integration (lazy-loaded)
let _featureFlags, _teamManager;
function getFeatureFlags() {
  if (!_featureFlags) {
    try {
      _featureFlags = require('../lib/feature-flags');
    } catch (e) {
      _featureFlags = null;
    }
  }
  return _featureFlags;
}
function getTeamManager() {
  if (!_teamManager) {
    try {
      _teamManager = require('./team-manager');
    } catch (e) {
      _teamManager = null;
    }
  }
  return _teamManager;
}

// Constants
const ROOT = getProjectRoot();
const SESSIONS_DIR = path.join(getAgileflowDir(ROOT), 'sessions');
const REGISTRY_PATH = path.join(SESSIONS_DIR, 'registry.json');

// Injectable registry instance for testing
let _registryInstance = null;
let _registryInitialized = false;

// ============================================================================
// Registry Management
// ============================================================================

function getRegistryInstance() {
  if (!_registryInstance) {
    _registryInstance = new SessionRegistry(ROOT);
  }
  return _registryInstance;
}

function injectRegistry(registry) {
  _registryInstance = registry;
  _registryInitialized = false;
}

function resetRegistryCache() {
  _registryInitialized = false;
  if (_registryInstance) {
    _registryInstance.invalidateCache();
  }
}

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function loadRegistry() {
  const registryInstance = getRegistryInstance();
  if (!_registryInitialized) {
    const fileExistedBefore = fs.existsSync(registryInstance.registryPath);
    const data = registryInstance.loadSync();
    if (!fileExistedBefore) {
      registryInstance.saveSync(data);
    }
    _registryInitialized = true;
    return data;
  }
  return registryInstance.loadSync();
}

function saveRegistry(registryData) {
  const registry = getRegistryInstance();
  return registry.saveSync(registryData);
}

// ============================================================================
// Lock File Wrappers (bind to SESSIONS_DIR)
// ============================================================================

function getLockPath(sessionId) {
  return _getLockPath(SESSIONS_DIR, sessionId);
}
function readLock(sessionId) {
  return _readLock(SESSIONS_DIR, sessionId);
}
async function readLockAsync(sessionId) {
  return _readLockAsync(SESSIONS_DIR, sessionId);
}
function writeLock(sessionId, pid) {
  return _writeLock(SESSIONS_DIR, sessionId, pid);
}
function removeLock(sessionId) {
  return _removeLock(SESSIONS_DIR, sessionId);
}
function isSessionActive(sessionId) {
  return _isSessionActive(SESSIONS_DIR, sessionId);
}
async function isSessionActiveAsync(sessionId) {
  return _isSessionActiveAsync(SESSIONS_DIR, sessionId);
}

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
// Session Health (wrapper for display module)
// ============================================================================

function getSessionsHealth(options = {}) {
  return _getSessionsHealth(options, loadRegistry);
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
  return { id: sessionId, ...session, thread_type: threadType, active: isSessionActive(sessionId) };
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
    const createBranch = spawnSync('git', ['branch', branchName], { cwd: ROOT, encoding: 'utf8' });
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

/**
 * Create a native Agent Teams session instead of a worktree session.
 * Falls back to worktree mode if Agent Teams is not enabled.
 *
 * @param {object} options - { template, nickname }
 * @returns {object} Result with session info
 */
function createTeamSession(options = {}) {
  const ff = getFeatureFlags();
  const templateName = options.template || 'fullstack';

  // Check if Agent Teams is enabled
  if (!ff || !ff.isAgentTeamsEnabled({ rootDir: ROOT })) {
    console.error(`${c.yellow}Agent Teams not enabled. Falling back to worktree mode.${c.reset}`);
    return createSession({
      nickname: options.nickname || `team-${templateName}`,
      thread_type: 'parallel',
    });
  }

  // Use team-manager to start the team
  const tm = getTeamManager();
  if (!tm) {
    return { success: false, error: 'team-manager module not available' };
  }

  const teamResult = tm.startTeam(ROOT, templateName);
  if (!teamResult.ok) {
    return { success: false, error: teamResult.error || 'Failed to start team' };
  }

  // Register as a session in the registry
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

// ============================================================================
// Session Switching
// ============================================================================

const SESSION_STATE_PATH = getSessionStatePath(ROOT);

function switchSession(sessionIdOrNickname) {
  const registry = loadRegistry();
  let targetSession = null,
    targetId = null;
  for (const [id, session] of Object.entries(registry.sessions)) {
    if (id === sessionIdOrNickname || session.nickname === sessionIdOrNickname) {
      targetSession = session;
      targetId = id;
      break;
    }
  }
  if (!targetSession)
    return { success: false, error: `Session "${sessionIdOrNickname}" not found` };
  if (!fs.existsSync(targetSession.path))
    return { success: false, error: `Session directory does not exist: ${targetSession.path}` };

  let sessionState = {};
  if (fs.existsSync(SESSION_STATE_PATH)) {
    try {
      sessionState = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    } catch (e) {
      /* start fresh */
    }
  }

  sessionState.active_session = {
    id: targetId,
    nickname: targetSession.nickname,
    path: targetSession.path,
    branch: targetSession.branch,
    switched_at: new Date().toISOString(),
    original_cwd: ROOT,
  };

  const stateDir = path.dirname(SESSION_STATE_PATH);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(SESSION_STATE_PATH, JSON.stringify(sessionState, null, 2) + '\n');

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

function clearActiveSession() {
  if (!fs.existsSync(SESSION_STATE_PATH)) return { success: true };
  try {
    const sessionState = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    delete sessionState.active_session;
    fs.writeFileSync(SESSION_STATE_PATH, JSON.stringify(sessionState, null, 2) + '\n');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getActiveSession() {
  if (!fs.existsSync(SESSION_STATE_PATH)) return { active: false };
  try {
    const sessionState = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    return sessionState.active_session
      ? { active: true, session: sessionState.active_session }
      : { active: false };
  } catch (e) {
    return { active: false };
  }
}

// ============================================================================
// Thread Type Management
// ============================================================================

function getSessionThreadType(sessionId = null) {
  const registry = loadRegistry();
  const cwd = process.cwd();
  let targetId = sessionId;
  if (!targetId) {
    for (const [id, session] of Object.entries(registry.sessions)) {
      if (session.path === cwd) {
        targetId = id;
        break;
      }
    }
  }
  if (!targetId || !registry.sessions[targetId])
    return { success: false, error: 'Session not found' };
  const session = registry.sessions[targetId];
  const threadType = session.thread_type || (session.is_main ? 'base' : 'parallel');
  return { success: true, thread_type: threadType, session_id: targetId, is_main: session.is_main };
}

function setSessionThreadType(sessionId, threadType) {
  if (!THREAD_TYPES.includes(threadType)) {
    return {
      success: false,
      error: `Invalid thread type: ${threadType}. Valid: ${THREAD_TYPES.join(', ')}`,
    };
  }
  const registry = loadRegistry();
  if (!registry.sessions[sessionId])
    return { success: false, error: `Session ${sessionId} not found` };
  registry.sessions[sessionId].thread_type = threadType;
  saveRegistry(registry);
  return { success: true, thread_type: threadType };
}

function transitionThread(sessionId, targetType, options = {}) {
  const { force = false } = options;
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];
  if (!session) return { success: false, error: `Session ${sessionId} not found` };

  const currentType = session.thread_type || (session.is_main ? 'base' : 'parallel');
  const result = sessionThreadMachine.transition(currentType, targetType, { force });
  if (!result.success)
    return { success: false, from: currentType, to: targetType, error: result.error };
  if (result.noop) return { success: true, from: currentType, to: targetType, noop: true };

  registry.sessions[sessionId].thread_type = targetType;
  registry.sessions[sessionId].thread_transitioned_at = new Date().toISOString();
  saveRegistry(registry);
  return { success: true, from: currentType, to: targetType, forced: result.forced || false };
}

function getValidThreadTransitions(sessionId) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];
  if (!session) return { success: false, error: `Session ${sessionId} not found` };
  const currentType = session.thread_type || (session.is_main ? 'base' : 'parallel');
  const validTransitions = sessionThreadMachine.getValidTransitions(currentType);
  return { success: true, current: currentType, validTransitions };
}

// ============================================================================
// Merge Operation Wrappers (delegate to merge-operations module)
// ============================================================================

function checkMergeability(sessionId) {
  return mergeOps.checkMergeability(sessionId, loadRegistry);
}
function getMergePreview(sessionId) {
  return mergeOps.getMergePreview(sessionId, loadRegistry);
}
function integrateSession(sessionId, options = {}) {
  return mergeOps.integrateSession(sessionId, options, loadRegistry, saveRegistry, removeLock);
}
function generateCommitMessage(session) {
  return mergeOps.generateCommitMessage(session);
}
function commitChanges(sessionId, options = {}) {
  return mergeOps.commitChanges(sessionId, options, loadRegistry);
}
function stashChanges(sessionId) {
  return mergeOps.stashChanges(sessionId, loadRegistry);
}
function unstashChanges(sessionId) {
  return mergeOps.unstashChanges(sessionId);
}
function discardChanges(sessionId) {
  return mergeOps.discardChanges(sessionId, loadRegistry);
}
function categorizeFile(filePath) {
  return mergeOps.categorizeFile(filePath);
}
function getMergeStrategy(category) {
  return mergeOps.getMergeStrategy(category);
}
function getConflictingFiles(sessionId) {
  return mergeOps.getConflictingFiles(sessionId, loadRegistry);
}
function getMergeHistory() {
  return mergeOps.getMergeHistory();
}
function smartMerge(sessionId, options = {}) {
  return mergeOps.smartMerge(
    sessionId,
    options,
    loadRegistry,
    saveRegistry,
    removeLock,
    unregisterSession
  );
}

// ============================================================================
// CLI Interface
// ============================================================================

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
      } else console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
      break;
    }

    case 'create': {
      const options = {};
      const allowedKeys = ['nickname', 'branch', 'timeout', 'mode', 'template'];
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2).split('=')[0];
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          const eqIndex = arg.indexOf('=');
          if (eqIndex !== -1) options[key] = arg.slice(eqIndex + 1);
          else if (args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
        }
      }

      // Team mode: create a native Agent Teams session
      if (options.mode === 'team') {
        const result = createTeamSession({
          template: options.template || 'fullstack',
          nickname: options.nickname,
        });
        console.log(JSON.stringify(result));
        break;
      }

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
      createSession(options)
        .then(result => console.log(JSON.stringify(result)))
        .catch(err => console.log(JSON.stringify({ success: false, error: err.message })));
      break;
    }

    case 'list': {
      const { sessions, cleaned } = getSessions();
      if (args.includes('--json')) console.log(JSON.stringify({ sessions, cleaned }));
      else if (args.includes('--kanban')) {
        console.log(renderKanbanBoard(sessions));
        if (cleaned > 0) console.log(`${c.dim}Cleaned ${cleaned} stale lock(s)${c.reset}`);
      } else {
        console.log(formatSessionsTable(sessions));
        if (cleaned > 0) console.log(`${c.dim}Cleaned ${cleaned} stale lock(s)${c.reset}`);
      }
      break;
    }

    case 'count': {
      console.log(JSON.stringify({ count: getActiveSessionCount() }));
      break;
    }

    case 'delete': {
      const sessionId = args[1];
      const removeWorktree = args.includes('--remove-worktree');
      console.log(JSON.stringify(deleteSession(sessionId, removeWorktree)));
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
      const staleDaysArg = args.find(a => /^\d+$/.test(a));
      const staleDays = staleDaysArg ? parseInt(staleDaysArg, 10) : 7;
      const detailed = args.includes('--detailed');
      console.log(JSON.stringify(getSessionsHealth({ staleDays, detailed })));
      break;
    }

    case 'get': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const session = getSession(sessionId);
      if (!session) {
        console.log(JSON.stringify({ success: false, error: `Session ${sessionId} not found` }));
        return;
      }
      console.log(JSON.stringify({ success: true, ...session }));
      break;
    }

    case 'full-status': {
      const nickname = args[1] || null;
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

      console.log(
        JSON.stringify({
          registered: true,
          id: sessionId,
          isNew,
          current: sessions.find(s => s.current) || null,
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
      console.log(JSON.stringify(checkMergeability(sessionId)));
      break;
    }
    case 'merge-preview': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      console.log(JSON.stringify(getMergePreview(sessionId)));
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
          if (key === 'deleteBranch' || key === 'deleteWorktree') options[key] = value !== 'false';
          else options[key] = value;
        }
      }
      console.log(JSON.stringify(integrateSession(sessionId, options)));
      break;
    }

    case 'commit-changes': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const options = {};
      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--message=')) options.message = arg.slice(10);
        else if (arg === '--message' && args[i + 1]) options.message = args[++i];
      }
      console.log(JSON.stringify(commitChanges(sessionId, options)));
      break;
    }

    case 'stash': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      console.log(JSON.stringify(stashChanges(sessionId)));
      break;
    }
    case 'unstash': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      console.log(JSON.stringify(unstashChanges(sessionId)));
      break;
    }
    case 'discard-changes': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      console.log(JSON.stringify(discardChanges(sessionId)));
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
          if (key === 'deleteBranch' || key === 'deleteWorktree') options[key] = value !== 'false';
          else options[key] = value;
        }
      }
      console.log(JSON.stringify(smartMerge(sessionId, options), null, 2));
      break;
    }

    case 'merge-history': {
      console.log(JSON.stringify(getMergeHistory(), null, 2));
      break;
    }
    case 'switch': {
      const sessionIdOrNickname = args[1];
      if (!sessionIdOrNickname) {
        console.log(JSON.stringify({ success: false, error: 'Session ID or nickname required' }));
        return;
      }
      console.log(JSON.stringify(switchSession(sessionIdOrNickname), null, 2));
      break;
    }
    case 'active': {
      console.log(JSON.stringify(getActiveSession(), null, 2));
      break;
    }
    case 'clear-active': {
      console.log(JSON.stringify(clearActiveSession()));
      break;
    }

    case 'thread-type': {
      const subCommand = args[1];
      if (subCommand === 'set') {
        const sessionId = args[2],
          threadType = args[3];
        if (!sessionId || !threadType) {
          console.log(
            JSON.stringify({ success: false, error: 'Usage: thread-type set <sessionId> <type>' })
          );
          return;
        }
        console.log(JSON.stringify(setSessionThreadType(sessionId, threadType)));
      } else {
        const sessionId = args[1] || null;
        console.log(JSON.stringify(getSessionThreadType(sessionId)));
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
  create [--nickname X] [--timeout MS]  Create session with worktree
  create --mode=team [--template X]     Create native Agent Teams session
  list [--json|--kanban]  List all sessions
  count                   Count other active sessions
  delete <id> [--remove-worktree]  Delete session
  status                  Get current session status
  get <id>                Get specific session by ID
  full-status             Combined register+count+status (optimized)
  switch <id|nickname>    Switch active session context
  active                  Get currently switched session
  clear-active            Clear switched session
  thread-type [id]        Get thread type for session
  thread-type set <id> <type>  Set thread type
  check-merge <id>        Check if session is mergeable
  merge-preview <id>      Preview commits/files to be merged
  integrate <id> [opts]   Merge session to main and cleanup
  smart-merge <id> [opts] Auto-resolve conflicts and merge
  merge-history           View merge audit log
  commit-changes <id>     Commit all uncommitted changes
  stash <id>              Stash changes in session worktree
  unstash <id>            Pop stash (after merge, on main)
  discard-changes <id>    Discard all uncommitted changes
  health [days] [--detailed]  Check session health
  help                    Show this help
`);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Registry injection (for testing)
  injectRegistry,
  getRegistryInstance,
  resetRegistryCache,
  // Registry access
  loadRegistry,
  saveRegistry,
  // Session management
  registerSession,
  unregisterSession,
  getSession,
  createSession,
  createTeamSession,
  getSessions,
  getSessionsAsync,
  getActiveSessionCount,
  deleteSession,
  isSessionActive,
  isSessionActiveAsync,
  cleanupStaleLocks,
  cleanupStaleLocksAsync,
  // Session switching
  switchSession,
  clearActiveSession,
  getActiveSession,
  // Thread type tracking
  THREAD_TYPES,
  detectThreadType,
  getSessionThreadType,
  setSessionThreadType,
  transitionThread,
  getValidThreadTransitions,
  // Merge operations (delegated to module)
  getMainBranch,
  checkMergeability,
  getMergePreview,
  integrateSession,
  commitChanges,
  stashChanges,
  unstashChanges,
  discardChanges,
  smartMerge,
  getConflictingFiles,
  categorizeFile,
  getMergeStrategy,
  getMergeHistory,
  // Kanban visualization
  SESSION_PHASES,
  getSessionPhase,
  getSessionPhaseAsync,
  getSessionPhasesAsync,
  renderKanbanBoard,
  renderKanbanBoardAsync,
  // Display
  formatSessionsTable,
  getFileDetails,
  getSessionsHealth,
  // Internal utilities (for testing)
  execGitAsync,
  gitCache,
};

if (require.main === module) main();
