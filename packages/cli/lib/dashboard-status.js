'use strict';

/**
 * dashboard-status.js - Status and Team Metrics
 *
 * Reads project status (stories/epics) and team metrics from disk,
 * and formats them for dashboard display.
 * Extracted from dashboard-server.js for testability.
 */

const path = require('path');
const fs = require('fs');

/**
 * Build a project status summary from status.json
 * @param {string} projectRoot - Project root directory
 * @returns {Object|null} - Status summary or null if unavailable
 */
function buildStatusSummary(projectRoot) {
  const statusPath = path.join(projectRoot, 'docs', '09-agents', 'status.json');
  if (!fs.existsSync(statusPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    const stories = data.stories || {};
    const epics = data.epics || {};

    const storyValues = Object.values(stories);
    return {
      total: storyValues.length,
      done: storyValues.filter(s => s.status === 'done' || s.status === 'completed').length,
      inProgress: storyValues.filter(s => s.status === 'in-progress').length,
      ready: storyValues.filter(s => s.status === 'ready').length,
      blocked: storyValues.filter(s => s.status === 'blocked').length,
      epics: Object.entries(epics).map(([id, e]) => ({
        id,
        title: e.title || id,
        status: e.status || 'unknown',
        storyCount: (e.stories || []).length,
        doneCount: (e.stories || []).filter(
          sid =>
            stories[sid] && (stories[sid].status === 'done' || stories[sid].status === 'completed')
        ).length,
      })),
    };
  } catch (error) {
    console.error('[Status Update Error]', error.message);
    return null;
  }
}

/**
 * Read team metrics traces from session-state.json
 * @param {string} projectRoot - Project root directory
 * @returns {Object} - Map of traceId -> metrics, or empty object
 */
function readTeamMetrics(projectRoot) {
  const sessionStatePath = path.join(projectRoot, 'docs', '09-agents', 'session-state.json');
  if (!fs.existsSync(sessionStatePath)) return {};

  try {
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    return (state.team_metrics && state.team_metrics.traces) || {};
  } catch {
    return {};
  }
}

module.exports = {
  buildStatusSummary,
  readTeamMetrics,
};
