/**
 * Tests for tmux-audit-monitor.js
 *
 * Tests file-based operations (status, collect, list) without requiring tmux.
 * Mocks execFileSync for tmux-dependent functions.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Mock child_process for tmux calls
jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const {
  getAnalyzerState,
  readStatusFile,
  collectResults,
  parseSubcommandArgs,
  cmdStatus,
  cmdCollect,
  cmdList,
} = require('../../../scripts/lib/tmux-audit-monitor');

describe('tmux-audit-monitor', () => {
  let tmpDir;
  let sentinelDir;
  let rootDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-monitor-test-'));
    rootDir = tmpDir;
    // Create ultradeep directory structure
    sentinelDir = path.join(tmpDir, 'docs', '09-agents', 'ultradeep', 'abc123');
    fs.mkdirSync(sentinelDir, { recursive: true });
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readStatusFile', () => {
    it('returns null when no _status.json exists', () => {
      const emptyDir = path.join(tmpDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      expect(readStatusFile(emptyDir)).toBeNull();
    });

    it('returns parsed status when file exists', () => {
      const status = {
        started_at: '2026-03-01T00:00:00.000Z',
        audit_type: 'logic',
        analyzers: ['edge', 'flow'],
        completed: [],
        failed: [],
      };
      fs.writeFileSync(path.join(sentinelDir, '_status.json'), JSON.stringify(status));
      const result = readStatusFile(sentinelDir);
      expect(result.audit_type).toBe('logic');
      expect(result.analyzers).toEqual(['edge', 'flow']);
    });

    it('returns null on corrupt JSON', () => {
      fs.writeFileSync(path.join(sentinelDir, '_status.json'), '{bad json');
      expect(readStatusFile(sentinelDir)).toBeNull();
    });
  });

  describe('getAnalyzerState', () => {
    it('returns done when findings file exists', () => {
      fs.writeFileSync(path.join(sentinelDir, 'edge.findings.json'), '{}');
      const state = getAnalyzerState('edge', sentinelDir, 'audit-logic-abc123', 'Logic');
      expect(state).toBe('done');
    });

    it('returns running when tmux window exists', () => {
      execFileSync.mockReturnValue('Logic:edge\nLogic:flow\n');
      const state = getAnalyzerState('edge', sentinelDir, 'audit-logic-abc123', 'Logic');
      expect(state).toBe('running');
    });

    it('returns stalled when no file and no tmux window', () => {
      execFileSync.mockReturnValue('Logic:flow\n');
      const state = getAnalyzerState('edge', sentinelDir, 'audit-logic-abc123', 'Logic');
      expect(state).toBe('stalled');
    });

    it('returns stalled when tmux throws', () => {
      execFileSync.mockImplementation(() => {
        throw new Error('no session');
      });
      const state = getAnalyzerState('edge', sentinelDir, 'audit-logic-abc123', 'Logic');
      expect(state).toBe('stalled');
    });
  });

  describe('collectResults', () => {
    it('collects all available findings', () => {
      const findings1 = { analyzer: 'edge', findings: [{ id: 'e-1' }] };
      const findings2 = { analyzer: 'flow', findings: [] };
      fs.writeFileSync(path.join(sentinelDir, 'edge.findings.json'), JSON.stringify(findings1));
      fs.writeFileSync(path.join(sentinelDir, 'flow.findings.json'), JSON.stringify(findings2));

      const results = collectResults(sentinelDir, ['edge', 'flow', 'type']);
      expect(results).toHaveLength(2);
      expect(results[0].analyzer).toBe('edge');
      expect(results[1].analyzer).toBe('flow');
    });

    it('skips missing files', () => {
      const results = collectResults(sentinelDir, ['edge', 'flow']);
      expect(results).toHaveLength(0);
    });

    it('handles corrupt findings gracefully', () => {
      fs.writeFileSync(path.join(sentinelDir, 'edge.findings.json'), '{bad');
      const results = collectResults(sentinelDir, ['edge']);
      expect(results).toHaveLength(1);
      expect(results[0].error).toContain('Failed to parse');
    });
  });

  describe('parseSubcommandArgs', () => {
    it('parses timeout', () => {
      const result = parseSubcommandArgs(['--timeout=600']);
      expect(result.timeout).toBe(600);
    });

    it('parses poll interval', () => {
      const result = parseSubcommandArgs(['--poll=10']);
      expect(result.poll).toBe(10);
    });

    it('parses analyzer filter', () => {
      const result = parseSubcommandArgs(['--analyzer=edge']);
      expect(result.analyzer).toBe('edge');
    });

    it('parses model override', () => {
      const result = parseSubcommandArgs(['--model=opus']);
      expect(result.model).toBe('opus');
    });

    it('parses keep-files flag', () => {
      const result = parseSubcommandArgs(['--keep-files']);
      expect(result.keepFiles).toBe(true);
    });

    it('uses defaults for missing args', () => {
      const result = parseSubcommandArgs([]);
      expect(result.timeout).toBe(1800);
      expect(result.poll).toBe(5);
      expect(result.analyzer).toBeNull();
      expect(result.model).toBeNull();
      expect(result.keepFiles).toBe(false);
    });

    it('handles invalid numbers gracefully', () => {
      const result = parseSubcommandArgs(['--timeout=abc', '--poll=xyz']);
      expect(result.timeout).toBe(1800);
      expect(result.poll).toBe(5);
    });
  });

  describe('cmdStatus', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('outputs error for missing trace', () => {
      cmdStatus(rootDir, 'nonexistent');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(false);
      expect(output.error).toContain('No trace found');
    });

    it('reports status for valid trace', () => {
      const status = {
        started_at: new Date().toISOString(),
        audit_type: 'logic',
        analyzers: ['edge', 'flow'],
        completed: [],
        failed: [],
      };
      fs.writeFileSync(path.join(sentinelDir, '_status.json'), JSON.stringify(status));
      fs.writeFileSync(
        path.join(sentinelDir, 'edge.findings.json'),
        JSON.stringify({
          analyzer: 'edge',
          findings: [{ id: 'e-1' }, { id: 'e-2' }],
        })
      );
      // flow is not done, tmux throws (stalled)
      execFileSync.mockImplementation(() => {
        throw new Error('no session');
      });

      cmdStatus(rootDir, 'abc123');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      expect(output.traceId).toBe('abc123');
      expect(output.auditType).toBe('logic');
      expect(output.progress.total).toBe(2);
      expect(output.progress.done).toBe(1);
      expect(output.progress.stalled).toBe(1);
      expect(output.analyzers[0].key).toBe('edge');
      expect(output.analyzers[0].state).toBe('done');
      expect(output.analyzers[0].findingsCount).toBe(2);
      expect(output.analyzers[1].key).toBe('flow');
      expect(output.analyzers[1].state).toBe('stalled');
    });
  });

  describe('cmdCollect', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('outputs error for missing trace', () => {
      cmdCollect(rootDir, 'nonexistent');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(false);
    });

    it('collects partial results', () => {
      const status = {
        started_at: new Date().toISOString(),
        audit_type: 'security',
        analyzers: ['injection', 'auth', 'secrets'],
        completed: [],
        failed: [],
      };
      fs.writeFileSync(path.join(sentinelDir, '_status.json'), JSON.stringify(status));
      fs.writeFileSync(
        path.join(sentinelDir, 'injection.findings.json'),
        JSON.stringify({
          analyzer: 'injection',
          findings: [],
        })
      );

      cmdCollect(rootDir, 'abc123');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      expect(output.complete).toBe(false);
      expect(output.found).toBe(1);
      expect(output.expected).toBe(3);
      expect(output.missing).toEqual(['auth', 'secrets']);
    });

    it('reports complete when all done', () => {
      const status = {
        started_at: new Date().toISOString(),
        audit_type: 'logic',
        analyzers: ['edge'],
        completed: [],
        failed: [],
      };
      fs.writeFileSync(path.join(sentinelDir, '_status.json'), JSON.stringify(status));
      fs.writeFileSync(
        path.join(sentinelDir, 'edge.findings.json'),
        JSON.stringify({
          analyzer: 'edge',
          findings: [],
        })
      );

      cmdCollect(rootDir, 'abc123');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      expect(output.complete).toBe(true);
      expect(output.missing).toEqual([]);
    });
  });

  describe('cmdList', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('returns empty array when no ultradeep dir', () => {
      const emptyRoot = path.join(tmpDir, 'empty-project');
      fs.mkdirSync(emptyRoot, { recursive: true });
      cmdList(emptyRoot);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      expect(output.traces).toEqual([]);
    });

    it('discovers traces with progress info', () => {
      const status = {
        started_at: new Date().toISOString(),
        audit_type: 'logic',
        analyzers: ['edge', 'flow'],
        completed: [],
        failed: [],
      };
      fs.writeFileSync(path.join(sentinelDir, '_status.json'), JSON.stringify(status));
      fs.writeFileSync(path.join(sentinelDir, 'edge.findings.json'), '{}');
      // tmux check - session not found
      execFileSync.mockImplementation(() => {
        throw new Error('no session');
      });

      cmdList(rootDir);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      expect(output.traces).toHaveLength(1);
      expect(output.traces[0].traceId).toBe('abc123');
      expect(output.traces[0].auditType).toBe('logic');
      expect(output.traces[0].progress.total).toBe(2);
      expect(output.traces[0].progress.done).toBe(1);
      expect(output.traces[0].sessionActive).toBe(false);
    });

    it('skips directories without _status.json', () => {
      // abc123 has no _status.json (remove what we might have)
      const noStatusDir = path.join(tmpDir, 'docs', '09-agents', 'ultradeep', 'nosuch');
      fs.mkdirSync(noStatusDir, { recursive: true });

      cmdList(rootDir);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      // abc123 dir exists but has no _status.json → skipped
      expect(output.traces).toHaveLength(0);
    });
  });
});
