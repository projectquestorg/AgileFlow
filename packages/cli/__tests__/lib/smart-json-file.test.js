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
});
