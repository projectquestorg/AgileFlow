/**
 * session-switching.js - Session switching and thread type management
 *
 * Extracted from session-manager.js to reduce file size.
 * Uses factory pattern for dependency injection.
 */

const fs = require('fs');
const path = require('path');

const { getSessionStatePath } = require('./paths');
const { sessionThreadMachine } = require('./state-machine');
const { THREAD_TYPES } = require('./worktree-operations');

/**
 * Create session switching operations bound to the given dependencies.
 *
 * @param {object} deps
 * @param {string} deps.ROOT - Project root path
 * @param {Function} deps.loadRegistry - Load registry data
 * @param {Function} deps.saveRegistry - Save registry data
 */
function createSessionSwitching(deps) {
  const { ROOT, loadRegistry, saveRegistry } = deps;

  const SESSION_STATE_PATH = getSessionStatePath(ROOT);

  // ============================================================================
  // Session Switching
  // ============================================================================

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

  return {
    switchSession,
    clearActiveSession,
    getActiveSession,
    getSessionThreadType,
    setSessionThreadType,
    transitionThread,
    getValidThreadTransitions,
  };
}

module.exports = { createSessionSwitching };
