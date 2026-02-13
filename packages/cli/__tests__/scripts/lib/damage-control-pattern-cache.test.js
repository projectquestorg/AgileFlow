/**
 * Tests for damage-control-utils.js pattern caching feature
 *
 * Tests cover:
 * - Pattern cache is populated on first call to loadPatterns()
 * - Cache returns same object when mtime hasn't changed
 * - Cache re-reads file when mtime changes
 * - Cache re-reads when file path changes
 * - clearPatternCache() resets all cache state
 * - Cache invalidation per CONFIG_PATHS
 */

const path = require('path');

// Module under test
const {
  loadPatterns,
  clearPatternCache,
  CONFIG_PATHS,
} = require('../../../scripts/lib/damage-control-utils');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
}));

const fs = require('fs');

describe('damage-control-pattern-cache', () => {
  const mockParser = content => ({ parsed: content, timestamp: Date.now() });
  const projectRoot = '/test/project';

  beforeEach(() => {
    // Clear all mocks and cache before each test
    jest.clearAllMocks();
    clearPatternCache();
  });

  describe('cache population', () => {
    it('populates cache on first call to loadPatterns', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);
      const content = 'test: content';
      const mtime = 1000;

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: mtime });
      fs.readFileSync.mockReturnValue(content);

      const result = loadPatterns(projectRoot, mockParser);

      expect(result).toEqual({ parsed: content, timestamp: expect.any(Number) });
      expect(fs.statSync).toHaveBeenCalledWith(filePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('calls fs.statSync to read mtime on first load', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      loadPatterns(projectRoot, mockParser);

      expect(fs.statSync).toHaveBeenCalledTimes(1);
      expect(fs.statSync).toHaveBeenCalledWith(filePath);
    });

    it('calls fs.readFileSync on first load', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      loadPatterns(projectRoot, mockParser);

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    });
  });

  describe('cache returns cached result when mtime unchanged', () => {
    it('returns cached result on second call with same mtime', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);
      const content = 'original content';
      const mtime = 1000;

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: mtime });
      fs.readFileSync.mockReturnValue(content);

      // First call - loads from disk
      const result1 = loadPatterns(projectRoot, mockParser);

      // Second call - should use cache
      const result2 = loadPatterns(projectRoot, mockParser);

      // Results should be identical (same object reference)
      expect(result1).toBe(result2);
    });

    it('does not call readFileSync on cache hit', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      // First call
      loadPatterns(projectRoot, mockParser);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);

      // Second call - cache hit
      loadPatterns(projectRoot, mockParser);

      // Should still be 1, not 2
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('still calls statSync on cache hit to check mtime', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      // First call
      loadPatterns(projectRoot, mockParser);
      expect(fs.statSync).toHaveBeenCalledTimes(1);

      // Second call - checks mtime again
      loadPatterns(projectRoot, mockParser);

      expect(fs.statSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache invalidation on mtime change', () => {
    it('re-reads file when mtime changes', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);

      // First call with mtime 1000
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('old content');
      const result1 = loadPatterns(projectRoot, mockParser);

      // Second call with mtime 2000 (changed)
      fs.statSync.mockReturnValue({ mtimeMs: 2000 });
      fs.readFileSync.mockReturnValue('new content');
      const result2 = loadPatterns(projectRoot, mockParser);

      // Results should be different because file was re-read
      expect(result1.parsed).toBe('old content');
      expect(result2.parsed).toBe('new content');
      expect(result1).not.toBe(result2);
    });

    it('calls readFileSync again when mtime changes', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.readFileSync.mockReturnValue('content');

      // First call
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      loadPatterns(projectRoot, mockParser);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);

      // Second call with different mtime
      fs.statSync.mockReturnValue({ mtimeMs: 2000 });
      loadPatterns(projectRoot, mockParser);

      // Should have read file again
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('stores new mtime in cache after file change', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.readFileSync.mockReturnValue('content');

      // First load with mtime 1000
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      loadPatterns(projectRoot, mockParser);

      // Change mtime to 2000
      fs.statSync.mockReturnValue({ mtimeMs: 2000 });
      loadPatterns(projectRoot, mockParser);

      // Third call still with mtime 2000 - should use cache now
      loadPatterns(projectRoot, mockParser);

      // readFileSync called only twice (first and second calls, not third)
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache invalidation on file path change', () => {
    it('re-reads when called with different file path', () => {
      fs.existsSync.mockImplementation(p => {
        return (
          p === path.join(projectRoot, CONFIG_PATHS[0]) ||
          p === path.join(projectRoot, CONFIG_PATHS[1])
        );
      });
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      // First call - loads CONFIG_PATHS[0]
      const result1 = loadPatterns(projectRoot, mockParser);

      // Mock existsSync to make only CONFIG_PATHS[1] exist
      fs.existsSync.mockImplementation(p => p === path.join(projectRoot, CONFIG_PATHS[1]));
      fs.readFileSync.mockReturnValue('different content');

      // Second call - should load CONFIG_PATHS[1] (different file)
      const result2 = loadPatterns(projectRoot, mockParser);

      expect(result1.parsed).toBe('content');
      expect(result2.parsed).toBe('different content');
    });

    it('reads new file even if mtime is same', () => {
      const path0 = path.join(projectRoot, CONFIG_PATHS[0]);
      const path1 = path.join(projectRoot, CONFIG_PATHS[1]);

      fs.existsSync.mockImplementation(p => p === path0 || p === path1);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });

      // First call - load from path0
      fs.readFileSync.mockReturnValue('content from path0');
      fs.existsSync.mockImplementation(p => p === path0);
      loadPatterns(projectRoot, mockParser);

      // Second call - switch to path1
      fs.readFileSync.mockReturnValue('content from path1');
      fs.existsSync.mockImplementation(p => p === path1);
      loadPatterns(projectRoot, mockParser);

      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearPatternCache', () => {
    it('resets cache state', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      // Load and populate cache
      loadPatterns(projectRoot, mockParser);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);

      // Clear cache
      clearPatternCache();

      // Reload with same mtime - should reload because cache is cleared
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');
      loadPatterns(projectRoot, mockParser);

      // readFileSync should be called twice (first load + post-clear load)
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('allows cache to be repopulated after clear', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('original');

      const result1 = loadPatterns(projectRoot, mockParser);
      clearPatternCache();

      fs.readFileSync.mockReturnValue('new');
      const result2 = loadPatterns(projectRoot, mockParser);

      expect(result1.parsed).toBe('original');
      expect(result2.parsed).toBe('new');
    });

    it('does not affect subsequent operations', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      // First load
      loadPatterns(projectRoot, mockParser);

      // Clear cache
      clearPatternCache();

      // Load again - should read fresh
      fs.readFileSync.mockReturnValue('new content');
      const result = loadPatterns(projectRoot, mockParser);

      expect(result.parsed).toBe('new content');
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache isolation between invocations', () => {
    it('each loadPatterns call checks current mtime', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.readFileSync.mockReturnValue('content');

      // Call 1: mtime 1000
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      loadPatterns(projectRoot, mockParser);

      // Call 2: mtime still 1000 (cache hit)
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      loadPatterns(projectRoot, mockParser);

      // Call 3: mtime 2000 (cache miss, reload)
      fs.statSync.mockReturnValue({ mtimeMs: 2000 });
      fs.readFileSync.mockReturnValue('new content');
      loadPatterns(projectRoot, mockParser);

      // readFileSync: 2 times (call 1 + call 3)
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);

      // statSync: 3 times (all calls check mtime)
      expect(fs.statSync).toHaveBeenCalledTimes(3);
    });
  });

  describe('cache performance characteristics', () => {
    it('avoids expensive parsing on cache hit', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);
      let parseCallCount = 0;

      const expensiveParser = content => {
        parseCallCount++;
        return { parsed: content };
      };

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      fs.readFileSync.mockReturnValue('content');

      // First call - parser invoked
      loadPatterns(projectRoot, expensiveParser);
      expect(parseCallCount).toBe(1);

      // Second call - cache hit, parser not invoked
      loadPatterns(projectRoot, expensiveParser);
      expect(parseCallCount).toBe(1);

      // Third call - cache still hit
      loadPatterns(projectRoot, expensiveParser);
      expect(parseCallCount).toBe(1);
    });

    it('parser is called again after mtime change', () => {
      const filePath = path.join(projectRoot, CONFIG_PATHS[0]);
      let parseCallCount = 0;

      const expensiveParser = content => {
        parseCallCount++;
        return { parsed: content };
      };

      fs.existsSync.mockImplementation(p => p === filePath);
      fs.readFileSync.mockReturnValue('content');

      // First load
      fs.statSync.mockReturnValue({ mtimeMs: 1000 });
      loadPatterns(projectRoot, expensiveParser);
      expect(parseCallCount).toBe(1);

      // Reload after mtime change
      fs.statSync.mockReturnValue({ mtimeMs: 2000 });
      loadPatterns(projectRoot, expensiveParser);
      expect(parseCallCount).toBe(2);
    });
  });
});
