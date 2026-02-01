/**
 * Tests for lock-file.js - Lock file operations for session management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parseLockContent,
  getLockPath,
  readLock,
  readLockAsync,
  writeLock,
  removeLock,
  isPidAlive,
  isSessionActive,
  isSessionActiveAsync,
} = require('../../lib/lock-file');

describe('lock-file', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-file-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('parseLockContent', () => {
    it('parses valid lock content', () => {
      const content = 'pid=12345\nstarted=1706825600\n';
      const result = parseLockContent(content);

      expect(result.pid).toBe('12345');
      expect(result.started).toBe('1706825600');
    });

    it('handles empty content', () => {
      const result = parseLockContent('');
      expect(result).toEqual({});
    });

    it('handles content with only newlines', () => {
      const result = parseLockContent('\n\n\n');
      expect(result).toEqual({});
    });

    it('handles malformed lines (no value)', () => {
      const content = 'pid=12345\nbroken\nstarted=1706825600\n';
      const result = parseLockContent(content);

      expect(result.pid).toBe('12345');
      expect(result.started).toBe('1706825600');
      expect(result.broken).toBeUndefined();
    });

    it('handles lines with extra equals signs', () => {
      const content = 'key=value=extra\n';
      const result = parseLockContent(content);
      // First split gives ['key', 'value=extra'], only first two are used
      expect(result.key).toBe('value');
    });

    it('trims whitespace from keys and values', () => {
      const content = '  pid  =  12345  \n  started  =  1706825600  \n';
      const result = parseLockContent(content);

      expect(result.pid).toBe('12345');
      expect(result.started).toBe('1706825600');
    });
  });

  describe('getLockPath', () => {
    it('returns correct lock file path', () => {
      const result = getLockPath('/sessions', '123');
      expect(result).toBe('/sessions/123.lock');
    });

    it('handles session IDs with special characters', () => {
      const result = getLockPath('/sessions', 'session-1');
      expect(result).toBe('/sessions/session-1.lock');
    });
  });

  describe('readLock', () => {
    it('returns null for missing lock file', () => {
      const result = readLock(testDir, 'nonexistent');
      expect(result).toBeNull();
    });

    it('reads and parses existing lock file', () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'pid=12345\nstarted=1706825600\n');

      const result = readLock(testDir, 'test');

      expect(result.pid).toBe('12345');
      expect(result.started).toBe('1706825600');
    });

    it('returns null on read error', () => {
      const lockPath = path.join(testDir, 'unreadable.lock');
      fs.writeFileSync(lockPath, 'content');
      fs.chmodSync(lockPath, 0o000);

      // Only test if we're not root (root can read anything)
      if (process.getuid && process.getuid() !== 0) {
        const result = readLock(testDir, 'unreadable');
        expect(result).toBeNull();
      }

      // Restore permissions for cleanup
      fs.chmodSync(lockPath, 0o644);
    });
  });

  describe('readLockAsync', () => {
    it('returns null for missing lock file', async () => {
      const result = await readLockAsync(testDir, 'nonexistent');
      expect(result).toBeNull();
    });

    it('reads and parses existing lock file', async () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'pid=12345\nstarted=1706825600\n');

      const result = await readLockAsync(testDir, 'test');

      expect(result.pid).toBe('12345');
      expect(result.started).toBe('1706825600');
    });

    it('returns null on read error', async () => {
      const lockPath = path.join(testDir, 'unreadable.lock');
      fs.writeFileSync(lockPath, 'content');
      fs.chmodSync(lockPath, 0o000);

      // Only test if we're not root
      if (process.getuid && process.getuid() !== 0) {
        const result = await readLockAsync(testDir, 'unreadable');
        expect(result).toBeNull();
      }

      // Restore permissions for cleanup
      fs.chmodSync(lockPath, 0o644);
    });
  });

  describe('writeLock', () => {
    it('creates lock file with correct format', () => {
      const beforeTime = Math.floor(Date.now() / 1000);
      writeLock(testDir, 'test', 12345);
      const afterTime = Math.floor(Date.now() / 1000);

      const lockPath = path.join(testDir, 'test.lock');
      expect(fs.existsSync(lockPath)).toBe(true);

      const content = fs.readFileSync(lockPath, 'utf8');
      const lines = content.split('\n');

      expect(lines[0]).toBe('pid=12345');
      // Check started timestamp is within range
      const startedMatch = lines[1].match(/^started=(\d+)$/);
      expect(startedMatch).not.toBeNull();
      const started = parseInt(startedMatch[1], 10);
      expect(started).toBeGreaterThanOrEqual(beforeTime);
      expect(started).toBeLessThanOrEqual(afterTime);
    });

    it('overwrites existing lock file', () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'old=content\n');

      writeLock(testDir, 'test', 99999);

      const content = fs.readFileSync(lockPath, 'utf8');
      expect(content).toContain('pid=99999');
      expect(content).not.toContain('old=content');
    });
  });

  describe('removeLock', () => {
    it('removes existing lock file', () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'pid=12345\n');
      expect(fs.existsSync(lockPath)).toBe(true);

      removeLock(testDir, 'test');

      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('handles missing lock file gracefully', () => {
      // Should not throw
      expect(() => removeLock(testDir, 'nonexistent')).not.toThrow();
    });
  });

  describe('isPidAlive', () => {
    it('returns true for current process', () => {
      expect(isPidAlive(process.pid)).toBe(true);
    });

    it('returns false for null/undefined pid', () => {
      expect(isPidAlive(null)).toBe(false);
      expect(isPidAlive(undefined)).toBe(false);
      expect(isPidAlive(0)).toBe(false);
    });

    it('returns false for very high (non-existent) pid', () => {
      // Use a very high PID that's unlikely to exist
      expect(isPidAlive(4000000)).toBe(false);
    });
  });

  describe('isSessionActive', () => {
    it('returns false for missing lock file', () => {
      const result = isSessionActive(testDir, 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false for lock without pid', () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'started=1706825600\n');

      const result = isSessionActive(testDir, 'test');
      expect(result).toBe(false);
    });

    it('returns true for lock with alive pid', () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, `pid=${process.pid}\nstarted=1706825600\n`);

      const result = isSessionActive(testDir, 'test');
      expect(result).toBe(true);
    });

    it('returns false for lock with dead pid', () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'pid=4000000\nstarted=1706825600\n');

      const result = isSessionActive(testDir, 'test');
      expect(result).toBe(false);
    });
  });

  describe('isSessionActiveAsync', () => {
    it('returns false for missing lock file', async () => {
      const result = await isSessionActiveAsync(testDir, 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false for lock without pid', async () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'started=1706825600\n');

      const result = await isSessionActiveAsync(testDir, 'test');
      expect(result).toBe(false);
    });

    it('returns true for lock with alive pid', async () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, `pid=${process.pid}\nstarted=1706825600\n`);

      const result = await isSessionActiveAsync(testDir, 'test');
      expect(result).toBe(true);
    });

    it('returns false for lock with dead pid', async () => {
      const lockPath = path.join(testDir, 'test.lock');
      fs.writeFileSync(lockPath, 'pid=4000000\nstarted=1706825600\n');

      const result = await isSessionActiveAsync(testDir, 'test');
      expect(result).toBe(false);
    });
  });
});
