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
  'cost_warning',
];

/**
 * Model pricing per million tokens (USD).
 * Includes both shorthand aliases and full model IDs.
 */
const MODEL_PRICING = {
  haiku: { input: 0.8, output: 4.0 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
};

const DEFAULT_COST_THRESHOLD_USD = 5.0;

/**
 * Get list of files modified since a git reference.
 *
 * @param {string} rootDir - Project root directory (git working tree)
 * @param {string} [sinceRef='HEAD'] - Git ref to diff against
 * @returns {string[]} Sorted, deduplicated list of modified file paths
 */
function getModifiedFiles(rootDir, sinceRef) {
  try {
    const { execFileSync } = require('child_process');
    const output = execFileSync('git', ['diff', '--name-only', sinceRef || 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return output ? [...new Set(output.split('\n'))].sort() : [];
  } catch (e) {
    return []; // fail-open
  }
}

/**
 * Compute estimated cost for an agent's token usage.
 *
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} [model='haiku'] - Model name or alias
 * @returns {number} Estimated cost in USD (6 decimal places)
 */
function computeAgentCost(inputTokens, outputTokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['haiku'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Check if team cost exceeds threshold and emit warning event.
 *
 * @param {string} rootDir - Project root directory
 * @param {string} traceId - Trace ID for the team run
 * @param {number} totalCostUsd - Total cost in USD
 * @param {number} [threshold] - Cost threshold in USD (default: DEFAULT_COST_THRESHOLD_USD)
 * @returns {boolean} True if threshold was exceeded
 */
function checkCostThreshold(rootDir, traceId, totalCostUsd, threshold) {
  const limit = typeof threshold === 'number' ? threshold : DEFAULT_COST_THRESHOLD_USD;
  const cost = typeof totalCostUsd === 'number' && isFinite(totalCostUsd) ? totalCostUsd : 0;
  if (cost > limit) {
    trackEvent(rootDir, 'cost_warning', {
      trace_id: traceId,
      total_cost_usd: cost,
      threshold_usd: limit,
      message: `Team cost $${cost.toFixed(4)} exceeds threshold $${limit.toFixed(2)}`,
    });
    return true;
  }
  return false;
}

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
      fileLock.atomicReadModifyWrite(sessionStatePath, state => {
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
  const ensureAgent = agent => {
    if (!perAgent[agent]) {
      perAgent[agent] = {
        total_duration_ms: 0,
        tasks_completed: 0,
        errors: 0,
        timeouts: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        files_modified: [],
      };
    }
  };

  // Track model per agent for cost computation
  const agentModels = {};

  for (const e of events) {
    if (e.type === 'task_completed' && e.agent) {
      ensureAgent(e.agent);
      perAgent[e.agent].total_duration_ms += e.duration_ms || 0;
      perAgent[e.agent].tasks_completed++;
      perAgent[e.agent].input_tokens += e.input_tokens || 0;
      perAgent[e.agent].output_tokens += e.output_tokens || 0;
      if (e.model) agentModels[e.agent] = e.model;
      if (Array.isArray(e.files_modified)) {
        perAgent[e.agent].files_modified.push(...e.files_modified);
      }
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

  // Compute per-agent costs (uses last-seen model for all tokens; acceptable
  // approximation since agents typically use a single model throughout)
  for (const [agent, metrics] of Object.entries(perAgent)) {
    metrics.cost_usd = computeAgentCost(
      metrics.input_tokens,
      metrics.output_tokens,
      agentModels[agent] || 'haiku'
    );
  }
  const totalCostUsd = Object.values(perAgent).reduce((sum, a) => sum + a.cost_usd, 0);

  // Deduplicate and sort per-agent files_modified, compute union
  const allFilesSet = new Set();
  for (const metrics of Object.values(perAgent)) {
    metrics.files_modified = [...new Set(metrics.files_modified)].sort();
    metrics.files_modified.forEach(f => allFilesSet.add(f));
  }
  const allFilesModified = [...allFilesSet].sort();

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
    all_files_modified: allFilesModified,
    team_completion_ms: teamCompletionMs,
    total_cost_usd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
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
      fileLock.atomicReadModifyWrite(sessionStatePath, state => {
        if (!state.team_metrics) state.team_metrics = {};
        if (!state.team_metrics.traces) state.team_metrics.traces = {};
        state.team_metrics.traces[metrics.trace_id] = {
          per_agent: metrics.per_agent,
          per_gate: metrics.per_gate,
          team_completion_ms: metrics.team_completion_ms,
          total_cost_usd: metrics.total_cost_usd,
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
        total_cost_usd: metrics.total_cost_usd,
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
  MODEL_PRICING,
  DEFAULT_COST_THRESHOLD_USD,
  trackEvent,
  getTeamEvents,
  aggregateTeamMetrics,
  saveAggregatedMetrics,
  computeAgentCost,
  checkCostThreshold,
  getModifiedFiles,
  teamMetricsEmitter,
};
