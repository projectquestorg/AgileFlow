#!/usr/bin/env node
/**
 * damage-control-agent-tools.js - PreToolUse hook for agent tool restriction enforcement
 *
 * Validates that subagents only use tools declared in their frontmatter.
 * Agents declare allowed tools via the `tools:` field in their .md frontmatter,
 * but without this hook, those declarations are NEVER enforced at runtime.
 *
 * Detection strategy:
 * 1. Check AGILEFLOW_AGENT_TOOLS env var (set by spawn-parallel/team-manager)
 * 2. Check AGILEFLOW_AGENT_ROLE env var (validator, builder, lead, etc.)
 * 3. If neither is set, this is not a subagent context → allow everything
 *
 * Exit codes:
 *   0 - Allow operation
 *   2 - Block operation (unauthorized tool for this agent role)
 *
 * FAIL-OPEN: If agent context cannot be determined, all tools are allowed.
 */

const fs = require('fs');
const path = require('path');

function loadDamageControlUtils() {
  const candidates = [
    path.join(__dirname, 'lib', 'damage-control-utils.js'),
    path.join(process.cwd(), '.agileflow', 'scripts', 'lib', 'damage-control-utils.js'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return require(candidate);
      }
    } catch (e) {
      // Try next candidate
    }
  }

  return null;
}

const utils = loadDamageControlUtils();
if (!utils || typeof utils.runDamageControlHook !== 'function') {
  // Fail-open: never block tools because hook bootstrap failed
  process.exit(0);
}

// Standard tool name mappings (Claude Code tool names → normalized names)
const TOOL_ALIASES = {
  Bash: 'Bash',
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  Glob: 'Glob',
  Grep: 'Grep',
  Agent: 'Agent',
  Task: 'Task',
  TaskCreate: 'Task',
  TaskUpdate: 'Task',
  TaskGet: 'Task',
  TaskList: 'Task',
  TaskOutput: 'TaskOutput',
  TaskStop: 'Task',
  WebFetch: 'WebFetch',
  WebSearch: 'WebSearch',
  AskUserQuestion: 'AskUserQuestion',
  NotebookEdit: 'NotebookEdit',
  TeamCreate: 'TeamCreate',
  TeamDelete: 'TeamDelete',
  SendMessage: 'SendMessage',
};

// Tools that are always allowed regardless of agent restrictions
const ALWAYS_ALLOWED = new Set([
  'Read', // Reading is never destructive
  'Glob', // File discovery is safe
  'Grep', // Content search is safe
]);

// Role-based default tool sets (when AGILEFLOW_AGENT_TOOLS is not set)
const ROLE_DEFAULTS = {
  validator: new Set(['Read', 'Glob', 'Grep']),
  reviewer: new Set(['Read', 'Glob', 'Grep']),
  lead: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskOutput', 'Agent']),
  builder: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']),
  teammate: new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskOutput']),
};

/**
 * Parse allowed tools from environment variable
 * @returns {Set<string>|null} Set of allowed tools, or null if not in agent context
 */
function getAllowedTools() {
  // Check explicit tool list from env
  const toolsEnv = process.env.AGILEFLOW_AGENT_TOOLS;
  if (toolsEnv) {
    const tools = toolsEnv
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    return new Set(tools);
  }

  // Check role-based defaults
  const roleEnv = process.env.AGILEFLOW_AGENT_ROLE;
  if (roleEnv) {
    const role = roleEnv.toLowerCase();
    if (ROLE_DEFAULTS[role]) {
      return ROLE_DEFAULTS[role];
    }
    // Unknown role - fail open
    return null;
  }

  // Not in agent context - allow everything
  return null;
}

/**
 * Normalize a tool name to its canonical form
 * @param {string} toolName - Raw tool name from Claude Code
 * @returns {string} Normalized tool name
 */
function normalizeTool(toolName) {
  return TOOL_ALIASES[toolName] || toolName;
}

try {
  utils.runDamageControlHook({
    getInputValue: input => {
      const toolName = input.tool_name || '';
      if (!toolName) return null;

      const allowedTools = getAllowedTools();

      // Not in agent context - allow everything
      if (!allowedTools) return null;

      return { toolName, allowedTools };
    },

    loadConfig: () => {
      // Config is derived from environment, not YAML
      return {};
    },

    validate: context => {
      const { toolName, allowedTools } = context;
      const normalized = normalizeTool(toolName);

      // Always-allowed tools bypass restrictions
      if (ALWAYS_ALLOWED.has(normalized)) {
        return { action: 'allow' };
      }

      // Check if tool is in the allowed set
      if (allowedTools.has(normalized)) {
        return { action: 'allow' };
      }

      // Tool not allowed for this agent
      const role = process.env.AGILEFLOW_AGENT_ROLE || 'unknown';
      return {
        action: 'block',
        reason: `Agent role "${role}" is not authorized to use ${toolName}`,
        detail: `Allowed tools: ${[...allowedTools].join(', ')}`,
      };
    },

    onBlock: result => {
      utils.outputBlocked(result.reason, result.detail, 'Agent tool restriction enforcement');
    },
  });
} catch (e) {
  // Fail-open on runtime errors
  process.exit(0);
}
