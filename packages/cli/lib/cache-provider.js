'use strict';

const fs = require('fs');
const { LRUCache } = require('./file-cache');

/**
 * Cache Provider - Unified caching interface for AgileFlow
 *
 * Re-exports LRUCache from file-cache (canonical source) and adds
 * MtimeCache for file-system-aware caching with mtime invalidation.
 */

const CACHE_DEFAULTS = {
  file: { maxSize: 50, ttlMs: 15000 },
  command: { maxSize: 50, ttlMs: 30000 },
  registry: { maxSize: 50, ttlMs: 60000 },
  index: { maxSize: 10, ttlMs: 60000 },
};

/**
 * LRU Cache with filesystem mtime-based invalidation.
 * On set(), captures the file's mtime. On get(), validates that
 * the file hasn't been modified since caching.
 */
class MtimeCache {
  constructor({ maxSize = 100, ttlMs = 60000 } = {}) {
    this._lru = new LRUCache({ maxSize, ttlMs });
    this._stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cached value, validating both TTL and file mtime.
   * @param {string} key - File/directory path used as cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this._lru.get(key);
    if (entry === undefined) {
      this._stats.misses++;
      return undefined;
    }

    // Validate mtime hasn't changed
    try {
      const currentMtime = fs.statSync(key).mtimeMs;
      if (currentMtime !== entry.mtimeMs) {
        this._lru.delete(key);
        this._stats.misses++;
        return undefined;
      }
    } catch {
      // File deleted or inaccessible — invalidate
      this._lru.delete(key);
      this._stats.misses++;
      return undefined;
    }

    this._stats.hits++;
    return entry.value;
  }

  /**
   * Store value with current file mtime snapshot.
   * @param {string} key - File/directory path used as cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    try {
      const mtimeMs = fs.statSync(key).mtimeMs;
      this._lru.set(key, { value, mtimeMs });
    } catch {
      // Can't stat — don't cache
    }
  }

  /**
   * Check if key exists (without promoting in LRU or updating stats).
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._lru.has(key);
  }

  /**
   * Remove a cached entry.
   * @param {string} key
   * @returns {boolean}
   */
  invalidate(key) {
    return this._lru.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._lru.clear();
    this._stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics.
   * @returns {{ hits: number, misses: number, size: number, hitRate: string }}
   */
  getStats() {
    const total = this._stats.hits + this._stats.misses;
    return {
      hits: this._stats.hits,
      misses: this._stats.misses,
      size: this._lru.size,
      hitRate: total > 0 ? ((this._stats.hits / total) * 100).toFixed(1) + '%' : '0%',
    };
  }

  get size() {
    return this._lru.size;
  }
}

/**
 * Create a pre-configured LRUCache.
 * @param {Object} [opts]
 * @param {number} [opts.maxSize=100]
 * @param {number} [opts.ttlMs=30000]
 * @returns {LRUCache}
 */
function createCache(opts = {}) {
  return new LRUCache({
    maxSize: opts.maxSize || 100,
    ttlMs: opts.ttlMs || 30000,
  });
}

/**
 * Create a pre-configured MtimeCache.
 * @param {Object} [opts]
 * @param {number} [opts.maxSize=100]
 * @param {number} [opts.ttlMs=60000]
 * @returns {MtimeCache}
 */
function createMtimeCache(opts = {}) {
  return new MtimeCache({
    maxSize: opts.maxSize || 100,
    ttlMs: opts.ttlMs || 60000,
  });
}

module.exports = {
  LRUCache,
  MtimeCache,
  createCache,
  createMtimeCache,
  CACHE_DEFAULTS,
};
