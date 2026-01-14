/**
 * session-registry.js - Event Bus for Session Registry
 *
 * Encapsulates all registry I/O operations and emits events for
 * session lifecycle changes. Reduces code duplication in session-manager.js.
 *
 * Features:
 * - Centralized load/save with caching
 * - Event emission for session changes
 * - Batch operations support
 * - Audit trail logging
 *
 * Events:
 * - 'registered': Session was registered { sessionId, session }
 * - 'unregistered': Session was unregistered { sessionId }
 * - 'updated': Session was updated { sessionId, changes }
 * - 'loaded': Registry was loaded { sessionCount }
 * - 'saved': Registry was saved { sessionCount }
 *
 * Usage:
 *   const { SessionRegistry } = require('./session-registry');
 *   const registry = new SessionRegistry('/path/to/project');
 *
 *   registry.on('registered', ({ sessionId }) => {
 *     console.log(`Session ${sessionId} registered`);
 *   });
 *
 *   registry.registerSession(1, { worktree: '/path' });
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const SmartJsonFile = require('./smart-json-file');

/**
 * Session Registry Event Bus
 * @extends EventEmitter
 */
class SessionRegistry extends EventEmitter {
  /**
   * @param {string} projectRoot - Project root directory
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.sessionsDir] - Override sessions directory
   * @param {number} [options.cacheTTL=10000] - Cache TTL in ms
   * @param {boolean} [options.auditLog=false] - Enable audit logging
   */
  constructor(projectRoot, options = {}) {
    super();

    this.projectRoot = projectRoot;
    this.sessionsDir = options.sessionsDir || path.join(projectRoot, '.agileflow', 'sessions');
    this.registryPath = path.join(this.sessionsDir, 'registry.json');
    this.cacheTTL = options.cacheTTL || 10000; // 10 second cache
    this.auditLog = options.auditLog || false;

    // Cache
    this._cache = null;
    this._cacheTime = 0;

    // Batch mode
    this._batchMode = false;
    this._batchChanges = [];

    // Create SmartJsonFile for safe I/O
    this._jsonFile = new SmartJsonFile(this.registryPath, {
      retries: 3,
      backoff: 100,
      createDir: true,
      defaultValue: this._createDefaultRegistry(),
    });
  }

  /**
   * Create default empty registry
   * @returns {Object}
   * @private
   */
  _createDefaultRegistry() {
    return {
      schema_version: '1.0.0',
      next_id: 1,
      project_name: path.basename(this.projectRoot),
      sessions: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  }

  /**
   * Ensure sessions directory exists
   * @private
   */
  _ensureDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Log audit event if enabled
   * @param {string} action - Action name
   * @param {Object} details - Action details
   * @private
   */
  _auditLog(action, details) {
    if (!this.auditLog) return;

    const logPath = path.join(this.sessionsDir, 'audit.log');
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      ...details,
    };

    try {
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch {
      // Ignore audit log errors
    }
  }

  /**
   * Load registry (with caching)
   * @param {boolean} [force=false] - Force reload ignoring cache
   * @returns {Promise<Object>} Registry data
   */
  async load(force = false) {
    const now = Date.now();

    // Return cached if valid and not forced
    if (!force && this._cache && now - this._cacheTime < this.cacheTTL) {
      return this._cache;
    }

    this._ensureDir();
    const result = await this._jsonFile.read();

    if (result.ok) {
      this._cache = result.data;
      this._cacheTime = now;
      this.emit('loaded', { sessionCount: Object.keys(result.data.sessions || {}).length });
      return result.data;
    }

    // Return default on error
    const defaultRegistry = this._createDefaultRegistry();
    this._cache = defaultRegistry;
    this._cacheTime = now;
    return defaultRegistry;
  }

  /**
   * Load registry synchronously (for compatibility)
   * @returns {Object} Registry data
   */
  loadSync() {
    this._ensureDir();
    const result = this._jsonFile.readSync();

    if (result.ok) {
      this._cache = result.data;
      this._cacheTime = Date.now();
      return result.data;
    }

    return this._createDefaultRegistry();
  }

  /**
   * Save registry
   * @param {Object} registry - Registry data to save
   * @returns {Promise<{ok: boolean, error?: Error}>}
   */
  async save(registry) {
    registry.updated = new Date().toISOString();
    const result = await this._jsonFile.write(registry);

    if (result.ok) {
      this._cache = registry;
      this._cacheTime = Date.now();
      this._auditLog('save', { sessionCount: Object.keys(registry.sessions || {}).length });
      this.emit('saved', { sessionCount: Object.keys(registry.sessions || {}).length });
    }

    return result;
  }

  /**
   * Save registry synchronously (for compatibility)
   * @param {Object} registry - Registry data to save
   * @returns {{ok: boolean, error?: Error}}
   */
  saveSync(registry) {
    registry.updated = new Date().toISOString();
    const result = this._jsonFile.writeSync(registry);

    if (result.ok) {
      this._cache = registry;
      this._cacheTime = Date.now();
    }

    return result;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this._cache = null;
    this._cacheTime = 0;
  }

  /**
   * Get a session by ID
   * @param {number|string} sessionId - Session ID
   * @returns {Promise<Object|null>}
   */
  async getSession(sessionId) {
    const registry = await this.load();
    return registry.sessions?.[sessionId] || null;
  }

  /**
   * Get all sessions
   * @returns {Promise<Object>} Map of sessionId -> session
   */
  async getAllSessions() {
    const registry = await this.load();
    return registry.sessions || {};
  }

  /**
   * Get next available session ID
   * @returns {Promise<number>}
   */
  async getNextId() {
    const registry = await this.load();
    return registry.next_id || 1;
  }

  /**
   * Register a new session
   * @param {number|string} sessionId - Session ID
   * @param {Object} sessionData - Session data
   * @returns {Promise<{ok: boolean, error?: Error}>}
   */
  async registerSession(sessionId, sessionData) {
    const registry = await this.load(true); // Force reload for freshness

    registry.sessions = registry.sessions || {};
    registry.sessions[sessionId] = {
      ...sessionData,
      registered_at: new Date().toISOString(),
    };

    // Update next_id if needed
    const numericId = parseInt(sessionId, 10);
    if (!isNaN(numericId) && numericId >= registry.next_id) {
      registry.next_id = numericId + 1;
    }

    const result = await this.save(registry);

    if (result.ok) {
      this._auditLog('register', { sessionId, sessionData });
      this.emit('registered', { sessionId, session: registry.sessions[sessionId] });
    }

    return result;
  }

  /**
   * Unregister a session
   * @param {number|string} sessionId - Session ID
   * @returns {Promise<{ok: boolean, found: boolean, error?: Error}>}
   */
  async unregisterSession(sessionId) {
    const registry = await this.load(true);

    if (!registry.sessions || !registry.sessions[sessionId]) {
      return { ok: true, found: false };
    }

    delete registry.sessions[sessionId];
    const result = await this.save(registry);

    if (result.ok) {
      this._auditLog('unregister', { sessionId });
      this.emit('unregistered', { sessionId });
      return { ok: true, found: true };
    }

    return { ...result, found: true };
  }

  /**
   * Update a session
   * @param {number|string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{ok: boolean, found: boolean, error?: Error}>}
   */
  async updateSession(sessionId, updates) {
    const registry = await this.load(true);

    if (!registry.sessions || !registry.sessions[sessionId]) {
      return { ok: false, found: false, error: new Error(`Session ${sessionId} not found`) };
    }

    registry.sessions[sessionId] = {
      ...registry.sessions[sessionId],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const result = await this.save(registry);

    if (result.ok) {
      this._auditLog('update', { sessionId, updates });
      this.emit('updated', { sessionId, changes: updates });
      return { ok: true, found: true };
    }

    return { ...result, found: true };
  }

  /**
   * Start batch mode - changes are queued until commitBatch()
   */
  startBatch() {
    this._batchMode = true;
    this._batchChanges = [];
  }

  /**
   * Add operation to batch
   * @param {string} operation - 'register', 'unregister', 'update'
   * @param {Object} params - Operation parameters
   */
  addToBatch(operation, params) {
    if (!this._batchMode) {
      throw new Error('Not in batch mode. Call startBatch() first.');
    }
    this._batchChanges.push({ operation, params });
  }

  /**
   * Commit all batched changes in one write
   * @returns {Promise<{ok: boolean, applied: number, error?: Error}>}
   */
  async commitBatch() {
    if (!this._batchMode) {
      return { ok: false, applied: 0, error: new Error('Not in batch mode') };
    }

    const registry = await this.load(true);
    let applied = 0;

    for (const change of this._batchChanges) {
      const { operation, params } = change;

      switch (operation) {
        case 'register': {
          registry.sessions = registry.sessions || {};
          registry.sessions[params.sessionId] = {
            ...params.sessionData,
            registered_at: new Date().toISOString(),
          };
          const numericId = parseInt(params.sessionId, 10);
          if (!isNaN(numericId) && numericId >= registry.next_id) {
            registry.next_id = numericId + 1;
          }
          applied++;
          break;
        }
        case 'unregister': {
          if (registry.sessions?.[params.sessionId]) {
            delete registry.sessions[params.sessionId];
            applied++;
          }
          break;
        }
        case 'update': {
          if (registry.sessions?.[params.sessionId]) {
            registry.sessions[params.sessionId] = {
              ...registry.sessions[params.sessionId],
              ...params.updates,
              updated_at: new Date().toISOString(),
            };
            applied++;
          }
          break;
        }
      }
    }

    const result = await this.save(registry);

    // Clear batch state
    this._batchMode = false;
    this._batchChanges = [];

    if (result.ok) {
      this._auditLog('batch', { applied });
      return { ok: true, applied };
    }

    return { ...result, applied };
  }

  /**
   * Cancel batch mode without saving
   */
  cancelBatch() {
    this._batchMode = false;
    this._batchChanges = [];
  }

  /**
   * Count sessions by status
   * @returns {Promise<{total: number, active: number, inactive: number}>}
   */
  async countSessions() {
    const registry = await this.load();
    const sessions = Object.values(registry.sessions || {});

    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      inactive: sessions.filter(s => s.status !== 'active').length,
    };
  }

  /**
   * Clean up stale sessions
   * @param {Function} isAlive - Function to check if session is alive (sessionId) => boolean
   * @returns {Promise<{ok: boolean, cleaned: number}>}
   */
  async cleanupStaleSessions(isAlive) {
    const registry = await this.load(true);
    let cleaned = 0;

    for (const [sessionId, session] of Object.entries(registry.sessions || {})) {
      if (!isAlive(sessionId, session)) {
        delete registry.sessions[sessionId];
        cleaned++;
        this._auditLog('cleanup', { sessionId });
        this.emit('unregistered', { sessionId });
      }
    }

    if (cleaned > 0) {
      const result = await this.save(registry);
      return { ok: result.ok, cleaned };
    }

    return { ok: true, cleaned: 0 };
  }
}

module.exports = { SessionRegistry };
