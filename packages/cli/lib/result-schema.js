/**
 * result-schema.js - Unified Result<T> type for consistent return values
 *
 * Provides standardized Result type with metadata for:
 * - Consistent success/failure handling
 * - Error code integration
 * - Severity and category tracking
 * - Automatic recovery suggestions
 *
 * Usage:
 *   const { success, failure, createResult, isSuccess } = require('./result-schema');
 *
 *   // Success case
 *   return success(data);
 *
 *   // Failure case
 *   return failure('ENOENT', 'File not found');
 *
 *   // Check result
 *   if (isSuccess(result)) {
 *     console.log(result.data);
 *   } else {
 *     console.error(result.error);
 *   }
 */

const { ErrorCodes, Severity, Category, getErrorCode } = require('./error-codes');

/**
 * @typedef {Object} ResultSuccess<T>
 * @property {true} ok - Indicates success
 * @property {T} data - The success data
 * @property {undefined} error - No error on success
 * @property {undefined} errorCode - No error code on success
 */

/**
 * @typedef {Object} ResultFailure
 * @property {false} ok - Indicates failure
 * @property {undefined} data - No data on failure
 * @property {string} error - Human-readable error message
 * @property {string} errorCode - Machine-readable error code
 * @property {string} severity - Error severity (critical, high, medium, low)
 * @property {string} category - Error category (filesystem, permission, etc.)
 * @property {boolean} recoverable - Whether the error can be recovered from
 * @property {string} [suggestedFix] - Suggested fix for the error
 * @property {string} [autoFix] - Auto-fix action name if available
 * @property {Object} [context] - Additional context about the error
 */

/**
 * @typedef {ResultSuccess<T> | ResultFailure} Result<T>
 */

/**
 * Create a success result
 * @template T
 * @param {T} data - The success data
 * @param {Object} [meta] - Optional metadata
 * @returns {ResultSuccess<T>}
 */
function success(data, meta = {}) {
  return {
    ok: true,
    data,
    ...meta,
  };
}

/**
 * Create a failure result with error code metadata
 * @param {string} errorCode - Error code (e.g., 'ENOENT', 'ECONFIG')
 * @param {string} [message] - Optional custom error message
 * @param {Object} [options] - Additional options
 * @param {Object} [options.context] - Additional context about the error
 * @param {Error} [options.cause] - Original error that caused this failure
 * @returns {ResultFailure}
 */
function failure(errorCode, message, options = {}) {
  const codeData = getErrorCode(errorCode) || ErrorCodes.EUNKNOWN;

  return {
    ok: false,
    error: message || codeData.message,
    errorCode: codeData.code,
    severity: codeData.severity,
    category: codeData.category,
    recoverable: codeData.recoverable,
    suggestedFix: codeData.suggestedFix,
    autoFix: codeData.autoFix || null,
    context: options.context,
    cause: options.cause,
  };
}

/**
 * Create a failure result from an existing Error object
 * @param {Error} error - The error object
 * @param {string} [defaultCode='EUNKNOWN'] - Default error code if none detected
 * @param {Object} [options] - Additional options
 * @param {Object} [options.context] - Additional context about the error
 * @returns {ResultFailure}
 */
function failureFromError(error, defaultCode = 'EUNKNOWN', options = {}) {
  const { getErrorCodeFromError } = require('./error-codes');
  const codeData = getErrorCodeFromError(error);

  // Use detected code or default
  const code = codeData.code !== 'EUNKNOWN' ? codeData.code : defaultCode;
  const finalCodeData = ErrorCodes[code] || ErrorCodes.EUNKNOWN;

  return {
    ok: false,
    error: error.message || finalCodeData.message,
    errorCode: finalCodeData.code,
    severity: finalCodeData.severity,
    category: finalCodeData.category,
    recoverable: finalCodeData.recoverable,
    suggestedFix: finalCodeData.suggestedFix,
    autoFix: finalCodeData.autoFix || null,
    context: options.context,
    cause: error,
  };
}

/**
 * Create a result from a boolean condition
 * @template T
 * @param {boolean} condition - Condition to check
 * @param {T} data - Data to return on success
 * @param {string} errorCode - Error code on failure
 * @param {string} [errorMessage] - Error message on failure
 * @returns {Result<T>}
 */
function fromCondition(condition, data, errorCode, errorMessage) {
  if (condition) {
    return success(data);
  }
  return failure(errorCode, errorMessage);
}

/**
 * Create a result from a Promise
 * @template T
 * @param {Promise<T>} promise - Promise to wrap
 * @param {string} [defaultCode='EUNKNOWN'] - Default error code on rejection
 * @returns {Promise<Result<T>>}
 */
async function fromPromise(promise, defaultCode = 'EUNKNOWN') {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    return failureFromError(error, defaultCode);
  }
}

/**
 * Create a result from a sync function call
 * @template T
 * @param {() => T} fn - Function to execute
 * @param {string} [defaultCode='EUNKNOWN'] - Default error code on throw
 * @returns {Result<T>}
 */
function fromTry(fn, defaultCode = 'EUNKNOWN') {
  try {
    const data = fn();
    return success(data);
  } catch (error) {
    return failureFromError(error, defaultCode);
  }
}

/**
 * Check if a result is successful
 * @template T
 * @param {Result<T>} result - Result to check
 * @returns {boolean}
 */
function isSuccess(result) {
  return result != null && result.ok === true;
}

/**
 * Check if a result is a failure
 * @template T
 * @param {Result<T>} result - Result to check
 * @returns {boolean}
 */
function isFailure(result) {
  return result != null && result.ok === false;
}

/**
 * Get data from result or throw if failure
 * @template T
 * @param {Result<T>} result - Result to unwrap
 * @param {string} [context] - Context for error message
 * @returns {T}
 * @throws {Error} If result is a failure
 */
function unwrap(result, context) {
  if (isSuccess(result)) {
    return result.data;
  }

  const prefix = context ? `${context}: ` : '';
  const error = new Error(`${prefix}${result.error}`);
  error.errorCode = result.errorCode;
  error.severity = result.severity;
  error.category = result.category;
  error.recoverable = result.recoverable;
  error.suggestedFix = result.suggestedFix;
  throw error;
}

/**
 * Get data from result or return default value on failure
 * @template T
 * @param {Result<T>} result - Result to unwrap
 * @param {T} defaultValue - Default value on failure
 * @returns {T}
 */
function unwrapOr(result, defaultValue) {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Transform successful result data
 * @template T, U
 * @param {Result<T>} result - Result to transform
 * @param {(data: T) => U} fn - Transform function
 * @returns {Result<U>}
 */
function map(result, fn) {
  if (isSuccess(result)) {
    return success(fn(result.data));
  }
  return result;
}

/**
 * Chain result-returning operations
 * @template T, U
 * @param {Result<T>} result - Result to chain from
 * @param {(data: T) => Result<U>} fn - Function returning Result
 * @returns {Result<U>}
 */
function flatMap(result, fn) {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Combine multiple results into one
 * @template T
 * @param {Result<T>[]} results - Results to combine
 * @returns {Result<T[]>} Combined result with array of data or first failure
 */
function all(results) {
  const data = [];

  for (const result of results) {
    if (isFailure(result)) {
      return result;
    }
    data.push(result.data);
  }

  return success(data);
}

/**
 * Get first successful result or last failure
 * @template T
 * @param {Result<T>[]} results - Results to check
 * @returns {Result<T>} First success or last failure
 */
function any(results) {
  let lastFailure = null;

  for (const result of results) {
    if (isSuccess(result)) {
      return result;
    }
    lastFailure = result;
  }

  return lastFailure || failure('EUNKNOWN', 'No results provided');
}

/**
 * Format a result for logging/display
 * @template T
 * @param {Result<T>} result - Result to format
 * @param {Object} [options] - Format options
 * @param {boolean} [options.includeData=false] - Include data in output
 * @param {boolean} [options.includeSuggestion=true] - Include suggested fix
 * @returns {string}
 */
function format(result, options = {}) {
  const { includeData = false, includeSuggestion = true } = options;

  if (isSuccess(result)) {
    if (includeData) {
      return `[OK] ${JSON.stringify(result.data)}`;
    }
    return '[OK]';
  }

  const lines = [`[${result.errorCode}] ${result.error}`];
  lines.push(`  Severity: ${result.severity} | Category: ${result.category}`);

  if (includeSuggestion && result.suggestedFix) {
    lines.push(`  Fix: ${result.suggestedFix}`);
  }

  if (result.autoFix) {
    lines.push(`  Auto-fix available: npx agileflow doctor --fix`);
  }

  return lines.join('\n');
}

module.exports = {
  // Constructors
  success,
  failure,
  failureFromError,

  // From helpers
  fromCondition,
  fromPromise,
  fromTry,

  // Type guards
  isSuccess,
  isFailure,

  // Extractors
  unwrap,
  unwrapOr,

  // Transformers
  map,
  flatMap,

  // Combinators
  all,
  any,

  // Utilities
  format,

  // Re-export enums for convenience
  Severity,
  Category,
};
