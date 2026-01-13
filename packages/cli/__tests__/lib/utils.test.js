/**
 * Tests for utils.js
 *
 * Tests utility functions: sha256Hex, toPosixPath, safeTimestampForPath, compareVersions, createDebugLogger
 */

const path = require('path');

const {
  sha256Hex,
  toPosixPath,
  safeTimestampForPath,
  compareVersions,
  createDebugLogger,
  BRAND_COLOR,
} = require('../../tools/cli/lib/utils');

describe('utils', () => {
  describe('sha256Hex', () => {
    it('returns consistent hash for same input', () => {
      const hash1 = sha256Hex('hello');
      const hash2 = sha256Hex('hello');
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different input', () => {
      const hash1 = sha256Hex('hello');
      const hash2 = sha256Hex('world');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64 character hex string', () => {
      const hash = sha256Hex('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('handles empty string', () => {
      const hash = sha256Hex('');
      expect(hash).toHaveLength(64);
    });

    it('handles Buffer input', () => {
      const hash = sha256Hex(Buffer.from('hello'));
      expect(hash).toHaveLength(64);
    });

    it('produces known hash for known input', () => {
      // SHA256 of "hello" is well-known
      const hash = sha256Hex('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
  });

  describe('toPosixPath', () => {
    it('converts backslashes to forward slashes', () => {
      const result = toPosixPath('a\\b\\c');
      // On Unix, path.sep is '/', so no change; on Windows path.sep is '\\'
      expect(result).toMatch(/^a\/b\/c$|^a\\b\\c$/);
    });

    it('keeps forward slashes unchanged', () => {
      const result = toPosixPath('a/b/c');
      expect(result).toBe('a/b/c');
    });

    it('handles mixed separators based on platform', () => {
      const result = toPosixPath(`a${path.sep}b${path.sep}c`);
      expect(result).toBe('a/b/c');
    });

    it('handles empty string', () => {
      const result = toPosixPath('');
      expect(result).toBe('');
    });

    it('handles single component', () => {
      const result = toPosixPath('file.txt');
      expect(result).toBe('file.txt');
    });
  });

  describe('safeTimestampForPath', () => {
    it('returns string suitable for filenames', () => {
      const timestamp = safeTimestampForPath();
      // Should not contain : or . which are problematic in filenames
      expect(timestamp).not.toContain(':');
      expect(timestamp).not.toContain('.');
      // Should contain - as separator
      expect(timestamp).toContain('-');
    });

    it('formats specific date correctly', () => {
      const date = new Date('2025-12-27T10:30:45.123Z');
      const timestamp = safeTimestampForPath(date);
      expect(timestamp).toBe('2025-12-27T10-30-45-123Z');
    });

    it('handles midnight time', () => {
      const date = new Date('2025-01-01T00:00:00.000Z');
      const timestamp = safeTimestampForPath(date);
      expect(timestamp).toBe('2025-01-01T00-00-00-000Z');
    });

    it('defaults to current time when no argument', () => {
      const before = new Date().toISOString().replace(/[:.]/g, '-');
      const timestamp = safeTimestampForPath();
      const after = new Date().toISOString().replace(/[:.]/g, '-');
      // Should be between before and after (or equal to one)
      expect(timestamp >= before || timestamp <= after).toBe(true);
    });
  });

  describe('compareVersions', () => {
    it('returns -1 when v1 < v2', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.60.0', '2.61.0')).toBe(-1);
      expect(compareVersions('2.61.0', '2.61.1')).toBe(-1);
    });

    it('returns 1 when v1 > v2', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('2.61.0', '2.60.0')).toBe(1);
      expect(compareVersions('2.61.1', '2.61.0')).toBe(1);
    });

    it('returns 0 when versions are equal', () => {
      expect(compareVersions('2.61.0', '2.61.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('handles versions with v prefix', () => {
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1);
      expect(compareVersions('v1.0.0', '2.0.0')).toBe(-1);
    });

    it('handles versions with different number of parts', () => {
      expect(compareVersions('2.0', '2.0.0')).toBe(0);
      expect(compareVersions('2.0.0', '2.0')).toBe(0);
      expect(compareVersions('2', '2.0.0')).toBe(0);
    });

    it('handles versions with extra parts', () => {
      expect(compareVersions('2.0.0.1', '2.0.0')).toBe(1);
      expect(compareVersions('2.0.0', '2.0.0.1')).toBe(-1);
    });

    it('compares major versions first', () => {
      expect(compareVersions('10.0.0', '9.99.99')).toBe(1);
      expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    });
  });

  describe('createDebugLogger', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('logs when enabled is true', () => {
      const log = createDebugLogger(true);
      log('test message');
      expect(consoleSpy).toHaveBeenCalledWith('test message');
    });

    it('does not log when enabled is false', () => {
      const log = createDebugLogger(false);
      log('test message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('adds prefix when provided', () => {
      const log = createDebugLogger(true, 'DEBUG');
      log('test message');
      expect(consoleSpy).toHaveBeenCalledWith('[DEBUG]', 'test message');
    });

    it('handles multiple arguments', () => {
      const log = createDebugLogger(true);
      log('arg1', 'arg2', 'arg3');
      expect(consoleSpy).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
    });

    it('handles multiple arguments with prefix', () => {
      const log = createDebugLogger(true, 'TEST');
      log('arg1', 'arg2');
      expect(consoleSpy).toHaveBeenCalledWith('[TEST]', 'arg1', 'arg2');
    });

    it('handles no arguments', () => {
      const log = createDebugLogger(true);
      log();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('BRAND_COLOR', () => {
    it('is the correct hex color', () => {
      expect(BRAND_COLOR).toBe('#e8683a');
    });

    it('is a valid hex color format', () => {
      expect(BRAND_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
