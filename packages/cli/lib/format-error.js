/**
 * format-error.js - Standalone error formatting helpers
 *
 * Extracted from ErrorHandler for use without class instantiation.
 * Provides consistent error/warning formatting with actionable guidance.
 *
 * Format: "X <problem> | Action: <what to do> | Run: <command>"
 *
 * Usage:
 *   const { formatError, formatWarning, formatSuccess, formatInfo } = require('./format-error');
 *   console.error(formatError('File not found', 'Check the path', 'ls -la'));
 */

const { c } = require('./colors');

// Unicode symbols
const SYMBOLS = {
  error: '\u2716', // ✖
  warning: '\u26A0', // ⚠
  success: '\u2714', // ✔
  info: '\u2139', // ℹ
};

/**
 * Format a message with optional action and command hints
 *
 * @param {string} symbol - Unicode symbol to use
 * @param {string} symbolColor - Color for the symbol
 * @param {string} message - The message to display
 * @param {Object} [options={}] - Formatting options
 * @param {string} [options.action] - Action text (what user should do)
 * @param {string} [options.command] - Command to run
 * @param {string} [options.detail] - Additional detail line
 * @returns {string} Formatted message string
 */
function formatMessage(symbol, symbolColor, message, options = {}) {
  const { action, command, detail } = options;

  let output = `${symbolColor}${symbol}${c.reset} ${message}`;

  if (action) {
    output += ` ${c.dim}|${c.reset} ${c.cyan}Action:${c.reset} ${action}`;
  }

  if (command) {
    output += ` ${c.dim}|${c.reset} ${c.green}Run:${c.reset} ${c.bold}${command}${c.reset}`;
  }

  if (detail) {
    output += `\n  ${c.dim}${detail}${c.reset}`;
  }

  return output;
}

/**
 * Format an error message (red X)
 *
 * @param {string} message - Error message
 * @param {string} [action] - What user should do
 * @param {string} [command] - Command to run
 * @returns {string} Formatted error string
 *
 * @example
 * formatError('Config not found', 'Create config file', 'npx agileflow setup')
 * // Output: ✖ Config not found | Action: Create config file | Run: npx agileflow setup
 */
function formatError(message, action, command) {
  return formatMessage(SYMBOLS.error, c.red, message, { action, command });
}

/**
 * Format a warning message (yellow warning sign)
 *
 * @param {string} message - Warning message
 * @param {string} [action] - What user should do
 * @param {string} [command] - Command to run
 * @returns {string} Formatted warning string
 */
function formatWarning(message, action, command) {
  return formatMessage(SYMBOLS.warning, c.yellow, message, { action, command });
}

/**
 * Format a success message (green checkmark)
 *
 * @param {string} message - Success message
 * @param {string} [detail] - Additional detail
 * @returns {string} Formatted success string
 */
function formatSuccess(message, detail) {
  return formatMessage(SYMBOLS.success, c.green, message, { detail });
}

/**
 * Format an info message (blue info symbol)
 *
 * @param {string} message - Info message
 * @param {string} [detail] - Additional detail
 * @returns {string} Formatted info string
 */
function formatInfo(message, detail) {
  return formatMessage(SYMBOLS.info, c.blue, message, { detail });
}

/**
 * Format multiple issues for display
 *
 * @param {Array<{type: 'error'|'warning'|'success'|'info', message: string, action?: string, command?: string}>} issues
 * @returns {string[]} Array of formatted strings
 */
function formatIssues(issues) {
  return issues.map(issue => {
    switch (issue.type) {
      case 'error':
        return formatError(issue.message, issue.action, issue.command);
      case 'warning':
        return formatWarning(issue.message, issue.action, issue.command);
      case 'success':
        return formatSuccess(issue.message, issue.detail);
      case 'info':
        return formatInfo(issue.message, issue.detail);
      default:
        return formatInfo(issue.message);
    }
  });
}

/**
 * Format error with stack trace (for DEBUG mode)
 *
 * @param {string} message - Error message
 * @param {Error} error - Error object with stack
 * @param {Object} [options={}] - Formatting options
 * @returns {string} Formatted error with optional stack trace
 */
function formatErrorWithStack(message, error, options = {}) {
  const base = formatError(message, options.action, options.command);

  if (process.env.DEBUG === '1' && error?.stack) {
    return `${base}\n\n${c.dim}Stack trace:${c.reset}\n${c.dim}${error.stack}${c.reset}`;
  }

  return base;
}

module.exports = {
  formatError,
  formatWarning,
  formatSuccess,
  formatInfo,
  formatIssues,
  formatErrorWithStack,
  formatMessage,
  SYMBOLS,
};
