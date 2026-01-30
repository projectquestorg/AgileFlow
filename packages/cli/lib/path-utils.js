/**
 * path-utils.js - Unified Path Utilities Module
 *
 * This module consolidates all path-related utilities for AgileFlow CLI.
 * It re-exports from validate-paths.js for backwards compatibility and
 * discoverability, while adding path resolution helpers from path-resolver.js.
 *
 * US-0194: Consolidate Path Matching and Validation Logic
 *
 * Features:
 * - Path traversal prevention (validatePath, hasUnsafePathPatterns)
 * - Symlink chain validation (checkSymlinkChainDepth)
 * - Filename sanitization (sanitizeFilename)
 * - Path resolution with project root detection (PathResolver)
 *
 * Usage:
 *   const { validatePath, PathResolver } = require('./path-utils');
 *
 *   // Validate a path is safe and within base directory
 *   const result = validatePath('./config.yaml', '/project/root', { allowSymlinks: false });
 *
 *   // Use PathResolver for project-aware path operations
 *   const resolver = new PathResolver('/project/root');
 *   const docsPath = resolver.getDocsDir();
 */

// Re-export all path validation utilities from validate-paths.js
const validatePaths = require('./validate-paths');

// Re-export PathResolver for convenient access
const { PathResolver, getDefaultResolver, getAllPaths } = require('./path-resolver');

module.exports = {
  // Path validation (from validate-paths.js)
  PathValidationError: validatePaths.PathValidationError,
  checkSymlinkChainDepth: validatePaths.checkSymlinkChainDepth,
  validatePath: validatePaths.validatePath,
  validatePathSync: validatePaths.validatePathSync,
  hasUnsafePathPatterns: validatePaths.hasUnsafePathPatterns,
  sanitizeFilename: validatePaths.sanitizeFilename,

  // Path resolution (from path-resolver.js)
  PathResolver,
  getDefaultResolver,
  getAllPaths,

  // Convenience: full module access for advanced usage
  paths: validatePaths,
};
