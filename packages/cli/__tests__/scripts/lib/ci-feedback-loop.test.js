/**
 * Tests for CI Feedback Loop functionality in quality-gates.js
 *
 * Tests the executeCIFeedbackLoop() function that auto-retries
 * agent work when CI/tests fail, up to max_rounds before escalating.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  CI_FEEDBACK_DEFAULTS,
  loadCIFeedbackConfig,
  loadDefaultGates,
  executePreGateCommands,
  executeCIFeedbackLoop,
  createGate,
  GATE_TYPES,
  GATE_STATUS,
} = require('../../../scripts/lib/quality-gates');

// ============================================================================
// CI_FEEDBACK_DEFAULTS
// ============================================================================

describe('CI_FEEDBACK_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(CI_FEEDBACK_DEFAULTS.enabled).toBe(true);
    expect(CI_FEEDBACK_DEFAULTS.max_rounds).toBe(3);
  });

  it('includes default_gates with tests, lint, types', () => {
    expect(CI_FEEDBACK_DEFAULTS.default_gates).toEqual(['tests', 'lint', 'types']);
  });

  it('includes empty pre_gate_commands by default', () => {
    expect(CI_FEEDBACK_DEFAULTS.pre_gate_commands).toEqual({});
  });
});

// ============================================================================
// loadCIFeedbackConfig
// ============================================================================

describe('loadCIFeedbackConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-feedback-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when no metadata file exists', () => {
    const config = loadCIFeedbackConfig(tmpDir);
    expect(config.enabled).toBe(true);
    expect(config.max_rounds).toBe(3);
  });

  it('reads config from agileflow-metadata.json', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        ci_feedback_loops: {
          enabled: true,
          max_rounds: 5,
        },
      })
    );

    const config = loadCIFeedbackConfig(tmpDir);
    expect(config.max_rounds).toBe(5);
    expect(config.enabled).toBe(true);
  });

  it('merges with defaults when partial config provided', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        ci_feedback_loops: {
          max_rounds: 7,
        },
      })
    );

    const config = loadCIFeedbackConfig(tmpDir);
    expect(config.max_rounds).toBe(7);
    expect(config.enabled).toBe(true); // from defaults
  });

  it('returns defaults when metadata has no ci_feedback_loops key', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, 'agileflow-metadata.json'),
      JSON.stringify({
        agileflow: { version: '3.0.0' },
      })
    );

    const config = loadCIFeedbackConfig(tmpDir);
    expect(config.enabled).toBe(true);
    expect(config.max_rounds).toBe(3);
  });

  it('handles malformed JSON gracefully', () => {
    const metaDir = path.join(tmpDir, 'docs', '00-meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'agileflow-metadata.json'), 'not json');

    const config = loadCIFeedbackConfig(tmpDir);
    expect(config.enabled).toBe(true);
    expect(config.max_rounds).toBe(3);
  });
});

// ============================================================================
// executeCIFeedbackLoop
// ============================================================================

describe('executeCIFeedbackLoop', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-loop-'));
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

  it('returns disabled status when CI feedback loops are disabled', () => {
    setupConfig({ enabled: false, max_rounds: 3 });

    const gates = [createGate({ type: GATE_TYPES.TESTS })];
    const result = executeCIFeedbackLoop(gates, { projectRoot: tmpDir });

    expect(result.status).toBe('disabled');
    expect(result.should_retry).toBe(false);
  });

  it('returns passed status when all gates pass', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    // Create a gate with a command that will pass
    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Always Pass',
        command: 'true',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    expect(result.status).toBe('passed');
    expect(result.should_retry).toBe(false);
    expect(result.round).toBe(1);
  });

  it('returns retry status when gates fail and rounds remain', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Always Fail',
        command: 'false',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 1,
      cwd: tmpDir,
    });

    expect(result.status).toBe('retry');
    expect(result.should_retry).toBe(true);
    expect(result.round).toBe(1);
    expect(result.next_round).toBe(2);
    expect(result.max_rounds).toBe(3);
    expect(result.agent_feedback).toContain('Round 1/3');
    expect(result.failures).toHaveLength(1);
  });

  it('returns exhausted status when max rounds reached', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Always Fail',
        command: 'false',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 3,
      cwd: tmpDir,
    });

    expect(result.status).toBe('exhausted');
    expect(result.should_retry).toBe(false);
    expect(result.round).toBe(3);
    expect(result.max_rounds).toBe(3);
    expect(result.message).toContain('Escalating to human');
  });

  it('respects maxRounds override over config', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Always Fail',
        command: 'false',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      maxRounds: 5,
      currentRound: 3,
      cwd: tmpDir,
    });

    expect(result.status).toBe('retry');
    expect(result.should_retry).toBe(true);
    expect(result.max_rounds).toBe(5);
    expect(result.next_round).toBe(4);
  });

  it('includes structured agent feedback with failure details', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Lint Check',
        command: 'echo "error: unused variable" && exit 1',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 1,
      cwd: tmpDir,
    });

    expect(result.status).toBe('retry');
    expect(result.agent_feedback).toContain('CI Feedback Loop');
    expect(result.agent_feedback).toContain('Lint Check');
    expect(result.agent_feedback).toContain('Action Required');
  });

  it('handles multiple gates with mixed pass/fail', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Pass Gate',
        command: 'true',
      }),
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Fail Gate',
        command: 'false',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 1,
      cwd: tmpDir,
    });

    expect(result.status).toBe('retry');
    expect(result.gate_results.passed_count).toBe(1);
    expect(result.gate_results.failed_count).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].gate).toBe('Fail Gate');
  });

  it('uses defaults when no config file exists', () => {
    // No setupConfig call - no metadata file

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Always Fail',
        command: 'false',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 1,
      cwd: tmpDir,
    });

    expect(result.status).toBe('retry');
    expect(result.max_rounds).toBe(3); // default
  });

  it('tracks round progression correctly', () => {
    setupConfig({ enabled: true, max_rounds: 2 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Fail',
        command: 'false',
      }),
    ];

    // Round 1: should retry
    const r1 = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 1,
      cwd: tmpDir,
    });
    expect(r1.status).toBe('retry');
    expect(r1.next_round).toBe(2);

    // Round 2: should exhaust
    const r2 = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      currentRound: 2,
      cwd: tmpDir,
    });
    expect(r2.status).toBe('exhausted');
    expect(r2.should_retry).toBe(false);
  });

  it('runs pre-gate commands when configured', () => {
    setupConfig({
      enabled: true,
      max_rounds: 3,
      pre_gate_commands: {
        lint: 'echo lint-autofix',
      },
    });

    const gates = [
      createGate({
        type: GATE_TYPES.LINT,
        name: 'Lint',
        command: 'true',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    expect(result.status).toBe('passed');
    expect(result.pre_gate_results).toHaveLength(1);
    expect(result.pre_gate_results[0].command).toBe('echo lint-autofix');
    expect(result.pre_gate_results[0].exit_code).toBe(0);
  });

  it('pre-gate auto-fix failure does not block gates', () => {
    setupConfig({
      enabled: true,
      max_rounds: 3,
      pre_gate_commands: {
        custom: 'false', // pre-gate fails
      },
    });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Custom Gate',
        command: 'true', // gate itself passes
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    // Gate should still pass even though pre-gate command failed
    expect(result.status).toBe('passed');
    expect(result.pre_gate_results).toHaveLength(1);
    expect(result.pre_gate_results[0].exit_code).toBe(1);
  });

  it('returns empty pre_gate_results when none configured', () => {
    setupConfig({ enabled: true, max_rounds: 3 });

    const gates = [
      createGate({
        type: GATE_TYPES.CUSTOM,
        name: 'Pass',
        command: 'true',
      }),
    ];

    const result = executeCIFeedbackLoop(gates, {
      projectRoot: tmpDir,
      cwd: tmpDir,
    });

    expect(result.status).toBe('passed');
    expect(result.pre_gate_results).toEqual([]);
  });
});
