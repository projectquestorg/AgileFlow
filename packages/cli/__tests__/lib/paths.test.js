/**
 * Tests for paths.js - Shared path utilities
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  getProjectRoot,
  getAgileflowDir,
  getClaudeDir,
  getDocsDir,
  getStatusPath,
  getSessionStatePath,
  getMetadataPath,
  getBusLogPath,
  getEpicsDir,
  getStoriesDir,
  getArchiveDir,
  getAgentsDir,
  getDecisionsDir,
  getResearchDir,
  isAgileflowProject,
} = require('../../lib/paths');

describe('paths', () => {
  let testDir;
  let agileflowDir;
  let subDir;

  beforeAll(() => {
    // Create a test directory structure
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paths-test-'));
    agileflowDir = path.join(testDir, '.agileflow');
    subDir = path.join(testDir, 'src', 'components');

    // Create directories
    fs.mkdirSync(agileflowDir);
    fs.mkdirSync(subDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getProjectRoot', () => {
    it('finds root when starting from project root', () => {
      const root = getProjectRoot(testDir);
      expect(root).toBe(testDir);
    });

    it('finds root when starting from subdirectory', () => {
      const root = getProjectRoot(subDir);
      expect(root).toBe(testDir);
    });

    it('returns startDir when no .agileflow found', () => {
      const noAgileflow = fs.mkdtempSync(path.join(os.tmpdir(), 'no-agileflow-'));
      try {
        const root = getProjectRoot(noAgileflow);
        expect(root).toBe(noAgileflow);
      } finally {
        fs.rmSync(noAgileflow, { recursive: true, force: true });
      }
    });

    it('uses process.cwd() by default', () => {
      // This test just verifies the function runs without arguments
      const root = getProjectRoot();
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
    });

    it('handles nested .agileflow directories', () => {
      // Create a nested .agileflow in subdir
      const nestedAgileflow = path.join(subDir, '.agileflow');
      fs.mkdirSync(nestedAgileflow);
      try {
        // Should find the closest .agileflow (in subDir)
        const root = getProjectRoot(subDir);
        expect(root).toBe(subDir);
      } finally {
        fs.rmSync(nestedAgileflow, { recursive: true });
      }
    });
  });

  describe('getAgileflowDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getAgileflowDir(testDir);
      expect(result).toBe(path.join(testDir, '.agileflow'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      // When no rootDir provided, it should auto-detect
      const result = getAgileflowDir();
      expect(result).toMatch(/\.agileflow$/);
    });
  });

  describe('getClaudeDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getClaudeDir(testDir);
      expect(result).toBe(path.join(testDir, '.claude'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getClaudeDir();
      expect(result).toMatch(/\.claude$/);
    });
  });

  describe('getDocsDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getDocsDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getDocsDir();
      expect(result).toMatch(/docs$/);
    });
  });

  describe('getStatusPath', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getStatusPath(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '09-agents', 'status.json'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getStatusPath();
      expect(result).toMatch(/docs[/\\]09-agents[/\\]status\.json$/);
    });
  });

  describe('getSessionStatePath', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getSessionStatePath(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '09-agents', 'session-state.json'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getSessionStatePath();
      expect(result).toMatch(/docs[/\\]09-agents[/\\]session-state\.json$/);
    });
  });

  describe('getMetadataPath', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getMetadataPath(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getMetadataPath();
      expect(result).toMatch(/docs[/\\]00-meta[/\\]agileflow-metadata\.json$/);
    });
  });

  describe('getBusLogPath', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getBusLogPath(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getBusLogPath();
      expect(result).toMatch(/docs[/\\]09-agents[/\\]bus[/\\]log\.jsonl$/);
    });
  });

  describe('getEpicsDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getEpicsDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '05-epics'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getEpicsDir();
      expect(result).toMatch(/docs[/\\]05-epics$/);
    });
  });

  describe('getStoriesDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getStoriesDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '06-stories'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getStoriesDir();
      expect(result).toMatch(/docs[/\\]06-stories$/);
    });
  });

  describe('getArchiveDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getArchiveDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '09-agents', 'archive'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getArchiveDir();
      expect(result).toMatch(/docs[/\\]09-agents[/\\]archive$/);
    });
  });

  describe('getAgentsDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getAgentsDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '09-agents'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getAgentsDir();
      expect(result).toMatch(/docs[/\\]09-agents$/);
    });
  });

  describe('getDecisionsDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getDecisionsDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '03-decisions'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getDecisionsDir();
      expect(result).toMatch(/docs[/\\]03-decisions$/);
    });
  });

  describe('getResearchDir', () => {
    it('returns correct path with explicit rootDir', () => {
      const result = getResearchDir(testDir);
      expect(result).toBe(path.join(testDir, 'docs', '10-research'));
    });

    it('returns correct path without rootDir (auto-detect)', () => {
      const result = getResearchDir();
      expect(result).toMatch(/docs[/\\]10-research$/);
    });
  });

  describe('isAgileflowProject', () => {
    it('returns true when .agileflow exists', () => {
      expect(isAgileflowProject(testDir)).toBe(true);
    });

    it('returns true when starting from subdirectory', () => {
      expect(isAgileflowProject(subDir)).toBe(true);
    });

    it('returns false when no .agileflow exists', () => {
      const noAgileflow = fs.mkdtempSync(path.join(os.tmpdir(), 'no-agileflow-'));
      try {
        expect(isAgileflowProject(noAgileflow)).toBe(false);
      } finally {
        fs.rmSync(noAgileflow, { recursive: true, force: true });
      }
    });

    it('uses process.cwd() by default', () => {
      // Just verify it runs
      const result = isAgileflowProject();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('path consistency', () => {
    it('all paths are absolute', () => {
      const agileflow = getAgileflowDir(testDir);
      const claude = getClaudeDir(testDir);
      const docs = getDocsDir(testDir);
      const status = getStatusPath(testDir);
      const sessionState = getSessionStatePath(testDir);

      expect(path.isAbsolute(agileflow)).toBe(true);
      expect(path.isAbsolute(claude)).toBe(true);
      expect(path.isAbsolute(docs)).toBe(true);
      expect(path.isAbsolute(status)).toBe(true);
      expect(path.isAbsolute(sessionState)).toBe(true);
    });

    it('paths share common root', () => {
      const root = getProjectRoot(testDir);
      const agileflow = getAgileflowDir(testDir);
      const claude = getClaudeDir(testDir);
      const docs = getDocsDir(testDir);

      expect(agileflow.startsWith(root)).toBe(true);
      expect(claude.startsWith(root)).toBe(true);
      expect(docs.startsWith(root)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles root directory /', () => {
      // getProjectRoot should return startDir if it reaches /
      const result = getProjectRoot('/');
      expect(result).toBe('/');
    });

    it('handles path with trailing slash', () => {
      const withSlash = testDir + path.sep;
      const root = getProjectRoot(withSlash);
      // Should still find the project root (may include trailing slash)
      // Normalize by removing trailing separators for comparison
      const normalizeTrailing = p => p.replace(/[/\\]+$/, '');
      expect(normalizeTrailing(root)).toBe(normalizeTrailing(testDir));
    });
  });
});
