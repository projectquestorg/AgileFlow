/**
 * Tests for per-agent cost tracking (US-0345)
 *
 * Covers:
 * - computeAgentCost: pricing for different models
 * - aggregateTeamMetrics: token counts and cost_usd in per_agent
 * - aggregateTeamMetrics: total_cost_usd in aggregated result
 * - checkCostThreshold: logs warning when exceeded
 * - checkCostThreshold: no warning when under threshold
 * - Edge cases: missing tokens, unknown model
 * - Dashboard protocol: cost fields in createTeamMetrics
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('../../../lib/paths');
jest.mock('../../../lib/feature-flags');
jest.mock('../../../scripts/lib/file-lock');
jest.mock('../../../scripts/messaging-bridge');

const {
  computeAgentCost,
  checkCostThreshold,
  aggregateTeamMetrics,
  trackEvent,
  MODEL_PRICING,
  DEFAULT_COST_THRESHOLD_USD,
} = require('../../../scripts/lib/team-events');
const paths = require('../../../lib/paths');
const fileLock = require('../../../scripts/lib/file-lock');
const bridge = require('../../../scripts/messaging-bridge');

describe('computeAgentCost', () => {
  it('computes cost for haiku model', () => {
    // 1M input tokens at $0.80 + 1M output tokens at $4.00 = $4.80
    const cost = computeAgentCost(1_000_000, 1_000_000, 'haiku');
    expect(cost).toBe(4.8);
  });

  it('computes cost for sonnet model', () => {
    // 1M input at $3.00 + 1M output at $15.00 = $18.00
    const cost = computeAgentCost(1_000_000, 1_000_000, 'sonnet');
    expect(cost).toBe(18);
  });

  it('computes cost for opus model', () => {
    // 1M input at $15.00 + 1M output at $75.00 = $90.00
    const cost = computeAgentCost(1_000_000, 1_000_000, 'opus');
    expect(cost).toBe(90);
  });

  it('computes cost for full model ID', () => {
    const cost = computeAgentCost(1_000_000, 1_000_000, 'claude-sonnet-4-6');
    expect(cost).toBe(18);
  });

  it('defaults to haiku pricing for unknown model', () => {
    const costUnknown = computeAgentCost(1_000_000, 1_000_000, 'unknown-model');
    const costHaiku = computeAgentCost(1_000_000, 1_000_000, 'haiku');
    expect(costUnknown).toBe(costHaiku);
  });

  it('defaults to haiku pricing when model is undefined', () => {
    const cost = computeAgentCost(1_000_000, 1_000_000, undefined);
    expect(cost).toBe(4.8);
  });

  it('returns 0 for zero tokens', () => {
    expect(computeAgentCost(0, 0, 'opus')).toBe(0);
  });

  it('handles small token counts with precision', () => {
    // 1000 input tokens on haiku: (1000/1M) * 0.80 = $0.0008
    // 500 output tokens on haiku: (500/1M) * 4.00 = $0.002
    // Total: $0.0028
    const cost = computeAgentCost(1000, 500, 'haiku');
    expect(cost).toBe(0.0028);
  });

  it('rounds to 6 decimal places', () => {
    // Create a cost that might have floating point issues
    const cost = computeAgentCost(333, 777, 'sonnet');
    const decimalPlaces = cost.toString().split('.')[1];
    expect(!decimalPlaces || decimalPlaces.length <= 6).toBe(true);
  });
});

describe('MODEL_PRICING', () => {
  it('has pricing for haiku, sonnet, opus aliases', () => {
    expect(MODEL_PRICING['haiku']).toBeDefined();
    expect(MODEL_PRICING['sonnet']).toBeDefined();
    expect(MODEL_PRICING['opus']).toBeDefined();
  });

  it('has pricing for full model IDs', () => {
    expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-6']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-6']).toBeDefined();
  });

  it('each entry has input and output fields', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_COST_THRESHOLD_USD', () => {
  it('is 5.00', () => {
    expect(DEFAULT_COST_THRESHOLD_USD).toBe(5.0);
  });
});

describe('checkCostThreshold', () => {
  const testRootDir = '/home/test/project';
  const sessionStatePath = path.join(testRootDir, 'docs/00-meta/session-state.json');

  beforeEach(() => {
    jest.clearAllMocks();
    paths.getSessionStatePath.mockReturnValue(sessionStatePath);
    fs.existsSync.mockReturnValue(true);
    fileLock.atomicReadModifyWrite.mockImplementation((p, fn) => fn({}));
    bridge.sendMessage.mockReturnValue({ ok: true });
  });

  it('returns true when cost exceeds default threshold', () => {
    const exceeded = checkCostThreshold(testRootDir, 'trace-1', 6.0);
    expect(exceeded).toBe(true);
  });

  it('returns false when cost is under default threshold', () => {
    const exceeded = checkCostThreshold(testRootDir, 'trace-1', 3.0);
    expect(exceeded).toBe(false);
  });

  it('returns false when cost equals threshold', () => {
    const exceeded = checkCostThreshold(testRootDir, 'trace-1', 5.0);
    expect(exceeded).toBe(false);
  });

  it('uses custom threshold when provided', () => {
    const exceeded = checkCostThreshold(testRootDir, 'trace-1', 1.5, 1.0);
    expect(exceeded).toBe(true);
  });

  it('emits cost_warning event when threshold exceeded', () => {
    checkCostThreshold(testRootDir, 'trace-warn', 10.0, 5.0);

    // Verify event was written to session-state
    expect(fileLock.atomicReadModifyWrite).toHaveBeenCalled();
    const updateFn = fileLock.atomicReadModifyWrite.mock.calls[0][1];
    const state = updateFn({});
    const events = state.hook_metrics.teams.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('cost_warning');
    expect(events[0].total_cost_usd).toBe(10.0);
    expect(events[0].threshold_usd).toBe(5.0);
    expect(events[0].message).toContain('exceeds threshold');
  });

  it('does not emit event when under threshold', () => {
    checkCostThreshold(testRootDir, 'trace-ok', 2.0, 5.0);
    expect(fileLock.atomicReadModifyWrite).not.toHaveBeenCalled();
  });
});

describe('aggregateTeamMetrics with cost tracking', () => {
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

  it('accumulates input_tokens and output_tokens per agent', () => {
    const traceId = 'trace-cost-1';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'api-builder',
        trace_id: traceId,
        duration_ms: 3000,
        input_tokens: 5000,
        output_tokens: 2000,
        model: 'sonnet',
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'task_completed',
        agent: 'api-builder',
        trace_id: traceId,
        duration_ms: 2000,
        input_tokens: 3000,
        output_tokens: 1000,
        model: 'sonnet',
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['api-builder'].input_tokens).toBe(8000);
    expect(result.per_agent['api-builder'].output_tokens).toBe(3000);
  });

  it('defaults missing token fields to 0', () => {
    const traceId = 'trace-cost-2';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'fast-agent',
        trace_id: traceId,
        duration_ms: 1000,
        at: '2026-01-01T00:01:00Z',
        // No input_tokens or output_tokens
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['fast-agent'].input_tokens).toBe(0);
    expect(result.per_agent['fast-agent'].output_tokens).toBe(0);
    expect(result.per_agent['fast-agent'].cost_usd).toBe(0);
  });

  it('computes cost_usd per agent using model from events', () => {
    const traceId = 'trace-cost-3';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'expensive-agent',
        trace_id: traceId,
        duration_ms: 5000,
        input_tokens: 1_000_000,
        output_tokens: 500_000,
        model: 'opus',
        at: '2026-01-01T00:01:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    // 1M input * $15/M + 500K output * $75/M = $15 + $37.5 = $52.5
    expect(result.per_agent['expensive-agent'].cost_usd).toBe(52.5);
  });

  it('defaults to haiku pricing when model is not in events', () => {
    const traceId = 'trace-cost-4';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'no-model-agent',
        trace_id: traceId,
        duration_ms: 1000,
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        at: '2026-01-01T00:01:00Z',
        // No model field
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    // Haiku: 1M * $0.80/M + 1M * $4.00/M = $4.80
    expect(result.per_agent['no-model-agent'].cost_usd).toBe(4.8);
  });

  it('computes total_cost_usd across all agents', () => {
    const traceId = 'trace-cost-5';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'agent-a',
        trace_id: traceId,
        duration_ms: 1000,
        input_tokens: 1_000_000,
        output_tokens: 0,
        model: 'haiku',
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'task_completed',
        agent: 'agent-b',
        trace_id: traceId,
        duration_ms: 1000,
        input_tokens: 1_000_000,
        output_tokens: 0,
        model: 'sonnet',
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    // agent-a: 1M * $0.80/M = $0.80
    // agent-b: 1M * $3.00/M = $3.00
    // Total: $3.80
    expect(result.total_cost_usd).toBe(3.8);
  });

  it('returns total_cost_usd of 0 when no events', () => {
    const traceId = 'trace-cost-empty';
    mockEvents([]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.total_cost_usd).toBe(0);
  });

  it('uses last model seen for an agent when multiple tasks', () => {
    const traceId = 'trace-cost-6';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'upgrader',
        trace_id: traceId,
        duration_ms: 1000,
        input_tokens: 500_000,
        output_tokens: 500_000,
        model: 'haiku',
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'task_completed',
        agent: 'upgrader',
        trace_id: traceId,
        duration_ms: 2000,
        input_tokens: 500_000,
        output_tokens: 500_000,
        model: 'sonnet',
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    // Total tokens: 1M input + 1M output, last model = sonnet
    // 1M * $3.00/M + 1M * $15.00/M = $18.00
    expect(result.per_agent['upgrader'].input_tokens).toBe(1_000_000);
    expect(result.per_agent['upgrader'].output_tokens).toBe(1_000_000);
    expect(result.per_agent['upgrader'].cost_usd).toBe(18);
  });

  it('preserves existing per_agent fields alongside new cost fields', () => {
    const traceId = 'trace-cost-7';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'worker',
        trace_id: traceId,
        duration_ms: 5000,
        input_tokens: 10000,
        output_tokens: 5000,
        model: 'haiku',
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'agent_error',
        agent: 'worker',
        trace_id: traceId,
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['worker'].total_duration_ms).toBe(5000);
    expect(result.per_agent['worker'].tasks_completed).toBe(1);
    expect(result.per_agent['worker'].errors).toBe(1);
    expect(result.per_agent['worker'].timeouts).toBe(0);
    expect(result.per_agent['worker'].input_tokens).toBe(10000);
    expect(result.per_agent['worker'].output_tokens).toBe(5000);
    expect(result.per_agent['worker'].cost_usd).toBeDefined();
  });
});

describe('createTeamMetrics with cost fields', () => {
  const { createTeamMetrics } = require('../../../lib/dashboard-protocol');

  it('includes total_cost_usd in message', () => {
    const metrics = {
      per_agent: { a: { cost_usd: 1.5 } },
      per_gate: {},
      team_completion_ms: 5000,
      total_cost_usd: 1.5,
      computed_at: '2026-01-01T00:00:00Z',
    };
    const msg = createTeamMetrics('trace-cost', metrics);

    expect(msg.total_cost_usd).toBe(1.5);
  });

  it('defaults total_cost_usd to 0 when missing', () => {
    const msg = createTeamMetrics('trace-no-cost', {});
    expect(msg.total_cost_usd).toBe(0);
  });

  it('defaults total_cost_usd to 0 when metrics is null', () => {
    const msg = createTeamMetrics('trace-null', null);
    expect(msg.total_cost_usd).toBe(0);
  });

  it('includes total_cost_usd in message fields list', () => {
    const metrics = {
      per_agent: {},
      per_gate: {},
      total_cost_usd: 2.5,
      computed_at: '2026-01-01T00:00:00Z',
    };
    const msg = createTeamMetrics('trace-fields', metrics);
    expect(Object.keys(msg)).toContain('total_cost_usd');
  });
});
