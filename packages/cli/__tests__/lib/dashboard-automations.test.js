/**
 * Dashboard Automations Tests
 *
 * Tests for automation scheduling functions extracted from dashboard-server.js.
 * Covers calculateNextRun (pure), createInboxItem, enrichAutomationList.
 */

'use strict';

const {
  calculateNextRun,
  createInboxItem,
  enrichAutomationList,
} = require('../../lib/dashboard-automations');

describe('Dashboard Automations', () => {
  // ============================================================================
  // calculateNextRun - pure function
  // ============================================================================

  describe('calculateNextRun', () => {
    test('returns null for disabled automation', () => {
      expect(calculateNextRun({ enabled: false, schedule: { type: 'daily' } })).toBeNull();
    });

    test('returns null for automation without schedule', () => {
      expect(calculateNextRun({ enabled: true })).toBeNull();
    });

    test('returns "Every session" for on_session type', () => {
      expect(calculateNextRun({ enabled: true, schedule: { type: 'on_session' } })).toBe(
        'Every session'
      );
    });

    test('returns ISO string for daily schedule', () => {
      const result = calculateNextRun({
        enabled: true,
        schedule: { type: 'daily', hour: 9 },
      });

      expect(result).toBeDefined();
      const date = new Date(result);
      expect(date.getHours()).toBe(9);
      expect(date.getMinutes()).toBe(0);
      // Should be tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(date.getDate()).toBe(tomorrow.getDate());
    });

    test('uses hour 0 as default for daily schedule', () => {
      const result = calculateNextRun({
        enabled: true,
        schedule: { type: 'daily' },
      });

      const date = new Date(result);
      expect(date.getHours()).toBe(0);
    });

    test('calculates next weekly occurrence with string day', () => {
      const result = calculateNextRun({
        enabled: true,
        schedule: { type: 'weekly', day: 'monday', hour: 10 },
      });

      expect(result).toBeDefined();
      const date = new Date(result);
      expect(date.getDay()).toBe(1); // Monday = 1
      expect(date.getHours()).toBe(10);
    });

    test('calculates next weekly occurrence with numeric day', () => {
      const result = calculateNextRun({
        enabled: true,
        schedule: { type: 'weekly', day: 5, hour: 14 },
      });

      const date = new Date(result);
      expect(date.getDay()).toBe(5); // Friday = 5
      expect(date.getHours()).toBe(14);
    });

    test('defaults to Sunday for weekly without day', () => {
      const result = calculateNextRun({
        enabled: true,
        schedule: { type: 'weekly' },
      });

      const date = new Date(result);
      expect(date.getDay()).toBe(0); // Sunday
    });

    test('calculates next monthly occurrence', () => {
      const result = calculateNextRun({
        enabled: true,
        schedule: { type: 'monthly', date: 15, hour: 8 },
      });

      expect(result).toBeDefined();
      const date = new Date(result);
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(8);
    });

    test('rolls to next month when date has passed', () => {
      const now = new Date();
      const pastDate = now.getDate() > 1 ? 1 : 28;
      // Only test when we can guarantee the date has passed
      if (now.getDate() > 1) {
        const result = calculateNextRun({
          enabled: true,
          schedule: { type: 'monthly', date: 1 },
        });
        const date = new Date(result);
        expect(date.getMonth()).toBe((now.getMonth() + 1) % 12);
      }
    });

    test('returns human-readable string for interval schedule', () => {
      expect(
        calculateNextRun({
          enabled: true,
          schedule: { type: 'interval', hours: 6 },
        })
      ).toBe('Every 6 hours');
    });

    test('handles singular hour in interval', () => {
      expect(
        calculateNextRun({
          enabled: true,
          schedule: { type: 'interval', hours: 1 },
        })
      ).toBe('Every 1 hour');
    });

    test('defaults to 24 hours for interval without hours', () => {
      expect(
        calculateNextRun({
          enabled: true,
          schedule: { type: 'interval' },
        })
      ).toBe('Every 24 hours');
    });

    test('returns null for unknown schedule type', () => {
      expect(
        calculateNextRun({
          enabled: true,
          schedule: { type: 'unknown_type' },
        })
      ).toBeNull();
    });
  });

  // ============================================================================
  // createInboxItem
  // ============================================================================

  describe('createInboxItem', () => {
    test('creates item for successful result', () => {
      const item = createInboxItem(
        'auto-1',
        {
          success: true,
          output: 'All tests passed',
          duration_ms: 1234,
        },
        'Daily Tests'
      );

      expect(item.id).toMatch(/^inbox_/);
      expect(item.automationId).toBe('auto-1');
      expect(item.title).toBe('Daily Tests');
      expect(item.summary).toBe('All tests passed');
      expect(item.status).toBe('unread');
      expect(item.result.success).toBe(true);
      expect(item.result.duration_ms).toBe(1234);
      expect(item.timestamp).toBeDefined();
    });

    test('creates item for failed result', () => {
      const item = createInboxItem('auto-2', {
        success: false,
        error: 'Connection timeout',
      });

      expect(item.automationId).toBe('auto-2');
      expect(item.title).toBe('auto-2'); // Falls back to ID when no name
      expect(item.summary).toBe('Connection timeout');
      expect(item.result.success).toBe(false);
    });

    test('truncates long output in summary', () => {
      const longOutput = 'x'.repeat(300);
      const item = createInboxItem(
        'auto-3',
        {
          success: true,
          output: longOutput,
        },
        'Long Task'
      );

      expect(item.summary.length).toBeLessThanOrEqual(200);
    });

    test('uses default summary when no output', () => {
      const item = createInboxItem('auto-4', { success: true }, 'No Output');
      expect(item.summary).toBe('Completed successfully');
    });

    test('uses default error summary when no error message', () => {
      const item = createInboxItem('auto-5', { success: false }, 'Failed Task');
      expect(item.summary).toBe('Failed');
    });
  });

  // ============================================================================
  // enrichAutomationList
  // ============================================================================

  describe('enrichAutomationList', () => {
    const mockRegistry = {
      getRunHistory: jest.fn(() => []),
    };

    test('enriches automation with idle status when not running', () => {
      const automations = [{ id: 'a1', enabled: true, schedule: { type: 'daily' } }];
      const running = new Map();

      const result = enrichAutomationList(automations, running, mockRegistry);
      expect(result[0].status).toBe('idle');
    });

    test('enriches automation with running status', () => {
      const automations = [{ id: 'a1', enabled: true }];
      const running = new Map([['a1', { startTime: Date.now() }]]);

      const result = enrichAutomationList(automations, running, mockRegistry);
      expect(result[0].status).toBe('running');
    });

    test('enriches automation with disabled status', () => {
      const automations = [{ id: 'a1', enabled: false }];
      const running = new Map();

      const result = enrichAutomationList(automations, running, mockRegistry);
      expect(result[0].status).toBe('disabled');
    });

    test('includes last run info from history', () => {
      mockRegistry.getRunHistory.mockReturnValueOnce([
        { at: '2024-01-01T00:00:00Z', success: true },
      ]);
      const automations = [{ id: 'a1', enabled: true }];
      const running = new Map();

      const result = enrichAutomationList(automations, running, mockRegistry);
      expect(result[0].lastRun).toBe('2024-01-01T00:00:00Z');
      expect(result[0].lastRunSuccess).toBe(true);
    });

    test('handles empty automation list', () => {
      const result = enrichAutomationList([], new Map(), mockRegistry);
      expect(result).toEqual([]);
    });
  });
});
