/**
 * Tests for context-formatter.js - Output formatting module for obtain-context
 */

const fs = require('fs');

// Mock fs and dependencies
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Mock the loader module
jest.mock('../../../scripts/lib/context-loader', () => ({
  safeRead: jest.fn(),
  safeReadJSON: jest.fn(),
  safeLs: jest.fn(),
  safeExec: jest.fn(),
  getContextPercentage: jest.fn(),
}));

// Mock colors
jest.mock('../../../lib/colors', () => ({
  c: {
    dim: '[dim]',
    reset: '[reset]',
    bold: '[bold]',
    brand: '[brand]',
    coral: '[coral]',
    amber: '[amber]',
    skyBlue: '[skyBlue]',
    mintGreen: '[mintGreen]',
    peach: '[peach]',
    lavender: '[lavender]',
    teal: '[teal]',
    cyan: '[cyan]',
    blue: '[blue]',
    green: '[green]',
    lightGreen: '[lightGreen]',
    lightYellow: '[lightYellow]',
  },
  box: {},
}));

const {
  pad,
  truncate,
  generateContextWarning,
  generateSummary,
  generateFullContent,
  generateMinimalContent,
} = require('../../../scripts/lib/context-formatter');

const {
  safeRead,
  safeReadJSON,
  safeLs,
  safeExec,
  getContextPercentage,
} = require('../../../scripts/lib/context-loader');

describe('context-formatter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    safeExec.mockReturnValue(null);
    safeReadJSON.mockReturnValue(null);
    safeLs.mockReturnValue([]);
  });

  describe('pad', () => {
    it('pads string to specified length', () => {
      expect(pad('test', 10)).toBe('test      ');
    });

    it('does not truncate longer strings', () => {
      expect(pad('longstring', 5)).toBe('longstring');
    });

    it('handles ANSI codes correctly', () => {
      const withAnsi = '\x1b[31mred\x1b[0m';
      const padded = pad(withAnsi, 10);
      // Should pad based on visible length (3), not string length
      expect(padded.replace(/\x1b\[[0-9;]*m/g, '')).toBe('red       ');
    });
  });

  describe('truncate', () => {
    it('does not truncate short strings', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('truncates long strings with suffix', () => {
      expect(truncate('this is a long string', 10)).toBe('this is ..');
    });

    it('uses custom suffix', () => {
      expect(truncate('this is a long string', 10, '...')).toBe('this is...');
    });

    it('handles ANSI codes correctly', () => {
      const withAnsi = '\x1b[31mverylongredtext\x1b[0m';
      const truncated = truncate(withAnsi, 8);
      expect(truncated.replace(/\x1b\[[0-9;]*m/g, '')).toBe('verylo..');
    });
  });

  describe('generateContextWarning', () => {
    it('returns empty string when below 50%', () => {
      expect(generateContextWarning(49)).toBe('');
      expect(generateContextWarning(0)).toBe('');
    });

    it('generates warning for 50-69%', () => {
      const warning = generateContextWarning(55);
      expect(warning).toContain('55%');
      expect(warning).toContain('approaching');
      expect(warning).toContain('⚠️');
    });

    it('generates critical warning for 70%+', () => {
      const warning = generateContextWarning(75);
      expect(warning).toContain('75%');
      expect(warning).toContain('degradation zone');
      expect(warning).toContain('🔴');
    });

    it('includes suggestion for mitigation', () => {
      const warning = generateContextWarning(60);
      expect(warning).toContain('sub-agent');
    });
  });

  describe('generateSummary', () => {
    beforeEach(() => {
      safeExec.mockImplementation(cmd => {
        if (cmd.includes('branch')) return 'main';
        if (cmd.includes('%h')) return 'abc123';
        if (cmd.includes('%s')) return 'test commit';
        if (cmd.includes('status')) return '';
        return null;
      });
      safeReadJSON.mockReturnValue(null);
      safeLs.mockReturnValue([]);
    });

    it('generates summary without command name', () => {
      const summary = generateSummary(null, {});
      expect(summary).toContain('Context Summary');
    });

    it('includes command name when provided', () => {
      const summary = generateSummary(null, { commandName: 'babysit' });
      expect(summary).toContain('Context [babysit]');
    });

    it('shows git branch', () => {
      const summary = generateSummary(null, {});
      expect(summary).toContain('main');
    });

    it('uses prefetched data when available', () => {
      const prefetched = {
        git: {
          branch: 'feature-branch',
          commitShort: 'def456',
          commitMsg: 'prefetched commit',
          status: '',
        },
        json: {},
        researchFiles: [],
        dirs: { epics: [] },
      };
      const summary = generateSummary(prefetched, {});
      expect(summary).toContain('feature-branch');
      expect(summary).toContain('def456');
    });

    it('shows story counts from status.json', () => {
      safeReadJSON.mockReturnValue({
        stories: {
          'US-001': { status: 'ready' },
          'US-002': { status: 'ready' },
          'US-003': { status: 'done' },
        },
      });
      const summary = generateSummary(null, {});
      expect(summary).toContain('Ready');
      expect(summary).toContain('Completed');
    });

    it('shows active sections when provided', () => {
      const summary = generateSummary(null, { activeSections: ['loop-mode', 'visual-e2e'] });
      expect(summary).toContain('📖 Sections');
      expect(summary).toContain('loop-mode');
    });

    it('shows uncommitted file count', () => {
      safeExec.mockImplementation(cmd => {
        if (cmd.includes('status')) return 'M file1.js\nM file2.js';
        if (cmd.includes('branch')) return 'main';
        return '';
      });
      const summary = generateSummary(null, {});
      expect(summary).toContain('uncommitted');
    });
  });

  describe('generateFullContent', () => {
    beforeEach(() => {
      safeExec.mockImplementation(cmd => {
        if (cmd.includes('branch')) return 'main';
        if (cmd.includes('%h %s')) return 'abc123 test commit';
        if (cmd.includes('%h')) return 'abc123';
        if (cmd.includes('%s')) return 'test commit';
        if (cmd.includes('status')) return '';
        return null;
      });
      safeReadJSON.mockReturnValue(null);
      safeLs.mockReturnValue([]);
      safeRead.mockReturnValue(null);
    });

    it('includes title', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('AgileFlow Context');
    });

    it('includes command name in title', () => {
      const content = generateFullContent(null, { commandName: 'babysit' });
      expect(content).toContain('AgileFlow Context [babysit]');
    });

    it('includes timestamp', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Generated:');
    });

    it('shows git status section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Git Status');
      expect(content).toContain('Branch:');
    });

    it('shows status.json section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Status.json');
    });

    it('shows session state section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Session State');
    });

    it('shows documentation section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Documentation');
    });

    it('shows research notes section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Research Notes');
    });

    it('shows agent messages section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Recent Agent Messages');
    });

    it('shows key files section', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Key Context Files');
    });

    it('shows AskUserQuestion banner when enabled', () => {
      safeReadJSON.mockImplementation(path => {
        if (path.includes('metadata')) {
          return { features: { askUserQuestion: { enabled: true } } };
        }
        return null;
      });
      const content = generateFullContent(null, {});
      expect(content).toContain('AskUserQuestion');
    });

    it('shows context budget warning when usage is high', () => {
      getContextPercentage.mockReturnValue({ percent: 60, tokens: 120000, max: 200000 });
      const content = generateFullContent(null, {});
      expect(content).toContain('60%');
    });

    it('shows progressive disclosure sections', () => {
      const content = generateFullContent(null, { activeSections: ['loop-mode'] });
      expect(content).toContain('Progressive Disclosure');
      expect(content).toContain('loop-mode');
    });

    it('uses prefetched data', () => {
      const prefetched = {
        git: {
          branch: 'test-branch',
          commitFull: 'xyz789 prefetched',
          status: '',
        },
        json: { metadata: null, statusJson: null, sessionState: null },
        text: { busLog: null },
        dirs: { docs: [], epics: [] },
        researchFiles: [],
        sectionsToLoad: { researchContent: true, sessionClaims: true, fileOverlaps: true },
      };
      const content = generateFullContent(prefetched, {});
      expect(content).toContain('test-branch');
      expect(content).toContain('xyz789 prefetched');
    });

    it('shows unified UI Testing status when enabled', () => {
      fs.existsSync.mockImplementation(p => {
        if (p.includes('playwright')) return true;
        if (p === 'screenshots') return true;
        return false;
      });
      const content = generateFullContent(null, {});
      expect(content).toContain('UI Testing (Bowser): ENABLED');
    });
  });

  describe('verbosity modes', () => {
    beforeEach(() => {
      safeExec.mockImplementation(cmd => {
        if (cmd.includes('branch')) return 'main';
        if (cmd.includes('%h %s')) return 'abc123 test commit';
        if (cmd.includes('%h')) return 'abc123';
        if (cmd.includes('%s')) return 'test commit';
        if (cmd.includes('status')) return 'M file1.js';
        return null;
      });
      safeReadJSON.mockImplementation(p => {
        if (p.includes('status.json')) {
          return {
            stories: {
              'US-001': { status: 'ready', title: 'First story' },
              'US-002': { status: 'in-progress', title: 'Second story' },
              'US-003': { status: 'done', title: 'Third story' },
            },
          };
        }
        return null;
      });
      safeLs.mockReturnValue([]);
      safeRead.mockReturnValue(null);
    });

    it('defaults to full mode when verbosityMode not specified', () => {
      const content = generateFullContent(null, {});
      expect(content).toContain('Key Context Files');
      expect(content).toContain('Status.json (Full Content)');
    });

    it('lite mode skips key file dumps', () => {
      const prefetched = {
        git: { branch: 'main', commitFull: 'abc123 test', status: 'M file1.js' },
        json: {
          metadata: null,
          statusJson: {
            stories: {
              'US-001': { status: 'ready', title: 'First story' },
              'US-002': { status: 'in-progress', title: 'Second story' },
            },
          },
          sessionState: null,
        },
        text: {},
        dirs: { docs: [], epics: [], research: [] },
        researchFiles: [],
        sectionsToLoad: { researchContent: true, sessionClaims: true, fileOverlaps: true },
      };
      const content = generateFullContent(prefetched, { verbosityMode: 'lite' });
      expect(content).not.toContain('Key Context Files');
      expect(content).toContain('Active Stories');
      expect(content).toContain('[lite]');
    });

    it('lite mode shows active stories instead of full status dump', () => {
      const prefetched = {
        git: { branch: 'main', commitFull: 'abc123 test', status: '' },
        json: {
          metadata: null,
          statusJson: {
            stories: {
              'US-001': { status: 'ready', title: 'First story' },
              'US-002': { status: 'in-progress', title: 'Second story' },
              'US-003': { status: 'done', title: 'Third story' },
            },
          },
          sessionState: null,
        },
        text: {},
        dirs: { docs: [], epics: [] },
        researchFiles: [],
        sectionsToLoad: { researchContent: true, sessionClaims: true, fileOverlaps: true },
      };
      const content = generateFullContent(prefetched, { verbosityMode: 'lite' });
      expect(content).toContain('Active Stories');
      expect(content).toContain('US-001');
      expect(content).toContain('US-002');
      expect(content).not.toContain('Full Content');
    });

    it('minimal mode returns compact output', () => {
      const prefetched = {
        git: { branch: 'feature-x', commitFull: 'def456 feat', status: 'M a.js\nM b.js' },
        json: {
          metadata: null,
          statusJson: {
            stories: {
              'US-001': { status: 'ready', title: 'Story A' },
              'US-002': { status: 'done', title: 'Story B' },
            },
          },
          sessionState: null,
        },
        text: {},
        dirs: { epics: [] },
        researchFiles: [],
        sectionsToLoad: {},
      };
      const content = generateFullContent(prefetched, { verbosityMode: 'minimal' });
      expect(content).toContain('minimal');
      expect(content).toContain('feature-x');
      expect(content).toContain('2 uncommitted');
      expect(content).toContain('1 ready');
      expect(content).toContain('1 done');
      expect(content).not.toContain('Status.json');
      expect(content).not.toContain('Key Context Files');
      expect(content).not.toContain('Documentation');
    });

    it('minimal mode is significantly shorter than full mode', () => {
      const prefetched = {
        git: { branch: 'main', commitFull: 'abc test', status: '' },
        json: { metadata: null, statusJson: null, sessionState: null },
        text: {},
        dirs: { docs: [], epics: [] },
        researchFiles: [],
        sectionsToLoad: {},
      };
      const full = generateFullContent(prefetched, { verbosityMode: 'full' });
      const minimal = generateFullContent(prefetched, { verbosityMode: 'minimal' });
      // Minimal should be much shorter
      expect(minimal.length).toBeLessThan(full.length * 0.5);
    });

    it('lite mode skips feature catalog and ideation', () => {
      const prefetched = {
        git: { branch: 'main', commitFull: 'abc test', status: '' },
        json: { metadata: null, statusJson: null, sessionState: null },
        text: {},
        dirs: { docs: [], epics: [] },
        researchFiles: [],
        sectionsToLoad: { researchContent: true, sessionClaims: true, fileOverlaps: true },
      };
      const content = generateFullContent(prefetched, {
        verbosityMode: 'lite',
        smartDetectResults: {
          disabled: false,
          lifecycle_phase: 'development',
          phase_reason: 'test',
          recommendations: {
            immediate: [{ feature: 'test', trigger: 'test', command: 'test' }],
            available: [{ feature: 'avail', trigger: 'test', command: 'test' }],
            auto_enabled: {},
          },
          feature_catalog: [
            {
              name: 'test',
              category: 'modes',
              status: 'available',
              description: 'test',
              how_to_use: 'test',
            },
          ],
        },
      });
      // Immediate recommendations should be present
      expect(content).toContain('Immediate');
      // Available and feature catalog should be absent in lite
      expect(content).not.toContain('Feature Catalog');
    });
  });
});
