/**
 * Dashboard Status Tests
 *
 * Tests for status/metrics functions extracted from dashboard-server.js.
 */

'use strict';

jest.mock('fs');

const fs = require('fs');
const { buildStatusSummary, readTeamMetrics } = require('../../lib/dashboard-status');

describe('Dashboard Status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildStatusSummary', () => {
    test('returns null when status.json does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(buildStatusSummary('/test/project')).toBeNull();
    });

    test('builds summary from status.json', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          stories: {
            'US-001': { status: 'done' },
            'US-002': { status: 'in-progress' },
            'US-003': { status: 'ready' },
            'US-004': { status: 'blocked' },
            'US-005': { status: 'completed' },
          },
          epics: {
            'EP-001': {
              title: 'Epic 1',
              status: 'active',
              stories: ['US-001', 'US-002', 'US-003'],
            },
          },
        })
      );

      const summary = buildStatusSummary('/test/project');

      expect(summary.total).toBe(5);
      expect(summary.done).toBe(2); // done + completed
      expect(summary.inProgress).toBe(1);
      expect(summary.ready).toBe(1);
      expect(summary.blocked).toBe(1);
      expect(summary.epics).toHaveLength(1);
      expect(summary.epics[0].id).toBe('EP-001');
      expect(summary.epics[0].storyCount).toBe(3);
      expect(summary.epics[0].doneCount).toBe(1); // US-001 is done
    });

    test('handles empty stories and epics', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({}));

      const summary = buildStatusSummary('/test/project');
      expect(summary.total).toBe(0);
      expect(summary.done).toBe(0);
      expect(summary.epics).toEqual([]);
    });

    test('returns null on parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = buildStatusSummary('/test/project');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('readTeamMetrics', () => {
    test('returns empty object when session-state.json does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(readTeamMetrics('/test/project')).toEqual({});
    });

    test('returns traces from session-state.json', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          team_metrics: {
            traces: {
              'trace-1': { agents: 3, duration: 1234 },
              'trace-2': { agents: 5, duration: 5678 },
            },
          },
        })
      );

      const traces = readTeamMetrics('/test/project');
      expect(traces).toHaveProperty('trace-1');
      expect(traces).toHaveProperty('trace-2');
      expect(traces['trace-1'].agents).toBe(3);
    });

    test('returns empty object when no team_metrics', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({}));

      expect(readTeamMetrics('/test/project')).toEqual({});
    });

    test('returns empty object on parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('bad json');

      expect(readTeamMetrics('/test/project')).toEqual({});
    });
  });
});
