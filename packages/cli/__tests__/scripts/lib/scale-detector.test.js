/**
 * Tests for scale-detector.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Module under test
const {
  detectScale,
  classifyScale,
  getScaleLabel,
  getScaleRecommendations,
  countSourceFiles,
  countStories,
  countDependencies,
  SCALE_THRESHOLDS,
  CACHE_TTL_MS,
} = require('../../../scripts/lib/scale-detector');

describe('scale-detector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-detector-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('classifyScale', () => {
    it('classifies micro projects', () => {
      expect(classifyScale({ files: 5, stories: 2, commits: 10 })).toBe('micro');
    });

    it('classifies small projects', () => {
      expect(classifyScale({ files: 50, stories: 10, commits: 100 })).toBe('small');
    });

    it('classifies medium projects', () => {
      expect(classifyScale({ files: 300, stories: 30, commits: 500 })).toBe('medium');
    });

    it('classifies large projects', () => {
      expect(classifyScale({ files: 1500, stories: 100, commits: 3000 })).toBe('large');
    });

    it('classifies enterprise projects', () => {
      expect(classifyScale({ files: 5000, stories: 500, commits: 10000 })).toBe('enterprise');
    });

    it('uses highest tier when metrics differ', () => {
      // 5 files (micro) but 300 stories (enterprise) → should escalate
      expect(classifyScale({ files: 5, stories: 300, commits: 10 })).toBe('enterprise');
    });

    it('handles zero metrics as micro', () => {
      expect(classifyScale({ files: 0, stories: 0, commits: 0 })).toBe('micro');
    });

    it('handles boundary values correctly', () => {
      // Exactly at micro threshold
      expect(classifyScale({ files: 20, stories: 5, commits: 50 })).toBe('micro');
      // One above micro
      expect(classifyScale({ files: 21, stories: 5, commits: 50 })).toBe('small');
    });
  });

  describe('countSourceFiles', () => {
    it('counts source files in directory', () => {
      // Create test files
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '');
      fs.writeFileSync(path.join(tmpDir, 'utils.ts'), '');
      fs.writeFileSync(path.join(tmpDir, 'style.css'), '');
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), ''); // Not a source file

      expect(countSourceFiles(tmpDir)).toBe(3);
    });

    it('excludes node_modules', () => {
      const nmDir = path.join(tmpDir, 'node_modules');
      fs.mkdirSync(nmDir);
      fs.writeFileSync(path.join(nmDir, 'dep.js'), '');
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '');

      expect(countSourceFiles(tmpDir)).toBe(1);
    });

    it('excludes .git directory', () => {
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir);
      fs.writeFileSync(path.join(gitDir, 'config'), '');
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '');

      expect(countSourceFiles(tmpDir)).toBe(1);
    });

    it('recurses into subdirectories', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'app.js'), '');
      fs.writeFileSync(path.join(tmpDir, 'index.js'), '');

      expect(countSourceFiles(tmpDir)).toBe(2);
    });

    it('respects maxDepth', () => {
      let deepDir = tmpDir;
      for (let i = 0; i < 10; i++) {
        deepDir = path.join(deepDir, `level${i}`);
        fs.mkdirSync(deepDir);
        fs.writeFileSync(path.join(deepDir, 'file.js'), '');
      }

      // Default maxDepth is 6. Walk starts at depth 0 for first subdir.
      // Depths 0-6 = 7 levels of subdirs, but depth check is > maxDepth,
      // so level0 (depth 1) through level5 (depth 6) are walked = 6 files
      expect(countSourceFiles(tmpDir)).toBe(6);
    });

    it('returns 0 for non-existent directory', () => {
      expect(countSourceFiles('/nonexistent/path')).toBe(0);
    });

    it('returns 0 for empty directory', () => {
      expect(countSourceFiles(tmpDir)).toBe(0);
    });
  });

  describe('countStories', () => {
    it('counts stories from provided statusJson', () => {
      const statusJson = {
        stories: {
          'US-001': { status: 'ready' },
          'US-002': { status: 'in-progress' },
          'US-003': { status: 'done' },
        },
      };
      expect(countStories(statusJson, tmpDir)).toBe(3);
    });

    it('returns 0 when no stories', () => {
      expect(countStories({ stories: {} }, tmpDir)).toBe(0);
      expect(countStories(null, tmpDir)).toBe(0);
    });

    it('reads from disk when statusJson not provided', () => {
      const docsDir = path.join(tmpDir, 'docs', '09-agents');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, 'status.json'),
        JSON.stringify({
          stories: { 'US-001': {}, 'US-002': {} },
        })
      );

      expect(countStories(null, tmpDir)).toBe(2);
    });
  });

  describe('countDependencies', () => {
    it('counts dependencies from package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { a: '1.0.0', b: '2.0.0' },
          devDependencies: { c: '1.0.0' },
        })
      );

      expect(countDependencies(tmpDir)).toBe(3);
    });

    it('returns 0 when no package.json', () => {
      expect(countDependencies(tmpDir)).toBe(0);
    });
  });

  describe('getScaleLabel', () => {
    it('returns correct labels', () => {
      expect(getScaleLabel('micro')).toBe('Micro');
      expect(getScaleLabel('small')).toBe('Small');
      expect(getScaleLabel('medium')).toBe('Medium');
      expect(getScaleLabel('large')).toBe('Large');
      expect(getScaleLabel('enterprise')).toBe('Enterprise');
    });

    it('returns raw value for unknown scale', () => {
      expect(getScaleLabel('unknown')).toBe('unknown');
    });
  });

  describe('getScaleRecommendations', () => {
    it('returns recommendations for each tier', () => {
      const micro = getScaleRecommendations('micro');
      expect(micro.planningDepth).toBe('minimal');
      expect(micro.skipArchival).toBe(true);
      expect(micro.skipEpicPlanning).toBe(true);

      const large = getScaleRecommendations('large');
      expect(large.planningDepth).toBe('thorough');
      expect(large.skipArchival).toBe(false);
      expect(large.expertCount).toBe(5);
    });

    it('returns medium defaults for unknown tier', () => {
      const result = getScaleRecommendations('unknown');
      expect(result.planningDepth).toBe('standard');
    });
  });

  describe('detectScale', () => {
    it('detects scale for a directory', () => {
      // Create a small project structure
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: {} }));
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '');

      const result = detectScale({ rootDir: tmpDir });

      expect(result.scale).toBe('micro');
      expect(result.metrics.files).toBe(1);
      expect(result.detection_ms).toBeDefined();
      expect(result.detected_at).toBeDefined();
      expect(result.fromCache).toBe(false);
    });

    it('uses cache on second call', () => {
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '');

      // Create docs dir for cache storage
      const docsDir = path.join(tmpDir, 'docs', '09-agents');
      fs.mkdirSync(docsDir, { recursive: true });

      const result1 = detectScale({ rootDir: tmpDir });
      expect(result1.fromCache).toBe(false);

      const result2 = detectScale({ rootDir: tmpDir });
      expect(result2.fromCache).toBe(true);
      expect(result2.scale).toBe(result1.scale);
    });

    it('skips cache when forceRefresh is true', () => {
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '');
      const docsDir = path.join(tmpDir, 'docs', '09-agents');
      fs.mkdirSync(docsDir, { recursive: true });

      detectScale({ rootDir: tmpDir });
      const result = detectScale({ rootDir: tmpDir, forceRefresh: true });
      expect(result.fromCache).toBe(false);
    });

    it('accepts pre-loaded statusJson', () => {
      const statusJson = {
        stories: Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [`US-${i}`, { status: 'ready' }])
        ),
      };

      const result = detectScale({ rootDir: tmpDir, statusJson });
      expect(result.metrics.stories).toBe(25);
    });
  });

  describe('SCALE_THRESHOLDS', () => {
    it('has all required tiers', () => {
      expect(SCALE_THRESHOLDS).toHaveProperty('micro');
      expect(SCALE_THRESHOLDS).toHaveProperty('small');
      expect(SCALE_THRESHOLDS).toHaveProperty('medium');
      expect(SCALE_THRESHOLDS).toHaveProperty('large');
    });

    it('thresholds increase monotonically', () => {
      const tiers = ['micro', 'small', 'medium', 'large'];
      for (let i = 1; i < tiers.length; i++) {
        expect(SCALE_THRESHOLDS[tiers[i]].maxFiles).toBeGreaterThan(
          SCALE_THRESHOLDS[tiers[i - 1]].maxFiles
        );
      }
    });
  });

  describe('CACHE_TTL_MS', () => {
    it('is 60 seconds', () => {
      expect(CACHE_TTL_MS).toBe(60000);
    });
  });
});
