/**
 * AgileFlow CLI - IDE Health Monitor
 *
 * Monitors IDE detection health with caching and circuit-breaker pattern.
 * Reduces filesystem operations during repeated IDE checks.
 *
 * Features:
 * - LRU cache for IDE detection results (300s TTL by default)
 * - Circuit-breaker pattern to stop checking failing IDEs
 * - Health metrics logging to .agileflow/cache/ide-health.json
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * IDE Health Monitor - Caching and circuit-breaker for IDE detection
 */
class IdeHealthMonitor {
  /**
   * Create a new health monitor
   * @param {Object} options
   * @param {number} [options.cacheTtlMs=300000] - Cache TTL in milliseconds (default 5 minutes)
   * @param {number} [options.maxFailures=3] - Failures before circuit opens
   * @param {number} [options.circuitResetMs=600000] - Time before circuit resets (default 10 minutes)
   */
  constructor(options = {}) {
    this.cacheTtlMs = options.cacheTtlMs || 300000; // 5 minutes default
    this.maxFailures = options.maxFailures || 3;
    this.circuitResetMs = options.circuitResetMs || 600000; // 10 minutes default

    // Detection cache: { ideName: { result: boolean, cachedAt: timestamp, expiresAt: timestamp } }
    this.detectionCache = new Map();

    // Circuit breaker state: { ideName: { failures: number, openedAt: timestamp | null } }
    this.circuitBreakers = new Map();

    // Health metrics
    this.metrics = {
      totalChecks: 0,
      cacheHits: 0,
      cacheMisses: 0,
      failures: 0,
      circuitOpens: 0,
      lastUpdated: null,
    };
  }

  /**
   * Check if an IDE is detected with caching
   * @param {string} ideName - IDE identifier
   * @param {string} projectDir - Project directory
   * @param {Function} detectFn - Async function to perform actual detection
   * @returns {Promise<{ detected: boolean, cached: boolean, circuitOpen: boolean }>}
   */
  async checkIde(ideName, projectDir, detectFn) {
    this.metrics.totalChecks++;
    const cacheKey = `${ideName}:${projectDir}`;

    // Check circuit breaker first
    const circuit = this.circuitBreakers.get(ideName);
    if (circuit && circuit.openedAt) {
      // Circuit is open - check if it should reset
      if (Date.now() - circuit.openedAt > this.circuitResetMs) {
        // Reset the circuit - allow half-open state
        circuit.failures = 0;
        circuit.openedAt = null;
      } else {
        // Circuit still open - return cached result or false
        const cached = this.detectionCache.get(cacheKey);
        return {
          detected: cached ? cached.result : false,
          cached: true,
          circuitOpen: true,
        };
      }
    }

    // Check cache
    const cachedEntry = this.detectionCache.get(cacheKey);
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
      this.metrics.cacheHits++;
      return {
        detected: cachedEntry.result,
        cached: true,
        circuitOpen: false,
      };
    }

    // Cache miss - perform actual detection
    this.metrics.cacheMisses++;

    try {
      const startTime = Date.now();
      const detected = await detectFn();
      const duration = Date.now() - startTime;

      // Cache the result
      this.detectionCache.set(cacheKey, {
        result: detected,
        cachedAt: Date.now(),
        expiresAt: Date.now() + this.cacheTtlMs,
        duration,
      });

      // Reset failure count on success
      if (this.circuitBreakers.has(ideName)) {
        this.circuitBreakers.get(ideName).failures = 0;
      }

      return {
        detected,
        cached: false,
        circuitOpen: false,
        duration,
      };
    } catch (error) {
      this.metrics.failures++;
      this.recordFailure(ideName, error);

      // Return cached value if available, otherwise false
      const cached = this.detectionCache.get(cacheKey);
      return {
        detected: cached ? cached.result : false,
        cached: !!cached,
        circuitOpen: false,
        error: error.message,
      };
    }
  }

  /**
   * Record a detection failure for circuit breaker
   * @param {string} ideName - IDE identifier
   * @param {Error} error - The error that occurred
   */
  recordFailure(ideName, error) {
    let circuit = this.circuitBreakers.get(ideName);
    if (!circuit) {
      circuit = { failures: 0, openedAt: null, lastError: null };
      this.circuitBreakers.set(ideName, circuit);
    }

    circuit.failures++;
    circuit.lastError = error.message;

    // Check if we should open the circuit
    if (circuit.failures >= this.maxFailures && !circuit.openedAt) {
      circuit.openedAt = Date.now();
      this.metrics.circuitOpens++;
    }
  }

  /**
   * Get circuit state for an IDE
   * @param {string} ideName - IDE identifier
   * @returns {{ open: boolean, failures: number, lastError: string | null }}
   */
  getCircuitState(ideName) {
    const circuit = this.circuitBreakers.get(ideName);
    if (!circuit) {
      return { open: false, failures: 0, lastError: null };
    }

    // Check if circuit should auto-reset
    if (circuit.openedAt && Date.now() - circuit.openedAt > this.circuitResetMs) {
      return { open: false, failures: 0, lastError: circuit.lastError };
    }

    return {
      open: !!circuit.openedAt,
      failures: circuit.failures,
      lastError: circuit.lastError,
    };
  }

  /**
   * Invalidate cache for a specific IDE/project
   * @param {string} ideName - IDE identifier (or '*' for all)
   * @param {string} [projectDir] - Project directory (optional)
   */
  invalidate(ideName, projectDir) {
    if (ideName === '*') {
      this.detectionCache.clear();
      return;
    }

    if (projectDir) {
      const cacheKey = `${ideName}:${projectDir}`;
      this.detectionCache.delete(cacheKey);
    } else {
      // Remove all entries for this IDE
      for (const key of this.detectionCache.keys()) {
        if (key.startsWith(`${ideName}:`)) {
          this.detectionCache.delete(key);
        }
      }
    }
  }

  /**
   * Get current health metrics
   * @returns {Object} Health metrics
   */
  getMetrics() {
    const hitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (
            (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) *
            100
          ).toFixed(1) + '%'
        : '0%';

    return {
      ...this.metrics,
      cacheSize: this.detectionCache.size,
      openCircuits: [...this.circuitBreakers.values()].filter(c => c.openedAt).length,
      hitRate,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Save health metrics to file
   * @param {string} projectDir - Project directory
   * @returns {Promise<void>}
   */
  async saveMetrics(projectDir) {
    const cacheDir = path.join(projectDir, '.agileflow', 'cache');
    const metricsPath = path.join(cacheDir, 'ide-health.json');

    try {
      await fs.ensureDir(cacheDir);

      const data = {
        metrics: this.getMetrics(),
        cache: this.getCacheSnapshot(),
        circuits: this.getCircuitSnapshot(),
        savedAt: new Date().toISOString(),
      };

      await fs.writeJson(metricsPath, data, { spaces: 2 });
      this.metrics.lastUpdated = data.savedAt;
    } catch {
      // Silently ignore save errors - metrics are not critical
    }
  }

  /**
   * Load health metrics from file
   * @param {string} projectDir - Project directory
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async loadMetrics(projectDir) {
    const metricsPath = path.join(projectDir, '.agileflow', 'cache', 'ide-health.json');

    try {
      if (await fs.pathExists(metricsPath)) {
        const data = await fs.readJson(metricsPath);

        // Restore metrics (additive)
        if (data.metrics) {
          this.metrics.totalChecks += data.metrics.totalChecks || 0;
          this.metrics.cacheHits += data.metrics.cacheHits || 0;
          this.metrics.cacheMisses += data.metrics.cacheMisses || 0;
          this.metrics.failures += data.metrics.failures || 0;
          this.metrics.circuitOpens += data.metrics.circuitOpens || 0;
        }

        // Restore cache entries that haven't expired
        if (data.cache) {
          for (const [key, entry] of Object.entries(data.cache)) {
            if (entry.expiresAt > Date.now()) {
              this.detectionCache.set(key, entry);
            }
          }
        }

        // Restore circuit breaker state
        if (data.circuits) {
          for (const [key, state] of Object.entries(data.circuits)) {
            this.circuitBreakers.set(key, state);
          }
        }

        return true;
      }
    } catch {
      // Ignore load errors
    }
    return false;
  }

  /**
   * Get cache snapshot for persistence
   * @returns {Object}
   */
  getCacheSnapshot() {
    const snapshot = {};
    for (const [key, entry] of this.detectionCache) {
      snapshot[key] = entry;
    }
    return snapshot;
  }

  /**
   * Get circuit breaker snapshot for persistence
   * @returns {Object}
   */
  getCircuitSnapshot() {
    const snapshot = {};
    for (const [key, state] of this.circuitBreakers) {
      snapshot[key] = state;
    }
    return snapshot;
  }

  /**
   * Reset all state (for testing)
   */
  reset() {
    this.detectionCache.clear();
    this.circuitBreakers.clear();
    this.metrics = {
      totalChecks: 0,
      cacheHits: 0,
      cacheMisses: 0,
      failures: 0,
      circuitOpens: 0,
      lastUpdated: null,
    };
  }
}

// Singleton instance for global usage
let globalMonitor = null;

/**
 * Get the global health monitor instance
 * @param {Object} [options] - Options for new instance
 * @returns {IdeHealthMonitor}
 */
function getHealthMonitor(options) {
  if (!globalMonitor) {
    globalMonitor = new IdeHealthMonitor(options);
  }
  return globalMonitor;
}

/**
 * Reset the global monitor (for testing)
 */
function resetHealthMonitor() {
  if (globalMonitor) {
    globalMonitor.reset();
  }
  globalMonitor = null;
}

module.exports = {
  IdeHealthMonitor,
  getHealthMonitor,
  resetHealthMonitor,
};
