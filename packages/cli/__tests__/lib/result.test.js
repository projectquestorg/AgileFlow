/**
 * result.test.js - Tests for unified Result schema
 */

const { ok, err, Result, AsyncResult } = require('../../lib/result');

describe('result module', () => {
  describe('ok()', () => {
    it('creates success result with no extras', () => {
      const result = ok();
      expect(result).toEqual({ ok: true });
    });

    it('creates success result with data', () => {
      const result = ok({ data: { name: 'test' } });
      expect(result).toEqual({ ok: true, data: { name: 'test' } });
    });

    it('creates success result with custom fields', () => {
      const result = ok({ path: '/file.json', created: true });
      expect(result).toEqual({ ok: true, path: '/file.json', created: true });
    });

    it('creates success result with found field', () => {
      const result = ok({ found: true, data: { id: 1 } });
      expect(result).toEqual({ ok: true, found: true, data: { id: 1 } });
    });
  });

  describe('err()', () => {
    it('creates error result from string', () => {
      const result = err('Not found');
      expect(result).toEqual({ ok: false, error: 'Not found' });
    });

    it('creates error result from Error object', () => {
      const result = err(new Error('Failed to connect'));
      expect(result).toEqual({ ok: false, error: 'Failed to connect' });
    });

    it('creates error result with custom fields', () => {
      const result = err('Invalid', { code: 'EINVAL' });
      expect(result).toEqual({ ok: false, error: 'Invalid', code: 'EINVAL' });
    });

    it('creates error result with found field', () => {
      const result = err('Session not found', { found: false });
      expect(result).toEqual({ ok: false, error: 'Session not found', found: false });
    });
  });

  describe('Result.isOk()', () => {
    it('returns true for success result', () => {
      expect(Result.isOk(ok())).toBe(true);
      expect(Result.isOk(ok({ data: 123 }))).toBe(true);
    });

    it('returns false for error result', () => {
      expect(Result.isOk(err('error'))).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(Result.isOk(null)).toBe(false);
      expect(Result.isOk(undefined)).toBe(false);
    });

    it('returns false for non-result objects', () => {
      expect(Result.isOk({})).toBe(false);
      expect(Result.isOk({ success: true })).toBe(false);
    });
  });

  describe('Result.isErr()', () => {
    it('returns true for error result', () => {
      expect(Result.isErr(err('error'))).toBe(true);
    });

    it('returns false for success result', () => {
      expect(Result.isErr(ok())).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(Result.isErr(null)).toBe(false);
      expect(Result.isErr(undefined)).toBe(false);
    });
  });

  describe('Result.unwrap()', () => {
    it('returns data from success result', () => {
      const result = ok({ data: { id: 1 } });
      expect(Result.unwrap(result)).toEqual({ id: 1 });
    });

    it('returns result without ok field when no data field', () => {
      const result = ok({ path: '/file.json' });
      expect(Result.unwrap(result)).toEqual({ ok: true, path: '/file.json' });
    });

    it('throws on error result', () => {
      const result = err('Something went wrong');
      expect(() => Result.unwrap(result)).toThrow('Something went wrong');
    });

    it('throws with context prefix', () => {
      const result = err('File not found');
      expect(() => Result.unwrap(result, 'Loading config')).toThrow(
        'Loading config: File not found'
      );
    });
  });

  describe('Result.unwrapOr()', () => {
    it('returns data from success result', () => {
      const result = ok({ data: 42 });
      expect(Result.unwrapOr(result, 0)).toBe(42);
    });

    it('returns default value on error result', () => {
      const result = err('error');
      expect(Result.unwrapOr(result, 'default')).toBe('default');
    });

    it('returns default value on null result', () => {
      expect(Result.unwrapOr(null, 'default')).toBe('default');
    });
  });

  describe('Result.map()', () => {
    it('applies function to successful result', () => {
      const result = ok({ data: 5 });
      const mapped = Result.map(result, x => x * 2);
      expect(mapped).toEqual({ ok: true, data: 10 });
    });

    it('passes through error result unchanged', () => {
      const result = err('error');
      const mapped = Result.map(result, x => x * 2);
      expect(mapped).toEqual({ ok: false, error: 'error' });
    });

    it('catches errors in map function', () => {
      const result = ok({ data: 'test' });
      const mapped = Result.map(result, () => {
        throw new Error('map failed');
      });
      expect(Result.isErr(mapped)).toBe(true);
      expect(mapped.error).toBe('map failed');
    });
  });

  describe('Result.fromLegacy()', () => {
    it('converts success: true to ok: true', () => {
      const legacy = { success: true, data: 'test' };
      const result = Result.fromLegacy(legacy);
      expect(result).toEqual({ ok: true, data: 'test' });
    });

    it('converts success: false to ok: false', () => {
      const legacy = { success: false, error: 'failed' };
      const result = Result.fromLegacy(legacy);
      expect(result).toEqual({ ok: false, error: 'failed' });
    });

    it('passes through standard results unchanged', () => {
      const standard = { ok: true, data: 'test' };
      const result = Result.fromLegacy(standard);
      expect(result).toEqual({ ok: true, data: 'test' });
    });

    it('preserves extra fields', () => {
      const legacy = { success: true, merges: [], count: 5 };
      const result = Result.fromLegacy(legacy);
      expect(result).toEqual({ ok: true, merges: [], count: 5 });
    });
  });

  describe('Result.toLegacy()', () => {
    it('converts ok: true to success: true', () => {
      const standard = ok({ data: 'test' });
      const legacy = Result.toLegacy(standard);
      expect(legacy).toEqual({ success: true, data: 'test' });
    });

    it('converts ok: false to success: false', () => {
      const standard = err('failed');
      const legacy = Result.toLegacy(standard);
      expect(legacy).toEqual({ success: false, error: 'failed' });
    });

    it('preserves extra fields', () => {
      const standard = ok({ found: true, data: { id: 1 } });
      const legacy = Result.toLegacy(standard);
      expect(legacy).toEqual({ success: true, found: true, data: { id: 1 } });
    });
  });

  describe('AsyncResult.wrap()', () => {
    it('wraps successful async function', async () => {
      const asyncFn = async x => x * 2;
      const wrapped = AsyncResult.wrap(asyncFn);
      const result = await wrapped(5);
      expect(result).toEqual({ ok: true, data: 10 });
    });

    it('wraps failing async function', async () => {
      const asyncFn = async () => {
        throw new Error('Async failure');
      };
      const wrapped = AsyncResult.wrap(asyncFn);
      const result = await wrapped();
      expect(Result.isErr(result)).toBe(true);
      expect(result.error).toBe('Async failure');
    });

    it('preserves function arguments', async () => {
      const asyncFn = async (a, b, c) => a + b + c;
      const wrapped = AsyncResult.wrap(asyncFn);
      const result = await wrapped(1, 2, 3);
      expect(result).toEqual({ ok: true, data: 6 });
    });
  });

  describe('AsyncResult.all()', () => {
    it('collects all successful results', async () => {
      const promises = [Promise.resolve(ok({ data: 1 })), Promise.resolve(ok({ data: 2 }))];
      const result = await AsyncResult.all(promises);
      expect(Result.isOk(result)).toBe(true);
      expect(result.data).toEqual([
        { ok: true, data: 1 },
        { ok: true, data: 2 },
      ]);
    });

    it('reports errors with partial results', async () => {
      const promises = [Promise.resolve(ok({ data: 1 })), Promise.resolve(err('failed'))];
      const result = await AsyncResult.all(promises);
      expect(Result.isErr(result)).toBe(true);
      expect(result.error).toBe('failed');
      expect(result.partial).toHaveLength(2);
    });

    it('handles Promise.all rejection', async () => {
      const promises = [Promise.reject(new Error('rejected'))];
      const result = await AsyncResult.all(promises);
      expect(Result.isErr(result)).toBe(true);
      expect(result.error).toBe('rejected');
    });
  });
});
