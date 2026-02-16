/**
 * Dashboard Git Operations Tests
 *
 * Tests for git operations extracted from dashboard-server.js.
 * Covers parseDiffStats (pure), getGitStatus (mocked), getFileDiff, handleGitAction.
 */

'use strict';

jest.mock('child_process');
jest.mock('../../lib/validate-paths');

const { execFileSync } = require('child_process');
const { validatePath } = require('../../lib/validate-paths');
const {
  getGitStatus,
  getFileDiff,
  parseDiffStats,
  handleGitAction,
} = require('../../lib/dashboard-git');

describe('Dashboard Git Operations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ============================================================================
  // parseDiffStats - pure function
  // ============================================================================

  describe('parseDiffStats', () => {
    test('counts additions and deletions', () => {
      const diff = [
        'diff --git a/file.js b/file.js',
        '--- a/file.js',
        '+++ b/file.js',
        '@@ -1,3 +1,4 @@',
        ' unchanged line',
        '+added line 1',
        '+added line 2',
        '-deleted line 1',
        ' another unchanged',
      ].join('\n');

      expect(parseDiffStats(diff)).toEqual({ additions: 2, deletions: 1 });
    });

    test('ignores +++ and --- header lines', () => {
      const diff = ['--- a/file.js', '+++ b/file.js', '@@ -1,1 +1,1 @@', '-old', '+new'].join('\n');

      expect(parseDiffStats(diff)).toEqual({ additions: 1, deletions: 1 });
    });

    test('returns zeros for empty diff', () => {
      expect(parseDiffStats('')).toEqual({ additions: 0, deletions: 0 });
    });

    test('handles new file diff (all additions)', () => {
      const diff = [
        'diff --git a/new.js b/new.js',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/new.js',
        '@@ -0,0 +1,3 @@',
        '+line 1',
        '+line 2',
        '+line 3',
      ].join('\n');

      expect(parseDiffStats(diff)).toEqual({ additions: 3, deletions: 0 });
    });

    test('handles deleted file diff (all deletions)', () => {
      const diff = [
        'diff --git a/old.js b/old.js',
        'deleted file mode 100644',
        '--- a/old.js',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-line 1',
        '-line 2',
      ].join('\n');

      expect(parseDiffStats(diff)).toEqual({ additions: 0, deletions: 2 });
    });
  });

  // ============================================================================
  // getGitStatus
  // ============================================================================

  describe('getGitStatus', () => {
    test('parses branch and file statuses', () => {
      execFileSync
        .mockReturnValueOnce('main\n') // git branch --show-current
        .mockReturnValueOnce('M  file1.js\n?? file2.js\nA  file3.js\n'); // git status --porcelain

      const result = getGitStatus('/test/project');

      expect(result.branch).toBe('main');
      expect(result.staged).toEqual([
        { path: 'file1.js', file: 'file1.js', status: 'modified' },
        { path: 'file3.js', file: 'file3.js', status: 'added' },
      ]);
      expect(result.unstaged).toEqual([
        { path: 'file2.js', file: 'file2.js', status: 'untracked' },
      ]);
    });

    test('handles both staged and unstaged changes for same file', () => {
      execFileSync.mockReturnValueOnce('feature\n').mockReturnValueOnce('MM both.js\n');

      const result = getGitStatus('/test/project');

      expect(result.staged).toEqual([{ path: 'both.js', file: 'both.js', status: 'modified' }]);
      expect(result.unstaged).toEqual([{ path: 'both.js', file: 'both.js', status: 'modified' }]);
    });

    test('returns defaults on git error', () => {
      execFileSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = getGitStatus('/not/a/repo');
      expect(result).toEqual({ branch: 'unknown', staged: [], unstaged: [] });
    });

    test('handles empty status output', () => {
      execFileSync.mockReturnValueOnce('main\n').mockReturnValueOnce('');

      const result = getGitStatus('/test/project');
      expect(result.branch).toBe('main');
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
    });

    test('parses all status characters', () => {
      execFileSync
        .mockReturnValueOnce('main\n')
        .mockReturnValueOnce('A  added.js\nD  deleted.js\nR  renamed.js\nC  copied.js\n');

      const result = getGitStatus('/test/project');
      expect(result.staged).toEqual([
        { path: 'added.js', file: 'added.js', status: 'added' },
        { path: 'deleted.js', file: 'deleted.js', status: 'deleted' },
        { path: 'renamed.js', file: 'renamed.js', status: 'renamed' },
        { path: 'copied.js', file: 'copied.js', status: 'copied' },
      ]);
    });
  });

  // ============================================================================
  // getFileDiff
  // ============================================================================

  describe('getFileDiff', () => {
    test('returns diff for tracked file', () => {
      validatePath.mockReturnValue({ ok: true });
      execFileSync.mockReturnValue('diff content here\n+added\n-removed\n');

      const result = getFileDiff('file.js', '/test/project', false);
      expect(result).toBe('diff content here\n+added\n-removed\n');
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['diff', '--', 'file.js'],
        expect.objectContaining({ cwd: '/test/project' })
      );
    });

    test('returns staged diff when staged=true', () => {
      validatePath.mockReturnValue({ ok: true });
      execFileSync.mockReturnValue('staged diff\n');

      const result = getFileDiff('file.js', '/test/project', true);
      expect(result).toBe('staged diff\n');
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['diff', '--cached', '--', 'file.js'],
        expect.objectContaining({ cwd: '/test/project' })
      );
    });

    test('returns empty string for invalid path', () => {
      validatePath.mockReturnValue({ ok: false });

      const result = getFileDiff('../../../etc/passwd', '/test/project');
      expect(result).toBe('');
    });

    test('returns empty string on diff error', () => {
      validatePath.mockReturnValue({ ok: true });
      execFileSync.mockImplementation(() => {
        throw new Error('diff error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = getFileDiff('file.js', '/test/project');
      expect(result).toBe('');
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // handleGitAction
  // ============================================================================

  describe('handleGitAction', () => {
    const mockProtocol = {
      InboundMessageType: {
        GIT_STAGE: 'git_stage',
        GIT_UNSTAGE: 'git_unstage',
        GIT_REVERT: 'git_revert',
        GIT_COMMIT: 'git_commit',
      },
    };

    test('stages specific files', () => {
      handleGitAction('git_stage', '/test/project', { files: ['a.js', 'b.js'] }, mockProtocol);

      expect(execFileSync).toHaveBeenCalledWith('git', ['add', '--', 'a.js', 'b.js'], {
        cwd: '/test/project',
      });
    });

    test('stages all files when no files specified', () => {
      handleGitAction('git_stage', '/test/project', { files: null }, mockProtocol);

      expect(execFileSync).toHaveBeenCalledWith('git', ['add', '-A'], { cwd: '/test/project' });
    });

    test('unstages specific files', () => {
      handleGitAction('git_unstage', '/test/project', { files: ['a.js'] }, mockProtocol);

      expect(execFileSync).toHaveBeenCalledWith('git', ['restore', '--staged', '--', 'a.js'], {
        cwd: '/test/project',
      });
    });

    test('commits with message', () => {
      handleGitAction(
        'git_commit',
        '/test/project',
        { commitMessage: 'test commit' },
        mockProtocol
      );

      expect(execFileSync).toHaveBeenCalledWith('git', ['commit', '-m', 'test commit'], {
        cwd: '/test/project',
      });
    });

    test('rejects file path with null bytes', () => {
      expect(() => {
        handleGitAction('git_stage', '/test/project', { files: ['evil\0file'] }, mockProtocol);
      }).toThrow('Invalid file path');
    });

    test('rejects file path traversal', () => {
      expect(() => {
        handleGitAction(
          'git_stage',
          '/test/project',
          { files: ['../../etc/passwd'] },
          mockProtocol
        );
      }).toThrow('File path outside project');
    });

    test('rejects invalid commit message', () => {
      expect(() => {
        handleGitAction(
          'git_commit',
          '/test/project',
          { commitMessage: 'a'.repeat(10001) },
          mockProtocol
        );
      }).toThrow('Invalid commit message');
    });

    test('rejects commit message with null bytes', () => {
      expect(() => {
        handleGitAction(
          'git_commit',
          '/test/project',
          { commitMessage: 'evil\0msg' },
          mockProtocol
        );
      }).toThrow('Invalid commit message');
    });
  });
});
