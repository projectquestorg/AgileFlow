/**
 * Tests for configure-features.js
 */

const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('fs');

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
  writeJSON: jest.fn(),
  updateGitignore: jest.fn(),
}));

const {
  readJSON,
  writeJSON,
  success,
  error,
  warn,
  info,
} = require('../../../scripts/lib/configure-utils');
const {
  FEATURES,
  PROFILES,
  STATUSLINE_COMPONENTS,
  enableFeature,
  disableFeature,
  applyProfile,
  updateMetadata,
  setStatuslineComponents,
  listStatuslineComponents,
  migrateSettings,
  upgradeFeatures,
  scriptExists,
  getScriptPath,
} = require('../../../scripts/lib/configure-features');

describe('configure-features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    readJSON.mockReturnValue(null);
  });

  describe('FEATURES constant', () => {
    it('defines all expected features', () => {
      expect(FEATURES.sessionstart).toBeDefined();
      expect(FEATURES.precompact).toBeDefined();
      expect(FEATURES.ralphloop).toBeDefined();
      expect(FEATURES.selfimprove).toBeDefined();
      expect(FEATURES.archival).toBeDefined();
      expect(FEATURES.statusline).toBeDefined();
      expect(FEATURES.autoupdate).toBeDefined();
      expect(FEATURES.damagecontrol).toBeDefined();
      expect(FEATURES.askuserquestion).toBeDefined();
    });

    it('hook features have required properties', () => {
      expect(FEATURES.sessionstart.hook).toBe('SessionStart');
      expect(FEATURES.sessionstart.script).toBe('agileflow-welcome.js');
      expect(FEATURES.sessionstart.type).toBe('node');
    });
  });

  describe('PROFILES constant', () => {
    it('defines all expected profiles', () => {
      expect(PROFILES.full).toBeDefined();
      expect(PROFILES.basic).toBeDefined();
      expect(PROFILES.minimal).toBeDefined();
      expect(PROFILES.none).toBeDefined();
    });

    it('full profile enables all features', () => {
      expect(PROFILES.full.enable).toContain('sessionstart');
      expect(PROFILES.full.enable).toContain('precompact');
      expect(PROFILES.full.enable).toContain('archival');
      expect(PROFILES.full.enable).toContain('statusline');
    });

    it('none profile disables all features', () => {
      expect(PROFILES.none.disable).toContain('sessionstart');
      expect(PROFILES.none.disable).toContain('precompact');
    });
  });

  describe('STATUSLINE_COMPONENTS constant', () => {
    it('includes expected components', () => {
      expect(STATUSLINE_COMPONENTS).toContain('agileflow');
      expect(STATUSLINE_COMPONENTS).toContain('model');
      expect(STATUSLINE_COMPONENTS).toContain('story');
      expect(STATUSLINE_COMPONENTS).toContain('git');
    });
  });

  describe('scriptExists', () => {
    it('returns true if script exists', () => {
      fs.existsSync.mockReturnValue(true);
      expect(scriptExists('test.js')).toBe(true);
    });

    it('returns false if script does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(scriptExists('missing.js')).toBe(false);
    });
  });

  describe('getScriptPath', () => {
    it('returns relative path to script', () => {
      expect(getScriptPath('test.js')).toBe('.agileflow/scripts/test.js');
    });
  });

  describe('enableFeature', () => {
    it('returns false for unknown feature', () => {
      const result = enableFeature('unknown', {}, '2.0.0');
      expect(result).toBe(false);
      expect(error).toHaveBeenCalled();
    });

    it('returns false if script not found', () => {
      fs.existsSync.mockReturnValue(false);
      const result = enableFeature('sessionstart', {}, '2.0.0');
      expect(result).toBe(false);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Script not found'));
    });

    it('enables hook-based feature when script exists', () => {
      fs.existsSync.mockImplementation(p => {
        if (p.includes('agileflow-welcome.js')) return true;
        return false;
      });
      readJSON.mockReturnValue({});

      const result = enableFeature('sessionstart', {}, '2.0.0');

      expect(result).toBe(true);
      expect(writeJSON).toHaveBeenCalledWith(
        '.claude/settings.json',
        expect.objectContaining({
          hooks: expect.objectContaining({
            SessionStart: expect.any(Array),
          }),
        })
      );
    });

    it('enables autoupdate feature (metadata only)', () => {
      const result = enableFeature('autoupdate', {}, '2.0.0');
      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith('Auto-update enabled');
    });

    it('enables askuserquestion feature (metadata only)', () => {
      const result = enableFeature('askuserquestion', { mode: 'all' }, '2.0.0');
      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('AskUserQuestion enabled'));
    });
  });

  describe('disableFeature', () => {
    it('returns false for unknown feature', () => {
      const result = disableFeature('unknown', '2.0.0');
      expect(result).toBe(false);
    });

    it('returns true if no settings file (already disabled)', () => {
      fs.existsSync.mockReturnValue(false);
      const result = disableFeature('sessionstart', '2.0.0');
      expect(result).toBe(true);
      expect(info).toHaveBeenCalled();
    });

    it('removes hook when disabling', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ command: 'test' }] }],
        },
      });

      const result = disableFeature('sessionstart', '2.0.0');

      expect(result).toBe(true);
      expect(writeJSON).toHaveBeenCalledWith(
        '.claude/settings.json',
        expect.objectContaining({
          hooks: expect.not.objectContaining({
            SessionStart: expect.anything(),
          }),
        })
      );
    });

    it('disables statusline', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        statusLine: { type: 'command', command: 'test' },
      });

      const result = disableFeature('statusline', '2.0.0');

      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith('Status line disabled');
    });
  });

  describe('applyProfile', () => {
    it('returns false for unknown profile', () => {
      const result = applyProfile('unknown', {}, '2.0.0');
      expect(result).toBe(false);
      expect(error).toHaveBeenCalled();
    });

    it('applies profile enable and disable', () => {
      // Mock all scripts as existing
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({});

      const result = applyProfile('minimal', {}, '2.0.0');

      // minimal profile enables sessionstart and archival
      // but the enableFeature calls may fail if scripts don't exist
      // Just check the function completed
      expect(result).toBe(true);
    });
  });

  describe('setStatuslineComponents', () => {
    it('returns false if no metadata file', () => {
      fs.existsSync.mockReturnValue(false);
      const result = setStatuslineComponents(['agileflow'], []);
      expect(result).toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it('enables and disables components', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        features: { statusline: { components: {} } },
      });

      const result = setStatuslineComponents(['agileflow'], ['git']);

      expect(result).toBe(true);
      expect(writeJSON).toHaveBeenCalled();
    });

    it('warns on unknown component', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({});

      setStatuslineComponents(['unknown-component'], []);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown component'));
    });
  });

  describe('migrateSettings', () => {
    it('returns false if no settings file', () => {
      fs.existsSync.mockReturnValue(false);
      const result = migrateSettings();
      expect(result).toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it('returns false if settings cannot be parsed', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue(null);

      const result = migrateSettings();

      expect(result).toBe(false);
      expect(error).toHaveBeenCalled();
    });

    it('migrates string hook format', () => {
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});
      readJSON.mockReturnValue({
        hooks: {
          SessionStart: 'node script.js',
        },
      });

      const result = migrateSettings();

      expect(result).toBe(true);
      expect(writeJSON).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Migrated SessionStart'));
    });

    it('migrates string statusLine format', () => {
      fs.existsSync.mockReturnValue(true);
      fs.copyFileSync.mockImplementation(() => {});
      readJSON.mockReturnValue({
        statusLine: 'bash script.sh',
      });

      const result = migrateSettings();

      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('statusLine'));
    });

    it('returns false if no migration needed', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'test' }] }],
        },
        statusLine: { type: 'command', command: 'test' },
      });

      const result = migrateSettings();

      expect(result).toBe(false);
      expect(info).toHaveBeenCalledWith(expect.stringContaining('No migration needed'));
    });
  });

  describe('upgradeFeatures', () => {
    it('returns false if no features need upgrading', () => {
      const status = {
        features: {
          sessionstart: { enabled: true, outdated: false },
          precompact: { enabled: false, outdated: false },
        },
      };

      const result = upgradeFeatures(status, '2.0.0');

      expect(result).toBe(false);
      expect(info).toHaveBeenCalledWith(expect.stringContaining('No features needed upgrading'));
    });
  });

  describe('updateMetadata', () => {
    it('creates metadata file if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      readJSON.mockReturnValue(null);

      updateMetadata({ archival: { enabled: true } }, '2.0.0');

      expect(writeJSON).toHaveBeenCalled();
    });

    it('merges archival updates', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({ version: '1.0.0', archival: { enabled: false } });

      updateMetadata({ archival: { enabled: true, threshold_days: 14 } }, '2.0.0');

      expect(writeJSON).toHaveBeenCalledWith(
        'docs/00-meta/agileflow-metadata.json',
        expect.objectContaining({
          version: '2.0.0',
          archival: expect.objectContaining({ enabled: true, threshold_days: 14 }),
        })
      );
    });

    it('merges feature updates', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({ features: {} });

      updateMetadata({ features: { sessionstart: { enabled: true } } }, '2.0.0');

      expect(writeJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          features: expect.objectContaining({
            sessionstart: expect.objectContaining({ enabled: true }),
          }),
        })
      );
    });
  });
});
