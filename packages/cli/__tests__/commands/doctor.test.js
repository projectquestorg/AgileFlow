/**
 * Tests for doctor.js command
 *
 * Tests the doctor (diagnostics) command structure, options, and behavior
 */

const path = require('path');

// Mock instances
const mockInstallerInstance = {
  getStatus: jest.fn(),
  countInstalledItems: jest.fn(),
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
  readdir: jest.fn(),
  stat: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn(),
  ensureDir: jest.fn(),
  writeFile: jest.fn(),
  remove: jest.fn(),
  readFile: jest.fn(),
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

jest.mock('../../tools/cli/lib/version-checker', () => ({
  getCurrentVersion: jest.fn(() => '2.88.0'),
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

jest.mock('child_process', () => ({
  execSync: jest.fn(() => '10.0.0'),
}));

const fs = require('fs-extra');
const doctorCommand = require('../../tools/cli/commands/doctor');
const {
  displayLogo,
  displaySection,
  success,
  warning,
  error,
  info,
} = require('../../tools/cli/lib/ui');

describe('doctor command', () => {
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
      docsFolder: 'docs',
    });

    mockInstallerInstance.countInstalledItems.mockResolvedValue({
      agents: 27,
      commands: 71,
      skills: 5,
    });

    // File system defaults
    fs.pathExists.mockResolvedValue(true);
    fs.readdir.mockResolvedValue([]);
    fs.readJson.mockResolvedValue({
      schema: 1,
      files: {},
    });
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(doctorCommand.name).toBe('doctor');
    });

    it('has description', () => {
      expect(doctorCommand.description).toBeTruthy();
      expect(typeof doctorCommand.description).toBe('string');
    });

    it('has options array', () => {
      expect(doctorCommand.options).toBeInstanceOf(Array);
    });

    it('has action function', () => {
      expect(typeof doctorCommand.action).toBe('function');
    });
  });

  describe('command options', () => {
    it('includes directory option', () => {
      const dirOption = doctorCommand.options.find(opt => opt[0].includes('--directory'));
      expect(dirOption).toBeTruthy();
    });

    it('includes fix option', () => {
      const fixOption = doctorCommand.options.find(opt => opt[0].includes('--fix'));
      expect(fixOption).toBeTruthy();
    });
  });

  describe('environment checks', () => {
    it('displays logo on start', async () => {
      await doctorCommand.action({});

      expect(displayLogo).toHaveBeenCalled();
    });

    it('checks Node.js version', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith(expect.stringContaining('Node.js'));
    });

    it('checks npm version', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith(expect.stringContaining('npm'));
    });
  });

  describe('installation checks', () => {
    it('warns when not installed', async () => {
      mockInstallerInstance.getStatus.mockResolvedValue({
        installed: false,
      });

      await doctorCommand.action({});

      expect(warning).toHaveBeenCalledWith('No AgileFlow installation found');
      expect(mockExit).toHaveBeenCalledWith(0); // No issues, just not installed
    });

    it('reports .agileflow exists when installed', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith('.agileflow/ exists');
    });

    it('checks manifest.yaml exists', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith('manifest.yaml valid');
    });

    it('reports missing manifest', async () => {
      fs.pathExists.mockImplementation(p => {
        if (p.includes('manifest.yaml')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await doctorCommand.action({});

      expect(error).toHaveBeenCalledWith('manifest.yaml missing');
    });
  });

  describe('safe updates checks', () => {
    it('checks files.json exists', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith('files.json present');
    });

    it('warns on missing files.json', async () => {
      fs.pathExists.mockImplementation(p => {
        if (p.includes('files.json')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await doctorCommand.action({});

      expect(warning).toHaveBeenCalledWith(expect.stringContaining('files.json missing'));
    });

    it('warns on invalid files.json', async () => {
      fs.readJson.mockRejectedValue(new Error('Invalid JSON'));

      await doctorCommand.action({});

      expect(warning).toHaveBeenCalledWith(expect.stringContaining('files.json invalid'));
    });
  });

  describe('core content checks', () => {
    it('reports core agents count', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith(expect.stringContaining('Core agents: 27'));
    });

    it('reports commands count', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith(expect.stringContaining('Commands: 71'));
    });

    it('reports skills count', async () => {
      await doctorCommand.action({});

      expect(success).toHaveBeenCalledWith(expect.stringContaining('Skills: 5'));
    });

    it('reports missing agents', async () => {
      mockInstallerInstance.countInstalledItems.mockResolvedValue({
        agents: 0,
        commands: 71,
        skills: 5,
      });

      await doctorCommand.action({});

      expect(error).toHaveBeenCalledWith('Core agents: Missing');
    });

    it('reports missing commands', async () => {
      mockInstallerInstance.countInstalledItems.mockResolvedValue({
        agents: 27,
        commands: 0,
        skills: 5,
      });

      await doctorCommand.action({});

      expect(error).toHaveBeenCalledWith('Commands: Missing');
    });
  });

  describe('exit codes', () => {
    it('exits 0 when no issues', async () => {
      await doctorCommand.action({});

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits 1 when issues found', async () => {
      mockInstallerInstance.countInstalledItems.mockResolvedValue({
        agents: 0,
        commands: 0,
        skills: 0,
      });

      await doctorCommand.action({});

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('--fix option', () => {
    it('displays auto-repair title when fix enabled', async () => {
      await doctorCommand.action({ fix: true });

      expect(displaySection).toHaveBeenCalledWith('AgileFlow Auto-Repair');
    });

    it('displays diagnostics title when fix not enabled', async () => {
      await doctorCommand.action({});

      expect(displaySection).toHaveBeenCalledWith('AgileFlow Diagnostics');
    });

    it('shows fix suggestion when issues and no --fix', async () => {
      fs.pathExists.mockImplementation(p => {
        if (p.includes('files.json')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await doctorCommand.action({});

      expect(info).toHaveBeenCalledWith(expect.stringContaining('--fix'));
    });
  });

  describe('custom directory', () => {
    it('uses provided directory', async () => {
      await doctorCommand.action({ directory: '/custom/path' });

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(path.resolve('/custom/path'));
    });

    it('uses current directory by default', async () => {
      await doctorCommand.action({});

      expect(mockInstallerInstance.getStatus).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
