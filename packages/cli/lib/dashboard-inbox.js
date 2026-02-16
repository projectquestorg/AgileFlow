'use strict';

/**
 * dashboard-inbox.js - Inbox Management
 *
 * Manages the inbox of automation results and user actions
 * (accept, dismiss, mark read).
 * Extracted from dashboard-server.js for testability.
 */

/**
 * Get sorted inbox items (newest first)
 * @param {Map} inbox - Map of itemId -> InboxItem
 * @returns {Array} - Sorted inbox items
 */
function getSortedInboxItems(inbox) {
  return Array.from(inbox.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Handle an inbox action (accept, dismiss, read)
 * @param {Map} inbox - Map of itemId -> InboxItem
 * @param {string} itemId - Item ID
 * @param {string} action - Action to perform (accept, dismiss, read)
 * @returns {{ success: boolean, item?: Object, error?: string }}
 */
function handleInboxAction(inbox, itemId, action) {
  const item = inbox.get(itemId);
  if (!item) {
    return { success: false, error: `Inbox item ${itemId} not found` };
  }

  switch (action) {
    case 'accept':
      item.status = 'accepted';
      inbox.delete(itemId);
      return {
        success: true,
        item,
        notification: { level: 'success', message: `Accepted: ${item.title}` },
      };

    case 'dismiss':
      item.status = 'dismissed';
      inbox.delete(itemId);
      return {
        success: true,
        item,
        notification: { level: 'info', message: `Dismissed: ${item.title}` },
      };

    case 'read':
      item.status = 'read';
      return { success: true, item };

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

module.exports = {
  getSortedInboxItems,
  handleInboxAction,
};
