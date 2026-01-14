/**
 * ide-errors.js - Typed Exception Classes for IDE Installers
 *
 * Provides specific error types for common IDE setup failures.
 * These errors carry context about what failed and why,
 * enabling better error handling and user feedback.
 */

/**
 * Base error class for IDE-related errors.
 * All IDE errors extend this class.
 */
class IdeError extends Error {
  /**
   * @param {string} message - Error description
   * @param {string} ideName - Name of the IDE (e.g., 'Claude Code', 'Cursor')
   * @param {Object} [context={}] - Additional context about the error
   */
  constructor(message, ideName, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.ideName = ideName;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get a user-friendly description of the error
   * @returns {string}
   */
  getUserMessage() {
    return `${this.ideName}: ${this.message}`;
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
    super(`Configuration directory not found: ${configPath}`, ideName, {
      configPath,
      ...context,
    });
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
    super(`Failed to install command '${commandName}': ${reason}`, ideName, {
      commandName,
      reason,
      ...context,
    });
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
    super(`Permission denied: cannot ${operation} '${filePath}'`, ideName, {
      filePath,
      operation,
      ...context,
    });
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
    super(`Content injection failed for '${templateFile}': ${reason}`, ideName, {
      templateFile,
      reason,
      ...context,
    });
    this.templateFile = templateFile;
    this.reason = reason;
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
    super(`Cleanup failed for '${targetPath}': ${reason}`, ideName, {
      targetPath,
      reason,
      ...context,
    });
    this.targetPath = targetPath;
    this.reason = reason;
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
    super(`IDE detection failed: ${reason}`, ideName, {
      reason,
      ...context,
    });
    this.reason = reason;
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
};
