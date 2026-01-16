'use strict';

/**
 * Session Registry - Event Bus Architecture for Session Management
 *
 * Encapsulates all registry I/O with event emissions:
 * - registered: When a new session is registered
 * - unregistered: When a session is unregistered
 * - updated: When session data is modified
 * - loaded: When registry is loaded from disk
 * - saved: When registry is saved to disk
 * - locked: When a session lock is acquired
 * - unlocked: When a session lock is released
 * - cleaned: When stale locks are cleaned up
 *
 * Features:
 * - Cached registry with TTL
 * - Batched git operations
 * - Pre-parsed JSON returns
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Import shared utilities
let getProjectRoot;
try {
  getProjectRoot = require('../../lib/paths').getProjectRoot;
} catch (e) {
  getProjectRoot = () => process.cwd();
}

// Cache configuration
const CACHE_TTL_MS = 10000; // 10 seconds

/**
 * SessionRegistry - Event-driven session registry manager
 */
class SessionRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.rootDir = options.rootDir || getProjectRoot();
    this.sessionsDir = path.join(this.rootDir, '.agileflow', 'sessions');
    this.registryPath = path.join(this.sessionsDir, 'registry.json');
    this.cacheTTL = options.cacheTTL || CACHE_TTL_MS;

    // Cache state
    this._cache = null;
    this._cacheTime = 0;
    this._dirty = false;

    // Batch state
    this._batchMode = false;
    this._batchedWrites = [];
  }

  /**
   * Ensure sessions directory exists
   */
  ensureDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    if (!this._cache) return false;
    if (this._dirty) return false;
    return Date.now() - this._cacheTime < this.cacheTTL;
  }

  /**
   * Invalidate cache
   */
  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
  }

  /**
   * Load registry with caching
   * @returns {Object} Registry data
   */
  load() {
    // Return cached if valid
    if (this.isCacheValid()) {
      return this._cache;
    }

    this.ensureDir();

    let registry;

    if (fs.existsSync(this.registryPath)) {
      try {
        const content = fs.readFileSync(this.registryPath, 'utf8');
        registry = JSON.parse(content);
      } catch (e) {
        this.emit('error', { type: 'load', error: e.message });
        registry = this._createDefault();
      }
    } else {
      registry = this._createDefault();
      this._saveImmediate(registry);
    }

    // Update cache
    this._cache = registry;
    this._cacheTime = Date.now();
    this._dirty = false;

    this.emit('loaded', { registry, fromCache: false });

    return registry;
  }

  /**
   * Create default registry structure
   */
  _createDefault() {
    return {
      schema_version: '1.0.0',
      next_id: 1,
      project_name: path.basename(this.rootDir),
      sessions: {},
    };
  }

  /**
   * Save registry (respects batch mode)
   * @param {Object} registry - Registry data
   */
  save(registry) {
    if (this._batchMode) {
      this._cache = registry;
      this._dirty = true;
      this._batchedWrites.push({ type: 'registry', data: registry });
      return;
    }

    this._saveImmediate(registry);
  }

  /**
   * Immediate save (bypasses batch mode)
   */
  _saveImmediate(registry) {
    this.ensureDir();
    registry.updated = new Date().toISOString();
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2) + '\n');

    // Update cache
    this._cache = registry;
    this._cacheTime = Date.now();
    this._dirty = false;

    this.emit('saved', { registry });
  }

  /**
   * Start batch mode (defer writes until flush)
   */
  startBatch() {
    this._batchMode = true;
    this._batchedWrites = [];
  }

  /**
   * End batch mode and flush all writes
   */
  endBatch() {
    if (!this._batchMode) return;

    this._batchMode = false;

    // Only write if we have pending changes
    if (this._dirty && this._cache) {
      this._saveImmediate(this._cache);
    }

    // Process lock file writes
    for (const write of this._batchedWrites) {
      if (write.type === 'lock') {
        this._writeLockImmediate(write.sessionId, write.pid);
      } else if (write.type === 'unlock') {
        this._removeLockImmediate(write.sessionId);
      }
    }

    this._batchedWrites = [];
    this.emit('batchFlushed', { writeCount: this._batchedWrites.length });
  }

  /**
   * Get lock file path
   */
  getLockPath(sessionId) {
    return path.join(this.sessionsDir, `${sessionId}.lock`);
  }

  /**
   * Read lock file
   */
  readLock(sessionId) {
    const lockPath = this.getLockPath(sessionId);
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

  /**
   * Write lock file
   */
  writeLock(sessionId, pid) {
    if (this._batchMode) {
      this._batchedWrites.push({ type: 'lock', sessionId, pid });
      return;
    }
    this._writeLockImmediate(sessionId, pid);
  }

  /**
   * Immediate lock write
   */
  _writeLockImmediate(sessionId, pid) {
    const lockPath = this.getLockPath(sessionId);
    const content = `pid=${pid}\nstarted=${Math.floor(Date.now() / 1000)}\n`;
    fs.writeFileSync(lockPath, content);
    this.emit('locked', { sessionId, pid });
  }

  /**
   * Remove lock file
   */
  removeLock(sessionId) {
    if (this._batchMode) {
      this._batchedWrites.push({ type: 'unlock', sessionId });
      return;
    }
    this._removeLockImmediate(sessionId);
  }

  /**
   * Immediate lock removal
   */
  _removeLockImmediate(sessionId) {
    const lockPath = this.getLockPath(sessionId);
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      this.emit('unlocked', { sessionId });
    }
  }

  /**
   * Check if PID is alive
   */
  isPidAlive(pid) {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if session is active (has lock with alive PID)
   */
  isActive(sessionId) {
    const lock = this.readLock(sessionId);
    if (!lock || !lock.pid) return false;
    return this.isPidAlive(parseInt(lock.pid, 10));
  }

  /**
   * Clean up stale locks
   * @param {Object} options - Options
   * @returns {Object} Cleanup result
   */
  cleanupStaleLocks(options = {}) {
    const { dryRun = false } = options;
    const registry = this.load();
    let cleaned = 0;
    const cleanedSessions = [];

    for (const [id, session] of Object.entries(registry.sessions)) {
      const lock = this.readLock(id);
      if (lock) {
        const pid = parseInt(lock.pid, 10);
        const isAlive = this.isPidAlive(pid);

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
            this._removeLockImmediate(id);
          }
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      this.emit('cleaned', { count: cleaned, sessions: cleanedSessions });
    }

    return { count: cleaned, sessions: cleanedSessions };
  }

  /**
   * Register a session
   * @param {string} sessionPath - Session working directory
   * @param {Object} options - Registration options
   * @returns {Object} Registration result
   */
  register(sessionPath, options = {}) {
    const { nickname = null, threadType = null, pid = process.ppid || process.pid } = options;

    const registry = this.load();

    // Check if this path already has a session
    let existingId = null;
    for (const [id, session] of Object.entries(registry.sessions)) {
      if (session.path === sessionPath) {
        existingId = id;
        break;
      }
    }

    // Gather context in batch
    const context = this._gatherContext(sessionPath);

    if (existingId) {
      // Update existing session
      const session = registry.sessions[existingId];
      session.branch = context.branch;
      session.story = context.story;
      session.last_active = new Date().toISOString();
      if (nickname) session.nickname = nickname;
      if (threadType) session.thread_type = threadType;

      this.writeLock(existingId, pid);
      this.save(registry);

      this.emit('updated', {
        id: existingId,
        session,
        changes: ['branch', 'story', 'last_active'],
      });

      return { id: existingId, isNew: false, session };
    }

    // Create new session
    const sessionId = String(registry.next_id);
    registry.next_id++;

    const isMain = sessionPath === this.rootDir;
    const detectedType = threadType || (isMain ? 'base' : 'parallel');

    registry.sessions[sessionId] = {
      path: sessionPath,
      branch: context.branch,
      story: context.story,
      nickname: nickname || null,
      created: new Date().toISOString(),
      last_active: new Date().toISOString(),
      is_main: isMain,
      thread_type: detectedType,
    };

    this.writeLock(sessionId, pid);
    this.save(registry);

    this.emit('registered', {
      id: sessionId,
      session: registry.sessions[sessionId],
      isNew: true,
    });

    return {
      id: sessionId,
      isNew: true,
      session: registry.sessions[sessionId],
      thread_type: detectedType,
    };
  }

  /**
   * Unregister a session
   * @param {string} sessionId - Session ID
   */
  unregister(sessionId) {
    const registry = this.load();

    if (registry.sessions[sessionId]) {
      registry.sessions[sessionId].last_active = new Date().toISOString();
      this.removeLock(sessionId);
      this.save(registry);

      this.emit('unregistered', { id: sessionId });
    }
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session data
   */
  getSession(sessionId) {
    const registry = this.load();
    return registry.sessions[sessionId] || null;
  }

  /**
   * Get all sessions with status
   * @returns {Object} Sessions with metadata
   */
  getSessions() {
    const registry = this.load();
    const cleanupResult = this.cleanupStaleLocks();
    const cwd = process.cwd();

    const sessions = [];
    for (const [id, session] of Object.entries(registry.sessions)) {
      sessions.push({
        id,
        ...session,
        active: this.isActive(id),
        current: session.path === cwd,
      });
    }

    // Sort by ID (numeric)
    sessions.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    return {
      sessions,
      cleaned: cleanupResult.count,
      cleanedSessions: cleanupResult.sessions,
    };
  }

  /**
   * Get count of active sessions (excluding current path)
   * @param {string} excludePath - Path to exclude from count
   * @returns {number} Active session count
   */
  getActiveCount(excludePath = process.cwd()) {
    const { sessions } = this.getSessions();
    return sessions.filter(s => s.active && s.path !== excludePath).length;
  }

  /**
   * Delete a session
   * @param {string} sessionId - Session ID
   * @returns {Object} Result
   */
  delete(sessionId) {
    const registry = this.load();
    const session = registry.sessions[sessionId];

    if (!session) {
      return { success: false, error: `Session ${sessionId} not found` };
    }

    if (session.is_main) {
      return { success: false, error: 'Cannot delete main session' };
    }

    this.removeLock(sessionId);
    delete registry.sessions[sessionId];
    this.save(registry);

    this.emit('unregistered', { id: sessionId, deleted: true });

    return { success: true };
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Result
   */
  update(sessionId, updates) {
    const registry = this.load();
    const session = registry.sessions[sessionId];

    if (!session) {
      return { success: false, error: `Session ${sessionId} not found` };
    }

    // Apply updates
    const changedFields = [];
    for (const [key, value] of Object.entries(updates)) {
      if (session[key] !== value) {
        session[key] = value;
        changedFields.push(key);
      }
    }

    if (changedFields.length > 0) {
      session.last_active = new Date().toISOString();
      this.save(registry);

      this.emit('updated', {
        id: sessionId,
        session,
        changes: changedFields,
      });
    }

    return { success: true, session, changes: changedFields };
  }

  /**
   * Gather context for a session (branch, story) - batched git operations
   * @param {string} sessionPath - Session path
   * @returns {Object} Context data
   */
  _gatherContext(sessionPath) {
    // Batch git commands into single call for efficiency
    const result = spawnSync(
      'sh',
      [
        '-c',
        `
        cd "${sessionPath}" 2>/dev/null && {
          echo "BRANCH:$(git branch --show-current 2>/dev/null || echo unknown)"
        }
      `.trim(),
      ],
      { encoding: 'utf8' }
    );

    let branch = 'unknown';

    if (result.status === 0 && result.stdout) {
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('BRANCH:')) {
          branch = line.slice(7).trim() || 'unknown';
        }
      }
    }

    // Get story from status.json
    let story = null;
    const statusPath = path.join(this.rootDir, 'docs', '09-agents', 'status.json');
    if (fs.existsSync(statusPath)) {
      try {
        const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        for (const [id, storyData] of Object.entries(statusData.stories || {})) {
          if (storyData.status === 'in_progress') {
            story = id;
            break;
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    return { branch, story };
  }

  /**
   * Full status (combines register + count + status in single operation)
   * @param {string} sessionPath - Session path
   * @param {Object} options - Options
   * @returns {Object} Full status
   */
  getFullStatus(sessionPath, options = {}) {
    const { nickname = null } = options;
    const pid = process.ppid || process.pid;

    // Start batch mode for efficiency
    this.startBatch();

    // Register (or update) session
    const regResult = this.register(sessionPath, { nickname, pid });

    // End batch mode (flushes writes)
    this.endBatch();

    // Get counts
    const { sessions, cleaned, cleanedSessions } = this.getSessions();
    const current = sessions.find(s => s.path === sessionPath) || null;
    const otherActive = sessions.filter(s => s.active && s.path !== sessionPath).length;

    return {
      registered: true,
      id: regResult.id,
      isNew: regResult.isNew,
      current,
      otherActive,
      total: sessions.length,
      cleaned,
      cleanedSessions,
    };
  }

  /**
   * Get main branch name
   * @returns {string} Main branch name
   */
  getMainBranch() {
    const checkMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/main'], {
      cwd: this.rootDir,
      encoding: 'utf8',
    });

    if (checkMain.status === 0) return 'main';

    const checkMaster = spawnSync(
      'git',
      ['show-ref', '--verify', '--quiet', 'refs/heads/master'],
      {
        cwd: this.rootDir,
        encoding: 'utf8',
      }
    );

    if (checkMaster.status === 0) return 'master';

    return 'main'; // Default fallback
  }
}

// Singleton instance
let _instance = null;

/**
 * Get singleton registry instance
 * @param {Object} options - Options
 * @returns {SessionRegistry} Registry instance
 */
function getRegistry(options = {}) {
  if (!_instance || options.forceNew) {
    _instance = new SessionRegistry(options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
function resetRegistry() {
  _instance = null;
}

module.exports = {
  SessionRegistry,
  getRegistry,
  resetRegistry,
  CACHE_TTL_MS,
};
