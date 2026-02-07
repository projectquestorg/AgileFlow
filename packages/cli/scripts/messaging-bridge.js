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
 * @param {string} rootDir - Project root
 * @param {object} message - Message object { from, to, type, ... }
 * @returns {{ ok: boolean }}
 */
function sendMessage(rootDir, message) {
  try {
    ensureBusDir(rootDir);
    const logPath = getBusLogPath(rootDir);

    const entry = {
      ...message,
      at: new Date().toISOString(),
      agent_teams: getFeatureFlags().isAgentTeamsEnabled({ rootDir }),
    };

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
function sendTaskAssignment(rootDir, from, to, taskId, description) {
  return sendMessage(rootDir, {
    from,
    to,
    type: 'task_assignment',
    task_id: taskId,
    description,
  });
}

/**
 * Send a plan proposal message.
 */
function sendPlanProposal(rootDir, from, to, taskId, plan) {
  return sendMessage(rootDir, {
    from,
    to,
    type: 'plan_proposal',
    task_id: taskId,
    plan,
  });
}

/**
 * Send a plan approval/rejection message.
 */
function sendPlanDecision(rootDir, from, to, taskId, approved, reason) {
  return sendMessage(rootDir, {
    from,
    to,
    type: approved ? 'plan_approved' : 'plan_rejected',
    task_id: taskId,
    reason,
  });
}

/**
 * Send a validation result message.
 */
function sendValidationResult(rootDir, from, taskId, status, details) {
  return sendMessage(rootDir, {
    from,
    to: 'team-lead',
    type: 'validation',
    task_id: taskId,
    status, // 'approved' | 'rejected'
    details,
  });
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

    default:
      result = {
        ok: false,
        error: `Unknown command: ${command}\nUsage: messaging-bridge.js <send|read|context>`,
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
  sendValidationResult,
  getBusLogPath,
};

if (require.main === module) {
  main();
}
