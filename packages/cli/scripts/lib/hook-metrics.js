/**
 * hook-metrics.js - Hook timing and performance metrics utility
 *
 * Provides utilities for recording hook execution metrics to session-state.json.
 * This enables observability into hook performance without changing tech stack.
 *
 * Usage:
 *   const { startHookTimer, recordHookMetrics, getHookMetrics } = require('./lib/hook-metrics');
 *
 *   // At start of hook
 *   const timer = startHookTimer('SessionStart', 'welcome');
 *
 *   // ... do hook work ...
 *
 *   // At end of hook (success)
 *   recordHookMetrics(timer, 'success');
 *
 *   // Or on failure
 *   recordHookMetrics(timer, 'error', 'Parse error');
 *
 * Metrics structure in session-state.json:
 * {
 *   "hook_metrics": {
 *     "last_updated": "2026-02-02T12:00:00.000Z",
 *     "session_total_ms": 565,
 *     "hooks": {
 *       "SessionStart": {
 *         "welcome": { "duration_ms": 245, "status": "success", "at": "..." },
 *         "archive": { "duration_ms": 120, "status": "success", "at": "..." }
 *       },
 *       "PreToolUse": {
 *         "damage_control_bash": { "duration_ms": 50, "status": "success", "at": "..." }
 *       }
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

// Get paths module if available, otherwise use defaults
let getSessionStatePath;
try {
  ({ getSessionStatePath } = require('./paths'));
} catch (e) {
  // Fallback: find session-state.json manually
  getSessionStatePath = rootDir => {
    const possiblePaths = [
      path.join(rootDir, 'docs', '09-agents', 'session-state.json'),
      path.join(rootDir, '.agileflow', 'session-state.json'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return possiblePaths[0]; // Default to first path
  };
}

/**
 * Find the project root directory
 * @returns {string} Project root path
 */
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.agileflow'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, 'docs', '09-agents'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Start a timer for hook execution
 *
 * @param {string} hookEvent - Hook event type (SessionStart, PreToolUse, PreCompact, Stop)
 * @param {string} hookName - Name of the specific hook (welcome, archive, damage_control_bash)
 * @returns {object} Timer object with start time and metadata
 */
function startHookTimer(hookEvent, hookName) {
  return {
    hookEvent,
    hookName,
    startTime: Date.now(),
    startHrTime: process.hrtime.bigint(),
  };
}

/**
 * Record hook execution metrics to session-state.json
 *
 * @param {object} timer - Timer object from startHookTimer
 * @param {string} status - Execution status ('success', 'error', 'blocked', 'timeout')
 * @param {string} [errorMessage] - Optional error message if status is 'error'
 * @param {object} [options] - Additional options
 * @param {string} [options.rootDir] - Project root directory (auto-detected if not provided)
 * @returns {object} Result with { ok, duration_ms, error? }
 */
function recordHookMetrics(timer, status, errorMessage = null, options = {}) {
  const result = {
    ok: false,
    duration_ms: 0,
  };

  try {
    // Calculate duration
    const endTime = Date.now();
    const durationMs = endTime - timer.startTime;
    result.duration_ms = durationMs;

    // Find project root and session state file
    const rootDir = options.rootDir || findProjectRoot();
    const sessionStatePath = getSessionStatePath(rootDir);

    // Ensure directory exists
    const dir = path.dirname(sessionStatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing session state
    let state = {};
    if (fs.existsSync(sessionStatePath)) {
      try {
        state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      } catch (e) {
        // Invalid JSON - start fresh
        state = {};
      }
    }

    // Initialize hook_metrics if not present
    if (!state.hook_metrics) {
      state.hook_metrics = {
        last_updated: null,
        session_total_ms: 0,
        hooks: {},
      };
    }

    // Initialize event type if not present
    if (!state.hook_metrics.hooks[timer.hookEvent]) {
      state.hook_metrics.hooks[timer.hookEvent] = {};
    }

    // Record the metric
    const metric = {
      duration_ms: durationMs,
      status,
      at: new Date().toISOString(),
    };

    if (errorMessage) {
      metric.error = errorMessage;
    }

    state.hook_metrics.hooks[timer.hookEvent][timer.hookName] = metric;
    state.hook_metrics.last_updated = new Date().toISOString();

    // Recalculate session total
    let total = 0;
    for (const eventHooks of Object.values(state.hook_metrics.hooks)) {
      for (const hookMetric of Object.values(eventHooks)) {
        total += hookMetric.duration_ms || 0;
      }
    }
    state.hook_metrics.session_total_ms = total;

    // Write back
    fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');

    result.ok = true;
  } catch (e) {
    result.error = e.message;
    // Fail silently - metrics should never break hook execution
  }

  return result;
}

/**
 * Get current hook metrics from session-state.json
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory (auto-detected if not provided)
 * @returns {object} Hook metrics or empty object if not found
 */
function getHookMetrics(options = {}) {
  try {
    const rootDir = options.rootDir || findProjectRoot();
    const sessionStatePath = getSessionStatePath(rootDir);

    if (!fs.existsSync(sessionStatePath)) {
      return { hooks: {}, session_total_ms: 0 };
    }

    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    return state.hook_metrics || { hooks: {}, session_total_ms: 0 };
  } catch (e) {
    return { hooks: {}, session_total_ms: 0, error: e.message };
  }
}

/**
 * Clear hook metrics (useful for testing or session reset)
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {object} Result with { ok, error? }
 */
function clearHookMetrics(options = {}) {
  try {
    const rootDir = options.rootDir || findProjectRoot();
    const sessionStatePath = getSessionStatePath(rootDir);

    if (!fs.existsSync(sessionStatePath)) {
      return { ok: true };
    }

    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    state.hook_metrics = {
      last_updated: new Date().toISOString(),
      session_total_ms: 0,
      hooks: {},
    };

    fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Format hook metrics for display
 *
 * @param {object} metrics - Metrics from getHookMetrics()
 * @returns {string} Formatted string for display
 */
function formatHookMetrics(metrics) {
  if (!metrics || !metrics.hooks) {
    return 'No hook metrics recorded';
  }

  const lines = [];
  lines.push(`Hook Metrics (total: ${metrics.session_total_ms}ms)`);
  lines.push('─'.repeat(50));

  for (const [event, hooks] of Object.entries(metrics.hooks)) {
    lines.push(`  ${event}:`);
    for (const [name, data] of Object.entries(hooks)) {
      const status = data.status === 'success' ? '✓' : data.status === 'error' ? '✗' : '?';
      const error = data.error ? ` (${data.error})` : '';
      lines.push(`    ${status} ${name}: ${data.duration_ms}ms${error}`);
    }
  }

  if (metrics.last_updated) {
    lines.push('');
    lines.push(`Last updated: ${metrics.last_updated}`);
  }

  return lines.join('\n');
}

/**
 * Wrapper to time an async function and record metrics
 *
 * @param {string} hookEvent - Hook event type
 * @param {string} hookName - Hook name
 * @param {function} fn - Async function to time
 * @param {object} [options] - Options passed to recordHookMetrics
 * @returns {Promise<any>} Result of the function
 */
async function withHookMetrics(hookEvent, hookName, fn, options = {}) {
  const timer = startHookTimer(hookEvent, hookName);

  try {
    const result = await fn();
    recordHookMetrics(timer, 'success', null, options);
    return result;
  } catch (e) {
    recordHookMetrics(timer, 'error', e.message, options);
    throw e;
  }
}

/**
 * Wrapper to time a sync function and record metrics
 *
 * @param {string} hookEvent - Hook event type
 * @param {string} hookName - Hook name
 * @param {function} fn - Sync function to time
 * @param {object} [options] - Options passed to recordHookMetrics
 * @returns {any} Result of the function
 */
function withHookMetricsSync(hookEvent, hookName, fn, options = {}) {
  const timer = startHookTimer(hookEvent, hookName);

  try {
    const result = fn();
    recordHookMetrics(timer, 'success', null, options);
    return result;
  } catch (e) {
    recordHookMetrics(timer, 'error', e.message, options);
    throw e;
  }
}

module.exports = {
  startHookTimer,
  recordHookMetrics,
  getHookMetrics,
  clearHookMetrics,
  formatHookMetrics,
  withHookMetrics,
  withHookMetricsSync,
  findProjectRoot,
};
