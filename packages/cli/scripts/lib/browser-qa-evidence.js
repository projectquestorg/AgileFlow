/**
 * browser-qa-evidence.js - Screenshot evidence trail management
 *
 * Manages organized storage for agentic browser test evidence including
 * screenshots, result metadata, and automatic retention cleanup.
 *
 * Storage Structure:
 *   .agileflow/ui-review/
 *   ├── specs/              # YAML test scenario definitions
 *   ├── runs/               # Timestamped test run evidence
 *   │   └── YYYY-MM-DD_HH-MM-SS/
 *   │       ├── summary.json        # Aggregated run results
 *   │       └── AGENTIC-001/        # Per-scenario evidence
 *   │           ├── results.json    # Scenario results + metadata
 *   │           ├── step-1-navigate.png
 *   │           ├── step-2-click.png
 *   │           └── step-3-assert_FAILED.png
 *   └── baselines/          # Reference screenshots for visual diff
 *
 * Usage:
 *   const evidence = require('./lib/browser-qa-evidence');
 *   const runDir = evidence.createRunDirectory(projectRoot);
 *   const scenarioDir = evidence.createScenarioDirectory(runDir, 'AGENTIC-001');
 *   evidence.saveStepResult(scenarioDir, stepResult);
 *   evidence.saveRunSummary(runDir, results);
 *   evidence.cleanupOldRuns(projectRoot, 30); // 30-day retention
 */

const fs = require('fs');
const path = require('path');

const UI_REVIEW_DIR = '.agileflow/ui-review';
const RUNS_DIR = 'runs';
const SPECS_DIR = 'specs';
const BASELINES_DIR = 'baselines';
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Get the base ui-review directory path
 * @param {string} projectRoot - Project root directory
 * @returns {string} Path to .agileflow/ui-review/
 */
function getBaseDir(projectRoot) {
  return path.join(projectRoot, UI_REVIEW_DIR);
}

/**
 * Ensure the ui-review directory structure exists
 * @param {string} projectRoot - Project root directory
 * @returns {{ base: string, runs: string, specs: string, baselines: string }}
 */
function ensureDirectoryStructure(projectRoot) {
  const base = getBaseDir(projectRoot);
  const runs = path.join(base, RUNS_DIR);
  const specs = path.join(base, SPECS_DIR);
  const baselines = path.join(base, BASELINES_DIR);

  for (const dir of [base, runs, specs, baselines]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return { base, runs, specs, baselines };
}

/**
 * Create a timestamped run directory for this test execution
 * @param {string} projectRoot - Project root directory
 * @param {Date} [timestamp] - Optional timestamp (defaults to now)
 * @returns {string} Path to the new run directory
 */
function createRunDirectory(projectRoot, timestamp) {
  const dirs = ensureDirectoryStructure(projectRoot);
  const ts = timestamp || new Date();
  const dirName = formatTimestamp(ts);
  const runDir = path.join(dirs.runs, dirName);

  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  return runDir;
}

/**
 * Create a scenario-specific directory within a run
 * @param {string} runDir - Path to the run directory
 * @param {string} testId - Test ID (e.g., 'AGENTIC-001')
 * @returns {string} Path to the scenario directory
 */
function createScenarioDirectory(runDir, testId) {
  const scenarioDir = path.join(runDir, testId);
  if (!fs.existsSync(scenarioDir)) {
    fs.mkdirSync(scenarioDir, { recursive: true });
  }
  return scenarioDir;
}

/**
 * Generate a screenshot filename for a test step
 * @param {number} stepIndex - Zero-based step index
 * @param {string} stepName - Human-readable step name
 * @param {boolean} [failed=false] - Whether the step failed
 * @returns {string} Filename like 'step-1-navigate.png' or 'step-1-navigate_FAILED.png'
 */
function getScreenshotFilename(stepIndex, stepName, failed) {
  const slug = stepName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffix = failed ? '_FAILED' : '';
  return `step-${stepIndex + 1}-${slug}${suffix}.png`;
}

/**
 * Save a step result to the scenario directory
 * @param {string} scenarioDir - Path to the scenario directory
 * @param {object} stepResult - Step execution result
 * @param {number} stepResult.index - Zero-based step index
 * @param {string} stepResult.name - Step name
 * @param {'passed'|'failed'|'skipped'} stepResult.status - Step status
 * @param {number} stepResult.duration_ms - Step duration in milliseconds
 * @param {string} [stepResult.screenshot] - Screenshot filename (if captured)
 * @param {string} [stepResult.error] - Error message (if failed)
 * @param {'timeout'|'assertion'|'agent_error'|'infrastructure'} [stepResult.error_type] - Error classification
 */
function saveStepResult(scenarioDir, stepResult) {
  const resultsPath = path.join(scenarioDir, 'results.json');
  let results = { steps: [] };

  if (fs.existsSync(resultsPath)) {
    try {
      results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    } catch {
      results = { steps: [] };
    }
  }

  results.steps.push(stepResult);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
}

/**
 * Save complete scenario results
 * @param {string} scenarioDir - Path to the scenario directory
 * @param {object} scenarioResult - Complete scenario result
 * @param {string} scenarioResult.test_id - Test ID
 * @param {string} [scenarioResult.story_id] - Associated story ID
 * @param {string} scenarioResult.name - Scenario name
 * @param {string} scenarioResult.timestamp - ISO timestamp
 * @param {'validated'|'warning'|'failed'} scenarioResult.status - Overall status
 * @param {number} scenarioResult.pass_rate - Pass rate (0-1)
 * @param {number} scenarioResult.attempts - Total attempts
 * @param {number} scenarioResult.successful_attempts - Successful attempts
 * @param {Array} scenarioResult.steps - Step results array
 */
function saveScenarioResult(scenarioDir, scenarioResult) {
  const resultsPath = path.join(scenarioDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(scenarioResult, null, 2));
}

/**
 * Save aggregated run summary across all scenarios
 * @param {string} runDir - Path to the run directory
 * @param {object} summary - Run summary
 * @param {string} summary.timestamp - ISO timestamp
 * @param {number} summary.total_scenarios - Total scenarios executed
 * @param {number} summary.validated - Scenarios that passed (>=80%)
 * @param {number} summary.warnings - Scenarios with warnings (70-79%)
 * @param {number} summary.failed - Scenarios that failed (<70%)
 * @param {Array} summary.scenarios - Individual scenario results
 */
function saveRunSummary(runDir, summary) {
  const summaryPath = path.join(runDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}

/**
 * Load a run summary
 * @param {string} runDir - Path to the run directory
 * @returns {object|null} Run summary or null if not found
 */
function loadRunSummary(runDir) {
  const summaryPath = path.join(runDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * List all test runs, sorted by newest first
 * @param {string} projectRoot - Project root directory
 * @returns {Array<{ dir: string, timestamp: string, summary: object|null }>}
 */
function listRuns(projectRoot) {
  const runsDir = path.join(getBaseDir(projectRoot), RUNS_DIR);
  if (!fs.existsSync(runsDir)) return [];

  return fs
    .readdirSync(runsDir)
    .filter(name => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse()
    .map(name => {
      const dir = path.join(runsDir, name);
      return {
        dir,
        timestamp: name,
        summary: loadRunSummary(dir),
      };
    });
}

/**
 * List available YAML test specs
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} Array of spec file paths
 */
function listSpecs(projectRoot) {
  const specsDir = path.join(getBaseDir(projectRoot), SPECS_DIR);
  if (!fs.existsSync(specsDir)) return [];

  const specs = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        specs.push(fullPath);
      }
    }
  }
  walk(specsDir);
  return specs;
}

/**
 * Clean up old test runs beyond the retention period
 * @param {string} projectRoot - Project root directory
 * @param {number} [retentionDays=30] - Number of days to retain evidence
 * @returns {{ removed: number, kept: number, errors: string[] }}
 */
function cleanupOldRuns(projectRoot, retentionDays) {
  const days = retentionDays || DEFAULT_RETENTION_DAYS;
  const runsDir = path.join(getBaseDir(projectRoot), RUNS_DIR);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const result = { removed: 0, kept: 0, errors: [] };

  if (!fs.existsSync(runsDir)) return result;

  const entries = fs.readdirSync(runsDir);
  for (const name of entries) {
    if (!/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name)) continue;

    const runDate = parseTimestamp(name);
    if (!runDate) {
      result.errors.push(`Invalid timestamp format: ${name}`);
      continue;
    }

    if (runDate < cutoff) {
      const runDir = path.join(runsDir, name);
      try {
        fs.rmSync(runDir, { recursive: true, force: true });
        result.removed++;
      } catch (err) {
        result.errors.push(`Failed to remove ${name}: ${err.message}`);
      }
    } else {
      result.kept++;
    }
  }

  return result;
}

/**
 * Calculate pass rate from multiple attempt results
 * @param {number} successful - Number of successful attempts
 * @param {number} total - Total attempts
 * @returns {number} Pass rate between 0 and 1
 */
function calculatePassRate(successful, total) {
  if (total === 0) return 0;
  return successful / total;
}

/**
 * Classify a pass rate into a status
 * @param {number} passRate - Pass rate between 0 and 1
 * @param {number} [threshold=0.80] - Validation threshold
 * @returns {'validated'|'warning'|'failed'}
 */
function classifyPassRate(passRate, threshold) {
  const t = threshold || 0.8;
  // Use integer math to avoid floating point precision issues
  const rate = Math.round(passRate * 1000);
  const thresh = Math.round(t * 1000);
  if (rate >= thresh) return 'validated';
  if (rate >= thresh - 100) return 'warning';
  return 'failed';
}

/**
 * Classify an error for retry decisions
 * @param {Error|string} error - The error that occurred
 * @returns {'timeout'|'assertion'|'agent_error'|'infrastructure'}
 */
function classifyError(error) {
  const msg = typeof error === 'string' ? error : error.message || '';
  const lower = msg.toLowerCase();

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('navigation timeout')
  ) {
    return 'timeout';
  }
  // Check infrastructure before assertion - "unexpectedly" contains "expect"
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('browser') ||
    lower.includes('chromium')
  ) {
    return 'infrastructure';
  }
  if (
    lower.includes('assert') ||
    lower.includes('expected') ||
    lower.includes('not found') ||
    lower.includes('mismatch')
  ) {
    return 'assertion';
  }
  return 'agent_error';
}

/**
 * Determine if an error type is retryable
 * @param {'timeout'|'assertion'|'agent_error'|'infrastructure'} errorType
 * @returns {boolean}
 */
function isRetryable(errorType) {
  return errorType === 'timeout' || errorType === 'agent_error';
}

// --- Internal helpers ---

function formatTimestamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    '-',
    pad(date.getMinutes()),
    '-',
    pad(date.getSeconds()),
  ].join('');
}

function parseTimestamp(str) {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(
    parseInt(match[1]),
    parseInt(match[2]) - 1,
    parseInt(match[3]),
    parseInt(match[4]),
    parseInt(match[5]),
    parseInt(match[6])
  );
}

module.exports = {
  getBaseDir,
  ensureDirectoryStructure,
  createRunDirectory,
  createScenarioDirectory,
  getScreenshotFilename,
  saveStepResult,
  saveScenarioResult,
  saveRunSummary,
  loadRunSummary,
  listRuns,
  listSpecs,
  cleanupOldRuns,
  calculatePassRate,
  classifyPassRate,
  classifyError,
  isRetryable,
  // Constants
  UI_REVIEW_DIR,
  DEFAULT_RETENTION_DAYS,
};
