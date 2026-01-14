/**
 * Tests for uninstall.js command
 *
 * Tests the uninstall command structure, options, and behavior
 */

const path = require('path');

// Mock instances
const mockInstallerInstance = {
  getStatus: jest.fn(),
};

const mockIdeManagerInstance = {
  setup: jest.fn(),
};

// Mock dependencies
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
  remove: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('../../tools/cli/lib/ui', () => ({
  displayLogo: jest.fn(),
  displaySection: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  confirm: jest.fn(),
}));

jest.mock('../../tools/cli/lib/error-handler', () => ({
  ErrorHandler: jest.fn().mockImplementation(() => ({
    warning: jest.fn(),
    critical: jest.fn(),
  })),
}));

jest.mock('../../tools/cli/installers/core/installer', () => ({
  Installer: jest.fn().mockImplementation(() => mockInstallerInstance),
}));

jest.mock('../../tools/cli/installers/ide/manager', () => ({
  IdeManager: jest.fn().mockImplementation(() => mockIdeManagerInstance),
}));

jest.mock('js-yaml', () => ({
  load: jest.fn(() => ({ ides: ['claude-code', 'cursor'] })),
  dump: jest.fn(() => 'mocked yaml'),
}));

const fs = require('fs-extra');
const uninstallCommand = require('../../tools/cli/commands/uninstall');
const {
  displayLogo,
  displaySection,
  success,
  warning,
  confirm,
} = require('../../tools/cli/lib/ui');

describe('uninstall command', () => {
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

    // File system defaults
    fs.pathExists.mockResolvedValue(true);
    fs.remove.mockResolvedValue();
    fs.readFile.mockResolvedValue('ides:\n  - claude-code');
    fs.writeFile.mockResolvedValue();

    // Default confirm to true
    confirm.mockResolvedValue(true);
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(uninstallCommand.name).toBe('uninstall');
    });

    it('has description', () => {
      expect(uninstallCommand.description).toBeTruthy();
      expect(typeof uninstallCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(uninstallCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof uninstallCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = uninstallCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });

    it('includes ide option', () => {
      const ideOption = uninstallCommand.options.find(opt => opt[0].includes('--ide'));
      expect(ideOption).toBeTruthy();
    });

    it('includes force option', () => {
      const forceOption = uninstallCommand.options.find(opt => opt[0].includes('--force'));
      expect(forceOption).toBeTruthy();
    });
  });

  describe('not installed', () => {
    it('warns when not installed', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      await uninstallCommand.action({});

      expect(warning).toHaveBeenCalledWith('No AgileFlow installation found');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('full uninstall', () => {
    it('displays logo', async () => {
      await uninstallCommand.action({ force: true });

      expect(displayLogo).toHaveBeenCalled();
    });

    it('displays uninstalling section', async () => {
      await uninstallCommand.action({ force: true });

      expect(displaySection).toHaveBeenCalledWith(
        'Uninstalling AgileFlow',
        expect.stringContaining('Location')
      );
    });

    it('prompts for confirmation', async () => {
      await uninstallCommand.action({});

      expect(confirm).toHaveBeenCalledWith('Are you sure you want to uninstall AgileFlow?', false);
    });

    it('skips confirmation with --force', async () => {
      await uninstallCommand.action({ force: true });

      expect(confirm).not.toHaveBeenCalled();
    });

    it('cancels when user declines', async () => {
      confirm.mockResolvedValue(false);

      await uninstallCommand.action({});

      // process.exit is mocked so code continues, but exit(0) should have been called
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('removes IDE configurations', async () => {
      await uninstallCommand.action({ force: true });

      expect(fs.remove).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith('Removed Claude Code configuration');
    });

    it('removes AgileFlow directory', async () => {
      await uninstallCommand.action({ force: true });

      expect(fs.remove).toHaveBeenCalledWith('/test/.agileflow');
    });

    it('shows success message', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await uninstallCommand.action({ force: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('has been uninstalled'));
      consoleSpy.mockRestore();
    });

    it('exits with 0', async () => {
      await uninstallCommand.action({ force: true });

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('IDE-specific uninstall', () => {
    beforeEach(() => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: true,
        path: '/test/.agileflow',
        version: '2.88.0',
        ides: ['claude-code', 'cursor'],
      });
    });

    it('displays removing IDE section', async () => {
      await uninstallCommand.action({ ide: 'cursor', force: true });

      expect(displaySection).toHaveBeenCalledWith(
        'Removing IDE Configuration',
        expect.stringContaining('Cursor')
      );
    });

    it('removes specific IDE configuration', async () => {
      await uninstallCommand.action({ ide: 'cursor', force: true });

      expect(success).toHaveBeenCalledWith('Removed Cursor configuration');
    });

    it('updates manifest', async () => {
      await uninstallCommand.action({ ide: 'cursor', force: true });

      expect(fs.writeFile).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith('Updated manifest');
    });

    it('warns when IDE is not configured', async () => {
      await uninstallCommand.action({ ide: 'windsurf', force: true });

      expect(warning).toHaveBeenCalledWith('Windsurf is not configured in this installation');
    });

    it('removes spawnable agents for claude-code', async () => {
      await uninstallCommand.action({ ide: 'claude-code', force: true });

      // Should attempt to remove agents directory
      expect(fs.pathExists).toHaveBeenCalled();
    });

    it('prompts for confirmation', async () => {
      await uninstallCommand.action({ ide: 'cursor' });

      expect(confirm).toHaveBeenCalledWith('Remove Cursor configuration?', false);
    });
  });

  describe('custom directory', () => {
    it('uses provided directory', async () => {
      await uninstallCommand.action({ directory: '/custom/path', force: true });

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(path.resolve('/custom/path'));
    });
  });

  describe('multiple IDEs', () => {
    it('removes all configured IDEs', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: true,
        path: '/test/.agileflow',
        version: '2.88.0',
        ides: ['claude-code', 'cursor', 'windsurf'],
      });

      await uninstallCommand.action({ force: true });

      expect(success).toHaveBeenCalledWith('Removed Claude Code configuration');
      expect(success).toHaveBeenCalledWith('Removed Cursor configuration');
      expect(success).toHaveBeenCalledWith('Removed Windsurf configuration');
    });
  });
});
