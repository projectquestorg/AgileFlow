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
const mockSpawnSync = jest.fn();
const mockSpawn = jest.fn();

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
  spawnSync: mockSpawnSync,
  spawn: mockSpawn,
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
  SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS,
  SAFEEXEC_BLOCKED_PATTERNS,
  configureSafeExecLogger,
  parseGitCommand,
  isGitCommandAllowed,
  isCommandAllowed,
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
    it('returns command output for whitelisted commands', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: '  output  ', stderr: '' });
      expect(safeExec('git status')).toBe('output');
    });

    it('uses spawnSync with shell: false (US-0187)', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'main\n', stderr: '' });
      safeExec('git branch --show-current');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['branch', '--show-current'],
        expect.objectContaining({ shell: false })
      );
    });

    it('returns null when command fails', () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'error' });
      expect(safeExec('git status')).toBeNull();
    });

    it('returns null when spawn errors', () => {
      mockSpawnSync.mockReturnValue({ error: new Error('spawn failed'), stdout: '', stderr: '' });
      expect(safeExec('git status')).toBeNull();
    });

    it('returns null for non-git commands', () => {
      expect(safeExec('echo test')).toBeNull();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('returns null for non-whitelisted git subcommands', () => {
      expect(safeExec('git push origin main')).toBeNull();
      expect(safeExec('git checkout branch')).toBeNull();
      expect(safeExec('git reset --hard')).toBeNull();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('allows bypass whitelist option for git commands', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: '  output  ', stderr: '' });
      expect(safeExec('git push', { bypassWhitelist: true })).toBe('output');
      expect(mockSpawnSync).toHaveBeenCalled();
    });

    it('blocks commands with dangerous patterns', () => {
      expect(safeExec('git status | grep foo')).toBeNull();
      expect(safeExec('git status; rm -rf /')).toBeNull();
      expect(safeExec('git status && echo hi')).toBeNull();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('allows read-only git subcommands', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'output', stderr: '' });
      expect(safeExec('git log -1')).toBe('output');
      expect(safeExec('git diff HEAD')).toBe('output');
      expect(safeExec('git show HEAD')).toBe('output');
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
    // Helper to create mock spawn process
    const createMockProcess = (stdout, code, stderr = '') => {
      const events = {};
      const proc = {
        stdout: {
          on: (event, cb) => {
            if (event === 'data') setTimeout(() => cb(stdout), 0);
          },
        },
        stderr: {
          on: (event, cb) => {
            if (event === 'data' && stderr) setTimeout(() => cb(stderr), 0);
          },
        },
        on: (event, cb) => {
          events[event] = cb;
          if (event === 'close') setTimeout(() => cb(code), 10);
        },
      };
      return proc;
    };

    it('returns command output asynchronously for whitelisted commands', async () => {
      mockSpawn.mockReturnValue(createMockProcess('  result  ', 0));
      const result = await safeExecAsync('git branch');
      expect(result).toBe('result');
    });

    it('uses spawn with shell: false (US-0187)', async () => {
      mockSpawn.mockReturnValue(createMockProcess('main', 0));
      await safeExecAsync('git branch --show-current');
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['branch', '--show-current'],
        expect.objectContaining({ shell: false })
      );
    });

    it('returns null when command fails', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 1, 'error'));
      const result = await safeExecAsync('git branch');
      expect(result).toBeNull();
    });

    it('returns null for non-git commands', async () => {
      const result = await safeExecAsync('echo test');
      expect(result).toBeNull();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('allows bypass whitelist option for git commands', async () => {
      mockSpawn.mockReturnValue(createMockProcess('  output  ', 0));
      const result = await safeExecAsync('git push', { bypassWhitelist: true });
      expect(result).toBe('output');
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('blocks commands with dangerous patterns', async () => {
      const result1 = await safeExecAsync('git log | head');
      const result2 = await safeExecAsync('git status; cat /etc/passwd');
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('Command Whitelist (US-0120, US-0187)', () => {
    describe('SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS', () => {
      it('includes read-only git subcommands', () => {
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.branch).toBeDefined();
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.log).toBe(true);
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.status).toBeDefined();
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.diff).toBe(true);
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS['rev-parse']).toBeDefined();
      });

      it('does NOT include write operations', () => {
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.push).toBeUndefined();
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.checkout).toBeUndefined();
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.reset).toBeUndefined();
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS.merge).toBeUndefined();
      });

      it('is an object with subcommand configs', () => {
        expect(typeof SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS).toBe('object');
        expect(SAFEEXEC_ALLOWED_GIT_SUBCOMMANDS).not.toBeNull();
      });
    });

    describe('SAFEEXEC_BLOCKED_PATTERNS', () => {
      it('includes dangerous patterns', () => {
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('|'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test(';'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('&&'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('||'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('`cmd`'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('$(cmd)'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('>'))).toBe(true);
        expect(SAFEEXEC_BLOCKED_PATTERNS.some(p => p.test('<'))).toBe(true);
      });

      it('is an array of RegExp', () => {
        expect(Array.isArray(SAFEEXEC_BLOCKED_PATTERNS)).toBe(true);
        SAFEEXEC_BLOCKED_PATTERNS.forEach(pattern => {
          expect(pattern instanceof RegExp).toBe(true);
        });
      });
    });

    describe('parseGitCommand (US-0187)', () => {
      it('parses valid git commands', () => {
        const result = parseGitCommand('git branch --show-current');
        expect(result.ok).toBe(true);
        expect(result.data.executable).toBe('git');
        expect(result.data.subcommand).toBe('branch');
        expect(result.data.args).toEqual(['--show-current']);
        expect(result.data.fullArgs).toEqual(['branch', '--show-current']);
      });

      it('returns error for non-git commands', () => {
        const result = parseGitCommand('echo hello');
        expect(result.ok).toBe(false);
        expect(result.error).toBe('Only git commands are supported');
      });

      it('returns error for bare git command', () => {
        const result = parseGitCommand('git');
        expect(result.ok).toBe(false);
        expect(result.error).toBe('Git subcommand required');
      });
    });

    describe('isGitCommandAllowed (US-0187)', () => {
      it('allows read-only git subcommands', () => {
        expect(isGitCommandAllowed('status', []).allowed).toBe(true);
        expect(isGitCommandAllowed('log', ['-1']).allowed).toBe(true);
        expect(isGitCommandAllowed('diff', ['HEAD']).allowed).toBe(true);
        expect(isGitCommandAllowed('show', ['HEAD']).allowed).toBe(true);
      });

      it('allows branch with allowed args', () => {
        expect(isGitCommandAllowed('branch', ['--show-current']).allowed).toBe(true);
        expect(isGitCommandAllowed('branch', ['-a']).allowed).toBe(true);
      });

      it('blocks non-whitelisted git subcommands', () => {
        expect(isGitCommandAllowed('push', ['origin', 'main']).allowed).toBe(false);
        expect(isGitCommandAllowed('checkout', ['branch']).allowed).toBe(false);
        expect(isGitCommandAllowed('reset', ['--hard']).allowed).toBe(false);
      });

      it('blocks config write operations', () => {
        expect(isGitCommandAllowed('config', ['--local', 'user.name']).allowed).toBe(false);
        expect(isGitCommandAllowed('config', ['--get']).allowed).toBe(true);
      });
    });

    describe('isCommandAllowed (legacy wrapper)', () => {
      it('allows whitelisted git commands', () => {
        expect(isCommandAllowed('git status')).toEqual({ allowed: true });
        expect(isCommandAllowed('git branch --show-current')).toEqual({ allowed: true });
        expect(isCommandAllowed('git log -1 --format="%h"')).toEqual({ allowed: true });
        expect(isCommandAllowed('git diff HEAD~1')).toEqual({ allowed: true });
        expect(isCommandAllowed('git rev-parse HEAD')).toEqual({ allowed: true });
      });

      it('blocks node commands (no longer supported)', () => {
        const result = isCommandAllowed('node script.js');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Only git commands are supported');
      });

      it('blocks non-git commands', () => {
        const result = isCommandAllowed('echo hello');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Only git commands are supported');
      });

      it('blocks commands with dangerous patterns', () => {
        expect(isCommandAllowed('git status | grep foo').allowed).toBe(false);
        expect(isCommandAllowed('git status; rm -rf /').allowed).toBe(false);
        expect(isCommandAllowed('git status && echo done').allowed).toBe(false);
        expect(isCommandAllowed('git status || exit').allowed).toBe(false);
        expect(isCommandAllowed('git status `whoami`').allowed).toBe(false);
        expect(isCommandAllowed('git status $(id)').allowed).toBe(false);
        expect(isCommandAllowed('git log > output.txt').allowed).toBe(false);
        expect(isCommandAllowed('git diff < input.txt').allowed).toBe(false);
      });

      it('blocks dangerous commands even if they start with git', () => {
        expect(isCommandAllowed('git push; rm -rf /').allowed).toBe(false);
        expect(isCommandAllowed('git status && sudo rm -rf /').allowed).toBe(false);
      });

      it('returns appropriate reasons', () => {
        const pipeResult = isCommandAllowed('git status | head');
        expect(pipeResult.allowed).toBe(false);
        expect(pipeResult.reason).toMatch(/Blocked pattern/);

        const nonWhitelisted = isCommandAllowed('ls -la');
        expect(nonWhitelisted.allowed).toBe(false);
        expect(nonWhitelisted.reason).toBe('Only git commands are supported');
      });

      it('handles invalid input', () => {
        expect(isCommandAllowed(null).allowed).toBe(false);
        expect(isCommandAllowed(undefined).allowed).toBe(false);
        expect(isCommandAllowed('').allowed).toBe(false);
        expect(isCommandAllowed(123).allowed).toBe(false);
      });
    });

    describe('configureSafeExecLogger', () => {
      it('accepts a logger function', () => {
        const mockLogger = jest.fn();
        expect(() => configureSafeExecLogger(mockLogger)).not.toThrow();
      });

      it('accepts null to disable logging', () => {
        expect(() => configureSafeExecLogger(null)).not.toThrow();
      });

      it('logger receives log calls when command is blocked', () => {
        const mockLogger = jest.fn();
        configureSafeExecLogger(mockLogger);

        // Try a non-git command (blocked as invalid format)
        safeExec('echo dangerous');

        expect(mockLogger).toHaveBeenCalledWith(
          'warn',
          'Invalid command format',
          expect.objectContaining({
            error: 'Only git commands are supported',
          })
        );

        // Clean up
        configureSafeExecLogger(null);
      });

      it('logger receives log calls when git subcommand is blocked', () => {
        const mockLogger = jest.fn();
        configureSafeExecLogger(mockLogger);

        // Try a blocked git subcommand
        safeExec('git push origin main');

        expect(mockLogger).toHaveBeenCalledWith(
          'warn',
          'Command blocked by whitelist',
          expect.objectContaining({
            reason: expect.stringContaining('not in whitelist'),
          })
        );

        // Clean up
        configureSafeExecLogger(null);
      });

      it('logger receives log calls on successful execution', () => {
        const mockLogger = jest.fn();
        configureSafeExecLogger(mockLogger);
        mockSpawnSync.mockReturnValue({ status: 0, stdout: 'output', stderr: '' });

        safeExec('git status');

        expect(mockLogger).toHaveBeenCalledWith('debug', 'Executing command', expect.any(Object));
        expect(mockLogger).toHaveBeenCalledWith('debug', 'Command succeeded', expect.any(Object));

        // Clean up
        configureSafeExecLogger(null);
      });
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
