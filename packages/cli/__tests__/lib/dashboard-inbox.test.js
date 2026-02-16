/**
 * Dashboard Inbox Tests
 *
 * Tests for inbox management functions extracted from dashboard-server.js.
 */

'use strict';

const { getSortedInboxItems, handleInboxAction } = require('../../lib/dashboard-inbox');

describe('Dashboard Inbox', () => {
  describe('getSortedInboxItems', () => {
    test('returns empty array for empty inbox', () => {
      const inbox = new Map();
      expect(getSortedInboxItems(inbox)).toEqual([]);
    });

    test('sorts items newest first', () => {
      const inbox = new Map([
        ['a', { id: 'a', timestamp: '2024-01-01T00:00:00Z' }],
        ['b', { id: 'b', timestamp: '2024-01-03T00:00:00Z' }],
        ['c', { id: 'c', timestamp: '2024-01-02T00:00:00Z' }],
      ]);

      const sorted = getSortedInboxItems(inbox);
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('c');
      expect(sorted[2].id).toBe('a');
    });
  });

  describe('handleInboxAction', () => {
    let inbox;

    beforeEach(() => {
      inbox = new Map([['item-1', { id: 'item-1', title: 'Test Item', status: 'unread' }]]);
    });

    test('accept removes item from inbox', () => {
      const result = handleInboxAction(inbox, 'item-1', 'accept');

      expect(result.success).toBe(true);
      expect(result.item.status).toBe('accepted');
      expect(result.notification.level).toBe('success');
      expect(inbox.has('item-1')).toBe(false);
    });

    test('dismiss removes item from inbox', () => {
      const result = handleInboxAction(inbox, 'item-1', 'dismiss');

      expect(result.success).toBe(true);
      expect(result.item.status).toBe('dismissed');
      expect(result.notification.level).toBe('info');
      expect(inbox.has('item-1')).toBe(false);
    });

    test('read marks item but keeps it', () => {
      const result = handleInboxAction(inbox, 'item-1', 'read');

      expect(result.success).toBe(true);
      expect(result.item.status).toBe('read');
      expect(inbox.has('item-1')).toBe(true);
    });

    test('returns error for missing item', () => {
      const result = handleInboxAction(inbox, 'nonexistent', 'accept');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('returns error for unknown action', () => {
      const result = handleInboxAction(inbox, 'item-1', 'delete');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action');
    });
  });
});
