/**
 * Tests for lib/gate-runner.js
 *
 * Quality gate evaluation for tests, lint, types, and coverage.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

jest.mock('child_process');

describe('gate-runner.js', () => {
  let testDir;
  let gateRunner;

  beforeEach(() => {
    // Create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-gate-runner-test-'));

    // Reset require cache and mocks
    jest.clearAllMocks();
    delete require.cache[require.resolve('../../lib/gate-runner')];
    gateRunner = require('../../lib/gate-runner');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('evaluateGate() - tests', () => {
    test('returns passed when tests pass', () => {
      execFileSync.mockImplementation((cmd, opts) => 'Tests passing\n');

      const result = gateRunner.evaluateGate('tests', testDir);

      expect(result.gate).toBe('tests');
      expect(result.passed).toBe(true);
      expect(result.message).toContain('passing');
    });

    test('returns failed when tests fail', () => {
      const error = new Error('Test failed');
      error.stdout = 'Some tests failed\n';
      error.stderr = '';
      execFileSync.mockImplementation(() => {
        throw error;
      });

      const result = gateRunner.evaluateGate('tests', testDir);

      expect(result.gate).toBe('tests');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('failing');
    });

    test('detects npm test command', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { test: 'jest' } }));

      execFileSync.mockImplementation(() => 'Passing\n');

      gateRunner.evaluateGate('tests', testDir);

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', expect.stringContaining('npm test')]),
        expect.any(Object)
      );
    });

    test('accepts custom test command', () => {
      execFileSync.mockImplementation(() => 'Passing\n');

      gateRunner.evaluateGate('tests', testDir, { command: 'custom test' });

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', 'custom test']),
        expect.any(Object)
      );
    });

    test('respects timeout option', () => {
      execFileSync.mockImplementation(() => 'Passing\n');

      gateRunner.evaluateGate('tests', testDir, { timeout: 500000 });

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.any(Array),
        expect.objectContaining({ timeout: 500000 })
      );
    });

    test('measures execution duration', () => {
      execFileSync.mockImplementation(() => {
        // Simulate delay
        const start = Date.now();
        while (Date.now() - start < 50) {
          // Busy wait
        }
        return 'Passing\n';
      });

      const result = gateRunner.evaluateGate('tests', testDir);

      expect(result.duration).toBeGreaterThanOrEqual(40);
    });
  });

  describe('evaluateGate() - lint', () => {
    test('returns skipped when no lint command found', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: {} }));

      const result = gateRunner.evaluateGate('lint', testDir);

      expect(result.gate).toBe('lint');
      expect(result.passed).toBe(true);
      expect(result.message).toContain('skipped');
    });

    test('detects npm run lint command', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { lint: 'eslint' } }));

      execFileSync.mockImplementation(() => 'Passing\n');

      gateRunner.evaluateGate('lint', testDir);

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', 'npm run lint']),
        expect.any(Object)
      );
    });

    test('returns failed when linting fails', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { lint: 'eslint' } }));

      const error = new Error('Lint failed');
      error.stdout = 'Linting errors\n';
      execFileSync.mockImplementation(() => {
        throw error;
      });

      const result = gateRunner.evaluateGate('lint', testDir);

      expect(result.passed).toBe(false);
    });
  });

  describe('evaluateGate() - types', () => {
    test('returns skipped when no type-check command found', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: {} }));

      const result = gateRunner.evaluateGate('types', testDir);

      expect(result.gate).toBe('types');
      expect(result.passed).toBe(true);
      expect(result.message).toContain('skipped');
    });

    test('detects tsconfig.json and uses tsc', () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      execFileSync.mockImplementation(() => 'Passing\n');

      gateRunner.evaluateGate('types', testDir);

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', 'npx tsc --noEmit']),
        expect.any(Object)
      );
    });

    test('returns failed when type-check fails', () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const error = new Error('Type check failed');
      error.stdout = 'Type errors\n';
      execFileSync.mockImplementation(() => {
        throw error;
      });

      const result = gateRunner.evaluateGate('types', testDir);

      expect(result.passed).toBe(false);
    });
  });

  describe('evaluateGate() - coverage', () => {
    test('returns passed when coverage passes', () => {
      execFileSync.mockImplementation(() => 'Coverage: 85%\n');

      const result = gateRunner.evaluateGate('coverage', testDir, { threshold: 80 });

      expect(result.gate).toBe('coverage');
      expect(result.passed).toBe(true);
    });

    test('accepts custom threshold', () => {
      execFileSync.mockImplementation(() => 'Coverage check\n');

      const result = gateRunner.evaluateGate('coverage', testDir, { threshold: 90 });

      expect(result.message).toContain('90%');
    });

    test('appends --coverage flag to test command', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { test: 'jest' } }));

      execFileSync.mockImplementation(() => 'Coverage\n');

      gateRunner.evaluateGate('coverage', testDir);

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', expect.stringContaining('--coverage')]),
        expect.any(Object)
      );
    });
  });

  describe('evaluateGate() - unknown gate', () => {
    test('returns error for unknown gate', () => {
      const result = gateRunner.evaluateGate('unknown-gate', testDir);

      expect(result.gate).toBe('unknown-gate');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('Unknown gate');
    });
  });

  describe('evaluateGates()', () => {
    test('runs multiple gates', () => {
      execFileSync.mockImplementation(() => 'Passing\n');

      const result = gateRunner.evaluateGates(
        { tests: true, lint: false, types: true, coverage: false },
        testDir
      );

      expect(result.results).toHaveLength(2);
      expect(result.results.map(r => r.gate)).toContain('tests');
      expect(result.results.map(r => r.gate)).toContain('types');
    });

    test('returns allPassed true when all pass', () => {
      execFileSync.mockImplementation(() => 'Passing\n');

      const result = gateRunner.evaluateGates({ tests: true, lint: true }, testDir);

      expect(result.allPassed).toBe(true);
    });

    test('returns allPassed false when any fail', () => {
      // Create a package.json with lint script to ensure lint is detected
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { lint: 'eslint', test: 'jest' } }));

      let callCount = 0;
      execFileSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // tests pass
          return 'Passing\n';
        }
        // lint fails
        const error = new Error('Failed');
        error.stdout = 'Failure\n';
        throw error;
      });

      const result = gateRunner.evaluateGates({ tests: true, lint: true }, testDir);

      expect(result.allPassed).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results.some(r => !r.passed)).toBe(true);
    });

    test('aggregates total duration', () => {
      execFileSync.mockImplementation(() => {
        const start = Date.now();
        while (Date.now() - start < 20) {
          // Busy wait
        }
        return 'Passing\n';
      });

      const result = gateRunner.evaluateGates({ tests: true, types: true }, testDir);

      // Should have run two gates
      expect(result.results).toHaveLength(2);
      // Each gate should have some measurable duration
      const allDurations = result.results.map(r => r.duration);
      const totalFromResults = allDurations.reduce((a, b) => a + b, 0);
      expect(totalFromResults).toBe(result.totalDuration);
    });

    test('skips disabled gates', () => {
      execFileSync.mockImplementation(() => 'Passing\n');

      const result = gateRunner.evaluateGates({ tests: true, lint: false }, testDir);

      expect(result.results.length).toBe(1);
      expect(result.results[0].gate).toBe('tests');
    });

    test('passes gate-specific options', () => {
      execFileSync.mockImplementation(() => 'Passing\n');

      gateRunner.evaluateGates({ tests: true }, testDir, { tests: { timeout: 600000 } });

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.any(Array),
        expect.objectContaining({ timeout: 600000 })
      );
    });
  });

  describe('loadGateConfig()', () => {
    test('loads config from metadata.json', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });

      const metadata = {
        quality_gates: {
          task_completed: {
            tests: { enabled: true, timeout: 500000 },
            lint: { enabled: false },
          },
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const config = gateRunner.loadGateConfig(testDir, 'task_completed');

      expect(config.tests).toEqual({ enabled: true, timeout: 500000 });
      expect(config.lint).toEqual({ enabled: false });
    });

    test('returns defaults when metadata missing', () => {
      const config = gateRunner.loadGateConfig(testDir, 'task_completed');

      expect(config).toEqual(gateRunner.DEFAULT_GATE_CONFIG);
    });

    test('returns defaults when hook not in metadata', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });

      const metadata = { quality_gates: {} };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const config = gateRunner.loadGateConfig(testDir, 'unknown_hook');

      expect(config).toEqual(gateRunner.DEFAULT_GATE_CONFIG);
    });

    test('handles malformed metadata gracefully', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(metadataPath, 'invalid json {]');

      const config = gateRunner.loadGateConfig(testDir, 'task_completed');

      expect(config).toEqual(gateRunner.DEFAULT_GATE_CONFIG);
    });
  });

  describe('detectTestCommand()', () => {
    test('detects npm test script', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { test: 'jest' } }));

      const cmd = gateRunner.detectTestCommand(testDir);

      expect(cmd).toBe('npm test');
    });

    test('defaults to npm test when no script found', () => {
      const cmd = gateRunner.detectTestCommand(testDir);

      expect(cmd).toBe('npm test');
    });

    test('detects jest.config.js', () => {
      fs.writeFileSync(path.join(testDir, 'jest.config.js'), '{}');

      const cmd = gateRunner.detectTestCommand(testDir);

      expect(cmd).toBe('npx jest');
    });

    test('detects vitest.config.ts', () => {
      fs.writeFileSync(path.join(testDir, 'vitest.config.ts'), '{}');

      const cmd = gateRunner.detectTestCommand(testDir);

      expect(cmd).toBe('npx vitest run');
    });

    test('detects pytest.ini', () => {
      fs.writeFileSync(path.join(testDir, 'pytest.ini'), '{}');

      const cmd = gateRunner.detectTestCommand(testDir);

      expect(cmd).toBe('pytest');
    });
  });

  describe('detectLintCommand()', () => {
    test('detects npm run lint', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { lint: 'eslint' } }));

      const cmd = gateRunner.detectLintCommand(testDir);

      expect(cmd).toBe('npm run lint');
    });

    test('detects npm run lint:all', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { 'lint:all': 'eslint' } }));

      const cmd = gateRunner.detectLintCommand(testDir);

      expect(cmd).toBe('npm run lint:all');
    });

    test('returns null when no lint script found', () => {
      const cmd = gateRunner.detectLintCommand(testDir);

      expect(cmd).toBeNull();
    });
  });

  describe('detectTypeCheckCommand()', () => {
    test('detects npm run typecheck', () => {
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { typecheck: 'tsc' } }));

      const cmd = gateRunner.detectTypeCheckCommand(testDir);

      expect(cmd).toBe('npm run typecheck');
    });

    test('detects tsconfig.json and uses tsc', () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const cmd = gateRunner.detectTypeCheckCommand(testDir);

      expect(cmd).toBe('npx tsc --noEmit');
    });

    test('returns null when no type-check found', () => {
      const cmd = gateRunner.detectTypeCheckCommand(testDir);

      expect(cmd).toBeNull();
    });
  });

  describe('runCommand()', () => {
    test('returns success when command passes', () => {
      execFileSync.mockImplementation(() => 'Success output\n');

      const result = gateRunner.runCommand('test-cmd', testDir, 5000);

      expect(result.passed).toBe(true);
      expect(result.output).toContain('Success');
    });

    test('returns failure when command fails', () => {
      const error = new Error('Failed');
      error.stdout = 'stdout content';
      error.stderr = 'stderr content';
      execFileSync.mockImplementation(() => {
        throw error;
      });

      const result = gateRunner.runCommand('test-cmd', testDir, 5000);

      expect(result.passed).toBe(false);
      expect(result.output).toContain('stdout content');
    });

    test('passes cwd to execSync', () => {
      execFileSync.mockImplementation(() => 'Success\n');

      gateRunner.runCommand('test-cmd', testDir, 5000);

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', 'test-cmd']),
        expect.objectContaining({ cwd: testDir })
      );
    });

    test('passes timeout to execSync', () => {
      execFileSync.mockImplementation(() => 'Success\n');

      gateRunner.runCommand('test-cmd', testDir, 12345);

      expect(execFileSync).toHaveBeenCalledWith(
        'bash',
        expect.arrayContaining(['-c', 'test-cmd']),
        expect.objectContaining({ timeout: 12345 })
      );
    });

    test('measures execution time', () => {
      execFileSync.mockImplementation(() => {
        const start = Date.now();
        while (Date.now() - start < 50) {
          // Busy wait
        }
        return 'Success\n';
      });

      const result = gateRunner.runCommand('test-cmd', testDir, 5000);

      expect(result.duration).toBeGreaterThanOrEqual(40);
    });
  });

  describe('DEFAULT_GATE_CONFIG', () => {
    test('has expected structure', () => {
      expect(gateRunner.DEFAULT_GATE_CONFIG).toMatchObject({
        tests: expect.objectContaining({
          enabled: expect.any(Boolean),
          timeout: expect.any(Number),
        }),
        lint: expect.objectContaining({
          enabled: expect.any(Boolean),
          timeout: expect.any(Number),
        }),
        types: expect.objectContaining({
          enabled: expect.any(Boolean),
          timeout: expect.any(Number),
        }),
        coverage: expect.objectContaining({
          enabled: expect.any(Boolean),
          timeout: expect.any(Number),
          threshold: expect.any(Number),
        }),
      });
    });
  });
});
