/**
 * workspace-registry.js - Cross-Repo Session Registry
 *
 * Extends the per-project SessionRegistry pattern for workspace-scoped
 * session tracking. Federates per-project registries into a unified view.
 *
 * Key design decisions:
 * - Session IDs are project-prefixed (e.g., "frontend-1") to prevent collisions
 * - Per-project registries are NOT modified; workspace registry is additive
 * - Federated getAllSessions() merges per-project registries on demand
 *
 * Usage:
 *   const { WorkspaceRegistry } = require('./workspace-registry');
 *   const reg = new WorkspaceRegistry('/path/to/workspace');
 *   const sessions = reg.getAllSessions();
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { WORKSPACE_DIR, WORKSPACE_REGISTRY, getWorkspaceConfig } = require('./workspace-discovery');
const { FileLock, atomicWrite } = require('./task-registry');

/**
 * WorkspaceRegistry - Cross-project session tracking
 */
class WorkspaceRegistry {
  /**
   * @param {string} workspaceRoot - Workspace root directory
   */
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.registryPath = path.join(workspaceRoot, WORKSPACE_DIR, WORKSPACE_REGISTRY);
    this.lockPath = path.join(workspaceRoot, WORKSPACE_DIR, 'workspace-registry.lock');
  }

  /**
   * Load workspace registry from disk.
   * @returns {object} Registry data
   */
  load() {
    if (!fs.existsSync(this.registryPath)) {
      return this._createDefault();
    }

    try {
      return JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
    } catch (e) {
      return this._createDefault();
    }
  }

  /**
   * Save workspace registry to disk (atomic write).
   * @param {object} registry - Registry data
   */
  save(registry) {
    registry.updated_at = new Date().toISOString();
    atomicWrite(this.registryPath, JSON.stringify(registry, null, 2) + '\n');
  }

  /**
   * Register a workspace-level session.
   * Uses FileLock to prevent concurrent write corruption.
   *
   * @param {string} projectName - Project this session belongs to
   * @param {object} sessionData - Session data (sessionId, path, branch, etc.)
   * @returns {{ ok: boolean, workspaceSessionId?: string, error?: string }}
   */
  registerSession(projectName, sessionData) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) {
      return { ok: false, error: 'Could not acquire workspace registry lock' };
    }

    try {
      const registry = this.load();
      const projectSessionId = sessionData.sessionId || sessionData.id || 'unknown';
      const workspaceSessionId = `${projectName}-${projectSessionId}`;

      registry.sessions[workspaceSessionId] = {
        project: projectName,
        project_session_id: projectSessionId,
        path: sessionData.path,
        branch: sessionData.branch || null,
        nickname: sessionData.nickname || null,
        created_at: new Date().toISOString(),
        status: 'active',
      };

      this.save(registry);
      return { ok: true, workspaceSessionId };
    } finally {
      lock.release();
    }
  }

  /**
   * Unregister a workspace-level session.
   * Uses FileLock to prevent concurrent write corruption.
   *
   * @param {string} workspaceSessionId - Workspace session ID (e.g., "frontend-1")
   */
  unregisterSession(workspaceSessionId) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) return;

    try {
      const registry = this.load();
      delete registry.sessions[workspaceSessionId];
      this.save(registry);
    } finally {
      lock.release();
    }
  }

  /**
   * Get all workspace-level sessions.
   * @returns {object} Map of workspaceSessionId → session data
   */
  getWorkspaceSessions() {
    const registry = this.load();
    return registry.sessions || {};
  }

  /**
   * Federate: merge per-project registries into a unified view.
   * Reads each project's .agileflow/sessions/registry.json and prefixes IDs.
   *
   * @returns {{ project: string, sessions: object[] }[]}
   */
  getAllSessions() {
    const configResult = getWorkspaceConfig(this.workspaceRoot);
    if (!configResult.ok) return [];

    const projects = configResult.config.projects || [];
    const result = [];

    for (const project of projects) {
      const projectExists = fs.existsSync(project.path);
      const registryPath = path.join(project.path, '.agileflow', 'sessions', 'registry.json');
      let sessions = {};

      if (projectExists && fs.existsSync(registryPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
          sessions = data.sessions || {};
        } catch (e) {
          // Skip unreadable registries
        }
      }

      const sessionList = Object.entries(sessions).map(([id, session]) => ({
        id,
        workspaceId: `${project.name}-${id}`,
        project: project.name,
        ...session,
      }));

      result.push({
        project: project.name,
        projectPath: project.path,
        stale: !projectExists,
        sessions: sessionList,
      });
    }

    return result;
  }

  /**
   * Get a flat list of all sessions across all projects.
   * @returns {object[]}
   */
  getAllSessionsFlat() {
    return this.getAllSessions().flatMap(p => p.sessions);
  }

  /**
   * Get sessions for a specific project.
   * @param {string} projectName - Project name
   * @returns {object[]}
   */
  getProjectSessions(projectName) {
    const all = this.getAllSessions();
    const project = all.find(p => p.project === projectName);
    return project ? project.sessions : [];
  }

  /**
   * Get summary statistics.
   * @returns {{ totalProjects: number, totalSessions: number, byProject: object }}
   */
  getSummary() {
    const all = this.getAllSessions();
    const byProject = {};
    let totalSessions = 0;

    for (const project of all) {
      byProject[project.project] = project.sessions.length;
      totalSessions += project.sessions.length;
    }

    return {
      totalProjects: all.length,
      totalSessions,
      byProject,
    };
  }

  /**
   * Create default empty registry.
   * @returns {object}
   * @private
   */
  _createDefault() {
    return {
      schema_version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sessions: {},
    };
  }
}

module.exports = { WorkspaceRegistry };
