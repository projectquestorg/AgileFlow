/**
 * Tests for spawn-audit-sessions.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  createSentinelDir,
  writeStatusFile,
  buildAnalyzerPrompt,
  collectResults,
  checkTmux,
} = require('../../scripts/spawn-audit-sessions');

describe('spawn-audit-sessions', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-audit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createSentinelDir', () => {
    it('creates directory structure', () => {
      const dir = createSentinelDir(tmpDir, 'test-trace-123');
      expect(fs.existsSync(dir)).toBe(true);
      expect(dir).toContain('ultradeep');
      expect(dir).toContain('test-trace-123');
    });

    it('creates nested directories', () => {
      const dir = createSentinelDir(tmpDir, 'abc');
      const expected = path.join(tmpDir, 'docs', '09-agents', 'ultradeep', 'abc');
      expect(dir).toBe(expected);
    });
  });

  describe('writeStatusFile', () => {
    it('writes _status.json with correct structure', () => {
      const dir = createSentinelDir(tmpDir, 'test');
      const analyzers = [
        { key: 'injection', subagent_type: 'security-analyzer-injection', label: 'Injection' },
        { key: 'auth', subagent_type: 'security-analyzer-auth', label: 'Auth' },
      ];

      writeStatusFile(dir, 'security', analyzers);

      const statusPath = path.join(dir, '_status.json');
      expect(fs.existsSync(statusPath)).toBe(true);

      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(status.audit_type).toBe('security');
      expect(status.analyzers).toEqual(['injection', 'auth']);
      expect(status.completed).toEqual([]);
      expect(status.failed).toEqual([]);
      expect(status.started_at).toBeTruthy();
    });
  });

  describe('buildAnalyzerPrompt', () => {
    it('includes analyzer name and target', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'injection', subagent_type: 'security-analyzer-injection', label: 'Injection' },
        'src/',
        'trace123',
        '/tmp/sentinel',
        'security'
      );

      expect(prompt).toContain('Injection');
      expect(prompt).toContain('src/');
      expect(prompt).toContain('trace123');
      expect(prompt).toContain('injection');
      expect(prompt).toContain('security');
    });

    it('includes sentinel file path for output', () => {
      const sentinelDir = '/tmp/test-sentinel';
      const prompt = buildAnalyzerPrompt(
        { key: 'edge', subagent_type: 'logic-analyzer-edge', label: 'Edge Cases' },
        '.',
        'abc',
        sentinelDir,
        'logic'
      );

      expect(prompt).toContain(path.join(sentinelDir, 'edge.findings.json'));
    });

    it('includes JSON output format specification', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'queries', subagent_type: 'perf-analyzer-queries', label: 'Queries' },
        'app/',
        'xyz',
        '/tmp/s',
        'performance'
      );

      expect(prompt).toContain('"analyzer"');
      expect(prompt).toContain('"findings"');
      expect(prompt).toContain('"severity"');
    });
  });

  describe('collectResults', () => {
    it('collects existing findings files', () => {
      const dir = createSentinelDir(tmpDir, 'collect-test');

      // Write some findings
      const findings = {
        analyzer: 'injection',
        audit_type: 'security',
        trace_id: 'collect-test',
        findings: [{ id: 'injection-001', severity: 'P0', title: 'SQL injection' }],
      };
      fs.writeFileSync(path.join(dir, 'injection.findings.json'), JSON.stringify(findings));

      const results = collectResults(dir, ['injection', 'auth']);
      expect(results).toHaveLength(1);
      expect(results[0].analyzer).toBe('injection');
      expect(results[0].findings).toHaveLength(1);
    });

    it('returns empty array for missing files', () => {
      const dir = createSentinelDir(tmpDir, 'empty-test');
      const results = collectResults(dir, ['injection']);
      expect(results).toHaveLength(0);
    });

    it('handles malformed JSON gracefully', () => {
      const dir = createSentinelDir(tmpDir, 'bad-json-test');
      fs.writeFileSync(path.join(dir, 'injection.findings.json'), 'not json');

      const results = collectResults(dir, ['injection']);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeTruthy();
      expect(results[0].findings).toEqual([]);
    });
  });

  describe('checkTmux', () => {
    it('returns an object with available and inSession', () => {
      const result = checkTmux();
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('inSession');
      expect(typeof result.available).toBe('boolean');
      expect(typeof result.inSession).toBe('boolean');
    });
  });
});
