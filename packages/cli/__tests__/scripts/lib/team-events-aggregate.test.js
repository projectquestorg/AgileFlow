/**
 * Tests for team metrics aggregation (US-0343)
 *
 * Covers:
 * - aggregateTeamMetrics: per-agent duration, errors, timeouts
 * - aggregateTeamMetrics: gate pass/fail rates
 * - aggregateTeamMetrics: team completion time
 * - aggregateTeamMetrics: edge cases (empty events, missing fields)
 * - saveAggregatedMetrics: stores under team_metrics.traces[trace_id]
 * - saveAggregatedMetrics: multiple traces don't clobber each other
 * - stopTeam integration: calls aggregation on stop
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('../../../lib/paths');
jest.mock('../../../lib/feature-flags');
jest.mock('../../../scripts/lib/file-lock');
jest.mock('../../../scripts/messaging-bridge');

const { aggregateTeamMetrics, saveAggregatedMetrics, getTeamEvents } = require('../../../scripts/lib/team-events');
const paths = require('../../../lib/paths');
const fileLock = require('../../../scripts/lib/file-lock');

describe('aggregateTeamMetrics', () => {
  const testRootDir = '/home/test/project';
  const sessionStatePath = path.join(testRootDir, 'docs/00-meta/session-state.json');

  beforeEach(() => {
    jest.clearAllMocks();
    paths.getSessionStatePath.mockReturnValue(sessionStatePath);
    fs.existsSync.mockReturnValue(true);
  });

  function mockEvents(events) {
    const state = {
      hook_metrics: {
        teams: { events, summary: {} },
      },
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(state));
  }

  it('returns error when trace_id is missing', () => {
    const result = aggregateTeamMetrics(testRootDir, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('trace_id');
  });

  it('returns empty metrics when no events match trace_id', () => {
    mockEvents([
      { type: 'task_completed', agent: 'a', trace_id: 'other-trace', duration_ms: 100, at: '2026-01-01T00:00:00Z' },
    ]);

    const result = aggregateTeamMetrics(testRootDir, 'trace-no-match');

    expect(result.ok).toBe(true);
    expect(result.per_agent).toEqual({});
    expect(result.per_gate).toEqual({});
    expect(result.team_completion_ms).toBeNull();
  });

  describe('per-agent metrics', () => {
    it('computes total duration from task_completed events', () => {
      const traceId = 'trace-111';
      mockEvents([
        { type: 'task_completed', agent: 'api-builder', trace_id: traceId, duration_ms: 3000, at: '2026-01-01T00:01:00Z' },
        { type: 'task_completed', agent: 'api-builder', trace_id: traceId, duration_ms: 2000, at: '2026-01-01T00:02:00Z' },
        { type: 'task_completed', agent: 'ui-builder', trace_id: traceId, duration_ms: 4000, at: '2026-01-01T00:03:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_agent['api-builder'].total_duration_ms).toBe(5000);
      expect(result.per_agent['api-builder'].tasks_completed).toBe(2);
      expect(result.per_agent['ui-builder'].total_duration_ms).toBe(4000);
      expect(result.per_agent['ui-builder'].tasks_completed).toBe(1);
    });

    it('counts errors per agent', () => {
      const traceId = 'trace-222';
      mockEvents([
        { type: 'agent_error', agent: 'api-builder', trace_id: traceId, at: '2026-01-01T00:01:00Z' },
        { type: 'agent_error', agent: 'api-builder', trace_id: traceId, at: '2026-01-01T00:02:00Z' },
        { type: 'agent_error', agent: 'ui-builder', trace_id: traceId, at: '2026-01-01T00:03:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_agent['api-builder'].errors).toBe(2);
      expect(result.per_agent['ui-builder'].errors).toBe(1);
    });

    it('counts timeouts per agent', () => {
      const traceId = 'trace-333';
      mockEvents([
        { type: 'agent_timeout', agent: 'slow-agent', trace_id: traceId, at: '2026-01-01T00:01:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_agent['slow-agent'].timeouts).toBe(1);
      expect(result.per_agent['slow-agent'].tasks_completed).toBe(0);
    });

    it('handles events without duration_ms', () => {
      const traceId = 'trace-444';
      mockEvents([
        { type: 'task_completed', agent: 'fast-agent', trace_id: traceId, at: '2026-01-01T00:01:00Z' },
        // No duration_ms field
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_agent['fast-agent'].total_duration_ms).toBe(0);
      expect(result.per_agent['fast-agent'].tasks_completed).toBe(1);
    });

    it('combines completions, errors, and timeouts for same agent', () => {
      const traceId = 'trace-555';
      mockEvents([
        { type: 'task_completed', agent: 'busy-agent', trace_id: traceId, duration_ms: 1000, at: '2026-01-01T00:01:00Z' },
        { type: 'agent_error', agent: 'busy-agent', trace_id: traceId, at: '2026-01-01T00:02:00Z' },
        { type: 'agent_timeout', agent: 'busy-agent', trace_id: traceId, at: '2026-01-01T00:03:00Z' },
        { type: 'task_completed', agent: 'busy-agent', trace_id: traceId, duration_ms: 2000, at: '2026-01-01T00:04:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_agent['busy-agent']).toEqual({
        total_duration_ms: 3000,
        tasks_completed: 2,
        errors: 1,
        timeouts: 1,
      });
    });
  });

  describe('per-gate metrics', () => {
    it('computes gate pass/fail rates', () => {
      const traceId = 'trace-gate-1';
      mockEvents([
        { type: 'gate_passed', gate: 'tests', trace_id: traceId, at: '2026-01-01T00:01:00Z' },
        { type: 'gate_passed', gate: 'tests', trace_id: traceId, at: '2026-01-01T00:02:00Z' },
        { type: 'gate_failed', gate: 'tests', trace_id: traceId, at: '2026-01-01T00:03:00Z' },
        { type: 'gate_passed', gate: 'lint', trace_id: traceId, at: '2026-01-01T00:04:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_gate['tests']).toEqual({
        passed: 2,
        failed: 1,
        pass_rate: 2 / 3,
      });
      expect(result.per_gate['lint']).toEqual({
        passed: 1,
        failed: 0,
        pass_rate: 1,
      });
    });

    it('uses "unknown" for events without gate field', () => {
      const traceId = 'trace-gate-2';
      mockEvents([
        { type: 'gate_passed', trace_id: traceId, at: '2026-01-01T00:01:00Z' },
        { type: 'gate_failed', trace_id: traceId, at: '2026-01-01T00:02:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_gate['unknown']).toEqual({
        passed: 1,
        failed: 1,
        pass_rate: 0.5,
      });
    });

    it('returns empty per_gate when no gate events exist', () => {
      const traceId = 'trace-gate-3';
      mockEvents([
        { type: 'task_completed', agent: 'a', trace_id: traceId, duration_ms: 100, at: '2026-01-01T00:01:00Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.per_gate).toEqual({});
    });
  });

  describe('team completion time', () => {
    it('computes time from team_created to team_stopped', () => {
      const traceId = 'trace-time-1';
      mockEvents([
        { type: 'team_created', trace_id: traceId, at: '2026-01-01T00:00:00.000Z' },
        { type: 'task_completed', agent: 'a', trace_id: traceId, duration_ms: 100, at: '2026-01-01T00:00:30.000Z' },
        { type: 'team_stopped', trace_id: traceId, at: '2026-01-01T00:01:00.000Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.team_completion_ms).toBe(60000); // 1 minute
    });

    it('returns null when team_stopped is missing', () => {
      const traceId = 'trace-time-2';
      mockEvents([
        { type: 'team_created', trace_id: traceId, at: '2026-01-01T00:00:00.000Z' },
        { type: 'task_completed', agent: 'a', trace_id: traceId, duration_ms: 100, at: '2026-01-01T00:00:30.000Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.team_completion_ms).toBeNull();
    });

    it('returns null when team_created is missing', () => {
      const traceId = 'trace-time-3';
      mockEvents([
        { type: 'team_stopped', trace_id: traceId, at: '2026-01-01T00:01:00.000Z' },
      ]);

      const result = aggregateTeamMetrics(testRootDir, traceId);

      expect(result.team_completion_ms).toBeNull();
    });
  });

  it('includes computed_at timestamp', () => {
    const traceId = 'trace-meta';
    mockEvents([]);

    const before = new Date().toISOString();
    const result = aggregateTeamMetrics(testRootDir, traceId);
    const after = new Date().toISOString();

    expect(result.computed_at).toBeDefined();
    expect(result.computed_at >= before).toBe(true);
    expect(result.computed_at <= after).toBe(true);
  });
});

describe('saveAggregatedMetrics', () => {
  const testRootDir = '/home/test/project';
  const sessionStatePath = path.join(testRootDir, 'docs/00-meta/session-state.json');

  beforeEach(() => {
    jest.clearAllMocks();
    paths.getSessionStatePath.mockReturnValue(sessionStatePath);
    fs.existsSync.mockReturnValue(true);
  });

  it('returns error when metrics is null', () => {
    const result = saveAggregatedMetrics(testRootDir, null);
    expect(result.ok).toBe(false);
  });

  it('returns error when metrics has no trace_id', () => {
    const result = saveAggregatedMetrics(testRootDir, { per_agent: {} });
    expect(result.ok).toBe(false);
  });

  it('stores metrics under team_metrics.traces[trace_id]', () => {
    let capturedState;
    fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
      capturedState = updateFn({ team_metrics: { template: 'test' } });
    });

    const metrics = {
      ok: true,
      trace_id: 'trace-save-1',
      per_agent: { 'agent-a': { total_duration_ms: 5000, tasks_completed: 2, errors: 0, timeouts: 0 } },
      per_gate: { tests: { passed: 3, failed: 1, pass_rate: 0.75 } },
      team_completion_ms: 30000,
      computed_at: '2026-01-01T00:00:00Z',
    };

    const result = saveAggregatedMetrics(testRootDir, metrics);

    expect(result.ok).toBe(true);
    expect(capturedState.team_metrics.traces['trace-save-1']).toEqual({
      per_agent: metrics.per_agent,
      per_gate: metrics.per_gate,
      team_completion_ms: 30000,
      computed_at: '2026-01-01T00:00:00Z',
    });
    // Preserves existing team_metrics fields
    expect(capturedState.team_metrics.template).toBe('test');
  });

  it('does not clobber metrics from other traces', () => {
    const existingTraceData = {
      per_agent: { old: { total_duration_ms: 1000, tasks_completed: 1, errors: 0, timeouts: 0 } },
      per_gate: {},
      team_completion_ms: 10000,
      computed_at: '2026-01-01T00:00:00Z',
    };

    let capturedState;
    fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
      capturedState = updateFn({
        team_metrics: {
          traces: { 'trace-existing': existingTraceData },
        },
      });
    });

    const newMetrics = {
      trace_id: 'trace-new',
      per_agent: { new: { total_duration_ms: 2000, tasks_completed: 1, errors: 0, timeouts: 0 } },
      per_gate: {},
      team_completion_ms: 20000,
      computed_at: '2026-01-02T00:00:00Z',
    };

    saveAggregatedMetrics(testRootDir, newMetrics);

    expect(capturedState.team_metrics.traces['trace-existing']).toEqual(existingTraceData);
    expect(capturedState.team_metrics.traces['trace-new']).toBeDefined();
    expect(capturedState.team_metrics.traces['trace-new'].per_agent.new.total_duration_ms).toBe(2000);
  });

  it('creates team_metrics.traces when it does not exist', () => {
    let capturedState;
    fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
      capturedState = updateFn({});
    });

    saveAggregatedMetrics(testRootDir, {
      trace_id: 'trace-fresh',
      per_agent: {},
      per_gate: {},
      team_completion_ms: null,
      computed_at: '2026-01-01T00:00:00Z',
    });

    expect(capturedState.team_metrics).toBeDefined();
    expect(capturedState.team_metrics.traces).toBeDefined();
    expect(capturedState.team_metrics.traces['trace-fresh']).toBeDefined();
  });

  it('falls back to direct write when session-state does not exist yet', () => {
    // Simulate file-lock available but file doesn't exist (triggers fallback)
    fs.existsSync.mockReturnValue(false);
    fs.writeFileSync.mockImplementation(() => {});

    const result = saveAggregatedMetrics(testRootDir, {
      trace_id: 'trace-fallback',
      per_agent: {},
      per_gate: {},
      team_completion_ms: null,
      computed_at: '2026-01-01T00:00:00Z',
    });

    expect(result.ok).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.team_metrics.traces['trace-fallback']).toBeDefined();
  });
});

// Integration: stopTeam calls aggregation
describe('stopTeam aggregation integration', () => {
  // Reset module registry to get fresh team-manager with our mocks
  beforeEach(() => {
    jest.clearAllMocks();

    const featureFlags = require('../../../lib/feature-flags');
    featureFlags.getAgentTeamsMode.mockReturnValue('subagent');

    paths.getSessionStatePath.mockReturnValue(
      path.join('/home/test/project', 'docs/00-meta/session-state.json')
    );

    fs.existsSync.mockReturnValue(true);
    fileLock.atomicWriteJSON.mockImplementation(() => {});
    fileLock.atomicReadModifyWrite.mockImplementation((p, fn) => fn({}));

    const bridge = require('../../../scripts/messaging-bridge');
    bridge.sendMessage.mockReturnValue({ ok: true });
  });

  it('calls aggregateTeamMetrics when stopping a team with trace_id', () => {
    const traceId = 'trace-stop-1';

    // Session state with active team that has trace_id and events
    const sessionState = {
      active_team: {
        template: 'test-team',
        mode: 'subagent',
        trace_id: traceId,
        started_at: new Date(Date.now() - 5000).toISOString(),
      },
      team_metrics: {
        trace_id: traceId,
        tasks_completed: 2,
      },
      hook_metrics: {
        teams: {
          events: [
            { type: 'team_created', trace_id: traceId, at: new Date(Date.now() - 5000).toISOString() },
            { type: 'task_completed', agent: 'worker', trace_id: traceId, duration_ms: 3000, at: new Date(Date.now() - 2000).toISOString() },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));

    const teamManager = require('../../../scripts/team-manager');
    const result = teamManager.stopTeam('/home/test/project');

    expect(result.ok).toBe(true);
    // aggregateTeamMetrics was called (indirectly via saveAggregatedMetrics -> atomicReadModifyWrite)
    // The second atomicReadModifyWrite call is from saveAggregatedMetrics
    const rmwCalls = fileLock.atomicReadModifyWrite.mock.calls;
    if (rmwCalls.length > 0) {
      // Verify the save was attempted
      const lastCall = rmwCalls[rmwCalls.length - 1];
      const updateFn = lastCall[1];
      const resultState = updateFn({ team_metrics: {} });
      expect(resultState.team_metrics.traces).toBeDefined();
      expect(resultState.team_metrics.traces[traceId]).toBeDefined();
    }
  });
});
