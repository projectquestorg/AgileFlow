'use strict';

/**
 * dashboard-automations.js - Automation Scheduling and Management
 *
 * Handles automation registry, scheduling (next run calculation),
 * run/stop operations, and inbox integration.
 * Extracted from dashboard-server.js for testability.
 */

/**
 * Calculate next run time for an automation
 * @param {Object} automation - Automation config with enabled and schedule properties
 * @returns {string|null} - ISO timestamp, human-readable string, or null
 */
function calculateNextRun(automation) {
  if (!automation.enabled || !automation.schedule) return null;

  const now = new Date();
  const schedule = automation.schedule;

  switch (schedule.type) {
    case 'on_session':
      return 'Every session';
    case 'daily': {
      // Next day at midnight (or specified hour)
      const nextDaily = new Date(now);
      nextDaily.setDate(nextDaily.getDate() + 1);
      nextDaily.setHours(schedule.hour || 0, 0, 0, 0);
      return nextDaily.toISOString();
    }
    case 'weekly': {
      // Next occurrence of the specified day
      let targetDay = 0;
      if (typeof schedule.day === 'string') {
        const idx = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ].indexOf(schedule.day.toLowerCase());
        targetDay = idx >= 0 ? idx : 0; // Default to Sunday if invalid name
      } else {
        targetDay = schedule.day || 0;
      }
      const nextWeekly = new Date(now);
      const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
      nextWeekly.setDate(nextWeekly.getDate() + daysUntil);
      nextWeekly.setHours(schedule.hour || 0, 0, 0, 0);
      return nextWeekly.toISOString();
    }
    case 'monthly': {
      // Next occurrence of the specified date
      const nextMonthly = new Date(now);
      const targetDate = schedule.date || 1;
      if (now.getDate() >= targetDate) {
        nextMonthly.setMonth(nextMonthly.getMonth() + 1);
      }
      nextMonthly.setDate(targetDate);
      nextMonthly.setHours(schedule.hour || 0, 0, 0, 0);
      return nextMonthly.toISOString();
    }
    case 'interval': {
      const hours = schedule.hours || 24;
      return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
    }
    default:
      return null;
  }
}

/**
 * Create an inbox item from an automation result
 * @param {string} automationId - Automation ID
 * @param {Object} result - Run result
 * @param {string|undefined} automationName - Display name of the automation
 * @returns {Object} - Inbox item
 */
function createInboxItem(automationId, result, automationName) {
  const itemId = `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: itemId,
    automationId,
    title: automationName || automationId,
    summary: result.success
      ? result.output?.slice(0, 200) || 'Completed successfully'
      : result.error?.slice(0, 200) || 'Failed',
    timestamp: new Date().toISOString(),
    status: 'unread',
    result: {
      success: result.success,
      output: result.output,
      error: result.error,
      duration_ms: result.duration_ms,
    },
  };
}

/**
 * Enrich automation list with running status and next run time
 * @param {Array} automations - Raw automation list
 * @param {Map} runningAutomations - Map of currently running automation IDs
 * @param {Object} registry - Automation registry (for getRunHistory)
 * @returns {Array} - Enriched automation list
 */
function enrichAutomationList(automations, runningAutomations, registry) {
  return automations.map(automation => {
    const isRunning = runningAutomations.has(automation.id);
    const lastRun = registry.getRunHistory(automation.id, 1)[0];
    const nextRun = calculateNextRun(automation);

    return {
      ...automation,
      status: isRunning ? 'running' : automation.enabled ? 'idle' : 'disabled',
      lastRun: lastRun?.at,
      lastRunSuccess: lastRun?.success,
      nextRun,
    };
  });
}

module.exports = {
  calculateNextRun,
  createInboxItem,
  enrichAutomationList,
};
