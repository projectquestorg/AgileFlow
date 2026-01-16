/**
 * Tests for SmartJsonFile class
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const SmartJsonFile = require('../../lib/smart-json-file');

describe('SmartJsonFile', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-json-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('requires an absolute path', () => {
      expect(() => new SmartJsonFile('relative/path.json')).toThrow('absolute path');
    });

    it('requires a string path', () => {
      expect(() => new SmartJsonFile(null)).toThrow('required');
      expect(() => new SmartJsonFile(123)).toThrow('required');
    });

    it('accepts valid options', () => {
      const filePath = path.join(testDir, 'test.json');
      const file = new SmartJsonFile(filePath, {
        retries: 5,
        backoff: 200,
        createDir: false,
        spaces: 4,
      });
      expect(file.retries).toBe(5);
      expect(file.backoff).toBe(200);
      expect(file.createDir).toBe(false);
      expect(file.spaces).toBe(4);
    });
  });

  describe('read', () => {
    it('reads JSON file successfully', async () => {
      const filePath = path.join(testDir, 'test.json');
      const data = { name: 'test', value: 42 };
      fs.writeFileSync(filePath, JSON.stringify(data));

      const file = new SmartJsonFile(filePath);
      const result = await file.read();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('returns error for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.json');
      const file = new SmartJsonFile(filePath);
      const result = await file.read();

      expect(result.ok).toBe(false);
      expect(result.error.errorCode).toBe('ENOENT');
    });

    it('returns default value for non-existent file when provided', async () => {
      const filePath = path.join(testDir, 'nonexistent.json');
      const defaultValue = { default: true };
      const file = new SmartJsonFile(filePath, { defaultValue });
      const result = await file.read();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(defaultValue);
    });

    it('returns error for invalid JSON', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not valid json');

      const file = new SmartJsonFile(filePath);
      const result = await file.read();

      expect(result.ok).toBe(false);
      expect(result.error.errorCode).toBe('EPARSE');
    });
  });

  describe('write', () => {
    it('writes JSON file successfully', async () => {
      const filePath = path.join(testDir, 'output.json');
      const data = { name: 'test', value: 42 };
      const file = new SmartJsonFile(filePath);

      const result = await file.write(data);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(data);
    });

    it('creates parent directories if needed', async () => {
      const filePath = path.join(testDir, 'nested', 'deep', 'output.json');
      const data = { nested: true };
      const file = new SmartJsonFile(filePath, { createDir: true });

      const result = await file.write(data);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('performs atomic write', async () => {
      const filePath = path.join(testDir, 'atomic.json');
      const data = { atomic: true };
      const file = new SmartJsonFile(filePath);

      await file.write(data);

      // Check no temp files remain
      const files = fs.readdirSync(testDir);
      expect(files.filter(f => f.includes('.tmp'))).toHaveLength(0);
    });
  });

  describe('modify', () => {
    it('reads, modifies, and writes atomically', async () => {
      const filePath = path.join(testDir, 'modify.json');
      const initial = { count: 0 };
      fs.writeFileSync(filePath, JSON.stringify(initial));

      const file = new SmartJsonFile(filePath);
      const result = await file.modify(data => ({ count: data.count + 1 }));

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ count: 1 });
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({ count: 1 });
    });

    it('uses default value when file does not exist', async () => {
      const filePath = path.join(testDir, 'new-modify.json');
      const file = new SmartJsonFile(filePath, { defaultValue: { count: 0 } });

      const result = await file.modify(data => ({ count: data.count + 1 }));

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ count: 1 });
    });

    it('returns error if modifier throws', async () => {
      const filePath = path.join(testDir, 'error-modify.json');
      fs.writeFileSync(filePath, JSON.stringify({ test: true }));

      const file = new SmartJsonFile(filePath);
      const result = await file.modify(() => {
        throw new Error('Modifier failed');
      });

      expect(result.ok).toBe(false);
      expect(result.error.errorCode).toBe('EINVAL');
    });
  });

  describe('exists', () => {
    it('returns true if file exists', () => {
      const filePath = path.join(testDir, 'exists.json');
      fs.writeFileSync(filePath, '{}');

      const file = new SmartJsonFile(filePath);
      expect(file.exists()).toBe(true);
    });

    it('returns false if file does not exist', () => {
      const filePath = path.join(testDir, 'nonexistent.json');
      const file = new SmartJsonFile(filePath);
      expect(file.exists()).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes existing file', async () => {
      const filePath = path.join(testDir, 'delete.json');
      fs.writeFileSync(filePath, '{}');

      const file = new SmartJsonFile(filePath);
      const result = await file.delete();

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('succeeds for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.json');
      const file = new SmartJsonFile(filePath);
      const result = await file.delete();

      expect(result.ok).toBe(true);
    });
  });

  describe('sync methods', () => {
    it('readSync reads file synchronously', () => {
      const filePath = path.join(testDir, 'sync-read.json');
      const data = { sync: true };
      fs.writeFileSync(filePath, JSON.stringify(data));

      const file = new SmartJsonFile(filePath);
      const result = file.readSync();

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('writeSync writes file synchronously', () => {
      const filePath = path.join(testDir, 'sync-write.json');
      const data = { sync: true };
      const file = new SmartJsonFile(filePath);

      const result = file.writeSync(data);

      expect(result.ok).toBe(true);
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(data);
    });
  });

  describe('schema validation', () => {
    const schema = data => {
      if (!data.required) {
        throw new Error('Missing required field');
      }
    };

    it('validates on read', async () => {
      const filePath = path.join(testDir, 'schema.json');
      fs.writeFileSync(filePath, JSON.stringify({ other: true }));

      const file = new SmartJsonFile(filePath, { schema });
      const result = await file.read();

      expect(result.ok).toBe(false);
      expect(result.error.errorCode).toBe('ESCHEMA');
    });

    it('validates on write', async () => {
      const filePath = path.join(testDir, 'schema-write.json');
      const file = new SmartJsonFile(filePath, { schema });

      const result = await file.write({ other: true });

      expect(result.ok).toBe(false);
      expect(result.error.errorCode).toBe('ESCHEMA');
    });

    it('passes valid data', async () => {
      const filePath = path.join(testDir, 'schema-valid.json');
      const file = new SmartJsonFile(filePath, { schema });

      const result = await file.write({ required: true });

      expect(result.ok).toBe(true);
    });
  });

  describe('error codes', () => {
    it('attaches ENOENT for missing files', async () => {
      const filePath = path.join(testDir, 'missing.json');
      const file = new SmartJsonFile(filePath);
      const result = await file.read();

      expect(result.error.errorCode).toBe('ENOENT');
      expect(result.error.severity).toBe('high');
      expect(result.error.category).toBe('filesystem');
      expect(result.error.recoverable).toBe(true);
    });

    it('attaches EPARSE for invalid JSON', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not json');

      const file = new SmartJsonFile(filePath);
      const result = await file.read();

      expect(result.error.errorCode).toBe('EPARSE');
      expect(result.error.severity).toBe('high');
      expect(result.error.category).toBe('configuration');
    });
  });

  describe('secure permissions', () => {
    // Skip permission tests on Windows
    const isWindows = process.platform === 'win32';

    describe('secureMode option', () => {
      (isWindows ? it.skip : it)('sets 0o600 permissions on write when enabled', async () => {
        const filePath = path.join(testDir, 'secure.json');
        const file = new SmartJsonFile(filePath, { secureMode: true });

        const result = await file.write({ secure: true });

        expect(result.ok).toBe(true);
        const stats = fs.statSync(filePath);
        const perms = stats.mode & 0o777;
        expect(perms).toBe(0o600);
      });

      (isWindows ? it.skip : it)('sets 0o600 permissions on writeSync when enabled', () => {
        const filePath = path.join(testDir, 'secure-sync.json');
        const file = new SmartJsonFile(filePath, { secureMode: true });

        const result = file.writeSync({ secure: true });

        expect(result.ok).toBe(true);
        const stats = fs.statSync(filePath);
        const perms = stats.mode & 0o777;
        expect(perms).toBe(0o600);
      });

      it('does not change permissions when secureMode is false', async () => {
        const filePath = path.join(testDir, 'insecure.json');
        const file = new SmartJsonFile(filePath, { secureMode: false });

        const result = await file.write({ secure: false });

        expect(result.ok).toBe(true);
        // Should use default permissions (not 0o600)
        const stats = fs.statSync(filePath);
        const perms = stats.mode & 0o777;
        expect(perms).not.toBe(0o600);
      });
    });

    describe('warnInsecure option', () => {
      (isWindows ? it.skip : it)('warns on read when file has insecure permissions', async () => {
        const filePath = path.join(testDir, 'world-readable.json');
        fs.writeFileSync(filePath, JSON.stringify({ test: true }));
        fs.chmodSync(filePath, 0o644); // World-readable

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const file = new SmartJsonFile(filePath, { warnInsecure: true });

        const result = await file.read();

        expect(result.ok).toBe(true);
        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy.mock.calls[0][0]).toContain('Security Warning');

        consoleSpy.mockRestore();
      });

      (isWindows ? it.skip : it)('does not warn when file has secure permissions', async () => {
        const filePath = path.join(testDir, 'secure-read.json');
        fs.writeFileSync(filePath, JSON.stringify({ test: true }));
        fs.chmodSync(filePath, 0o600); // Owner only

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const file = new SmartJsonFile(filePath, { warnInsecure: true });

        const result = await file.read();

        expect(result.ok).toBe(true);
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('does not warn when warnInsecure is false', async () => {
        const filePath = path.join(testDir, 'no-warn.json');
        fs.writeFileSync(filePath, JSON.stringify({ test: true }));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const file = new SmartJsonFile(filePath, { warnInsecure: false });

        const result = await file.read();

        expect(result.ok).toBe(true);
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe('checkFilePermissions helper', () => {
      const { checkFilePermissions } = SmartJsonFile;

      (isWindows ? it.skip : it)('returns ok for 0o600', () => {
        const result = checkFilePermissions(0o100600); // mode with file type bits
        expect(result.ok).toBe(true);
      });

      (isWindows ? it.skip : it)('returns warning for world-writable', () => {
        const result = checkFilePermissions(0o100666); // World readable/writable
        expect(result.ok).toBe(false);
        expect(result.warning).toContain('world-');
      });

      (isWindows ? it.skip : it)('returns warning for group-readable', () => {
        const result = checkFilePermissions(0o100640); // Group readable
        expect(result.ok).toBe(false);
        expect(result.warning).toContain('group-readable');
      });

      (isWindows ? it.skip : it)('returns warning for world-readable', () => {
        const result = checkFilePermissions(0o100644); // World readable
        expect(result.ok).toBe(false);
        expect(result.warning).toContain('world-readable');
      });
    });

    describe('setSecurePermissions helper', () => {
      const { setSecurePermissions } = SmartJsonFile;

      (isWindows ? it.skip : it)('sets file to 0o600', () => {
        const filePath = path.join(testDir, 'chmod-test.json');
        fs.writeFileSync(filePath, '{}');
        fs.chmodSync(filePath, 0o644);

        const result = setSecurePermissions(filePath);

        expect(result.ok).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.mode & 0o777).toBe(0o600);
      });

      (isWindows ? it.skip : it)('returns error for non-existent file', () => {
        const result = setSecurePermissions(path.join(testDir, 'nonexistent'));
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('temp file cleanup', () => {
    const { cleanupTempFiles, cleanupTempFilesFor, DEFAULT_TEMP_MAX_AGE_MS } = SmartJsonFile;

    it('exports DEFAULT_TEMP_MAX_AGE_MS as 24 hours', () => {
      expect(DEFAULT_TEMP_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('does not delete non-temp files', () => {
      const normalFile = path.join(testDir, 'normal.json');
      const anotherFile = path.join(testDir, 'data.json');
      fs.writeFileSync(normalFile, '{}');
      fs.writeFileSync(anotherFile, '{}');

      const result = cleanupTempFiles(testDir, { maxAgeMs: 0 });

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(0);
      expect(fs.existsSync(normalFile)).toBe(true);
      expect(fs.existsSync(anotherFile)).toBe(true);
    });

    it('deletes temp files matching pattern', () => {
      // Create temp file with correct pattern
      const tempFile = path.join(testDir, '.test.1700000000000.abc123.json.tmp');
      fs.writeFileSync(tempFile, '{}');

      // Set modification time to old
      const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      fs.utimesSync(tempFile, new Date(oldTime), new Date(oldTime));

      const result = cleanupTempFiles(testDir, { maxAgeMs: 24 * 60 * 60 * 1000 });

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(1);
      expect(fs.existsSync(tempFile)).toBe(false);
    });

    it('does not delete recent temp files', () => {
      // Create recent temp file
      const tempFile = path.join(testDir, '.test.1700000000000.abc123.json.tmp');
      fs.writeFileSync(tempFile, '{}');
      // Recent file - mtime is now

      const result = cleanupTempFiles(testDir, { maxAgeMs: 24 * 60 * 60 * 1000 });

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(0);
      expect(fs.existsSync(tempFile)).toBe(true);
    });

    it('supports dryRun option', () => {
      const tempFile = path.join(testDir, '.test.1700000000000.abc123.json.tmp');
      fs.writeFileSync(tempFile, '{}');

      // Set old mtime
      const oldTime = Date.now() - 25 * 60 * 60 * 1000;
      fs.utimesSync(tempFile, new Date(oldTime), new Date(oldTime));

      const result = cleanupTempFiles(testDir, { maxAgeMs: 24 * 60 * 60 * 1000, dryRun: true });

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(1);
      expect(fs.existsSync(tempFile)).toBe(true); // Still exists due to dryRun
    });

    it('handles non-existent directory', () => {
      const result = cleanupTempFiles('/nonexistent/path');

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(0);
    });

    it('cleanupTempFilesFor cleans directory of file', () => {
      const jsonFile = path.join(testDir, 'data.json');
      const tempFile = path.join(testDir, '.data.1700000000000.abc123.json.tmp');

      fs.writeFileSync(jsonFile, '{}');
      fs.writeFileSync(tempFile, '{}');

      // Set old mtime
      const oldTime = Date.now() - 25 * 60 * 60 * 1000;
      fs.utimesSync(tempFile, new Date(oldTime), new Date(oldTime));

      const result = cleanupTempFilesFor(jsonFile, { maxAgeMs: 24 * 60 * 60 * 1000 });

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(1);
      expect(fs.existsSync(jsonFile)).toBe(true); // Original preserved
      expect(fs.existsSync(tempFile)).toBe(false); // Temp deleted
    });

    it('cleans multiple old temp files', () => {
      const temps = [
        '.a.1700000000000.abc123.json.tmp',
        '.b.1700000000001.def456.json.tmp',
        '.c.1700000000002.ghi789.json.tmp',
      ];

      const oldTime = Date.now() - 25 * 60 * 60 * 1000;

      for (const temp of temps) {
        const tempPath = path.join(testDir, temp);
        fs.writeFileSync(tempPath, '{}');
        fs.utimesSync(tempPath, new Date(oldTime), new Date(oldTime));
      }

      const result = cleanupTempFiles(testDir);

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(3);
    });

    it('does not match similar but invalid patterns', () => {
      const invalidPatterns = [
        'test.json.tmp', // Missing dot prefix
        '.test.json.tmp', // Missing timestamp
        '.test.1234.json.tmp', // Missing random suffix
        '.test.abc.def.json.tmp', // Non-numeric timestamp
      ];

      for (const pattern of invalidPatterns) {
        const filePath = path.join(testDir, pattern);
        fs.writeFileSync(filePath, '{}');
      }

      const result = cleanupTempFiles(testDir, { maxAgeMs: 0 });

      expect(result.ok).toBe(true);
      expect(result.cleaned.length).toBe(0); // None should be deleted
    });

    it('reports errors for files that cannot be deleted', () => {
      // This test is platform-dependent and may skip on Windows
      if (process.platform === 'win32') {
        return;
      }

      const subDir = path.join(testDir, 'locked');
      fs.mkdirSync(subDir);

      const tempFile = path.join(subDir, '.test.1700000000000.abc123.json.tmp');
      fs.writeFileSync(tempFile, '{}');

      // Make old
      const oldTime = Date.now() - 25 * 60 * 60 * 1000;
      fs.utimesSync(tempFile, new Date(oldTime), new Date(oldTime));

      // Make directory read-only (can't delete files inside)
      fs.chmodSync(subDir, 0o555);

      try {
        const result = cleanupTempFiles(subDir);

        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(subDir, 0o755);
      }
    });
  });
});
