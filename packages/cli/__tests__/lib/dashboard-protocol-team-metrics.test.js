/**
 * Tests for TEAM_METRICS protocol message type in dashboard-protocol.js
 */

const { OutboundMessageType, createTeamMetrics } = require('../../lib/dashboard-protocol');

describe('TEAM_METRICS protocol message', () => {
  describe('OutboundMessageType.TEAM_METRICS', () => {
    it('equals "team_metrics"', () => {
      expect(OutboundMessageType.TEAM_METRICS).toBe('team_metrics');
    });
  });

  describe('createTeamMetrics', () => {
    let now;

    beforeEach(() => {
      now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates message with type TEAM_METRICS', () => {
      const msg = createTeamMetrics('trace-1', {});
      expect(msg.type).toBe(OutboundMessageType.TEAM_METRICS);
    });

    it('includes trace_id', () => {
      const msg = createTeamMetrics('trace-abc', {});
      expect(msg.trace_id).toBe('trace-abc');
    });

    it('includes per_agent metrics', () => {
      const metrics = {
        per_agent: {
          'api-builder': { total_duration_ms: 5000, tasks_completed: 2, errors: 0, timeouts: 0 },
        },
      };
      const msg = createTeamMetrics('trace-1', metrics);
      expect(msg.per_agent).toEqual(metrics.per_agent);
    });

    it('includes per_gate metrics', () => {
      const metrics = {
        per_gate: {
          lint: { passed: 3, failed: 1, pass_rate: 0.75 },
        },
      };
      const msg = createTeamMetrics('trace-1', metrics);
      expect(msg.per_gate).toEqual(metrics.per_gate);
    });

    it('includes team_completion_ms', () => {
      const metrics = { team_completion_ms: 12345 };
      const msg = createTeamMetrics('trace-1', metrics);
      expect(msg.team_completion_ms).toBe(12345);
    });

    it('includes computed_at', () => {
      const computedAt = '2026-02-13T10:00:00.000Z';
      const metrics = { computed_at: computedAt };
      const msg = createTeamMetrics('trace-1', metrics);
      expect(msg.computed_at).toBe(computedAt);
    });

    it('includes ISO timestamp', () => {
      const msg = createTeamMetrics('trace-1', {});
      expect(msg.timestamp).toBe(now.toISOString());
    });

    it('defaults per_agent to empty object when missing', () => {
      const msg = createTeamMetrics('trace-1', {});
      expect(msg.per_agent).toEqual({});
    });

    it('defaults per_gate to empty object when missing', () => {
      const msg = createTeamMetrics('trace-1', {});
      expect(msg.per_gate).toEqual({});
    });

    it('handles null metrics gracefully', () => {
      const msg = createTeamMetrics('trace-1', null);
      expect(msg.type).toBe('team_metrics');
      expect(msg.trace_id).toBe('trace-1');
      expect(msg.per_agent).toEqual({});
      expect(msg.per_gate).toEqual({});
      expect(msg.team_completion_ms).toBeFalsy();
      expect(msg.computed_at).toBeFalsy();
    });

    it('handles undefined metrics gracefully', () => {
      const msg = createTeamMetrics('trace-1', undefined);
      expect(msg.type).toBe('team_metrics');
      expect(msg.per_agent).toEqual({});
      expect(msg.per_gate).toEqual({});
    });

    it('includes all expected fields in message', () => {
      const metrics = {
        per_agent: { builder: { tasks_completed: 1 } },
        per_gate: { lint: { passed: 1 } },
        team_completion_ms: 5000,
        computed_at: '2026-02-13T12:00:00.000Z',
      };
      const msg = createTeamMetrics('trace-xyz', metrics);
      expect(Object.keys(msg)).toEqual(
        expect.arrayContaining([
          'type',
          'trace_id',
          'per_agent',
          'per_gate',
          'team_completion_ms',
          'computed_at',
          'timestamp',
        ])
      );
    });
  });
});
