/**
 * browser-qa-status.js - Agentic test status integration for status.json
 *
 * Adds and manages `agentic_test_status` field on stories in status.json.
 * This field is separate from `test_status` (which tracks deterministic Jest tests).
 *
 * Status values:
 *   - "validated" : >=80% pass rate in agentic browser tests
 *   - "warning"   : 70-79% pass rate (needs investigation)
 *   - "failed"    : <70% pass rate (potential bug)
 *   - "not_run"   : No agentic tests executed yet
 *
 * Usage:
 *   const { updateAgenticTestStatus, getAgenticTestStatus } = require('./lib/browser-qa-status');
 *
 *   // Update a story's agentic test status
 *   updateAgenticTestStatus(projectRoot, 'US-0050', {
 *     status: 'validated',
 *     pass_rate: 0.87,
 *     scenarios_run: 3,
 *     last_run: '2026-02-16T14:30:00Z',
 *     evidence_path: '.agileflow/ui-review/runs/2026-02-16_14-30-00/'
 *   });
 *
 *   // Read a story's agentic test status
 *   const result = getAgenticTestStatus(projectRoot, 'US-0050');
 */

const fs = require('fs');
const path = require('path');

const STATUS_FILE = 'docs/09-agents/status.json';

/**
 * Read status.json safely
 * @param {string} projectRoot - Project root directory
 * @returns {object|null} Parsed status.json or null on error
 */
function readStatusJson(projectRoot) {
  const statusPath = path.join(projectRoot, STATUS_FILE);
  if (!fs.existsSync(statusPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write status.json safely
 * @param {string} projectRoot - Project root directory
 * @param {object} data - Status data to write
 * @returns {boolean} Success status
 */
function writeStatusJson(projectRoot, data) {
  const statusPath = path.join(projectRoot, STATUS_FILE);
  try {
    data.updated = new Date().toISOString();
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Update a story's agentic test status
 * @param {string} projectRoot - Project root directory
 * @param {string} storyId - Story ID (e.g., 'US-0050')
 * @param {object} result - Agentic test result
 * @param {'validated'|'warning'|'failed'|'not_run'} result.status - Overall status
 * @param {number} result.pass_rate - Pass rate (0-1)
 * @param {number} result.scenarios_run - Number of scenarios executed
 * @param {string} result.last_run - ISO timestamp of last run
 * @param {string} result.evidence_path - Path to evidence directory
 * @returns {boolean} Success status
 */
function updateAgenticTestStatus(projectRoot, storyId, result) {
  const status = readStatusJson(projectRoot);
  if (!status) return false;

  if (!status.stories || !status.stories[storyId]) {
    return false;
  }

  status.stories[storyId].agentic_test_status = result.status;
  status.stories[storyId].agentic_test_details = {
    pass_rate: result.pass_rate,
    scenarios_run: result.scenarios_run,
    last_run: result.last_run,
    evidence_path: result.evidence_path,
  };

  return writeStatusJson(projectRoot, status);
}

/**
 * Get a story's agentic test status
 * @param {string} projectRoot - Project root directory
 * @param {string} storyId - Story ID (e.g., 'US-0050')
 * @returns {object|null} Agentic test status or null
 */
function getAgenticTestStatus(projectRoot, storyId) {
  const status = readStatusJson(projectRoot);
  if (!status || !status.stories || !status.stories[storyId]) return null;

  const story = status.stories[storyId];
  return {
    status: story.agentic_test_status || 'not_run',
    details: story.agentic_test_details || null,
  };
}

/**
 * Update multiple stories' agentic test statuses from a run summary
 * @param {string} projectRoot - Project root directory
 * @param {Array} scenarioResults - Array of scenario results
 * @param {string} scenarioResults[].story_id - Story ID
 * @param {'validated'|'warning'|'failed'} scenarioResults[].status - Status
 * @param {number} scenarioResults[].pass_rate - Pass rate
 * @param {string} evidencePath - Path to run evidence directory
 * @returns {{ updated: number, skipped: number }}
 */
function updateBatchAgenticStatus(projectRoot, scenarioResults, evidencePath) {
  const status = readStatusJson(projectRoot);
  if (!status) return { updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;
  const timestamp = new Date().toISOString();

  for (const result of scenarioResults) {
    if (!result.story_id) {
      skipped++;
      continue;
    }

    if (!status.stories || !status.stories[result.story_id]) {
      skipped++;
      continue;
    }

    status.stories[result.story_id].agentic_test_status = result.status;
    status.stories[result.story_id].agentic_test_details = {
      pass_rate: result.pass_rate,
      scenarios_run: 1,
      last_run: timestamp,
      evidence_path: evidencePath,
    };
    updated++;
  }

  if (updated > 0) {
    writeStatusJson(projectRoot, status);
  }

  return { updated, skipped };
}

/**
 * Get summary of all agentic test statuses across stories
 * @param {string} projectRoot - Project root directory
 * @returns {{ validated: number, warning: number, failed: number, not_run: number, total: number }}
 */
function getAgenticTestSummary(projectRoot) {
  const status = readStatusJson(projectRoot);
  const summary = { validated: 0, warning: 0, failed: 0, not_run: 0, total: 0 };

  if (!status || !status.stories) return summary;

  for (const story of Object.values(status.stories)) {
    summary.total++;
    const agenticStatus = story.agentic_test_status || 'not_run';
    if (summary[agenticStatus] !== undefined) {
      summary[agenticStatus]++;
    } else {
      summary.not_run++;
    }
  }

  return summary;
}

module.exports = {
  updateAgenticTestStatus,
  getAgenticTestStatus,
  updateBatchAgenticStatus,
  getAgenticTestSummary,
  readStatusJson,
  writeStatusJson,
  STATUS_FILE,
};
