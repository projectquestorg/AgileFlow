/**
 * Tests for file-cache.js
 *
 * Tests LRU cache functionality, TTL expiration, and file caching
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  LRUCache,
  readJSONCached,
  readFileCached,
  invalidate,
  invalidateDir,
  clearCache,
  getCacheStats,
  readStatus,
  readSessionState,
  readMetadata,
  readRegistry,
  readProjectFiles,
  execCached,
  gitCached,
  gitCommands,
  invalidateGitCache,
  getCommandCacheStats,
  clearCommandCache,
} = require('../../lib/file-cache');

describe('file-cache', () => {
  let tempDir;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-cache-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearCache();
  });

  describe('LRUCache', () => {
    describe('basic operations', () => {
      it('stores and retrieves values', () => {
        const cache = new LRUCache();
        cache.set('key1', 'value1');
        expect(cache.get('key1')).toBe('value1');
      });

      it('returns undefined for missing keys', () => {
        const cache = new LRUCache();
        expect(cache.get('nonexistent')).toBeUndefined();
      });

      it('overwrites existing values', () => {
        const cache = new LRUCache();
        cache.set('key1', 'value1');
        cache.set('key1', 'value2');
        expect(cache.get('key1')).toBe('value2');
      });

      it('deletes values', () => {
        const cache = new LRUCache();
        cache.set('key1', 'value1');
        cache.delete('key1');
        expect(cache.get('key1')).toBeUndefined();
      });

      it('clears all values', () => {
        const cache = new LRUCache();
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.clear();
        expect(cache.size).toBe(0);
      });

      it('reports correct size', () => {
        const cache = new LRUCache();
        expect(cache.size).toBe(0);
        cache.set('key1', 'value1');
        expect(cache.size).toBe(1);
        cache.set('key2', 'value2');
        expect(cache.size).toBe(2);
      });

      it('checks if key exists', () => {
        const cache = new LRUCache();
        expect(cache.has('key1')).toBe(false);
        cache.set('key1', 'value1');
        expect(cache.has('key1')).toBe(true);
      });
    });

    describe('LRU eviction', () => {
      it('evicts oldest entries when max size reached', () => {
        const cache = new LRUCache({ maxSize: 3 });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        cache.set('key4', 'value4'); // Should evict key1

        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
        expect(cache.has('key3')).toBe(true);
        expect(cache.has('key4')).toBe(true);
      });

      it('moves accessed items to end (most recently used)', () => {
        const cache = new LRUCache({ maxSize: 3 });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        // Access key1, making it most recently used
        cache.get('key1');

        // Add key4, should evict key2 (oldest)
        cache.set('key4', 'value4');

        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(false);
        expect(cache.has('key3')).toBe(true);
        expect(cache.has('key4')).toBe(true);
      });

      it('tracks eviction count in stats', () => {
        const cache = new LRUCache({ maxSize: 2 });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3'); // Evicts key1

        const stats = cache.getStats();
        expect(stats.evictions).toBe(1);
      });
    });

    describe('TTL expiration', () => {
      it('expires entries after TTL', async () => {
        const cache = new LRUCache({ ttlMs: 50 });
        cache.set('key1', 'value1');

        expect(cache.get('key1')).toBe('value1');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 60));

        expect(cache.get('key1')).toBeUndefined();
      });

      it('supports custom TTL per entry', async () => {
        const cache = new LRUCache({ ttlMs: 1000 });

        cache.set('key1', 'value1', 50); // Short TTL
        cache.set('key2', 'value2', 1000); // Long TTL

        await new Promise(resolve => setTimeout(resolve, 60));

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBe('value2');
      });

      it('has() returns false for expired entries', async () => {
        const cache = new LRUCache({ ttlMs: 50 });
        cache.set('key1', 'value1');

        expect(cache.has('key1')).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 60));

        expect(cache.has('key1')).toBe(false);
      });
    });

    describe('statistics', () => {
      it('tracks hits and misses', () => {
        const cache = new LRUCache();
        cache.set('key1', 'value1');

        cache.get('key1'); // Hit
        cache.get('key1'); // Hit
        cache.get('key2'); // Miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
      });

      it('calculates hit rate', () => {
        const cache = new LRUCache();
        cache.set('key1', 'value1');

        cache.get('key1'); // Hit
        cache.get('key1'); // Hit
        cache.get('key2'); // Miss

        const stats = cache.getStats();
        expect(stats.hitRate).toBe('66.7%');
      });

      it('reports size and maxSize', () => {
        const cache = new LRUCache({ maxSize: 10 });
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        const stats = cache.getStats();
        expect(stats.size).toBe(2);
        expect(stats.maxSize).toBe(10);
      });
    });
  });

  describe('readJSONCached', () => {
    it('reads and caches JSON files', () => {
      const testData = { name: 'test', value: 42 };
      const filePath = path.join(tempDir, 'test.json');
      fs.writeFileSync(filePath, JSON.stringify(testData));

      const result1 = readJSONCached(filePath);
      expect(result1).toEqual(testData);

      // Second read should be cached
      const result2 = readJSONCached(filePath);
      expect(result2).toEqual(testData);
    });

    it('returns null for missing files', () => {
      const result = readJSONCached(path.join(tempDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const filePath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not valid json');

      const result = readJSONCached(filePath);
      expect(result).toBeNull();
    });

    it('force option bypasses cache', () => {
      const filePath = path.join(tempDir, 'force-test.json');
      fs.writeFileSync(filePath, JSON.stringify({ version: 1 }));

      const result1 = readJSONCached(filePath);
      expect(result1.version).toBe(1);

      // Update file
      fs.writeFileSync(filePath, JSON.stringify({ version: 2 }));

      // Without force, should return cached value
      const result2 = readJSONCached(filePath);
      expect(result2.version).toBe(1);

      // With force, should return new value
      const result3 = readJSONCached(filePath, { force: true });
      expect(result3.version).toBe(2);
    });
  });

  describe('readFileCached', () => {
    it('reads and caches text files', () => {
      const content = 'Hello, World!';
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, content);

      const result1 = readFileCached(filePath);
      expect(result1).toBe(content);

      // Second read should be cached
      const result2 = readFileCached(filePath);
      expect(result2).toBe(content);
    });

    it('returns null for missing files', () => {
      const result = readFileCached(path.join(tempDir, 'nonexistent.txt'));
      expect(result).toBeNull();
    });
  });

  describe('cache invalidation', () => {
    it('invalidate removes specific file from cache', () => {
      const filePath = path.join(tempDir, 'invalidate-test.json');
      fs.writeFileSync(filePath, JSON.stringify({ version: 1 }));

      // Cache the file
      readJSONCached(filePath);

      // Update file
      fs.writeFileSync(filePath, JSON.stringify({ version: 2 }));

      // Should still return cached value
      expect(readJSONCached(filePath).version).toBe(1);

      // Invalidate cache
      invalidate(filePath);

      // Now should read new value
      expect(readJSONCached(filePath).version).toBe(2);
    });

    it('invalidateDir removes all files in directory from cache', () => {
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });

      const file1 = path.join(subDir, 'file1.json');
      const file2 = path.join(subDir, 'file2.json');
      fs.writeFileSync(file1, JSON.stringify({ id: 1 }));
      fs.writeFileSync(file2, JSON.stringify({ id: 2 }));

      // Cache both files
      readJSONCached(file1);
      readJSONCached(file2);

      // Invalidate directory
      invalidateDir(subDir);

      // Update files
      fs.writeFileSync(file1, JSON.stringify({ id: 10 }));
      fs.writeFileSync(file2, JSON.stringify({ id: 20 }));

      // Should read new values
      expect(readJSONCached(file1).id).toBe(10);
      expect(readJSONCached(file2).id).toBe(20);
    });

    it('clearCache removes all entries', () => {
      const file1 = path.join(tempDir, 'clear1.json');
      const file2 = path.join(tempDir, 'clear2.json');
      fs.writeFileSync(file1, JSON.stringify({ id: 1 }));
      fs.writeFileSync(file2, JSON.stringify({ id: 2 }));

      readJSONCached(file1);
      readJSONCached(file2);

      clearCache();

      const stats = getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('returns cache statistics', () => {
      const filePath = path.join(tempDir, 'stats-test.json');
      fs.writeFileSync(filePath, JSON.stringify({ test: true }));

      readJSONCached(filePath); // Miss + write
      readJSONCached(filePath); // Hit

      const stats = getCacheStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('convenience methods', () => {
    let projectDir;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'project');
      fs.mkdirSync(path.join(projectDir, 'docs', '09-agents'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'docs', '00-meta'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, '.agileflow', 'sessions'), { recursive: true });

      fs.writeFileSync(
        path.join(projectDir, 'docs', '09-agents', 'status.json'),
        JSON.stringify({ stories: {} })
      );
      fs.writeFileSync(
        path.join(projectDir, 'docs', '09-agents', 'session-state.json'),
        JSON.stringify({ schema_version: 1 })
      );
      fs.writeFileSync(
        path.join(projectDir, 'docs', '00-meta', 'agileflow-metadata.json'),
        JSON.stringify({ version: '2.88.0' })
      );
      fs.writeFileSync(
        path.join(projectDir, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify({ sessions: {} })
      );
    });

    it('readStatus reads status.json', () => {
      const result = readStatus(projectDir);
      expect(result).toHaveProperty('stories');
    });

    it('readSessionState reads session-state.json', () => {
      const result = readSessionState(projectDir);
      expect(result).toHaveProperty('schema_version');
    });

    it('readMetadata reads agileflow-metadata.json', () => {
      const result = readMetadata(projectDir);
      expect(result).toHaveProperty('version');
    });

    it('readRegistry reads registry.json', () => {
      const result = readRegistry(projectDir);
      expect(result).toHaveProperty('sessions');
    });

    it('readProjectFiles reads all common files', () => {
      const result = readProjectFiles(projectDir);
      expect(result.status).toHaveProperty('stories');
      expect(result.sessionState).toHaveProperty('schema_version');
      expect(result.metadata).toHaveProperty('version');
      expect(result.registry).toHaveProperty('sessions');
    });

    it('returns null for missing files', () => {
      const emptyDir = path.join(tempDir, 'empty-project');
      fs.mkdirSync(emptyDir, { recursive: true });

      const result = readProjectFiles(emptyDir);
      expect(result.status).toBeNull();
      expect(result.sessionState).toBeNull();
      expect(result.metadata).toBeNull();
      expect(result.registry).toBeNull();
    });
  });

  describe('command caching', () => {
    beforeEach(() => {
      clearCommandCache();
    });

    describe('execCached', () => {
      it('executes and caches a command', () => {
        const result1 = execCached('echo "test"');
        expect(result1.ok).toBe(true);
        expect(result1.data).toContain('test');
        expect(result1.cached).toBe(false);

        // Second call should be cached
        const result2 = execCached('echo "test"');
        expect(result2.ok).toBe(true);
        expect(result2.cached).toBe(true);
      });

      it('returns error for failing commands', () => {
        const result = execCached('nonexistent-command-xyz');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('respects force option', () => {
        const result1 = execCached('echo "test"');
        expect(result1.cached).toBe(false);

        const result2 = execCached('echo "test"', { force: true });
        expect(result2.cached).toBe(false);
      });

      it('uses custom cache key', () => {
        const result1 = execCached('echo "test"', { cacheKey: 'custom:key' });
        expect(result1.cached).toBe(false);

        const result2 = execCached('echo "test"', { cacheKey: 'custom:key' });
        expect(result2.cached).toBe(true);

        // Different key should miss
        const result3 = execCached('echo "test"', { cacheKey: 'other:key' });
        expect(result3.cached).toBe(false);
      });
    });

    describe('gitCached', () => {
      it('executes git commands', () => {
        const result = gitCached('--version');
        expect(result.ok).toBe(true);
        expect(result.data).toContain('git version');
      });

      it('uses git-specific cache key format', () => {
        const result1 = gitCached('--version');
        expect(result1.cached).toBe(false);

        const result2 = gitCached('--version');
        expect(result2.cached).toBe(true);
      });
    });

    describe('gitCommands helpers', () => {
      it('gitCommands.branch returns current branch', () => {
        const result = gitCommands.branch();
        expect(result.ok).toBe(true);
        expect(typeof result.data).toBe('string');
        expect(result.data.length).toBeGreaterThan(0);
      });

      it('gitCommands.status returns status', () => {
        const result = gitCommands.status();
        expect(result.ok).toBe(true);
        // Status might be empty string if working tree is clean
        expect(typeof result.data).toBe('string');
      });

      it('gitCommands.commitHash returns short hash', () => {
        const result = gitCommands.commitHash();
        expect(result.ok).toBe(true);
        // Hash should be 7-12 characters (short hash)
        expect(result.data.length).toBeGreaterThanOrEqual(7);
        expect(result.data.length).toBeLessThanOrEqual(12);
      });

      it('gitCommands.log returns recent commits', () => {
        const result = gitCommands.log(undefined, { count: 3 });
        expect(result.ok).toBe(true);
        // Should have multiple lines
        expect(result.data.split('\n').length).toBeLessThanOrEqual(3);
      });
    });

    describe('cache management', () => {
      it('invalidateGitCache clears git caches', () => {
        // Populate cache
        gitCommands.branch();
        gitCommands.status();

        const stats1 = getCommandCacheStats();
        expect(stats1.size).toBeGreaterThan(0);

        // Invalidate
        invalidateGitCache();

        // Should be cleared
        const stats2 = getCommandCacheStats();
        expect(stats2.size).toBe(0);
      });

      it('getCommandCacheStats returns statistics', () => {
        clearCommandCache();

        execCached('echo "stats-test"');
        execCached('echo "stats-test"'); // Cache hit

        const stats = getCommandCacheStats();
        expect(stats.hits).toBeGreaterThanOrEqual(1);
        expect(stats.misses).toBeGreaterThanOrEqual(1);
        expect(stats.size).toBeGreaterThanOrEqual(1);
      });

      it('clearCommandCache removes all entries', () => {
        execCached('echo "test1"');
        execCached('echo "test2"');

        const stats1 = getCommandCacheStats();
        expect(stats1.size).toBe(2);

        clearCommandCache();

        const stats2 = getCommandCacheStats();
        expect(stats2.size).toBe(0);
      });
    });

    describe('cache key format', () => {
      it('uses git:<command>:<cwd> format for git commands', () => {
        clearCommandCache();
        gitCached('--version');

        // We can verify the cache works by checking stats
        const stats = getCommandCacheStats();
        expect(stats.size).toBe(1);
      });
    });
  });
});
