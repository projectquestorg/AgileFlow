/**
 * channel-adapter.js - External Event Channel Adapter (EP-0049)
 *
 * Normalizes external events from Claude Code Channels (CI alerts, webhooks,
 * Telegram/Discord messages, file watchers, error monitors) into the existing
 * AgileFlow JSONL message bus format.
 *
 * Architecture:
 *   External Event → channel-adapter.normalizeEvent() → messaging-bridge.sendChannelEvent()
 *   → JSONL bus (docs/09-agents/bus/log.jsonl) → EventStream picks up automatically
 *
 * Trust Levels (progressive):
 *   - observe: Claude sees events, no auto-action (default)
 *   - suggest: Claude proposes fixes, waits for confirmation
 *   - react:   Claude auto-acts (with damage control still active)
 *
 * Usage:
 *   const { normalizeEvent, registerChannel, getChannelStatus } = require('./lib/channel-adapter');
 *
 *   const normalized = normalizeEvent({
 *     source: 'ci',
 *     type: 'ci_failure',
 *     payload: { workflow: 'tests', branch: 'main', error: '3 tests failed' },
 *   });
 */

const fs = require('fs');
const path = require('path');

// Lazy-load dependencies
let _featureFlags;
function getFeatureFlags() {
  if (!_featureFlags) {
    try {
      _featureFlags = require('../../lib/feature-flags');
    } catch {
      return { isChannelsEnabled: () => false, getChannelTrustLevel: () => 'observe' };
    }
  }
  return _featureFlags;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum payload size in characters (prevents bus explosion) */
const MAX_PAYLOAD_SIZE = 2000;

/** Per-channel event budget per hour */
const CHANNEL_BUDGET_PER_HOUR = 20;

/** Deduplication window in milliseconds (5 minutes) */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Valid channel source types */
const CHANNEL_SOURCES = Object.freeze([
  'ci',
  'webhook',
  'telegram',
  'discord',
  'file-watcher',
  'error-monitor',
  'health-check',
  'custom',
]);

/** Default bus channel mapping by source type */
const SOURCE_TO_BUS_CHANNEL = Object.freeze({
  ci: 'ci-events',
  webhook: 'webhooks',
  telegram: 'messaging',
  discord: 'messaging',
  'file-watcher': 'file-events',
  'error-monitor': 'monitoring',
  'health-check': 'monitoring',
  custom: 'external',
});

// In-memory dedup and rate tracking (per-process)
const _recentEvents = new Map();
const _hourlyBudgets = new Map();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Normalize an external event into the JSONL bus message format.
 *
 * Sanitizes payload content, enforces size limits, and maps source types
 * to internal bus channels.
 *
 * @param {object} event - External event
 * @param {string} event.source - Source type (ci, webhook, telegram, etc.)
 * @param {string} event.type - Event type (ci_failure, message, file_change, etc.)
 * @param {object} [event.payload] - Event-specific data
 * @param {string} [event.sender] - Who/what sent this event
 * @param {string} [event.sourceId] - Unique ID from source for deduplication
 * @returns {{ ok: boolean, message?: object, error?: string }}
 */
function normalizeEvent(event) {
  if (!event || !event.source || !event.type) {
    return { ok: false, error: 'Event must have source and type fields' };
  }

  if (!CHANNEL_SOURCES.includes(event.source)) {
    return {
      ok: false,
      error: `Unknown source: ${event.source}. Valid: ${CHANNEL_SOURCES.join(', ')}`,
    };
  }

  // Sanitize payload
  const payload = sanitizePayload(event.payload || {});

  const message = {
    from: `channel:${event.source}`,
    to: 'system',
    type: 'channel_event',
    source: event.source,
    event_type: event.type,
    channel: SOURCE_TO_BUS_CHANNEL[event.source] || 'external',
    payload,
  };

  if (event.sender) message.sender = String(event.sender).slice(0, 100);
  if (event.sourceId) message.source_id = String(event.sourceId).slice(0, 200);

  // Add quarantine-wrapped content for safe rendering in Claude's context
  message.quarantined_content = wrapInQuarantine(message);

  return { ok: true, message };
}

/**
 * Sanitize an event payload to prevent prompt injection and bus explosion.
 *
 * - Truncates string values to MAX_PAYLOAD_SIZE
 * - Strips potential instruction patterns
 * - Removes nested objects deeper than 2 levels
 *
 * @param {object} payload - Raw event payload
 * @returns {object} Sanitized payload
 */
function sanitizePayload(payload) {
  if (typeof payload === 'string') {
    return truncateAndSanitize(payload);
  }

  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    const safeKey = String(key)
      .slice(0, 50)
      .replace(/[^\w.-]/g, '_');
    if (typeof value === 'string') {
      sanitized[safeKey] = truncateAndSanitize(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[safeKey] = value;
    } else if (Array.isArray(value)) {
      sanitized[safeKey] = value
        .slice(0, 10)
        .map(v => (typeof v === 'string' ? truncateAndSanitize(v) : v));
    }
    // Drop nested objects to prevent deeply nested injection
  }
  return sanitized;
}

/**
 * Truncate a string and remove potential instruction-like patterns.
 * @private
 */
function truncateAndSanitize(str) {
  let s = String(str).slice(0, MAX_PAYLOAD_SIZE);
  // Remove patterns that could be interpreted as instructions to Claude
  s = s.replace(/```[\s\S]*?```/g, '[code-block-removed]');
  return s;
}

/**
 * Wrap a channel event in structured quarantine delimiters.
 *
 * This wrapping tells Claude to treat the content as untrusted external data,
 * NOT as instructions. The delimiters create a clear trust boundary.
 *
 * @param {object} normalizedMessage - A normalized channel event message
 * @returns {string} Quarantine-wrapped string representation
 */
function wrapInQuarantine(normalizedMessage) {
  const source = normalizedMessage.source || 'unknown';
  const eventType = normalizedMessage.event_type || 'unknown';
  const sender = normalizedMessage.sender || 'system';
  const timestamp = normalizedMessage.at || new Date().toISOString();

  const payloadStr =
    typeof normalizedMessage.payload === 'object'
      ? JSON.stringify(normalizedMessage.payload, null, 2)
      : String(normalizedMessage.payload || '');

  return [
    `[EXTERNAL_EVENT source=${source} type=${eventType} sender=${sender} time=${timestamp}]`,
    '<event_data>',
    payloadStr,
    '</event_data>',
    '[/EXTERNAL_EVENT]',
  ].join('\n');
}

/**
 * Check if an event is a duplicate within the dedup window.
 *
 * @param {string} sourceId - Unique event ID from source
 * @param {string} source - Source type
 * @returns {boolean} True if this is a duplicate
 */
function isDuplicate(sourceId, source) {
  if (!sourceId) return false;

  const key = `${source}:${sourceId}`;
  const now = Date.now();
  const lastSeen = _recentEvents.get(key);

  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
    return true;
  }

  _recentEvents.set(key, now);

  // Cleanup old entries periodically
  if (_recentEvents.size > 500) {
    for (const [k, ts] of _recentEvents.entries()) {
      if (now - ts > DEDUP_WINDOW_MS) _recentEvents.delete(k);
    }
  }

  return false;
}

/**
 * Check and enforce per-channel hourly budget.
 *
 * @param {string} source - Channel source type
 * @returns {{ allowed: boolean, count: number, limit: number }}
 */
function checkChannelBudget(source) {
  const now = Date.now();
  const hourAgo = now - 3600000;

  let budget = _hourlyBudgets.get(source);
  if (!budget) {
    budget = { events: [] };
    _hourlyBudgets.set(source, budget);
  }

  // Remove events older than 1 hour
  budget.events = budget.events.filter(ts => ts > hourAgo);

  const count = budget.events.length;
  if (count >= CHANNEL_BUDGET_PER_HOUR) {
    return { allowed: false, count, limit: CHANNEL_BUDGET_PER_HOUR };
  }

  budget.events.push(now);
  return { allowed: true, count: count + 1, limit: CHANNEL_BUDGET_PER_HOUR };
}

/**
 * Process an incoming external event end-to-end.
 *
 * 1. Checks if channels are enabled
 * 2. Checks dedup and rate limits
 * 3. Normalizes the event
 * 4. Writes to the JSONL bus via messaging-bridge
 * 5. Tracks the event for observability
 *
 * @param {string} rootDir - Project root
 * @param {object} event - External event (see normalizeEvent for schema)
 * @returns {{ ok: boolean, error?: string, deduplicated?: boolean, budget_exceeded?: boolean }}
 */
function processEvent(rootDir, event) {
  // Check feature flag
  const flags = getFeatureFlags();
  if (!flags.isChannelsEnabled({ rootDir })) {
    return { ok: false, error: 'Channels feature is not enabled' };
  }

  // Check deduplication
  if (event.sourceId && isDuplicate(event.sourceId, event.source)) {
    return { ok: true, deduplicated: true };
  }

  // Check rate limit
  const budget = checkChannelBudget(event.source);
  if (!budget.allowed) {
    return {
      ok: false,
      error: `Channel budget exceeded for ${event.source} (${budget.count}/${budget.limit} per hour)`,
      budget_exceeded: true,
    };
  }

  // Normalize
  const normalized = normalizeEvent(event);
  if (!normalized.ok) {
    return normalized;
  }

  // Write to bus via messaging-bridge
  try {
    const messagingBridge = require('../messaging-bridge');
    const result = messagingBridge.sendMessage(rootDir, normalized.message);

    // Track event for observability
    try {
      const teamEvents = require('./team-events');
      teamEvents.trackEvent(rootDir, 'channel_event_received', {
        source: event.source,
        event_type: event.type,
        channel: normalized.message.channel,
      });
    } catch {
      // Non-critical
    }

    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// CHANNEL REGISTRY
// ============================================================================

/**
 * Get the channel config path.
 * @private
 */
function getChannelConfigPath(rootDir) {
  return path.join(rootDir, 'docs', '09-agents', 'channels.json');
}

/**
 * Register a new channel in the channel config.
 *
 * @param {string} rootDir - Project root
 * @param {string} name - Channel name (e.g., 'ci', 'my-telegram')
 * @param {object} config - Channel configuration
 * @param {string} config.source - Source type (ci, telegram, webhook, etc.)
 * @param {string} [config.trustLevel] - Trust level override (observe/suggest/react)
 * @param {boolean} [config.enabled] - Whether channel is active (default: true)
 * @returns {{ ok: boolean, error?: string }}
 */
function registerChannel(rootDir, name, config) {
  try {
    const configPath = getChannelConfigPath(rootDir);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let channelConfig = {};
    if (fs.existsSync(configPath)) {
      channelConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    if (!channelConfig.channels) channelConfig.channels = {};

    channelConfig.channels[name] = {
      source: config.source,
      enabled: config.enabled !== false,
      trustLevel: config.trustLevel || 'observe',
      registeredAt: new Date().toISOString(),
      ...config,
    };

    fs.writeFileSync(configPath, JSON.stringify(channelConfig, null, 2) + '\n');

    // Track registration
    try {
      const teamEvents = require('./team-events');
      teamEvents.trackEvent(rootDir, 'channel_registered', {
        name,
        source: config.source,
        trustLevel: config.trustLevel || 'observe',
      });
    } catch {
      // Non-critical
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get status of all registered channels.
 *
 * @param {string} rootDir - Project root
 * @returns {{ ok: boolean, channels?: object, error?: string }}
 */
function getChannelStatus(rootDir) {
  try {
    const configPath = getChannelConfigPath(rootDir);
    if (!fs.existsSync(configPath)) {
      return { ok: true, channels: {} };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ok: true, channels: config.channels || {} };
  } catch (e) {
    return { ok: false, error: e.message, channels: {} };
  }
}

/**
 * Remove a registered channel.
 *
 * @param {string} rootDir - Project root
 * @param {string} name - Channel name to remove
 * @returns {{ ok: boolean, error?: string }}
 */
function removeChannel(rootDir, name) {
  try {
    const configPath = getChannelConfigPath(rootDir);
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Channel '${name}' not found` };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.channels || !config.channels[name]) {
      return { ok: false, error: `Channel '${name}' not found` };
    }

    delete config.channels[name];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    try {
      const teamEvents = require('./team-events');
      teamEvents.trackEvent(rootDir, 'channel_removed', { name });
    } catch {
      // Non-critical
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core
  normalizeEvent,
  sanitizePayload,
  wrapInQuarantine,
  processEvent,

  // Registry
  registerChannel,
  getChannelStatus,
  removeChannel,

  // Rate limiting
  isDuplicate,
  checkChannelBudget,

  // Constants
  CHANNEL_SOURCES,
  SOURCE_TO_BUS_CHANNEL,
  MAX_PAYLOAD_SIZE,
  CHANNEL_BUDGET_PER_HOUR,
  DEDUP_WINDOW_MS,
};
