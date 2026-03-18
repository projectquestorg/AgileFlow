/**
 * workspace-bus.js - Workspace-Level Message Bus
 *
 * Dual-writes events to both the workspace-level bus and per-project buses.
 * Every message gets a `project` field for filtering.
 *
 * The workspace bus lives at:
 *   .agileflow-workspace/workspace-bus/log.jsonl
 *
 * Per-project buses are at their normal locations:
 *   {project}/docs/09-agents/bus/log.jsonl
 *
 * Usage:
 *   const { WorkspaceBus } = require('./workspace-bus');
 *   const bus = new WorkspaceBus('/path/to/workspace');
 *   bus.send('frontend', { type: 'task_completed', agent: 'api', task_id: 'task-1' });
 *   const msgs = bus.read({ project: 'frontend', limit: 10 });
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { WORKSPACE_DIR, WORKSPACE_BUS_DIR, getWorkspaceConfig } = require('./workspace-discovery');
const { atomicWrite } = require('./task-registry');

const MAX_BUS_LINES = 2000;
const KEEP_RECENT = 200;

/**
 * WorkspaceBus - Cross-project event bus with dual-write
 */
class WorkspaceBus {
  /**
   * @param {string} workspaceRoot - Workspace root directory
   */
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.busDir = path.join(workspaceRoot, WORKSPACE_DIR, WORKSPACE_BUS_DIR);
    this.logPath = path.join(this.busDir, 'log.jsonl');
  }

  /**
   * Send a message to the workspace bus (and optionally to a project bus).
   *
   * @param {string} project - Project name this event belongs to
   * @param {object} message - Event data (type, agent, task_id, etc.)
   * @param {object} [options] - Options
   * @param {boolean} [options.dualWrite=true] - Also write to per-project bus
   * @returns {{ ok: boolean, error?: string }}
   */
  send(project, message, options = {}) {
    const { dualWrite = true } = options;

    const entry = {
      project,
      at: new Date().toISOString(),
      ...message,
    };

    const line = JSON.stringify(entry) + '\n';

    // 1. Write to workspace bus
    try {
      if (!fs.existsSync(this.busDir)) {
        fs.mkdirSync(this.busDir, { recursive: true });
      }
      fs.appendFileSync(this.logPath, line);
      this._maybeRotate(this.logPath);
    } catch (e) {
      return { ok: false, error: `Workspace bus write failed: ${e.message}` };
    }

    // 2. Dual-write to per-project bus
    if (dualWrite) {
      try {
        const configResult = getWorkspaceConfig(this.workspaceRoot);
        if (configResult.ok) {
          const projectConfig = configResult.config.projects.find(p => p.name === project);
          if (projectConfig) {
            const projectBusDir = path.join(projectConfig.path, 'docs', '09-agents', 'bus');
            const projectBusLog = path.join(projectBusDir, 'log.jsonl');
            if (fs.existsSync(projectBusDir)) {
              fs.appendFileSync(projectBusLog, line);
            }
          }
        }
      } catch (e) {
        // Non-critical - workspace bus is the source of truth
      }
    }

    return { ok: true };
  }

  /**
   * Read messages from the workspace bus.
   *
   * @param {object} [filters] - Optional filters
   * @param {string} [filters.project] - Filter by project name
   * @param {string} [filters.type] - Filter by event type
   * @param {string} [filters.agent] - Filter by agent name
   * @param {string} [filters.since] - ISO date string for minimum timestamp
   * @param {number} [filters.limit] - Max messages to return (from end)
   * @returns {{ ok: boolean, messages: object[] }}
   */
  read(filters = {}) {
    if (!fs.existsSync(this.logPath)) {
      return { ok: true, messages: [] };
    }

    try {
      const content = fs.readFileSync(this.logPath, 'utf8').trim();
      if (!content) return { ok: true, messages: [] };

      let messages = content
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      // Apply filters
      if (filters.project) {
        messages = messages.filter(m => m.project === filters.project);
      }
      if (filters.type) {
        messages = messages.filter(m => m.type === filters.type);
      }
      if (filters.agent) {
        messages = messages.filter(m => m.agent === filters.agent);
      }
      if (filters.since) {
        const sinceTime = new Date(filters.since).getTime();
        if (isNaN(sinceTime)) {
          return { ok: false, messages: [], error: `Invalid 'since' value: ${filters.since}` };
        }
        messages = messages.filter(m => new Date(m.at).getTime() >= sinceTime);
      }
      if (filters.limit && filters.limit > 0) {
        messages = messages.slice(-filters.limit);
      }

      return { ok: true, messages };
    } catch (e) {
      return { ok: false, messages: [], error: e.message };
    }
  }

  /**
   * Get per-project message counts.
   * @returns {{ [project: string]: number }}
   */
  getMessageCounts() {
    const result = this.read();
    if (!result.ok) return {};

    const counts = {};
    for (const msg of result.messages) {
      const project = msg.project || 'unknown';
      counts[project] = (counts[project] || 0) + 1;
    }
    return counts;
  }

  /**
   * Rotate log if it exceeds MAX_BUS_LINES.
   * Keeps only the most recent KEEP_RECENT lines.
   *
   * @param {string} logPath - Path to the log file
   * @private
   */
  _maybeRotate(logPath) {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length > MAX_BUS_LINES) {
        const kept = lines.slice(-KEEP_RECENT);
        atomicWrite(logPath, kept.join('\n') + '\n');
      }
    } catch (e) {
      // Non-critical
    }
  }
}

module.exports = { WorkspaceBus };
