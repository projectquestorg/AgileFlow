'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  LRUCache,
  MtimeCache,
  createCache,
  createMtimeCache,
  CACHE_DEFAULTS,
} = require('../../lib/cache-provider');

// Also import from file-cache to verify re-export identity
const { LRUCache: FileCacheLRU } = require('../../lib/file-cache');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-provider-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

/**
 * Helper: create a file and return its path
 */
function createFile(name, content = 'hello') {
  const filePath = path.join(testDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// =============================================================================
// LRUCache re-export
// =============================================================================

describe('LRUCache re-export', () => {
  test('is the same class as file-cache LRUCache', () => {
    expect(LRUCache).toBe(FileCacheLRU);
  });

  test('instances work correctly', () => {
    const cache = new LRUCache({ maxSize: 5, ttlMs: 10000 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });
});

// =============================================================================
// MtimeCache basic operations
// =============================================================================

describe('MtimeCache', () => {
  test('set and get returns cached value', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt');

    cache.set(filePath, { data: 'cached' });
    expect(cache.get(filePath)).toEqual({ data: 'cached' });
  });

  test('get returns undefined for missing key', () => {
    const cache = new MtimeCache();
    expect(cache.get('/nonexistent/path')).toBeUndefined();
  });

  test('has returns true for cached key', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt');

    cache.set(filePath, 'value');
    expect(cache.has(filePath)).toBe(true);
  });

  test('has returns false for missing key', () => {
    const cache = new MtimeCache();
    expect(cache.has('/nonexistent')).toBe(false);
  });

  test('invalidate removes entry', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt');

    cache.set(filePath, 'value');
    expect(cache.get(filePath)).toBe('value');

    cache.invalidate(filePath);
    expect(cache.get(filePath)).toBeUndefined();
  });

  test('clear removes all entries', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const f1 = createFile('a.txt');
    const f2 = createFile('b.txt');

    cache.set(f1, 1);
    cache.set(f2, 2);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(f1)).toBeUndefined();
  });

  test('size property reflects entry count', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    expect(cache.size).toBe(0);

    const f = createFile('test.txt');
    cache.set(f, 'val');
    expect(cache.size).toBe(1);
  });
});

// =============================================================================
// MtimeCache TTL expiration
// =============================================================================

describe('MtimeCache TTL', () => {
  test('entry expires after TTL', () => {
    const cache = new MtimeCache({ ttlMs: 1 }); // 1ms TTL
    const filePath = createFile('test.txt');

    cache.set(filePath, 'value');

    // Wait for TTL to expire
    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy-wait 10ms
    }

    expect(cache.get(filePath)).toBeUndefined();
  });
});

// =============================================================================
// MtimeCache mtime invalidation
// =============================================================================

describe('MtimeCache mtime invalidation', () => {
  test('invalidates when file is modified', done => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt', 'original');

    cache.set(filePath, 'cached-value');
    expect(cache.get(filePath)).toBe('cached-value');

    // Modify file after a small delay to ensure mtime changes
    setTimeout(() => {
      fs.writeFileSync(filePath, 'modified');
      expect(cache.get(filePath)).toBeUndefined();
      done();
    }, 50);
  });

  test('invalidates when file is deleted', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt');

    cache.set(filePath, 'cached-value');
    expect(cache.get(filePath)).toBe('cached-value');

    fs.unlinkSync(filePath);
    expect(cache.get(filePath)).toBeUndefined();
  });

  test('set does nothing if file does not exist', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    cache.set('/nonexistent/file.txt', 'value');
    expect(cache.size).toBe(0);
  });
});

// =============================================================================
// MtimeCache stats
// =============================================================================

describe('MtimeCache stats', () => {
  test('tracks hits and misses', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt');

    // Miss
    cache.get(filePath);
    // Set + Hit
    cache.set(filePath, 'value');
    cache.get(filePath);

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
    expect(stats.hitRate).toBe('50.0%');
  });

  test('clear resets stats', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    const filePath = createFile('test.txt');

    cache.set(filePath, 'value');
    cache.get(filePath);
    cache.clear();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe('0%');
  });

  test('hitRate is 0% with no accesses', () => {
    const cache = new MtimeCache();
    expect(cache.getStats().hitRate).toBe('0%');
  });
});

// =============================================================================
// MtimeCache works with directories
// =============================================================================

describe('MtimeCache with directories', () => {
  test('caches directory scan results', () => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    // testDir is a real directory
    cache.set(testDir, ['file1.js', 'file2.js']);
    expect(cache.get(testDir)).toEqual(['file1.js', 'file2.js']);
  });

  test('invalidates when directory mtime changes', done => {
    const cache = new MtimeCache({ ttlMs: 60000 });
    cache.set(testDir, ['old-list']);
    expect(cache.get(testDir)).toEqual(['old-list']);

    // Adding a file changes the directory mtime
    setTimeout(() => {
      fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'new');
      expect(cache.get(testDir)).toBeUndefined();
      done();
    }, 50);
  });
});

// =============================================================================
// Factory functions
// =============================================================================

describe('createCache', () => {
  test('returns LRUCache with defaults', () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(LRUCache);
    expect(cache.maxSize).toBe(100);
    expect(cache.ttlMs).toBe(30000);
  });

  test('returns LRUCache with custom options', () => {
    const cache = createCache({ maxSize: 25, ttlMs: 5000 });
    expect(cache.maxSize).toBe(25);
    expect(cache.ttlMs).toBe(5000);
  });
});

describe('createMtimeCache', () => {
  test('returns MtimeCache with defaults', () => {
    const cache = createMtimeCache();
    expect(cache).toBeInstanceOf(MtimeCache);
  });

  test('returns MtimeCache with custom options', () => {
    const cache = createMtimeCache({ maxSize: 20, ttlMs: 10000 });
    expect(cache).toBeInstanceOf(MtimeCache);
    // Verify it works
    const f = createFile('factory-test.txt');
    cache.set(f, 'works');
    expect(cache.get(f)).toBe('works');
  });
});

// =============================================================================
// CACHE_DEFAULTS
// =============================================================================

describe('CACHE_DEFAULTS', () => {
  test('has correct default values', () => {
    expect(CACHE_DEFAULTS.file).toEqual({ maxSize: 50, ttlMs: 15000 });
    expect(CACHE_DEFAULTS.command).toEqual({ maxSize: 50, ttlMs: 30000 });
    expect(CACHE_DEFAULTS.registry).toEqual({ maxSize: 50, ttlMs: 60000 });
    expect(CACHE_DEFAULTS.index).toEqual({ maxSize: 10, ttlMs: 60000 });
  });

  test('can be used with createCache', () => {
    const cache = createCache(CACHE_DEFAULTS.registry);
    expect(cache.maxSize).toBe(50);
    expect(cache.ttlMs).toBe(60000);
  });
});
