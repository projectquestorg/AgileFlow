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
  parseArgs,
  getUltradeepConfig,
  pollWaveCompletion,
  sleep,
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

    it('includes Agent tool usage instructions with subagent_type', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'injection', subagent_type: 'security-analyzer-injection', label: 'Injection' },
        'src/',
        'trace123',
        '/tmp/sentinel',
        'security'
      );

      expect(prompt).toContain('Agent tool');
      expect(prompt).toContain('subagent_type');
      expect(prompt).toContain('security-analyzer-injection');
    });

    it('includes correct subagent_type for each analyzer', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'edge', subagent_type: 'logic-analyzer-edge', label: 'Edge Cases' },
        '.',
        'abc',
        '/tmp/s',
        'logic'
      );

      expect(prompt).toContain('logic-analyzer-edge');
      expect(prompt).toContain('Agent tool');
    });

    it('describes coordinator role, not direct analysis', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'auth', subagent_type: 'security-analyzer-auth', label: 'Auth' },
        'src/',
        'xyz',
        '/tmp/s',
        'security'
      );

      expect(prompt).toContain('coordinator');
      expect(prompt).toContain('sub-agent');
    });

    it('includes explicit model when provided', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'injection', subagent_type: 'security-analyzer-injection', label: 'Injection' },
        'src/',
        'trace123',
        '/tmp/sentinel',
        'security',
        'opus'
      );

      expect(prompt).toContain('model: "opus"');
    });

    it('omits model line when not provided', () => {
      const prompt = buildAnalyzerPrompt(
        { key: 'injection', subagent_type: 'security-analyzer-injection', label: 'Injection' },
        'src/',
        'trace123',
        '/tmp/sentinel',
        'security'
      );

      expect(prompt).not.toContain('model:');
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

  describe('parseArgs - stagger and concurrency flags', () => {
    const originalArgv = process.argv;

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('parses --stagger=5 correctly', () => {
      process.argv = ['node', 'script.js', '--audit=logic', '--stagger=5'];
      const opts = parseArgs();
      expect(opts.stagger).toBe(5);
    });

    it('parses --stagger=0 correctly', () => {
      process.argv = ['node', 'script.js', '--audit=logic', '--stagger=0'];
      const opts = parseArgs();
      expect(opts.stagger).toBe(0);
    });

    it('parses --stagger=1.5 as float', () => {
      process.argv = ['node', 'script.js', '--audit=logic', '--stagger=1.5'];
      const opts = parseArgs();
      expect(opts.stagger).toBe(1.5);
    });

    it('returns null stagger for invalid value', () => {
      process.argv = ['node', 'script.js', '--audit=logic', '--stagger=abc'];
      const opts = parseArgs();
      expect(opts.stagger).toBeNull();
    });

    it('parses --concurrency=3 correctly', () => {
      process.argv = ['node', 'script.js', '--audit=security', '--concurrency=3'];
      const opts = parseArgs();
      expect(opts.concurrency).toBe(3);
    });

    it('returns null concurrency for invalid value', () => {
      process.argv = ['node', 'script.js', '--audit=security', '--concurrency=abc'];
      const opts = parseArgs();
      expect(opts.concurrency).toBeNull();
    });

    it('defaults stagger and concurrency to null', () => {
      process.argv = ['node', 'script.js', '--audit=logic'];
      const opts = parseArgs();
      expect(opts.stagger).toBeNull();
      expect(opts.concurrency).toBeNull();
    });

    it('parses both flags together', () => {
      process.argv = ['node', 'script.js', '--audit=logic', '--stagger=2', '--concurrency=4'];
      const opts = parseArgs();
      expect(opts.stagger).toBe(2);
      expect(opts.concurrency).toBe(4);
    });
  });

  describe('getUltradeepConfig', () => {
    it('returns defaults when no metadata file exists', () => {
      const originalCwd = process.cwd;
      process.cwd = () => '/nonexistent/path';
      try {
        const config = getUltradeepConfig();
        expect(config).toEqual({ stagger_seconds: 3, max_concurrent: 0 });
      } finally {
        process.cwd = originalCwd;
      }
    });

    it('reads config from metadata file when available', () => {
      const metaDir = path.join(tmpDir, 'docs', '00-meta');
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(
        path.join(metaDir, 'agileflow-metadata.json'),
        JSON.stringify({
          ultradeep: { stagger_seconds: 5, max_concurrent: 3 },
        })
      );

      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;
      try {
        const config = getUltradeepConfig();
        expect(config.stagger_seconds).toBe(5);
        expect(config.max_concurrent).toBe(3);
      } finally {
        process.cwd = originalCwd;
      }
    });

    it('uses defaults for missing ultradeep keys', () => {
      const metaDir = path.join(tmpDir, 'docs', '00-meta');
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(
        path.join(metaDir, 'agileflow-metadata.json'),
        JSON.stringify({
          ultradeep: { tab_naming: 'prefix:name' },
        })
      );

      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;
      try {
        const config = getUltradeepConfig();
        expect(config.stagger_seconds).toBe(3);
        expect(config.max_concurrent).toBe(0);
      } finally {
        process.cwd = originalCwd;
      }
    });
  });

  describe('writeStatusFile - stagger and concurrency fields', () => {
    it('includes stagger_ms and max_concurrent in status', () => {
      const dir = createSentinelDir(tmpDir, 'stagger-test');
      const analyzers = [{ key: 'injection', subagent_type: 'x', label: 'Injection' }];

      writeStatusFile(dir, 'security', analyzers, 3000, 4);

      const status = JSON.parse(fs.readFileSync(path.join(dir, '_status.json'), 'utf8'));
      expect(status.stagger_ms).toBe(3000);
      expect(status.max_concurrent).toBe(4);
    });

    it('writes null for stagger_ms and max_concurrent when not provided', () => {
      const dir = createSentinelDir(tmpDir, 'no-stagger-test');
      const analyzers = [{ key: 'auth', subagent_type: 'x', label: 'Auth' }];

      writeStatusFile(dir, 'security', analyzers);

      const status = JSON.parse(fs.readFileSync(path.join(dir, '_status.json'), 'utf8'));
      expect(status.stagger_ms).toBeNull();
      expect(status.max_concurrent).toBeNull();
    });
  });

  describe('pollWaveCompletion', () => {
    it('resolves true when all findings files exist', async () => {
      const dir = createSentinelDir(tmpDir, 'wave-done');
      fs.writeFileSync(path.join(dir, 'a.findings.json'), '{}');
      fs.writeFileSync(path.join(dir, 'b.findings.json'), '{}');

      const result = await pollWaveCompletion(dir, ['a', 'b'], 1);
      expect(result).toBe(true);
    });

    it('resolves false on timeout when files are missing', async () => {
      const dir = createSentinelDir(tmpDir, 'wave-timeout');
      // Only create one of two expected files
      fs.writeFileSync(path.join(dir, 'a.findings.json'), '{}');

      // Use a very short timeout (0.001 minutes = 60ms) to avoid long test
      const result = await pollWaveCompletion(dir, ['a', 'b'], 0.001);
      expect(result).toBe(false);
    });
  });

  describe('sleep', () => {
    it('resolves after the specified delay', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
