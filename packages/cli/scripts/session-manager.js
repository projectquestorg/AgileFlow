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
 * - lib/session-operations.js - Session CRUD, listing, stale lock cleanup
 * - lib/session-switching.js - Session switching, thread type management
 */

const fs = require('fs');
const path = require('path');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot, getAgileflowDir } = require('../lib/paths');

// Session registry
const { SessionRegistry } = require('../lib/session-registry');

// Lock file operations
const {
  readLock: _readLock,
  readLockAsync: _readLockAsync,
  writeLock: _writeLock,
  removeLock: _removeLock,
  isSessionActive: _isSessionActive,
  isSessionActiveAsync: _isSessionActiveAsync,
} = require('../lib/lock-file');

// Git operations module
const gitOps = require('../lib/git-operations');
const {
  gitCache,
  execGitAsync,
  getMainBranch,
  SESSION_PHASES,
  getSessionPhase,
  getSessionPhaseAsync,
  getSessionPhasesAsync,
} = gitOps;

// Worktree operations module
const { THREAD_TYPES, detectThreadType } = require('../lib/worktree-operations');

// Session display module
const displayOps = require('../lib/session-display');
const {
  getFileDetails,
  getSessionsHealth: _getSessionsHealth,
  renderKanbanBoard,
  renderKanbanBoardAsync,
  formatSessionsTable,
} = displayOps;

// Merge operations module
const mergeOps = require('../lib/merge-operations');

// Extracted modules
const { createSessionOperations } = require('../lib/session-operations');
const { createSessionSwitching } = require('../lib/session-switching');

// Constants
const ROOT = getProjectRoot();
const SESSIONS_DIR = path.join(getAgileflowDir(ROOT), 'sessions');

// Injectable registry instance for testing
let _registryInstance = null;
let _registryInitialized = false;

// --- Registry Management ---
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

// --- Lock File Wrappers (bind to SESSIONS_DIR) ---
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

// --- Instantiate extracted modules ---
const sessionOps = createSessionOperations({
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
});

const sessionSwitchOps = createSessionSwitching({
  ROOT,
  loadRegistry,
  saveRegistry,
});

// Destructure for local use and re-export
const {
  cleanupStaleLocks,
  cleanupStaleLocksAsync,
  registerSession,
  unregisterSession,
  getSession,
  createSession,
  createTeamSession,
  getSessions,
  getSessionsAsync,
  getActiveSessionCount,
  fullStatus,
  deleteSession,
} = sessionOps;

const {
  switchSession,
  clearActiveSession,
  getActiveSession,
  getSessionThreadType,
  setSessionThreadType,
  transitionThread,
  getValidThreadTransitions,
} = sessionSwitchOps;

// --- Session Health ---
function getSessionsHealth(options = {}) {
  return _getSessionsHealth(options, loadRegistry);
}

// Merge operation wrappers (delegate to merge-operations module)
const checkMergeability = id => mergeOps.checkMergeability(id, loadRegistry);
const getMergePreview = id => mergeOps.getMergePreview(id, loadRegistry);
const integrateSession = (id, opts = {}) =>
  mergeOps.integrateSession(id, opts, loadRegistry, saveRegistry, removeLock);
const commitChanges = (id, opts = {}) => mergeOps.commitChanges(id, opts, loadRegistry);
const stashChanges = id => mergeOps.stashChanges(id, loadRegistry);
const unstashChanges = id => mergeOps.unstashChanges(id);
const discardChanges = id => mergeOps.discardChanges(id, loadRegistry);
const categorizeFile = fp => mergeOps.categorizeFile(fp);
const getMergeStrategy = cat => mergeOps.getMergeStrategy(cat);
const getConflictingFiles = id => mergeOps.getConflictingFiles(id, loadRegistry);
const getMergeHistory = () => mergeOps.getMergeHistory();
const smartMerge = (id, opts = {}) =>
  mergeOps.smartMerge(id, opts, loadRegistry, saveRegistry, removeLock, unregisterSession);

// --- CLI Interface ---
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  function requireId(label = 'Session ID') {
    if (!args[1]) {
      console.log(JSON.stringify({ success: false, error: `${label} required` }));
      return null;
    }
    return args[1];
  }

  function parseOpts(startIdx, allowedKeys, boolKeys = []) {
    const options = {};
    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i];
      if (!arg.startsWith('--')) continue;
      const eqIndex = arg.indexOf('=');
      let key, value;
      if (eqIndex !== -1) { key = arg.slice(2, eqIndex); value = arg.slice(eqIndex + 1); }
      else { key = arg.slice(2); value = args[++i]; }
      if (!allowedKeys.includes(key)) {
        console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
        return null;
      }
      options[key] = boolKeys.includes(key) ? value !== 'false' : value;
    }
    return options;
  }

  switch (command) {
    case 'register': {
      const nickname = args[1] || null;
      const result = registerSession(nickname);
      console.log(JSON.stringify(result));
      break;
    }

    case 'unregister': {
      const id = requireId(); if (!id) return;
      unregisterSession(id);
      console.log(JSON.stringify({ success: true }));
      break;
    }

    case 'create': {
      const options = parseOpts(1, ['nickname', 'branch', 'timeout', 'mode', 'template']);
      if (!options) return;
      if (options.mode === 'team') {
        console.log(JSON.stringify(createTeamSession({
          template: options.template || 'fullstack', nickname: options.nickname,
        })));
        break;
      }
      if (options.timeout) {
        options.timeout = parseInt(options.timeout, 10);
        if (isNaN(options.timeout) || options.timeout < 1000) {
          console.log(JSON.stringify({ success: false, error: 'Timeout must be a number >= 1000 (milliseconds)' }));
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
      const id = requireId(); if (!id) return;
      const session = getSession(id);
      if (!session) { console.log(JSON.stringify({ success: false, error: `Session ${id} not found` })); return; }
      console.log(JSON.stringify({ success: true, ...session }));
      break;
    }

    case 'full-status': {
      console.log(JSON.stringify(fullStatus(args[1] || null)));
      break;
    }

    case 'check-merge': {
      const id = requireId(); if (!id) return;
      console.log(JSON.stringify(checkMergeability(id)));
      break;
    }
    case 'merge-preview': {
      const id = requireId(); if (!id) return;
      console.log(JSON.stringify(getMergePreview(id)));
      break;
    }
    case 'integrate': {
      const id = requireId(); if (!id) return;
      const opts = parseOpts(2, ['strategy', 'deleteBranch', 'deleteWorktree', 'message'], ['deleteBranch', 'deleteWorktree']);
      if (!opts) return;
      console.log(JSON.stringify(integrateSession(id, opts)));
      break;
    }
    case 'commit-changes': {
      const id = requireId(); if (!id) return;
      const opts = parseOpts(2, ['message']);
      if (!opts) return;
      console.log(JSON.stringify(commitChanges(id, opts)));
      break;
    }
    case 'stash': {
      const id = requireId(); if (!id) return;
      console.log(JSON.stringify(stashChanges(id)));
      break;
    }
    case 'unstash': {
      const id = requireId(); if (!id) return;
      console.log(JSON.stringify(unstashChanges(id)));
      break;
    }
    case 'discard-changes': {
      const id = requireId(); if (!id) return;
      console.log(JSON.stringify(discardChanges(id)));
      break;
    }
    case 'smart-merge': {
      const id = requireId(); if (!id) return;
      const opts = parseOpts(2, ['strategy', 'deleteBranch', 'deleteWorktree', 'message'], ['deleteBranch', 'deleteWorktree']);
      if (!opts) return;
      console.log(JSON.stringify(smartMerge(id, opts), null, 2));
      break;
    }
    case 'merge-history': {
      console.log(JSON.stringify(getMergeHistory(), null, 2));
      break;
    }
    case 'switch': {
      const id = requireId('Session ID or nickname'); if (!id) return;
      console.log(JSON.stringify(switchSession(id), null, 2));
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

// --- Exports ---
module.exports = {
  injectRegistry, getRegistryInstance, resetRegistryCache,
  loadRegistry, saveRegistry,
  registerSession, unregisterSession, getSession, createSession, createTeamSession,
  getSessions, getSessionsAsync, getActiveSessionCount, deleteSession,
  isSessionActive, isSessionActiveAsync, cleanupStaleLocks, cleanupStaleLocksAsync,
  switchSession, clearActiveSession, getActiveSession,
  THREAD_TYPES, detectThreadType, getSessionThreadType, setSessionThreadType,
  transitionThread, getValidThreadTransitions,
  getMainBranch, checkMergeability, getMergePreview, integrateSession,
  commitChanges, stashChanges, unstashChanges, discardChanges,
  smartMerge, getConflictingFiles, categorizeFile, getMergeStrategy, getMergeHistory,
  SESSION_PHASES, getSessionPhase, getSessionPhaseAsync, getSessionPhasesAsync,
  renderKanbanBoard, renderKanbanBoardAsync,
  formatSessionsTable, getFileDetails, getSessionsHealth,
  execGitAsync, gitCache,
};

if (require.main === module) main();
