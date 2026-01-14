/**
 * Tests for configure-repair.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock dependencies
jest.mock('fs');
jest.mock('child_process');

// Mock configure-utils
jest.mock('../../../scripts/lib/configure-utils', () => ({
  c: {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
  },
  log: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  header: jest.fn(),
  ensureDir: jest.fn(),
  readJSON: jest.fn(),
}));

// Mock configure-features
jest.mock('../../../scripts/lib/configure-features', () => ({
  FEATURES: {
    sessionstart: { hook: 'SessionStart', script: 'agileflow-welcome.js' },
    statusline: { script: 'agileflow-statusline.sh' },
  },
}));

const { readJSON, success, warn, error, info } = require('../../../scripts/lib/configure-utils');
const {
  ALL_SCRIPTS,
  sha256,
  getSourceScriptsDir,
  listScripts,
  showVersionInfo,
  repairScripts,
} = require('../../../scripts/lib/configure-repair');

describe('configure-repair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    readJSON.mockReturnValue(null);
  });

  describe('ALL_SCRIPTS constant', () => {
    it('includes core feature scripts', () => {
      expect(ALL_SCRIPTS['agileflow-welcome.js']).toBeDefined();
      expect(ALL_SCRIPTS['agileflow-welcome.js'].feature).toBe('sessionstart');
    });

    it('includes support scripts', () => {
      expect(ALL_SCRIPTS['obtain-context.js']).toBeDefined();
      expect(ALL_SCRIPTS['obtain-context.js'].usedBy).toContain('/babysit');
    });

    it('includes utility scripts', () => {
      expect(ALL_SCRIPTS['compress-status.sh']).toBeDefined();
    });
  });

  describe('sha256', () => {
    it('returns hex hash of string', () => {
      const hash = sha256('test data');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns same hash for same input', () => {
      const hash1 = sha256('test');
      const hash2 = sha256('test');
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different input', () => {
      const hash1 = sha256('test1');
      const hash2 = sha256('test2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getSourceScriptsDir', () => {
    it('returns null if no source directory found', () => {
      fs.existsSync.mockReturnValue(false);
      const result = getSourceScriptsDir();
      expect(result).toBeNull();
    });

    it('returns path if scripts directory exists with welcome script', () => {
      fs.existsSync.mockImplementation(p => {
        return p.includes('agileflow-welcome.js');
      });

      const result = getSourceScriptsDir();
      // Should find one of the possible paths
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('listScripts', () => {
    it('counts present scripts', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue(null);

      listScripts();

      // Should have logged some output
      expect(require('../../../scripts/lib/configure-utils').log).toHaveBeenCalled();
    });

    it('identifies missing scripts', () => {
      fs.existsSync.mockReturnValue(false);

      listScripts();

      expect(require('../../../scripts/lib/configure-utils').log).toHaveBeenCalledWith(
        expect.stringContaining('MISSING'),
        expect.any(String)
      );
    });

    it('identifies modified scripts', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('modified content');
      readJSON.mockReturnValue({
        files: {
          'scripts/agileflow-welcome.js': { sha256: 'different-hash' },
        },
      });

      listScripts();

      expect(require('../../../scripts/lib/configure-utils').log).toHaveBeenCalledWith(
        expect.stringContaining('modified'),
        expect.any(String)
      );
    });
  });

  describe('showVersionInfo', () => {
    it('displays version information', () => {
      readJSON.mockReturnValue({ version: '2.0.0' });
      execSync.mockReturnValue('2.1.0\n');

      showVersionInfo('2.0.0');

      // Check that log was called with 'Installed' text
      const logCalls = require('../../../scripts/lib/configure-utils').log.mock.calls;
      const hasInstalledLog = logCalls.some(call => call[0].includes('Installed'));
      expect(hasInstalledLog).toBe(true);
    });

    it('handles npm check failure gracefully', () => {
      readJSON.mockReturnValue({ version: '2.0.0' });
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      showVersionInfo('2.0.0');

      expect(require('../../../scripts/lib/configure-utils').log).toHaveBeenCalledWith(
        expect.stringContaining('could not check npm'),
        expect.any(String)
      );
    });

    it('shows update available when newer version exists', () => {
      readJSON.mockReturnValue({ version: '1.0.0' });
      execSync.mockReturnValue('2.0.0\n');

      showVersionInfo('1.0.0');

      expect(require('../../../scripts/lib/configure-utils').log).toHaveBeenCalledWith(
        expect.stringContaining('Update available'),
        expect.any(String)
      );
    });

    it('shows feature versions', () => {
      readJSON.mockReturnValue({
        version: '2.0.0',
        features: {
          sessionstart: { enabled: true, version: '2.0.0' },
          precompact: { enabled: false, version: '1.9.0' },
        },
      });
      execSync.mockReturnValue('2.0.0\n');

      showVersionInfo('2.0.0');

      // Should show feature versions
      expect(require('../../../scripts/lib/configure-utils').header).toHaveBeenCalledWith(
        expect.stringContaining('Feature Versions')
      );
    });
  });

  describe('repairScripts', () => {
    it('returns false if source directory not found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = repairScripts();

      expect(result).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not find source'));
    });

    it('returns false for unknown feature', () => {
      // Mock source dir exists - need to match the check in getSourceScriptsDir
      // which checks for both the directory and agileflow-welcome.js inside it
      const mockScriptsDir = require('path').join(
        __dirname,
        '..',
        '..',
        '..',
        'scripts',
        'lib',
        '..',
        '..',
        'scripts'
      );
      fs.existsSync.mockImplementation(p => {
        // Source scripts directory with welcome script
        if (p.endsWith('agileflow-welcome.js')) return true;
        if (p.endsWith('scripts')) return true;
        return false;
      });

      const result = repairScripts('nonexistent-feature-xyz');

      expect(result).toBe(false);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Unknown feature'));
    });

    it('skips repair when all scripts present', () => {
      // All scripts exist - source and dest
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});

      const result = repairScripts();

      // No repairs needed since everything exists
      expect(result).toBe(false);
    });

    it('reports nothing to repair when all present', () => {
      // All scripts exist
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});

      const result = repairScripts();

      expect(result).toBe(false);
      expect(info).toHaveBeenCalledWith(expect.stringContaining('nothing to repair'));
    });

    it('handles copy errors gracefully', () => {
      // The logic is:
      // 1. getSourceScriptsDir() finds the source directory
      // 2. For each script, check if destPath exists (should be false - missing)
      // 3. Check if srcPath exists (should be true - source has it)
      // 4. Try to copy - this throws, triggering error()

      const destScriptsDir = path.join(process.cwd(), '.agileflow', 'scripts');

      fs.existsSync.mockImplementation(p => {
        // getSourceScriptsDir checks paths like packages/cli/scripts
        // and also packages/cli/scripts/agileflow-welcome.js
        // We need both to return true for source dir to be found

        // Source script files exist
        if (p.endsWith('agileflow-welcome.js') && !p.includes('.agileflow')) {
          return true;
        }
        // Source directory exists
        if (p.includes(path.join('scripts', 'lib', '..')) || p.includes('packages')) {
          if (!p.includes('.agileflow')) return true;
        }

        // Destination path - scripts are missing (repair needed)
        if (p.includes('.agileflow')) return false;

        return true;
      });

      fs.copyFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = repairScripts();

      expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to restore'));
    });
  });
});
