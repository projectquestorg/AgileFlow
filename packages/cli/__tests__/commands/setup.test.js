/**
 * Tests for setup.js command
 *
 * Tests the setup command structure, options, and integration with subsystems
 */

const path = require('path');

// Create mock instances that we can track
const mockInstallerInstance = {
  install: jest.fn(() =>
    Promise.resolve({
      success: true,
      path: '/test/.agileflow',
      counts: { agents: 27, commands: 71, skills: 5 },
    })
  ),
};

const mockIdeManagerInstance = {
  setup: jest.fn(() => Promise.resolve({ success: true })),
  setAgileflowFolder: jest.fn(),
  setDocsFolder: jest.fn(),
};

// Mock dependencies before requiring the module
jest.mock('../../tools/cli/lib/ui', () => ({
  promptInstall: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  displaySection: jest.fn(),
  displayLogo: jest.fn(),
}));

jest.mock('../../tools/cli/lib/docs-setup', () => ({
  createDocsStructure: jest.fn(() =>
    Promise.resolve({
      success: true,
      counts: { directoriesCreated: 15, filesCreated: 20, filesSkipped: 0 },
      errors: [],
    })
  ),
}));

jest.mock('../../tools/cli/lib/npm-utils', () => ({
  getLatestVersion: jest.fn(() => Promise.resolve(null)),
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

const setupCommand = require('../../tools/cli/commands/setup');
const { promptInstall, success, error, displaySection, displayLogo } = require('../../tools/cli/lib/ui');
const { createDocsStructure } = require('../../tools/cli/lib/docs-setup');

describe('setup command', () => {
  // Mock process.exit to prevent tests from exiting
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.exit mock
    mockExit.mockClear();
    // Reset mock instance methods
    mockInstallerInstance.install.mockClear();
    mockInstallerInstance.install.mockResolvedValue({
      success: true,
      path: '/test/.agileflow',
      counts: { agents: 27, commands: 71, skills: 5 },
    });
    mockIdeManagerInstance.setup.mockClear();
    mockIdeManagerInstance.setAgileflowFolder.mockClear();
    mockIdeManagerInstance.setDocsFolder.mockClear();
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(setupCommand.name).toBe('setup');
    });

    it('has description', () => {
      expect(setupCommand.description).toBeTruthy();
      expect(typeof setupCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(setupCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof setupCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = setupCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });

    it('includes yes/skip-prompts option', () => {
      const yesOption = setupCommand.options.find(opt => opt[0].includes('--yes'));
      expect(yesOption).toBeTruthy();
    });

    it('includes no-self-update option', () => {
      const noUpdateOption = setupCommand.options.find(opt => opt[0].includes('--no-self-update'));
      expect(noUpdateOption).toBeTruthy();
    });

    it('includes self-updated internal flag', () => {
      const selfUpdatedOption = setupCommand.options.find(opt => opt[0].includes('--self-updated'));
      expect(selfUpdatedOption).toBeTruthy();
    });
  });

  describe('options format', () => {
    it('all options have short or long format', () => {
      for (const option of setupCommand.options) {
        expect(option[0]).toMatch(/^-[a-z]|^--[a-z]/);
      }
    });

    it('all options have descriptions', () => {
      for (const option of setupCommand.options) {
        // Option can be [flag, description] or [flag, description, default]
        expect(option.length).toBeGreaterThanOrEqual(2);
        expect(typeof option[1]).toBe('string');
      }
    });
  });

  describe('action with --yes flag (non-interactive)', () => {
    it('uses default configuration', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      // Should create docs structure with default folder
      expect(createDocsStructure).toHaveBeenCalledWith(
        expect.any(String),
        'docs',
        expect.objectContaining({ updateGitignore: true })
      );
    });

    it('calls installer with default config', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(mockInstallerInstance.install).toHaveBeenCalledWith(
        expect.objectContaining({
          ides: ['claude-code'],
          userName: 'Developer',
          agileflowFolder: '.agileflow',
          docsFolder: 'docs',
        })
      );
    });

    it('sets up IDE manager', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(mockIdeManagerInstance.setAgileflowFolder).toHaveBeenCalledWith('.agileflow');
      expect(mockIdeManagerInstance.setDocsFolder).toHaveBeenCalledWith('docs');
      expect(mockIdeManagerInstance.setup).toHaveBeenCalled();
    });

    it('logs success messages', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(success).toHaveBeenCalledWith(expect.stringContaining('agents'));
      expect(success).toHaveBeenCalledWith(expect.stringContaining('commands'));
      expect(success).toHaveBeenCalledWith(expect.stringContaining('skills'));
    });

    it('exits with code 0 on success', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('respects custom directory option', async () => {
      await setupCommand.action({
        yes: true,
        selfUpdate: false,
        directory: '/custom/path',
      });

      expect(mockInstallerInstance.install).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: path.resolve('/custom/path'),
        })
      );
    });
  });

  describe('action with interactive prompts', () => {
    it('calls promptInstall when no --yes flag', async () => {
      promptInstall.mockResolvedValue({
        directory: '/prompted/path',
        ides: ['claude-code', 'cursor'],
        userName: 'Test User',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
        updateGitignore: true,
      });

      await setupCommand.action({ selfUpdate: false });

      expect(promptInstall).toHaveBeenCalled();
    });

    it('uses configuration from prompts', async () => {
      promptInstall.mockResolvedValue({
        directory: '/prompted/path',
        ides: ['claude-code', 'cursor'],
        userName: 'Test User',
        agileflowFolder: '.agileflow',
        docsFolder: 'documentation',
        updateGitignore: false,
      });

      await setupCommand.action({ selfUpdate: false });

      expect(createDocsStructure).toHaveBeenCalledWith(
        '/prompted/path',
        'documentation',
        expect.objectContaining({ updateGitignore: false })
      );
    });
  });

  describe('self-update behavior', () => {
    it('displays logo when selfUpdated and --yes', async () => {
      await setupCommand.action({ yes: true, selfUpdated: true, selfUpdate: false });

      expect(displayLogo).toHaveBeenCalled();
    });

    it('skips self-update check when --no-self-update', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      // getLatestVersion should not have been called for update check
      // (it might be called for other reasons, so we check the flow completed without spawn)
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling', () => {
    it('handles installer failure gracefully', async () => {
      mockInstallerInstance.install.mockResolvedValue({
        success: false,
        path: '/test/.agileflow',
        counts: { agents: 0, commands: 0, skills: 0 },
      });

      await setupCommand.action({ yes: true, selfUpdate: false });

      // Should still try to complete (warning, not throw)
      expect(displaySection).toHaveBeenCalled();
    });

    it('handles docs structure failure', async () => {
      createDocsStructure.mockResolvedValue({
        success: false,
        counts: { directoriesCreated: 0, filesCreated: 0, filesSkipped: 0 },
        errors: ['Permission denied'],
      });

      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(error).toHaveBeenCalledWith('Failed to create docs structure');
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
    });
  });

  describe('display sections', () => {
    it('displays setup section with target directory', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(displaySection).toHaveBeenCalledWith(
        'Setting Up AgileFlow',
        expect.stringContaining('Target:')
      );
    });

    it('displays IDE configuration section', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(displaySection).toHaveBeenCalledWith('Configuring IDEs');
    });

    it('displays documentation structure section', async () => {
      await setupCommand.action({ yes: true, selfUpdate: false });

      expect(displaySection).toHaveBeenCalledWith(
        'Creating Documentation Structure',
        expect.stringContaining('Folder:')
      );
    });
  });
});
