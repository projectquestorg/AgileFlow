/**
 * error-handler.js - Centralized Error Handling with Actionable Guidance
 *
 * Provides three-tier error handling:
 * - INFO: Non-blocking issues (does not exit)
 * - WARNING: Issues that should be addressed (exit 1)
 * - CRITICAL: Severe errors (exit 1 + stack trace if DEBUG=1)
 *
 * Error output format: "X <problem> | Action: <what to do> | Run: <command>"
 *
 * Note: Formatting logic is extracted to lib/format-error.js for standalone use.
 */

const {
  formatError: formatErrorHelper,
  formatWarning: formatWarningHelper,
  formatErrorWithStack,
} = require('../../../lib/format-error');

class ErrorHandler {
  /**
   * Create an ErrorHandler instance
   * @param {string} commandName - Name of the command using this handler
   */
  constructor(commandName = 'agileflow') {
    this.commandName = commandName;
  }

  /**
   * Format error with actionable guidance
   * Output: "X <problem> | Action: <what to do> | Run: <command>"
   *
   * @param {string} message - The error message describing the problem
   * @param {string} [actionText] - What the user should do to fix it
   * @param {string} [commandHint] - Command to run to fix it
   * @returns {string} Formatted error string
   */
  formatError(message, actionText, commandHint) {
    return formatErrorHelper(message, actionText, commandHint);
  }

  /**
   * Format warning message (yellow indicator)
   * @param {string} message - The warning message
   * @param {string} [actionText] - What the user should do
   * @param {string} [commandHint] - Command to run
   * @returns {string} Formatted warning string
   */
  formatWarning(message, actionText, commandHint) {
    return formatWarningHelper(message, actionText, commandHint);
  }

  /**
   * INFO: Non-blocking issue, continue execution (does NOT exit)
   * Use for informational messages about issues that don't prevent operation.
   *
   * @param {string} message - The info message
   * @param {string} [actionText] - Optional action hint
   * @param {string} [commandHint] - Optional command hint
   */
  info(message, actionText, commandHint) {
    console.log(this.formatWarning(message, actionText, commandHint));
    // Does NOT exit - allows continuation
  }

  /**
   * WARNING: Issue that should be addressed (exit 1)
   * Use for problems that prevent the operation from completing properly.
   *
   * @param {string} message - The warning message
   * @param {string} [actionText] - What the user should do
   * @param {string} [commandHint] - Command to run to fix it
   */
  warning(message, actionText, commandHint) {
    console.error(this.formatError(message, actionText, commandHint));
    process.exit(1);
  }

  /**
   * CRITICAL: Severe error (exit 1 + stack trace if DEBUG=1)
   * Use for unexpected errors, crashes, or severe failures.
   *
   * @param {string} message - The error message
   * @param {string} [actionText] - What the user should do
   * @param {string} [commandHint] - Command to run
   * @param {Error} [error] - Original error object for stack trace
   */
  critical(message, actionText, commandHint, error) {
    const formatted = formatErrorWithStack(message, error, {
      action: actionText,
      command: commandHint,
    });
    console.error(formatted);
    process.exit(1);
  }

  /**
   * Convenience method: Get formatted error string without exiting
   * Useful for collecting multiple errors before displaying.
   *
   * @param {string} message - The error message
   * @param {string} [actionText] - What the user should do
   * @param {string} [commandHint] - Command to run
   * @returns {string} Formatted error string
   */
  errorWithAction(message, actionText, commandHint) {
    return this.formatError(message, actionText, commandHint);
  }

  /**
   * Convenience method: Get formatted warning string without exiting
   *
   * @param {string} message - The warning message
   * @param {string} [actionText] - What the user should do
   * @param {string} [commandHint] - Command to run
   * @returns {string} Formatted warning string
   */
  warningWithAction(message, actionText, commandHint) {
    return this.formatWarning(message, actionText, commandHint);
  }

  /**
   * Display multiple issues at once, then exit with appropriate code
   * Useful for validation that collects all errors before reporting.
   *
   * @param {Array<{type: 'info'|'warning'|'error', message: string, action?: string, command?: string}>} issues
   * @returns {boolean} True if there were errors/warnings (would normally exit)
   */
  reportIssues(issues) {
    let hasErrors = false;
    let hasWarnings = false;

    for (const issue of issues) {
      if (issue.type === 'error') {
        console.error(this.formatError(issue.message, issue.action, issue.command));
        hasErrors = true;
      } else if (issue.type === 'warning') {
        console.error(this.formatWarning(issue.message, issue.action, issue.command));
        hasWarnings = true;
      } else {
        console.log(this.formatWarning(issue.message, issue.action, issue.command));
      }
    }

    if (hasErrors || hasWarnings) {
      process.exit(1);
    }

    return hasErrors || hasWarnings;
  }
}

/**
 * Create a pre-configured ErrorHandler instance
 * @param {string} commandName - Name of the command
 * @returns {ErrorHandler} New ErrorHandler instance
 */
function createErrorHandler(commandName) {
  return new ErrorHandler(commandName);
}

module.exports = {
  ErrorHandler,
  createErrorHandler,
};
