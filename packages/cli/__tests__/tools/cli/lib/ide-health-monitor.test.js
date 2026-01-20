/**
 * Tests for ide-health-monitor.js - IDE detection caching and circuit breaker
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const {
  IdeHealthMonitor,
  getHealthMonitor,
  resetHealthMonitor,
} = require('../../../../tools/cli/lib/ide-health-monitor');

describe('IdeHealthMonitor', () => {
  let monitor;
  let tempDir;

  beforeEach(() => {
    monitor = new IdeHealthMonitor({
      cacheTtlMs: 1000, // 1 second for testing
      maxFailures: 3,
      circuitResetMs: 2000, // 2 seconds for testing
    });
  });

  afterEach(() => {
    resetHealthMonitor();
  });

  describe('constructor', () => {
    it('uses default options when none provided', () => {
      const defaultMonitor = new IdeHealthMonitor();
      expect(defaultMonitor.cacheTtlMs).toBe(300000); // 5 minutes
      expect(defaultMonitor.maxFailures).toBe(3);
      expect(defaultMonitor.circuitResetMs).toBe(600000); // 10 minutes
    });

    it('accepts custom options', () => {
      expect(monitor.cacheTtlMs).toBe(1000);
      expect(monitor.maxFailures).toBe(3);
      expect(monitor.circuitResetMs).toBe(2000);
    });

    it('initializes empty caches', () => {
      expect(monitor.detectionCache.size).toBe(0);
      expect(monitor.circuitBreakers.size).toBe(0);
    });

    it('initializes metrics to zero', () => {
      expect(monitor.metrics.totalChecks).toBe(0);
      expect(monitor.metrics.cacheHits).toBe(0);
      expect(monitor.metrics.cacheMisses).toBe(0);
      expect(monitor.metrics.failures).toBe(0);
    });
  });

  describe('checkIde', () => {
    it('calls detectFn on first check', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      const result = await monitor.checkIde('cursor', '/project', detectFn);

      expect(detectFn).toHaveBeenCalled();
      expect(result.detected).toBe(true);
      expect(result.cached).toBe(false);
    });

    it('caches detection result', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      const result = await monitor.checkIde('cursor', '/project', detectFn);

      expect(detectFn).toHaveBeenCalledTimes(1); // Only called once
      expect(result.detected).toBe(true);
      expect(result.cached).toBe(true);
    });

    it('uses separate cache keys for different IDEs', async () => {
      const cursorDetect = jest.fn().mockResolvedValue(true);
      const windSurfDetect = jest.fn().mockResolvedValue(false);

      await monitor.checkIde('cursor', '/project', cursorDetect);
      await monitor.checkIde('windsurf', '/project', windSurfDetect);

      expect(cursorDetect).toHaveBeenCalledTimes(1);
      expect(windSurfDetect).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache keys for different projects', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project1', detectFn);
      await monitor.checkIde('cursor', '/project2', detectFn);

      expect(detectFn).toHaveBeenCalledTimes(2);
    });

    it('refreshes cache after TTL expires', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      expect(detectFn).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      await monitor.checkIde('cursor', '/project', detectFn);
      expect(detectFn).toHaveBeenCalledTimes(2);
    });

    it('handles detection failure gracefully', async () => {
      const detectFn = jest.fn().mockRejectedValue(new Error('Detection failed'));

      const result = await monitor.checkIde('cursor', '/project', detectFn);

      expect(result.detected).toBe(false);
      expect(result.error).toBe('Detection failed');
      expect(monitor.metrics.failures).toBe(1);
    });

    it('returns cached value on detection failure', async () => {
      const detectFn = jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('fail'));

      await monitor.checkIde('cursor', '/project', detectFn);
      // Invalidate to force re-detection
      monitor.invalidate('cursor', '/project');

      const result = await monitor.checkIde('cursor', '/project', detectFn);

      // Should return false since cache was invalidated
      expect(result.detected).toBe(false);
    });

    it('tracks detection duration', async () => {
      const detectFn = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return true;
      });

      const result = await monitor.checkIde('cursor', '/project', detectFn);

      expect(result.duration).toBeGreaterThanOrEqual(40);
    });

    it('updates metrics correctly', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      await monitor.checkIde('cursor', '/project', detectFn);

      expect(monitor.metrics.totalChecks).toBe(2);
      expect(monitor.metrics.cacheMisses).toBe(1);
      expect(monitor.metrics.cacheHits).toBe(1);
    });
  });

  describe('circuit breaker', () => {
    it('opens circuit after max failures', async () => {
      const detectFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trigger maxFailures failures
      for (let i = 0; i < 3; i++) {
        await monitor.checkIde('cursor', '/project', detectFn);
      }

      const state = monitor.getCircuitState('cursor');
      expect(state.open).toBe(true);
      expect(state.failures).toBe(3);
    });

    it('returns cached result when circuit is open', async () => {
      const detectFn = jest
        .fn()
        .mockResolvedValueOnce(true) // First call succeeds
        .mockRejectedValue(new Error('fail')); // Rest fail

      // Initial successful detection
      await monitor.checkIde('cursor', '/project', detectFn);

      // Force failures to open circuit
      monitor.invalidate('cursor', '/project');
      for (let i = 0; i < 3; i++) {
        await monitor.checkIde('cursor', '/project', detectFn);
      }

      // Next check should use cache and not call detectFn
      const callCount = detectFn.mock.calls.length;
      const result = await monitor.checkIde('cursor', '/project', detectFn);

      expect(result.circuitOpen).toBe(true);
      expect(detectFn).toHaveBeenCalledTimes(callCount); // No additional calls
    });

    it('resets circuit after reset timeout', async () => {
      const detectFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await monitor.checkIde('cursor', '/project', detectFn);
      }
      expect(monitor.getCircuitState('cursor').open).toBe(true);

      // Wait for circuit reset
      await new Promise(resolve => setTimeout(resolve, 2100));

      const state = monitor.getCircuitState('cursor');
      expect(state.open).toBe(false);
    });

    it('resets failure count on successful detection', async () => {
      const detectFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      await monitor.checkIde('cursor', '/project', detectFn);

      // Invalidate and succeed
      monitor.invalidate('cursor', '/project');
      await monitor.checkIde('cursor', '/project', detectFn);

      const state = monitor.getCircuitState('cursor');
      expect(state.failures).toBe(0);
    });

    it('tracks circuit opens in metrics', async () => {
      const detectFn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await monitor.checkIde('cursor', '/project', detectFn);
      }

      expect(monitor.metrics.circuitOpens).toBe(1);
    });
  });

  describe('getCircuitState', () => {
    it('returns default state for unknown IDE', () => {
      const state = monitor.getCircuitState('unknown');
      expect(state.open).toBe(false);
      expect(state.failures).toBe(0);
      expect(state.lastError).toBeNull();
    });

    it('returns current failure count', async () => {
      const detectFn = jest.fn().mockRejectedValue(new Error('test error'));

      await monitor.checkIde('cursor', '/project', detectFn);

      const state = monitor.getCircuitState('cursor');
      expect(state.failures).toBe(1);
      expect(state.lastError).toBe('test error');
    });
  });

  describe('invalidate', () => {
    it('invalidates specific IDE/project cache', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      monitor.invalidate('cursor', '/project');
      await monitor.checkIde('cursor', '/project', detectFn);

      expect(detectFn).toHaveBeenCalledTimes(2);
    });

    it('invalidates all projects for an IDE', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project1', detectFn);
      await monitor.checkIde('cursor', '/project2', detectFn);

      monitor.invalidate('cursor');

      await monitor.checkIde('cursor', '/project1', detectFn);
      await monitor.checkIde('cursor', '/project2', detectFn);

      expect(detectFn).toHaveBeenCalledTimes(4);
    });

    it('invalidates all cache with wildcard', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      await monitor.checkIde('windsurf', '/project', detectFn);

      monitor.invalidate('*');

      expect(monitor.detectionCache.size).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('returns current metrics', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);

      await monitor.checkIde('cursor', '/project', detectFn);
      await monitor.checkIde('cursor', '/project', detectFn);

      const metrics = monitor.getMetrics();

      expect(metrics.totalChecks).toBe(2);
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheSize).toBe(1);
      expect(metrics.hitRate).toBe('50.0%');
    });

    it('includes open circuit count', async () => {
      const detectFn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await monitor.checkIde('cursor', '/project', detectFn);
      }

      const metrics = monitor.getMetrics();
      expect(metrics.openCircuits).toBe(1);
    });

    it('includes timestamp', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.lastUpdated).toBeDefined();
      expect(new Date(metrics.lastUpdated)).toBeInstanceOf(Date);
    });
  });

  describe('persistence', () => {
    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-health-'));
      await fs.ensureDir(path.join(tempDir, '.agileflow'));
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    it('saves metrics to file', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);
      await monitor.checkIde('cursor', tempDir, detectFn);

      await monitor.saveMetrics(tempDir);

      const metricsPath = path.join(tempDir, '.agileflow', 'cache', 'ide-health.json');
      expect(await fs.pathExists(metricsPath)).toBe(true);

      const saved = await fs.readJson(metricsPath);
      expect(saved.metrics.totalChecks).toBe(1);
    });

    it('loads metrics from file', async () => {
      const cacheDir = path.join(tempDir, '.agileflow', 'cache');
      await fs.ensureDir(cacheDir);

      const metricsPath = path.join(cacheDir, 'ide-health.json');
      await fs.writeJson(metricsPath, {
        metrics: { totalChecks: 100, cacheHits: 50, cacheMisses: 50, failures: 5, circuitOpens: 1 },
        cache: {},
        circuits: {},
      });

      const newMonitor = new IdeHealthMonitor();
      const loaded = await newMonitor.loadMetrics(tempDir);

      expect(loaded).toBe(true);
      expect(newMonitor.metrics.totalChecks).toBe(100);
    });

    it('restores cache entries that have not expired', async () => {
      const cacheDir = path.join(tempDir, '.agileflow', 'cache');
      await fs.ensureDir(cacheDir);

      const metricsPath = path.join(cacheDir, 'ide-health.json');
      await fs.writeJson(metricsPath, {
        metrics: {},
        cache: {
          'cursor:/project': {
            result: true,
            cachedAt: Date.now(),
            expiresAt: Date.now() + 300000, // Not expired
          },
          'windsurf:/project': {
            result: true,
            cachedAt: Date.now() - 600000,
            expiresAt: Date.now() - 300000, // Expired
          },
        },
        circuits: {},
      });

      const newMonitor = new IdeHealthMonitor();
      await newMonitor.loadMetrics(tempDir);

      expect(newMonitor.detectionCache.has('cursor:/project')).toBe(true);
      expect(newMonitor.detectionCache.has('windsurf:/project')).toBe(false);
    });

    it('handles missing metrics file gracefully', async () => {
      const loaded = await monitor.loadMetrics(tempDir);
      expect(loaded).toBe(false);
    });

    it('handles corrupt metrics file gracefully', async () => {
      const metricsPath = path.join(tempDir, '.agileflow', 'cache', 'ide-health.json');
      await fs.ensureDir(path.dirname(metricsPath));
      await fs.writeFile(metricsPath, 'not json');

      const loaded = await monitor.loadMetrics(tempDir);
      expect(loaded).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all state', async () => {
      const detectFn = jest.fn().mockResolvedValue(true);
      await monitor.checkIde('cursor', '/project', detectFn);

      monitor.reset();

      expect(monitor.detectionCache.size).toBe(0);
      expect(monitor.circuitBreakers.size).toBe(0);
      expect(monitor.metrics.totalChecks).toBe(0);
    });
  });

  describe('singleton', () => {
    it('getHealthMonitor returns same instance', () => {
      const monitor1 = getHealthMonitor();
      const monitor2 = getHealthMonitor();
      expect(monitor1).toBe(monitor2);
    });

    it('resetHealthMonitor clears the singleton', () => {
      const monitor1 = getHealthMonitor();
      resetHealthMonitor();
      const monitor2 = getHealthMonitor();
      expect(monitor1).not.toBe(monitor2);
    });
  });
});
