/**
 * AgileFlow CLI - Validation Middleware
 *
 * Provides middleware layer for input validation that runs
 * before command action handlers.
 *
 * Usage:
 *   const { withValidation, schemas } = require('./lib/validation-middleware');
 *   module.exports = {
 *     name: 'mycommand',
 *     validate: {
 *       directory: schemas.path,
 *       ide: schemas.ide,
 *     },
 *     action: withValidation(async (options) => { ... })
 *   };
 */

const path = require('path');
const { validatePath, isValidStoryId, isValidEpicId } = require('../../../lib/validate');
const { IdeRegistry } = require('./ide-registry');

/**
 * Validation schema definition
 * @typedef {Object} ValidationSchema
 * @property {string} type - Schema type (path, ide, storyId, epicId, string, number)
 * @property {boolean} [required=false] - Whether the field is required
 * @property {*} [default] - Default value if not provided
 * @property {Function} [validate] - Custom validation function
 * @property {string} [errorMessage] - Custom error message
 */

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} ok - Whether validation passed
 * @property {Object} [data] - Validated and transformed data
 * @property {string[]} [errors] - List of validation errors
 */

/**
 * Pre-defined validation schemas for common types
 */
const schemas = {
  /**
   * Path schema - validates directory/file paths
   * Automatically resolves to absolute path and validates against traversal
   */
  path: {
    type: 'path',
    required: false,
    default: '.',
    errorMessage: 'Invalid path',
  },

  /**
   * Required path schema
   */
  pathRequired: {
    type: 'path',
    required: true,
    errorMessage: 'Path is required',
  },

  /**
   * IDE schema - validates IDE name against registry
   */
  ide: {
    type: 'ide',
    required: false,
    errorMessage: 'Invalid IDE name',
  },

  /**
   * Required IDE schema
   */
  ideRequired: {
    type: 'ide',
    required: true,
    errorMessage: 'IDE name is required',
  },

  /**
   * Story ID schema - validates US-XXXX format
   */
  storyId: {
    type: 'storyId',
    required: false,
    errorMessage: 'Invalid story ID (expected US-XXXX)',
  },

  /**
   * Required story ID schema
   */
  storyIdRequired: {
    type: 'storyId',
    required: true,
    errorMessage: 'Story ID is required (expected US-XXXX)',
  },

  /**
   * Epic ID schema - validates EP-XXXX format
   */
  epicId: {
    type: 'epicId',
    required: false,
    errorMessage: 'Invalid epic ID (expected EP-XXXX)',
  },

  /**
   * Required epic ID schema
   */
  epicIdRequired: {
    type: 'epicId',
    required: true,
    errorMessage: 'Epic ID is required (expected EP-XXXX)',
  },

  /**
   * String schema with optional length constraints
   * @param {Object} options - Schema options
   * @returns {ValidationSchema}
   */
  string: (options = {}) => ({
    type: 'string',
    required: options.required || false,
    minLength: options.minLength,
    maxLength: options.maxLength,
    pattern: options.pattern,
    errorMessage: options.errorMessage || 'Invalid string value',
  }),

  /**
   * Number schema with optional range constraints
   * @param {Object} options - Schema options
   * @returns {ValidationSchema}
   */
  number: (options = {}) => ({
    type: 'number',
    required: options.required || false,
    min: options.min,
    max: options.max,
    integer: options.integer || false,
    errorMessage: options.errorMessage || 'Invalid number value',
  }),

  /**
   * Boolean schema
   */
  boolean: {
    type: 'boolean',
    required: false,
    errorMessage: 'Invalid boolean value',
  },

  /**
   * Enum schema
   * @param {string[]} values - Allowed values
   * @param {Object} options - Schema options
   * @returns {ValidationSchema}
   */
  enum: (values, options = {}) => ({
    type: 'enum',
    values,
    required: options.required || false,
    errorMessage: options.errorMessage || `Invalid value (expected: ${values.join(', ')})`,
  }),
};

/**
 * Validate a single field against its schema
 * @param {string} fieldName - Name of the field
 * @param {*} value - Value to validate
 * @param {ValidationSchema} schema - Schema to validate against
 * @param {string} baseDir - Base directory for path validation
 * @returns {ValidationResult}
 */
function validateField(fieldName, value, schema, baseDir) {
  const errors = [];

  // Check required
  if (schema.required && (value === undefined || value === null || value === '')) {
    return {
      ok: false,
      errors: [schema.errorMessage || `${fieldName} is required`],
    };
  }

  // Return default if not provided
  if (value === undefined || value === null || value === '') {
    return {
      ok: true,
      data: schema.default,
    };
  }

  // Validate by type
  switch (schema.type) {
    case 'path': {
      // Convert to string if not already
      const pathValue = String(value);

      // Resolve path relative to current directory
      const resolvedPath = path.resolve(pathValue);

      // Validate path is within safe bounds
      const pathResult = validatePath(pathValue, baseDir, {
        allowSymlinks: false,
        mustExist: false,
      });

      if (!pathResult.ok) {
        return {
          ok: false,
          errors: [pathResult.error?.message || schema.errorMessage || 'Invalid path'],
        };
      }

      return {
        ok: true,
        data: resolvedPath,
      };
    }

    case 'ide': {
      // Normalize IDE name to lowercase before validation
      const normalizedIde = String(value).toLowerCase();
      const validation = IdeRegistry.validate(normalizedIde);
      if (!validation.ok) {
        return {
          ok: false,
          errors: [validation.error || schema.errorMessage],
        };
      }
      return {
        ok: true,
        data: normalizedIde,
      };
    }

    case 'storyId': {
      // Normalize story ID to uppercase before validation
      const normalizedStoryId = String(value).toUpperCase();
      if (!isValidStoryId(normalizedStoryId)) {
        return {
          ok: false,
          errors: [schema.errorMessage || 'Invalid story ID (expected US-XXXX)'],
        };
      }
      return {
        ok: true,
        data: normalizedStoryId,
      };
    }

    case 'epicId': {
      // Normalize epic ID to uppercase before validation
      const normalizedEpicId = String(value).toUpperCase();
      if (!isValidEpicId(normalizedEpicId)) {
        return {
          ok: false,
          errors: [schema.errorMessage || 'Invalid epic ID (expected EP-XXXX)'],
        };
      }
      return {
        ok: true,
        data: normalizedEpicId,
      };
    }

    case 'string': {
      if (typeof value !== 'string') {
        return {
          ok: false,
          errors: [schema.errorMessage || `${fieldName} must be a string`],
        };
      }

      if (schema.minLength && value.length < schema.minLength) {
        return {
          ok: false,
          errors: [`${fieldName} must be at least ${schema.minLength} characters`],
        };
      }

      if (schema.maxLength && value.length > schema.maxLength) {
        return {
          ok: false,
          errors: [`${fieldName} must be at most ${schema.maxLength} characters`],
        };
      }

      if (schema.pattern && !schema.pattern.test(value)) {
        return {
          ok: false,
          errors: [schema.errorMessage || `${fieldName} has invalid format`],
        };
      }

      return {
        ok: true,
        data: value,
      };
    }

    case 'number': {
      const num = parseFloat(value);

      if (isNaN(num)) {
        return {
          ok: false,
          errors: [schema.errorMessage || `${fieldName} must be a number`],
        };
      }

      if (schema.integer && !Number.isInteger(num)) {
        return {
          ok: false,
          errors: [`${fieldName} must be an integer`],
        };
      }

      if (schema.min !== undefined && num < schema.min) {
        return {
          ok: false,
          errors: [`${fieldName} must be at least ${schema.min}`],
        };
      }

      if (schema.max !== undefined && num > schema.max) {
        return {
          ok: false,
          errors: [`${fieldName} must be at most ${schema.max}`],
        };
      }

      return {
        ok: true,
        data: num,
      };
    }

    case 'boolean': {
      const boolValue = value === true || value === 'true' || value === '1';
      return {
        ok: true,
        data: boolValue,
      };
    }

    case 'enum': {
      if (!schema.values.includes(value)) {
        return {
          ok: false,
          errors: [schema.errorMessage || `Invalid value for ${fieldName}`],
        };
      }
      return {
        ok: true,
        data: value,
      };
    }

    default:
      // Unknown type - pass through
      return {
        ok: true,
        data: value,
      };
  }
}

/**
 * Validate all fields in options against their schemas
 * @param {Object} options - Command options
 * @param {Object} validationSchemas - Schema definitions
 * @param {string} [baseDir=process.cwd()] - Base directory for path validation
 * @returns {ValidationResult}
 */
function validateOptions(options, validationSchemas, baseDir = process.cwd()) {
  const errors = [];
  const validatedData = { ...options };

  for (const [fieldName, schema] of Object.entries(validationSchemas)) {
    const value = options[fieldName];
    const result = validateField(fieldName, value, schema, baseDir);

    if (!result.ok) {
      errors.push(...result.errors);
    } else {
      validatedData[fieldName] = result.data;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: validatedData };
}

/**
 * Create a validation wrapper for command actions
 * @param {Function} action - Original command action
 * @param {Object} validationSchemas - Schema definitions
 * @returns {Function} Wrapped action with validation
 */
function createValidationWrapper(action, validationSchemas) {
  return async function validatedAction(...args) {
    // Get options from the last argument (Commander.js pattern)
    const options = args[args.length - 1];

    // Validate options
    const result = validateOptions(options, validationSchemas);

    if (!result.ok) {
      const { ErrorHandler } = require('./error-handler');
      const handler = new ErrorHandler('validation');

      // Format errors nicely
      const errorList = result.errors.map(e => `  • ${e}`).join('\n');
      handler.warning(
        'Input validation failed',
        `Please fix the following:\n${errorList}`,
        'Check command help with --help'
      );
      return;
    }

    // Replace options with validated data
    args[args.length - 1] = { ...options, ...result.data };

    // Call original action
    return action.apply(this, args);
  };
}

/**
 * Decorator to add validation to a command action
 * @param {Object} validationSchemas - Schema definitions
 * @returns {Function} Decorator function
 */
function withValidation(validationSchemas) {
  return function (action) {
    return createValidationWrapper(action, validationSchemas);
  };
}

/**
 * Shorthand to wrap an action directly with schemas
 * @param {Function} action - Action function
 * @param {Object} validationSchemas - Schema definitions
 * @returns {Function} Wrapped action
 */
function validated(action, validationSchemas) {
  return createValidationWrapper(action, validationSchemas);
}

/**
 * Validate path argument automatically
 * Use as middleware before any path-based command
 * @param {string} pathValue - Path value from options
 * @param {string} fieldName - Name of the path field
 * @returns {ValidationResult}
 */
function validatePathArgument(pathValue, fieldName = 'path') {
  return validateField(fieldName, pathValue, schemas.path, process.cwd());
}

/**
 * Format validation errors for display
 * @param {string[]} errors - List of errors
 * @returns {string} Formatted error message
 */
function formatValidationErrors(errors) {
  if (errors.length === 1) {
    return errors[0];
  }
  return errors.map((e, i) => `${i + 1}. ${e}`).join('\n');
}

module.exports = {
  schemas,
  validateField,
  validateOptions,
  createValidationWrapper,
  withValidation,
  validated,
  validatePathArgument,
  formatValidationErrors,
};
