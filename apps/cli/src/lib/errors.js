/**
 * Typed user-facing errors for the AgileFlow CLI.
 *
 * Every error a user is likely to hit (bad argument, missing config,
 * failed install) should be one of these classes so the formatter can
 * print a consistent two-line message:
 *
 *   ✗ agileflow <cmd>: <message>
 *     Try: <suggestion>
 *
 * Internal/programmer errors should stay as plain `Error` — `fail()`
 * wraps them with a generic "Try: re-run with --debug" suggestion so
 * the CLI never prints a bare stack trace at users.
 */
const chalk = require("chalk");

/**
 * @typedef {object} AgileflowErrorOptions
 * @property {string} [suggestion] Actionable fix the user should try next.
 * @property {string} [code]       Stable machine-readable code (defaults per subclass).
 * @property {Error}  [cause]      Underlying error, if wrapping.
 */

class AgileflowError extends Error {
  /**
   * @param {string} message
   * @param {AgileflowErrorOptions} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "AgileflowError";
    this.suggestion = options.suggestion;
    this.code = options.code || "ERR_AGILEFLOW";
    if (options.cause) this.cause = options.cause;
  }
}

class MissingFileError extends AgileflowError {
  constructor(message, options = {}) {
    super(message, { code: "ERR_MISSING_FILE", ...options });
    this.name = "MissingFileError";
  }
}

class InvalidArgumentError extends AgileflowError {
  constructor(message, options = {}) {
    super(message, { code: "ERR_INVALID_ARGUMENT", ...options });
    this.name = "InvalidArgumentError";
  }
}

class OperationFailedError extends AgileflowError {
  constructor(message, options = {}) {
    super(message, { code: "ERR_OPERATION_FAILED", ...options });
    this.name = "OperationFailedError";
  }
}

/**
 * Format an error as a two-line stderr string. Does not write — caller decides.
 *
 * @param {Error} err
 * @param {{ command?: string }} [opts]
 * @returns {string}
 */
function formatError(err, opts = {}) {
  const cmd = opts.command ? `agileflow ${opts.command}` : "agileflow";
  const head = `${chalk.red("✗")} ${cmd}: ${err.message}`;
  const isAgileflowError = err instanceof AgileflowError;
  const hasStringSuggestion =
    isAgileflowError && typeof err.suggestion === "string" && err.suggestion;
  const suggestion = hasStringSuggestion
    ? err.suggestion
    : isAgileflowError
      ? null
      : "Re-run with DEBUG=1 for a stack trace, or report at https://github.com/anthropics/agileflow/issues";
  if (!suggestion) return head;
  return `${head}\n  ${chalk.dim(`Try: ${suggestion}`)}`;
}

/**
 * Print an error to stderr and exit with code 1. Use this at the leaf of
 * a command handler instead of `console.error(...); process.exit(1)`.
 *
 * Internal errors (non-AgileflowError) are still printed clearly; their
 * stack trace is emitted only when `DEBUG=1` is set, so users don't see
 * Node internals by default.
 *
 * @param {Error} err
 * @param {{ command?: string }} [opts]
 * @returns {never}
 */
function fail(err, opts = {}) {
  console.error(formatError(err, opts));
  if (isDebugEnabled() && err.stack) {
    console.error(chalk.dim(err.stack));
  }
  process.exit(1);
}

/**
 * Treat DEBUG as set unless it's an explicit falsy string. Mirrors the
 * convention used by most Node libraries (`debug`, `npm`), where
 * DEBUG=0 / DEBUG=false / DEBUG="" all mean off.
 */
function isDebugEnabled() {
  const v = process.env.DEBUG;
  if (!v) return false;
  const lowered = String(v).toLowerCase();
  return lowered !== "0" && lowered !== "false" && lowered !== "no";
}

module.exports = {
  AgileflowError,
  MissingFileError,
  InvalidArgumentError,
  OperationFailedError,
  formatError,
  fail,
};
