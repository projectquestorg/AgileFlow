/**
 * Tests for configure-detect.js
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

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
  header: jest.fn(),
  readJSON: jest.fn(),
}));

const { readJSON } = require('../../../scripts/lib/configure-utils');
// Mock configure-features FEATURES constant (must be before require)
jest.mock('../../../scripts/lib/configure-features', () => ({
  FEATURES: {
    sessionstart: { hook: 'SessionStart', script: 'agileflow-welcome.js', type: 'node' },
    precompact: { hook: 'PreCompact', script: 'precompact-context.sh', type: 'bash' },
    ralphloop: { hook: 'Stop', script: 'ralph-loop.js', type: 'node' },
    selfimprove: { hook: 'Stop', script: 'auto-self-improve.js', type: 'node' },
    archival: { script: 'archive-completed-stories.sh', requiresHook: 'sessionstart' },
    statusline: { script: 'agileflow-statusline.sh' },
    autoupdate: { metadataOnly: true },
    damagecontrol: {
      preToolUseHooks: true,
      scripts: ['damage-control-bash.js', 'damage-control-edit.js', 'damage-control-write.js'],
    },
    askuserquestion: { metadataOnly: true },
    tmuxautospawn: { metadataOnly: true },
  },
}));

const {
  detectConfig,
  printStatus,
  detectHooks,
  detectSessionStartHook,
  detectPreCompactHook,
  detectStopHooks,
  detectPreToolUseHooks,
  detectStatusLine,
  detectMetadata,
  hashFile,
  findPackageScriptDir,
} = require('../../../scripts/lib/configure-detect');

describe('configure-detect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    readJSON.mockReturnValue(null);
  });

  describe('detectConfig', () => {
    it('returns default status when nothing is configured', () => {
      const status = detectConfig('2.0.0');

      expect(status.git.initialized).toBe(false);
      expect(status.settingsExists).toBe(false);
      expect(status.currentVersion).toBe('2.0.0');
      expect(status.features.sessionstart.enabled).toBe(false);
    });

    it('detects git initialization', () => {
      fs.existsSync.mockImplementation(p => p === '.git');
      execFileSync.mockReturnValue('https://github.com/test/repo.git\n');

      const status = detectConfig('2.0.0');

      expect(status.git.initialized).toBe(true);
      expect(status.git.remote).toBe('https://github.com/test/repo.git');
    });

    it('handles missing git remote gracefully', () => {
      fs.existsSync.mockImplementation(p => p === '.git');
      execFileSync.mockImplementation(() => {
        throw new Error('No remote');
      });

      const status = detectConfig('2.0.0');

      expect(status.git.initialized).toBe(true);
      expect(status.git.remote).toBeNull();
    });

    it('detects invalid settings.json', () => {
      fs.existsSync.mockImplementation(p => p === '.claude/settings.json');
      readJSON.mockReturnValue(null);

      const status = detectConfig('2.0.0');

      expect(status.settingsExists).toBe(true);
      expect(status.settingsValid).toBe(false);
      expect(status.settingsIssues).toContain('Invalid JSON in settings.json');
    });

    it('detects valid settings with hooks', () => {
      fs.existsSync.mockImplementation(p => p === '.claude/settings.json');
      readJSON.mockReturnValue({
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'test' }] }],
        },
      });

      const status = detectConfig('2.0.0');

      expect(status.settingsExists).toBe(true);
      expect(status.settingsValid).toBe(true);
      expect(status.features.sessionstart.enabled).toBe(true);
    });
  });

  describe('detectSessionStartHook', () => {
    it('detects valid array format', () => {
      const status = { features: { sessionstart: { enabled: false, valid: true, issues: [] } } };
      const hook = [{ matcher: '', hooks: [{ type: 'command', command: 'test' }] }];

      detectSessionStartHook(hook, status);

      expect(status.features.sessionstart.enabled).toBe(true);
      expect(status.features.sessionstart.valid).toBe(true);
    });

    it('detects old format needing migration', () => {
      const status = { features: { sessionstart: { enabled: false, valid: true, issues: [] } } };
      const hook = [{ command: 'old format' }]; // Missing matcher

      detectSessionStartHook(hook, status);

      expect(status.features.sessionstart.enabled).toBe(true);
      expect(status.features.sessionstart.valid).toBe(false);
      expect(status.features.sessionstart.issues).toContain('Old format - needs migration');
    });

    it('detects string format needing migration', () => {
      const status = { features: { sessionstart: { enabled: false, valid: true, issues: [] } } };
      const hook = 'node script.js';

      detectSessionStartHook(hook, status);

      expect(status.features.sessionstart.enabled).toBe(true);
      expect(status.features.sessionstart.valid).toBe(false);
      expect(status.features.sessionstart.issues).toContain('String format - needs migration');
    });
  });

  describe('detectPreCompactHook', () => {
    it('detects valid array format', () => {
      const status = { features: { precompact: { enabled: false, valid: true, issues: [] } } };
      const hook = [{ matcher: '', hooks: [{ type: 'command', command: 'test' }] }];

      detectPreCompactHook(hook, status);

      expect(status.features.precompact.enabled).toBe(true);
    });
  });

  describe('detectStopHooks', () => {
    it('detects ralphloop hook', () => {
      const status = {
        features: {
          ralphloop: { enabled: false, valid: true, issues: [] },
          selfimprove: { enabled: false, valid: true, issues: [] },
        },
      };
      const hook = [
        {
          matcher: '',
          hooks: [{ type: 'command', command: 'node ralph-loop.js' }],
        },
      ];

      detectStopHooks(hook, status);

      expect(status.features.ralphloop.enabled).toBe(true);
      expect(status.features.selfimprove.enabled).toBe(false);
    });

    it('detects selfimprove hook', () => {
      const status = {
        features: {
          ralphloop: { enabled: false, valid: true, issues: [] },
          selfimprove: { enabled: false, valid: true, issues: [] },
        },
      };
      const hook = [
        {
          matcher: '',
          hooks: [{ type: 'command', command: 'node auto-self-improve.js' }],
        },
      ];

      detectStopHooks(hook, status);

      expect(status.features.selfimprove.enabled).toBe(true);
    });

    it('detects both hooks', () => {
      const status = {
        features: {
          ralphloop: { enabled: false, valid: true, issues: [] },
          selfimprove: { enabled: false, valid: true, issues: [] },
        },
      };
      const hook = [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: 'node ralph-loop.js' },
            { type: 'command', command: 'node auto-self-improve.js' },
          ],
        },
      ];

      detectStopHooks(hook, status);

      expect(status.features.ralphloop.enabled).toBe(true);
      expect(status.features.selfimprove.enabled).toBe(true);
    });
  });

  describe('detectPreToolUseHooks', () => {
    it('detects complete damage control setup', () => {
      const status = {
        features: {
          damagecontrol: { enabled: false, valid: true, issues: [] },
        },
      };
      const hooks = [
        { matcher: 'Bash', hooks: [{ command: 'node damage-control-bash.js' }] },
        { matcher: 'Edit', hooks: [{ command: 'node damage-control-edit.js' }] },
        { matcher: 'Write', hooks: [{ command: 'node damage-control-write.js' }] },
      ];

      detectPreToolUseHooks(hooks, status);

      expect(status.features.damagecontrol.enabled).toBe(true);
      expect(status.features.damagecontrol.valid).toBe(true);
    });

    it('detects incomplete damage control setup', () => {
      const status = {
        features: {
          damagecontrol: { enabled: false, valid: true, issues: [] },
        },
      };
      const hooks = [
        { matcher: 'Bash', hooks: [{ command: 'node damage-control-bash.js' }] },
        // Missing Edit and Write hooks
      ];

      detectPreToolUseHooks(hooks, status);

      expect(status.features.damagecontrol.enabled).toBe(true);
      expect(status.features.damagecontrol.valid).toBe(false);
      expect(status.features.damagecontrol.issues).toContain('Only 1/3 hooks configured');
    });
  });

  describe('detectStatusLine', () => {
    it('detects valid statusLine config', () => {
      const status = { features: { statusline: { enabled: false, valid: true, issues: [] } } };
      const settings = { statusLine: { type: 'command', command: 'bash script.sh' } };

      detectStatusLine(settings, status);

      expect(status.features.statusline.enabled).toBe(true);
      expect(status.features.statusline.valid).toBe(true);
    });

    it('detects string format statusLine', () => {
      const status = { features: { statusline: { enabled: false, valid: true, issues: [] } } };
      const settings = { statusLine: 'bash script.sh' };

      detectStatusLine(settings, status);

      expect(status.features.statusline.enabled).toBe(true);
      expect(status.features.statusline.valid).toBe(false);
      expect(status.features.statusline.issues).toContain('String format - needs type:command');
    });

    it('detects missing type in statusLine', () => {
      const status = { features: { statusline: { enabled: false, valid: true, issues: [] } } };
      const settings = { statusLine: { command: 'bash script.sh' } };

      detectStatusLine(settings, status);

      expect(status.features.statusline.valid).toBe(false);
      expect(status.features.statusline.issues).toContain('Missing type:command');
    });
  });

  describe('detectMetadata', () => {
    it('detects archival settings', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          archival: { enabled: false, threshold: null },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        hasOutdated: false,
      };
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        version: '2.0.0',
        archival: { enabled: true, threshold_days: 14 },
      });

      detectMetadata(status, '2.0.0');

      expect(status.metadata.exists).toBe(true);
      expect(status.metadata.version).toBe('2.0.0');
      expect(status.features.archival.enabled).toBe(true);
      expect(status.features.archival.threshold).toBe(14);
    });

    it('detects outdated features when script content has changed', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          sessionstart: { enabled: true, version: null, outdated: false },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        hasOutdated: false,
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(filePath => {
        if (typeof filePath === 'string' && filePath.includes('.agileflow')) {
          return 'old installed content';
        }
        return 'new package content';
      });
      readJSON.mockReturnValue({
        version: '1.0.0',
        features: { sessionstart: { enabled: true, version: '1.0.0' } },
      });

      detectMetadata(status, '2.0.0');

      expect(status.features.sessionstart.outdated).toBe(true);
      expect(status.hasOutdated).toBe(true);
    });

    it('does NOT mark outdated when content matches despite version mismatch', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          sessionstart: { enabled: true, version: null, outdated: false },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        hasOutdated: false,
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('identical script content');
      readJSON.mockReturnValue({
        version: '1.0.0',
        features: { sessionstart: { enabled: true, version: '1.0.0' } },
      });

      detectMetadata(status, '2.0.0'); // Different version, same content

      expect(status.features.sessionstart.outdated).toBe(false);
      expect(status.hasOutdated).toBe(false);
    });

    it('does not mark outdated when package source is unavailable (fail open)', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          sessionstart: { enabled: true, version: null, outdated: false },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        hasOutdated: false,
      };
      // Only metadata file exists, no package script directories
      fs.existsSync.mockImplementation(p => p === 'docs/00-meta/agileflow-metadata.json');
      readJSON.mockReturnValue({
        version: '1.0.0',
        features: { sessionstart: { enabled: true, version: '1.0.0' } },
      });

      detectMetadata(status, '2.0.0');

      expect(status.features.sessionstart.outdated).toBe(false);
      expect(status.hasOutdated).toBe(false);
    });

    it('uses version comparison for metadataOnly features', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          askuserquestion: { enabled: true, version: null, outdated: false, mode: null },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        hasOutdated: false,
      };
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        version: '1.0.0',
        features: {
          askUserQuestion: { enabled: true, mode: 'all', version: '1.0.0' },
        },
      });

      detectMetadata(status, '2.0.0');

      // metadataOnly features still use version comparison
      expect(status.features.askuserquestion.outdated).toBe(true);
      expect(status.hasOutdated).toBe(true);
    });

    it('handles askUserQuestion camelCase mapping', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          askuserquestion: { enabled: false, version: null, outdated: false, mode: null },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        hasOutdated: false,
      };
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        version: '2.0.0',
        features: { askUserQuestion: { enabled: true, mode: 'all', version: '2.0.0' } },
      });

      detectMetadata(status, '2.0.0');

      expect(status.features.askuserquestion.enabled).toBe(true);
      expect(status.features.askuserquestion.mode).toBe('all');
    });
  });

  describe('printStatus', () => {
    it('returns hasIssues true when features have issues', () => {
      const status = {
        git: { initialized: true, remote: null },
        settingsExists: true,
        settingsValid: true,
        features: {
          sessionstart: { enabled: true, valid: false, issues: ['Old format'], outdated: false },
          precompact: { enabled: false, valid: true, issues: [], outdated: false },
          ralphloop: { enabled: false, valid: true, issues: [], outdated: false },
          selfimprove: { enabled: false, valid: true, issues: [], outdated: false },
          archival: { enabled: false, threshold: null, outdated: false },
          statusline: { enabled: false, valid: true, issues: [], outdated: false },
          damagecontrol: { enabled: false, valid: true, issues: [], outdated: false },
          askuserquestion: { enabled: false, valid: true, issues: [], outdated: false },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        metadata: { exists: false, version: null },
        currentVersion: '2.0.0',
        hasOutdated: false,
      };

      const result = printStatus(status);

      expect(result.hasIssues).toBe(true);
      expect(result.hasOutdated).toBe(false);
    });

    it('returns hasOutdated from status', () => {
      const status = {
        git: { initialized: false, remote: null },
        settingsExists: false,
        settingsValid: true,
        features: {
          sessionstart: { enabled: false, valid: true, issues: [], outdated: false },
          precompact: { enabled: false, valid: true, issues: [], outdated: false },
          ralphloop: { enabled: false, valid: true, issues: [], outdated: false },
          selfimprove: { enabled: false, valid: true, issues: [], outdated: false },
          archival: { enabled: false, threshold: null, outdated: false },
          statusline: { enabled: false, valid: true, issues: [], outdated: false },
          damagecontrol: { enabled: false, valid: true, issues: [], outdated: false },
          askuserquestion: { enabled: false, valid: true, issues: [], outdated: false },
          tmuxautospawn: { enabled: true, valid: true, issues: [], outdated: false },
        },
        metadata: { exists: false, version: null },
        currentVersion: '2.0.0',
        hasOutdated: true,
      };

      const result = printStatus(status);

      expect(result.hasOutdated).toBe(true);
    });
  });
});
