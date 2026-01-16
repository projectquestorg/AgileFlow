/**
 * smart-json-file.js - Safe JSON File Operations with Retry Logic
 *
 * Provides atomic writes, automatic retries, and error code integration
 * for all JSON file operations in AgileFlow.
 *
 * Features:
 * - Atomic writes (write to temp file, then rename)
 * - Configurable retry logic with exponential backoff
 * - Integration with error-codes.js for typed errors
 * - Schema validation support
 * - Automatic directory creation
 *
 * Usage:
 *   const SmartJsonFile = require('./smart-json-file');
 *
 *   // Basic usage
 *   const file = new SmartJsonFile('/path/to/file.json');
 *   const data = await file.read();
 *   await file.write({ key: 'value' });
 *
 *   // With options
 *   const file = new SmartJsonFile('/path/to/file.json', {
 *     retries: 3,
 *     backoff: 100,
 *     createDir: true,
 *     schema: mySchema
 *   });
 */

const fs = require('fs');
const path = require('path');
const { createTypedError, getErrorCodeFromError, ErrorCodes } = require('./error-codes');

// Debug logging
const DEBUG = process.env.AGILEFLOW_DEBUG === '1';

function debugLog(operation, details) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [SmartJsonFile] ${operation}:`, JSON.stringify(details));
  }
}

// Security: Secure file permission mode for sensitive config files
// 0o600 = owner read/write only (no group or world access)
const SECURE_FILE_MODE = 0o600;

/**
 * Check if file permissions are too permissive (security risk)
 * @param {number} mode - File mode (from fs.statSync)
 * @returns {{ok: boolean, warning?: string}} Check result
 */
function checkFilePermissions(mode) {
  // Skip permission checks on Windows (different permission model)
  if (process.platform === 'win32') {
    return { ok: true };
  }

  // Extract permission bits (last 9 bits)
  const permissions = mode & 0o777;

  // Check for group/world readable/writable (security risk)
  const groupRead = permissions & 0o040;
  const groupWrite = permissions & 0o020;
  const worldRead = permissions & 0o004;
  const worldWrite = permissions & 0o002;

  if (worldWrite) {
    return {
      ok: false,
      warning: 'File is world-writable (mode: ' + permissions.toString(8) + '). Security risk - others can modify.',
    };
  }

  if (worldRead) {
    return {
      ok: false,
      warning: 'File is world-readable (mode: ' + permissions.toString(8) + '). May expose sensitive config.',
    };
  }

  if (groupWrite) {
    return {
      ok: false,
      warning: 'File is group-writable (mode: ' + permissions.toString(8) + '). Consider restricting to 0600.',
    };
  }

  if (groupRead) {
    return {
      ok: false,
      warning: 'File is group-readable (mode: ' + permissions.toString(8) + '). Consider restricting to 0600.',
    };
  }

  return { ok: true };
}

/**
 * Set secure permissions on a file (0o600 - owner only)
 * @param {string} filePath - Path to the file
 * @returns {{ok: boolean, error?: Error}}
 */
function setSecurePermissions(filePath) {
  // Skip on Windows
  if (process.platform === 'win32') {
    return { ok: true };
  }

  try {
    fs.chmodSync(filePath, SECURE_FILE_MODE);
    debugLog('setSecurePermissions', { filePath, mode: SECURE_FILE_MODE.toString(8) });
    return { ok: true };
  } catch (err) {
    const error = createTypedError(`Failed to set secure permissions on ${filePath}: ${err.message}`, 'EPERM', {
      cause: err,
      context: { filePath, mode: SECURE_FILE_MODE },
    });
    return { ok: false, error };
  }
}

/**
 * Generate a unique temporary file path
 * @param {string} filePath - Original file path
 * @returns {string} Temporary file path
 */
function getTempPath(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return path.join(dir, `.${base}.${timestamp}.${random}${ext}.tmp`);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * SmartJsonFile - Safe JSON file operations with retry logic
 */
class SmartJsonFile {
  /**
   * @param {string} filePath - Absolute path to JSON file
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.retries=3] - Number of retry attempts
   * @param {number} [options.backoff=100] - Initial backoff in ms (doubles each retry)
   * @param {boolean} [options.createDir=true] - Create parent directory if missing
   * @param {number} [options.spaces=2] - JSON indentation spaces
   * @param {Function} [options.schema] - Optional validation function (throws on invalid)
   * @param {*} [options.defaultValue] - Default value if file doesn't exist
   * @param {boolean} [options.secureMode=false] - Enforce 0o600 permissions on write
   * @param {boolean} [options.warnInsecure=false] - Warn if file has insecure permissions on read
   */
  constructor(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw createTypedError('filePath is required and must be a string', 'EINVAL', {
        context: { provided: typeof filePath },
      });
    }

    if (!path.isAbsolute(filePath)) {
      throw createTypedError('filePath must be an absolute path', 'EINVAL', {
        context: { provided: filePath },
      });
    }

    this.filePath = filePath;
    this.retries = options.retries ?? 3;
    this.backoff = options.backoff ?? 100;
    this.createDir = options.createDir ?? true;
    this.spaces = options.spaces ?? 2;
    this.schema = options.schema ?? null;
    this.defaultValue = options.defaultValue;
    this.secureMode = options.secureMode ?? false;
    this.warnInsecure = options.warnInsecure ?? false;

    debugLog('constructor', {
      filePath,
      options: { retries: this.retries, backoff: this.backoff, secureMode: this.secureMode },
    });
  }

  /**
   * Read and parse JSON file
   * @returns {Promise<{ok: boolean, data?: any, error?: Error}>} Result object
   */
  async read() {
    let lastError = null;
    let attempt = 0;

    while (attempt <= this.retries) {
      try {
        debugLog('read', { filePath: this.filePath, attempt });

        // Check if file exists
        if (!fs.existsSync(this.filePath)) {
          if (this.defaultValue !== undefined) {
            debugLog('read', { status: 'using default value' });
            return { ok: true, data: this.defaultValue };
          }
          const error = createTypedError(`File not found: ${this.filePath}`, 'ENOENT', {
            context: { filePath: this.filePath },
          });
          return { ok: false, error };
        }

        // Read file
        const content = fs.readFileSync(this.filePath, 'utf8');

        // Security: Check file permissions if warnInsecure is enabled
        if (this.warnInsecure) {
          try {
            const stats = fs.statSync(this.filePath);
            const permCheck = checkFilePermissions(stats.mode);
            if (!permCheck.ok) {
              debugLog('read', { security: 'insecure permissions', warning: permCheck.warning });
              // Log warning to stderr (non-blocking)
              console.error(`[Security Warning] ${this.filePath}: ${permCheck.warning}`);
            }
          } catch (statErr) {
            debugLog('read', { security: 'could not check permissions', error: statErr.message });
          }
        }

        // Parse JSON
        let data;
        try {
          data = JSON.parse(content);
        } catch (parseError) {
          const error = createTypedError(
            `Invalid JSON in ${this.filePath}: ${parseError.message}`,
            'EPARSE',
            { cause: parseError, context: { filePath: this.filePath } }
          );
          return { ok: false, error };
        }

        // Validate schema if provided
        if (this.schema) {
          try {
            this.schema(data);
          } catch (schemaError) {
            const error = createTypedError(
              `Schema validation failed for ${this.filePath}: ${schemaError.message}`,
              'ESCHEMA',
              { cause: schemaError, context: { filePath: this.filePath } }
            );
            return { ok: false, error };
          }
        }

        debugLog('read', { status: 'success' });
        return { ok: true, data };
      } catch (err) {
        lastError = err;
        debugLog('read', { status: 'error', error: err.message, attempt });

        // Don't retry for certain errors
        const errorCode = getErrorCodeFromError(err);
        if (errorCode.code === 'EACCES' || errorCode.code === 'EPERM') {
          // Permission errors won't resolve with retries
          const error = createTypedError(`Permission denied reading ${this.filePath}`, 'EACCES', {
            cause: err,
            context: { filePath: this.filePath },
          });
          return { ok: false, error };
        }

        // Wait before retrying
        if (attempt < this.retries) {
          const waitTime = this.backoff * Math.pow(2, attempt);
          debugLog('read', { status: 'retrying', waitTime });
          await sleep(waitTime);
        }

        attempt++;
      }
    }

    // All retries exhausted
    const error = createTypedError(
      `Failed to read ${this.filePath} after ${this.retries + 1} attempts: ${lastError?.message}`,
      'EUNKNOWN',
      { cause: lastError, context: { filePath: this.filePath, attempts: this.retries + 1 } }
    );
    return { ok: false, error };
  }

  /**
   * Write data to JSON file atomically
   * @param {any} data - Data to write
   * @returns {Promise<{ok: boolean, error?: Error}>} Result object
   */
  async write(data) {
    let lastError = null;
    let attempt = 0;

    // Validate schema before writing
    if (this.schema) {
      try {
        this.schema(data);
      } catch (schemaError) {
        const error = createTypedError(
          `Schema validation failed: ${schemaError.message}`,
          'ESCHEMA',
          { cause: schemaError, context: { filePath: this.filePath } }
        );
        return { ok: false, error };
      }
    }

    while (attempt <= this.retries) {
      const tempPath = getTempPath(this.filePath);

      try {
        debugLog('write', { filePath: this.filePath, tempPath, attempt });

        // Create parent directory if needed
        const dir = path.dirname(this.filePath);
        if (this.createDir && !fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          debugLog('write', { status: 'created directory', dir });
        }

        // Serialize data
        const content = JSON.stringify(data, null, this.spaces) + '\n';

        // Write to temp file
        fs.writeFileSync(tempPath, content, 'utf8');
        debugLog('write', { status: 'wrote temp file' });

        // Atomic rename
        fs.renameSync(tempPath, this.filePath);

        // Security: Set secure permissions if secureMode is enabled
        if (this.secureMode) {
          const permResult = setSecurePermissions(this.filePath);
          if (!permResult.ok) {
            debugLog('write', { status: 'warning', security: 'failed to set secure permissions' });
            // Don't fail the write, just warn
          }
        }

        debugLog('write', { status: 'success' });

        return { ok: true };
      } catch (err) {
        lastError = err;
        debugLog('write', { status: 'error', error: err.message, attempt });

        // Clean up temp file if it exists
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch {
          // Ignore cleanup errors
        }

        // Don't retry for certain errors
        const errorCode = getErrorCodeFromError(err);
        if (
          errorCode.code === 'EACCES' ||
          errorCode.code === 'EPERM' ||
          errorCode.code === 'EROFS'
        ) {
          const error = createTypedError(
            `Permission denied writing ${this.filePath}`,
            errorCode.code,
            { cause: err, context: { filePath: this.filePath } }
          );
          return { ok: false, error };
        }

        // Wait before retrying
        if (attempt < this.retries) {
          const waitTime = this.backoff * Math.pow(2, attempt);
          debugLog('write', { status: 'retrying', waitTime });
          await sleep(waitTime);
        }

        attempt++;
      }
    }

    // All retries exhausted
    const error = createTypedError(
      `Failed to write ${this.filePath} after ${this.retries + 1} attempts: ${lastError?.message}`,
      'EUNKNOWN',
      { cause: lastError, context: { filePath: this.filePath, attempts: this.retries + 1 } }
    );
    return { ok: false, error };
  }

  /**
   * Read, modify, and write atomically
   * @param {Function} modifier - Function that takes current data and returns modified data
   * @returns {Promise<{ok: boolean, data?: any, error?: Error}>} Result object
   */
  async modify(modifier) {
    debugLog('modify', { filePath: this.filePath });

    // Read current data
    const readResult = await this.read();
    if (!readResult.ok) {
      // If file doesn't exist but we have a default value, use that
      if (readResult.error?.errorCode === 'ENOENT' && this.defaultValue !== undefined) {
        readResult.ok = true;
        readResult.data = this.defaultValue;
        delete readResult.error;
      } else {
        return readResult;
      }
    }

    // Apply modifier
    let newData;
    try {
      newData = await modifier(readResult.data);
    } catch (modifyError) {
      const error = createTypedError(`Modifier function failed: ${modifyError.message}`, 'EINVAL', {
        cause: modifyError,
        context: { filePath: this.filePath },
      });
      return { ok: false, error };
    }

    // Write modified data
    const writeResult = await this.write(newData);
    if (!writeResult.ok) {
      return writeResult;
    }

    return { ok: true, data: newData };
  }

  /**
   * Check if file exists
   * @returns {boolean}
   */
  exists() {
    return fs.existsSync(this.filePath);
  }

  /**
   * Delete the file
   * @returns {Promise<{ok: boolean, error?: Error}>}
   */
  async delete() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { ok: true }; // Already doesn't exist
      }

      fs.unlinkSync(this.filePath);
      debugLog('delete', { filePath: this.filePath, status: 'success' });
      return { ok: true };
    } catch (err) {
      const errorCode = getErrorCodeFromError(err);
      const error = createTypedError(
        `Failed to delete ${this.filePath}: ${err.message}`,
        errorCode.code,
        { cause: err, context: { filePath: this.filePath } }
      );
      return { ok: false, error };
    }
  }

  /**
   * Synchronous read - for cases where async isn't possible
   * @returns {{ok: boolean, data?: any, error?: Error}}
   */
  readSync() {
    try {
      if (!fs.existsSync(this.filePath)) {
        if (this.defaultValue !== undefined) {
          return { ok: true, data: this.defaultValue };
        }
        const error = createTypedError(`File not found: ${this.filePath}`, 'ENOENT', {
          context: { filePath: this.filePath },
        });
        return { ok: false, error };
      }

      const content = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(content);

      if (this.schema) {
        this.schema(data);
      }

      return { ok: true, data };
    } catch (err) {
      const errorCode = getErrorCodeFromError(err);
      const error = createTypedError(
        `Failed to read ${this.filePath}: ${err.message}`,
        errorCode.code,
        { cause: err, context: { filePath: this.filePath } }
      );
      return { ok: false, error };
    }
  }

  /**
   * Synchronous write - for cases where async isn't possible
   * @param {any} data - Data to write
   * @returns {{ok: boolean, error?: Error}}
   */
  writeSync(data) {
    const tempPath = getTempPath(this.filePath);

    try {
      if (this.schema) {
        this.schema(data);
      }

      const dir = path.dirname(this.filePath);
      if (this.createDir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = JSON.stringify(data, null, this.spaces) + '\n';
      fs.writeFileSync(tempPath, content, 'utf8');
      fs.renameSync(tempPath, this.filePath);

      // Security: Set secure permissions if secureMode is enabled
      if (this.secureMode) {
        const permResult = setSecurePermissions(this.filePath);
        if (!permResult.ok) {
          debugLog('writeSync', { status: 'warning', security: 'failed to set secure permissions' });
        }
      }

      return { ok: true };
    } catch (err) {
      // Clean up temp file
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // Ignore
      }

      const errorCode = getErrorCodeFromError(err);
      const error = createTypedError(
        `Failed to write ${this.filePath}: ${err.message}`,
        errorCode.code,
        { cause: err, context: { filePath: this.filePath } }
      );
      return { ok: false, error };
    }
  }
}

// Default max age for temp files (24 hours in milliseconds)
const DEFAULT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Clean up orphaned temp files in a directory
 *
 * Removes files matching the temp file pattern that are older than maxAge.
 * Pattern: .{basename}.{timestamp}.{random}.{ext}.tmp
 *
 * @param {string} directory - Directory to clean
 * @param {Object} [options={}] - Cleanup options
 * @param {number} [options.maxAgeMs=86400000] - Max age in ms (default: 24 hours)
 * @param {boolean} [options.dryRun=false] - Don't delete, just report
 * @returns {{ok: boolean, cleaned: string[], errors: string[]}}
 */
function cleanupTempFiles(directory, options = {}) {
  const { maxAgeMs = DEFAULT_TEMP_MAX_AGE_MS, dryRun = false } = options;

  const cleaned = [];
  const errors = [];

  try {
    if (!fs.existsSync(directory)) {
      return { ok: true, cleaned, errors };
    }

    const now = Date.now();
    const entries = fs.readdirSync(directory);

    // Pattern: .{basename}.{timestamp}.{random}.{ext}.tmp
    const tempFilePattern = /^\.[^.]+\.\d+\.[a-z0-9]+\.[^.]+\.tmp$/;

    for (const entry of entries) {
      // Check if it matches temp file pattern
      if (!tempFilePattern.test(entry)) continue;

      const filePath = path.join(directory, entry);

      try {
        const stat = fs.statSync(filePath);

        // Skip if not a file
        if (!stat.isFile()) continue;

        // Check age
        const age = now - stat.mtimeMs;
        if (age < maxAgeMs) continue;

        // Delete the temp file
        if (!dryRun) {
          fs.unlinkSync(filePath);
        }

        cleaned.push(filePath);
        debugLog('cleanupTempFiles', { action: dryRun ? 'would delete' : 'deleted', filePath, ageHours: Math.round(age / 3600000) });
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
        debugLog('cleanupTempFiles', { action: 'error', filePath, error: err.message });
      }
    }

    return { ok: errors.length === 0, cleaned, errors };
  } catch (err) {
    errors.push(`Directory read error: ${err.message}`);
    return { ok: false, cleaned, errors };
  }
}

/**
 * Clean up temp files in the directory of a specific JSON file
 *
 * @param {string} filePath - Path to the JSON file
 * @param {Object} [options={}] - Cleanup options
 * @returns {{ok: boolean, cleaned: string[], errors: string[]}}
 */
function cleanupTempFilesFor(filePath, options = {}) {
  const directory = path.dirname(filePath);
  return cleanupTempFiles(directory, options);
}

module.exports = SmartJsonFile;

// Export helper functions for external use
module.exports.SECURE_FILE_MODE = SECURE_FILE_MODE;
module.exports.checkFilePermissions = checkFilePermissions;
module.exports.setSecurePermissions = setSecurePermissions;
module.exports.cleanupTempFiles = cleanupTempFiles;
module.exports.cleanupTempFilesFor = cleanupTempFilesFor;
module.exports.DEFAULT_TEMP_MAX_AGE_MS = DEFAULT_TEMP_MAX_AGE_MS;
