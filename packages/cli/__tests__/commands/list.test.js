/**
 * Tests for list.js command
 *
 * Tests the list command structure, options, and behavior
 */

const path = require('path');

// Mock instances
const mockInstallerInstance = {
  getStatus: jest.fn(),
};

// Mock dependencies
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('../../tools/cli/lib/ui', () => ({
  displayLogo: jest.fn(),
  displaySection: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../tools/cli/installers/core/installer', () => ({
  Installer: jest.fn().mockImplementation(() => mockInstallerInstance),
}));

jest.mock('../../scripts/lib/frontmatter-parser', () => ({
  parseFrontmatter: jest.fn(() => ({ description: 'Test description' })),
}));

jest.mock('js-yaml', () => ({
  load: jest.fn(() => ({ description: 'Test expert', version: '1.0.0' })),
}));

const fs = require('fs-extra');
const listCommand = require('../../tools/cli/commands/list');
const { displayLogo, displaySection, warning } = require('../../tools/cli/lib/ui');

describe('list command', () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit.mockClear();

    // Default mock setup - installed state
    mockInstallerInstance.getStatus.mockResolvedValue({
      installed: true,
      path: '/test/.agileflow',
      version: '2.88.0',
    });

    // File system defaults
    fs.pathExists.mockResolvedValue(true);
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false });
    fs.readFile.mockResolvedValue('---\ndescription: Test\n---\n# Content');
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(listCommand.name).toBe('list');
    });

    it('has description', () => {
      expect(listCommand.description).toBeTruthy();
      expect(typeof listCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(listCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof listCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = listCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });

    it('includes commands option', () => {
      const cmdOption = listCommand.options.find(opt => opt[0].includes('--commands'));
      expect(cmdOption).toBeTruthy();
    });

    it('includes agents option', () => {
      const agentOption = listCommand.options.find(opt => opt[0].includes('--agents'));
      expect(agentOption).toBeTruthy();
    });

    it('includes skills option', () => {
      const skillOption = listCommand.options.find(opt => opt[0].includes('--skills'));
      expect(skillOption).toBeTruthy();
    });

    it('includes experts option', () => {
      const expertOption = listCommand.options.find(opt => opt[0].includes('--experts'));
      expect(expertOption).toBeTruthy();
    });

    it('includes json option', () => {
      const jsonOption = listCommand.options.find(opt => opt[0].includes('--json'));
      expect(jsonOption).toBeTruthy();
    });

    it('includes compact option', () => {
      const compactOption = listCommand.options.find(opt => opt[0].includes('--compact'));
      expect(compactOption).toBeTruthy();
    });
  });

  describe('not installed', () => {
    it('warns when not installed', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      await listCommand.action({});

      expect(warning).toHaveBeenCalledWith('No AgileFlow installation found in this directory');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when not installed with --json', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await listCommand.action({ json: true });

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ error: 'Not installed' }));
      consoleSpy.mockRestore();
    });
  });

  describe('full output', () => {
    it('displays logo', async () => {
      await listCommand.action({});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('exits with 0 on success', async () => {
      await listCommand.action({});

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('listing commands', () => {
    it('lists commands when --commands flag is set', async () => {
      fs.readdir.mockResolvedValueOnce(['test.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });

      await listCommand.action({ commands: true });

      expect(fs.readdir).toHaveBeenCalled();
    });
  });

  describe('listing agents', () => {
    it('lists agents when --agents flag is set', async () => {
      fs.readdir.mockResolvedValueOnce(['agent.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });

      await listCommand.action({ agents: true });

      expect(fs.readdir).toHaveBeenCalled();
    });
  });

  describe('listing skills', () => {
    beforeEach(() => {
      fs.readdir.mockImplementation(async (p, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: 'my-skill', isDirectory: () => true }];
        }
        return ['SKILL.md'];
      });
    });

    it('lists skills when --skills flag is set', async () => {
      await listCommand.action({ skills: true });

      expect(fs.readdir).toHaveBeenCalled();
    });
  });

  describe('listing experts', () => {
    beforeEach(() => {
      fs.readdir.mockImplementation(async (p, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: 'my-expert', isDirectory: () => true }];
        }
        return ['expertise.yaml'];
      });
    });

    it('lists experts when --experts flag is set', async () => {
      await listCommand.action({ experts: true });

      expect(fs.readdir).toHaveBeenCalled();
    });
  });

  describe('JSON output', () => {
    it('outputs JSON when --json flag is set', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await listCommand.action({ json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
      consoleSpy.mockRestore();
    });
  });

  describe('compact output', () => {
    it('outputs compact format when --compact flag is set', async () => {
      fs.readdir.mockResolvedValue(['test.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await listCommand.action({ compact: true, commands: true });

      expect(displayLogo).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('custom directory', () => {
    it('uses provided directory', async () => {
      await listCommand.action({ directory: '/custom/path' });

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(path.resolve('/custom/path'));
    });
  });
});
