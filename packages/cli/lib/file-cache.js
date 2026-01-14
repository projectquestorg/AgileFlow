/**
 * File Cache - LRU Cache for frequently read JSON files
 *
 * Optimizes performance by caching frequently accessed JSON files
 * with configurable TTL (Time To Live).
 *
 * Features:
 * - LRU (Least Recently Used) eviction when max size reached
 * - TTL-based automatic expiration
 * - Separate caches for different data types
 * - Thread-safe for single-process Node.js usage
 */

const fs = require('fs');
const path = require('path');

/**
 * LRU Cache implementation with TTL support
 */
class LRUCache {
  /**
   * Create a new LRU Cache
   * @param {Object} options
   * @param {number} [options.maxSize=100] - Maximum number of entries
   * @param {number} [options.ttlMs=30000] - Time to live in milliseconds (default 30s)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttlMs = options.ttlMs || 30000;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttlMs] - Optional custom TTL for this entry
   */
  set(key, value, ttlMs = this.ttlMs) {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    // Add new entry
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now(),
    });
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Remove a key from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key was removed
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
          : '0%',
    };
  }

  /**
   * Get number of entries in cache
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }
}

// =============================================================================
// File Cache Singleton
// =============================================================================

// Global cache instance (persists across requires in same process)
const fileCache = new LRUCache({
  maxSize: 50,
  ttlMs: 30000, // 30 seconds
});

/**
 * Read and cache a JSON file
 * @param {string} filePath - Absolute path to JSON file
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Skip cache and force read
 * @param {number} [options.ttlMs] - Custom TTL for this file
 * @returns {Object|null} Parsed JSON or null if error
 */
function readJSONCached(filePath, options = {}) {
  const { force = false, ttlMs } = options;
  const cacheKey = `json:${filePath}`;

  // Check cache first (unless force reload)
  if (!force) {
    const cached = fileCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Read from disk
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Cache the result
    fileCache.set(cacheKey, data, ttlMs);

    return data;
  } catch (error) {
    // Cache null to avoid repeated failed reads
    fileCache.set(cacheKey, null, 5000); // 5s TTL for errors
    return null;
  }
}

/**
 * Read and cache a text file
 * @param {string} filePath - Absolute path to file
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Skip cache and force read
 * @param {number} [options.ttlMs] - Custom TTL for this file
 * @returns {string|null} File content or null if error
 */
function readFileCached(filePath, options = {}) {
  const { force = false, ttlMs } = options;
  const cacheKey = `file:${filePath}`;

  // Check cache first (unless force reload)
  if (!force) {
    const cached = fileCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Read from disk
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');

    // Cache the result
    fileCache.set(cacheKey, content, ttlMs);

    return content;
  } catch (error) {
    // Cache null to avoid repeated failed reads
    fileCache.set(cacheKey, null, 5000); // 5s TTL for errors
    return null;
  }
}

/**
 * Invalidate cache for a specific file
 * Call this after writing to a cached file
 * @param {string} filePath - Absolute path to file
 */
function invalidate(filePath) {
  fileCache.delete(`json:${filePath}`);
  fileCache.delete(`file:${filePath}`);
}

/**
 * Invalidate cache for all files in a directory
 * @param {string} dirPath - Directory path
 */
function invalidateDir(dirPath) {
  const normalizedDir = path.normalize(dirPath);
  for (const key of fileCache.cache.keys()) {
    const keyPath = key.replace(/^(json|file):/, '');
    if (keyPath.startsWith(normalizedDir)) {
      fileCache.delete(key);
    }
  }
}

/**
 * Clear entire cache
 */
function clearCache() {
  fileCache.clear();
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return fileCache.getStats();
}

// =============================================================================
// Convenience Methods for Common Files
// =============================================================================

/**
 * Read status.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readStatus(rootDir, options = {}) {
  const filePath = path.join(rootDir, 'docs', '09-agents', 'status.json');
  return readJSONCached(filePath, options);
}

/**
 * Read session-state.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readSessionState(rootDir, options = {}) {
  const filePath = path.join(rootDir, 'docs', '09-agents', 'session-state.json');
  return readJSONCached(filePath, options);
}

/**
 * Read agileflow-metadata.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readMetadata(rootDir, options = {}) {
  const filePath = path.join(rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
  return readJSONCached(filePath, options);
}

/**
 * Read registry.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readRegistry(rootDir, options = {}) {
  const filePath = path.join(rootDir, '.agileflow', 'sessions', 'registry.json');
  return readJSONCached(filePath, options);
}

/**
 * Batch read multiple common files
 * More efficient than reading each individually
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object} Object with status, sessionState, metadata, registry
 */
function readProjectFiles(rootDir, options = {}) {
  return {
    status: readStatus(rootDir, options),
    sessionState: readSessionState(rootDir, options),
    metadata: readMetadata(rootDir, options),
    registry: readRegistry(rootDir, options),
  };
}

module.exports = {
  // Core LRU Cache class (for custom usage)
  LRUCache,

  // File reading with caching
  readJSONCached,
  readFileCached,

  // Cache management
  invalidate,
  invalidateDir,
  clearCache,
  getCacheStats,

  // Convenience methods for common files
  readStatus,
  readSessionState,
  readMetadata,
  readRegistry,
  readProjectFiles,
};
