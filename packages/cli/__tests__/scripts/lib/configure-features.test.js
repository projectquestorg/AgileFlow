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
  enableStartupMode,
  STARTUP_MODES,
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
      expect(FEATURES.noaiattribution).toBeDefined();
    });

    it('hook features have required properties', () => {
      expect(FEATURES.sessionstart.hook).toBe('SessionStart');
      expect(FEATURES.sessionstart.script).toBe('agileflow-welcome.js');
      expect(FEATURES.sessionstart.type).toBe('node');
    });

    it('noaiattribution has correct config', () => {
      expect(FEATURES.noaiattribution.preToolUseHook).toBe(true);
      expect(FEATURES.noaiattribution.script).toBe('strip-ai-attribution.js');
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
      expect(PROFILES.full.enable).toContain('noaiattribution');
    });

    it('basic profile includes noaiattribution', () => {
      expect(PROFILES.basic.enable).toContain('noaiattribution');
    });

    it('none profile disables all features', () => {
      expect(PROFILES.none.disable).toContain('sessionstart');
      expect(PROFILES.none.disable).toContain('precompact');
      expect(PROFILES.none.disable).toContain('noaiattribution');
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

    it('enables noaiattribution when script exists', () => {
      fs.existsSync.mockImplementation(p => {
        if (p.includes('strip-ai-attribution.js')) return true;
        return false;
      });
      readJSON.mockReturnValue({});
      fs.readFileSync.mockReturnValue('script-content');

      const result = enableFeature('noaiattribution', {}, '2.0.0');

      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith('AI attribution blocking enabled');
      expect(writeJSON).toHaveBeenCalledWith(
        '.claude/settings.json',
        expect.objectContaining({
          hooks: expect.objectContaining({
            PreToolUse: expect.arrayContaining([
              expect.objectContaining({
                matcher: 'Bash',
                hooks: expect.arrayContaining([
                  expect.objectContaining({
                    command: expect.stringContaining('strip-ai-attribution'),
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('returns false if strip-ai-attribution script not found', () => {
      fs.existsSync.mockReturnValue(false);
      readJSON.mockReturnValue({});

      const result = enableFeature('noaiattribution', {}, '2.0.0');

      expect(result).toBe(false);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Script not found'));
    });

    it('adds noaiattribution to existing Bash PreToolUse matcher', () => {
      fs.existsSync.mockImplementation(p => {
        if (p.includes('strip-ai-attribution.js')) return true;
        return false;
      });
      readJSON.mockReturnValue({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node damage-control-bash.js' }],
            },
          ],
        },
      });
      fs.readFileSync.mockReturnValue('script-content');

      const result = enableFeature('noaiattribution', {}, '2.0.0');

      expect(result).toBe(true);
      // Should have both hooks on the Bash matcher
      const settingsCall = writeJSON.mock.calls.find(c => c[0] === '.claude/settings.json');
      const bashEntry = settingsCall[1].hooks.PreToolUse.find(h => h.matcher === 'Bash');
      expect(bashEntry.hooks).toHaveLength(2);
      expect(bashEntry.hooks[0].command).toContain('damage-control-bash');
      expect(bashEntry.hooks[1].command).toContain('strip-ai-attribution');
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

    it('disables noaiattribution and removes hook', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                { type: 'command', command: 'node /path/to/damage-control-bash.js' },
                { type: 'command', command: 'node /path/to/strip-ai-attribution.js' },
              ],
            },
          ],
        },
      });

      const result = disableFeature('noaiattribution', '2.0.0');

      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith('AI attribution blocking disabled');

      // Should keep damage-control but remove strip-ai-attribution
      const settingsCall = writeJSON.mock.calls.find(c => c[0] === '.claude/settings.json');
      const bashEntry = settingsCall[1].hooks.PreToolUse.find(h => h.matcher === 'Bash');
      expect(bashEntry.hooks).toHaveLength(1);
      expect(bashEntry.hooks[0].command).toContain('damage-control-bash');
    });

    it('removes empty PreToolUse array when disabling noaiattribution', () => {
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node /path/to/strip-ai-attribution.js' }],
            },
          ],
        },
      });

      const result = disableFeature('noaiattribution', '2.0.0');

      expect(result).toBe(true);
      const settingsCall = writeJSON.mock.calls.find(c => c[0] === '.claude/settings.json');
      expect(settingsCall[1].hooks.PreToolUse).toBeUndefined();
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

  describe('STARTUP_MODES constant', () => {
    it('defines all expected modes', () => {
      expect(STARTUP_MODES['skip-permissions']).toBeDefined();
      expect(STARTUP_MODES['accept-edits']).toBeDefined();
      expect(STARTUP_MODES.normal).toBeDefined();
      expect(STARTUP_MODES['no-claude']).toBeDefined();
    });

    it('skip-permissions maps to bypassPermissions', () => {
      expect(STARTUP_MODES['skip-permissions'].defaultMode).toBe('bypassPermissions');
      expect(STARTUP_MODES['skip-permissions'].flags).toBe('--dangerously-skip-permissions');
    });

    it('accept-edits maps to acceptEdits', () => {
      expect(STARTUP_MODES['accept-edits'].defaultMode).toBe('acceptEdits');
    });

    it('normal has null defaultMode', () => {
      expect(STARTUP_MODES.normal.defaultMode).toBeNull();
      expect(STARTUP_MODES.normal.flags).toBeNull();
    });
  });

  describe('enableStartupMode', () => {
    it('returns false for invalid mode', () => {
      const result = enableStartupMode('invalid-mode', '3.0.0');
      expect(result).toBe(false);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Unknown startup mode'));
    });

    it('sets bypassPermissions for skip-permissions mode', () => {
      readJSON.mockReturnValue({});
      fs.existsSync.mockReturnValue(false);

      const result = enableStartupMode('skip-permissions', '3.0.0');

      expect(result).toBe(true);
      // Should write settings.json with permissions.defaultMode
      expect(writeJSON).toHaveBeenCalledWith(
        '.claude/settings.json',
        expect.objectContaining({
          permissions: expect.objectContaining({
            defaultMode: 'bypassPermissions',
          }),
        })
      );
      expect(success).toHaveBeenCalledWith(expect.stringContaining('skip-permissions'));
    });

    it('sets acceptEdits for accept-edits mode', () => {
      readJSON.mockReturnValue({});
      fs.existsSync.mockReturnValue(false);

      const result = enableStartupMode('accept-edits', '3.0.0');

      expect(result).toBe(true);
      expect(writeJSON).toHaveBeenCalledWith(
        '.claude/settings.json',
        expect.objectContaining({
          permissions: expect.objectContaining({
            defaultMode: 'acceptEdits',
          }),
        })
      );
    });

    it('removes defaultMode for normal mode', () => {
      readJSON.mockReturnValue({
        permissions: { defaultMode: 'bypassPermissions', allow: [], deny: [], ask: [] },
      });
      fs.existsSync.mockReturnValue(false);

      const result = enableStartupMode('normal', '3.0.0');

      expect(result).toBe(true);
      // Should write settings without defaultMode
      const settingsCall = writeJSON.mock.calls.find(c => c[0] === '.claude/settings.json');
      expect(settingsCall).toBeDefined();
      expect(settingsCall[1].permissions.defaultMode).toBeUndefined();
    });

    it('removes defaultMode for no-claude mode', () => {
      readJSON.mockReturnValue({
        permissions: { defaultMode: 'bypassPermissions', allow: [], deny: [], ask: [] },
      });
      fs.existsSync.mockReturnValue(false);

      const result = enableStartupMode('no-claude', '3.0.0');

      expect(result).toBe(true);
      const settingsCall = writeJSON.mock.calls.find(c => c[0] === '.claude/settings.json');
      expect(settingsCall).toBeDefined();
      expect(settingsCall[1].permissions.defaultMode).toBeUndefined();
    });

    it('updates metadata defaultStartupMode', () => {
      readJSON.mockReturnValue({});
      fs.existsSync.mockReturnValue(false);

      enableStartupMode('skip-permissions', '3.0.0');

      // Last writeJSON call should be metadata with defaultStartupMode
      const metaCalls = writeJSON.mock.calls.filter(
        c => c[0] === 'docs/00-meta/agileflow-metadata.json'
      );
      expect(metaCalls.length).toBeGreaterThan(0);
      const lastMetaCall = metaCalls[metaCalls.length - 1];
      expect(lastMetaCall[1].defaultStartupMode).toBe('skip-permissions');
    });

    it('handles null settings.json gracefully', () => {
      readJSON.mockReturnValue(null);
      fs.existsSync.mockReturnValue(false);

      const result = enableStartupMode('skip-permissions', '3.0.0');

      expect(result).toBe(true);
      expect(writeJSON).toHaveBeenCalledWith(
        '.claude/settings.json',
        expect.objectContaining({
          permissions: expect.objectContaining({
            defaultMode: 'bypassPermissions',
          }),
        })
      );
    });

    it('preserves existing permissions arrays', () => {
      readJSON.mockReturnValue({
        permissions: {
          allow: ['Bash(npm test)'],
          deny: ['Bash(rm -rf)'],
          ask: [],
        },
      });
      fs.existsSync.mockReturnValue(false);

      enableStartupMode('skip-permissions', '3.0.0');

      const settingsCall = writeJSON.mock.calls.find(c => c[0] === '.claude/settings.json');
      expect(settingsCall[1].permissions.allow).toEqual(['Bash(npm test)']);
      expect(settingsCall[1].permissions.deny).toEqual(['Bash(rm -rf)']);
      expect(settingsCall[1].permissions.defaultMode).toBe('bypassPermissions');
    });
  });
});
