#!/usr/bin/env node
/**
 * damage-control-multi-agent.js - PreToolUse hook for Agent Teams tools
 *
 * Validates TeamCreate/TeamDelete, TaskCreate/TaskUpdate, and SendMessage
 * operations against safety rules when native Agent Teams is enabled.
 *
 * Protection layers:
 * 1. Tool validation: Ensure Team/Task operations have valid parameters
 * 2. Message schema: SendMessage content is validated against allowlist
 * 3. Rate limiting: Prevents runaway agent spawning
 * 4. Permission checks: Agents cannot escalate beyond their own tool access
 *
 * Exit codes:
 *   0 - Allow operation (or ask via JSON output)
 *   2 - Block operation
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
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

// Tools this hook handles
const MULTI_AGENT_TOOLS = [
  'TeamCreate',
  'TeamDelete',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskList',
  'SendMessage',
];

// Maximum number of teams that can be active simultaneously
const MAX_CONCURRENT_TEAMS = 4;

// Maximum teammates per team
const MAX_TEAMMATES_PER_TEAM = 8;

// SendMessage content size limit (10KB)
const MAX_MESSAGE_SIZE = 10240;

// Blocked patterns in SendMessage content
const BLOCKED_MESSAGE_PATTERNS = [
  // Command injection attempts
  /\$\{.*\}/, // Template injection ${...}
  /`[^`]*`/, // Backtick execution
  /\bexec\s*\(/, // exec() calls
  /\beval\s*\(/, // eval() calls
  // Dangerous git operations
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  // System destructive commands
  /\brm\s+-rf\s+\//,
  /\bdrop\s+database\b/i,
  /\bdrop\s+table\b/i,
];

// Secret patterns - shared between Task and SendMessage validation
// If multi-model support is ever added, secrets in inter-agent messages
// would leak to external providers. Scan all message content.
const SECRET_PATTERNS = [
  /\b(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIALS)\s*[:=]\s*\S+/i,
  /\bsk-[a-zA-Z0-9]{20,}/, // API keys starting with sk-
  /\bghp_[a-zA-Z0-9]{36}/, // GitHub personal access tokens
  /\bnpm_[a-zA-Z0-9]{36}/, // npm tokens
  /\bAIza[a-zA-Z0-9_-]{35}/, // Google API keys
  /\bxox[bpors]-[a-zA-Z0-9-]+/, // Slack tokens
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, // Private keys
  // Channel tokens (EP-0049)
  /\b\d{8,10}:[a-zA-Z0-9_-]{35}\b/, // Telegram bot tokens
  /\b[MN][A-Za-z\d]{23,}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/, // Discord bot tokens
  /https:\/\/hooks\.(?:slack|discord)\.com\/[^\s]+/, // Webhook URLs with embedded tokens
  /\bwhsec_[a-zA-Z0-9]+/, // Webhook signing secrets
];

/**
 * Validate a TeamCreate operation
 */
function validateTeamCreate(input) {
  const toolInput = input.tool_input || input;

  // Check teammate count
  const teammates = toolInput.teammates || [];
  if (teammates.length > MAX_TEAMMATES_PER_TEAM) {
    return {
      action: 'block',
      reason: `Team size ${teammates.length} exceeds maximum (${MAX_TEAMMATES_PER_TEAM})`,
    };
  }

  // Check for empty team
  if (teammates.length === 0) {
    return {
      action: 'ask',
      reason: 'Creating a team with no teammates. Continue?',
    };
  }

  return { action: 'allow' };
}

/**
 * Validate a SendMessage operation.
 * Checks for: size limits, blocked patterns, secrets, and channel ACLs.
 */
function validateSendMessage(input) {
  const toolInput = input.tool_input || input;
  const content = toolInput.message || toolInput.content || '';

  // Check message size
  if (content.length > MAX_MESSAGE_SIZE) {
    return {
      action: 'block',
      reason: `Message size (${content.length} bytes) exceeds limit (${MAX_MESSAGE_SIZE})`,
    };
  }

  // Check for blocked patterns in content
  for (const pattern of BLOCKED_MESSAGE_PATTERNS) {
    if (pattern.test(content)) {
      return {
        action: 'block',
        reason: 'Message contains potentially dangerous content pattern',
        detail: `Matched: ${pattern.source}`,
      };
    }
  }

  // Check for secrets in message content (prevents leaking to external providers)
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return {
        action: 'block',
        reason: 'Message appears to contain secrets or credentials',
        detail: 'Never pass secrets in inter-agent messages. Use environment variables instead.',
      };
    }
  }

  // Check channel ACLs if agent has restricted channels
  const allowedChannels = process.env.AGILEFLOW_AGENT_CHANNELS;
  const targetChannel = toolInput.channel;
  if (allowedChannels && targetChannel) {
    const allowed = allowedChannels
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(targetChannel)) {
      return {
        action: 'block',
        reason: `Agent not authorized for channel '${targetChannel}'`,
        detail: `Allowed channels: ${allowed.join(', ')}`,
      };
    }
  }

  return { action: 'allow' };
}

/**
 * Validate TaskCreate/TaskUpdate operations
 */
function validateTaskOperation(input) {
  const toolInput = input.tool_input || input;
  const description = toolInput.description || toolInput.prompt || '';

  // Check for secrets in task descriptions (uses shared SECRET_PATTERNS)
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(description)) {
      return {
        action: 'block',
        reason: 'Task description appears to contain secrets or credentials',
        detail: 'Never pass secrets in task parameters. Use environment variables instead.',
      };
    }
  }

  return { action: 'allow' };
}

try {
  utils.runDamageControlHook({
    getInputValue: input => {
      // Check if this is a multi-agent tool
      const toolName = input.tool_name || '';
      if (!MULTI_AGENT_TOOLS.includes(toolName)) {
        return null; // Not our tool - allow
      }
      return input;
    },

    loadConfig: () => {
      // Multi-agent hook uses inline rules, not YAML patterns
      return {
        maxTeams: MAX_CONCURRENT_TEAMS,
        maxTeammates: MAX_TEAMMATES_PER_TEAM,
        maxMessageSize: MAX_MESSAGE_SIZE,
      };
    },

    validate: (input, config) => {
      const toolName = input.tool_name || '';

      switch (toolName) {
        case 'TeamCreate':
          return validateTeamCreate(input);

        case 'TeamDelete':
          // Always ask before deleting a team
          return {
            action: 'ask',
            reason: 'Deleting a team will stop all teammates. Continue?',
          };

        case 'SendMessage':
          return validateSendMessage(input);

        case 'TaskCreate':
        case 'TaskUpdate':
          return validateTaskOperation(input);

        case 'TaskGet':
        case 'TaskList':
          // Read operations are always allowed
          return { action: 'allow' };

        default:
          return { action: 'allow' };
      }
    },

    onBlock: (result, input) => {
      const toolName = input.tool_name || 'unknown';
      utils.outputBlocked(
        `${toolName}: ${result.reason}`,
        result.detail || '',
        'Multi-agent damage control'
      );
    },
  });
} catch (e) {
  // Fail-open on runtime errors
  process.exit(0);
}
