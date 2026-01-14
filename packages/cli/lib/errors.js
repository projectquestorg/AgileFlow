/**
 * errors.js - Safe error handling wrappers
 *
 * Provides consistent error handling patterns across AgileFlow scripts.
 * All wrappers return Result objects: { ok: boolean, data?: T, error?: string }
 *
 * Usage:
 *   const { safeReadJSON, safeWriteJSON, safeExec } = require('../lib/errors');
 *
 *   const result = safeReadJSON('/path/to/file.json');
 *   if (result.ok) {
 *     console.log(result.data);
 *   } else {
 *     console.error(result.error);
 *   }
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Debug logging (opt-in via AGILEFLOW_DEBUG=1)
const DEBUG = process.env.AGILEFLOW_DEBUG === '1';

function debugLog(operation, details) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [errors.js] ${operation}:`, JSON.stringify(details));
  }
}

/**
 * Safely read and parse a JSON file
 * @param {string} filePath - Absolute path to JSON file
 * @param {object} options - Optional settings
 * @param {*} options.defaultValue - Value to return if file doesn't exist (makes missing file not an error)
 * @returns {{ ok: boolean, data?: any, error?: string }}
 */
function safeReadJSON(filePath, options = {}) {
  const { defaultValue } = options;

  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== undefined) {
        debugLog('safeReadJSON', { filePath, status: 'missing, using default' });
        return { ok: true, data: defaultValue };
      }
      const error = `File not found: ${filePath}`;
      debugLog('safeReadJSON', { filePath, error });
      return { ok: false, error };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    debugLog('safeReadJSON', { filePath, status: 'success' });
    return { ok: true, data };
  } catch (err) {
    const error = `Failed to read JSON from ${filePath}: ${err.message}`;
    debugLog('safeReadJSON', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely write data as JSON to a file
 * @param {string} filePath - Absolute path to JSON file
 * @param {any} data - Data to serialize as JSON
 * @param {object} options - Optional settings
 * @param {number} options.spaces - JSON indentation (default: 2)
 * @param {boolean} options.createDir - Create parent directories if missing (default: false)
 * @returns {{ ok: boolean, error?: string }}
 */
function safeWriteJSON(filePath, data, options = {}) {
  const { spaces = 2, createDir = false } = options;

  try {
    if (createDir) {
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        debugLog('safeWriteJSON', { filePath, status: 'created directory', dir });
      }
    }

    const content = JSON.stringify(data, null, spaces) + '\n';
    fs.writeFileSync(filePath, content);
    debugLog('safeWriteJSON', { filePath, status: 'success' });
    return { ok: true };
  } catch (err) {
    const error = `Failed to write JSON to ${filePath}: ${err.message}`;
    debugLog('safeWriteJSON', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely read a text file
 * @param {string} filePath - Absolute path to file
 * @param {object} options - Optional settings
 * @param {string} options.defaultValue - Value to return if file doesn't exist
 * @returns {{ ok: boolean, data?: string, error?: string }}
 */
function safeReadFile(filePath, options = {}) {
  const { defaultValue } = options;

  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== undefined) {
        debugLog('safeReadFile', { filePath, status: 'missing, using default' });
        return { ok: true, data: defaultValue };
      }
      const error = `File not found: ${filePath}`;
      debugLog('safeReadFile', { filePath, error });
      return { ok: false, error };
    }

    const data = fs.readFileSync(filePath, 'utf8');
    debugLog('safeReadFile', { filePath, status: 'success' });
    return { ok: true, data };
  } catch (err) {
    const error = `Failed to read file ${filePath}: ${err.message}`;
    debugLog('safeReadFile', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely write text to a file
 * @param {string} filePath - Absolute path to file
 * @param {string} content - Content to write
 * @param {object} options - Optional settings
 * @param {boolean} options.createDir - Create parent directories if missing (default: false)
 * @returns {{ ok: boolean, error?: string }}
 */
function safeWriteFile(filePath, content, options = {}) {
  const { createDir = false } = options;

  try {
    if (createDir) {
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        debugLog('safeWriteFile', { filePath, status: 'created directory', dir });
      }
    }

    fs.writeFileSync(filePath, content);
    debugLog('safeWriteFile', { filePath, status: 'success' });
    return { ok: true };
  } catch (err) {
    const error = `Failed to write file ${filePath}: ${err.message}`;
    debugLog('safeWriteFile', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely execute a shell command
 * @param {string} command - Shell command to execute
 * @param {object} options - Optional settings
 * @param {string} options.cwd - Working directory
 * @param {number} options.timeout - Timeout in ms (default: 30000)
 * @param {boolean} options.silent - Suppress stderr (default: false)
 * @returns {{ ok: boolean, data?: string, error?: string, exitCode?: number }}
 */
function safeExec(command, options = {}) {
  const { cwd = process.cwd(), timeout = 30000, silent = false } = options;

  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: silent ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'inherit'],
    });
    debugLog('safeExec', { command: command.slice(0, 50), status: 'success' });
    return { ok: true, data: output.trim() };
  } catch (err) {
    const exitCode = err.status || 1;
    const error = `Command failed (exit ${exitCode}): ${command.slice(0, 100)}${err.message ? ` - ${err.message}` : ''}`;
    debugLog('safeExec', { command: command.slice(0, 50), error: err.message, exitCode });
    return { ok: false, error, exitCode };
  }
}

/**
 * Safely check if a file or directory exists
 * @param {string} path - Path to check
 * @returns {{ ok: boolean, exists: boolean }}
 */
function safeExists(path) {
  try {
    const exists = fs.existsSync(path);
    return { ok: true, exists };
  } catch (err) {
    debugLog('safeExists', { path, error: err.message });
    return { ok: true, exists: false };
  }
}

/**
 * Safely create a directory
 * @param {string} dirPath - Directory path to create
 * @param {object} options - Optional settings
 * @param {boolean} options.recursive - Create parent directories (default: true)
 * @returns {{ ok: boolean, error?: string }}
 */
function safeMkdir(dirPath, options = {}) {
  const { recursive = true } = options;

  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive });
      debugLog('safeMkdir', { dirPath, status: 'created' });
    } else {
      debugLog('safeMkdir', { dirPath, status: 'already exists' });
    }
    return { ok: true };
  } catch (err) {
    const error = `Failed to create directory ${dirPath}: ${err.message}`;
    debugLog('safeMkdir', { dirPath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Wrap any function to catch errors and return Result
 * @param {Function} fn - Function to wrap
 * @param {string} operationName - Name for error messages
 * @returns {Function} - Wrapped function returning { ok, data?, error? }
 */
function wrapSafe(fn, operationName = 'operation') {
  return function (...args) {
    try {
      const result = fn.apply(this, args);
      return { ok: true, data: result };
    } catch (err) {
      const error = `${operationName} failed: ${err.message}`;
      debugLog('wrapSafe', { operationName, error: err.message });
      return { ok: false, error };
    }
  };
}

/**
 * Wrap an async function to catch errors and return Result
 * @param {Function} fn - Async function to wrap
 * @param {string} operationName - Name for error messages
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.attachErrorCode=false] - Attach error code metadata
 * @returns {Function} - Wrapped async function returning { ok, data?, error?, errorCode?, suggestedFix? }
 */
function wrapSafeAsync(fn, operationName = 'operation', options = {}) {
  const { attachErrorCode = false } = options;

  return async function (...args) {
    try {
      const result = await fn.apply(this, args);
      return { ok: true, data: result };
    } catch (err) {
      const error = `${operationName} failed: ${err.message}`;
      debugLog('wrapSafeAsync', { operationName, error: err.message });

      const result = { ok: false, error };

      // Optionally attach error code metadata
      if (attachErrorCode) {
        try {
          const { getErrorCodeFromError } = require('./error-codes');
          const codeData = getErrorCodeFromError(err);
          result.errorCode = codeData.code;
          result.severity = codeData.severity;
          result.category = codeData.category;
          result.recoverable = codeData.recoverable;
          result.suggestedFix = codeData.suggestedFix;
          result.autoFix = codeData.autoFix;
        } catch {
          // error-codes not available, skip
        }
      }

      return result;
    }
  };
}

module.exports = {
  // Core safe operations
  safeReadJSON,
  safeWriteJSON,
  safeReadFile,
  safeWriteFile,
  safeExec,
  safeExists,
  safeMkdir,

  // Utility wrappers
  wrapSafe,
  wrapSafeAsync,

  // Debug helper
  debugLog,
};
