/**
 * Tests for error-codes.js - Centralized error codes for auto-recovery
 */

const {
  Severity,
  Category,
  ErrorCodes,
  getErrorCode,
  getErrorCodeFromError,
  attachErrorCode,
  createTypedError,
  isRecoverable,
  getSuggestedFix,
  getAutoFix,
  formatError,
} = require('../../lib/error-codes');

describe('error-codes', () => {
  describe('Severity enum', () => {
    it('has all expected severity levels', () => {
      expect(Severity.CRITICAL).toBe('critical');
      expect(Severity.HIGH).toBe('high');
      expect(Severity.MEDIUM).toBe('medium');
      expect(Severity.LOW).toBe('low');
    });
  });

  describe('Category enum', () => {
    it('has all expected categories', () => {
      expect(Category.FILESYSTEM).toBe('filesystem');
      expect(Category.PERMISSION).toBe('permission');
      expect(Category.CONFIGURATION).toBe('configuration');
      expect(Category.NETWORK).toBe('network');
      expect(Category.VALIDATION).toBe('validation');
      expect(Category.STATE).toBe('state');
      expect(Category.DEPENDENCY).toBe('dependency');
    });
  });

  describe('ErrorCodes', () => {
    it('has required error codes', () => {
      expect(ErrorCodes.ENOENT).toBeDefined();
      expect(ErrorCodes.EACCES).toBeDefined();
      expect(ErrorCodes.ENODIR).toBeDefined();
      expect(ErrorCodes.EMIGRATION).toBeDefined();
      expect(ErrorCodes.ECONFIG).toBeDefined();
      expect(ErrorCodes.ENETWORK).toBeDefined();
    });

    it('all error codes have required fields', () => {
      for (const [key, value] of Object.entries(ErrorCodes)) {
        expect(value.code).toBe(key);
        expect(value.message).toBeDefined();
        expect(Object.values(Severity)).toContain(value.severity);
        expect(Object.values(Category)).toContain(value.category);
        expect(typeof value.recoverable).toBe('boolean');
        expect(value.suggestedFix).toBeDefined();
      }
    });
  });

  describe('getErrorCode', () => {
    it('returns error code details for known code', () => {
      const result = getErrorCode('ENOENT');
      expect(result).toEqual(ErrorCodes.ENOENT);
    });

    it('returns null for unknown code', () => {
      const result = getErrorCode('UNKNOWN_CODE');
      expect(result).toBeNull();
    });
  });

  describe('getErrorCodeFromError', () => {
    it('returns EUNKNOWN for null/undefined', () => {
      expect(getErrorCodeFromError(null)).toEqual(ErrorCodes.EUNKNOWN);
      expect(getErrorCodeFromError(undefined)).toEqual(ErrorCodes.EUNKNOWN);
    });

    it('returns code from error.errorCode if already typed', () => {
      const error = new Error('test');
      error.errorCode = 'ENOENT';
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.ENOENT);
    });

    it('returns code from error.code (system error)', () => {
      const error = new Error('file not found');
      error.code = 'EACCES';
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.EACCES);
    });

    it('detects EACCES from message', () => {
      const error = new Error('Permission denied');
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.EACCES);
    });

    it('detects ENOENT from message', () => {
      const error = new Error('No such file');
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.ENOENT);
    });

    it('detects ETIMEOUT from message', () => {
      const error = new Error('Operation timed out');
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.ETIMEOUT);
    });

    it('detects ENETWORK from message', () => {
      const error = new Error('Network connection failed');
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.ENETWORK);
    });

    it('detects EPARSE from message', () => {
      const error = new Error('JSON parse error');
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.EPARSE);
    });

    it('returns EUNKNOWN for unrecognized error', () => {
      const error = new Error('Something went wrong');
      expect(getErrorCodeFromError(error)).toEqual(ErrorCodes.EUNKNOWN);
    });
  });

  describe('attachErrorCode', () => {
    it('attaches error code metadata to error', () => {
      const error = new Error('File not found');
      const enhanced = attachErrorCode(error, 'ENOENT');

      expect(enhanced.errorCode).toBe('ENOENT');
      expect(enhanced.severity).toBe(Severity.HIGH);
      expect(enhanced.category).toBe(Category.FILESYSTEM);
      expect(enhanced.recoverable).toBe(true);
      expect(enhanced.suggestedFix).toBeDefined();
    });

    it('uses EUNKNOWN for unknown code', () => {
      const error = new Error('Unknown error');
      const enhanced = attachErrorCode(error, 'NONEXISTENT');

      expect(enhanced.errorCode).toBe('EUNKNOWN');
    });
  });

  describe('createTypedError', () => {
    it('creates error with code metadata', () => {
      const error = createTypedError('Config missing', 'ECONFIG');

      expect(error.message).toBe('Config missing');
      expect(error.errorCode).toBe('ECONFIG');
      expect(error.severity).toBe(Severity.HIGH);
      expect(error.category).toBe(Category.CONFIGURATION);
      expect(error.recoverable).toBe(true);
    });

    it('includes cause if provided', () => {
      const cause = new Error('Original error');
      const error = createTypedError('Wrapper error', 'ECONFIG', { cause });

      expect(error.cause).toBe(cause);
    });

    it('includes context if provided', () => {
      const error = createTypedError('Error', 'ECONFIG', {
        context: { file: 'config.json' },
      });

      expect(error.context).toEqual({ file: 'config.json' });
    });
  });

  describe('isRecoverable', () => {
    it('returns false for null/undefined', () => {
      expect(isRecoverable(null)).toBe(false);
      expect(isRecoverable(undefined)).toBe(false);
    });

    it('returns error.recoverable if typed', () => {
      const recoverableError = createTypedError('test', 'ENOENT');
      const nonRecoverableError = createTypedError('test', 'EACCES');

      expect(isRecoverable(recoverableError)).toBe(true);
      expect(isRecoverable(nonRecoverableError)).toBe(false);
    });

    it('detects recoverability from untyped error', () => {
      const error = new Error('Permission denied');
      expect(isRecoverable(error)).toBe(false);
    });
  });

  describe('getSuggestedFix', () => {
    it('returns default message for null/undefined', () => {
      expect(getSuggestedFix(null)).toBe('Unknown error occurred');
      expect(getSuggestedFix(undefined)).toBe('Unknown error occurred');
    });

    it('returns error.suggestedFix if typed', () => {
      const error = createTypedError('test', 'ENOENT');
      expect(getSuggestedFix(error)).toBe(ErrorCodes.ENOENT.suggestedFix);
    });

    it('detects suggestion from untyped error', () => {
      const error = new Error('Permission denied');
      expect(getSuggestedFix(error)).toBe(ErrorCodes.EACCES.suggestedFix);
    });
  });

  describe('getAutoFix', () => {
    it('returns null for null/undefined', () => {
      expect(getAutoFix(null)).toBeNull();
      expect(getAutoFix(undefined)).toBeNull();
    });

    it('returns error.autoFix if typed', () => {
      const error = createTypedError('test', 'ENOENT');
      expect(getAutoFix(error)).toBe('create-missing-file');
    });

    it('returns null for errors without autoFix', () => {
      const error = createTypedError('test', 'EACCES');
      expect(getAutoFix(error)).toBeNull();
    });
  });

  describe('formatError', () => {
    it('returns "Unknown error" for null/undefined', () => {
      expect(formatError(null)).toBe('Unknown error');
      expect(formatError(undefined)).toBe('Unknown error');
    });

    it('formats typed error with code info', () => {
      const error = createTypedError('Config file missing', 'ECONFIG');
      const formatted = formatError(error);

      expect(formatted).toContain('[ECONFIG]');
      expect(formatted).toContain('Config file missing');
      expect(formatted).toContain('Severity: high');
      expect(formatted).toContain('Category: configuration');
    });

    it('includes suggestion by default', () => {
      const error = createTypedError('test', 'ENOENT');
      const formatted = formatError(error);

      expect(formatted).toContain('Fix:');
    });

    it('excludes suggestion when includeSuggestion=false', () => {
      const error = createTypedError('test', 'ENOENT');
      const formatted = formatError(error, { includeSuggestion: false });

      expect(formatted).not.toContain('Fix:');
    });

    it('includes stack trace when includeStack=true', () => {
      const error = createTypedError('test', 'ENOENT');
      const formatted = formatError(error, { includeStack: true });

      expect(formatted).toContain('at ');
    });

    it('shows auto-fix availability', () => {
      const error = createTypedError('test', 'ENOENT');
      const formatted = formatError(error);

      expect(formatted).toContain('Auto-fix available');
    });
  });
});
