#!/usr/bin/env node

/**
 * messaging-bridge.js - Inter-Agent Messaging Bridge
 *
 * Translates between AgileFlow's message bus (docs/09-agents/bus/log.jsonl)
 * and Claude Code's native Agent Teams messaging.
 *
 * When Agent Teams is enabled:
 * - Teammate messages are logged to both native channel AND AgileFlow bus
 * - New teammates receive relevant bus context on startup
 * - Coordination messages (assignments, approvals) flow through both systems
 *
 * When Agent Teams is disabled:
 * - Only AgileFlow bus is used (existing behavior)
 * - No native messaging integration
 *
 * Usage:
 *   node messaging-bridge.js send <from> <to> <type> <message>
 *   node messaging-bridge.js read [--from=agent] [--type=type] [--limit=N]
 *   node messaging-bridge.js context <agent>  // Get relevant context for agent
 */

const fs = require('fs');
const path = require('path');

// Lazy-load modules
let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../lib/paths');
    } catch (e) {
      return null;
    }
  }
  return _paths;
}

let _featureFlags;
function getFeatureFlags() {
  if (!_featureFlags) {
    try {
      _featureFlags = require('../lib/feature-flags');
    } catch (e) {
      return { isAgentTeamsEnabled: () => false };
    }
  }
  return _featureFlags;
}

let _teamEvents;
function getTeamEvents() {
  if (!_teamEvents) {
    try {
      _teamEvents = require('./lib/team-events');
    } catch (e) {
      return null;
    }
  }
  return _teamEvents;
}

let _busUtils;
function getBusUtils() {
  if (!_busUtils) {
    try {
      _busUtils = require('./lib/bus-utils');
    } catch (e) {
      return null;
    }
  }
  return _busUtils;
}

/**
 * Get the bus log path.
 */
function getBusLogPath(rootDir) {
  const paths = getPaths();
  if (paths) {
    return paths.getBusLogPath(rootDir);
  }
  return path.join(rootDir, 'docs', '09-agents', 'bus', 'log.jsonl');
}

/**
 * Ensure the bus directory exists.
 */
function ensureBusDir(rootDir) {
  const logPath = getBusLogPath(rootDir);
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Send a message to the AgileFlow bus.
 *
 * When Agent Teams is enabled (native mode), the message is formatted for
 * both the JSONL bus AND the native SendMessage channel. The JSONL bus
 * remains the source of truth; native messaging is supplementary.
 *
 * Also triggers log rotation when the bus exceeds 1000 lines.
 *
 * @param {string} rootDir - Project root
 * @param {object} message - Message object { from, to, type, ... }
 * @returns {{ ok: boolean, native?: boolean }}
 */
function sendMessage(rootDir, message) {
  try {
    ensureBusDir(rootDir);
    const logPath = getBusLogPath(rootDir);
    const isNative = getFeatureFlags().isAgentTeamsEnabled({ rootDir });

    const entry = {
      ...message,
      at: new Date().toISOString(),
      agent_teams: isNative,
    };

    // When native Agent Teams is enabled, also format for native SendMessage
    if (isNative) {
      entry.native_format = {
        tool: 'SendMessage',
        to: message.to || 'team-lead',
        content: formatForNative(message),
      };
    }

    // Always write to JSONL bus (source of truth)
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

    // Trigger rotation check (non-blocking, fail-safe)
    try {
      const busUtils = getBusUtils();
      if (busUtils && busUtils.shouldRotate(logPath, 1000)) {
        busUtils.rotateLog(logPath, { keepRecent: 100 });
      }
    } catch (e) {
      // Rotation failure is non-critical
    }

    return { ok: true, native: isNative };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Format a message for the native SendMessage tool.
 * Converts AgileFlow message types into a structured content string.
 *
 * @param {object} message - AgileFlow message object
 * @returns {string} Formatted content for native SendMessage
 * @private
 */
function formatForNative(message) {
  const parts = [];
  if (message.type) parts.push(`[${message.type}]`);
  if (message.from) parts.push(`from:${message.from}`);
  if (message.task_id) parts.push(`task:${message.task_id}`);
  if (message.message) parts.push(message.message);
  if (message.description) parts.push(message.description);
  if (message.status) parts.push(`status:${message.status}`);
  return parts.join(' ');
}

/**
 * Read messages from the AgileFlow bus.
 *
 * @param {string} rootDir - Project root
 * @param {object} [filters] - Filters { from, to, type, limit, since }
 * @returns {{ ok: boolean, messages: Array }}
 */
function readMessages(rootDir, filters = {}) {
  try {
    const logPath = getBusLogPath(rootDir);
    if (!fs.existsSync(logPath)) {
      return { ok: true, messages: [] };
    }

    const content = fs.readFileSync(logPath, 'utf8').trim();
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
    if (filters.from) {
      messages = messages.filter(m => m.from === filters.from);
    }
    if (filters.to) {
      messages = messages.filter(m => m.to === filters.to);
    }
    if (filters.type) {
      messages = messages.filter(m => m.type === filters.type);
    }
    if (filters.since) {
      const sinceTime = new Date(filters.since).getTime();
      messages = messages.filter(m => new Date(m.at).getTime() >= sinceTime);
    }

    // Apply limit (from the end)
    if (filters.limit && filters.limit > 0) {
      messages = messages.slice(-filters.limit);
    }

    return { ok: true, messages };
  } catch (e) {
    return { ok: false, error: e.message, messages: [] };
  }
}

/**
 * Get relevant context for a teammate agent.
 * Returns recent messages relevant to this agent's domain.
 *
 * @param {string} rootDir - Project root
 * @param {string} agentName - Agent name
 * @returns {{ ok: boolean, context: Array }}
 */
function getAgentContext(rootDir, agentName) {
  // Get messages TO this agent + recent coordination messages
  const toAgent = readMessages(rootDir, { to: agentName, limit: 20 });
  const coordination = readMessages(rootDir, { type: 'coordination', limit: 10 });
  const assignments = readMessages(rootDir, { type: 'task_assignment', limit: 10 });

  const context = [
    ...(toAgent.messages || []),
    ...(coordination.messages || []),
    ...(assignments.messages || []),
  ];

  // Deduplicate by timestamp
  const seen = new Set();
  const unique = context.filter(m => {
    const key = `${m.at}-${m.from}-${m.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by timestamp
  unique.sort((a, b) => new Date(a.at) - new Date(b.at));

  return { ok: true, context: unique.slice(-30) };
}

/**
 * Send a task assignment message.
 */
function sendTaskAssignment(rootDir, from, to, taskId, description, traceId) {
  const msg = { from, to, type: 'task_assignment', task_id: taskId, description };
  if (traceId) msg.trace_id = traceId;
  return sendMessage(rootDir, msg);
}

/**
 * Send a plan proposal message.
 */
function sendPlanProposal(rootDir, from, to, taskId, plan, traceId) {
  const msg = { from, to, type: 'plan_proposal', task_id: taskId, plan };
  if (traceId) msg.trace_id = traceId;
  return sendMessage(rootDir, msg);
}

/**
 * Send a plan approval/rejection message.
 */
function sendPlanDecision(rootDir, from, to, taskId, approved, reason, traceId) {
  const msg = {
    from,
    to,
    type: approved ? 'plan_approved' : 'plan_rejected',
    task_id: taskId,
    reason,
  };
  if (traceId) msg.trace_id = traceId;
  return sendMessage(rootDir, msg);
}

/**
 * Send an inter-agent team message to the JSONL bus.
 * Logs communication between teammates with optional trace_id for correlation.
 *
 * @param {string} rootDir - Project root
 * @param {string} from - Sending agent name
 * @param {string} to - Receiving agent name
 * @param {string} content - Message content
 * @param {string} [traceId] - Trace ID for team lifecycle correlation
 * @returns {{ ok: boolean, native?: boolean }}
 */
function sendTeamMessage(rootDir, from, to, content, traceId) {
  const msg = { from, to, type: 'team_message', content };
  if (traceId) msg.trace_id = traceId;
  const result = sendMessage(rootDir, msg);

  // Always track in session-state for observability parity (both native and subagent modes)
  try {
    const teamEvents = getTeamEvents();
    if (teamEvents) {
      teamEvents.trackEvent(rootDir, 'team_message', {
        from,
        to,
        trace_id: traceId,
      });
    }
  } catch (e) {
    // Non-critical
  }

  return result;
}

/**
 * Send a team_completed event to the JSONL bus.
 * Signals that a team run has finished all work.
 *
 * @param {string} rootDir - Project root
 * @param {string} templateName - Team template name
 * @param {string} [traceId] - Trace ID for team lifecycle correlation
 * @param {object} [summary] - Optional summary data (duration_ms, tasks_completed, etc.)
 * @returns {{ ok: boolean, native?: boolean }}
 */
function sendTeamCompleted(rootDir, templateName, traceId, summary) {
  const msg = {
    from: 'team-manager',
    to: 'system',
    type: 'team_completed',
    template: templateName,
    ...summary,
  };
  if (traceId) msg.trace_id = traceId;
  return sendMessage(rootDir, msg);
}

/**
 * Log a native SendMessage tool call to the JSONL bus.
 * Used by agents to record native API calls for observability parity.
 *
 * @param {string} rootDir - Project root
 * @param {string} from - Sending agent name
 * @param {string} to - Receiving agent name
 * @param {string} content - Message content
 * @param {string} [traceId] - Trace ID for correlation
 * @returns {{ ok: boolean }}
 */
function logNativeSend(rootDir, from, to, content, traceId) {
  const msg = { from, to, type: 'native_send', content };
  if (traceId) msg.trace_id = traceId;
  const result = sendMessage(rootDir, msg);

  try {
    const teamEvents = getTeamEvents();
    if (teamEvents) {
      teamEvents.trackEvent(rootDir, 'team_message', {
        from,
        to,
        trace_id: traceId,
        native: true,
      });
    }
  } catch (e) {
    // Non-critical
  }

  return { ok: result.ok };
}

/**
 * Log a native TeamCreate tool call to the JSONL bus.
 *
 * @param {string} rootDir - Project root
 * @param {string} templateName - Team template name
 * @param {string} [traceId] - Trace ID for correlation
 * @param {number} [teammateCount] - Number of teammates created
 * @returns {{ ok: boolean }}
 */
function logNativeTeamCreate(rootDir, templateName, traceId, teammateCount) {
  const msg = {
    from: 'team-manager',
    to: 'system',
    type: 'native_team_create',
    template: templateName,
  };
  if (traceId) msg.trace_id = traceId;
  if (typeof teammateCount === 'number') msg.teammate_count = teammateCount;
  const result = sendMessage(rootDir, msg);

  try {
    const teamEvents = getTeamEvents();
    if (teamEvents) {
      teamEvents.trackEvent(rootDir, 'team_created', {
        template: templateName,
        trace_id: traceId,
        teammate_count: teammateCount,
        native: true,
      });
    }
  } catch (e) {
    // Non-critical
  }

  return { ok: result.ok };
}

/**
 * Log a native team completion to the JSONL bus.
 *
 * @param {string} rootDir - Project root
 * @param {string} templateName - Team template name
 * @param {string} [traceId] - Trace ID for correlation
 * @param {string} [summary] - Summary of completed work
 * @returns {{ ok: boolean }}
 */
function logNativeTeamCompleted(rootDir, templateName, traceId, summary) {
  const msg = {
    from: 'team-manager',
    to: 'system',
    type: 'native_team_completed',
    template: templateName,
  };
  if (traceId) msg.trace_id = traceId;
  if (summary) msg.summary = summary;
  const result = sendMessage(rootDir, msg);

  try {
    const teamEvents = getTeamEvents();
    if (teamEvents) {
      teamEvents.trackEvent(rootDir, 'team_completed', {
        template: templateName,
        trace_id: traceId,
        summary,
        native: true,
      });
    }
  } catch (e) {
    // Non-critical
  }

  return { ok: result.ok };
}

/**
 * Send a validation result message.
 */
function sendValidationResult(rootDir, from, taskId, status, details, traceId) {
  const msg = { from, to: 'team-lead', type: 'validation', task_id: taskId, status, details };
  if (traceId) msg.trace_id = traceId;
  return sendMessage(rootDir, msg);
}

// CLI entry point
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rootDir = process.cwd();

  let result;

  switch (command) {
    case 'send': {
      const [, from, to, type, ...messageParts] = args;
      const message = messageParts.join(' ');
      result = sendMessage(rootDir, { from, to, type, message });
      break;
    }

    case 'read': {
      const filters = {};
      for (const arg of args.slice(1)) {
        if (arg.startsWith('--from=')) filters.from = arg.slice(7);
        else if (arg.startsWith('--to=')) filters.to = arg.slice(5);
        else if (arg.startsWith('--type=')) filters.type = arg.slice(7);
        else if (arg.startsWith('--limit=')) filters.limit = parseInt(arg.slice(8), 10);
      }
      result = readMessages(rootDir, filters);
      break;
    }

    case 'context': {
      const agentName = args[1];
      if (!agentName) {
        result = { ok: false, error: 'Usage: messaging-bridge.js context <agent-name>' };
      } else {
        result = getAgentContext(rootDir, agentName);
      }
      break;
    }

    case 'log-native-send': {
      const [, from, to, ...contentParts] = args;
      const content = contentParts.filter(p => !p.startsWith('--')).join(' ');
      const traceArg = args.find(a => a.startsWith('--trace-id='));
      const traceId = traceArg ? traceArg.slice(11) : undefined;
      result = logNativeSend(rootDir, from, to, content, traceId);
      break;
    }

    case 'log-native-create': {
      const [, templateName] = args;
      const traceArg = args.find(a => a.startsWith('--trace-id='));
      const traceId = traceArg ? traceArg.slice(11) : undefined;
      const countArg = args.find(a => a.startsWith('--count='));
      const teammateCount = countArg ? parseInt(countArg.slice(8), 10) : undefined;
      result = logNativeTeamCreate(rootDir, templateName, traceId, teammateCount);
      break;
    }

    case 'log-native-completed': {
      const [, templateName] = args;
      const traceArg = args.find(a => a.startsWith('--trace-id='));
      const traceId = traceArg ? traceArg.slice(11) : undefined;
      const summaryArg = args.find(a => a.startsWith('--summary='));
      const summary = summaryArg ? summaryArg.slice(10) : undefined;
      result = logNativeTeamCompleted(rootDir, templateName, traceId, summary);
      break;
    }

    default:
      result = {
        ok: false,
        error: `Unknown command: ${command}\nUsage: messaging-bridge.js <send|read|context|log-native-send|log-native-create|log-native-completed>`,
      };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

// Export for use by other scripts
module.exports = {
  sendMessage,
  readMessages,
  getAgentContext,
  sendTaskAssignment,
  sendPlanProposal,
  sendPlanDecision,
  sendTeamMessage,
  sendTeamCompleted,
  sendValidationResult,
  logNativeSend,
  logNativeTeamCreate,
  logNativeTeamCompleted,
  getBusLogPath,
  formatForNative,
};

if (require.main === module) {
  main();
}
