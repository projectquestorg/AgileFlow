/**
 * Tests for status.js command
 *
 * Tests the status command structure, options, and behavior
 */

const path = require('path');

// Mock instances
const mockInstallerInstance = {
  getStatus: jest.fn(),
  countInstalledItems: jest.fn(),
};

// Mock dependencies
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
}));

jest.mock('../../tools/cli/lib/ui', () => ({
  displayLogo: jest.fn(),
  displaySection: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../tools/cli/lib/version-checker', () => ({
  checkForUpdate: jest.fn(),
}));

jest.mock('../../tools/cli/installers/core/installer', () => ({
  Installer: jest.fn().mockImplementation(() => mockInstallerInstance),
}));

jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
  }));
});

const fs = require('fs-extra');
const statusCommand = require('../../tools/cli/commands/status');
const { displayLogo, displaySection, success, warning, info } = require('../../tools/cli/lib/ui');
const { checkForUpdate } = require('../../tools/cli/lib/version-checker');

describe('status command', () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit.mockClear();

    // Default mock setup - installed state
    mockInstallerInstance.getStatus.mockResolvedValue({
      installed: true,
      path: '/test/.agileflow',
      version: '2.88.0',
      ides: ['claude-code'],
    });

    mockInstallerInstance.countInstalledItems.mockResolvedValue({
      agents: 27,
      commands: 71,
      skills: 5,
    });

    // File system defaults
    fs.pathExists.mockResolvedValue(true);

    // Version checker defaults
    checkForUpdate.mockResolvedValue({
      updateAvailable: false,
      current: '2.88.0',
      latest: '2.88.0',
    });
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(statusCommand.name).toBe('status');
    });

    it('has description', () => {
      expect(statusCommand.description).toBeTruthy();
      expect(typeof statusCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(statusCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof statusCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = statusCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });
  });

  describe('installed state', () => {
    it('displays logo on start', async () => {
      await statusCommand.action({});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('displays installation status section', async () => {
      await statusCommand.action({});

      expect(displaySection).toHaveBeenCalledWith('Installation Status');
    });

    it('reports installed core', async () => {
      await statusCommand.action({});

      expect(info).toHaveBeenCalledWith(expect.stringContaining('27 agents'));
      expect(info).toHaveBeenCalledWith(expect.stringContaining('71 commands'));
      expect(info).toHaveBeenCalledWith(expect.stringContaining('5 skills'));
    });

    it('checks configured IDEs', async () => {
      await statusCommand.action({});

      // Should check for IDE config existence
      expect(fs.pathExists).toHaveBeenCalled();
    });

    it('shows success for existing IDE config', async () => {
      await statusCommand.action({});

      expect(success).toHaveBeenCalledWith('Claude Code');
    });

    it('shows warning for missing IDE config', async () => {
      fs.pathExists.mockImplementation(p => {
        if (p.includes('.claude')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await statusCommand.action({});

      expect(warning).toHaveBeenCalledWith('Claude Code (config missing)');
    });
  });

  describe('not installed', () => {
    it('warns when not installed', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      await statusCommand.action({});

      expect(warning).toHaveBeenCalledWith('No AgileFlow installation found in this directory');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('update checking', () => {
    it('checks for updates', async () => {
      await statusCommand.action({});

      expect(checkForUpdate).toHaveBeenCalled();
    });

    it('shows update available message', async () => {
      checkForUpdate.mockResolvedValue({
        updateAvailable: true,
        current: '2.87.0',
        latest: '2.88.0',
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await statusCommand.action({});

      // Check for update-related output
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Update Available'));
      consoleSpy.mockRestore();
    });

    it('shows latest version message', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await statusCommand.action({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('latest version'));
      consoleSpy.mockRestore();
    });

    it('handles update check error', async () => {
      checkForUpdate.mockResolvedValue({
        updateAvailable: false,
        error: 'Could not check for updates',
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await statusCommand.action({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not check'));
      consoleSpy.mockRestore();
    });
  });

  describe('exit codes', () => {
    it('exits 0 on success', async () => {
      await statusCommand.action({});

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('custom directory', () => {
    it('uses provided directory', async () => {
      await statusCommand.action({ directory: '/custom/path' });

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(path.resolve('/custom/path'));
    });
  });

  describe('multiple IDEs', () => {
    it('checks multiple configured IDEs', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: true,
        path: '/test/.agileflow',
        version: '2.88.0',
        ides: ['claude-code', 'cursor', 'windsurf'],
      });

      await statusCommand.action({});

      // Should have success calls for each IDE
      expect(success).toHaveBeenCalledWith('Claude Code');
      expect(success).toHaveBeenCalledWith('Cursor');
      expect(success).toHaveBeenCalledWith('Windsurf');
    });
  });
});
