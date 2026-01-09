/**
 * AgileFlow CLI - Input Validation Utilities
 *
 * Centralized validation patterns and helpers to prevent
 * command injection and invalid input handling.
 */

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

module.exports = {
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
};
