/**
 * Tests for trace_id propagation in team events (US-0342)
 *
 * Covers:
 * - startTeam() generates unique trace_id
 * - trace_id stored in active_team and team_metrics
 * - stopTeam() propagates trace_id from active_team
 * - trackEvent() preserves trace_id in data
 * - getTeamEvents() can filter by trace_id
 * - messaging-bridge helpers pass trace_id through
 */

const fs = require('fs');
const path = require('path');

// --- team-manager trace_id tests ---

jest.mock('fs');
jest.mock('../../../lib/feature-flags');
jest.mock('../../../lib/paths');
jest.mock('../../../scripts/lib/file-lock');
jest.mock('../../../scripts/messaging-bridge');
jest.mock('../../../scripts/lib/team-events');

const teamManager = require('../../../scripts/team-manager');
const featureFlags = require('../../../lib/feature-flags');
const paths = require('../../../lib/paths');
const fileLock = require('../../../scripts/lib/file-lock');
const messagingBridge = require('../../../scripts/messaging-bridge');
const teamEvents = require('../../../scripts/lib/team-events');

describe('trace_id propagation', () => {
  const testRootDir = '/home/test/project';

  beforeEach(() => {
    jest.clearAllMocks();

    paths.getSessionStatePath.mockReturnValue(
      path.join(testRootDir, 'docs/00-meta/session-state.json')
    );

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({}));
    fs.writeFileSync.mockImplementation(() => {});

    fileLock.atomicWriteJSON.mockImplementation(() => {});
    fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
      updateFn({});
    });

    featureFlags.getAgentTeamsMode.mockReturnValue('subagent');
    messagingBridge.sendMessage.mockReturnValue({ ok: true });

    // Mock team events for dual-write (US-0348)
    teamEvents.trackEvent.mockReturnValue({ ok: true });
    teamEvents.aggregateTeamMetrics.mockReturnValue({ ok: true });
    teamEvents.saveAggregatedMetrics.mockReturnValue({ ok: true });
  });

  function makeTemplate(name) {
    return {
      name: name || 'Test Team',
      lead: 'AG-LEAD',
      teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
      quality_gates: {},
    };
  }

  describe('startTeam trace_id generation', () => {
    it('generates a trace_id in the result', () => {
      const template = makeTemplate();
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('trace-test.json')) return JSON.stringify(template);
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'trace-test');

      expect(result.ok).toBe(true);
      expect(result.trace_id).toBeDefined();
      expect(result.trace_id).toMatch(/^trace-\d+-[a-z0-9]+$/);
    });

    it('generates unique trace_ids across calls', () => {
      const template = makeTemplate();
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('unique-test.json')) return JSON.stringify(template);
        return JSON.stringify({});
      });

      const result1 = teamManager.startTeam(testRootDir, 'unique-test');
      const result2 = teamManager.startTeam(testRootDir, 'unique-test');

      expect(result1.trace_id).not.toBe(result2.trace_id);
    });

    it('stores trace_id in session-state active_team', () => {
      const template = makeTemplate();
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('state-test.json')) return JSON.stringify(template);
        return JSON.stringify({});
      });

      let capturedState;
      fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
        capturedState = updateFn({});
      });

      const result = teamManager.startTeam(testRootDir, 'state-test');

      expect(capturedState.active_team.trace_id).toBe(result.trace_id);
    });

    it('stores trace_id in session-state team_metrics', () => {
      const template = makeTemplate();
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('metrics-test.json')) return JSON.stringify(template);
        return JSON.stringify({});
      });

      let capturedState;
      fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
        capturedState = updateFn({});
      });

      const result = teamManager.startTeam(testRootDir, 'metrics-test');

      expect(capturedState.team_metrics.trace_id).toBe(result.trace_id);
    });

    it('passes trace_id in team_created event', () => {
      const template = makeTemplate();
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('event-test.json')) return JSON.stringify(template);
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'event-test');

      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_created',
        expect.objectContaining({
          trace_id: result.trace_id,
        })
      );
    });
  });

  describe('stopTeam trace_id propagation', () => {
    it('propagates trace_id from active_team to team_stopped event', () => {
      const traceId = 'trace-1234567890-abc123';
      const sessionState = {
        active_team: {
          template: 'stop-test',
          mode: 'subagent',
          trace_id: traceId,
          started_at: new Date().toISOString(),
        },
        team_metrics: {
          trace_id: traceId,
          tasks_completed: 2,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));

      teamManager.stopTeam(testRootDir);

      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_stopped',
        expect.objectContaining({
          trace_id: traceId,
        })
      );
    });

    it('handles missing trace_id in legacy active_team gracefully', () => {
      const sessionState = {
        active_team: {
          template: 'legacy-test',
          mode: 'subagent',
          started_at: new Date().toISOString(),
          // No trace_id (pre-US-0342 state)
        },
        team_metrics: { tasks_completed: 0 },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));

      const result = teamManager.stopTeam(testRootDir);

      expect(result.ok).toBe(true);
      // trace_id will be undefined, which is fine
      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_stopped',
        expect.objectContaining({
          trace_id: undefined,
        })
      );
    });
  });
});

// --- team-events.js trace_id filter tests ---
// Use jest.requireActual to get the real module (file-level jest.mock overrides it)
const realTeamEvents = jest.requireActual('../../../scripts/lib/team-events');

describe('getTeamEvents trace_id filter', () => {
  const testRootDir = '/home/test/project';

  beforeEach(() => {
    jest.clearAllMocks();

    paths.getSessionStatePath.mockReturnValue(
      path.join(testRootDir, 'docs/00-meta/session-state.json')
    );
    fs.existsSync.mockReturnValue(true);
  });

  it('filters events by trace_id', () => {
    const { getTeamEvents } = realTeamEvents;

    const traceA = 'trace-111-aaa';
    const traceB = 'trace-222-bbb';

    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'task_assigned', trace_id: traceA, agent: 'a', at: '2026-01-01T00:00:00Z' },
            { type: 'task_completed', trace_id: traceB, agent: 'b', at: '2026-01-01T00:01:00Z' },
            { type: 'task_completed', trace_id: traceA, agent: 'a', at: '2026-01-01T00:02:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = getTeamEvents(testRootDir, { trace_id: traceA });

    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events.every(e => e.trace_id === traceA)).toBe(true);
  });

  it('returns empty when trace_id matches nothing', () => {
    const { getTeamEvents } = realTeamEvents;

    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'task_assigned', trace_id: 'trace-111-aaa', at: '2026-01-01T00:00:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = getTeamEvents(testRootDir, { trace_id: 'trace-nonexistent' });

    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('combines trace_id filter with other filters', () => {
    const { getTeamEvents } = realTeamEvents;

    const traceA = 'trace-111-aaa';

    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'task_assigned', trace_id: traceA, agent: 'a', at: '2026-01-01T00:00:00Z' },
            { type: 'task_completed', trace_id: traceA, agent: 'b', at: '2026-01-01T00:01:00Z' },
            { type: 'task_completed', trace_id: traceA, agent: 'a', at: '2026-01-01T00:02:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = getTeamEvents(testRootDir, { trace_id: traceA, agent: 'a' });

    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events.every(e => e.trace_id === traceA && e.agent === 'a')).toBe(true);
  });
});

// --- trackEvent trace_id passthrough ---

describe('trackEvent trace_id passthrough', () => {
  const testRootDir = '/home/test/project';

  beforeEach(() => {
    jest.clearAllMocks();

    paths.getSessionStatePath.mockReturnValue(
      path.join(testRootDir, 'docs/00-meta/session-state.json')
    );
    fs.existsSync.mockReturnValue(true);
  });

  it('preserves trace_id in event data via spread', () => {
    const { trackEvent } = realTeamEvents;

    const traceId = 'trace-999-xyz';
    let capturedState;

    fileLock.atomicReadModifyWrite.mockImplementation((p, updateFn) => {
      capturedState = updateFn({});
    });

    trackEvent(testRootDir, 'task_assigned', {
      agent: 'test-agent',
      task_id: 'task_1',
      trace_id: traceId,
    });

    const events = capturedState.hook_metrics.teams.events;
    expect(events).toHaveLength(1);
    expect(events[0].trace_id).toBe(traceId);
    expect(events[0].type).toBe('task_assigned');
  });
});

// --- EVENT_TYPES completeness ---

describe('EVENT_TYPES', () => {
  it('includes team_completed', () => {
    const { EVENT_TYPES } = realTeamEvents;
    expect(EVENT_TYPES).toContain('team_completed');
  });

  it('includes team_message', () => {
    const { EVENT_TYPES } = realTeamEvents;
    expect(EVENT_TYPES).toContain('team_message');
  });
});

// --- aggregateTeamMetrics team_message + team_completed tests ---

describe('aggregateTeamMetrics dual-write observability', () => {
  const testRootDir = '/home/test/project';

  beforeEach(() => {
    jest.clearAllMocks();

    paths.getSessionStatePath.mockReturnValue(
      path.join(testRootDir, 'docs/00-meta/session-state.json')
    );
    fs.existsSync.mockReturnValue(true);
  });

  it('counts team_message events per agent in messages_sent', () => {
    const { aggregateTeamMetrics } = realTeamEvents;

    const traceId = 'trace-msg-agg';
    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'team_created', trace_id: traceId, at: '2026-01-01T00:00:00Z' },
            {
              type: 'team_message',
              trace_id: traceId,
              from: 'AG-API',
              to: 'AG-UI',
              at: '2026-01-01T00:01:00Z',
            },
            {
              type: 'team_message',
              trace_id: traceId,
              from: 'AG-API',
              to: 'AG-DB',
              at: '2026-01-01T00:02:00Z',
            },
            {
              type: 'team_message',
              trace_id: traceId,
              from: 'AG-UI',
              to: 'AG-API',
              at: '2026-01-01T00:03:00Z',
            },
            { type: 'team_stopped', trace_id: traceId, at: '2026-01-01T00:10:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.ok).toBe(true);
    expect(result.total_messages_sent).toBe(3);
    expect(result.per_agent['AG-API'].messages_sent).toBe(2);
    expect(result.per_agent['AG-UI'].messages_sent).toBe(1);
  });

  it('uses team_completed for timing over team_stopped', () => {
    const { aggregateTeamMetrics } = realTeamEvents;

    const traceId = 'trace-timing';
    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'team_created', trace_id: traceId, at: '2026-01-01T00:00:00Z' },
            { type: 'team_stopped', trace_id: traceId, at: '2026-01-01T00:05:00Z' },
            { type: 'team_completed', trace_id: traceId, at: '2026-01-01T00:10:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.ok).toBe(true);
    // team_completed (10 min) should be preferred over team_stopped (5 min)
    expect(result.team_completion_ms).toBe(10 * 60 * 1000);
  });

  it('falls back to team_stopped when no team_completed', () => {
    const { aggregateTeamMetrics } = realTeamEvents;

    const traceId = 'trace-fallback';
    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'team_created', trace_id: traceId, at: '2026-01-01T00:00:00Z' },
            { type: 'team_stopped', trace_id: traceId, at: '2026-01-01T00:05:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.ok).toBe(true);
    expect(result.team_completion_ms).toBe(5 * 60 * 1000);
  });

  it('returns total_messages_sent of 0 when no team_message events', () => {
    const { aggregateTeamMetrics } = realTeamEvents;

    const traceId = 'trace-no-msgs';
    const state = {
      hook_metrics: {
        teams: {
          events: [
            { type: 'team_created', trace_id: traceId, at: '2026-01-01T00:00:00Z' },
            {
              type: 'task_completed',
              trace_id: traceId,
              agent: 'AG-API',
              duration_ms: 100,
              at: '2026-01-01T00:01:00Z',
            },
            { type: 'team_stopped', trace_id: traceId, at: '2026-01-01T00:05:00Z' },
          ],
          summary: {},
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(state));

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.ok).toBe(true);
    expect(result.total_messages_sent).toBe(0);
  });
});

// messaging-bridge helper trace_id tests are in
// __tests__/scripts/messaging-bridge-trace.test.js (tests real implementation)
