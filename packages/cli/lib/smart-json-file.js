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

    debugLog('constructor', {
      filePath,
      options: { retries: this.retries, backoff: this.backoff },
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

module.exports = SmartJsonFile;
