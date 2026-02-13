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
const { EventEmitter } = require('events');

/**
 * Module-level event emitter for cross-module notifications.
 * Emits 'metrics_saved' after saveAggregatedMetrics() succeeds.
 */
const teamMetricsEmitter = new EventEmitter();

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

/**
 * Aggregate team metrics from events filtered by trace_id.
 *
 * Computes:
 * - Per-agent: total duration, tasks completed, errors, timeouts
 * - Per-gate: passed/failed counts and pass rate
 * - Team completion time (team_created → team_stopped)
 *
 * @param {string} rootDir - Project root directory
 * @param {string} traceId - Trace ID to aggregate metrics for
 * @returns {{ ok: boolean, trace_id: string, per_agent: object, per_gate: object, team_completion_ms: number|null, computed_at: string }}
 */
function aggregateTeamMetrics(rootDir, traceId) {
  if (!traceId) {
    return { ok: false, error: 'trace_id is required' };
  }

  const result = getTeamEvents(rootDir, { trace_id: traceId });
  const events = result.events || [];

  // Per-agent metrics from task_completed, agent_error, agent_timeout
  const perAgent = {};
  const ensureAgent = (agent) => {
    if (!perAgent[agent]) {
      perAgent[agent] = { total_duration_ms: 0, tasks_completed: 0, errors: 0, timeouts: 0 };
    }
  };

  for (const e of events) {
    if (e.type === 'task_completed' && e.agent) {
      ensureAgent(e.agent);
      perAgent[e.agent].total_duration_ms += (e.duration_ms || 0);
      perAgent[e.agent].tasks_completed++;
    }
    if (e.type === 'agent_error' && e.agent) {
      ensureAgent(e.agent);
      perAgent[e.agent].errors++;
    }
    if (e.type === 'agent_timeout' && e.agent) {
      ensureAgent(e.agent);
      perAgent[e.agent].timeouts++;
    }
  }

  // Per-gate metrics from gate_passed, gate_failed
  const perGate = {};
  for (const e of events) {
    if (e.type === 'gate_passed' || e.type === 'gate_failed') {
      const gateType = e.gate || 'unknown';
      if (!perGate[gateType]) perGate[gateType] = { passed: 0, failed: 0, pass_rate: 0 };
      if (e.type === 'gate_passed') perGate[gateType].passed++;
      else perGate[gateType].failed++;
    }
  }
  for (const gate of Object.keys(perGate)) {
    const total = perGate[gate].passed + perGate[gate].failed;
    perGate[gate].pass_rate = total > 0 ? perGate[gate].passed / total : 0;
  }

  // Team completion time from team_created → team_stopped
  let teamCompletionMs = null;
  const created = events.find(e => e.type === 'team_created');
  const stopped = events.find(e => e.type === 'team_stopped');
  if (created && stopped) {
    teamCompletionMs = new Date(stopped.at).getTime() - new Date(created.at).getTime();
  }

  return {
    ok: true,
    trace_id: traceId,
    per_agent: perAgent,
    per_gate: perGate,
    team_completion_ms: teamCompletionMs,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Save aggregated metrics to session-state.json under team_metrics.traces[trace_id].
 *
 * @param {string} rootDir - Project root directory
 * @param {object} metrics - Output from aggregateTeamMetrics()
 * @returns {{ ok: boolean, error?: string }}
 */
function saveAggregatedMetrics(rootDir, metrics) {
  if (!metrics || !metrics.trace_id) {
    return { ok: false, error: 'metrics with trace_id required' };
  }

  try {
    const paths = getPaths();
    const sessionStatePath = paths
      ? paths.getSessionStatePath(rootDir)
      : path.join(rootDir, 'docs', '09-agents', 'session-state.json');

    const fileLock = getFileLock();

    if (fileLock && fs.existsSync(sessionStatePath)) {
      fileLock.atomicReadModifyWrite(sessionStatePath, (state) => {
        if (!state.team_metrics) state.team_metrics = {};
        if (!state.team_metrics.traces) state.team_metrics.traces = {};
        state.team_metrics.traces[metrics.trace_id] = {
          per_agent: metrics.per_agent,
          per_gate: metrics.per_gate,
          team_completion_ms: metrics.team_completion_ms,
          computed_at: metrics.computed_at,
        };
        return state;
      });
    } else {
      // Fallback to direct write
      let state = {};
      if (fs.existsSync(sessionStatePath)) {
        state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      }
      if (!state.team_metrics) state.team_metrics = {};
      if (!state.team_metrics.traces) state.team_metrics.traces = {};
      state.team_metrics.traces[metrics.trace_id] = {
        per_agent: metrics.per_agent,
        per_gate: metrics.per_gate,
        team_completion_ms: metrics.team_completion_ms,
        computed_at: metrics.computed_at,
      };
      fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    }

    // Notify listeners (e.g., dashboard server) that metrics were saved
    try {
      teamMetricsEmitter.emit('metrics_saved', { trace_id: metrics.trace_id });
    } catch (_) {
      // Non-critical
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  EVENT_TYPES,
  trackEvent,
  getTeamEvents,
  aggregateTeamMetrics,
  saveAggregatedMetrics,
  teamMetricsEmitter,
};
