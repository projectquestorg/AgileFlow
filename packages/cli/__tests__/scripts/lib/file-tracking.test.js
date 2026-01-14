/**
 * Tests for file-tracking.js - Inter-session file awareness
 */

const path = require('path');

// Mock dependencies before requiring the module
jest.mock('fs');
jest.mock('../../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/mock/project'),
}));
jest.mock('../../../lib/errors', () => ({
  safeReadJSON: jest.fn(),
  safeWriteJSON: jest.fn(),
}));
jest.mock('../../../lib/colors', () => ({
  c: {
    reset: '',
    bold: '',
    dim: '',
    brand: '',
    amber: '',
    lavender: '',
    cyan: '',
  },
}));
jest.mock('../../../scripts/lib/story-claiming', () => ({
  getCurrentSession: jest.fn(),
  isPidAlive: jest.fn(),
}));

const fs = require('fs');
const { getProjectRoot } = require('../../../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../../../lib/errors');
const { getCurrentSession, isPidAlive } = require('../../../scripts/lib/story-claiming');

const {
  getFileTouchesPath,
  ensureFileTouchesFile,
  recordFileTouch,
  recordFileTouches,
  getSessionFiles,
  isSessionTouchValid,
  getFileOverlaps,
  getMyFileOverlaps,
  cleanupStaleTouches,
  clearSessionFiles,
  formatFileOverlaps,
  categorizeFile,
  getMergeStrategy,
  DEFAULT_TOUCH_TTL_HOURS,
} = require('../../../scripts/lib/file-tracking');

describe('file-tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getProjectRoot.mockReturnValue('/mock/project');
  });

  describe('getFileTouchesPath', () => {
    it('returns path in .agileflow/sessions directory', () => {
      const result = getFileTouchesPath('/project');
      expect(result).toBe(path.join('/project', '.agileflow', 'sessions', 'file-touches.json'));
    });

    it('uses getProjectRoot when no rootDir provided', () => {
      getProjectRoot.mockReturnValue('/default/root');
      const result = getFileTouchesPath();
      expect(result).toBe(
        path.join('/default/root', '.agileflow', 'sessions', 'file-touches.json')
      );
    });
  });

  describe('ensureFileTouchesFile', () => {
    it('creates directory and file if they do not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      safeWriteJSON.mockReturnValue({ ok: true });

      const result = ensureFileTouchesFile('/project');

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          version: 1,
          sessions: {},
        })
      );
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(safeWriteJSON).toHaveBeenCalled();
    });

    it('returns existing data if file exists', () => {
      fs.existsSync.mockReturnValue(true);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: { 1: { files: ['test.js'] } },
        },
      });

      const result = ensureFileTouchesFile('/project');

      expect(result.ok).toBe(true);
      expect(result.data.sessions['1'].files).toContain('test.js');
    });

    it('returns error if directory creation fails', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = ensureFileTouchesFile('/project');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('returns error if file write fails', () => {
      fs.existsSync.mockImplementation(p => !p.includes('file-touches.json'));
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = ensureFileTouchesFile('/project');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Write failed');
    });
  });

  describe('recordFileTouch', () => {
    beforeEach(() => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      fs.existsSync.mockReturnValue(true);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });
      safeWriteJSON.mockReturnValue({ ok: true });
    });

    it('records a file touch for current session', () => {
      const result = recordFileTouch('src/test.js');

      expect(result.ok).toBe(true);
      expect(safeWriteJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sessions: expect.objectContaining({
            1: expect.objectContaining({
              files: ['src/test.js'],
              pid: 12345,
            }),
          }),
        })
      );
    });

    it('normalizes absolute paths to relative', () => {
      const result = recordFileTouch('/mock/project/src/test.js', { rootDir: '/mock/project' });

      expect(result.ok).toBe(true);
      const writeCall = safeWriteJSON.mock.calls[0][1];
      expect(writeCall.sessions['1'].files).toContain('src/test.js');
    });

    it('does not duplicate files already tracked', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: { 1: { files: ['src/test.js'], pid: 12345 } },
        },
      });

      const result = recordFileTouch('src/test.js');

      expect(result.ok).toBe(true);
      const writeCall = safeWriteJSON.mock.calls[0][1];
      expect(writeCall.sessions['1'].files.filter(f => f === 'src/test.js').length).toBe(1);
    });

    it('returns error when session cannot be determined', () => {
      getCurrentSession.mockReturnValue(null);

      const result = recordFileTouch('src/test.js');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could not determine current session');
    });
  });

  describe('recordFileTouches', () => {
    beforeEach(() => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      fs.existsSync.mockReturnValue(true);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });
      safeWriteJSON.mockReturnValue({ ok: true });
    });

    it('records multiple files in one call', () => {
      const result = recordFileTouches(['src/a.js', 'src/b.js', 'src/c.js']);

      expect(result.ok).toBe(true);
      const writeCall = safeWriteJSON.mock.calls[0][1];
      expect(writeCall.sessions['1'].files).toEqual(['src/a.js', 'src/b.js', 'src/c.js']);
    });

    it('returns error when session cannot be determined', () => {
      getCurrentSession.mockReturnValue(null);

      const result = recordFileTouches(['src/a.js']);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could not determine current session');
    });
  });

  describe('getSessionFiles', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    it('returns files for a specific session', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['src/a.js', 'src/b.js'] },
            2: { files: ['src/c.js'] },
          },
        },
      });

      const result = getSessionFiles('1');

      expect(result.ok).toBe(true);
      expect(result.files).toEqual(['src/a.js', 'src/b.js']);
    });

    it('returns empty array for unknown session', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });

      const result = getSessionFiles('unknown');

      expect(result.ok).toBe(true);
      expect(result.files).toEqual([]);
    });
  });

  describe('isSessionTouchValid', () => {
    it('returns false for null/undefined session data', () => {
      expect(isSessionTouchValid(null)).toBe(false);
      expect(isSessionTouchValid(undefined)).toBe(false);
    });

    it('returns true for valid session with alive PID', () => {
      isPidAlive.mockReturnValue(true);

      const result = isSessionTouchValid({
        pid: 12345,
        last_updated: new Date().toISOString(),
      });

      expect(result).toBe(true);
    });

    it('returns false for session with dead PID', () => {
      isPidAlive.mockReturnValue(false);

      const result = isSessionTouchValid({
        pid: 99999,
        last_updated: new Date().toISOString(),
      });

      expect(result).toBe(false);
    });

    it('returns false for expired session (TTL exceeded)', () => {
      isPidAlive.mockReturnValue(true);
      const expired = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5 hours ago

      const result = isSessionTouchValid({
        pid: 12345,
        last_updated: expired,
      });

      expect(result).toBe(false);
    });

    it('returns true for session without PID (legacy support)', () => {
      const result = isSessionTouchValid({
        last_updated: new Date().toISOString(),
      });

      expect(result).toBe(true);
    });
  });

  describe('getFileOverlaps', () => {
    beforeEach(() => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      fs.existsSync.mockReturnValue(true);
      isPidAlive.mockReturnValue(true);
    });

    it('returns files touched by multiple sessions', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: {
              files: ['shared.js', 'only1.js'],
              pid: 12345,
              last_updated: new Date().toISOString(),
            },
            2: {
              files: ['shared.js', 'only2.js'],
              pid: 12346,
              last_updated: new Date().toISOString(),
            },
          },
        },
      });

      const result = getFileOverlaps({ includeCurrentSession: true });

      expect(result.ok).toBe(true);
      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps[0].file).toBe('shared.js');
      expect(result.overlaps[0].sessions).toHaveLength(2);
    });

    it('excludes current session when includeCurrentSession=false', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['shared.js'], pid: 12345, last_updated: new Date().toISOString() },
            2: { files: ['shared.js'], pid: 12346, last_updated: new Date().toISOString() },
          },
        },
      });

      const result = getFileOverlaps({ includeCurrentSession: false });

      expect(result.ok).toBe(true);
      // Session 1 is excluded, so only session 2's files are counted
      expect(result.overlaps).toHaveLength(0); // No overlaps since only 1 session's files counted
    });

    it('skips invalid sessions', () => {
      isPidAlive.mockImplementation(pid => pid !== 99999);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['shared.js'], pid: 12345, last_updated: new Date().toISOString() },
            2: { files: ['shared.js'], pid: 99999, last_updated: new Date().toISOString() }, // Dead PID
          },
        },
      });

      const result = getFileOverlaps({ includeCurrentSession: true });

      expect(result.ok).toBe(true);
      expect(result.overlaps).toHaveLength(0); // No overlap since session 2 is invalid
    });
  });

  describe('getMyFileOverlaps', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      isPidAlive.mockReturnValue(true);
    });

    it('returns overlapping files with other sessions', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: {
              files: ['shared.js', 'only1.js'],
              pid: 12345,
              last_updated: new Date().toISOString(),
            },
            2: {
              files: ['shared.js', 'only2.js'],
              pid: 12346,
              path: '/project2',
              last_updated: new Date().toISOString(),
            },
          },
        },
      });

      const result = getMyFileOverlaps();

      expect(result.ok).toBe(true);
      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps[0].file).toBe('shared.js');
      expect(result.overlaps[0].otherSessions[0].id).toBe('2');
    });

    it('returns empty array when no current session', () => {
      getCurrentSession.mockReturnValue(null);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });

      const result = getMyFileOverlaps();

      expect(result.ok).toBe(true);
      expect(result.overlaps).toEqual([]);
    });

    it('returns empty array when session has no files', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: [], pid: 12345, last_updated: new Date().toISOString() },
          },
        },
      });

      const result = getMyFileOverlaps();

      expect(result.ok).toBe(true);
      expect(result.overlaps).toEqual([]);
    });
  });

  describe('cleanupStaleTouches', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    it('removes sessions with dead PIDs', () => {
      isPidAlive.mockImplementation(pid => pid === 12345);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 12345, last_updated: new Date().toISOString() },
            2: { files: ['b.js'], pid: 99999, last_updated: new Date().toISOString() }, // Dead
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: true });

      const result = cleanupStaleTouches();

      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(1);
      const writeCall = safeWriteJSON.mock.calls[0][1];
      expect(writeCall.sessions['1']).toBeDefined();
      expect(writeCall.sessions['2']).toBeUndefined();
    });

    it('removes expired sessions', () => {
      isPidAlive.mockReturnValue(true);
      const expired = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 12345, last_updated: new Date().toISOString() },
            2: { files: ['b.js'], pid: 12346, last_updated: expired }, // Expired
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: true });

      const result = cleanupStaleTouches();

      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(1);
    });

    it('does not write if nothing cleaned', () => {
      isPidAlive.mockReturnValue(true);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 12345, last_updated: new Date().toISOString() },
          },
        },
      });

      const result = cleanupStaleTouches();

      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(0);
      expect(safeWriteJSON).not.toHaveBeenCalled();
    });
  });

  describe('clearSessionFiles', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    it('removes current session entry', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 12345 },
            2: { files: ['b.js'], pid: 12346 },
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: true });

      const result = clearSessionFiles();

      expect(result.ok).toBe(true);
      const writeCall = safeWriteJSON.mock.calls[0][1];
      expect(writeCall.sessions['1']).toBeUndefined();
      expect(writeCall.sessions['2']).toBeDefined();
    });

    it('returns error when session cannot be determined', () => {
      getCurrentSession.mockReturnValue(null);

      const result = clearSessionFiles();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could not determine current session');
    });
  });

  describe('formatFileOverlaps', () => {
    it('returns empty string for empty array', () => {
      expect(formatFileOverlaps([])).toBe('');
      expect(formatFileOverlaps(null)).toBe('');
    });

    it('formats overlaps with session info', () => {
      const overlaps = [
        {
          file: 'src/shared.js',
          otherSessions: [{ id: '2', path: '/home/user/project', pid: 12346 }],
        },
      ];

      const result = formatFileOverlaps(overlaps);

      expect(result).toContain('File overlaps detected');
      expect(result).toContain('src/shared.js');
      expect(result).toContain('Session 2');
    });

    it('formats multiple overlaps', () => {
      const overlaps = [
        {
          file: 'src/a.js',
          otherSessions: [{ id: '2', path: '/project2', pid: 12346 }],
        },
        {
          file: 'src/b.js',
          otherSessions: [
            { id: '2', path: '/project2', pid: 12346 },
            { id: '3', path: '/project3', pid: 12347 },
          ],
        },
      ];

      const result = formatFileOverlaps(overlaps);

      expect(result).toContain('src/a.js');
      expect(result).toContain('src/b.js');
      expect(result).toContain('Session 2');
      expect(result).toContain('Session 3');
    });
  });

  describe('categorizeFile', () => {
    it('categorizes markdown files as docs', () => {
      expect(categorizeFile('README.md')).toBe('docs');
      expect(categorizeFile('docs/guide.md')).toBe('docs');
      expect(categorizeFile('CONTRIBUTING.MD')).toBe('docs');
    });

    it('categorizes test files correctly', () => {
      expect(categorizeFile('src/utils.test.js')).toBe('test');
      expect(categorizeFile('src/utils.spec.ts')).toBe('test');
      expect(categorizeFile('__tests__/utils.js')).toBe('test');
      expect(categorizeFile('tests/integration.js')).toBe('test');
    });

    it('categorizes schema/migration files correctly', () => {
      expect(categorizeFile('migrations/001.sql')).toBe('schema');
      expect(categorizeFile('prisma/schema.prisma')).toBe('schema');
      expect(categorizeFile('db/migration_001.js')).toBe('schema');
    });

    it('categorizes config files correctly', () => {
      expect(categorizeFile('package.json')).toBe('config');
      expect(categorizeFile('config.yaml')).toBe('config');
      expect(categorizeFile('.eslintrc')).toBe('config');
      expect(categorizeFile('tsconfig.json')).toBe('config');
    });

    it('defaults to source for other files', () => {
      expect(categorizeFile('src/components/Button.tsx')).toBe('source');
      expect(categorizeFile('lib/utils.js')).toBe('source');
      expect(categorizeFile('index.html')).toBe('source');
    });
  });

  describe('getMergeStrategy', () => {
    it('returns accept_both for docs', () => {
      const result = getMergeStrategy('docs');
      expect(result.strategy).toBe('accept_both');
    });

    it('returns accept_both for tests', () => {
      const result = getMergeStrategy('test');
      expect(result.strategy).toBe('accept_both');
    });

    it('returns take_newer for schema', () => {
      const result = getMergeStrategy('schema');
      expect(result.strategy).toBe('take_newer');
    });

    it('returns merge_keys for config', () => {
      const result = getMergeStrategy('config');
      expect(result.strategy).toBe('merge_keys');
    });

    it('returns intelligent_merge for source', () => {
      const result = getMergeStrategy('source');
      expect(result.strategy).toBe('intelligent_merge');
    });

    it('defaults to source strategy for unknown category', () => {
      const result = getMergeStrategy('unknown');
      expect(result.strategy).toBe('intelligent_merge');
    });
  });

  describe('recordFileTouch edge cases', () => {
    beforeEach(() => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      fs.existsSync.mockReturnValue(true);
    });

    it('returns error when file-touches.json cannot be read', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = recordFileTouch('test.js');

      expect(result.ok).toBe(false);
    });

    it('returns error when file-touches.json cannot be written', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = recordFileTouch('test.js');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Write failed');
    });
  });

  describe('recordFileTouches edge cases', () => {
    beforeEach(() => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      fs.existsSync.mockReturnValue(true);
    });

    it('returns error when file-touches.json cannot be read', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = recordFileTouches(['test.js']);

      expect(result.ok).toBe(false);
    });

    it('returns error when file-touches.json cannot be written', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = recordFileTouches(['test.js']);

      expect(result.ok).toBe(false);
    });

    it('normalizes absolute paths to relative', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { version: 1, sessions: {} },
      });
      safeWriteJSON.mockReturnValue({ ok: true });
      getProjectRoot.mockReturnValue('/mock/project');

      const result = recordFileTouches(['/mock/project/src/test.js'], { rootDir: '/mock/project' });

      expect(result.ok).toBe(true);
      const writeCall = safeWriteJSON.mock.calls[0][1];
      expect(writeCall.sessions['1'].files).toContain('src/test.js');
    });
  });

  describe('getSessionFiles edge cases', () => {
    it('returns error when file-touches.json cannot be read', () => {
      fs.existsSync.mockReturnValue(true);
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = getSessionFiles('1');

      expect(result.ok).toBe(false);
    });
  });

  describe('getFileOverlaps edge cases', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      isPidAlive.mockReturnValue(true);
    });

    it('returns error when file-touches.json cannot be read', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = getFileOverlaps();

      expect(result.ok).toBe(false);
    });

    it('handles missing current session gracefully', () => {
      getCurrentSession.mockReturnValue(null);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 12345, last_updated: new Date().toISOString() },
          },
        },
      });

      const result = getFileOverlaps({ includeCurrentSession: true });

      expect(result.ok).toBe(true);
    });
  });

  describe('getMyFileOverlaps edge cases', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      isPidAlive.mockReturnValue(true);
    });

    it('returns error when file-touches.json cannot be read', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = getMyFileOverlaps();

      expect(result.ok).toBe(false);
    });

    it('returns empty when session not in file-touches.json', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            2: { files: ['a.js'], pid: 12346, last_updated: new Date().toISOString() },
          },
        },
      });

      const result = getMyFileOverlaps();

      expect(result.ok).toBe(true);
      expect(result.overlaps).toEqual([]);
    });
  });

  describe('cleanupStaleTouches edge cases', () => {
    it('returns error when file-touches.json cannot be read', () => {
      fs.existsSync.mockReturnValue(true);
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = cleanupStaleTouches();

      expect(result.ok).toBe(false);
    });

    it('returns error when file-touches.json cannot be written', () => {
      fs.existsSync.mockReturnValue(true);
      isPidAlive.mockReturnValue(false);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 99999, last_updated: new Date().toISOString() },
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = cleanupStaleTouches();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Write failed');
    });
  });

  describe('clearSessionFiles edge cases', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    it('returns error when file-touches.json cannot be read', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({ ok: false, error: 'Read failed' });

      const result = clearSessionFiles();

      expect(result.ok).toBe(false);
    });

    it('returns error when file-touches.json cannot be written', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {
            1: { files: ['a.js'], pid: 12345 },
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = clearSessionFiles();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Write failed');
    });

    it('succeeds when session not in file-touches.json', () => {
      getCurrentSession.mockReturnValue({ session_id: '1', pid: 12345, path: '/project' });
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          version: 1,
          sessions: {},
        },
      });

      const result = clearSessionFiles();

      expect(result.ok).toBe(true);
    });
  });

  describe('DEFAULT_TOUCH_TTL_HOURS', () => {
    it('exports the constant', () => {
      expect(DEFAULT_TOUCH_TTL_HOURS).toBe(4);
    });
  });
});
