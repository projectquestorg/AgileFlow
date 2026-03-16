/**
 * bus-logger.js - Agent-level traceability event logger for the bus log
 *
 * Provides typed helper functions for logging agent actions to docs/09-agents/bus/log.jsonl.
 * Supports event types: agent_finding, agent_change, agent_gate_check.
 *
 * These events enable reconstructing what agent did what, when, where - a core
 * anti-slop traceability requirement from Jim West's framework.
 *
 * Usage:
 *   const { createBusLogger } = require('./lib/bus-logger');
 *   const logger = createBusLogger({ logPath: 'docs/09-agents/bus/log.jsonl' });
 *   logger.logFinding({ agent: 'security-analyzer', storyId: 'US-0123', ... });
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// Constants
// ============================================================================

/**
 * Agent-level event types for bus log traceability
 */
const AGENT_EVENT_TYPES = {
  /** Agent discovered an issue, pattern, or recommendation */
  FINDING: 'agent_finding',
  /** Agent made a code/file change */
  CHANGE: 'agent_change',
  /** Agent checked a quality gate */
  GATE_CHECK: 'agent_gate_check',
};

/**
 * Finding severity levels
 */
const FINDING_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

// ============================================================================
// Core Logger
// ============================================================================

/**
 * Append a single event to the bus log
 * @param {string} logPath - Path to the JSONL log file
 * @param {Object} event - Event object to log
 * @returns {{ ok: boolean, error?: string }}
 */
function appendEvent(logPath, event) {
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(logPath, line, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Create a base event with common fields
 * @param {string} type - Event type
 * @param {Object} data - Event-specific data
 * @returns {Object} Complete event object
 */
function createBaseEvent(type, data) {
  return {
    ts: new Date().toISOString(),
    type,
    agent: data.agent || 'unknown',
    story_id: data.storyId || data.story_id || null,
    ...data,
  };
}

// ============================================================================
// Typed Event Loggers
// ============================================================================

/**
 * Log an agent finding (issue, pattern, or recommendation)
 * @param {string} logPath - Path to the JSONL log file
 * @param {Object} data - Finding data
 * @param {string} data.agent - Agent name that made the finding
 * @param {string} [data.storyId] - Related story ID
 * @param {string} data.finding - Description of what was found
 * @param {string} [data.severity] - Finding severity (critical/high/medium/low/info)
 * @param {string} [data.file] - File path where finding was made
 * @param {number} [data.line] - Line number in file
 * @param {string} [data.category] - Finding category (security, performance, etc.)
 * @returns {{ ok: boolean, event?: Object, error?: string }}
 */
function logFinding(logPath, data) {
  const event = createBaseEvent(AGENT_EVENT_TYPES.FINDING, {
    agent: data.agent,
    storyId: data.storyId,
    finding: data.finding,
    severity: data.severity || FINDING_SEVERITY.MEDIUM,
    file: data.file || null,
    line: data.line || null,
    category: data.category || null,
  });

  const result = appendEvent(logPath, event);
  return result.ok ? { ok: true, event } : result;
}

/**
 * Log an agent change (code or file modification)
 * @param {string} logPath - Path to the JSONL log file
 * @param {Object} data - Change data
 * @param {string} data.agent - Agent name that made the change
 * @param {string} [data.storyId] - Related story ID
 * @param {string} data.action - What was done (create, edit, delete, rename)
 * @param {string} data.file - File that was changed
 * @param {string} [data.summary] - Brief summary of the change
 * @param {number} [data.linesAdded] - Lines added
 * @param {number} [data.linesRemoved] - Lines removed
 * @returns {{ ok: boolean, event?: Object, error?: string }}
 */
function logChange(logPath, data) {
  const event = createBaseEvent(AGENT_EVENT_TYPES.CHANGE, {
    agent: data.agent,
    storyId: data.storyId,
    action: data.action,
    file: data.file,
    summary: data.summary || null,
    lines_added: data.linesAdded || 0,
    lines_removed: data.linesRemoved || 0,
  });

  const result = appendEvent(logPath, event);
  return result.ok ? { ok: true, event } : result;
}

/**
 * Log an agent gate check (quality gate verification)
 * @param {string} logPath - Path to the JSONL log file
 * @param {Object} data - Gate check data
 * @param {string} data.agent - Agent name that ran the gate
 * @param {string} [data.storyId] - Related story ID
 * @param {string} data.gate - Gate name (e.g., "Unit Tests", "Lint")
 * @param {string} data.result - Gate result (passed/failed/skipped/error)
 * @param {string} [data.message] - Result message or error details
 * @param {number} [data.durationMs] - Gate execution time in ms
 * @returns {{ ok: boolean, event?: Object, error?: string }}
 */
function logGateCheck(logPath, data) {
  const event = createBaseEvent(AGENT_EVENT_TYPES.GATE_CHECK, {
    agent: data.agent,
    storyId: data.storyId,
    gate: data.gate,
    result: data.result,
    message: data.message || null,
    duration_ms: data.durationMs || 0,
  });

  const result = appendEvent(logPath, event);
  return result.ok ? { ok: true, event } : result;
}

// ============================================================================
// Bus Logger Factory
// ============================================================================

/**
 * Create a bus logger instance bound to a specific log file
 * @param {Object} options - Logger options
 * @param {string} [options.logPath] - Path to the JSONL log file
 * @param {string} [options.projectRoot] - Project root to resolve default log path
 * @returns {Object} Logger with typed methods
 */
function createBusLogger(options = {}) {
  const logPath =
    options.logPath ||
    path.join(options.projectRoot || process.cwd(), 'docs', '09-agents', 'bus', 'log.jsonl');

  return {
    logPath,

    /**
     * Log an agent finding
     * @param {Object} data - Finding data (see logFinding)
     */
    logFinding: data => logFinding(logPath, data),

    /**
     * Log an agent change
     * @param {Object} data - Change data (see logChange)
     */
    logChange: data => logChange(logPath, data),

    /**
     * Log a gate check
     * @param {Object} data - Gate check data (see logGateCheck)
     */
    logGateCheck: data => logGateCheck(logPath, data),

    /**
     * Log a raw event
     * @param {Object} event - Raw event object
     */
    logRaw: event => appendEvent(logPath, { ts: new Date().toISOString(), ...event }),
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Read and filter bus log events
 * @param {string} logPath - Path to the JSONL log file
 * @param {Object} [filter] - Filter criteria
 * @param {string} [filter.type] - Filter by event type
 * @param {string} [filter.agent] - Filter by agent name
 * @param {string} [filter.storyId] - Filter by story ID
 * @param {string} [filter.since] - Filter events after this ISO timestamp
 * @returns {{ ok: boolean, events?: Object[], error?: string }}
 */
function queryEvents(logPath, filter = {}) {
  try {
    if (!fs.existsSync(logPath)) {
      return { ok: true, events: [] };
    }

    const content = fs.readFileSync(logPath, 'utf8');
    let events = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        continue;
      }
    }

    // Apply filters
    if (filter.type) {
      events = events.filter(e => e.type === filter.type);
    }
    if (filter.agent) {
      events = events.filter(e => e.agent === filter.agent);
    }
    if (filter.storyId) {
      events = events.filter(e => e.story_id === filter.storyId);
    }
    if (filter.since) {
      const sinceDate = new Date(filter.since);
      if (isNaN(sinceDate.getTime())) {
        return { ok: false, error: `Invalid filter.since date: "${filter.since}"` };
      }
      events = events.filter(e => new Date(e.ts) >= sinceDate);
    }

    return { ok: true, events };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  AGENT_EVENT_TYPES,
  FINDING_SEVERITY,

  // Core functions
  appendEvent,
  createBaseEvent,

  // Typed loggers
  logFinding,
  logChange,
  logGateCheck,

  // Factory
  createBusLogger,

  // Query
  queryEvents,
};
