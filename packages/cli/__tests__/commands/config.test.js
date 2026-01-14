/**
 * Tests for config.js command
 *
 * Tests the config command structure, subcommands, and behavior
 */

const path = require('path');

// Mock instances
const mockInstallerInstance = {
  getStatus: jest.fn(),
};

const mockIdeManagerInstance = {
  setup: jest.fn(),
  setAgileflowFolder: jest.fn(),
  setDocsFolder: jest.fn(),
};

// Mock dependencies
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  remove: jest.fn(),
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
  load: jest.fn(),
  dump: jest.fn(() => 'mocked yaml'),
}));

const fs = require('fs-extra');
const yaml = require('js-yaml');
const configCommand = require('../../tools/cli/commands/config');
const { displayLogo, displaySection, success, warning, info } = require('../../tools/cli/lib/ui');

describe('config command', () => {
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
      userName: 'Developer',
      agileflowFolder: '.agileflow',
      docsFolder: 'docs',
      installedAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-10T00:00:00.000Z',
    });

    // File system defaults
    fs.pathExists.mockResolvedValue(true);
    fs.readFile.mockResolvedValue('ides:\n  - claude-code\nuser_name: Developer');
    yaml.load.mockReturnValue({
      ides: ['claude-code'],
      user_name: 'Developer',
    });
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(configCommand.name).toBe('config');
    });

    it('has description', () => {
      expect(configCommand.description).toBeTruthy();
      expect(typeof configCommand.description).toBe('string');
    });

    it('has arguments array', () => {
      expect(configCommand.arguments).toBeInstanceOf(Array);
    });

    it('has options array', () => {
      expect(configCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof configCommand.action).toBe('function');
    });
  });

  describe('command arguments', () => {
    it('includes subcommand argument', () => {
      const subcommandArg = configCommand.arguments.find(arg => arg[0].includes('subcommand'));
      expect(subcommandArg).toBeTruthy();
    });

    it('includes key argument', () => {
      const keyArg = configCommand.arguments.find(arg => arg[0].includes('key'));
      expect(keyArg).toBeTruthy();
    });

    it('includes value argument', () => {
      const valueArg = configCommand.arguments.find(arg => arg[0].includes('value'));
      expect(valueArg).toBeTruthy();
    });
  });

  describe('list subcommand', () => {
    it('displays logo', async () => {
      await configCommand.action('list', undefined, undefined, {});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('displays configuration section', async () => {
      await configCommand.action('list', undefined, undefined, {});

      expect(displaySection).toHaveBeenCalledWith('AgileFlow Configuration');
    });
  });

  describe('get subcommand', () => {
    it('returns userName value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await configCommand.action('get', 'userName', undefined, {});

      expect(consoleSpy).toHaveBeenCalledWith('Developer');
      consoleSpy.mockRestore();
    });

    it('returns ides value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await configCommand.action('get', 'ides', undefined, {});

      expect(consoleSpy).toHaveBeenCalledWith('claude-code');
      consoleSpy.mockRestore();
    });

    it('returns agileflowFolder value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await configCommand.action('get', 'agileflowFolder', undefined, {});

      expect(consoleSpy).toHaveBeenCalledWith('.agileflow');
      consoleSpy.mockRestore();
    });

    it('returns docsFolder value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await configCommand.action('get', 'docsFolder', undefined, {});

      expect(consoleSpy).toHaveBeenCalledWith('docs');
      consoleSpy.mockRestore();
    });

    it('returns version value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await configCommand.action('get', 'version', undefined, {});

      expect(consoleSpy).toHaveBeenCalledWith('2.88.0');
      consoleSpy.mockRestore();
    });
  });

  describe('set subcommand', () => {
    it('displays logo when setting value', async () => {
      await configCommand.action('set', 'userName', 'Jane', {});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('displays updating section', async () => {
      await configCommand.action('set', 'userName', 'Jane', {});

      expect(displaySection).toHaveBeenCalledWith('Updating Configuration');
    });

    it('writes updated manifest', async () => {
      await configCommand.action('set', 'userName', 'Jane', {});

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('shows success message', async () => {
      await configCommand.action('set', 'userName', 'Jane', {});

      expect(success).toHaveBeenCalledWith('Configuration updated');
    });

    it('warns about changing agileflowFolder', async () => {
      await configCommand.action('set', 'agileflowFolder', '.af', {});

      expect(warning).toHaveBeenCalledWith(
        'Changing agileflowFolder requires moving the installation directory.'
      );
    });

    it('updates IDE configurations when changing ides', async () => {
      await configCommand.action('set', 'ides', 'claude-code,cursor', {});

      expect(mockIdeManagerInstance.setAgileflowFolder).toHaveBeenCalled();
      expect(mockIdeManagerInstance.setDocsFolder).toHaveBeenCalled();
    });
  });

  describe('default subcommand (help)', () => {
    it('displays logo', async () => {
      await configCommand.action(undefined, undefined, undefined, {});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('exits with 0', async () => {
      await configCommand.action(undefined, undefined, undefined, {});

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('custom directory', () => {
    it('uses provided directory', async () => {
      await configCommand.action('list', undefined, undefined, { directory: '/custom/path' });

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(path.resolve('/custom/path'));
    });
  });

  describe('not installed', () => {
    it('handles not installed state', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      await configCommand.action('list', undefined, undefined, {});

      expect(displayLogo).toHaveBeenCalled();
    });
  });
});
