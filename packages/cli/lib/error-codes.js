/**
 * error-codes.js - Centralized error codes for auto-recovery
 *
 * Provides standardized error codes with metadata for:
 * - Automated diagnosis
 * - Suggested fixes
 * - Recovery actions
 *
 * Usage:
 *   const { ErrorCodes, getErrorCode, attachErrorCode, isRecoverable } = require('./error-codes');
 *
 *   // Get error details
 *   const code = getErrorCode('ENOENT');
 *   console.log(code.suggestedFix);
 *
 *   // Create typed error
 *   const error = attachErrorCode(new Error('File not found'), 'ENOENT');
 *   if (isRecoverable(error)) {
 *     console.log('Can recover:', error.suggestedFix);
 *   }
 */

/**
 * Severity levels for errors
 * @enum {string}
 */
const Severity = {
  CRITICAL: 'critical', // Blocks operation, requires immediate attention
  HIGH: 'high', // Serious issue, likely prevents feature from working
  MEDIUM: 'medium', // Degraded functionality, can continue
  LOW: 'low', // Minor issue, informational
};

/**
 * Error categories for grouping
 * @enum {string}
 */
const Category = {
  FILESYSTEM: 'filesystem', // File/directory operations
  PERMISSION: 'permission', // Access control issues
  CONFIGURATION: 'configuration', // Config file problems
  NETWORK: 'network', // Network/connectivity issues
  VALIDATION: 'validation', // Input validation failures
  STATE: 'state', // Application state issues
  DEPENDENCY: 'dependency', // Missing/incompatible dependencies
};

/**
 * Standard error codes with metadata
 * @type {Object.<string, {
 *   code: string,
 *   message: string,
 *   severity: string,
 *   category: string,
 *   recoverable: boolean,
 *   suggestedFix: string,
 *   autoFix?: string
 * }>}
 */
const ErrorCodes = {
  // Filesystem errors
  ENOENT: {
    code: 'ENOENT',
    message: 'File or directory not found',
    severity: Severity.HIGH,
    category: Category.FILESYSTEM,
    recoverable: true,
    suggestedFix:
      'Check if the file path is correct or run "npx agileflow setup" to create missing files',
    autoFix: 'create-missing-file',
  },

  ENODIR: {
    code: 'ENODIR',
    message: 'Directory does not exist',
    severity: Severity.HIGH,
    category: Category.FILESYSTEM,
    recoverable: true,
    suggestedFix: 'Create the missing directory or run "npx agileflow setup" to initialize',
    autoFix: 'create-directory',
  },

  EEXIST: {
    code: 'EEXIST',
    message: 'File or directory already exists',
    severity: Severity.MEDIUM,
    category: Category.FILESYSTEM,
    recoverable: true,
    suggestedFix: 'Use --force flag to overwrite or choose a different path',
    autoFix: null,
  },

  EISDIR: {
    code: 'EISDIR',
    message: 'Expected file but found directory',
    severity: Severity.HIGH,
    category: Category.FILESYSTEM,
    recoverable: false,
    suggestedFix: 'Remove the directory or use the correct file path',
    autoFix: null,
  },

  ENOTDIR: {
    code: 'ENOTDIR',
    message: 'Expected directory but found file',
    severity: Severity.HIGH,
    category: Category.FILESYSTEM,
    recoverable: false,
    suggestedFix: 'Remove the file or use the correct directory path',
    autoFix: null,
  },

  EEMPTYDIR: {
    code: 'EEMPTYDIR',
    message: 'Directory is empty',
    severity: Severity.MEDIUM,
    category: Category.FILESYSTEM,
    recoverable: true,
    suggestedFix: 'Populate the directory or run "npx agileflow setup" to initialize content',
    autoFix: 'populate-directory',
  },

  // Permission errors
  EACCES: {
    code: 'EACCES',
    message: 'Permission denied',
    severity: Severity.CRITICAL,
    category: Category.PERMISSION,
    recoverable: false,
    suggestedFix:
      'Check file/directory permissions. Try "chmod +rw <path>" or run with appropriate permissions',
    autoFix: null,
  },

  EPERM: {
    code: 'EPERM',
    message: 'Operation not permitted',
    severity: Severity.CRITICAL,
    category: Category.PERMISSION,
    recoverable: false,
    suggestedFix: 'This operation requires elevated privileges or different permissions',
    autoFix: null,
  },

  EROFS: {
    code: 'EROFS',
    message: 'Read-only file system',
    severity: Severity.CRITICAL,
    category: Category.PERMISSION,
    recoverable: false,
    suggestedFix: 'Cannot write to read-only filesystem. Check mount options or disk status',
    autoFix: null,
  },

  // Configuration errors
  ECONFIG: {
    code: 'ECONFIG',
    message: 'Configuration file is invalid or missing',
    severity: Severity.HIGH,
    category: Category.CONFIGURATION,
    recoverable: true,
    suggestedFix:
      'Check configuration syntax or run "npx agileflow doctor --fix" to recreate defaults',
    autoFix: 'recreate-config',
  },

  EPARSE: {
    code: 'EPARSE',
    message: 'Failed to parse configuration file',
    severity: Severity.HIGH,
    category: Category.CONFIGURATION,
    recoverable: true,
    suggestedFix:
      'Check JSON/YAML syntax. Common issues: trailing commas, unquoted strings, invalid encoding',
    autoFix: null,
  },

  ESCHEMA: {
    code: 'ESCHEMA',
    message: 'Configuration schema validation failed',
    severity: Severity.MEDIUM,
    category: Category.CONFIGURATION,
    recoverable: true,
    suggestedFix:
      'Review configuration against expected schema. Run "npx agileflow doctor" for details',
    autoFix: 'validate-config',
  },

  EVERSION: {
    code: 'EVERSION',
    message: 'Version mismatch or incompatible version',
    severity: Severity.MEDIUM,
    category: Category.CONFIGURATION,
    recoverable: true,
    suggestedFix: 'Run "npx agileflow update" to upgrade to compatible version',
    autoFix: 'update-version',
  },

  // Network errors
  ENETWORK: {
    code: 'ENETWORK',
    message: 'Network error or connection failed',
    severity: Severity.HIGH,
    category: Category.NETWORK,
    recoverable: true,
    suggestedFix: 'Check internet connection, firewall settings, or try again later',
    autoFix: 'retry-network',
  },

  ETIMEOUT: {
    code: 'ETIMEOUT',
    message: 'Operation timed out',
    severity: Severity.HIGH,
    category: Category.NETWORK,
    recoverable: true,
    suggestedFix: 'Check network speed and stability. Try increasing timeout or retrying',
    autoFix: 'retry-timeout',
  },

  ENOTFOUND: {
    code: 'ENOTFOUND',
    message: 'Host or resource not found',
    severity: Severity.HIGH,
    category: Category.NETWORK,
    recoverable: true,
    suggestedFix: 'Check URL/hostname spelling and DNS settings',
    autoFix: null,
  },

  // Validation errors
  EINVAL: {
    code: 'EINVAL',
    message: 'Invalid argument or parameter',
    severity: Severity.MEDIUM,
    category: Category.VALIDATION,
    recoverable: true,
    suggestedFix: 'Check input format and required parameters. Use --help for usage information',
    autoFix: null,
  },

  EMISSING: {
    code: 'EMISSING',
    message: 'Required value is missing',
    severity: Severity.HIGH,
    category: Category.VALIDATION,
    recoverable: true,
    suggestedFix: 'Provide the required value. Check command usage with --help',
    autoFix: null,
  },

  ERANGE: {
    code: 'ERANGE',
    message: 'Value is out of valid range',
    severity: Severity.MEDIUM,
    category: Category.VALIDATION,
    recoverable: true,
    suggestedFix: 'Provide a value within the valid range',
    autoFix: null,
  },

  // State errors
  ESTATE: {
    code: 'ESTATE',
    message: 'Invalid application state',
    severity: Severity.HIGH,
    category: Category.STATE,
    recoverable: true,
    suggestedFix: 'Run "npx agileflow doctor --fix" to repair state or clear cache',
    autoFix: 'repair-state',
  },

  ECONFLICT: {
    code: 'ECONFLICT',
    message: 'Operation conflicts with current state',
    severity: Severity.MEDIUM,
    category: Category.STATE,
    recoverable: true,
    suggestedFix: 'Resolve the conflict or use --force flag if appropriate',
    autoFix: null,
  },

  ELOCK: {
    code: 'ELOCK',
    message: 'Resource is locked by another process',
    severity: Severity.MEDIUM,
    category: Category.STATE,
    recoverable: true,
    suggestedFix: 'Wait for the other process to complete or remove stale lock file',
    autoFix: 'remove-lock',
  },

  // Migration errors
  EMIGRATION: {
    code: 'EMIGRATION',
    message: 'Migration required or migration failed',
    severity: Severity.HIGH,
    category: Category.STATE,
    recoverable: true,
    suggestedFix:
      'Run "npx agileflow update" to perform migration or "npx agileflow doctor --fix" to repair',
    autoFix: 'run-migration',
  },

  // Dependency errors
  EDEP: {
    code: 'EDEP',
    message: 'Missing or incompatible dependency',
    severity: Severity.CRITICAL,
    category: Category.DEPENDENCY,
    recoverable: true,
    suggestedFix: 'Install required dependencies: npm install',
    autoFix: 'install-deps',
  },

  ENODE: {
    code: 'ENODE',
    message: 'Node.js version requirement not met',
    severity: Severity.CRITICAL,
    category: Category.DEPENDENCY,
    recoverable: false,
    suggestedFix: 'Upgrade Node.js to version 18.0.0 or higher',
    autoFix: null,
  },

  // Generic errors
  EUNKNOWN: {
    code: 'EUNKNOWN',
    message: 'An unknown error occurred',
    severity: Severity.HIGH,
    category: Category.STATE,
    recoverable: false,
    suggestedFix: 'Check logs for more details or report the issue',
    autoFix: null,
  },
};

/**
 * Get error code details by code string
 * @param {string} code - Error code (e.g., 'ENOENT')
 * @returns {object|null} Error code details or null if not found
 */
function getErrorCode(code) {
  return ErrorCodes[code] || null;
}

/**
 * Get error code from system error
 * @param {Error} error - Error object
 * @returns {object} Error code details (defaults to EUNKNOWN)
 */
function getErrorCodeFromError(error) {
  if (!error) return ErrorCodes.EUNKNOWN;

  // Check if already typed
  if (error.errorCode && ErrorCodes[error.errorCode]) {
    return ErrorCodes[error.errorCode];
  }

  // Map system error codes
  const systemCode = error.code || error.errno;
  if (systemCode && ErrorCodes[systemCode]) {
    return ErrorCodes[systemCode];
  }

  // Try to detect from message
  const message = (error.message || '').toLowerCase();

  if (message.includes('permission denied')) return ErrorCodes.EACCES;
  if (message.includes('no such file') || message.includes('not found')) return ErrorCodes.ENOENT;
  if (message.includes('directory') && message.includes('not exist')) return ErrorCodes.ENODIR;
  if (message.includes('already exists')) return ErrorCodes.EEXIST;
  if (message.includes('timed out') || message.includes('timeout')) return ErrorCodes.ETIMEOUT;
  if (message.includes('network') || message.includes('connection')) return ErrorCodes.ENETWORK;
  if (message.includes('parse') || message.includes('json') || message.includes('yaml')) {
    return ErrorCodes.EPARSE;
  }
  if (message.includes('invalid') || message.includes('argument')) return ErrorCodes.EINVAL;

  return ErrorCodes.EUNKNOWN;
}

/**
 * Attach error code metadata to an error
 * @param {Error} error - Error object to enhance
 * @param {string} code - Error code to attach
 * @returns {Error} Enhanced error with code metadata
 */
function attachErrorCode(error, code) {
  const codeData = ErrorCodes[code] || ErrorCodes.EUNKNOWN;

  error.errorCode = codeData.code;
  error.severity = codeData.severity;
  error.category = codeData.category;
  error.recoverable = codeData.recoverable;
  error.suggestedFix = codeData.suggestedFix;
  error.autoFix = codeData.autoFix || null;

  return error;
}

/**
 * Create a typed error with error code
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {object} [options] - Additional options
 * @param {Error} [options.cause] - Original error
 * @param {object} [options.context] - Additional context
 * @returns {Error} Typed error with code metadata
 */
function createTypedError(message, code, options = {}) {
  const error = new Error(message);
  const codeData = ErrorCodes[code] || ErrorCodes.EUNKNOWN;

  error.errorCode = codeData.code;
  error.severity = codeData.severity;
  error.category = codeData.category;
  error.recoverable = codeData.recoverable;
  error.suggestedFix = codeData.suggestedFix;
  error.autoFix = codeData.autoFix || null;

  if (options.cause) {
    error.cause = options.cause;
  }

  if (options.context) {
    error.context = options.context;
  }

  return error;
}

/**
 * Check if an error is recoverable
 * @param {Error} error - Error to check
 * @returns {boolean} True if recoverable
 */
function isRecoverable(error) {
  if (!error) return false;

  // Check if already typed
  if (typeof error.recoverable === 'boolean') {
    return error.recoverable;
  }

  // Get code and check
  const codeData = getErrorCodeFromError(error);
  return codeData.recoverable;
}

/**
 * Get suggested fix for an error
 * @param {Error} error - Error to get fix for
 * @returns {string} Suggested fix message
 */
function getSuggestedFix(error) {
  if (!error) return 'Unknown error occurred';

  // Check if already typed
  if (error.suggestedFix) {
    return error.suggestedFix;
  }

  // Get code and return fix
  const codeData = getErrorCodeFromError(error);
  return codeData.suggestedFix;
}

/**
 * Get auto-fix action for an error
 * @param {Error} error - Error to get auto-fix for
 * @returns {string|null} Auto-fix action name or null
 */
function getAutoFix(error) {
  if (!error) return null;

  // Check if already typed
  if (error.autoFix !== undefined) {
    return error.autoFix;
  }

  // Get code and return auto-fix
  const codeData = getErrorCodeFromError(error);
  return codeData.autoFix || null;
}

/**
 * Format error for display with code information
 * @param {Error} error - Error to format
 * @param {object} [options] - Format options
 * @param {boolean} [options.includeStack=false] - Include stack trace
 * @param {boolean} [options.includeSuggestion=true] - Include suggested fix
 * @returns {string} Formatted error string
 */
function formatError(error, options = {}) {
  const { includeStack = false, includeSuggestion = true } = options;

  if (!error) return 'Unknown error';

  const codeData = getErrorCodeFromError(error);
  const lines = [];

  // Main error line
  lines.push(`[${codeData.code}] ${error.message || codeData.message}`);

  // Severity and category
  lines.push(`  Severity: ${codeData.severity} | Category: ${codeData.category}`);

  // Suggested fix
  if (includeSuggestion && codeData.suggestedFix) {
    lines.push(`  Fix: ${codeData.suggestedFix}`);
  }

  // Auto-fix availability
  if (codeData.autoFix) {
    lines.push(`  Auto-fix available: npx agileflow doctor --fix`);
  }

  // Stack trace
  if (includeStack && error.stack) {
    lines.push('');
    lines.push(error.stack);
  }

  return lines.join('\n');
}

module.exports = {
  // Enums
  Severity,
  Category,

  // Error codes
  ErrorCodes,

  // Functions
  getErrorCode,
  getErrorCodeFromError,
  attachErrorCode,
  createTypedError,
  isRecoverable,
  getSuggestedFix,
  getAutoFix,
  formatError,
};
