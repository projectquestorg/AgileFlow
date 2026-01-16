/**
 * AgileFlow CLI - Argument Validation Utilities
 *
 * Validation utilities for command-line arguments and options.
 */

const {
  isValidBranchName,
  isValidStoryId,
  isValidEpicId,
  isValidFeatureName,
  isValidProfileName,
  isValidCommandName,
  isValidSessionNickname,
} = require('./validate-names');

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
  isPositiveInteger,
  parseIntBounded,
  isValidOption,
  validateArgs,
};
