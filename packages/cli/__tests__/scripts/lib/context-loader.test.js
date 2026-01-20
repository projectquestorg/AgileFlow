/**
 * Tests for context-loader.js - Data loading module for obtain-context
 */

const path = require('path');

// Create mock functions
const mockReadFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockPromisesReadFile = jest.fn();
const mockPromisesReaddir = jest.fn();
const mockExecSync = jest.fn();
const mockExec = jest.fn();

// Mock fs before requiring the module
jest.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  writeFileSync: jest.fn(),
  promises: {
    readFile: mockPromisesReadFile,
    readdir: mockPromisesReaddir,
  },
}));

jest.mock('child_process', () => ({
  execSync: mockExecSync,
  exec: mockExec,
}));

// Mock file-cache to avoid issues
jest.mock('../../../lib/file-cache', () => ({
  readJSONCached: null,
  readFileCached: null,
}));

const {
  safeRead,
  safeReadJSON,
  safeLs,
  safeExec,
  safeReadAsync,
  safeReadJSONAsync,
  safeLsAsync,
  safeExecAsync,
  RESEARCH_COMMANDS,
  determineSectionsToLoad,
  parseCommandArgs,
  getCommandType,
  isMultiSessionEnvironment,
} = require('../../../scripts/lib/context-loader');

describe('context-loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('safeRead', () => {
    it('returns file content when file exists', () => {
      mockReadFileSync.mockReturnValue('file content');
      expect(safeRead('/path/to/file')).toBe('file content');
    });

    it('returns null when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(safeRead('/nonexistent')).toBeNull();
    });
  });

  describe('safeReadJSON', () => {
    it('returns parsed JSON when file exists', () => {
      mockReadFileSync.mockReturnValue('{"key": "value"}');
      const result = safeReadJSON('/path/to/file.json');
      expect(result).toEqual({ key: 'value' });
    });

    it('returns null when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(safeReadJSON('/nonexistent.json')).toBeNull();
    });

    it('returns null when JSON is invalid', () => {
      mockReadFileSync.mockReturnValue('invalid json');
      expect(safeReadJSON('/invalid.json')).toBeNull();
    });
  });

  describe('safeLs', () => {
    it('returns directory listing', () => {
      mockReaddirSync.mockReturnValue(['file1.txt', 'file2.txt']);
      expect(safeLs('/some/dir')).toEqual(['file1.txt', 'file2.txt']);
    });

    it('returns empty array when directory does not exist', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(safeLs('/nonexistent')).toEqual([]);
    });
  });

  describe('safeExec', () => {
    it('returns command output', () => {
      mockExecSync.mockReturnValue('  output  ');
      expect(safeExec('echo test')).toBe('output');
    });

    it('returns null when command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });
      expect(safeExec('invalid-command')).toBeNull();
    });
  });

  describe('safeReadAsync', () => {
    it('returns file content asynchronously', async () => {
      mockPromisesReadFile.mockResolvedValue('async content');
      const result = await safeReadAsync('/path/to/file');
      expect(result).toBe('async content');
    });

    it('returns null when file does not exist', async () => {
      mockPromisesReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await safeReadAsync('/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('safeReadJSONAsync', () => {
    it('returns parsed JSON asynchronously', async () => {
      mockPromisesReadFile.mockResolvedValue('{"async": true}');
      const result = await safeReadJSONAsync('/path/to/file.json');
      expect(result).toEqual({ async: true });
    });

    it('returns null when JSON is invalid', async () => {
      mockPromisesReadFile.mockResolvedValue('not json');
      const result = await safeReadJSONAsync('/invalid.json');
      expect(result).toBeNull();
    });
  });

  describe('safeLsAsync', () => {
    it('returns directory listing asynchronously', async () => {
      mockPromisesReaddir.mockResolvedValue(['a.txt', 'b.txt']);
      const result = await safeLsAsync('/some/dir');
      expect(result).toEqual(['a.txt', 'b.txt']);
    });

    it('returns empty array when directory does not exist', async () => {
      mockPromisesReaddir.mockRejectedValue(new Error('ENOENT'));
      const result = await safeLsAsync('/nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('safeExecAsync', () => {
    it('returns command output asynchronously', async () => {
      mockExec.mockImplementation((cmd, opts, cb) => cb(null, '  result  '));
      const result = await safeExecAsync('echo test');
      expect(result).toBe('result');
    });

    it('returns null when command fails', async () => {
      mockExec.mockImplementation((cmd, opts, cb) => cb(new Error('fail'), ''));
      const result = await safeExecAsync('bad-cmd');
      expect(result).toBeNull();
    });
  });

  describe('RESEARCH_COMMANDS', () => {
    it('includes expected research commands', () => {
      expect(RESEARCH_COMMANDS).toContain('research');
      expect(RESEARCH_COMMANDS).toContain('ideate');
      expect(RESEARCH_COMMANDS).toContain('mentor');
      expect(RESEARCH_COMMANDS).toContain('rpi');
    });
  });

  describe('determineSectionsToLoad', () => {
    it('loads all sections when lazy loading is disabled', () => {
      const result = determineSectionsToLoad('babysit', null, false);
      expect(result.researchContent).toBe(true);
      expect(result.sessionClaims).toBe(true);
      expect(result.fileOverlaps).toBe(true);
    });

    it('loads all sections when config.enabled is false', () => {
      const result = determineSectionsToLoad('babysit', { enabled: false }, false);
      expect(result.researchContent).toBe(true);
    });

    it('loads research for research commands', () => {
      const result = determineSectionsToLoad(
        'research',
        { enabled: true, researchNotes: 'conditional' },
        false
      );
      expect(result.researchContent).toBe(true);
    });

    it('skips research for non-research commands', () => {
      const result = determineSectionsToLoad(
        'babysit',
        { enabled: true, researchNotes: 'conditional' },
        false
      );
      expect(result.researchContent).toBe(false);
    });

    it('loads session claims when always configured', () => {
      const result = determineSectionsToLoad(
        'babysit',
        { enabled: true, sessionClaims: 'always' },
        false
      );
      expect(result.sessionClaims).toBe(true);
    });

    it('loads session claims when multi-session', () => {
      const result = determineSectionsToLoad(
        'babysit',
        { enabled: true, sessionClaims: 'conditional' },
        true
      );
      expect(result.sessionClaims).toBe(true);
    });

    it('skips session claims when single-session and conditional', () => {
      const result = determineSectionsToLoad(
        'babysit',
        { enabled: true, sessionClaims: 'conditional' },
        false
      );
      expect(result.sessionClaims).toBe(false);
    });

    it('loads file overlaps when multi-session', () => {
      const result = determineSectionsToLoad(
        'babysit',
        { enabled: true, fileOverlaps: 'conditional' },
        true
      );
      expect(result.fileOverlaps).toBe(true);
    });
  });

  describe('parseCommandArgs', () => {
    it('parses empty args', () => {
      mockExistsSync.mockReturnValue(false);
      const result = parseCommandArgs([]);
      expect(result.activeSections).toEqual([]);
      expect(result.params).toEqual({});
    });

    it('parses MODE=loop', () => {
      mockExistsSync.mockReturnValue(false);
      const result = parseCommandArgs(['MODE=loop']);
      expect(result.activeSections).toContain('loop-mode');
      expect(result.params.MODE).toBe('loop');
    });

    it('parses VISUAL=true', () => {
      mockExistsSync.mockReturnValue(false);
      const result = parseCommandArgs(['VISUAL=true']);
      expect(result.activeSections).toContain('visual-e2e');
      expect(result.params.VISUAL).toBe('true');
    });

    it('parses QUERY parameter', () => {
      mockExistsSync.mockReturnValue(false);
      const result = parseCommandArgs(['QUERY=auth files']);
      expect(result.activeSections).toContain('query-mode');
      expect(result.params.QUERY).toBe('auth files');
    });

    it('handles multiple parameters', () => {
      mockExistsSync.mockReturnValue(false);
      const result = parseCommandArgs(['MODE=loop', 'VISUAL=true', 'EPIC=EP-0023']);
      expect(result.activeSections).toContain('loop-mode');
      expect(result.activeSections).toContain('visual-e2e');
      expect(result.params.EPIC).toBe('EP-0023');
    });

    it('uppercases parameter keys', () => {
      mockExistsSync.mockReturnValue(false);
      const result = parseCommandArgs(['mode=loop']);
      expect(result.params.MODE).toBe('loop');
    });

    it('detects multi-session from registry', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sessions: { 1: {}, 2: {} },
        })
      );
      const result = parseCommandArgs([]);
      expect(result.activeSections).toContain('multi-session');
    });
  });

  describe('getCommandType', () => {
    it('returns interactive by default', () => {
      mockExistsSync.mockReturnValue(false);
      expect(getCommandType('unknown-cmd')).toBe('interactive');
    });

    it('extracts type from frontmatter', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('---\nname: test\ntype: output-only\n---\nContent');
      expect(getCommandType('test-cmd')).toBe('output-only');
    });

    it('handles nested command paths', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('---\ntype: nested\n---');
      const result = getCommandType('research/ask');
      expect(result).toBe('nested');
    });
  });

  describe('isMultiSessionEnvironment', () => {
    it('returns false when registry does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(isMultiSessionEnvironment()).toBe(false);
    });

    it('returns false for single session', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sessions: { 1: {} },
        })
      );
      expect(isMultiSessionEnvironment()).toBe(false);
    });

    it('returns true for multiple sessions', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sessions: { 1: {}, 2: {} },
        })
      );
      expect(isMultiSessionEnvironment()).toBe(true);
    });

    it('returns false on parse error', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');
      expect(isMultiSessionEnvironment()).toBe(false);
    });
  });
});
