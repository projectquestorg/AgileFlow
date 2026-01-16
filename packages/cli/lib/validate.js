/**
 * AgileFlow CLI - Input Validation Utilities
 *
 * Centralized validation patterns and helpers to prevent
 * command injection, path traversal, and invalid input handling.
 *
 * This module re-exports from split validation modules for backward compatibility.
 * For better performance, import directly from:
 *   - validate-names.js - Name/ID validation patterns
 *   - validate-args.js  - CLI argument validation
 *   - validate-paths.js - Path traversal protection
 */

// Re-export name validators
const {
  PATTERNS,
  isValidBranchName,
  isValidStoryId,
  isValidEpicId,
  isValidFeatureName,
  isValidProfileName,
  isValidCommandName,
  isValidSessionNickname,
  isValidMergeStrategy,
} = require('./validate-names');

// Re-export argument validators
const {
  isPositiveInteger,
  parseIntBounded,
  isValidOption,
  validateArgs,
} = require('./validate-args');

// Re-export path validators
const {
  PathValidationError,
  checkSymlinkChainDepth,
  validatePath,
  validatePathSync,
  hasUnsafePathPatterns,
  sanitizeFilename,
} = require('./validate-paths');

module.exports = {
  // Patterns and basic validators (from validate-names.js)
  PATTERNS,
  isValidBranchName,
  isValidStoryId,
  isValidEpicId,
  isValidFeatureName,
  isValidProfileName,
  isValidCommandName,
  isValidSessionNickname,
  isValidMergeStrategy,

  // Argument validators (from validate-args.js)
  isPositiveInteger,
  parseIntBounded,
  isValidOption,
  validateArgs,

  // Path traversal protection (from validate-paths.js)
  PathValidationError,
  validatePath,
  validatePathSync,
  hasUnsafePathPatterns,
  sanitizeFilename,
  checkSymlinkChainDepth,
};
