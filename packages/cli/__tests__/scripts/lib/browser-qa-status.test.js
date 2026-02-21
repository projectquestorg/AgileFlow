/**
 * Tests for browser-qa-status.js
 *
 * Tests agentic test status integration with status.json including
 * single and batch updates, reading status, and summary generation.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  updateAgenticTestStatus,
  getAgenticTestStatus,
  updateBatchAgenticStatus,
  getAgenticTestSummary,
  readStatusJson,
  writeStatusJson,
  STATUS_FILE,
} = require('../../../scripts/lib/browser-qa-status');

describe('browser-qa-status', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bqa-status-test-'));
    // Create the docs/09-agents directory structure
    const statusDir = path.join(tempDir, 'docs', '09-agents');
    fs.mkdirSync(statusDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTestStatus(stories = {}, epics = {}) {
    const data = {
      updated: new Date().toISOString(),
      epics,
      stories,
    };
    const statusPath = path.join(tempDir, STATUS_FILE);
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2));
    return data;
  }

  describe('readStatusJson / writeStatusJson', () => {
    it('reads status.json correctly', () => {
      writeTestStatus({ 'US-0001': { title: 'Test', status: 'complete' } });
      const result = readStatusJson(tempDir);

      expect(result).not.toBeNull();
      expect(result.stories['US-0001'].title).toBe('Test');
    });

    it('returns null for missing file', () => {
      const result = readStatusJson('/nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const statusPath = path.join(tempDir, STATUS_FILE);
      fs.writeFileSync(statusPath, 'not json');
      const result = readStatusJson(tempDir);
      expect(result).toBeNull();
    });

    it('writes and updates timestamp', () => {
      writeTestStatus({});
      const data = readStatusJson(tempDir);
      data.stories = { 'US-0001': { title: 'New' } };

      const success = writeStatusJson(tempDir, data);
      expect(success).toBe(true);

      const reread = readStatusJson(tempDir);
      expect(reread.stories['US-0001'].title).toBe('New');
      expect(reread.updated).toBeDefined();
    });
  });

  describe('updateAgenticTestStatus', () => {
    it('updates a story with agentic test status', () => {
      writeTestStatus({
        'US-0050': {
          title: 'Login Flow',
          status: 'complete',
          test_status: 'passing',
        },
      });

      const success = updateAgenticTestStatus(tempDir, 'US-0050', {
        status: 'validated',
        pass_rate: 0.87,
        scenarios_run: 3,
        last_run: '2026-02-16T14:30:00Z',
        evidence_path: '.agileflow/ui-review/runs/2026-02-16_14-30-00/',
      });

      expect(success).toBe(true);

      const status = readStatusJson(tempDir);
      expect(status.stories['US-0050'].agentic_test_status).toBe('validated');
      expect(status.stories['US-0050'].agentic_test_details.pass_rate).toBe(0.87);
      // Original test_status should be unchanged
      expect(status.stories['US-0050'].test_status).toBe('passing');
    });

    it('returns false for non-existent story', () => {
      writeTestStatus({});
      const success = updateAgenticTestStatus(tempDir, 'US-9999', {
        status: 'validated',
        pass_rate: 0.9,
        scenarios_run: 1,
        last_run: '2026-02-16T14:30:00Z',
        evidence_path: 'path/',
      });

      expect(success).toBe(false);
    });

    it('returns false for missing status.json', () => {
      const success = updateAgenticTestStatus('/nonexistent', 'US-0050', {
        status: 'validated',
        pass_rate: 0.9,
        scenarios_run: 1,
        last_run: '2026-02-16T14:30:00Z',
        evidence_path: 'path/',
      });

      expect(success).toBe(false);
    });
  });

  describe('getAgenticTestStatus', () => {
    it('returns agentic test status for a story', () => {
      writeTestStatus({
        'US-0050': {
          title: 'Login Flow',
          status: 'complete',
          agentic_test_status: 'validated',
          agentic_test_details: {
            pass_rate: 0.87,
            scenarios_run: 3,
            last_run: '2026-02-16T14:30:00Z',
            evidence_path: 'path/',
          },
        },
      });

      const result = getAgenticTestStatus(tempDir, 'US-0050');

      expect(result.status).toBe('validated');
      expect(result.details.pass_rate).toBe(0.87);
    });

    it('returns not_run for stories without agentic tests', () => {
      writeTestStatus({
        'US-0050': { title: 'Login Flow', status: 'complete' },
      });

      const result = getAgenticTestStatus(tempDir, 'US-0050');
      expect(result.status).toBe('not_run');
      expect(result.details).toBeNull();
    });

    it('returns null for non-existent story', () => {
      writeTestStatus({});
      const result = getAgenticTestStatus(tempDir, 'US-9999');
      expect(result).toBeNull();
    });
  });

  describe('updateBatchAgenticStatus', () => {
    it('updates multiple stories from scenario results', () => {
      writeTestStatus({
        'US-0050': { title: 'Login', status: 'complete' },
        'US-0051': { title: 'Signup', status: 'complete' },
      });

      const results = [
        { story_id: 'US-0050', status: 'validated', pass_rate: 0.87 },
        { story_id: 'US-0051', status: 'warning', pass_rate: 0.73 },
      ];

      const outcome = updateBatchAgenticStatus(tempDir, results, 'evidence/path/');

      expect(outcome.updated).toBe(2);
      expect(outcome.skipped).toBe(0);

      const status = readStatusJson(tempDir);
      expect(status.stories['US-0050'].agentic_test_status).toBe('validated');
      expect(status.stories['US-0051'].agentic_test_status).toBe('warning');
    });

    it('skips scenarios without story_id', () => {
      writeTestStatus({
        'US-0050': { title: 'Login', status: 'complete' },
      });

      const results = [
        { story_id: 'US-0050', status: 'validated', pass_rate: 0.87 },
        { status: 'failed', pass_rate: 0.5 }, // no story_id
      ];

      const outcome = updateBatchAgenticStatus(tempDir, results, 'evidence/path/');
      expect(outcome.updated).toBe(1);
      expect(outcome.skipped).toBe(1);
    });

    it('skips non-existent stories', () => {
      writeTestStatus({});

      const results = [{ story_id: 'US-9999', status: 'validated', pass_rate: 0.87 }];

      const outcome = updateBatchAgenticStatus(tempDir, results, 'evidence/path/');
      expect(outcome.updated).toBe(0);
      expect(outcome.skipped).toBe(1);
    });
  });

  describe('getAgenticTestSummary', () => {
    it('summarizes agentic test statuses across all stories', () => {
      writeTestStatus({
        'US-0050': { title: 'A', agentic_test_status: 'validated' },
        'US-0051': { title: 'B', agentic_test_status: 'validated' },
        'US-0052': { title: 'C', agentic_test_status: 'warning' },
        'US-0053': { title: 'D', agentic_test_status: 'failed' },
        'US-0054': { title: 'E' }, // no agentic test
      });

      const summary = getAgenticTestSummary(tempDir);

      expect(summary.total).toBe(5);
      expect(summary.validated).toBe(2);
      expect(summary.warning).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.not_run).toBe(1);
    });

    it('returns zero counts for empty status', () => {
      writeTestStatus({});
      const summary = getAgenticTestSummary(tempDir);

      expect(summary.total).toBe(0);
      expect(summary.validated).toBe(0);
    });

    it('handles missing status.json', () => {
      const summary = getAgenticTestSummary('/nonexistent');
      expect(summary.total).toBe(0);
    });
  });

  describe('STATUS_FILE constant', () => {
    it('points to correct path', () => {
      expect(STATUS_FILE).toBe('docs/09-agents/status.json');
    });
  });
});
