/**
 * team-events.js - Observability event tracking for Agent Teams
 *
 * Captures team lifecycle events and stores them in session-state.json
 * and the JSONL message bus. Events include:
 *   - team_created: Team started from template
 *   - team_stopped: Team shut down
 *   - task_assigned: Task given to a teammate
 *   - task_completed: Task finished by a teammate
 *   - agent_error: Teammate encountered an error
 *   - agent_timeout: Teammate exceeded time limit
 *
 * Usage:
 *   const { trackEvent, getTeamEvents } = require('./lib/team-events');
 *
 *   trackEvent(rootDir, 'task_completed', {
 *     agent: 'api-builder',
 *     task_id: 'task_1',
 *     duration_ms: 5200,
 *   });
 */

const fs = require('fs');
const path = require('path');

// Lazy-load dependencies
let _fileLock;
function getFileLock() {
  if (!_fileLock) {
    try {
      _fileLock = require('./file-lock');
    } catch (e) {
      _fileLock = null;
    }
  }
  return _fileLock;
}

let _messagingBridge;
function getMessagingBridge() {
  if (!_messagingBridge) {
    try {
      _messagingBridge = require('../messaging-bridge');
    } catch (e) {
      _messagingBridge = null;
    }
  }
  return _messagingBridge;
}

let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../../lib/paths');
    } catch (e) {
      _paths = null;
    }
  }
  return _paths;
}

/**
 * Valid event types for agent teams
 */
const EVENT_TYPES = [
  'team_created',
  'team_stopped',
  'task_assigned',
  'task_completed',
  'agent_error',
  'agent_timeout',
  'gate_passed',
  'gate_failed',
  'model_usage',
];

/**
 * Track an agent teams event.
 *
 * Writes to both:
 * 1. session-state.json (hook_metrics.teams section) for real-time status
 * 2. JSONL bus (via messaging-bridge) for historical audit trail
 *
 * @param {string} rootDir - Project root directory
 * @param {string} eventType - Event type (see EVENT_TYPES)
 * @param {object} data - Event data (agent, task_id, duration_ms, etc.)
 * @returns {{ ok: boolean, error?: string }}
 */
function trackEvent(rootDir, eventType, data = {}) {
  const event = {
    type: eventType,
    at: new Date().toISOString(),
    ...data,
  };

  // 1. Update session-state.json
  try {
    const paths = getPaths();
    const sessionStatePath = paths
      ? paths.getSessionStatePath(rootDir)
      : path.join(rootDir, 'docs', '09-agents', 'session-state.json');

    const fileLock = getFileLock();

    if (fileLock && fs.existsSync(sessionStatePath)) {
      fileLock.atomicReadModifyWrite(sessionStatePath, (state) => {
        if (!state.hook_metrics) state.hook_metrics = {};
        if (!state.hook_metrics.teams) state.hook_metrics.teams = { events: [], summary: {} };

        const teams = state.hook_metrics.teams;

        // Append to events (keep last 50)
        teams.events.push(event);
        if (teams.events.length > 50) {
          teams.events = teams.events.slice(-50);
        }

        // Update summary counters
        if (!teams.summary[eventType]) teams.summary[eventType] = 0;
        teams.summary[eventType]++;

        teams.last_updated = event.at;

        return state;
      });
    }
  } catch (e) {
    // Non-critical - continue to bus logging
  }

  // 2. Log to JSONL bus
  try {
    const bridge = getMessagingBridge();
    if (bridge) {
      bridge.sendMessage(rootDir, {
        from: data.agent || 'team-events',
        to: 'observability',
        type: eventType,
        ...data,
      });
    }
  } catch (e) {
    // Non-critical
  }

  return { ok: true };
}

/**
 * Get team events from session-state.json.
 *
 * @param {string} rootDir - Project root directory
 * @param {object} [filters] - Optional filters { type, agent, trace_id, since, limit }
 * @returns {{ ok: boolean, events?: Array, summary?: object }}
 */
function getTeamEvents(rootDir, filters = {}) {
  try {
    const paths = getPaths();
    const sessionStatePath = paths
      ? paths.getSessionStatePath(rootDir)
      : path.join(rootDir, 'docs', '09-agents', 'session-state.json');

    if (!fs.existsSync(sessionStatePath)) {
      return { ok: true, events: [], summary: {} };
    }

    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    const teams = state.hook_metrics && state.hook_metrics.teams;
    if (!teams) {
      return { ok: true, events: [], summary: {} };
    }

    let events = teams.events || [];

    // Apply filters
    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }
    if (filters.agent) {
      events = events.filter(e => e.agent === filters.agent);
    }
    if (filters.trace_id) {
      events = events.filter(e => e.trace_id === filters.trace_id);
    }
    if (filters.since) {
      const sinceTime = new Date(filters.since).getTime();
      events = events.filter(e => new Date(e.at).getTime() >= sinceTime);
    }
    if (filters.limit && filters.limit > 0) {
      events = events.slice(-filters.limit);
    }

    return {
      ok: true,
      events,
      summary: teams.summary || {},
    };
  } catch (e) {
    return { ok: false, error: e.message, events: [] };
  }
}

module.exports = {
  EVENT_TYPES,
  trackEvent,
  getTeamEvents,
};
