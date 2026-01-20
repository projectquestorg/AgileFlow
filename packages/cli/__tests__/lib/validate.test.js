/**
 * Tests for validate.js - Central validation module re-exports
 *
 * This file tests that validate.js properly re-exports all functions
 * from its split modules. Detailed functional tests are in:
 *   - validate-names.test.js
 *   - validate-args.test.js
 *   - validate-path.test.js (validate-paths.js)
 *   - validate-commands.test.js
 */

const validate = require('../../lib/validate');

describe('validate.js re-exports', () => {
  describe('from validate-names.js', () => {
    it('exports PATTERNS', () => {
      expect(validate.PATTERNS).toBeDefined();
      expect(validate.PATTERNS.branchName).toBeInstanceOf(RegExp);
    });

    it.each([
      'isValidBranchName',
      'isValidStoryId',
      'isValidEpicId',
      'isValidFeatureName',
      'isValidProfileName',
      'isValidCommandName',
      'isValidSessionNickname',
      'isValidMergeStrategy',
    ])('exports %s', fnName => {
      expect(typeof validate[fnName]).toBe('function');
    });

    it('name validators work correctly', () => {
      expect(validate.isValidStoryId('US-0001')).toBe(true);
      expect(validate.isValidStoryId('invalid')).toBe(false);
      expect(validate.isValidEpicId('EP-0023')).toBe(true);
      expect(validate.isValidBranchName('main')).toBe(true);
    });
  });

  describe('from validate-args.js', () => {
    it.each(['isPositiveInteger', 'parseIntBounded', 'isValidOption', 'validateArgs'])(
      'exports %s',
      fnName => {
        expect(typeof validate[fnName]).toBe('function');
      }
    );

    it('arg validators work correctly', () => {
      expect(validate.isPositiveInteger(5)).toBe(true);
      expect(validate.isPositiveInteger(-1)).toBe(false);
      expect(validate.parseIntBounded('42', 0)).toBe(42);
      expect(validate.isValidOption('foo', ['foo', 'bar'])).toBe(true);
    });
  });

  describe('from validate-paths.js', () => {
    it('exports PathValidationError', () => {
      expect(validate.PathValidationError).toBeDefined();
      const err = new validate.PathValidationError('test', '/path', 'reason');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('PathValidationError');
    });

    it.each([
      'validatePath',
      'validatePathSync',
      'hasUnsafePathPatterns',
      'sanitizeFilename',
      'checkSymlinkChainDepth',
    ])('exports %s', fnName => {
      expect(typeof validate[fnName]).toBe('function');
    });

    it('path validators work correctly', () => {
      expect(validate.hasUnsafePathPatterns('../etc').safe).toBe(false);
      expect(validate.hasUnsafePathPatterns('safe.txt').safe).toBe(true);
      expect(validate.sanitizeFilename('file<>.txt')).toBe('file__.txt');
    });
  });

  describe('from validate-commands.js', () => {
    it('exports ALLOWED_COMMANDS', () => {
      expect(validate.ALLOWED_COMMANDS).toBeDefined();
      expect(typeof validate.ALLOWED_COMMANDS).toBe('object');
    });

    it('exports DANGEROUS_PATTERNS', () => {
      expect(validate.DANGEROUS_PATTERNS).toBeDefined();
      expect(Array.isArray(validate.DANGEROUS_PATTERNS)).toBe(true);
    });

    it.each([
      'validateCommand',
      'buildSpawnArgs',
      'isAllowedCommand',
      'getAllowedCommandList',
      'parseCommand',
      'checkArgSafety',
    ])('exports %s', fnName => {
      expect(typeof validate[fnName]).toBe('function');
    });

    it('command validators work correctly', () => {
      expect(validate.isAllowedCommand('npm')).toBe(true);
      expect(validate.isAllowedCommand('rm')).toBe(false);

      const parsed = validate.parseCommand('npm test');
      expect(parsed.executable).toBe('npm');

      expect(validate.checkArgSafety('test').safe).toBe(true);
      expect(validate.checkArgSafety('test; rm -rf').safe).toBe(false);
    });
  });

  describe('cross-module integration', () => {
    it('can use multiple validators together', () => {
      // Validate story ID from names module
      const storyId = 'US-0001';
      expect(validate.isValidStoryId(storyId)).toBe(true);

      // Validate branch name from names module
      const branch = `feature/${storyId}`;
      expect(validate.isValidBranchName(branch)).toBe(true);

      // Validate command from commands module
      const cmd = 'npm test';
      const cmdResult = validate.validateCommand(cmd);
      expect(cmdResult.ok).toBe(true);

      // Validate path from paths module
      const pathResult = validate.hasUnsafePathPatterns('docs/stories/US-0001.md');
      expect(pathResult.safe).toBe(true);
    });
  });

  describe('module structure', () => {
    it('does not export internal implementation details', () => {
      // Should not expose internal caching or state
      expect(validate._cache).toBeUndefined();
      expect(validate._internal).toBeUndefined();
    });

    it('exports all expected keys', () => {
      const expectedExports = [
        // validate-names.js
        'PATTERNS',
        'isValidBranchName',
        'isValidStoryId',
        'isValidEpicId',
        'isValidFeatureName',
        'isValidProfileName',
        'isValidCommandName',
        'isValidSessionNickname',
        'isValidMergeStrategy',
        // validate-args.js
        'isPositiveInteger',
        'parseIntBounded',
        'isValidOption',
        'validateArgs',
        // validate-paths.js
        'PathValidationError',
        'validatePath',
        'validatePathSync',
        'hasUnsafePathPatterns',
        'sanitizeFilename',
        'checkSymlinkChainDepth',
        // validate-commands.js
        'ALLOWED_COMMANDS',
        'DANGEROUS_PATTERNS',
        'validateCommand',
        'buildSpawnArgs',
        'isAllowedCommand',
        'getAllowedCommandList',
        'parseCommand',
        'checkArgSafety',
      ];

      for (const key of expectedExports) {
        expect(validate).toHaveProperty(key);
      }
    });
  });
});
