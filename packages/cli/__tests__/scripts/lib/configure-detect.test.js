/**
 * Tests for configure-detect.js
 */

const fs = require('fs');
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
  header: jest.fn(),
  readJSON: jest.fn(),
}));

const { readJSON } = require('../../../scripts/lib/configure-utils');
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
      execSync.mockReturnValue('https://github.com/test/repo.git\n');

      const status = detectConfig('2.0.0');

      expect(status.git.initialized).toBe(true);
      expect(status.git.remote).toBe('https://github.com/test/repo.git');
    });

    it('handles missing git remote gracefully', () => {
      fs.existsSync.mockImplementation(p => p === '.git');
      execSync.mockImplementation(() => {
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
        features: { archival: { enabled: false, threshold: null } },
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

    it('detects outdated features', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          sessionstart: { enabled: true, version: null, outdated: false },
        },
        hasOutdated: false,
      };
      fs.existsSync.mockReturnValue(true);
      readJSON.mockReturnValue({
        version: '1.0.0',
        features: { sessionstart: { enabled: true, version: '1.0.0' } },
      });

      detectMetadata(status, '2.0.0'); // Current version is newer

      expect(status.features.sessionstart.outdated).toBe(true);
      expect(status.hasOutdated).toBe(true);
    });

    it('handles askUserQuestion camelCase mapping', () => {
      const status = {
        metadata: { exists: false, version: null },
        features: {
          askuserquestion: { enabled: false, version: null, outdated: false, mode: null },
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
