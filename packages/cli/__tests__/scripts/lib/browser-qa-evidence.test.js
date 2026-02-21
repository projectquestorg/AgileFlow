/**
 * Tests for browser-qa-evidence.js
 *
 * Tests screenshot evidence trail management including directory creation,
 * result storage, retention cleanup, and error classification.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
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
  UI_REVIEW_DIR,
  DEFAULT_RETENTION_DAYS,
} = require('../../../scripts/lib/browser-qa-evidence');

describe('browser-qa-evidence', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bqa-evidence-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getBaseDir', () => {
    it('returns correct base directory path', () => {
      const result = getBaseDir('/project');
      expect(result).toBe('/project/.agileflow/ui-review');
    });
  });

  describe('ensureDirectoryStructure', () => {
    it('creates all required directories', () => {
      const dirs = ensureDirectoryStructure(tempDir);

      expect(fs.existsSync(dirs.base)).toBe(true);
      expect(fs.existsSync(dirs.runs)).toBe(true);
      expect(fs.existsSync(dirs.specs)).toBe(true);
      expect(fs.existsSync(dirs.baselines)).toBe(true);
    });

    it('is idempotent', () => {
      ensureDirectoryStructure(tempDir);
      const dirs = ensureDirectoryStructure(tempDir);

      expect(fs.existsSync(dirs.base)).toBe(true);
      expect(fs.existsSync(dirs.runs)).toBe(true);
    });
  });

  describe('createRunDirectory', () => {
    it('creates a timestamped run directory', () => {
      const ts = new Date(2026, 1, 16, 14, 30, 0); // 2026-02-16 14:30:00
      const runDir = createRunDirectory(tempDir, ts);

      expect(runDir).toContain('2026-02-16_14-30-00');
      expect(fs.existsSync(runDir)).toBe(true);
    });

    it('creates run directory with current timestamp when none provided', () => {
      const runDir = createRunDirectory(tempDir);

      expect(fs.existsSync(runDir)).toBe(true);
      // Should match YYYY-MM-DD_HH-MM-SS pattern
      const dirName = path.basename(runDir);
      expect(dirName).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });

    it('is idempotent for same timestamp', () => {
      const ts = new Date(2026, 1, 16, 14, 30, 0);
      const dir1 = createRunDirectory(tempDir, ts);
      const dir2 = createRunDirectory(tempDir, ts);

      expect(dir1).toBe(dir2);
    });
  });

  describe('createScenarioDirectory', () => {
    it('creates a scenario subdirectory within a run', () => {
      const runDir = createRunDirectory(tempDir);
      const scenarioDir = createScenarioDirectory(runDir, 'AGENTIC-001');

      expect(fs.existsSync(scenarioDir)).toBe(true);
      expect(path.basename(scenarioDir)).toBe('AGENTIC-001');
    });
  });

  describe('getScreenshotFilename', () => {
    it('generates filename from step index and name', () => {
      const filename = getScreenshotFilename(0, 'Navigate to login page');
      expect(filename).toBe('step-1-navigate-to-login-page.png');
    });

    it('adds _FAILED suffix for failed steps', () => {
      const filename = getScreenshotFilename(2, 'Click submit', true);
      expect(filename).toBe('step-3-click-submit_FAILED.png');
    });

    it('truncates long step names', () => {
      const longName = 'a'.repeat(100);
      const filename = getScreenshotFilename(0, longName);
      expect(filename.length).toBeLessThan(60);
    });

    it('sanitizes special characters', () => {
      const filename = getScreenshotFilename(0, "Fill user's email & password!");
      expect(filename).toBe('step-1-fill-user-s-email-password.png');
    });
  });

  describe('saveStepResult / saveScenarioResult', () => {
    it('saves step results incrementally', () => {
      const runDir = createRunDirectory(tempDir);
      const scenarioDir = createScenarioDirectory(runDir, 'AGENTIC-001');

      saveStepResult(scenarioDir, {
        index: 0,
        name: 'Navigate',
        status: 'passed',
        duration_ms: 1200,
      });

      saveStepResult(scenarioDir, {
        index: 1,
        name: 'Click',
        status: 'failed',
        duration_ms: 500,
        error: 'Element not found',
        error_type: 'assertion',
      });

      const results = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'results.json'), 'utf-8'));

      expect(results.steps).toHaveLength(2);
      expect(results.steps[0].status).toBe('passed');
      expect(results.steps[1].status).toBe('failed');
      expect(results.steps[1].error_type).toBe('assertion');
    });

    it('saves complete scenario result', () => {
      const runDir = createRunDirectory(tempDir);
      const scenarioDir = createScenarioDirectory(runDir, 'AGENTIC-001');

      const scenarioResult = {
        test_id: 'AGENTIC-001',
        story_id: 'US-0050',
        name: 'Login Flow',
        timestamp: '2026-02-16T14:30:00Z',
        status: 'validated',
        pass_rate: 0.87,
        attempts: 3,
        successful_attempts: 3,
        steps: [{ name: 'Navigate', status: 'passed', duration_ms: 1200 }],
      };

      saveScenarioResult(scenarioDir, scenarioResult);

      const saved = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'results.json'), 'utf-8'));

      expect(saved.test_id).toBe('AGENTIC-001');
      expect(saved.pass_rate).toBe(0.87);
      expect(saved.status).toBe('validated');
    });
  });

  describe('saveRunSummary / loadRunSummary', () => {
    it('saves and loads run summary', () => {
      const runDir = createRunDirectory(tempDir);

      const summary = {
        timestamp: '2026-02-16T14:30:00Z',
        total_scenarios: 3,
        validated: 2,
        warnings: 1,
        failed: 0,
        scenarios: [],
      };

      saveRunSummary(runDir, summary);
      const loaded = loadRunSummary(runDir);

      expect(loaded.total_scenarios).toBe(3);
      expect(loaded.validated).toBe(2);
    });

    it('returns null for missing summary', () => {
      const result = loadRunSummary('/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('lists runs sorted newest first', () => {
      const ts1 = new Date(2026, 1, 15, 10, 0, 0);
      const ts2 = new Date(2026, 1, 16, 10, 0, 0);

      createRunDirectory(tempDir, ts1);
      createRunDirectory(tempDir, ts2);

      const runs = listRuns(tempDir);

      expect(runs).toHaveLength(2);
      expect(runs[0].timestamp).toContain('2026-02-16');
      expect(runs[1].timestamp).toContain('2026-02-15');
    });

    it('returns empty array when no runs exist', () => {
      const runs = listRuns(tempDir);
      expect(runs).toEqual([]);
    });

    it('ignores non-timestamp directories', () => {
      ensureDirectoryStructure(tempDir);
      const runsDir = path.join(tempDir, UI_REVIEW_DIR, 'runs');
      fs.mkdirSync(path.join(runsDir, 'not-a-timestamp'));

      const runs = listRuns(tempDir);
      expect(runs).toHaveLength(0);
    });
  });

  describe('listSpecs', () => {
    it('lists YAML spec files', () => {
      const dirs = ensureDirectoryStructure(tempDir);
      fs.writeFileSync(path.join(dirs.specs, 'login.yaml'), 'test: true');
      fs.writeFileSync(path.join(dirs.specs, 'signup.yml'), 'test: true');

      const specs = listSpecs(tempDir);
      expect(specs).toHaveLength(2);
    });

    it('finds specs in subdirectories', () => {
      const dirs = ensureDirectoryStructure(tempDir);
      const subdir = path.join(dirs.specs, 'auth');
      fs.mkdirSync(subdir);
      fs.writeFileSync(path.join(subdir, 'login.yaml'), 'test: true');

      const specs = listSpecs(tempDir);
      expect(specs).toHaveLength(1);
      expect(specs[0]).toContain('auth');
    });

    it('returns empty array when no specs exist', () => {
      const specs = listSpecs(tempDir);
      expect(specs).toEqual([]);
    });
  });

  describe('cleanupOldRuns', () => {
    it('removes runs older than retention period', () => {
      ensureDirectoryStructure(tempDir);
      const runsDir = path.join(tempDir, UI_REVIEW_DIR, 'runs');

      // Create an old run (45 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      const oldDirName = formatDate(oldDate);
      fs.mkdirSync(path.join(runsDir, oldDirName));

      // Create a recent run
      const recentDir = createRunDirectory(tempDir);

      const result = cleanupOldRuns(tempDir, 30);

      expect(result.removed).toBe(1);
      expect(result.kept).toBe(1);
      expect(fs.existsSync(recentDir)).toBe(true);
    });

    it('handles missing runs directory gracefully', () => {
      const result = cleanupOldRuns(tempDir, 30);
      expect(result.removed).toBe(0);
      expect(result.kept).toBe(0);
    });

    it('uses default retention of 30 days', () => {
      expect(DEFAULT_RETENTION_DAYS).toBe(30);
    });
  });

  describe('calculatePassRate', () => {
    it('calculates correct pass rate', () => {
      expect(calculatePassRate(8, 10)).toBe(0.8);
      expect(calculatePassRate(3, 3)).toBe(1);
      expect(calculatePassRate(0, 5)).toBe(0);
    });

    it('returns 0 for zero total', () => {
      expect(calculatePassRate(0, 0)).toBe(0);
    });
  });

  describe('classifyPassRate', () => {
    it('classifies validated (>=80%)', () => {
      expect(classifyPassRate(0.87)).toBe('validated');
      expect(classifyPassRate(0.8)).toBe('validated');
      expect(classifyPassRate(1.0)).toBe('validated');
    });

    it('classifies warning (70-79%)', () => {
      expect(classifyPassRate(0.75)).toBe('warning');
      expect(classifyPassRate(0.7)).toBe('warning');
    });

    it('classifies failed (<70%)', () => {
      expect(classifyPassRate(0.69)).toBe('failed');
      expect(classifyPassRate(0.5)).toBe('failed');
      expect(classifyPassRate(0)).toBe('failed');
    });

    it('supports custom threshold', () => {
      expect(classifyPassRate(0.85, 0.9)).toBe('warning');
      expect(classifyPassRate(0.95, 0.9)).toBe('validated');
    });
  });

  describe('classifyError', () => {
    it('classifies timeout errors', () => {
      expect(classifyError('Navigation timeout exceeded')).toBe('timeout');
      expect(classifyError('Timed out waiting for selector')).toBe('timeout');
      expect(classifyError(new Error('timeout 30s'))).toBe('timeout');
    });

    it('classifies assertion errors', () => {
      expect(classifyError('Assert: expected text not found')).toBe('assertion');
      expect(classifyError('Element mismatch')).toBe('assertion');
      expect(classifyError('Expected value missing')).toBe('assertion');
    });

    it('classifies infrastructure errors', () => {
      expect(classifyError('ECONNREFUSED 127.0.0.1:3000')).toBe('infrastructure');
      expect(classifyError('Browser closed unexpectedly')).toBe('infrastructure');
      expect(classifyError('Chromium not found')).toBe('infrastructure');
    });

    it('defaults to agent_error for unknown errors', () => {
      expect(classifyError('Something went wrong')).toBe('agent_error');
      expect(classifyError('')).toBe('agent_error');
    });
  });

  describe('isRetryable', () => {
    it('timeouts are retryable', () => {
      expect(isRetryable('timeout')).toBe(true);
    });

    it('agent errors are retryable', () => {
      expect(isRetryable('agent_error')).toBe(true);
    });

    it('assertions are not retryable', () => {
      expect(isRetryable('assertion')).toBe(false);
    });

    it('infrastructure errors are not retryable', () => {
      expect(isRetryable('infrastructure')).toBe(false);
    });
  });
});

// Helper to format a date like the module does internally
function formatDate(date) {
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
