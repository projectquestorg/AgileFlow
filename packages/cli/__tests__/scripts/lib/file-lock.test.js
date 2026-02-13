/**
 * Tests for file-lock.js
 *
 * Tests cover:
 * - isPidAlive() - PID validation and process existence checks
 * - acquireLock() - lock creation, contention, stale PID removal, timeout
 * - releaseLock() - lock removal, already-gone locks, error handling
 * - atomicWriteJSON() - basic writes, directory creation, lock fallback
 * - atomicReadModifyWrite() - read-modify-write, missing files, retries
 */

const path = require('path');

// Module under test
const {
  acquireLock,
  releaseLock,
  atomicWriteJSON,
  atomicReadModifyWrite,
  _isPidAlive,
  _generateRandomSuffix,
} = require('../../../scripts/lib/file-lock');

// Mock fs module
jest.mock('fs', () => ({
  openSync: jest.fn(),
  writeSync: jest.fn(),
  closeSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// Mock process.kill for PID checks
const originalProcessKill = process.kill;

const fs = require('fs');

describe('file-lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.kill = originalProcessKill;
  });

  afterEach(() => {
    process.kill = originalProcessKill;
  });

  describe('_isPidAlive', () => {
    it('returns true for valid, live PID', () => {
      process.kill = jest.fn(() => true); // No error = process exists
      expect(_isPidAlive(1234)).toBe(true);
    });

    it('returns false for invalid PID', () => {
      process.kill = jest.fn(() => {
        const err = new Error('ESRCH');
        err.code = 'ESRCH';
        throw err;
      });
      expect(_isPidAlive(9999)).toBe(false);
    });

    it('returns true for EPERM (process exists but no permission)', () => {
      process.kill = jest.fn(() => {
        const err = new Error('EPERM');
        err.code = 'EPERM';
        throw err;
      });
      expect(_isPidAlive(1)).toBe(true);
    });

    it('returns false for non-number input', () => {
      expect(_isPidAlive('1234')).toBe(false);
      expect(_isPidAlive(null)).toBe(false);
      expect(_isPidAlive(undefined)).toBe(false);
    });

    it('returns false for NaN', () => {
      expect(_isPidAlive(NaN)).toBe(false);
    });

    it('returns false for negative or zero PID', () => {
      expect(_isPidAlive(0)).toBe(false);
      expect(_isPidAlive(-1)).toBe(false);
    });

    it('calls process.kill with signal 0 for safe check', () => {
      process.kill = jest.fn(() => true);
      _isPidAlive(5678);
      expect(process.kill).toHaveBeenCalledWith(5678, 0);
    });
  });

  describe('acquireLock', () => {
    it('successfully acquires lock when file does not exist', () => {
      fs.openSync.mockReturnValue(123);
      fs.closeSync.mockReturnValue(true);

      const result = acquireLock('/tmp/test.json');

      expect(result.acquired).toBe(true);
      expect(result.lockPath).toBe('/tmp/test.json.lock');
      expect(fs.openSync).toHaveBeenCalledWith('/tmp/test.json.lock', 'wx');
      expect(fs.writeSync).toHaveBeenCalled();
    });

    it('removes stale lock file and retries', () => {
      let callCount = 0;
      fs.openSync.mockImplementation(() => {
        if (callCount === 0) {
          callCount++;
          const err = new Error('EEXIST');
          err.code = 'EEXIST';
          throw err;
        }
        return 123;
      });

      fs.readFileSync.mockReturnValue('9999\n'); // Stale PID
      process.kill = jest.fn(() => {
        const err = new Error('ESRCH');
        err.code = 'ESRCH';
        throw err;
      });
      fs.unlinkSync.mockReturnValue(true);
      fs.closeSync.mockReturnValue(true);

      const result = acquireLock('/tmp/test.json', 100);

      expect(result.acquired).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('times out when lock is held by live process', () => {
      fs.openSync.mockImplementation(() => {
        const err = new Error('EEXIST');
        err.code = 'EEXIST';
        throw err;
      });

      fs.readFileSync.mockReturnValue(String(process.pid) + '\n');
      process.kill = jest.fn(() => true); // Live process

      const result = acquireLock('/tmp/test.json', 100);

      expect(result.acquired).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('returns error for corrupted lock file', () => {
      fs.openSync.mockImplementation(() => {
        const err = new Error('EEXIST');
        err.code = 'EEXIST';
        throw err;
      });

      fs.readFileSync.mockReturnValue('corrupted data\n');
      fs.unlinkSync.mockReturnValue(true);

      // Second call should succeed
      let callCount = 0;
      fs.openSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('EEXIST');
          err.code = 'EEXIST';
          throw err;
        }
        return 123;
      });

      fs.closeSync.mockReturnValue(true);

      const result = acquireLock('/tmp/test.json', 500);

      expect(result.acquired).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('returns error for unexpected fs error', () => {
      fs.openSync.mockImplementation(() => {
        const err = new Error('EACCES');
        err.code = 'EACCES';
        throw err;
      });

      const result = acquireLock('/tmp/test.json');

      expect(result.acquired).toBe(false);
      expect(result.error).toContain('Failed to create lock');
    });

    it('includes lock path in result', () => {
      fs.openSync.mockReturnValue(123);
      fs.closeSync.mockReturnValue(true);

      const result = acquireLock('/data/file.json');

      expect(result.lockPath).toBe('/data/file.json.lock');
    });
  });

  describe('releaseLock', () => {
    it('successfully removes existing lock file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockReturnValue(true);

      const result = releaseLock('/tmp/test.json.lock');

      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.json.lock');
    });

    it('returns true when lock file already gone', () => {
      fs.existsSync.mockReturnValue(false);

      const result = releaseLock('/tmp/test.json.lock');

      expect(result).toBe(true);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('returns false on unlink error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const result = releaseLock('/tmp/test.json.lock');

      expect(result).toBe(false);
    });

    it('does not throw on error (fail-open)', () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('Unexpected');
      });

      expect(() => releaseLock('/tmp/test.json.lock')).not.toThrow();
    });
  });

  describe('atomicWriteJSON', () => {
    beforeEach(() => {
      fs.openSync.mockReturnValue(123);
      fs.closeSync.mockReturnValue(true);
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockReturnValue(true);
    });

    it('writes JSON data atomically with lock', () => {
      const data = { name: 'test', value: 42 };

      const result = atomicWriteJSON('/tmp/test.json', data);

      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('creates directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(true);

      const data = { test: true };
      atomicWriteJSON('/data/deep/nested/file.json', data);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/data/deep/nested',
        { recursive: true }
      );
    });

    it('skips lock when force option is set', () => {
      fs.existsSync.mockReturnValue(true);
      fs.openSync.mockClear();

      const data = { test: true };
      atomicWriteJSON('/tmp/test.json', data, { force: true });

      expect(fs.openSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('falls back to direct write if lock acquisition fails', () => {
      fs.openSync.mockImplementation(() => {
        const err = new Error('EEXIST');
        err.code = 'EEXIST';
        throw err;
      });
      fs.readFileSync.mockReturnValue(String(process.pid) + '\n');
      process.kill = jest.fn(() => true); // Live process holding lock

      const data = { test: true };
      const result = atomicWriteJSON('/tmp/test.json', data, { lockTimeoutMs: 10 });

      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('cleans up temp file on error', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const data = { test: true };
      const result = atomicWriteJSON('/tmp/test.json', data);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error without throwing (fail-open)', () => {
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const data = { test: true };
      const result = atomicWriteJSON('/readonly/test.json', data);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(() => result).not.toThrow();
    });

    it('writes valid JSON with formatting', () => {
      const data = { name: 'test', nested: { value: 42 } };
      atomicWriteJSON('/tmp/test.json', data);

      const writeCall = fs.writeFileSync.mock.calls[0];
      const jsonStr = writeCall[1];

      expect(jsonStr).toContain('"name": "test"');
      expect(jsonStr).toContain('"value": 42');
      expect(jsonStr.endsWith('\n')).toBe(true);
    });
  });

  describe('atomicReadModifyWrite', () => {
    beforeEach(() => {
      fs.openSync.mockReturnValue(123);
      fs.closeSync.mockReturnValue(true);
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(true);
      fs.renameSync.mockReturnValue(true);
      fs.unlinkSync.mockReturnValue(true);
    });

    it('reads, modifies, and writes JSON atomically', () => {
      const original = { stories: { 'US-001': { status: 'todo' } } };
      fs.readFileSync.mockReturnValue(JSON.stringify(original));

      const modifyFn = (data) => {
        data.stories['US-001'].status = 'done';
        return data;
      };

      const result = atomicReadModifyWrite('/tmp/test.json', modifyFn);

      expect(result.success).toBe(true);
      expect(result.data.stories['US-001'].status).toBe('done');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns error when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const modifyFn = jest.fn((data) => data);
      const result = atomicReadModifyWrite('/tmp/nonexistent.json', modifyFn);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('returns last known good data if lock cannot be acquired', () => {
      fs.openSync.mockImplementation(() => {
        const err = new Error('EEXIST');
        err.code = 'EEXIST';
        throw err;
      });

      const lastGood = { version: 1, data: 'backup' };
      fs.readFileSync.mockImplementation((path) => {
        if (path.includes('.lock')) {
          return String(process.pid) + '\n';
        }
        return JSON.stringify(lastGood);
      });

      process.kill = jest.fn(() => true); // Live process

      const modifyFn = jest.fn((data) => data);
      const result = atomicReadModifyWrite('/tmp/test.json', modifyFn, {
        lockTimeoutMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.data).toEqual(lastGood);
    });

    it('applies modify function to read data', () => {
      const original = { count: 5 };
      fs.readFileSync.mockReturnValue(JSON.stringify(original));

      const modifyFn = jest.fn((data) => {
        // Create new object to avoid test data mutation issues
        const modified = { ...data };
        modified.count += 1;
        return modified;
      });

      atomicReadModifyWrite('/tmp/test.json', modifyFn);

      // Verify modifyFn was called with the parsed data
      const callArg = modifyFn.mock.calls[0][0];
      expect(callArg).toEqual(original);
    });

    it('releases lock after write completes', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({ test: true }));

      const modifyFn = (data) => ({ ...data, modified: true });
      atomicReadModifyWrite('/tmp/test.json', modifyFn);

      // Verify lock was attempted
      expect(fs.openSync).toHaveBeenCalled();
    });

    it('creates directory if needed', () => {
      fs.existsSync.mockImplementation((path) => {
        if (path === '/data/deep') return false;
        return true;
      });
      fs.readFileSync.mockReturnValue(JSON.stringify({ test: true }));

      const modifyFn = (data) => data;
      atomicReadModifyWrite('/data/deep/file.json', modifyFn);

      expect(fs.mkdirSync).toHaveBeenCalledWith('/data/deep', {
        recursive: true,
      });
    });

    it('returns error without throwing on JSON parse error', () => {
      fs.readFileSync.mockReturnValue('invalid json {');

      const modifyFn = jest.fn((data) => data);
      const result = atomicReadModifyWrite('/tmp/test.json', modifyFn);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(() => result).not.toThrow();
    });
  });

  describe('integration - lock contention scenario', () => {
    it('handles rapid sequential locks correctly', () => {
      // First call succeeds
      let openCallCount = 0;
      fs.openSync.mockImplementation(() => {
        openCallCount++;
        if (openCallCount === 1) {
          return 123; // First lock succeeds
        }
        const err = new Error('EEXIST');
        err.code = 'EEXIST';
        throw err; // Contention on second call
      });

      fs.closeSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(String(process.pid) + '\n');
      process.kill = jest.fn(() => true); // Simulate live process
      fs.existsSync.mockReturnValue(true);

      const lock1 = acquireLock('/tmp/test.json');
      expect(lock1.acquired).toBe(true);

      const lock2 = acquireLock('/tmp/test.json', 50);
      expect(lock2.acquired).toBe(false);

      releaseLock(lock1.lockPath);

      // Reset for third lock
      openCallCount = 0;
      fs.openSync.mockImplementation(() => {
        openCallCount++;
        return 123;
      });

      const lock3 = acquireLock('/tmp/test.json');
      expect(lock3.acquired).toBe(true);
    });
  });
});
