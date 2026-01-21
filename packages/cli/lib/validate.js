/**
 * AgileFlow CLI - Input Validation Utilities
 *
 * Centralized validation patterns and helpers to prevent
 * command injection, path traversal, and invalid input handling.
 *
 * Usage patterns:
 *
 * 1. Namespace import (recommended - clear, discoverable):
 *    const { names, args, paths, commands } = require('./validate');
 *    names.isValidStoryId('US-0001')
 *    paths.validatePath('/some/path')
 *    args.validateArgs(schema, input)
 *
 * 2. Flat import (backwards compatible):
 *    const { isValidStoryId, validatePath } = require('./validate');
 *
 * 3. Direct import (best performance):
 *    const { isValidStoryId } = require('./validate-names');
 *    const { validatePath } = require('./validate-paths');
 */

// Import all validators
const validateNames = require('./validate-names');
const validateArgs = require('./validate-args');
const validatePaths = require('./validate-paths');
const validateCommands = require('./validate-commands');

// ============================================================================
// Namespace exports (recommended for new code)
// ============================================================================

/**
 * Name/ID validation namespace
 * @namespace names
 */
const names = {
  PATTERNS: validateNames.PATTERNS,
  isValidBranchName: validateNames.isValidBranchName,
  isValidStoryId: validateNames.isValidStoryId,
  isValidEpicId: validateNames.isValidEpicId,
  isValidFeatureName: validateNames.isValidFeatureName,
  isValidProfileName: validateNames.isValidProfileName,
  isValidCommandName: validateNames.isValidCommandName,
  isValidSessionNickname: validateNames.isValidSessionNickname,
  isValidMergeStrategy: validateNames.isValidMergeStrategy,
};

/**
 * CLI argument validation namespace
 * @namespace args
 */
const args = {
  isPositiveInteger: validateArgs.isPositiveInteger,
  parseIntBounded: validateArgs.parseIntBounded,
  isValidOption: validateArgs.isValidOption,
  validateArgs: validateArgs.validateArgs,
};

/**
 * Path traversal protection namespace
 * @namespace paths
 */
const paths = {
  PathValidationError: validatePaths.PathValidationError,
  checkSymlinkChainDepth: validatePaths.checkSymlinkChainDepth,
  validatePath: validatePaths.validatePath,
  validatePathSync: validatePaths.validatePathSync,
  hasUnsafePathPatterns: validatePaths.hasUnsafePathPatterns,
  sanitizeFilename: validatePaths.sanitizeFilename,
};

/**
 * Command validation namespace
 * @namespace commands
 */
const commands = {
  ALLOWED_COMMANDS: validateCommands.ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS: validateCommands.DANGEROUS_PATTERNS,
  validateCommand: validateCommands.validateCommand,
  buildSpawnArgs: validateCommands.buildSpawnArgs,
  isAllowedCommand: validateCommands.isAllowedCommand,
  getAllowedCommandList: validateCommands.getAllowedCommandList,
  parseCommand: validateCommands.parseCommand,
  checkArgSafety: validateCommands.checkArgSafety,
};

// ============================================================================
// Flat exports (backwards compatible)
// ============================================================================

module.exports = {
  // Namespaces (recommended for new code)
  names,
  args,
  paths,
  commands,

  // Flat exports (backwards compatible)
  // Patterns and basic validators (from validate-names.js)
  PATTERNS: validateNames.PATTERNS,
  isValidBranchName: validateNames.isValidBranchName,
  isValidStoryId: validateNames.isValidStoryId,
  isValidEpicId: validateNames.isValidEpicId,
  isValidFeatureName: validateNames.isValidFeatureName,
  isValidProfileName: validateNames.isValidProfileName,
  isValidCommandName: validateNames.isValidCommandName,
  isValidSessionNickname: validateNames.isValidSessionNickname,
  isValidMergeStrategy: validateNames.isValidMergeStrategy,

  // Argument validators (from validate-args.js)
  isPositiveInteger: validateArgs.isPositiveInteger,
  parseIntBounded: validateArgs.parseIntBounded,
  isValidOption: validateArgs.isValidOption,
  validateArgs: validateArgs.validateArgs,

  // Path traversal protection (from validate-paths.js)
  PathValidationError: validatePaths.PathValidationError,
  validatePath: validatePaths.validatePath,
  validatePathSync: validatePaths.validatePathSync,
  hasUnsafePathPatterns: validatePaths.hasUnsafePathPatterns,
  sanitizeFilename: validatePaths.sanitizeFilename,
  checkSymlinkChainDepth: validatePaths.checkSymlinkChainDepth,

  // Command validation (from validate-commands.js)
  ALLOWED_COMMANDS: validateCommands.ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS: validateCommands.DANGEROUS_PATTERNS,
  validateCommand: validateCommands.validateCommand,
  buildSpawnArgs: validateCommands.buildSpawnArgs,
  isAllowedCommand: validateCommands.isAllowedCommand,
  getAllowedCommandList: validateCommands.getAllowedCommandList,
  parseCommand: validateCommands.parseCommand,
  checkArgSafety: validateCommands.checkArgSafety,
};
