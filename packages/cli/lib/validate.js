/**
 * AgileFlow CLI - Input Validation Utilities
 *
 * Centralized validation patterns and helpers to prevent
 * command injection, path traversal, and invalid input handling.
 */

const path = require('node:path');
const fs = require('node:fs');

/**
 * Validation patterns for common input types.
 * All patterns use strict whitelisting approach.
 */
const PATTERNS = {
  // Git branch: alphanumeric, underscores, hyphens, forward slashes
  // Examples: main, feature/US-0001, session-1, my_branch
  branchName: /^[a-zA-Z0-9][a-zA-Z0-9_/-]*$/,

  // Story ID: US-0001 to US-99999
  storyId: /^US-\d{4,5}$/,

  // Epic ID: EP-0001 to EP-99999
  epicId: /^EP-\d{4,5}$/,

  // Feature name: lowercase with hyphens, starts with letter
  // Examples: damage-control, status-line, archival
  featureName: /^[a-z][a-z0-9-]*$/,

  // Profile name: alphanumeric with underscores/hyphens, starts with letter
  // Examples: default, my-profile, dev_config
  profileName: /^[a-zA-Z][a-zA-Z0-9_-]*$/,

  // Command name: alphanumeric with hyphens/colons, starts with letter
  // Examples: babysit, story:list, agileflow:configure
  commandName: /^[a-zA-Z][a-zA-Z0-9:-]*$/,

  // Session nickname: alphanumeric with hyphens/underscores
  // Examples: auth-work, feature_1, main
  sessionNickname: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,

  // Merge strategy: squash or merge
  // Examples: squash, merge
  mergeStrategy: /^(squash|merge)$/,
};

/**
 * Validate a git branch name.
 * @param {string} name - Branch name to validate
 * @returns {boolean} True if valid
 */
function isValidBranchName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 255) return false; // Git limit
  if (name.startsWith('-')) return false; // Prevent flag injection
  if (name.includes('..')) return false; // Prevent path traversal
  if (name.endsWith('.lock')) return false; // Reserved
  return PATTERNS.branchName.test(name);
}

/**
 * Validate a story ID (US-XXXX format).
 * @param {string} id - Story ID to validate
 * @returns {boolean} True if valid
 */
function isValidStoryId(id) {
  if (!id || typeof id !== 'string') return false;
  return PATTERNS.storyId.test(id);
}

/**
 * Validate an epic ID (EP-XXXX format).
 * @param {string} id - Epic ID to validate
 * @returns {boolean} True if valid
 */
function isValidEpicId(id) {
  if (!id || typeof id !== 'string') return false;
  return PATTERNS.epicId.test(id);
}

/**
 * Validate a feature name.
 * @param {string} name - Feature name to validate
 * @returns {boolean} True if valid
 */
function isValidFeatureName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 50) return false;
  return PATTERNS.featureName.test(name);
}

/**
 * Validate a profile name.
 * @param {string} name - Profile name to validate
 * @returns {boolean} True if valid
 */
function isValidProfileName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 50) return false;
  return PATTERNS.profileName.test(name);
}

/**
 * Validate a command name.
 * @param {string} name - Command name to validate
 * @returns {boolean} True if valid
 */
function isValidCommandName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 100) return false;
  return PATTERNS.commandName.test(name);
}

/**
 * Validate a session nickname.
 * @param {string} name - Nickname to validate
 * @returns {boolean} True if valid
 */
function isValidSessionNickname(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 50) return false;
  return PATTERNS.sessionNickname.test(name);
}

/**
 * Validate a merge strategy (squash or merge).
 * @param {string} strategy - Strategy to validate
 * @returns {boolean} True if valid
 */
function isValidMergeStrategy(strategy) {
  if (!strategy || typeof strategy !== 'string') return false;
  return PATTERNS.mergeStrategy.test(strategy);
}

/**
 * Validate that a value is a positive integer within bounds.
 * @param {any} val - Value to validate
 * @param {number} min - Minimum allowed value (inclusive)
 * @param {number} max - Maximum allowed value (inclusive)
 * @returns {boolean} True if valid positive integer in range
 */
function isPositiveInteger(val, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  if (!Number.isInteger(num)) return false;
  return num >= min && num <= max;
}

/**
 * Parse and validate an integer with bounds.
 * @param {any} val - Value to parse
 * @param {number} defaultVal - Default if invalid
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Parsed integer or default
 */
function parseIntBounded(val, defaultVal, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  if (!Number.isInteger(num) || num < min || num > max) {
    return defaultVal;
  }
  return num;
}

/**
 * Validate an option key against an allowed whitelist.
 * @param {string} key - Option key to validate
 * @param {string[]} allowedKeys - Array of allowed keys
 * @returns {boolean} True if key is in whitelist
 */
function isValidOption(key, allowedKeys) {
  if (!key || typeof key !== 'string') return false;
  if (!Array.isArray(allowedKeys)) return false;
  return allowedKeys.includes(key);
}

/**
 * Validate and sanitize CLI arguments for known option types.
 * Returns validated args object or null if critical validation fails.
 *
 * @param {string[]} args - Raw process.argv slice
 * @param {Object} schema - Schema defining expected options
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 *
 * @example
 * const schema = {
 *   branch: { type: 'branchName', required: true },
 *   max: { type: 'positiveInt', min: 1, max: 100, default: 20 },
 *   profile: { type: 'profileName', default: 'default' }
 * };
 * const result = validateArgs(args, schema);
 */
function validateArgs(args, schema) {
  const result = {};
  const errors = [];

  // Parse args into key-value pairs
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.length > 0 ? valueParts.join('=') : args[++i];
      parsed[key] = value;
    }
  }

  // Validate each schema field
  for (const [field, config] of Object.entries(schema)) {
    const value = parsed[field];

    // Check required
    if (config.required && (value === undefined || value === null)) {
      errors.push(`Missing required option: --${field}`);
      continue;
    }

    // Use default if not provided
    if (value === undefined || value === null) {
      if (config.default !== undefined) {
        result[field] = config.default;
      }
      continue;
    }

    // Validate by type
    switch (config.type) {
      case 'branchName':
        if (!isValidBranchName(value)) {
          errors.push(`Invalid branch name: ${value}`);
        } else {
          result[field] = value;
        }
        break;

      case 'storyId':
        if (!isValidStoryId(value)) {
          errors.push(`Invalid story ID: ${value} (expected US-XXXX)`);
        } else {
          result[field] = value;
        }
        break;

      case 'epicId':
        if (!isValidEpicId(value)) {
          errors.push(`Invalid epic ID: ${value} (expected EP-XXXX)`);
        } else {
          result[field] = value;
        }
        break;

      case 'featureName':
        if (!isValidFeatureName(value)) {
          errors.push(`Invalid feature name: ${value}`);
        } else {
          result[field] = value;
        }
        break;

      case 'profileName':
        if (!isValidProfileName(value)) {
          errors.push(`Invalid profile name: ${value}`);
        } else {
          result[field] = value;
        }
        break;

      case 'commandName':
        if (!isValidCommandName(value)) {
          errors.push(`Invalid command name: ${value}`);
        } else {
          result[field] = value;
        }
        break;

      case 'sessionNickname':
        if (!isValidSessionNickname(value)) {
          errors.push(`Invalid session nickname: ${value}`);
        } else {
          result[field] = value;
        }
        break;

      case 'positiveInt': {
        const min = config.min || 1;
        const max = config.max || Number.MAX_SAFE_INTEGER;
        if (!isPositiveInteger(value, min, max)) {
          errors.push(`Invalid integer for ${field}: ${value} (expected ${min}-${max})`);
          result[field] = config.default;
        } else {
          result[field] = parseInt(value, 10);
        }
        break;
      }

      case 'enum':
        if (!config.values.includes(value)) {
          errors.push(
            `Invalid value for ${field}: ${value} (expected: ${config.values.join(', ')})`
          );
        } else {
          result[field] = value;
        }
        break;

      case 'boolean':
        result[field] = value === 'true' || value === '1' || value === true;
        break;

      case 'string':
        // Basic string - just store it (caller should validate further if needed)
        result[field] = String(value);
        break;

      default:
        result[field] = value;
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join('; ') };
  }

  return { ok: true, data: result };
}

// =============================================================================
// Path Traversal Protection
// =============================================================================

/**
 * Path validation error with context.
 */
class PathValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} inputPath - The problematic path
   * @param {string} reason - Reason for rejection
   */
  constructor(message, inputPath, reason) {
    super(message);
    this.name = 'PathValidationError';
    this.inputPath = inputPath;
    this.reason = reason;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validate that a path is safe and within the allowed base directory.
 * Prevents path traversal attacks by:
 * 1. Resolving the path to absolute form
 * 2. Ensuring it stays within the base directory
 * 3. Rejecting symbolic links (optional)
 *
 * @param {string} inputPath - The path to validate (can be relative or absolute)
 * @param {string} baseDir - The allowed base directory (must be absolute)
 * @param {Object} options - Validation options
 * @param {boolean} [options.allowSymlinks=false] - Allow symbolic links
 * @param {boolean} [options.mustExist=false] - Path must exist on filesystem
 * @returns {{ ok: boolean, resolvedPath?: string, error?: PathValidationError }}
 *
 * @example
 * // Validate a file path within project directory
 * const result = validatePath('./config.yaml', '/home/user/project');
 * if (result.ok) {
 *   console.log('Safe path:', result.resolvedPath);
 * }
 *
 * @example
 * // Reject path traversal attempt
 * const result = validatePath('../../../etc/passwd', '/home/user/project');
 * // result.ok === false
 * // result.error.reason === 'path_traversal'
 */
function validatePath(inputPath, baseDir, options = {}) {
  const { allowSymlinks = false, mustExist = false } = options;

  // Input validation
  if (!inputPath || typeof inputPath !== 'string') {
    return {
      ok: false,
      error: new PathValidationError(
        'Path is required and must be a string',
        String(inputPath),
        'invalid_input'
      ),
    };
  }

  if (!baseDir || typeof baseDir !== 'string') {
    return {
      ok: false,
      error: new PathValidationError(
        'Base directory is required and must be a string',
        inputPath,
        'invalid_base'
      ),
    };
  }

  // Base directory must be absolute
  if (!path.isAbsolute(baseDir)) {
    return {
      ok: false,
      error: new PathValidationError(
        'Base directory must be an absolute path',
        inputPath,
        'relative_base'
      ),
    };
  }

  // Normalize the base directory
  const normalizedBase = path.resolve(baseDir);

  // Resolve the input path relative to base directory
  let resolvedPath;
  if (path.isAbsolute(inputPath)) {
    resolvedPath = path.resolve(inputPath);
  } else {
    resolvedPath = path.resolve(normalizedBase, inputPath);
  }

  // Check for path traversal: resolved path must start with base directory
  // Add trailing separator to prevent prefix attacks (e.g., /home/user vs /home/user2)
  const baseWithSep = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;

  const isWithinBase = resolvedPath === normalizedBase || resolvedPath.startsWith(baseWithSep);

  if (!isWithinBase) {
    return {
      ok: false,
      error: new PathValidationError(
        `Path escapes base directory: ${inputPath}`,
        inputPath,
        'path_traversal'
      ),
    };
  }

  // Check if path exists (if required)
  if (mustExist) {
    try {
      fs.accessSync(resolvedPath);
    } catch {
      return {
        ok: false,
        error: new PathValidationError(
          `Path does not exist: ${resolvedPath}`,
          inputPath,
          'not_found'
        ),
      };
    }
  }

  // Check for symbolic links (if not allowed)
  if (!allowSymlinks) {
    try {
      const stats = fs.lstatSync(resolvedPath);
      if (stats.isSymbolicLink()) {
        return {
          ok: false,
          error: new PathValidationError(
            `Symbolic links are not allowed: ${inputPath}`,
            inputPath,
            'symlink_rejected'
          ),
        };
      }
    } catch {
      // Path doesn't exist yet, which is fine if mustExist is false
      // Check parent directories for symlinks
      const parts = path.relative(normalizedBase, resolvedPath).split(path.sep);
      let currentPath = normalizedBase;

      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        try {
          const stats = fs.lstatSync(currentPath);
          if (stats.isSymbolicLink()) {
            return {
              ok: false,
              error: new PathValidationError(
                `Path contains symbolic link: ${currentPath}`,
                inputPath,
                'symlink_in_path'
              ),
            };
          }
        } catch {
          // Part of path doesn't exist, stop checking
          break;
        }
      }
    }
  }

  return {
    ok: true,
    resolvedPath,
  };
}

/**
 * Synchronous version that throws on invalid paths.
 * Use when you want exceptions rather than result objects.
 *
 * @param {string} inputPath - The path to validate
 * @param {string} baseDir - The allowed base directory
 * @param {Object} options - Validation options
 * @returns {string} The validated absolute path
 * @throws {PathValidationError} If path is invalid
 */
function validatePathSync(inputPath, baseDir, options = {}) {
  const result = validatePath(inputPath, baseDir, options);
  if (!result.ok) {
    throw result.error;
  }
  return result.resolvedPath;
}

/**
 * Check if a path contains dangerous patterns without resolving.
 * Useful for quick pre-validation before expensive operations.
 *
 * @param {string} inputPath - The path to check
 * @returns {{ safe: boolean, reason?: string }}
 */
function hasUnsafePathPatterns(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return { safe: false, reason: 'invalid_input' };
  }

  // Check for null bytes (can bypass security in some systems)
  if (inputPath.includes('\0')) {
    return { safe: false, reason: 'null_byte' };
  }

  // Check for obvious traversal patterns
  if (inputPath.includes('..')) {
    return { safe: false, reason: 'dot_dot_sequence' };
  }

  // Check for absolute paths on Unix when expecting relative
  if (inputPath.startsWith('/') && !path.isAbsolute(inputPath)) {
    return { safe: false, reason: 'unexpected_absolute' };
  }

  // Check for Windows-style absolute paths
  if (/^[a-zA-Z]:/.test(inputPath)) {
    return { safe: false, reason: 'windows_absolute' };
  }

  return { safe: true };
}

/**
 * Sanitize a filename by removing dangerous characters.
 * Does NOT validate the full path - use with validatePath().
 *
 * @param {string} filename - The filename to sanitize
 * @param {Object} options - Sanitization options
 * @param {string} [options.replacement='_'] - Character to replace with
 * @param {number} [options.maxLength=255] - Maximum filename length
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename, options = {}) {
  const { replacement = '_', maxLength = 255 } = options;

  if (!filename || typeof filename !== 'string') {
    return '';
  }

  // Remove or replace dangerous characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, replacement) // Control chars and reserved
    .replace(/\.{2,}/g, replacement) // Multiple dots
    .replace(/^\.+/, replacement) // Leading dots
    .replace(/^-+/, replacement); // Leading dashes (prevent flag injection)

  // Truncate if too long
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);
    sanitized = base.slice(0, maxLength - ext.length) + ext;
  }

  return sanitized;
}

module.exports = {
  // Patterns and basic validators
  PATTERNS,
  isValidBranchName,
  isValidStoryId,
  isValidEpicId,
  isValidFeatureName,
  isValidProfileName,
  isValidCommandName,
  isValidSessionNickname,
  isValidMergeStrategy,
  isPositiveInteger,
  parseIntBounded,
  isValidOption,
  validateArgs,

  // Path traversal protection
  PathValidationError,
  validatePath,
  validatePathSync,
  hasUnsafePathPatterns,
  sanitizeFilename,
};
