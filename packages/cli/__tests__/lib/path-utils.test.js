/**
 * Tests for path-utils.js (US-0194)
 *
 * Verifies that path-utils.js properly consolidates and re-exports
 * path validation and resolution utilities.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  PathValidationError,
  checkSymlinkChainDepth,
  validatePath,
  validatePathSync,
  hasUnsafePathPatterns,
  sanitizeFilename,
  PathResolver,
  getDefaultResolver,
  getAllPaths,
  paths,
} = require('../../lib/path-utils');

describe('path-utils.js (US-0194 consolidation)', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('re-exports from validate-paths.js', () => {
    test('exports PathValidationError class', () => {
      expect(PathValidationError).toBeDefined();
      expect(typeof PathValidationError).toBe('function');

      const error = new PathValidationError('test message', '/test/path', 'test_reason');
      expect(error.message).toBe('test message');
      expect(error.inputPath).toBe('/test/path');
      expect(error.reason).toBe('test_reason');
    });

    test('exports checkSymlinkChainDepth function', () => {
      expect(checkSymlinkChainDepth).toBeDefined();
      expect(typeof checkSymlinkChainDepth).toBe('function');

      // Test with non-existent path (should be ok, depth 0)
      const result = checkSymlinkChainDepth('/nonexistent/path', 3);
      expect(result.ok).toBe(true);
      expect(result.depth).toBe(0);
    });

    test('exports validatePath function', () => {
      expect(validatePath).toBeDefined();
      expect(typeof validatePath).toBe('function');

      // Test valid path
      const result = validatePath('subdir', testDir, { allowSymlinks: false });
      expect(result.ok).toBe(true);
      expect(result.resolvedPath).toBe(path.join(testDir, 'subdir'));
    });

    test('exports validatePathSync function', () => {
      expect(validatePathSync).toBeDefined();
      expect(typeof validatePathSync).toBe('function');
    });

    test('exports hasUnsafePathPatterns function', () => {
      expect(hasUnsafePathPatterns).toBeDefined();
      expect(typeof hasUnsafePathPatterns).toBe('function');

      // Test safe path
      expect(hasUnsafePathPatterns('safe/path')).toEqual({ safe: true });

      // Test traversal attempt
      expect(hasUnsafePathPatterns('../escape').safe).toBe(false);
      expect(hasUnsafePathPatterns('../escape').reason).toBe('dot_dot_sequence');
    });

    test('exports sanitizeFilename function', () => {
      expect(sanitizeFilename).toBeDefined();
      expect(typeof sanitizeFilename).toBe('function');

      // Test filename sanitization
      expect(sanitizeFilename('normal.txt')).toBe('normal.txt');
      expect(sanitizeFilename('bad<>file.txt')).toBe('bad__file.txt');
    });
  });

  describe('re-exports from path-resolver.js', () => {
    test('exports PathResolver class', () => {
      expect(PathResolver).toBeDefined();
      expect(typeof PathResolver).toBe('function');

      const resolver = new PathResolver(testDir, { autoDetect: false });
      expect(resolver.getProjectRoot()).toBe(testDir);
    });

    test('exports getDefaultResolver function', () => {
      expect(getDefaultResolver).toBeDefined();
      expect(typeof getDefaultResolver).toBe('function');

      const resolver = getDefaultResolver();
      expect(resolver).toBeInstanceOf(PathResolver);
    });

    test('exports getAllPaths function', () => {
      expect(getAllPaths).toBeDefined();
      expect(typeof getAllPaths).toBe('function');

      const paths = getAllPaths();
      expect(paths).toHaveProperty('projectRoot');
    });
  });

  describe('paths namespace', () => {
    test('exports paths namespace with all validate-paths exports', () => {
      expect(paths).toBeDefined();
      expect(paths.validatePath).toBe(validatePath);
      expect(paths.hasUnsafePathPatterns).toBe(hasUnsafePathPatterns);
      expect(paths.PathValidationError).toBe(PathValidationError);
    });
  });

  describe('validatePath boundary checking', () => {
    test('rejects path traversal attempts', () => {
      const result = validatePath('../../../etc/passwd', testDir);
      expect(result.ok).toBe(false);
      expect(result.error.reason).toBe('path_traversal');
    });

    test('accepts paths within base directory', () => {
      const result = validatePath('subdir/file.txt', testDir);
      expect(result.ok).toBe(true);
    });

    test('rejects symlinks when allowSymlinks is false', () => {
      // Create a symlink for testing
      const linkPath = path.join(testDir, 'link');
      const targetPath = path.join(testDir, 'target');
      fs.mkdirSync(targetPath);

      try {
        fs.symlinkSync(targetPath, linkPath);
      } catch (e) {
        // Skip on systems that don't support symlinks
        return;
      }

      const result = validatePath('link', testDir, { allowSymlinks: false });
      expect(result.ok).toBe(false);
      expect(result.error.reason).toBe('symlink_rejected');
    });
  });
});
