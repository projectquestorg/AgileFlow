/**
 * Tests for configure-utils.js
 */

const fs = require('fs');
const path = require('path');

// Mock fs and path
jest.mock('fs');

// Import module after mocking
const {
  c,
  log,
  success,
  warn,
  error,
  info,
  header,
  ensureDir,
  readJSON,
  writeJSON,
  copyTemplate,
  updateGitignore,
} = require('../../../scripts/lib/configure-utils');

describe('configure-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('colors object (c)', () => {
    it('exports color codes', () => {
      expect(c.reset).toBe('\x1b[0m');
      expect(c.dim).toBe('\x1b[2m');
      expect(c.bold).toBe('\x1b[1m');
      expect(c.green).toBe('\x1b[32m');
      expect(c.yellow).toBe('\x1b[33m');
      expect(c.red).toBe('\x1b[31m');
      expect(c.cyan).toBe('\x1b[36m');
    });
  });

  describe('logging functions', () => {
    it('log outputs message with color and reset', () => {
      log('test message', c.green);
      expect(console.log).toHaveBeenCalledWith(`${c.green}test message${c.reset}`);
    });

    it('log works without color', () => {
      log('plain message');
      expect(console.log).toHaveBeenCalledWith(`plain message${c.reset}`);
    });

    it('success adds checkmark emoji', () => {
      success('done');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('done'));
    });

    it('warn adds warning emoji', () => {
      warn('warning message');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️'));
    });

    it('error adds error emoji', () => {
      error('error message');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('info adds info emoji', () => {
      info('info message');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ℹ️'));
    });

    it('header adds newline and styling', () => {
      header('Section Title');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('\n'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Section Title'));
    });
  });

  describe('ensureDir', () => {
    it('creates directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});

      ensureDir('/path/to/dir');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/path/to/dir', { recursive: true });
    });

    it('does not create directory if it exists', () => {
      fs.existsSync.mockReturnValue(true);

      ensureDir('/path/to/dir');

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('readJSON', () => {
    it('returns parsed JSON from file', () => {
      fs.readFileSync.mockReturnValue('{"key": "value"}');

      const result = readJSON('/path/to/file.json');

      expect(result).toEqual({ key: 'value' });
    });

    it('returns null on error', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = readJSON('/path/to/nonexistent.json');

      expect(result).toBeNull();
    });

    it('returns null on invalid JSON', () => {
      fs.readFileSync.mockReturnValue('not valid json');

      const result = readJSON('/path/to/invalid.json');

      expect(result).toBeNull();
    });
  });

  describe('writeJSON', () => {
    it('writes JSON data to file with formatting', () => {
      fs.existsSync.mockReturnValue(true); // Directory exists
      fs.writeFileSync.mockImplementation(() => {});

      writeJSON('/path/to/file.json', { key: 'value' });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/file.json',
        expect.stringContaining('"key": "value"')
      );
    });

    it('creates parent directory if needed', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      writeJSON('/path/to/new/file.json', { data: 123 });

      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('copyTemplate', () => {
    it('copies template from first found location', () => {
      fs.existsSync.mockImplementation(p => p.includes('templates'));
      fs.copyFileSync.mockImplementation(() => {});
      fs.chmodSync.mockImplementation(() => {});

      const result = copyTemplate('template.txt', '/dest/path.txt');

      expect(result).toBe(true);
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('returns false if template not found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = copyTemplate('missing.txt', '/dest/path.txt');

      expect(result).toBe(false);
    });

    it('handles chmod errors gracefully', () => {
      fs.existsSync.mockImplementation(p => p.includes('templates'));
      fs.copyFileSync.mockImplementation(() => {});
      fs.chmodSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = copyTemplate('template.txt', '/dest/path.txt');

      expect(result).toBe(true); // Should still succeed
    });
  });

  describe('updateGitignore', () => {
    it('adds missing entries to gitignore', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('existing-entry\n');
      fs.writeFileSync.mockImplementation(() => {});

      updateGitignore();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '.gitignore',
        expect.stringContaining('.claude/settings.local.json')
      );
    });

    it('creates gitignore if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      fs.writeFileSync.mockImplementation(() => {});

      // This will cause readFileSync to throw, which needs handling
      // The function checks existsSync first
      fs.existsSync.mockImplementation(p => !p.includes('.gitignore'));

      updateGitignore();

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('does not write if all entries already exist', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        '.claude/settings.local.json\n' +
          '.claude/activity.log\n' +
          '.claude/context.log\n' +
          '.claude/hook.log\n' +
          '.claude/prompt-log.txt\n' +
          '.claude/session.log\n'
      );

      updateGitignore();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
