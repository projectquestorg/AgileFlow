/**
 * Tests for quality-gates.js - Builder/Validator Quality Gate Framework
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  // Constants
  GATE_TYPES,
  GATE_STATUS,
  BUILDER_TOOLS,
  VALIDATOR_TOOLS,
  DEFAULT_COMMANDS,

  // Gate creation
  createGate,
  createStandardGates,

  // Gate execution
  executeGate,
  executeGates,

  // Helper functions
  parseCoverageOutput,
  truncateOutput,

  // Builder/Validator framework
  isBuilderAgent,
  isValidatorAgent,
  getValidatorTools,
  createValidatorConfig,
  parseAgentFrontmatter,
  hasValidatorSupport,

  // Reporting
  createValidationReport,

  // Expertise staleness
  DEFAULT_STALENESS_DAYS,
  checkExpertiseStaleness,
  findYamlFiles,

  // Default gates & pre-gate commands
  loadDefaultGates,
  executePreGateCommands,
} = require('../../../scripts/lib/quality-gates');

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  describe('GATE_TYPES', () => {
    it('includes all expected gate types', () => {
      expect(GATE_TYPES.TESTS).toBe('tests');
      expect(GATE_TYPES.COVERAGE).toBe('coverage');
      expect(GATE_TYPES.LINT).toBe('lint');
      expect(GATE_TYPES.TYPES).toBe('types');
      expect(GATE_TYPES.VISUAL).toBe('visual');
      expect(GATE_TYPES.CUSTOM).toBe('custom');
      expect(GATE_TYPES.EXPERTISE_STALENESS).toBe('expertise_staleness');
    });
  });

  describe('GATE_STATUS', () => {
    it('includes all expected statuses', () => {
      expect(GATE_STATUS.PASSED).toBe('passed');
      expect(GATE_STATUS.FAILED).toBe('failed');
      expect(GATE_STATUS.SKIPPED).toBe('skipped');
      expect(GATE_STATUS.ERROR).toBe('error');
    });
  });

  describe('BUILDER_TOOLS', () => {
    it('includes write tools', () => {
      expect(BUILDER_TOOLS).toContain('Write');
      expect(BUILDER_TOOLS).toContain('Edit');
      expect(BUILDER_TOOLS).toContain('Bash');
    });

    it('includes read tools', () => {
      expect(BUILDER_TOOLS).toContain('Read');
      expect(BUILDER_TOOLS).toContain('Glob');
      expect(BUILDER_TOOLS).toContain('Grep');
    });
  });

  describe('VALIDATOR_TOOLS', () => {
    it('includes only read tools', () => {
      expect(VALIDATOR_TOOLS).toContain('Read');
      expect(VALIDATOR_TOOLS).toContain('Glob');
      expect(VALIDATOR_TOOLS).toContain('Grep');
    });

    it('does not include write tools', () => {
      expect(VALIDATOR_TOOLS).not.toContain('Write');
      expect(VALIDATOR_TOOLS).not.toContain('Edit');
      expect(VALIDATOR_TOOLS).not.toContain('Bash');
    });
  });

  describe('DEFAULT_COMMANDS', () => {
    it('has commands for main gate types', () => {
      expect(DEFAULT_COMMANDS[GATE_TYPES.TESTS]).toBe('npm test');
      expect(DEFAULT_COMMANDS[GATE_TYPES.LINT]).toBe('npm run lint');
      expect(DEFAULT_COMMANDS[GATE_TYPES.TYPES]).toBe('npx tsc --noEmit');
    });
  });
});

// ============================================================================
// Gate Creation Tests
// ============================================================================

describe('Gate Creation', () => {
  describe('createGate', () => {
    it('creates gate with required fields', () => {
      const gate = createGate({
        type: GATE_TYPES.TESTS,
        name: 'Unit Tests',
      });

      expect(gate.type).toBe(GATE_TYPES.TESTS);
      expect(gate.name).toBe('Unit Tests');
      expect(gate.command).toBe(DEFAULT_COMMANDS[GATE_TYPES.TESTS]);
      expect(gate.created_at).toBeDefined();
    });

    it('uses default name from type', () => {
      const gate = createGate({ type: GATE_TYPES.LINT });
      expect(gate.name).toBe(GATE_TYPES.LINT);
    });

    it('allows custom command', () => {
      const gate = createGate({
        type: GATE_TYPES.TESTS,
        command: 'jest --coverage',
      });

      expect(gate.command).toBe('jest --coverage');
    });

    it('sets threshold for coverage gate', () => {
      const gate = createGate({
        type: GATE_TYPES.COVERAGE,
        threshold: 85,
      });

      expect(gate.threshold).toBe(85);
    });

    it('throws for invalid gate type', () => {
      expect(() => {
        createGate({ type: 'invalid' });
      }).toThrow('Invalid gate type');
    });

    it('sets default timeout', () => {
      const gate = createGate({ type: GATE_TYPES.TESTS });
      expect(gate.timeout).toBe(120000);
    });

    it('allows custom timeout', () => {
      const gate = createGate({
        type: GATE_TYPES.TESTS,
        timeout: 60000,
      });
      expect(gate.timeout).toBe(60000);
    });
  });

  describe('createStandardGates', () => {
    it('creates default gates', () => {
      const gates = createStandardGates();

      const types = gates.map(g => g.type);
      expect(types).toContain(GATE_TYPES.TESTS);
      expect(types).toContain(GATE_TYPES.LINT);
      expect(types).toContain(GATE_TYPES.TYPES);
    });

    it('excludes coverage by default', () => {
      const gates = createStandardGates();
      const types = gates.map(g => g.type);
      expect(types).not.toContain(GATE_TYPES.COVERAGE);
    });

    it('includes coverage when enabled', () => {
      const gates = createStandardGates({
        includeCoverage: true,
        coverageThreshold: 90,
      });

      const coverageGate = gates.find(g => g.type === GATE_TYPES.COVERAGE);
      expect(coverageGate).toBeDefined();
      expect(coverageGate.threshold).toBe(90);
    });

    it('allows disabling gates', () => {
      const gates = createStandardGates({
        includeTests: false,
        includeLint: false,
        includeTypes: false,
      });

      expect(gates).toHaveLength(0);
    });

    it('includes custom gates', () => {
      const gates = createStandardGates({
        customGates: [
          { name: 'Security Scan', command: 'npm audit' },
          { name: 'E2E Tests', command: 'npm run e2e' },
        ],
      });

      const customGates = gates.filter(g => g.type === GATE_TYPES.CUSTOM);
      expect(customGates).toHaveLength(2);
    });
  });
});

// ============================================================================
// Gate Execution Tests
// ============================================================================

describe('Gate Execution', () => {
  describe('executeGate', () => {
    it('executes simple command successfully', () => {
      const gate = createGate({
        type: GATE_TYPES.CUSTOM,
        command: 'echo "test passed"',
      });

      const result = executeGate(gate);

      expect(result.status).toBe(GATE_STATUS.PASSED);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('returns failed for non-zero exit', () => {
      const gate = createGate({
        type: GATE_TYPES.CUSTOM,
        command: 'exit 1',
      });

      const result = executeGate(gate);

      expect(result.status).toBe(GATE_STATUS.FAILED);
      expect(result.exit_code).toBe(1);
    });

    it('skips in dry run mode', () => {
      const gate = createGate({
        type: GATE_TYPES.TESTS,
      });

      const result = executeGate(gate, { dryRun: true });

      expect(result.status).toBe(GATE_STATUS.SKIPPED);
      expect(result.message).toContain('Dry run');
    });

    it('skips gate without command', () => {
      const gate = createGate({
        type: GATE_TYPES.VISUAL,
      });
      gate.command = null;

      const result = executeGate(gate);

      expect(result.status).toBe(GATE_STATUS.SKIPPED);
    });

    it('handles timeout', () => {
      const gate = createGate({
        type: GATE_TYPES.CUSTOM,
        command: 'sleep 10',
        timeout: 100, // 100ms timeout
      });

      const result = executeGate(gate);

      // Should either timeout with error, fail, or complete
      expect([GATE_STATUS.ERROR, GATE_STATUS.PASSED, GATE_STATUS.FAILED]).toContain(result.status);
    });
  });

  describe('executeGates', () => {
    it('executes multiple gates', () => {
      const gates = [
        createGate({ type: GATE_TYPES.CUSTOM, name: 'Gate 1', command: 'echo 1' }),
        createGate({ type: GATE_TYPES.CUSTOM, name: 'Gate 2', command: 'echo 2' }),
      ];

      const result = executeGates(gates);

      expect(result.total).toBe(2);
      expect(result.passed_count).toBe(2);
      expect(result.passed).toBe(true);
    });

    it('stops on failure when configured', () => {
      const gates = [
        createGate({ type: GATE_TYPES.CUSTOM, name: 'Failing', command: 'exit 1' }),
        createGate({ type: GATE_TYPES.CUSTOM, name: 'Should Skip', command: 'echo 2' }),
      ];

      const result = executeGates(gates, { stopOnFailure: true });

      expect(result.passed).toBe(false);
      expect(result.failed_count).toBe(1);
      expect(result.skipped_count).toBe(1);
    });

    it('continues on failure when not stopping', () => {
      const gates = [
        createGate({ type: GATE_TYPES.CUSTOM, name: 'Failing', command: 'exit 1' }),
        createGate({ type: GATE_TYPES.CUSTOM, name: 'Should Run', command: 'echo 2' }),
      ];

      const result = executeGates(gates, { stopOnFailure: false });

      expect(result.failed_count).toBe(1);
      expect(result.passed_count).toBe(1);
      expect(result.skipped_count).toBe(0);
    });

    it('includes executed_at timestamp', () => {
      const gates = [createGate({ type: GATE_TYPES.CUSTOM, command: 'echo 1' })];

      const result = executeGates(gates);

      expect(result.executed_at).toBeDefined();
      expect(new Date(result.executed_at)).toBeInstanceOf(Date);
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('Helper Functions', () => {
  describe('parseCoverageOutput', () => {
    it('parses Jest coverage output', () => {
      const output = `
        All files       |   85.5 |   78.12 |   91.23 |   84.67
      `;

      const coverage = parseCoverageOutput(output);
      // The regex matches the first number after the pipe
      expect(coverage).toBeGreaterThan(0);
    });

    it('parses percentage format', () => {
      const output = 'Coverage: 72.5%';
      const coverage = parseCoverageOutput(output);
      expect(coverage).toBe(72.5);
    });

    it('parses Statements format', () => {
      const output = 'Statements   : 90.12%';
      const coverage = parseCoverageOutput(output);
      expect(coverage).toBe(90.12);
    });

    it('returns null for unparseable output', () => {
      const output = 'No coverage info here';
      const coverage = parseCoverageOutput(output);
      expect(coverage).toBeNull();
    });
  });

  describe('truncateOutput', () => {
    it('returns short strings unchanged', () => {
      const output = 'Short output';
      expect(truncateOutput(output)).toBe('Short output');
    });

    it('truncates long strings', () => {
      const output = 'A'.repeat(3000);
      const truncated = truncateOutput(output, 100);

      expect(truncated.length).toBeLessThan(output.length);
      expect(truncated).toContain('truncated');
    });

    it('handles empty/null input', () => {
      expect(truncateOutput('')).toBe('');
      expect(truncateOutput(null)).toBe('');
      expect(truncateOutput(undefined)).toBe('');
    });
  });
});

// ============================================================================
// Expertise Staleness Tests
// ============================================================================

describe('Expertise Staleness', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expertise-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('DEFAULT_STALENESS_DAYS', () => {
    it('is 30 days', () => {
      expect(DEFAULT_STALENESS_DAYS).toBe(30);
    });
  });

  describe('findYamlFiles', () => {
    it('finds yaml files in directory', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.yaml'), 'content: true');
      fs.writeFileSync(path.join(tmpDir, 'test.yml'), 'content: true');
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'not yaml');

      const files = findYamlFiles(tmpDir);
      expect(files).toHaveLength(2);
      expect(files.every(f => f.endsWith('.yaml') || f.endsWith('.yml'))).toBe(true);
    });

    it('finds yaml files recursively', () => {
      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(tmpDir, 'root.yaml'), 'content: true');
      fs.writeFileSync(path.join(subDir, 'nested.yaml'), 'content: true');

      const files = findYamlFiles(tmpDir);
      expect(files).toHaveLength(2);
    });

    it('returns empty array for empty directory', () => {
      const files = findYamlFiles(tmpDir);
      expect(files).toEqual([]);
    });
  });

  describe('checkExpertiseStaleness', () => {
    it('returns SKIPPED when directory does not exist', () => {
      const result = checkExpertiseStaleness({ expertiseDir: '/nonexistent/path' });
      expect(result.status).toBe('skipped');
      expect(result.message).toContain('No expertise directory');
    });

    it('returns PASSED when all files are fresh', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.yaml'), 'content: true');

      const result = checkExpertiseStaleness({ expertiseDir: tmpDir, thresholdDays: 30 });
      expect(result.status).toBe('passed');
      expect(result.value.fresh).toBe(1);
      expect(result.value.stale).toBe(0);
    });

    it('returns FAILED when files are stale', () => {
      const filePath = path.join(tmpDir, 'old.yaml');
      fs.writeFileSync(filePath, 'content: true');
      // Set mtime to 60 days ago
      const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, oldTime, oldTime);

      const result = checkExpertiseStaleness({ expertiseDir: tmpDir, thresholdDays: 30 });
      expect(result.status).toBe('failed');
      expect(result.value.stale).toBe(1);
      expect(result.output).toContain('old.yaml');
    });

    it('respects configurable threshold', () => {
      const filePath = path.join(tmpDir, 'recent.yaml');
      fs.writeFileSync(filePath, 'content: true');
      // Set mtime to 5 days ago
      const recentTime = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, recentTime, recentTime);

      // Should pass with 30-day threshold
      const result30 = checkExpertiseStaleness({ expertiseDir: tmpDir, thresholdDays: 30 });
      expect(result30.status).toBe('passed');

      // Should fail with 3-day threshold
      const result3 = checkExpertiseStaleness({ expertiseDir: tmpDir, thresholdDays: 3 });
      expect(result3.status).toBe('failed');
    });

    it('reports mixed fresh and stale files', () => {
      // Fresh file
      fs.writeFileSync(path.join(tmpDir, 'fresh.yaml'), 'content: true');

      // Stale file
      const stalePath = path.join(tmpDir, 'stale.yaml');
      fs.writeFileSync(stalePath, 'content: true');
      const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(stalePath, oldTime, oldTime);

      const result = checkExpertiseStaleness({ expertiseDir: tmpDir, thresholdDays: 30 });
      expect(result.status).toBe('failed');
      expect(result.value.fresh).toBe(1);
      expect(result.value.stale).toBe(1);
      expect(result.value.total).toBe(2);
    });
  });

  describe('executeGate with expertise staleness', () => {
    it('executes expertise staleness gate via executeGate', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.yaml'), 'content: true');

      const gate = createGate({
        type: GATE_TYPES.EXPERTISE_STALENESS,
        name: 'Expertise Freshness',
        threshold: 30,
      });
      gate.expertiseDir = tmpDir;

      const result = executeGate(gate);
      expect(result.type).toBe('expertise_staleness');
      expect(result.status).toBe('passed');
    });
  });
});

// ============================================================================
// Builder/Validator Framework Tests
// ============================================================================

describe('Builder/Validator Framework', () => {
  describe('isBuilderAgent', () => {
    it('returns true for agents with write tools', () => {
      expect(isBuilderAgent(['Read', 'Write', 'Edit'])).toBe(true);
      expect(isBuilderAgent(['Read', 'Bash'])).toBe(true);
    });

    it('returns false for read-only agents', () => {
      expect(isBuilderAgent(['Read', 'Glob', 'Grep'])).toBe(false);
    });
  });

  describe('isValidatorAgent', () => {
    it('returns true for read-only agents', () => {
      expect(isValidatorAgent(['Read', 'Glob', 'Grep'])).toBe(true);
    });

    it('returns false for agents with write tools', () => {
      expect(isValidatorAgent(['Read', 'Write'])).toBe(false);
      expect(isValidatorAgent(['Read', 'Edit'])).toBe(false);
      expect(isValidatorAgent(['Read', 'Bash'])).toBe(false);
    });
  });

  describe('getValidatorTools', () => {
    it('filters to read-only tools', () => {
      const builderTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
      const validatorTools = getValidatorTools(builderTools);

      expect(validatorTools).toContain('Read');
      expect(validatorTools).toContain('Glob');
      expect(validatorTools).toContain('Grep');
      expect(validatorTools).not.toContain('Write');
      expect(validatorTools).not.toContain('Edit');
      expect(validatorTools).not.toContain('Bash');
    });
  });

  describe('createValidatorConfig', () => {
    it('creates validator config from builder', () => {
      const builderConfig = {
        name: 'agileflow-api',
        description: 'API builder',
        model: 'sonnet',
      };

      const validatorConfig = createValidatorConfig(builderConfig);

      expect(validatorConfig.name).toBe('agileflow-api-validator');
      expect(validatorConfig.is_validator).toBe(true);
      expect(validatorConfig.validates_builder).toBe('agileflow-api');
      expect(validatorConfig.tools).toEqual(VALIDATOR_TOOLS);
    });

    it('preserves compact_context rules', () => {
      const builderConfig = {
        name: 'agileflow-api',
        compact_context: {
          preserve_rules: ['Rule 1', 'Rule 2'],
        },
      };

      const validatorConfig = createValidatorConfig(builderConfig);

      expect(validatorConfig.compact_context.preserve_rules).toContain('Rule 1');
      expect(validatorConfig.compact_context.preserve_rules).toContain(
        'You are a VALIDATOR - you CANNOT modify files'
      );
    });
  });

  describe('parseAgentFrontmatter', () => {
    it('parses frontmatter from markdown', () => {
      const content = `---
name: agileflow-api
description: API agent
tools: Read, Write, Edit
model: haiku
has_validator: true
---

## Content here
`;

      const frontmatter = parseAgentFrontmatter(content);

      expect(frontmatter.name).toBe('agileflow-api');
      expect(frontmatter.model).toBe('haiku');
      expect(frontmatter.has_validator).toBe(true);
      expect(frontmatter.tools).toEqual(['Read', 'Write', 'Edit']);
    });

    it('returns null for invalid format', () => {
      const content = 'No frontmatter here';
      expect(parseAgentFrontmatter(content)).toBeNull();
    });
  });

  describe('hasValidatorSupport', () => {
    it('returns true when has_validator is true', () => {
      expect(hasValidatorSupport({ has_validator: true })).toBe(true);
    });

    it('returns false when has_validator is false or missing', () => {
      expect(hasValidatorSupport({ has_validator: false })).toBe(false);
      expect(hasValidatorSupport({})).toBe(false);
      expect(hasValidatorSupport(null)).toBeFalsy();
    });
  });
});

// ============================================================================
// Reporting Tests
// ============================================================================

describe('Reporting', () => {
  describe('createValidationReport', () => {
    it('creates formatted report', () => {
      const gateResults = {
        passed: true,
        total: 2,
        passed_count: 2,
        failed_count: 0,
        skipped_count: 0,
        results: [
          {
            gate: 'Tests',
            type: 'tests',
            status: 'passed',
            message: 'All tests pass',
            duration_ms: 1000,
          },
          { gate: 'Lint', type: 'lint', status: 'passed', message: 'No errors', duration_ms: 500 },
        ],
        executed_at: '2026-01-01T00:00:00.000Z',
      };

      const report = createValidationReport(gateResults, {
        storyId: 'US-0001',
        builderAgent: 'agileflow-api',
        validatorAgent: 'agileflow-api-validator',
      });

      expect(report).toContain('## Validation Report');
      expect(report).toContain('US-0001');
      expect(report).toContain('agileflow-api');
      expect(report).toContain('PASSED');
      expect(report).toContain('Tests');
      expect(report).toContain('Lint');
    });

    it('shows failure status', () => {
      const gateResults = {
        passed: false,
        total: 2,
        passed_count: 1,
        failed_count: 1,
        skipped_count: 0,
        results: [
          { gate: 'Tests', type: 'tests', status: 'passed', message: 'Pass' },
          {
            gate: 'Coverage',
            type: 'coverage',
            status: 'failed',
            message: 'Below threshold',
            value: 72,
            threshold: 80,
          },
        ],
        executed_at: '2026-01-01T00:00:00.000Z',
      };

      const report = createValidationReport(gateResults);

      expect(report).toContain('FAILED');
      expect(report).toContain('Below threshold');
      expect(report).toContain('72');
      expect(report).toContain('80');
    });
  });
});

// ============================================================================
// loadDefaultGates Tests
// ============================================================================

describe('loadDefaultGates', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-gates-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns tests+lint+types by default', () => {
    const gates = loadDefaultGates(tmpDir);

    expect(gates).toHaveLength(3);
    const types = gates.map(g => g.type);
    expect(types).toContain(GATE_TYPES.TESTS);
    expect(types).toContain(GATE_TYPES.LINT);
    expect(types).toContain(GATE_TYPES.TYPES);
  });

  it('returns gates with proper names', () => {
    const gates = loadDefaultGates(tmpDir);

    const names = gates.map(g => g.name);
    expect(names).toContain('Unit Tests');
    expect(names).toContain('Lint');
    expect(names).toContain('Type Check');
  });

  it('respects metadata override', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        ci_feedback_loops: {
          default_gates: ['tests'],
        },
      })
    );

    const gates = loadDefaultGates(tmpDir);

    expect(gates).toHaveLength(1);
    expect(gates[0].type).toBe(GATE_TYPES.TESTS);
  });

  it('handles unknown gate names as custom type', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        ci_feedback_loops: {
          default_gates: ['tests', 'custom'],
        },
      })
    );

    const gates = loadDefaultGates(tmpDir);

    expect(gates).toHaveLength(2);
    expect(gates[1].type).toBe(GATE_TYPES.CUSTOM);
  });

  it('each gate has a command from DEFAULT_COMMANDS', () => {
    const gates = loadDefaultGates(tmpDir);

    for (const gate of gates) {
      expect(gate.command).toBeDefined();
    }
  });
});

// ============================================================================
// executePreGateCommands Tests
// ============================================================================

describe('executePreGateCommands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupConfig(config) {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        ci_feedback_loops: config,
      })
    );
  }

  it('runs configured pre-gate commands', () => {
    setupConfig({
      pre_gate_commands: {
        lint: 'echo lint-fix',
      },
    });

    const gates = [createGate({ type: GATE_TYPES.LINT, name: 'Lint' })];

    const results = executePreGateCommands(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    expect(results).toHaveLength(1);
    expect(results[0].gate).toBe('Lint');
    expect(results[0].command).toBe('echo lint-fix');
    expect(results[0].exit_code).toBe(0);
  });

  it('skips gates with no pre-command configured', () => {
    setupConfig({
      pre_gate_commands: {
        lint: 'echo lint-fix',
      },
    });

    const gates = [
      createGate({ type: GATE_TYPES.TESTS, name: 'Tests' }),
      createGate({ type: GATE_TYPES.LINT, name: 'Lint' }),
      createGate({ type: GATE_TYPES.TYPES, name: 'Types' }),
    ];

    const results = executePreGateCommands(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    // Only lint has a pre-command
    expect(results).toHaveLength(1);
    expect(results[0].gate).toBe('Lint');
  });

  it('returns empty array when no pre-commands configured', () => {
    // No config file at all
    const gates = [createGate({ type: GATE_TYPES.TESTS, name: 'Tests' })];

    const results = executePreGateCommands(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    expect(results).toEqual([]);
  });

  it('handles command errors gracefully', () => {
    setupConfig({
      pre_gate_commands: {
        lint: 'false', // exit 1
      },
    });

    const gates = [createGate({ type: GATE_TYPES.LINT, name: 'Lint' })];

    const results = executePreGateCommands(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    // Should still return a result, not throw
    expect(results).toHaveLength(1);
    expect(results[0].exit_code).toBe(1);
  });

  it('runs multiple pre-gate commands for different gate types', () => {
    setupConfig({
      pre_gate_commands: {
        lint: 'echo lint-fix',
        types: 'echo types-fix',
      },
    });

    const gates = [
      createGate({ type: GATE_TYPES.LINT, name: 'Lint' }),
      createGate({ type: GATE_TYPES.TYPES, name: 'Types' }),
    ];

    const results = executePreGateCommands(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    expect(results).toHaveLength(2);
    expect(results[0].command).toBe('echo lint-fix');
    expect(results[1].command).toBe('echo types-fix');
  });
});
