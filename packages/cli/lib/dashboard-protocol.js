/**
 * dashboard-protocol.js - WebSocket Protocol for Dashboard Communication
 *
 * Defines message types for bidirectional communication between
 * the CLI WebSocket server and the AgileFlow Dashboard.
 *
 * Message Flow:
 * - Dashboard → CLI: User messages, commands, git actions
 * - CLI → Dashboard: Text streaming, tool calls, status updates
 */

'use strict';

// ============================================================================
// Message Types: CLI → Dashboard
// ============================================================================

/**
 * Message types sent from CLI to Dashboard
 * @enum {string}
 */
const OutboundMessageType = {
  // Connection & Session
  SESSION_STATE: 'session_state',       // Session connected/resumed
  SESSION_ERROR: 'session_error',       // Session error

  // Text Streaming
  TEXT: 'text',                         // Claude text response
  TEXT_DELTA: 'text_delta',             // Streaming text chunk

  // Tool Calls
  TOOL_START: 'tool_start',             // Tool call started
  TOOL_RESULT: 'tool_result',           // Tool call completed

  // File Operations
  FILE_READ: 'file_read',               // File was read
  FILE_WRITE: 'file_write',             // File was written
  FILE_EDIT: 'file_edit',               // File was edited (diff)

  // Shell Operations
  BASH_START: 'bash_start',             // Bash command started
  BASH_OUTPUT: 'bash_output',           // Bash output chunk
  BASH_END: 'bash_end',                 // Bash command completed

  // Task Management
  TASK_CREATED: 'task_created',         // Task was created
  TASK_UPDATED: 'task_updated',         // Task status changed
  TASK_LIST: 'task_list',               // Full task list

  // Git Status
  GIT_STATUS: 'git_status',             // Git status update
  GIT_DIFF: 'git_diff',                 // Git diff content

  // Project Status
  STATUS_UPDATE: 'status_update',       // Story/epic status update

  // Agent Communication
  AGENT_SPAWN: 'agent_spawn',           // Sub-agent spawned
  AGENT_RESULT: 'agent_result',         // Sub-agent completed

  // Notifications
  NOTIFICATION: 'notification',         // General notification

  // Terminal
  TERMINAL_OUTPUT: 'terminal_output',   // Terminal output data
  TERMINAL_RESIZE: 'terminal_resize',   // Terminal resize acknowledgment
  TERMINAL_EXIT: 'terminal_exit',       // Terminal process exited

  // Automations
  AUTOMATION_LIST: 'automation_list',   // List of all automations
  AUTOMATION_STATUS: 'automation_status', // Automation run status update
  AUTOMATION_RESULT: 'automation_result', // Automation run completed

  // Inbox
  INBOX_LIST: 'inbox_list',             // List of inbox items
  INBOX_ITEM: 'inbox_item',             // Single inbox item

  // Errors
  ERROR: 'error',                       // General error
};

/**
 * Message types sent from Dashboard to CLI
 * @enum {string}
 */
const InboundMessageType = {
  // Messages
  MESSAGE: 'message',                   // User message to Claude
  CANCEL: 'cancel',                     // Cancel current operation

  // Session
  SESSION_INIT: 'session_init',         // Initialize/resume session
  SESSION_CLOSE: 'session_close',       // Close session

  // Requests
  REFRESH: 'refresh',                   // Request status refresh

  // Git Operations
  GIT_STAGE: 'git_stage',               // Stage file(s)
  GIT_UNSTAGE: 'git_unstage',           // Unstage file(s)
  GIT_REVERT: 'git_revert',             // Revert file(s)
  GIT_COMMIT: 'git_commit',             // Create commit
  GIT_PUSH: 'git_push',                 // Push to remote
  GIT_PR: 'git_pr',                     // Create pull request
  GIT_DIFF_REQUEST: 'git_diff_request', // Request diff for a file

  // Feedback
  INLINE_COMMENT: 'inline_comment',     // Comment on diff line

  // Terminal
  TERMINAL_INPUT: 'terminal_input',     // Terminal stdin
  TERMINAL_RESIZE: 'terminal_resize',   // Resize terminal
  TERMINAL_SPAWN: 'terminal_spawn',     // Spawn new terminal
  TERMINAL_CLOSE: 'terminal_close',     // Close terminal

  // Automation
  AUTOMATION_RUN: 'automation_run',     // Run automation
  AUTOMATION_STOP: 'automation_stop',   // Stop automation
  AUTOMATION_LIST_REQUEST: 'automation_list_request', // Request automation list
  INBOX_LIST_REQUEST: 'inbox_list_request', // Request inbox list
  INBOX_ACTION: 'inbox_action',         // Accept/dismiss inbox item
};

// ============================================================================
// Message Payload Types
// ============================================================================

/**
 * Create a session state message
 * @param {string} sessionId - Session identifier
 * @param {string} state - Session state (connected, thinking, idle, error)
 * @param {Object} [meta] - Additional metadata
 */
function createSessionState(sessionId, state, meta = {}) {
  return {
    type: OutboundMessageType.SESSION_STATE,
    sessionId,
    state,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

/**
 * Create a text response message
 * @param {string} content - Text content
 * @param {boolean} [done=false] - Whether this is the final chunk
 */
function createTextMessage(content, done = false) {
  return {
    type: OutboundMessageType.TEXT,
    content,
    done,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a text delta (streaming chunk) message
 * @param {string} delta - Text chunk
 * @param {boolean} [done=false] - Whether this is the final chunk
 */
function createTextDelta(delta, done = false) {
  return {
    type: OutboundMessageType.TEXT_DELTA,
    delta,
    done,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a tool start message
 * @param {string} id - Tool call ID
 * @param {string} tool - Tool name (Read, Write, Edit, Bash, etc.)
 * @param {Object} input - Tool input parameters
 */
function createToolStart(id, tool, input) {
  return {
    type: OutboundMessageType.TOOL_START,
    id,
    tool,
    input,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a tool result message
 * @param {string} id - Tool call ID
 * @param {*} output - Tool output
 * @param {string} [error] - Error message if failed
 */
function createToolResult(id, output, error = null) {
  return {
    type: OutboundMessageType.TOOL_RESULT,
    id,
    output,
    error,
    success: !error,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a file read message
 * @param {string} path - File path
 * @param {string} content - File content
 * @param {Object} [meta] - Additional metadata (lines, truncated, etc.)
 */
function createFileRead(path, content, meta = {}) {
  return {
    type: OutboundMessageType.FILE_READ,
    path,
    content,
    ...meta,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a file edit message with diff
 * @param {string} path - File path
 * @param {Object} diff - Diff information
 * @param {string} diff.oldContent - Original content
 * @param {string} diff.newContent - New content
 * @param {Array} [diff.hunks] - Diff hunks
 */
function createFileEdit(path, diff) {
  return {
    type: OutboundMessageType.FILE_EDIT,
    path,
    diff,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a bash output message
 * @param {string} command - Command that was run
 * @param {string} output - Command output
 * @param {number} [exitCode] - Exit code if completed
 * @param {boolean} [done=false] - Whether command has completed
 */
function createBashOutput(command, output, exitCode = null, done = false) {
  return {
    type: done ? OutboundMessageType.BASH_END : OutboundMessageType.BASH_OUTPUT,
    command,
    output,
    exitCode,
    done,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a git status message
 * @param {Object} status - Git status information
 * @param {Array} status.staged - Staged files
 * @param {Array} status.unstaged - Unstaged files
 * @param {string} status.branch - Current branch
 */
function createGitStatus(status) {
  return {
    type: OutboundMessageType.GIT_STATUS,
    ...status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a task update message
 * @param {string} action - Action type (create, update, list)
 * @param {Object} task - Task data
 */
function createTaskUpdate(action, task) {
  return {
    type: action === 'list' ? OutboundMessageType.TASK_LIST : OutboundMessageType.TASK_UPDATED,
    action,
    task,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a notification message
 * @param {string} level - Notification level (info, success, warning, error)
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 */
function createNotification(level, title, message) {
  return {
    type: OutboundMessageType.NOTIFICATION,
    level,
    title,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error message
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} [details] - Additional error details
 */
function createError(code, message, details = {}) {
  return {
    type: OutboundMessageType.ERROR,
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a git diff message
 * @param {string} filePath - Path to the file
 * @param {string} diff - The diff content
 * @param {Object} stats - Diff statistics
 * @param {number} stats.additions - Number of additions
 * @param {number} stats.deletions - Number of deletions
 * @param {boolean} stats.staged - Whether this is a staged diff
 */
function createGitDiff(filePath, diff, stats = {}) {
  return {
    type: OutboundMessageType.GIT_DIFF,
    path: filePath,
    diff,
    additions: stats.additions || 0,
    deletions: stats.deletions || 0,
    staged: stats.staged || false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a terminal output message
 * @param {string} terminalId - Terminal instance ID
 * @param {string} data - Output data (can include ANSI codes)
 */
function createTerminalOutput(terminalId, data) {
  return {
    type: OutboundMessageType.TERMINAL_OUTPUT,
    terminalId,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a terminal exit message
 * @param {string} terminalId - Terminal instance ID
 * @param {number} exitCode - Process exit code
 */
function createTerminalExit(terminalId, exitCode) {
  return {
    type: OutboundMessageType.TERMINAL_EXIT,
    terminalId,
    exitCode,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an automation list message
 * @param {Object[]} automations - Array of automation objects
 */
function createAutomationList(automations) {
  return {
    type: OutboundMessageType.AUTOMATION_LIST,
    automations,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an automation status update message
 * @param {string} automationId - Automation ID
 * @param {string} status - Status (idle, running, completed, error)
 * @param {Object} [progress] - Progress information
 */
function createAutomationStatus(automationId, status, progress = {}) {
  return {
    type: OutboundMessageType.AUTOMATION_STATUS,
    automationId,
    status,
    ...progress,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an automation result message
 * @param {string} automationId - Automation ID
 * @param {Object} result - Automation run result
 */
function createAutomationResult(automationId, result) {
  return {
    type: OutboundMessageType.AUTOMATION_RESULT,
    automationId,
    ...result,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an inbox list message
 * @param {Object[]} items - Array of inbox items
 */
function createInboxList(items) {
  return {
    type: OutboundMessageType.INBOX_LIST,
    items,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an inbox item message
 * @param {Object} item - Inbox item
 */
function createInboxItem(item) {
  return {
    type: OutboundMessageType.INBOX_ITEM,
    ...item,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Message Parsing & Validation
// ============================================================================

/**
 * Parse an inbound message from the dashboard
 * @param {string|Buffer} data - Raw message data
 * @returns {{ type: string, payload: Object } | null}
 */
function parseInboundMessage(data) {
  try {
    const message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());

    if (!message.type || !Object.values(InboundMessageType).includes(message.type)) {
      console.error('[Protocol] Unknown message type:', message.type);
      return null;
    }

    return message;
  } catch (error) {
    console.error('[Protocol] Failed to parse message:', error.message);
    return null;
  }
}

/**
 * Validate a user message
 * @param {Object} message - Message object
 * @returns {boolean}
 */
function validateUserMessage(message) {
  return (
    message.type === InboundMessageType.MESSAGE &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  );
}

/**
 * Serialize an outbound message
 * @param {Object} message - Message object
 * @returns {string}
 */
function serializeMessage(message) {
  return JSON.stringify(message);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Enums
  OutboundMessageType,
  InboundMessageType,

  // Message Creators
  createSessionState,
  createTextMessage,
  createTextDelta,
  createToolStart,
  createToolResult,
  createFileRead,
  createFileEdit,
  createBashOutput,
  createGitStatus,
  createGitDiff,
  createTerminalOutput,
  createTerminalExit,
  createTaskUpdate,
  createNotification,
  createError,
  createAutomationList,
  createAutomationStatus,
  createAutomationResult,
  createInboxList,
  createInboxItem,

  // Parsing
  parseInboundMessage,
  validateUserMessage,
  serializeMessage,
};
