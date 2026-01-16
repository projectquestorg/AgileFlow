/**
 * AgileFlow CLI - Path Validation Utilities
 *
 * Path traversal protection and filesystem path validation.
 */

const path = require('node:path');
const fs = require('node:fs');

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
 * Check the depth of a symlink chain (how many symlinks to follow to reach final target).
 * Returns early if chain exceeds maxDepth to prevent infinite loops from circular symlinks.
 *
 * @param {string} filePath - Starting path to check
 * @param {number} maxDepth - Maximum allowed symlink chain depth
 * @returns {{ ok: boolean, depth: number, error?: string, isCircular?: boolean }}
 */
function checkSymlinkChainDepth(filePath, maxDepth) {
  let current = filePath;
  let depth = 0;
  const seen = new Set();

  // Loop until we find a non-symlink or exceed max depth
  while (true) {
    // Check for circular symlinks
    if (seen.has(current)) {
      return {
        ok: false,
        depth,
        error: `Circular symlink detected at: ${current}`,
        isCircular: true,
      };
    }
    seen.add(current);

    try {
      const stats = fs.lstatSync(current);
      if (!stats.isSymbolicLink()) {
        // Reached a real file/directory, chain ends
        return { ok: true, depth };
      }

      // Increment depth before checking limit
      depth++;

      // Check if we've exceeded max depth
      if (depth > maxDepth) {
        return {
          ok: false,
          depth,
          error: `Symlink chain depth (${depth}) exceeds maximum (${maxDepth})`,
        };
      }

      // Read symlink target
      const target = fs.readlinkSync(current);

      // Resolve target path (could be relative or absolute)
      if (path.isAbsolute(target)) {
        current = target;
      } else {
        current = path.resolve(path.dirname(current), target);
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        // Path doesn't exist, chain ends here
        return { ok: true, depth };
      }
      // Other error (permission denied, etc.)
      return { ok: true, depth };
    }
  }
}

/**
 * Validate that a path is safe and within the allowed base directory.
 * Prevents path traversal attacks by:
 * 1. Resolving the path to absolute form
 * 2. Ensuring it stays within the base directory
 * 3. Rejecting symbolic links (optional)
 * 4. When symlinks allowed, verifying symlink targets stay within base
 * 5. Limiting symlink chain depth to prevent infinite loops
 *
 * @param {string} inputPath - The path to validate (can be relative or absolute)
 * @param {string} baseDir - The allowed base directory (must be absolute)
 * @param {Object} options - Validation options
 * @param {boolean} [options.allowSymlinks=false] - Allow symbolic links
 * @param {boolean} [options.mustExist=false] - Path must exist on filesystem
 * @param {number} [options.maxSymlinkDepth=3] - Maximum symlink chain depth (when symlinks allowed)
 * @returns {{ ok: boolean, resolvedPath?: string, realPath?: string, error?: PathValidationError }}
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
 *
 * @example
 * // Reject deep symlink chains
 * const result = validatePath('link1', baseDir, { allowSymlinks: true, maxSymlinkDepth: 3 });
 * // If link1 -> link2 -> link3 -> link4 -> target, this fails with 'symlink_chain_too_deep'
 */
function validatePath(inputPath, baseDir, options = {}) {
  const { allowSymlinks = false, mustExist = false, maxSymlinkDepth = 3 } = options;

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

  // Helper function to check if path is within base
  const checkWithinBase = pathToCheck => {
    const baseWithSep = normalizedBase.endsWith(path.sep)
      ? normalizedBase
      : normalizedBase + path.sep;
    return pathToCheck === normalizedBase || pathToCheck.startsWith(baseWithSep);
  };

  // Check for path traversal: resolved path must start with base directory
  if (!checkWithinBase(resolvedPath)) {
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

  // Check for symbolic links
  if (!allowSymlinks) {
    // Symlinks not allowed - reject if found
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
  } else {
    // Symlinks allowed - but we must verify the target stays within base!
    // This prevents symlink-based escape attacks
    try {
      const stats = fs.lstatSync(resolvedPath);
      if (stats.isSymbolicLink()) {
        // Check symlink chain depth to prevent DoS via infinite loops
        const chainResult = checkSymlinkChainDepth(resolvedPath, maxSymlinkDepth);
        if (!chainResult.ok) {
          const reason = chainResult.isCircular ? 'symlink_circular' : 'symlink_chain_too_deep';
          return {
            ok: false,
            error: new PathValidationError(chainResult.error, inputPath, reason),
          };
        }

        // Resolve the symlink target to its real path
        const realPath = fs.realpathSync(resolvedPath);

        // Verify the real path is also within base directory
        if (!checkWithinBase(realPath)) {
          return {
            ok: false,
            error: new PathValidationError(
              `Symlink target escapes base directory: ${inputPath} -> ${realPath}`,
              inputPath,
              'symlink_escape'
            ),
          };
        }

        // Return both the resolved path and the real path
        return {
          ok: true,
          resolvedPath,
          realPath,
        };
      }
    } catch {
      // Path doesn't exist - that's okay for non-mustExist scenarios
      // Also check parent directories for symlinks that might escape
      const parts = path.relative(normalizedBase, resolvedPath).split(path.sep);
      let currentPath = normalizedBase;

      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        try {
          const stats = fs.lstatSync(currentPath);
          if (stats.isSymbolicLink()) {
            // Check symlink chain depth
            const chainResult = checkSymlinkChainDepth(currentPath, maxSymlinkDepth);
            if (!chainResult.ok) {
              const reason = chainResult.isCircular ? 'symlink_circular' : 'symlink_chain_too_deep';
              return {
                ok: false,
                error: new PathValidationError(chainResult.error, inputPath, reason),
              };
            }

            // Resolve this symlink and check its target
            const realPath = fs.realpathSync(currentPath);
            if (!checkWithinBase(realPath)) {
              return {
                ok: false,
                error: new PathValidationError(
                  `Path contains symlink escaping base: ${currentPath} -> ${realPath}`,
                  inputPath,
                  'symlink_escape'
                ),
              };
            }
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
  PathValidationError,
  checkSymlinkChainDepth,
  validatePath,
  validatePathSync,
  hasUnsafePathPatterns,
  sanitizeFilename,
};
