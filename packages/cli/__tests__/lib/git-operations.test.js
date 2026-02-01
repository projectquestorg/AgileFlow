/**
 * Tests for git-operations.js - Git command execution and phase detection
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const {
  gitCache,
  execGitAsync,
  getCurrentBranch,
  getMainBranch,
  SESSION_PHASES,
  determinePhaseFromGitState,
  getSessionPhaseEarlyExit,
  getSessionPhase,
  getSessionPhaseAsync,
  getSessionPhasesAsync,
} = require('../../lib/git-operations');

describe('git-operations', () => {
  describe('gitCache', () => {
    beforeEach(() => {
      gitCache.invalidate(); // Clear cache before each test
    });

    it('stores and retrieves values within TTL', () => {
      gitCache.set('test-key', 'test-value');
      expect(gitCache.get('test-key')).toBe('test-value');
    });

    it('returns null for missing keys', () => {
      expect(gitCache.get('nonexistent')).toBeNull();
    });

    it('invalidates specific key', () => {
      gitCache.set('key1', 'value1');
      gitCache.set('key2', 'value2');

      gitCache.invalidate('key1');

      expect(gitCache.get('key1')).toBeNull();
      expect(gitCache.get('key2')).toBe('value2');
    });

    it('invalidates all keys when no key specified', () => {
      gitCache.set('key1', 'value1');
      gitCache.set('key2', 'value2');

      gitCache.invalidate();

      expect(gitCache.get('key1')).toBeNull();
      expect(gitCache.get('key2')).toBeNull();
    });

    it('returns null for expired entries', async () => {
      // Temporarily set a very short TTL
      const originalTtl = gitCache.ttlMs;
      gitCache.ttlMs = 1; // 1ms

      gitCache.set('expiring', 'value');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(gitCache.get('expiring')).toBeNull();

      // Restore original TTL
      gitCache.ttlMs = originalTtl;
    });
  });

  describe('SESSION_PHASES', () => {
    it('exports all phase constants', () => {
      expect(SESSION_PHASES.TODO).toBe('todo');
      expect(SESSION_PHASES.CODING).toBe('coding');
      expect(SESSION_PHASES.REVIEW).toBe('review');
      expect(SESSION_PHASES.MERGED).toBe('merged');
    });
  });

  describe('determinePhaseFromGitState', () => {
    it('returns TODO when no commits', () => {
      expect(determinePhaseFromGitState(0, false)).toBe(SESSION_PHASES.TODO);
      expect(determinePhaseFromGitState(0, true)).toBe(SESSION_PHASES.TODO);
    });

    it('returns CODING when commits and uncommitted changes', () => {
      expect(determinePhaseFromGitState(1, true)).toBe(SESSION_PHASES.CODING);
      expect(determinePhaseFromGitState(5, true)).toBe(SESSION_PHASES.CODING);
    });

    it('returns REVIEW when commits but no uncommitted changes', () => {
      expect(determinePhaseFromGitState(1, false)).toBe(SESSION_PHASES.REVIEW);
      expect(determinePhaseFromGitState(5, false)).toBe(SESSION_PHASES.REVIEW);
    });
  });

  describe('getSessionPhaseEarlyExit', () => {
    it('returns MERGED for sessions with merged_at', () => {
      const session = { merged_at: '2024-01-01T00:00:00Z', path: '/some/path' };
      expect(getSessionPhaseEarlyExit(session)).toBe(SESSION_PHASES.MERGED);
    });

    it('returns MERGED for main sessions', () => {
      const session = { is_main: true, path: '/some/path' };
      expect(getSessionPhaseEarlyExit(session)).toBe(SESSION_PHASES.MERGED);
    });

    it('returns TODO for non-existent path', () => {
      const session = { path: '/nonexistent/path/that/does/not/exist' };
      expect(getSessionPhaseEarlyExit(session)).toBe(SESSION_PHASES.TODO);
    });

    it('returns null for sessions needing git check', () => {
      const session = { path: os.tmpdir() }; // Existing path, no merged_at, not main
      expect(getSessionPhaseEarlyExit(session)).toBeNull();
    });
  });

  describe('execGitAsync', () => {
    let testDir;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ops-test-'));
      execSync('git init', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: testDir, encoding: 'utf8' });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('executes git command and returns result', async () => {
      const result = await execGitAsync(['status'], testDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('On branch');
    });

    it('returns error code for invalid git command', async () => {
      const result = await execGitAsync(['invalid-command'], testDir);

      expect(result.code).not.toBe(0);
    });

    it('returns stdout and stderr', async () => {
      const result = await execGitAsync(['status', '--porcelain'], testDir);

      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
    });
  });

  describe('getCurrentBranch', () => {
    let testDir;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-branch-test-'));
      execSync('git init', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: testDir, encoding: 'utf8' });
      // Create initial commit so we have a branch
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content');
      execSync('git add . && git commit -m "initial"', { cwd: testDir, encoding: 'utf8' });
      gitCache.invalidate();
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
      gitCache.invalidate();
    });

    it('returns current branch name', () => {
      const branch = getCurrentBranch(testDir);
      // Git 2.28+ defaults to main, older versions use master
      expect(['main', 'master']).toContain(branch);
    });

    it('caches the result', () => {
      const branch1 = getCurrentBranch(testDir);
      const branch2 = getCurrentBranch(testDir);

      expect(branch1).toBe(branch2);
    });
  });

  describe('getMainBranch', () => {
    let testDir;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-main-test-'));
      execSync('git init', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: testDir, encoding: 'utf8' });
      // Create initial commit
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content');
      execSync('git add . && git commit -m "initial"', { cwd: testDir, encoding: 'utf8' });
      gitCache.invalidate();
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
      gitCache.invalidate();
    });

    it('detects main or master branch', () => {
      const branch = getMainBranch(testDir);
      expect(['main', 'master']).toContain(branch);
    });

    it('caches the result', () => {
      const branch1 = getMainBranch(testDir);
      const branch2 = getMainBranch(testDir);

      expect(branch1).toBe(branch2);
    });

    it('defaults to main if neither exists', () => {
      // Create new repo with different branch
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-empty-test-'));
      execSync('git init', { cwd: emptyDir, encoding: 'utf8' });

      const branch = getMainBranch(emptyDir);
      expect(branch).toBe('main');

      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  describe('getSessionPhase', () => {
    it('returns MERGED for main session', () => {
      const session = { is_main: true, path: os.tmpdir() };
      expect(getSessionPhase(session)).toBe(SESSION_PHASES.MERGED);
    });

    it('returns TODO for non-existent path', () => {
      const session = { path: '/nonexistent/path' };
      expect(getSessionPhase(session)).toBe(SESSION_PHASES.TODO);
    });
  });

  describe('getSessionPhaseAsync', () => {
    it('returns MERGED for main session', async () => {
      const session = { is_main: true, path: os.tmpdir() };
      const phase = await getSessionPhaseAsync(session);
      expect(phase).toBe(SESSION_PHASES.MERGED);
    });

    it('returns TODO for non-existent path', async () => {
      const session = { path: '/nonexistent/path' };
      const phase = await getSessionPhaseAsync(session);
      expect(phase).toBe(SESSION_PHASES.TODO);
    });
  });

  describe('getSessionPhasesAsync', () => {
    it('processes multiple sessions in parallel', async () => {
      const sessions = [
        { is_main: true, path: '/path1' },
        { merged_at: '2024-01-01', path: '/path2' },
        { path: '/nonexistent' },
      ];

      const results = await getSessionPhasesAsync(sessions);

      expect(results).toHaveLength(3);
      expect(results[0].phase).toBe(SESSION_PHASES.MERGED);
      expect(results[1].phase).toBe(SESSION_PHASES.MERGED);
      expect(results[2].phase).toBe(SESSION_PHASES.TODO);
    });

    it('returns empty array for empty input', async () => {
      const results = await getSessionPhasesAsync([]);
      expect(results).toEqual([]);
    });

    it('preserves session properties', async () => {
      const sessions = [{ id: '1', nickname: 'test', is_main: true, path: '/path' }];
      const results = await getSessionPhasesAsync(sessions);

      expect(results[0].id).toBe('1');
      expect(results[0].nickname).toBe('test');
      expect(results[0].phase).toBeDefined();
    });
  });
});
