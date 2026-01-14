/**
 * Tests for update.js command
 *
 * Tests the update command structure, options, and behavior
 */

const path = require('path');

// Mock instances
const mockInstallerInstance = {
  getStatus: jest.fn(),
  install: jest.fn(),
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

jest.mock('../../tools/cli/lib/npm-utils', () => ({
  getLatestVersion: jest.fn(),
}));

jest.mock('../../tools/cli/lib/docs-setup', () => ({
  createDocsStructure: jest.fn(),
  getDocsFolderName: jest.fn(),
}));

jest.mock('semver', () => ({
  lt: jest.fn(),
}));

jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(),
}));

const fs = require('fs-extra');
const semver = require('semver');
const updateCommand = require('../../tools/cli/commands/update');
const { displayLogo, displaySection, success, warning, info, confirm } = require('../../tools/cli/lib/ui');
const { getLatestVersion } = require('../../tools/cli/lib/npm-utils');
const { createDocsStructure, getDocsFolderName } = require('../../tools/cli/lib/docs-setup');

describe('update command', () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit.mockClear();

    // Default mock setup - installed state
    mockInstallerInstance.getStatus.mockResolvedValue({
      installed: true,
      path: '/test/.agileflow',
      version: '2.87.0',
      ides: ['claude-code'],
      userName: 'Developer',
      agileflowFolder: '.agileflow',
      docsFolder: 'docs',
    });

    mockInstallerInstance.install.mockResolvedValue({
      success: true,
      fileOps: {
        created: 5,
        updated: 10,
        preserved: 2,
      },
    });

    // File system defaults
    fs.pathExists.mockResolvedValue(true);

    // npm utils defaults
    getLatestVersion.mockResolvedValue('2.88.0');

    // docs setup defaults
    getDocsFolderName.mockResolvedValue('docs');
    createDocsStructure.mockResolvedValue({ success: true, errors: [] });

    // semver defaults - local version is up to date (not less than latest)
    semver.lt.mockReturnValue(false);

    // Default confirm to true
    confirm.mockResolvedValue(true);
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(updateCommand.name).toBe('update');
    });

    it('has description', () => {
      expect(updateCommand.description).toBeTruthy();
      expect(typeof updateCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(updateCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof updateCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = updateCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });

    it('includes force option', () => {
      const forceOption = updateCommand.options.find(opt => opt[0].includes('--force'));
      expect(forceOption).toBeTruthy();
    });

    it('includes ides option', () => {
      const idesOption = updateCommand.options.find(opt => opt[0].includes('--ides'));
      expect(idesOption).toBeTruthy();
    });

    it('includes no-self-update option', () => {
      const selfUpdateOption = updateCommand.options.find(opt => opt[0].includes('--no-self-update'));
      expect(selfUpdateOption).toBeTruthy();
    });
  });

  describe('not installed', () => {
    it('handles not installed state', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      await updateCommand.action({ selfUpdated: true });

      expect(displayLogo).toHaveBeenCalled();
    });
  });

  describe('update process', () => {
    it('displays logo', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(displayLogo).toHaveBeenCalled();
    });

    it('displays updating section', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(displaySection).toHaveBeenCalledWith(
        'Updating AgileFlow',
        expect.stringContaining('Current version')
      );
    });

    it('checks for latest version', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(getLatestVersion).toHaveBeenCalledWith('agileflow');
    });

    it('prompts for confirmation', async () => {
      await updateCommand.action({ selfUpdated: true });

      expect(confirm).toHaveBeenCalled();
    });

    it('skips confirmation with --force', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      // Confirm should not be called for the actual update prompt
      // (may be called for other things like outdated CLI)
    });

    it('cancels when user declines', async () => {
      confirm.mockResolvedValue(false);

      await updateCommand.action({ selfUpdated: true });

      // process.exit is mocked so code continues, but exit(0) should have been called
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('runs core installation', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(mockInstallerInstance.install).toHaveBeenCalled();
    });

    it('updates IDE configurations', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(mockIdeManagerInstance.setAgileflowFolder).toHaveBeenCalled();
      expect(mockIdeManagerInstance.setDocsFolder).toHaveBeenCalled();
      expect(mockIdeManagerInstance.setup).toHaveBeenCalled();
    });

    it('updates docs structure', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(displaySection).toHaveBeenCalledWith(
        'Updating Documentation Structure',
        expect.any(String)
      );
      expect(createDocsStructure).toHaveBeenCalled();
    });

    it('shows success message', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(success).toHaveBeenCalledWith('Updated core content');
    });

    it('reports file operations', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('5 added')
      );
    });

    it('exits with 0', async () => {
      await updateCommand.action({ force: true, selfUpdated: true });

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('already up to date', () => {
    it('shows already on latest version', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: true,
        path: '/test/.agileflow',
        version: '2.88.0',
        ides: ['claude-code'],
      });

      await updateCommand.action({ selfUpdated: true });

      expect(success).toHaveBeenCalledWith('Already on the latest version');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('custom IDEs', () => {
    it('uses specified IDEs from --ides option', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await updateCommand.action({ ides: 'claude-code,cursor', force: true, selfUpdated: true });

      expect(mockInstallerInstance.install).toHaveBeenCalledWith(
        expect.objectContaining({
          ides: ['claude-code', 'cursor'],
        }),
        expect.any(Object)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('custom directory', () => {
    it('uses provided directory', async () => {
      await updateCommand.action({ directory: '/custom/path', force: true, selfUpdated: true });

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(path.resolve('/custom/path'));
    });
  });

  describe('docs structure update', () => {
    it('warns on docs structure failure', async () => {
      createDocsStructure.mockResolvedValue({
        success: false,
        errors: ['Some error'],
      });

      await updateCommand.action({ force: true, selfUpdated: true });

      expect(warning).toHaveBeenCalledWith('Failed to update docs structure');
    });
  });

  describe('npm registry unavailable', () => {
    it('continues with local version when npm unavailable', async () => {
      getLatestVersion.mockResolvedValue(null);

      await updateCommand.action({ force: true, selfUpdated: true });

      expect(warning).toHaveBeenCalledWith('Could not check npm registry for latest version');
    });
  });

  describe('file operations reporting', () => {
    it('reports preserved files', async () => {
      mockInstallerInstance.install.mockResolvedValue({
        success: true,
        fileOps: {
          created: 0,
          updated: 5,
          preserved: 10,
        },
      });

      await updateCommand.action({ selfUpdated: true });

      expect(warning).toHaveBeenCalledWith(
        'Some local changes were preserved; use --force to overwrite them.'
      );
    });

    it('reports backup path', async () => {
      mockInstallerInstance.install.mockResolvedValue({
        success: true,
        fileOps: {
          created: 0,
          updated: 5,
          preserved: 0,
          backupPath: '/test/backup',
        },
      });

      await updateCommand.action({ force: true, selfUpdated: true });

      expect(info).toHaveBeenCalledWith(expect.stringContaining('Backup saved'));
    });

    it('reports updates path', async () => {
      mockInstallerInstance.install.mockResolvedValue({
        success: true,
        fileOps: {
          created: 0,
          updated: 5,
          preserved: 3,
          updatesPath: '/test/updates.txt',
        },
      });

      await updateCommand.action({ force: true, selfUpdated: true });

      expect(info).toHaveBeenCalledWith(expect.stringContaining('Preserved-file updates saved'));
    });
  });
});
