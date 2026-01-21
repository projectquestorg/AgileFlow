/**
 * result.js - Unified Result Schema for AgileFlow
 *
 * Provides consistent result objects across modules with type helpers.
 *
 * Standard Result Schema:
 *   { ok: boolean, data?: any, error?: string|Error }
 *
 * Extended fields (context-specific):
 *   - found: boolean (for lookup operations)
 *   - applied: number (for batch operations)
 *   - cleaned: number (for cleanup operations)
 *   - path: string (for file operations)
 *   - status: string (for state operations)
 *
 * Usage:
 *   const { ok, err, Result } = require('./result');
 *
 *   // Success
 *   return ok({ path: '/saved/file.json' });
 *
 *   // Failure
 *   return err('File not found');
 *
 *   // With data
 *   return ok({ data: parsedConfig });
 *
 *   // Type checking
 *   if (Result.isOk(result)) { ... }
 */

/**
 * Create a success result
 *
 * @param {Object} [extras={}] - Additional fields to include
 * @returns {{ ok: true } & Object} Success result
 *
 * @example
 * ok() // { ok: true }
 * ok({ data: config }) // { ok: true, data: config }
 * ok({ path: '/file.json', created: true }) // { ok: true, path: '/file.json', created: true }
 */
function ok(extras = {}) {
  return { ok: true, ...extras };
}

/**
 * Create a failure result
 *
 * @param {string|Error} error - Error message or Error object
 * @param {Object} [extras={}] - Additional fields to include
 * @returns {{ ok: false, error: string } & Object} Failure result
 *
 * @example
 * err('Not found') // { ok: false, error: 'Not found' }
 * err(new Error('Failed')) // { ok: false, error: 'Failed' }
 * err('Invalid', { code: 'EINVAL' }) // { ok: false, error: 'Invalid', code: 'EINVAL' }
 */
function err(error, extras = {}) {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message, ...extras };
}

/**
 * Result utilities for type checking and manipulation
 */
const Result = {
  /**
   * Check if result is success
   * @param {Object} result - Result to check
   * @returns {boolean}
   */
  isOk(result) {
    return Boolean(result && result.ok === true);
  },

  /**
   * Check if result is failure
   * @param {Object} result - Result to check
   * @returns {boolean}
   */
  isErr(result) {
    return Boolean(result && result.ok === false);
  },

  /**
   * Unwrap result data or throw on error
   * @param {Object} result - Result to unwrap
   * @param {string} [context] - Context for error message
   * @returns {any} The data field or the result without ok field
   * @throws {Error} If result is not ok
   */
  unwrap(result, context = '') {
    if (!Result.isOk(result)) {
      const prefix = context ? `${context}: ` : '';
      throw new Error(`${prefix}${result.error || 'Unknown error'}`);
    }
    return result.data !== undefined ? result.data : result;
  },

  /**
   * Unwrap result data or return default value
   * @param {Object} result - Result to unwrap
   * @param {any} defaultValue - Value to return on error
   * @returns {any}
   */
  unwrapOr(result, defaultValue) {
    if (!Result.isOk(result)) {
      return defaultValue;
    }
    return result.data !== undefined ? result.data : result;
  },

  /**
   * Map over successful result
   * @param {Object} result - Result to map
   * @param {Function} fn - Function to apply to data
   * @returns {Object} Mapped result or original error
   */
  map(result, fn) {
    if (!Result.isOk(result)) {
      return result;
    }
    try {
      const data = result.data !== undefined ? result.data : result;
      const mapped = fn(data);
      return ok({ data: mapped });
    } catch (e) {
      return err(e);
    }
  },

  /**
   * Convert legacy { success: true/false } to standard { ok: true/false }
   * @param {Object} legacyResult - Legacy result object
   * @returns {Object} Standardized result
   */
  fromLegacy(legacyResult) {
    if (legacyResult.success !== undefined) {
      const { success, ...rest } = legacyResult;
      return { ok: success, ...rest };
    }
    return legacyResult;
  },

  /**
   * Convert standard result to legacy format for backwards compatibility
   * @param {Object} result - Standard result object
   * @returns {Object} Legacy result with success field
   */
  toLegacy(result) {
    if (result.ok !== undefined) {
      const { ok: isOk, ...rest } = result;
      return { success: isOk, ...rest };
    }
    return result;
  },
};

/**
 * Async result helpers
 */
const AsyncResult = {
  /**
   * Wrap an async function to return Result
   * @param {Function} fn - Async function to wrap
   * @returns {Function} Wrapped function returning Result
   *
   * @example
   * const safeRead = AsyncResult.wrap(fs.promises.readFile);
   * const result = await safeRead('file.txt');
   * if (Result.isOk(result)) { console.log(result.data); }
   */
  wrap(fn) {
    return async (...args) => {
      try {
        const data = await fn(...args);
        return ok({ data });
      } catch (e) {
        return err(e);
      }
    };
  },

  /**
   * Execute multiple async operations and collect results
   * @param {Array<Promise>} promises - Promises to execute
   * @returns {Promise<Object>} Result with all settled results
   */
  async all(promises) {
    try {
      const results = await Promise.all(promises);
      const allOk = results.every(r => Result.isOk(r));
      if (allOk) {
        return ok({ data: results });
      }
      const errors = results.filter(r => Result.isErr(r)).map(r => r.error);
      return err(errors.join('; '), { partial: results });
    } catch (e) {
      return err(e);
    }
  },
};

module.exports = {
  ok,
  err,
  Result,
  AsyncResult,
};
