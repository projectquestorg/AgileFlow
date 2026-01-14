/**
 * ide-errors.js - Typed Exception Classes for IDE Installers
 *
 * Provides specific error types for common IDE setup failures.
 * These errors carry context about what failed and why,
 * enabling better error handling and user feedback.
 *
 * Integration with error-codes.js:
 * - All IDE errors now have errorCode, severity, category metadata
 * - Use formatError() from error-codes.js for consistent display
 * - isRecoverable() works with these errors
 */

const { ErrorCodes, Severity, Category } = require('../../../lib/error-codes');

/**
 * Base error class for IDE-related errors.
 * All IDE errors extend this class.
 */
class IdeError extends Error {
  /**
   * @param {string} message - Error description
   * @param {string} ideName - Name of the IDE (e.g., 'Claude Code', 'Cursor')
   * @param {Object} [context={}] - Additional context about the error
   * @param {string} [errorCode='EUNKNOWN'] - Error code from error-codes.js
   */
  constructor(message, ideName, context = {}, errorCode = 'EUNKNOWN') {
    super(message);
    this.name = this.constructor.name;
    this.ideName = ideName;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);

    // Attach error code metadata from unified error codes
    const codeData = ErrorCodes[errorCode] || ErrorCodes.EUNKNOWN;
    this.errorCode = codeData.code;
    this.severity = codeData.severity;
    this.category = codeData.category;
    this.recoverable = codeData.recoverable;
    this.autoFix = codeData.autoFix || null;
  }

  /**
   * Get a user-friendly description of the error
   * @returns {string}
   */
  getUserMessage() {
    return `${this.ideName}: ${this.message}`;
  }

  /**
   * Get suggested action to fix the error
   * Override in subclasses for specific suggestions
   * @returns {string}
   */
  getSuggestedAction() {
    const codeData = ErrorCodes[this.errorCode] || ErrorCodes.EUNKNOWN;
    return codeData.suggestedFix;
  }
}

/**
 * Thrown when IDE configuration directory is not found.
 * Example: .claude directory doesn't exist, .cursor not found
 */
class IdeConfigNotFoundError extends IdeError {
  /**
   * @param {string} ideName - Name of the IDE
   * @param {string} configPath - Expected config directory path
   * @param {Object} [context={}] - Additional context
   */
  constructor(ideName, configPath, context = {}) {
    super(
      `Configuration directory not found: ${configPath}`,
      ideName,
      { configPath, ...context },
      'ENODIR' // Use unified error code
    );
    this.configPath = configPath;
  }

  /**
   * Get suggested action to fix the error
   * @returns {string}
   */
  getSuggestedAction() {
    return `Create the ${this.configPath} directory or run the IDE at least once to initialize it.`;
  }
}

/**
 * Thrown when command installation fails.
 * Example: Failed to copy command files, directory creation failed
 */
class CommandInstallationError extends IdeError {
  /**
   * @param {string} ideName - Name of the IDE
   * @param {string} commandName - Name of the command being installed
   * @param {string} reason - Why the installation failed
   * @param {Object} [context={}] - Additional context
   */
  constructor(ideName, commandName, reason, context = {}) {
    // Detect appropriate error code from reason
    let errorCode = 'ESTATE';
    if (reason.toLowerCase().includes('permission')) {
      errorCode = 'EACCES';
    } else if (
      reason.toLowerCase().includes('not found') ||
      reason.toLowerCase().includes('no such')
    ) {
      errorCode = 'ENOENT';
    }

    super(
      `Failed to install command '${commandName}': ${reason}`,
      ideName,
      { commandName, reason, ...context },
      errorCode
    );
    this.commandName = commandName;
    this.reason = reason;
  }

  /**
   * Get suggested action to fix the error
   * @returns {string}
   */
  getSuggestedAction() {
    if (this.reason.includes('permission')) {
      return `Check file permissions for the installation directory.`;
    }
    if (this.reason.includes('disk')) {
      return `Free up disk space and try again.`;
    }
    return `Try running the installation again or check the source files.`;
  }
}

/**
 * Thrown when a file operation fails due to permission issues.
 * Example: Cannot write to config directory, read access denied
 */
class FilePermissionError extends IdeError {
  /**
   * @param {string} ideName - Name of the IDE
   * @param {string} filePath - Path to the file/directory
   * @param {string} operation - Operation that failed ('read', 'write', 'delete')
   * @param {Object} [context={}] - Additional context
   */
  constructor(ideName, filePath, operation, context = {}) {
    super(
      `Permission denied: cannot ${operation} '${filePath}'`,
      ideName,
      { filePath, operation, ...context },
      'EACCES' // Use unified error code
    );
    this.filePath = filePath;
    this.operation = operation;
  }

  /**
   * Get suggested action to fix the error
   * @returns {string}
   */
  getSuggestedAction() {
    return `Check permissions on '${this.filePath}' or run with appropriate privileges.`;
  }
}

/**
 * Thrown when content injection fails.
 * Example: Template placeholder not found, dynamic content generation failed
 */
class ContentInjectionError extends IdeError {
  /**
   * @param {string} ideName - Name of the IDE
   * @param {string} templateFile - Path to the template file
   * @param {string} reason - Why injection failed
   * @param {Object} [context={}] - Additional context
   */
  constructor(ideName, templateFile, reason, context = {}) {
    super(
      `Content injection failed for '${templateFile}': ${reason}`,
      ideName,
      { templateFile, reason, ...context },
      'ECONFIG' // Use unified error code - configuration/template issue
    );
    this.templateFile = templateFile;
    this.reason = reason;
  }

  /**
   * Get suggested action to fix the error
   * @returns {string}
   */
  getSuggestedAction() {
    return `Check the template file '${this.templateFile}' for valid placeholders. Run "npx agileflow doctor --fix" to repair.`;
  }
}

/**
 * Thrown when cleanup operation fails.
 * Example: Cannot remove old installation, locked files
 */
class CleanupError extends IdeError {
  /**
   * @param {string} ideName - Name of the IDE
   * @param {string} targetPath - Path being cleaned up
   * @param {string} reason - Why cleanup failed
   * @param {Object} [context={}] - Additional context
   */
  constructor(ideName, targetPath, reason, context = {}) {
    // Detect appropriate error code from reason
    let errorCode = 'ESTATE';
    if (reason.toLowerCase().includes('lock') || reason.toLowerCase().includes('busy')) {
      errorCode = 'ELOCK';
    } else if (reason.toLowerCase().includes('permission')) {
      errorCode = 'EACCES';
    }

    super(
      `Cleanup failed for '${targetPath}': ${reason}`,
      ideName,
      { targetPath, reason, ...context },
      errorCode
    );
    this.targetPath = targetPath;
    this.reason = reason;
  }

  /**
   * Get suggested action to fix the error
   * @returns {string}
   */
  getSuggestedAction() {
    if (this.errorCode === 'ELOCK') {
      return `Close any applications using files in '${this.targetPath}' and try again.`;
    }
    return `Check permissions on '${this.targetPath}' or remove it manually.`;
  }
}

/**
 * Thrown when IDE detection fails or returns unexpected results.
 * Example: Multiple conflicting IDE configs found
 */
class IdeDetectionError extends IdeError {
  /**
   * @param {string} ideName - Name of the IDE
   * @param {string} reason - Why detection failed
   * @param {Object} [context={}] - Additional context
   */
  constructor(ideName, reason, context = {}) {
    // Detect appropriate error code
    let errorCode = 'ECONFLICT';
    if (
      reason.toLowerCase().includes('not found') ||
      reason.toLowerCase().includes('not installed')
    ) {
      errorCode = 'ENOENT';
    }

    super(`IDE detection failed: ${reason}`, ideName, { reason, ...context }, errorCode);
    this.reason = reason;
  }

  /**
   * Get suggested action to fix the error
   * @returns {string}
   */
  getSuggestedAction() {
    if (this.errorCode === 'ENOENT') {
      return `Install ${this.ideName} and run it at least once to initialize configuration.`;
    }
    return `Check IDE configuration and resolve any conflicts. Run "npx agileflow doctor" for details.`;
  }
}

/**
 * Wrap a function call and convert EACCES/EPERM errors to FilePermissionError
 * @param {string} ideName - Name of the IDE
 * @param {string} filePath - Path being accessed
 * @param {string} operation - Operation type ('read', 'write', 'delete')
 * @param {Function} fn - Async function to wrap
 * @returns {Promise<any>} Result of the function
 * @throws {FilePermissionError} If permission error occurs
 */
async function withPermissionHandling(ideName, filePath, operation, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new FilePermissionError(ideName, filePath, operation, {
        originalError: error.message,
      });
    }
    throw error;
  }
}

/**
 * Check if an error is an IDE-related error
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
function isIdeError(error) {
  return error instanceof IdeError;
}

/**
 * Format an IDE error for display using unified error code format
 * @param {IdeError} error - IDE error to format
 * @param {Object} [options={}] - Format options
 * @param {boolean} [options.includeStack=false] - Include stack trace
 * @param {boolean} [options.includeSuggestion=true] - Include suggested action
 * @returns {string} Formatted error string
 */
function formatIdeError(error, options = {}) {
  const { includeStack = false, includeSuggestion = true } = options;

  if (!error) return 'Unknown error';

  const lines = [];

  // Main error line with IDE name and error code
  lines.push(`[${error.errorCode}] ${error.ideName}: ${error.message}`);

  // Severity and category
  lines.push(`  Severity: ${error.severity} | Category: ${error.category}`);

  // Suggested action (IDE-specific takes precedence)
  if (includeSuggestion) {
    const suggestion = error.getSuggestedAction?.() || error.suggestedFix;
    if (suggestion) {
      lines.push(`  Fix: ${suggestion}`);
    }
  }

  // Recoverable status
  lines.push(`  Recoverable: ${error.recoverable ? 'Yes' : 'No'}`);

  // Auto-fix availability
  if (error.autoFix) {
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
  IdeError,
  IdeConfigNotFoundError,
  CommandInstallationError,
  FilePermissionError,
  ContentInjectionError,
  CleanupError,
  IdeDetectionError,
  withPermissionHandling,
  isIdeError,
  formatIdeError,
};
