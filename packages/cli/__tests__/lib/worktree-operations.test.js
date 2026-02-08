/**
 * Tests for worktree-operations.js - Git worktree creation and management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const {
  THREAD_TYPES,
  DEFAULT_WORKTREE_TIMEOUT_MS,
  isGitWorktree,
  detectThreadType,
  progressIndicator,
  createWorktreeWithTimeout,
  cleanupFailedWorktree,
} = require('../../lib/worktree-operations');

describe('worktree-operations', () => {
  describe('THREAD_TYPES', () => {
    it('exports all thread type values', () => {
      expect(THREAD_TYPES).toContain('base');
      expect(THREAD_TYPES).toContain('parallel');
      expect(THREAD_TYPES).toContain('chained');
      expect(THREAD_TYPES).toContain('fusion');
      expect(THREAD_TYPES).toContain('big');
      expect(THREAD_TYPES).toContain('long');
    });

    it('has correct length', () => {
      expect(THREAD_TYPES).toHaveLength(6);
    });
  });

  describe('DEFAULT_WORKTREE_TIMEOUT_MS', () => {
    it('exports default timeout value', () => {
      expect(DEFAULT_WORKTREE_TIMEOUT_MS).toBe(120000); // 2 minutes
    });
  });

  describe('isGitWorktree', () => {
    let testDir;
    let worktreeDir;
    let mainRepo;

    beforeEach(() => {
      // Create a main repo
      mainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-main-'));
      execSync('git init', { cwd: mainRepo, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: mainRepo, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: mainRepo, encoding: 'utf8' });
      fs.writeFileSync(path.join(mainRepo, 'file.txt'), 'content');
      execSync('git add . && git commit -m "initial"', { cwd: mainRepo, encoding: 'utf8' });
    });

    afterEach(() => {
      // Clean up worktree first if it exists
      if (worktreeDir && fs.existsSync(worktreeDir)) {
        try {
          execSync(`git worktree remove "${worktreeDir}"`, {
            cwd: mainRepo,
            encoding: 'utf8',
            stdio: 'ignore',
          });
        } catch (e) {
          try {
            execSync(`git worktree remove --force "${worktreeDir}"`, {
              cwd: mainRepo,
              encoding: 'utf8',
              stdio: 'ignore',
            });
          } catch (e2) {
            // Try direct removal
            fs.rmSync(worktreeDir, { recursive: true, force: true });
          }
        }
      }
      fs.rmSync(mainRepo, { recursive: true, force: true });
    });

    it('returns false for main repo', () => {
      expect(isGitWorktree(mainRepo)).toBe(false);
    });

    it('returns true for worktree', () => {
      // Create a worktree
      worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-wt-'));
      fs.rmSync(worktreeDir, { recursive: true }); // Remove so git can create it
      execSync(`git worktree add "${worktreeDir}" -b test-branch`, {
        cwd: mainRepo,
        encoding: 'utf8',
      });

      expect(isGitWorktree(worktreeDir)).toBe(true);
    });

    it('returns false for non-git directory', () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
      expect(isGitWorktree(nonGitDir)).toBe(false);
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    });

    it('returns false for non-existent directory', () => {
      expect(isGitWorktree('/nonexistent/path/that/does/not/exist')).toBe(false);
    });
  });

  describe('detectThreadType', () => {
    it('returns parallel for worktree sessions', () => {
      expect(detectThreadType(null, true)).toBe('parallel');
    });

    it('returns parallel for non-main sessions', () => {
      expect(detectThreadType({ is_main: false })).toBe('parallel');
    });

    it('returns base for main sessions', () => {
      expect(detectThreadType({ is_main: true })).toBe('base');
    });

    it('returns base when session is null and not worktree', () => {
      expect(detectThreadType(null, false)).toBe('base');
    });
  });

  describe('progressIndicator', () => {
    it('returns a stop function', () => {
      // Suppress stderr output during test
      const originalWrite = process.stderr.write;
      const originalClearLine = process.stderr.clearLine;
      const originalCursorTo = process.stderr.cursorTo;
      process.stderr.write = jest.fn();
      process.stderr.clearLine = jest.fn();
      process.stderr.cursorTo = jest.fn();

      const stop = progressIndicator('Testing');

      expect(typeof stop).toBe('function');
      stop(); // Clean up

      process.stderr.write = originalWrite;
      process.stderr.clearLine = originalClearLine;
      process.stderr.cursorTo = originalCursorTo;
    });

    it('stop function clears the interval', () => {
      const originalWrite = process.stderr.write;
      const originalClearLine = process.stderr.clearLine;
      const originalCursorTo = process.stderr.cursorTo;
      process.stderr.write = jest.fn();
      process.stderr.clearLine = jest.fn();
      process.stderr.cursorTo = jest.fn();

      const stop = progressIndicator('Testing');
      stop();

      // After stopping, no more writes should occur
      const callCount = process.stderr.write.mock.calls.length;

      // Wait a bit and check no new calls
      return new Promise(resolve => {
        setTimeout(() => {
          expect(process.stderr.write.mock.calls.length).toBe(callCount);
          process.stderr.write = originalWrite;
          process.stderr.clearLine = originalClearLine;
          process.stderr.cursorTo = originalCursorTo;
          resolve();
        }, 100);
      });
    });
  });

  describe('createWorktreeWithTimeout', () => {
    let mainRepo;
    let worktreePath;

    beforeEach(() => {
      mainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-create-'));
      execSync('git init', { cwd: mainRepo, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: mainRepo, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: mainRepo, encoding: 'utf8' });
      fs.writeFileSync(path.join(mainRepo, 'file.txt'), 'content');
      execSync('git add . && git commit -m "initial"', { cwd: mainRepo, encoding: 'utf8' });
      // Create branch for worktree
      execSync('git branch test-wt-branch', { cwd: mainRepo, encoding: 'utf8' });

      worktreePath = path.join(os.tmpdir(), `wt-test-${Date.now()}`);
    });

    afterEach(() => {
      // Clean up worktree if it exists
      if (fs.existsSync(worktreePath)) {
        try {
          execSync(`git worktree remove "${worktreePath}"`, {
            cwd: mainRepo,
            encoding: 'utf8',
            stdio: 'ignore',
          });
        } catch (e) {
          fs.rmSync(worktreePath, { recursive: true, force: true });
        }
      }
      fs.rmSync(mainRepo, { recursive: true, force: true });
    });

    // Skip this test as it requires running from a git repo context
    it.skip('creates worktree successfully', async () => {
      const result = await createWorktreeWithTimeout(worktreePath, 'test-wt-branch', 30000);
      expect(fs.existsSync(worktreePath)).toBe(true);
    });

    it('rejects with error for invalid branch', async () => {
      await expect(
        createWorktreeWithTimeout(worktreePath, 'nonexistent-branch', 5000)
      ).rejects.toThrow();
    });
  });

  describe('cleanupFailedWorktree', () => {
    let mainRepo;
    let partialPath;

    beforeEach(() => {
      mainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
      execSync('git init', { cwd: mainRepo, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: mainRepo, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: mainRepo, encoding: 'utf8' });
      fs.writeFileSync(path.join(mainRepo, 'file.txt'), 'content');
      execSync('git add . && git commit -m "initial"', { cwd: mainRepo, encoding: 'utf8' });

      partialPath = path.join(os.tmpdir(), `partial-wt-${Date.now()}`);
    });

    afterEach(() => {
      if (fs.existsSync(partialPath)) {
        fs.rmSync(partialPath, { recursive: true, force: true });
      }
      fs.rmSync(mainRepo, { recursive: true, force: true });
    });

    it('removes partial worktree directory', () => {
      // Create a partial directory
      fs.mkdirSync(partialPath);
      fs.writeFileSync(path.join(partialPath, 'file.txt'), 'content');

      expect(fs.existsSync(partialPath)).toBe(true);

      // Suppress stderr during cleanup
      const originalWrite = process.stderr.write;
      process.stderr.write = jest.fn();

      cleanupFailedWorktree(partialPath, 'test-branch', false);

      process.stderr.write = originalWrite;

      expect(fs.existsSync(partialPath)).toBe(false);
    });

    it('handles non-existent directory gracefully', () => {
      const originalWrite = process.stderr.write;
      process.stderr.write = jest.fn();

      // Should not throw
      expect(() => cleanupFailedWorktree('/nonexistent/path', 'branch', false)).not.toThrow();

      process.stderr.write = originalWrite;
    });

    it('attempts to delete branch if branchCreatedByUs is true', () => {
      const originalWrite = process.stderr.write;
      process.stderr.write = jest.fn();

      // Create a branch
      execSync('git branch cleanup-test-branch', { cwd: mainRepo, encoding: 'utf8' });

      // Should not throw even if branch cleanup fails
      expect(() =>
        cleanupFailedWorktree('/nonexistent', 'cleanup-test-branch', true)
      ).not.toThrow();

      process.stderr.write = originalWrite;
    });
  });
});
