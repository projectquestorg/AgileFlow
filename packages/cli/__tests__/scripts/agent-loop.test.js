/**
 * Tests for agent-loop.js - Isolated loop manager for domain agents
 */

// ============================================================================
// Mocks
// ============================================================================

const mockFs = {
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  appendFileSync: jest.fn(),
  unlinkSync: jest.fn(),
};

jest.mock('fs', () => mockFs);

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('abcd1234-5678-9012-3456-789012345678'),
}));

jest.mock('child_process', () => ({
  spawnSync: jest.fn().mockReturnValue({ status: 0 }),
}));

jest.mock('../../lib/colors', () => ({
  c: {
    red: '',
    green: '',
    yellow: '',
    cyan: '',
    magenta: '',
    dim: '',
    bold: '',
    reset: '',
    brand: '',
  },
}));

jest.mock('../../lib/paths', () => ({
  getProjectRoot: jest.fn().mockReturnValue('/mock/project'),
}));

const mockSafeReadJSON = jest.fn().mockReturnValue({ ok: false, data: null });
const mockSafeWriteJSON = jest.fn();

jest.mock('../../lib/errors', () => ({
  safeReadJSON: (...args) => mockSafeReadJSON(...args),
  safeWriteJSON: (...args) => mockSafeWriteJSON(...args),
  debugLog: jest.fn(),
}));

jest.mock('../../lib/validate-commands', () => ({
  buildSpawnArgs: jest.fn().mockReturnValue({
    ok: true,
    data: { file: 'npm', args: ['test'] },
  }),
}));

jest.mock('../../lib/correlation', () => ({
  initializeForProject: jest.fn().mockReturnValue({
    traceId: 'trace-123',
    sessionId: 'session-456',
  }),
  injectCorrelation: jest.fn(event => event),
}));

const mockExecuteGate = jest.fn();
const mockCreateGate = jest.fn(config => ({
  type: config.type,
  name: config.name || config.type,
  command: config.command || 'npm test',
  threshold: config.threshold || null,
}));

jest.mock('../../scripts/lib/quality-gates', () => ({
  executeGate: (...args) => mockExecuteGate(...args),
  createGate: (...args) => mockCreateGate(...args),
  GATE_TYPES: {
    TESTS: 'tests',
    COVERAGE: 'coverage',
    LINT: 'lint',
    TYPES: 'types',
    VISUAL: 'visual',
    CUSTOM: 'custom',
  },
  GATE_STATUS: {
    PASSED: 'passed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    ERROR: 'error',
  },
}));

// ============================================================================
// Module under test
// ============================================================================

const {
  initLoop,
  checkLoop,
  getStatus,
  abortLoop,
  listLoops,
  cleanupLoops,
  loadLoop,
  runGateCheck,
  GATES,
  GATE_TYPE_MAP,
  MAX_ITERATIONS_HARD_LIMIT,
  MAX_AGENTS_HARD_LIMIT,
  REPEATED_FAILURE_LIMIT,
} = require('../../scripts/agent-loop');

// ============================================================================
// Helpers
// ============================================================================

/** Create a saved loop state that loadLoop will return */
function setupLoop(overrides = {}) {
  const state = {
    loop_id: 'test-loop',
    trace_id: 'trace-123',
    session_id: 'session-456',
    agent_type: 'agileflow-api',
    parent_orchestration: null,
    quality_gate: 'tests',
    threshold: 0,
    iteration: 0,
    max_iterations: 5,
    current_value: 0,
    status: 'running',
    regression_count: 0,
    failure_streak: 0,
    last_failure_message: null,
    started_at: new Date().toISOString(),
    last_progress_at: new Date().toISOString(),
    events: [],
    ...overrides,
  };

  mockSafeReadJSON.mockImplementation(filePath => {
    if (filePath.includes('test-loop')) {
      return { ok: true, data: { ...state } };
    }
    return { ok: false, data: null };
  });

  return state;
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.existsSync.mockReturnValue(true);
  mockFs.readdirSync.mockReturnValue([]);
  mockSafeReadJSON.mockReturnValue({ ok: false, data: null });
  mockSafeWriteJSON.mockImplementation(() => {});
  mockExecuteGate.mockReturnValue({
    status: 'passed',
    message: 'Gate passed',
    duration_ms: 100,
  });
});

describe('Constants', () => {
  it('defines all gate types', () => {
    expect(GATES.tests).toBeDefined();
    expect(GATES.coverage).toBeDefined();
    expect(GATES.visual).toBeDefined();
    expect(GATES.lint).toBeDefined();
    expect(GATES.types).toBeDefined();
  });

  it('maps gates to quality-gates GATE_TYPES', () => {
    expect(GATE_TYPE_MAP.tests).toBe('tests');
    expect(GATE_TYPE_MAP.coverage).toBe('coverage');
    expect(GATE_TYPE_MAP.lint).toBe('lint');
    expect(GATE_TYPE_MAP.types).toBe('types');
  });

  it('has correct hard limits', () => {
    expect(MAX_ITERATIONS_HARD_LIMIT).toBe(5);
    expect(MAX_AGENTS_HARD_LIMIT).toBe(3);
    expect(REPEATED_FAILURE_LIMIT).toBe(3);
  });
});

describe('initLoop', () => {
  it('creates a loop with valid gate', () => {
    const loopId = initLoop({
      gate: 'tests',
      agentType: 'agileflow-api',
      rootDir: '/mock/project',
    });

    expect(loopId).toBe('abcd1234');
    expect(mockSafeWriteJSON).toHaveBeenCalled();

    const savedState = mockSafeWriteJSON.mock.calls[0][1];
    expect(savedState.quality_gate).toBe('tests');
    expect(savedState.status).toBe('running');
    expect(savedState.failure_streak).toBe(0);
    expect(savedState.last_failure_message).toBeNull();
  });

  it('returns null for invalid gate', () => {
    const loopId = initLoop({
      gate: 'nonexistent',
      rootDir: '/mock/project',
    });

    expect(loopId).toBeNull();
    expect(mockSafeWriteJSON).not.toHaveBeenCalled();
  });

  it('enforces max iterations hard limit', () => {
    const loopId = initLoop({
      gate: 'tests',
      maxIterations: 100,
      rootDir: '/mock/project',
    });

    expect(loopId).toBeTruthy();
    const savedState = mockSafeWriteJSON.mock.calls[0][1];
    expect(savedState.max_iterations).toBe(MAX_ITERATIONS_HARD_LIMIT);
  });

  it('uses custom loop ID when provided', () => {
    const loopId = initLoop({
      loopId: 'custom-id',
      gate: 'coverage',
      threshold: 80,
      rootDir: '/mock/project',
    });

    expect(loopId).toBe('custom-id');
  });

  it('blocks when max concurrent loops reached', () => {
    // Simulate 3 running loops
    mockFs.readdirSync.mockReturnValue(['a.json', 'b.json', 'c.json']);
    mockSafeReadJSON.mockReturnValue({
      ok: true,
      data: { status: 'running' },
    });

    const loopId = initLoop({
      gate: 'tests',
      rootDir: '/mock/project',
    });

    expect(loopId).toBeNull();
  });

  it('includes correlation IDs in state', () => {
    initLoop({ gate: 'tests', rootDir: '/mock/project' });

    const savedState = mockSafeWriteJSON.mock.calls[0][1];
    expect(savedState.trace_id).toBe('trace-123');
    expect(savedState.session_id).toBe('session-456');
  });

  it('emits init event to bus', () => {
    initLoop({ gate: 'lint', rootDir: '/mock/project' });

    expect(mockFs.appendFileSync).toHaveBeenCalled();
    const eventLine = mockFs.appendFileSync.mock.calls[0][1];
    const event = JSON.parse(eventLine.trim());
    expect(event.type).toBe('agent_loop');
    expect(event.event).toBe('init');
    expect(event.gate).toBe('lint');
  });
});

describe('checkLoop', () => {
  it('returns null for nonexistent loop', () => {
    const result = checkLoop('nonexistent', { rootDir: '/mock/project' });
    expect(result).toBeNull();
  });

  it('returns state for already-completed loop', () => {
    setupLoop({ status: 'passed' });
    const result = checkLoop('test-loop', { rootDir: '/mock/project' });
    expect(result.status).toBe('passed');
  });

  describe('gate pass with confirmation', () => {
    it('requires 2 passes to confirm', () => {
      setupLoop({ iteration: 0, events: [] });

      mockExecuteGate.mockReturnValue({
        status: 'passed',
        message: 'Gate passed',
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      // First pass - still running (needs confirmation)
      expect(result.status).toBe('running');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].passed).toBe(true);
    });

    it('confirms pass after 2 passing iterations', () => {
      setupLoop({
        iteration: 1,
        events: [{ iter: 1, value: 100, passed: true, at: new Date().toISOString() }],
      });

      mockExecuteGate.mockReturnValue({
        status: 'passed',
        message: 'Gate passed',
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('passed');
      expect(result.completed_at).toBeDefined();
    });
  });

  describe('gate failure', () => {
    it('continues iterating on failure', () => {
      setupLoop({ iteration: 0 });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Tests failing',
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('running');
      expect(result.iteration).toBe(1);
      expect(result.failure_streak).toBe(1);
      expect(result.last_failure_message).toBe('Tests failing');
    });
  });

  describe('max iterations', () => {
    it('fails when exceeding max iterations', () => {
      setupLoop({ iteration: 5, max_iterations: 5 });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('failed');
      expect(result.stopped_reason).toBe('max_iterations');
    });
  });

  describe('timeout', () => {
    it('aborts on timeout', () => {
      setupLoop({
        started_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(), // 11 min ago
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('aborted');
      expect(result.stopped_reason).toBe('timeout');
    });
  });

  describe('regression detection', () => {
    it('detects regression (value decrease)', () => {
      setupLoop({
        iteration: 1,
        current_value: 80,
        events: [{ iter: 1, value: 80, passed: false, at: new Date().toISOString() }],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Coverage 70%',
        value: 70,
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.regression_count).toBe(1);
      expect(result.status).toBe('running'); // Not failed yet (need 2)
    });

    it('fails after 2 regressions', () => {
      setupLoop({
        iteration: 2,
        current_value: 70,
        regression_count: 1,
        events: [
          { iter: 1, value: 80, passed: false, at: new Date().toISOString() },
          { iter: 2, value: 70, passed: false, at: new Date().toISOString() },
        ],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Coverage 60%',
        value: 60,
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('failed');
      expect(result.stopped_reason).toBe('regression_detected');
    });

    it('resets regression count on equal value (no regression)', () => {
      setupLoop({
        iteration: 1,
        current_value: 70,
        regression_count: 1,
        events: [{ iter: 1, value: 70, passed: false, at: new Date().toISOString() }],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Coverage 70%',
        value: 70, // Same value - not a regression
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.regression_count).toBe(0);
      expect(result.status).toBe('running');
    });

    it('resets regression count on progress', () => {
      setupLoop({
        iteration: 1,
        current_value: 60,
        regression_count: 1,
        events: [{ iter: 1, value: 60, passed: false, at: new Date().toISOString() }],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Coverage 70%',
        value: 70,
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.regression_count).toBe(0);
    });
  });

  describe('repeated failure detection (AC 3)', () => {
    it('tracks consecutive same-message failures', () => {
      setupLoop({
        iteration: 1,
        failure_streak: 1,
        last_failure_message: 'Tests failing',
        events: [
          {
            iter: 1,
            value: 0,
            passed: false,
            message: 'Tests failing',
            at: new Date().toISOString(),
          },
        ],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Tests failing',
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.failure_streak).toBe(2);
      expect(result.status).toBe('running'); // Not failed yet (need 3)
    });

    it('aborts after 3 identical failures', () => {
      setupLoop({
        iteration: 2,
        failure_streak: 2,
        last_failure_message: 'Tests failing',
        events: [
          {
            iter: 1,
            value: 0,
            passed: false,
            message: 'Tests failing',
            at: new Date().toISOString(),
          },
          {
            iter: 2,
            value: 0,
            passed: false,
            message: 'Tests failing',
            at: new Date().toISOString(),
          },
        ],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Tests failing',
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('failed');
      expect(result.stopped_reason).toBe('repeated_failure');
      expect(result.failure_streak).toBe(3);
    });

    it('resets streak on different failure message', () => {
      setupLoop({
        iteration: 1,
        failure_streak: 2,
        last_failure_message: 'Tests failing',
        events: [
          {
            iter: 1,
            value: 0,
            passed: false,
            message: 'Tests failing',
            at: new Date().toISOString(),
          },
        ],
      });

      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Different error', // Different message
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.failure_streak).toBe(1);
      expect(result.last_failure_message).toBe('Different error');
      expect(result.status).toBe('running');
    });

    it('resets streak on success', () => {
      setupLoop({
        iteration: 1,
        failure_streak: 2,
        last_failure_message: 'Tests failing',
        events: [
          {
            iter: 1,
            value: 0,
            passed: false,
            message: 'Tests failing',
            at: new Date().toISOString(),
          },
        ],
      });

      mockExecuteGate.mockReturnValue({
        status: 'passed',
        message: 'Gate passed',
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.failure_streak).toBe(0);
      expect(result.last_failure_message).toBeNull();
    });
  });

  describe('stall detection', () => {
    it('fails when stalled for 5+ minutes', () => {
      setupLoop({
        iteration: 1,
        current_value: 50,
        last_progress_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
        events: [{ iter: 1, value: 50, passed: false, at: new Date().toISOString() }],
      });

      // Same value = no progress
      mockExecuteGate.mockReturnValue({
        status: 'failed',
        message: 'Coverage 50%',
        value: 50,
      });

      const result = checkLoop('test-loop', { rootDir: '/mock/project' });

      expect(result.status).toBe('failed');
      expect(result.stopped_reason).toBe('stalled');
    });
  });

  it('records events with messages', () => {
    setupLoop({ iteration: 0 });

    mockExecuteGate.mockReturnValue({
      status: 'failed',
      message: 'Exit code: 1',
    });

    const result = checkLoop('test-loop', { rootDir: '/mock/project' });

    expect(result.events[0].message).toBe('Exit code: 1');
  });
});

describe('abortLoop', () => {
  it('aborts a running loop', () => {
    setupLoop({ status: 'running' });

    const result = abortLoop('test-loop', 'manual', { rootDir: '/mock/project' });

    expect(result.status).toBe('aborted');
    expect(result.stopped_reason).toBe('manual');
    expect(result.completed_at).toBeDefined();
  });

  it('returns state for already-completed loop', () => {
    setupLoop({ status: 'passed' });

    const result = abortLoop('test-loop', 'manual', { rootDir: '/mock/project' });

    expect(result.status).toBe('passed'); // Unchanged
  });

  it('returns null for nonexistent loop', () => {
    const result = abortLoop('nonexistent', 'manual', { rootDir: '/mock/project' });
    expect(result).toBeNull();
  });

  it('uses custom abort reason', () => {
    setupLoop({ status: 'running' });

    const result = abortLoop('test-loop', 'user_cancel', { rootDir: '/mock/project' });

    expect(result.stopped_reason).toBe('user_cancel');
  });

  it('emits abort event', () => {
    setupLoop({ status: 'running' });
    abortLoop('test-loop', 'manual', { rootDir: '/mock/project' });

    expect(mockFs.appendFileSync).toHaveBeenCalled();
    const eventLine = mockFs.appendFileSync.mock.calls[0][1];
    const event = JSON.parse(eventLine.trim());
    expect(event.event).toBe('abort');
  });
});

describe('listLoops', () => {
  it('returns empty array when no loops', () => {
    mockFs.readdirSync.mockReturnValue([]);
    const result = listLoops({ rootDir: '/mock/project' });
    expect(result).toEqual([]);
  });

  it('returns loop data from files', () => {
    mockFs.readdirSync.mockReturnValue(['loop1.json', 'loop2.json']);
    mockSafeReadJSON.mockReturnValue({
      ok: true,
      data: {
        loop_id: 'loop1',
        agent_type: 'agileflow-api',
        quality_gate: 'tests',
        status: 'running',
        current_value: 0,
        threshold: 0,
        iteration: 1,
        max_iterations: 5,
      },
    });

    const result = listLoops({ rootDir: '/mock/project' });
    expect(result).toHaveLength(2);
  });

  it('filters out invalid files', () => {
    mockFs.readdirSync.mockReturnValue(['loop1.json', 'loop2.json']);
    let callCount = 0;
    mockSafeReadJSON.mockImplementation(() => {
      callCount++;
      if (callCount === 1)
        return { ok: true, data: { loop_id: 'loop1', status: 'running', quality_gate: 'tests' } };
      return { ok: false, data: null };
    });

    const result = listLoops({ rootDir: '/mock/project' });
    expect(result).toHaveLength(1);
  });
});

describe('cleanupLoops', () => {
  it('removes completed loops', () => {
    mockFs.readdirSync.mockReturnValue(['done.json', 'running.json']);
    let callCount = 0;
    mockSafeReadJSON.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { ok: true, data: { status: 'passed' } };
      return { ok: true, data: { status: 'running' } };
    });

    const cleaned = cleanupLoops({ rootDir: '/mock/project' });

    expect(cleaned).toBe(1);
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(1);
  });

  it('keeps running loops', () => {
    mockFs.readdirSync.mockReturnValue(['running.json']);
    mockSafeReadJSON.mockReturnValue({ ok: true, data: { status: 'running' } });

    const cleaned = cleanupLoops({ rootDir: '/mock/project' });

    expect(cleaned).toBe(0);
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('returns 0 when no files', () => {
    mockFs.readdirSync.mockReturnValue([]);
    const cleaned = cleanupLoops({ rootDir: '/mock/project' });
    expect(cleaned).toBe(0);
  });
});

describe('runGateCheck', () => {
  it('delegates to quality-gates for test gate', () => {
    mockExecuteGate.mockReturnValue({
      status: 'passed',
      message: 'Gate passed',
    });

    const result = runGateCheck('tests', 0, '/mock/project');

    expect(mockCreateGate).toHaveBeenCalledWith(expect.objectContaining({ type: 'tests' }));
    expect(mockExecuteGate).toHaveBeenCalled();
    expect(result.passed).toBe(true);
    expect(result.value).toBe(100);
    expect(result.message).toBe('Gate passed');
  });

  it('delegates to quality-gates for lint gate', () => {
    mockExecuteGate.mockReturnValue({
      status: 'failed',
      message: 'Exit code: 1',
    });

    const result = runGateCheck('lint', 0, '/mock/project');

    expect(result.passed).toBe(false);
    expect(result.value).toBe(0);
  });

  it('handles coverage gate with value', () => {
    mockExecuteGate.mockReturnValue({
      status: 'failed',
      message: 'Coverage 72% below threshold 80%',
      value: 72,
    });

    const result = runGateCheck('coverage', 80, '/mock/project');

    expect(result.passed).toBe(false);
    expect(result.value).toBe(72);
  });

  it('handles visual gate locally (not via quality-gates)', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue(['verified-home.png', 'verified-about.png']);

    const result = runGateCheck('visual', 0, '/mock/project');

    expect(mockExecuteGate).not.toHaveBeenCalled();
    expect(result.passed).toBe(true);
    expect(result.value).toBe(100);
  });

  it('visual gate fails when screenshots dir missing', () => {
    mockFs.existsSync.mockReturnValue(false);

    const result = runGateCheck('visual', 0, '/mock/project');

    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('returns error for unknown gate', () => {
    const result = runGateCheck('nonexistent', 0, '/mock/project');

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Unknown gate');
  });

  it('reads custom command from metadata', () => {
    mockSafeReadJSON.mockReturnValue({
      ok: true,
      data: { ralph_loop: { test_command: 'jest --ci' } },
    });

    mockExecuteGate.mockReturnValue({ status: 'passed', message: 'Gate passed' });

    runGateCheck('tests', 0, '/mock/project');

    expect(mockCreateGate).toHaveBeenCalledWith(expect.objectContaining({ command: 'jest --ci' }));
  });
});

describe('loadLoop', () => {
  it('returns null for nonexistent loop', () => {
    mockSafeReadJSON.mockReturnValue({ ok: false, data: null });
    const result = loadLoop('nonexistent', '/mock/project');
    expect(result).toBeNull();
  });

  it('returns state for existing loop', () => {
    setupLoop({ loop_id: 'test-loop', status: 'running' });
    const result = loadLoop('test-loop', '/mock/project');
    expect(result).toBeTruthy();
    expect(result.status).toBe('running');
  });
});
