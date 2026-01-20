/**
 * AgileFlow CLI - Correlation ID Management
 *
 * Generates and propagates trace IDs and session IDs for event correlation.
 * Enables filtering and tracing events across complex workflows.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Global context for correlation IDs
let currentContext = {
  traceId: null,
  sessionId: null,
  spanId: null,
  parentSpanId: null,
};

/**
 * Generate a unique trace ID (16 hex chars, like OpenTelemetry standard)
 * @returns {string} Unique trace ID
 */
function generateTraceId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Generate a span ID (8 hex chars)
 * @returns {string} Unique span ID
 */
function generateSpanId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a session ID based on timestamp and random component
 * Format: session_YYYYMMDD_HHMMSS_XXXX
 * @returns {string} Session ID
 */
function generateSessionId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = crypto.randomBytes(2).toString('hex');
  return `session_${date}_${time}_${random}`;
}

/**
 * Get current correlation context
 * @returns {{ traceId: string | null, sessionId: string | null, spanId: string | null }}
 */
function getContext() {
  return { ...currentContext };
}

/**
 * Set correlation context
 * @param {Object} context
 * @param {string} [context.traceId] - Trace ID
 * @param {string} [context.sessionId] - Session ID
 * @param {string} [context.spanId] - Span ID
 * @param {string} [context.parentSpanId] - Parent span ID
 */
function setContext(context) {
  if (context.traceId !== undefined) currentContext.traceId = context.traceId;
  if (context.sessionId !== undefined) currentContext.sessionId = context.sessionId;
  if (context.spanId !== undefined) currentContext.spanId = context.spanId;
  if (context.parentSpanId !== undefined) currentContext.parentSpanId = context.parentSpanId;
}

/**
 * Start a new trace (generates new trace_id)
 * @param {Object} [options]
 * @param {string} [options.sessionId] - Existing session ID to use
 * @returns {{ traceId: string, sessionId: string, spanId: string }}
 */
function startTrace(options = {}) {
  const traceId = generateTraceId();
  const sessionId = options.sessionId || currentContext.sessionId || generateSessionId();
  const spanId = generateSpanId();

  setContext({
    traceId,
    sessionId,
    spanId,
    parentSpanId: null,
  });

  return { traceId, sessionId, spanId };
}

/**
 * Start a new span within current trace
 * @returns {{ traceId: string, sessionId: string, spanId: string, parentSpanId: string | null }}
 */
function startSpan() {
  const parentSpanId = currentContext.spanId;
  const spanId = generateSpanId();

  setContext({
    spanId,
    parentSpanId,
  });

  return {
    traceId: currentContext.traceId,
    sessionId: currentContext.sessionId,
    spanId,
    parentSpanId,
  };
}

/**
 * Inject correlation IDs into an event object
 * @param {Object} event - Event to inject into
 * @returns {Object} Event with correlation IDs
 */
function injectCorrelation(event) {
  const ctx = getContext();
  return {
    ...event,
    ...(ctx.traceId && { trace_id: ctx.traceId }),
    ...(ctx.sessionId && { session_id: ctx.sessionId }),
    ...(ctx.spanId && { span_id: ctx.spanId }),
    ...(ctx.parentSpanId && { parent_span_id: ctx.parentSpanId }),
  };
}

/**
 * Clear correlation context (for testing or new sessions)
 */
function clearContext() {
  currentContext = {
    traceId: null,
    sessionId: null,
    spanId: null,
    parentSpanId: null,
  };
}

/**
 * Load session ID from session-state.json if available
 * @param {string} projectDir - Project directory
 * @returns {string | null} Session ID or null
 */
function loadSessionId(projectDir) {
  try {
    const sessionStatePath = path.join(projectDir, 'docs', '09-agents', 'session-state.json');
    if (fs.existsSync(sessionStatePath)) {
      const data = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      return data.session_id || null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Save session ID to session-state.json
 * @param {string} projectDir - Project directory
 * @param {string} sessionId - Session ID to save
 */
function saveSessionId(projectDir, sessionId) {
  try {
    const sessionStatePath = path.join(projectDir, 'docs', '09-agents', 'session-state.json');
    let data = {};

    if (fs.existsSync(sessionStatePath)) {
      data = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    }

    data.session_id = sessionId;
    data.updated_at = new Date().toISOString();

    const dir = path.dirname(sessionStatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(sessionStatePath, JSON.stringify(data, null, 2) + '\n');
  } catch {
    // Ignore errors - session ID is not critical
  }
}

/**
 * Initialize correlation context for a project
 * Loads existing session ID or creates new one
 * @param {string} projectDir - Project directory
 * @param {Object} [options]
 * @param {boolean} [options.newTrace=true] - Start new trace
 * @returns {{ traceId: string, sessionId: string }}
 */
function initializeForProject(projectDir, options = {}) {
  const { newTrace = true } = options;

  // Load or create session ID
  let sessionId = loadSessionId(projectDir);
  if (!sessionId) {
    sessionId = generateSessionId();
    saveSessionId(projectDir, sessionId);
  }

  setContext({ sessionId });

  if (newTrace) {
    const trace = startTrace({ sessionId });
    return { traceId: trace.traceId, sessionId };
  }

  return {
    traceId: currentContext.traceId || generateTraceId(),
    sessionId,
  };
}

/**
 * Extract correlation IDs from an event
 * @param {Object} event - Event object
 * @returns {{ traceId: string | null, sessionId: string | null, spanId: string | null }}
 */
function extractCorrelation(event) {
  return {
    traceId: event.trace_id || null,
    sessionId: event.session_id || null,
    spanId: event.span_id || null,
  };
}

/**
 * Filter events by trace ID
 * @param {Array} events - Array of events
 * @param {string} traceId - Trace ID to filter by
 * @returns {Array} Filtered events
 */
function filterByTraceId(events, traceId) {
  return events.filter(e => e.trace_id === traceId);
}

/**
 * Filter events by session ID
 * @param {Array} events - Array of events
 * @param {string} sessionId - Session ID to filter by
 * @returns {Array} Filtered events
 */
function filterBySessionId(events, sessionId) {
  return events.filter(e => e.session_id === sessionId);
}

module.exports = {
  // ID generation
  generateTraceId,
  generateSpanId,
  generateSessionId,

  // Context management
  getContext,
  setContext,
  clearContext,
  startTrace,
  startSpan,

  // Event injection/extraction
  injectCorrelation,
  extractCorrelation,

  // Project integration
  initializeForProject,
  loadSessionId,
  saveSessionId,

  // Filtering
  filterByTraceId,
  filterBySessionId,
};
