/**
 * Tests for result-schema.js - Unified Result<T> type
 */

const {
  success,
  failure,
  failureFromError,
  fromCondition,
  fromPromise,
  fromTry,
  isSuccess,
  isFailure,
  unwrap,
  unwrapOr,
  map,
  flatMap,
  all,
  any,
  format,
  Severity,
  Category,
} = require('../../lib/result-schema');

describe('result-schema', () => {
  describe('success()', () => {
    it('should create a success result with data', () => {
      const result = success({ name: 'test' });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.error).toBeUndefined();
    });

    it('should create a success result with primitive data', () => {
      expect(success(42).data).toBe(42);
      expect(success('hello').data).toBe('hello');
      expect(success(true).data).toBe(true);
      expect(success(null).data).toBeNull();
    });

    it('should include optional metadata', () => {
      const result = success('data', { cached: true });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('data');
      expect(result.cached).toBe(true);
    });
  });

  describe('failure()', () => {
    it('should create a failure result with error code', () => {
      const result = failure('ENOENT', 'File not found');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('File not found');
      expect(result.errorCode).toBe('ENOENT');
      expect(result.severity).toBe('high');
      expect(result.category).toBe('filesystem');
      expect(result.recoverable).toBe(true);
      expect(result.suggestedFix).toContain('agileflow setup');
    });

    it('should use default message from error code', () => {
      const result = failure('EACCES');
      expect(result.error).toBe('Permission denied');
    });

    it('should fall back to EUNKNOWN for invalid codes', () => {
      const result = failure('INVALID_CODE', 'Custom error');
      expect(result.errorCode).toBe('EUNKNOWN');
      expect(result.error).toBe('Custom error');
    });

    it('should include context when provided', () => {
      const result = failure('ENOENT', 'Missing file', {
        context: { path: '/test/file.json' },
      });
      expect(result.context).toEqual({ path: '/test/file.json' });
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const result = failure('ECONFIG', 'Config failed', { cause });
      expect(result.cause).toBe(cause);
    });
  });

  describe('failureFromError()', () => {
    it('should extract error code from Error object', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      const result = failureFromError(error);
      expect(result.errorCode).toBe('ENOENT');
      expect(result.error).toBe('File not found');
    });

    it('should detect error type from message', () => {
      const error = new Error('Permission denied for /etc/passwd');
      const result = failureFromError(error);
      expect(result.errorCode).toBe('EACCES');
    });

    it('should use default code when no match', () => {
      const error = new Error('Something weird happened');
      const result = failureFromError(error, 'ECONFIG');
      expect(result.errorCode).toBe('ECONFIG');
    });

    it('should store original error as cause', () => {
      const error = new Error('Test error');
      const result = failureFromError(error);
      expect(result.cause).toBe(error);
    });
  });

  describe('fromCondition()', () => {
    it('should return success when condition is true', () => {
      const result = fromCondition(true, 'data', 'EINVAL', 'Error');
      expect(result.ok).toBe(true);
      expect(result.data).toBe('data');
    });

    it('should return failure when condition is false', () => {
      const result = fromCondition(false, 'data', 'EINVAL', 'Validation failed');
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('EINVAL');
      expect(result.error).toBe('Validation failed');
    });
  });

  describe('fromPromise()', () => {
    it('should return success for resolved promise', async () => {
      const result = await fromPromise(Promise.resolve('data'));
      expect(result.ok).toBe(true);
      expect(result.data).toBe('data');
    });

    it('should return failure for rejected promise', async () => {
      const error = new Error('Network error');
      const result = await fromPromise(Promise.reject(error), 'ENETWORK');
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('ENETWORK');
    });
  });

  describe('fromTry()', () => {
    it('should return success for successful function', () => {
      const result = fromTry(() => 42);
      expect(result.ok).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should return failure for throwing function', () => {
      const result = fromTry(() => {
        throw new Error('Parse error');
      }, 'EPARSE');
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('EPARSE');
    });
  });

  describe('isSuccess() and isFailure()', () => {
    it('should identify success results', () => {
      const result = success('data');
      expect(isSuccess(result)).toBe(true);
      expect(isFailure(result)).toBe(false);
    });

    it('should identify failure results', () => {
      const result = failure('ENOENT');
      expect(isSuccess(result)).toBe(false);
      expect(isFailure(result)).toBe(true);
    });

    it('should handle null/undefined gracefully', () => {
      expect(isSuccess(null)).toBe(false);
      expect(isFailure(undefined)).toBe(false);
    });
  });

  describe('unwrap()', () => {
    it('should return data for success', () => {
      const data = unwrap(success({ id: 1 }));
      expect(data).toEqual({ id: 1 });
    });

    it('should throw for failure', () => {
      expect(() => unwrap(failure('ENOENT', 'Not found'))).toThrow('Not found');
    });

    it('should include context in error message', () => {
      expect(() => unwrap(failure('ENOENT', 'Not found'), 'Loading config')).toThrow(
        'Loading config: Not found'
      );
    });

    it('should attach error metadata to thrown error', () => {
      try {
        unwrap(failure('ENOENT', 'File missing'));
      } catch (error) {
        expect(error.errorCode).toBe('ENOENT');
        expect(error.severity).toBe('high');
        expect(error.recoverable).toBe(true);
      }
    });
  });

  describe('unwrapOr()', () => {
    it('should return data for success', () => {
      expect(unwrapOr(success(42), 0)).toBe(42);
    });

    it('should return default for failure', () => {
      expect(unwrapOr(failure('ENOENT'), 'default')).toBe('default');
    });
  });

  describe('map()', () => {
    it('should transform success data', () => {
      const result = map(success(5), x => x * 2);
      expect(result.ok).toBe(true);
      expect(result.data).toBe(10);
    });

    it('should pass through failure', () => {
      const result = map(failure('ENOENT', 'Not found'), x => x * 2);
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('ENOENT');
    });
  });

  describe('flatMap()', () => {
    it('should chain successful operations', () => {
      const result = flatMap(success(5), x => success(x * 2));
      expect(result.ok).toBe(true);
      expect(result.data).toBe(10);
    });

    it('should short-circuit on failure', () => {
      const result = flatMap(failure('ENOENT'), x => success(x * 2));
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('ENOENT');
    });

    it('should propagate inner failure', () => {
      const result = flatMap(success(5), () => failure('EINVAL', 'Invalid'));
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('EINVAL');
    });
  });

  describe('all()', () => {
    it('should combine all successes', () => {
      const results = [success(1), success(2), success(3)];
      const combined = all(results);
      expect(combined.ok).toBe(true);
      expect(combined.data).toEqual([1, 2, 3]);
    });

    it('should return first failure', () => {
      const results = [success(1), failure('ENOENT', 'Not found'), success(3)];
      const combined = all(results);
      expect(combined.ok).toBe(false);
      expect(combined.errorCode).toBe('ENOENT');
    });

    it('should handle empty array', () => {
      const combined = all([]);
      expect(combined.ok).toBe(true);
      expect(combined.data).toEqual([]);
    });
  });

  describe('any()', () => {
    it('should return first success', () => {
      const results = [failure('ENOENT'), success(2), failure('EACCES')];
      const result = any(results);
      expect(result.ok).toBe(true);
      expect(result.data).toBe(2);
    });

    it('should return last failure if all fail', () => {
      const results = [failure('ENOENT'), failure('EACCES'), failure('ECONFIG')];
      const result = any(results);
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('ECONFIG');
    });

    it('should handle empty array', () => {
      const result = any([]);
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('EUNKNOWN');
    });
  });

  describe('format()', () => {
    it('should format success result', () => {
      expect(format(success('data'))).toBe('[OK]');
    });

    it('should format success with data', () => {
      const formatted = format(success({ id: 1 }), { includeData: true });
      expect(formatted).toContain('[OK]');
      expect(formatted).toContain('{"id":1}');
    });

    it('should format failure result', () => {
      const formatted = format(failure('ENOENT', 'File not found'));
      expect(formatted).toContain('[ENOENT]');
      expect(formatted).toContain('File not found');
      expect(formatted).toContain('Severity: high');
      expect(formatted).toContain('Category: filesystem');
    });

    it('should include suggested fix by default', () => {
      const formatted = format(failure('ENOENT'));
      expect(formatted).toContain('Fix:');
    });

    it('should exclude suggested fix when disabled', () => {
      const formatted = format(failure('ENOENT'), { includeSuggestion: false });
      expect(formatted).not.toContain('Fix:');
    });

    it('should indicate auto-fix availability', () => {
      const formatted = format(failure('ENOENT'));
      expect(formatted).toContain('Auto-fix available');
    });
  });

  describe('Severity and Category enums', () => {
    it('should export Severity enum', () => {
      expect(Severity.CRITICAL).toBe('critical');
      expect(Severity.HIGH).toBe('high');
      expect(Severity.MEDIUM).toBe('medium');
      expect(Severity.LOW).toBe('low');
    });

    it('should export Category enum', () => {
      expect(Category.FILESYSTEM).toBe('filesystem');
      expect(Category.PERMISSION).toBe('permission');
      expect(Category.CONFIGURATION).toBe('configuration');
      expect(Category.NETWORK).toBe('network');
      expect(Category.VALIDATION).toBe('validation');
      expect(Category.STATE).toBe('state');
      expect(Category.DEPENDENCY).toBe('dependency');
    });
  });
});
