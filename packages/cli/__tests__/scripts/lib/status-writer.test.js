/**
 * Tests for scripts/lib/status-writer.js
 *
 * Covers all 4 acceptance criteria for US-0349:
 * AC1: Single code path — updateStory() uses atomic writes
 * AC2: Cross-module consistency — write via one module, read via another
 * AC3: Mode-agnostic — no mode-specific fields in status.json
 * AC4: Dependency resolution — resolveDependencies() unblocks stories
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getStatusPath: jest.fn(root => `${root || '/test/project'}/docs/09-agents/status.json`),
  getSessionStatePath: jest.fn(
    root => `${root || '/test/project'}/docs/09-agents/session-state.json`
  ),
  getMetadataPath: jest.fn(
    root => `${root || '/test/project'}/docs/00-meta/agileflow-metadata.json`
  ),
}));

describe('status-writer.js', () => {
  let testDir;
  let statusWriter;
  let statusPath;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-status-writer-test-'));
    fs.mkdirSync(path.join(testDir, 'docs', '09-agents'), { recursive: true });
    statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');

    // Reset require caches
    delete require.cache[require.resolve('../../../scripts/lib/status-writer')];
    delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
    statusWriter = require('../../../scripts/lib/status-writer');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Helper to write status.json
  function writeStatus(data) {
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
  }

  // Helper to read status.json
  function readStatus() {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  }

  // ========================================================================
  // AC1: Single code path — updateStory() uses atomic writes
  // ========================================================================
  describe('AC1: updateStory() atomic writes', () => {
    test('updates a story field atomically', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      const result = statusWriter.updateStory(testDir, 'US-0001', { status: 'in_progress' });

      expect(result.ok).toBe(true);
      const data = readStatus();
      expect(data.stories['US-0001'].status).toBe('in_progress');
    });

    test('applies multiple field updates', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready', assigned_to: null },
        },
      });

      const result = statusWriter.updateStory(testDir, 'US-0001', {
        status: 'in_progress',
        assigned_to: 'AG-API',
      });

      expect(result.ok).toBe(true);
      const data = readStatus();
      expect(data.stories['US-0001'].status).toBe('in_progress');
      expect(data.stories['US-0001'].assigned_to).toBe('AG-API');
    });

    test('sets updated_at timestamp', () => {
      writeStatus({
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test',
            status: 'ready',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
      });

      const before = new Date();
      statusWriter.updateStory(testDir, 'US-0001', { status: 'in_progress' });

      const data = readStatus();
      const updatedAt = new Date(data.stories['US-0001'].updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    test('returns error when status.json not found', () => {
      const result = statusWriter.updateStory(testDir, 'US-0001', { status: 'in_progress' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('returns error when story not found', () => {
      writeStatus({ stories: {} });

      const result = statusWriter.updateStory(testDir, 'US-9999', { status: 'in_progress' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('US-9999');
    });

    test('validates state transitions', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      // ready → completed is invalid (must go through in_progress → in_review → completed)
      const result = statusWriter.updateStory(testDir, 'US-0001', { status: 'completed' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    test('skips validation when skipValidation=true', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      const result = statusWriter.updateStory(
        testDir,
        'US-0001',
        { status: 'completed' },
        { skipValidation: true }
      );
      expect(result.ok).toBe(true);

      const data = readStatus();
      expect(data.stories['US-0001'].status).toBe('completed');
    });

    test('deletes field when update value is null', () => {
      writeStatus({
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test',
            status: 'in_progress',
            claimed_by: { session_id: '1', pid: 1234 },
          },
        },
      });

      const result = statusWriter.updateStory(
        testDir,
        'US-0001',
        { claimed_by: null },
        { skipValidation: true }
      );

      expect(result.ok).toBe(true);
      const data = readStatus();
      expect(data.stories['US-0001'].claimed_by).toBeUndefined();
      expect(data.stories['US-0001'].status).toBe('in_progress');
    });

    test('deletes multiple fields when values are null', () => {
      writeStatus({
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test',
            status: 'in_progress',
            claimed_by: { session_id: '1' },
            assigned_to: 'AG-API',
          },
        },
      });

      const result = statusWriter.updateStory(
        testDir,
        'US-0001',
        {
          claimed_by: null,
          assigned_to: null,
        },
        { skipValidation: true }
      );

      expect(result.ok).toBe(true);
      const data = readStatus();
      expect(data.stories['US-0001'].claimed_by).toBeUndefined();
      expect(data.stories['US-0001'].assigned_to).toBeUndefined();
    });

    test('mixes null deletions with regular updates', () => {
      writeStatus({
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test',
            status: 'in_progress',
            claimed_by: { session_id: '1' },
          },
        },
      });

      const result = statusWriter.updateStory(
        testDir,
        'US-0001',
        {
          claimed_by: null,
          assigned_to: 'AG-UI',
        },
        { skipValidation: true }
      );

      expect(result.ok).toBe(true);
      const data = readStatus();
      expect(data.stories['US-0001'].claimed_by).toBeUndefined();
      expect(data.stories['US-0001'].assigned_to).toBe('AG-UI');
    });

    test('syncToStatus and direct updateStory produce same result', () => {
      // Write two identical status files and update via different paths
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      // Direct updateStory
      statusWriter.updateStory(testDir, 'US-0001', { status: 'in_progress' });
      const directResult = readStatus();

      // Reset and use syncToStatus (which delegates to updateStory)
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
      const taskSync = require('../../../scripts/lib/task-sync');
      taskSync.syncToStatus(testDir, 'US-0001', { status: 'in_progress' });
      const syncResult = readStatus();

      // Same status
      expect(directResult.stories['US-0001'].status).toBe(syncResult.stories['US-0001'].status);
      expect(directResult.stories['US-0001'].status).toBe('in_progress');
    });
  });

  // ========================================================================
  // AC2: Cross-module consistency — write via one, read via another
  // ========================================================================
  describe('AC2: cross-module consistency', () => {
    test('write via updateStory, read via readStory — data consistent', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'in_progress' },
        },
      });

      statusWriter.updateStory(testDir, 'US-0001', { status: 'in_review' });

      const read = statusWriter.readStory(testDir, 'US-0001');
      expect(read.ok).toBe(true);
      expect(read.story.status).toBe('in_review');
    });

    test('write via updateStory, read via fs.readFileSync — consistent', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      statusWriter.updateStory(testDir, 'US-0001', { status: 'in_progress' });

      const rawData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(rawData.stories['US-0001'].status).toBe('in_progress');
    });

    test('write via task-sync reconcile, read via readStory — consistent', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
      const taskSync = require('../../../scripts/lib/task-sync');

      taskSync.reconcile(testDir, [
        {
          id: 'task-1',
          status: 'in_progress',
          metadata: { story_id: 'US-0001' },
        },
      ]);

      const read = statusWriter.readStory(testDir, 'US-0001');
      expect(read.ok).toBe(true);
      expect(read.story.status).toBe('in_progress');
    });
  });

  // ========================================================================
  // AC3: Mode-agnostic — no mode-specific fields
  // ========================================================================
  describe('AC3: mode-agnostic data', () => {
    test('write from "native" reconcile has no mode field', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
      const taskSync = require('../../../scripts/lib/task-sync');

      taskSync.reconcile(testDir, [
        {
          id: 'task-1',
          status: 'completed',
          metadata: { story_id: 'US-0001', mode: 'native' },
        },
      ]);

      const data = readStatus();
      const story = data.stories['US-0001'];

      // No mode-specific fields in the story
      expect(story.mode).toBeUndefined();
      expect(story.orchestration_mode).toBeUndefined();
      expect(story.native_task_id).toBeUndefined();
    });

    test('write from "subagent" syncToStatus has no mode field', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
      const taskSync = require('../../../scripts/lib/task-sync');

      taskSync.syncToStatus(testDir, 'US-0001', { status: 'in_progress' });

      const data = readStatus();
      const story = data.stories['US-0001'];

      expect(story.mode).toBeUndefined();
      expect(story.orchestration_mode).toBeUndefined();
    });

    test('data written by native reconcile is identical to subagent syncToStatus', () => {
      // Native reconcile
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
      const taskSync1 = require('../../../scripts/lib/task-sync');
      taskSync1.reconcile(testDir, [
        {
          id: 'task-1',
          status: 'in_progress',
          metadata: { story_id: 'US-0001' },
        },
      ]);
      const nativeData = readStatus();

      // Subagent syncToStatus
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      delete require.cache[require.resolve('../../../scripts/lib/task-sync')];
      const taskSync2 = require('../../../scripts/lib/task-sync');
      taskSync2.syncToStatus(testDir, 'US-0001', { status: 'in_progress' });
      const subagentData = readStatus();

      // Both should have the same status - mode-agnostic
      expect(nativeData.stories['US-0001'].status).toBe(subagentData.stories['US-0001'].status);
      expect(nativeData.stories['US-0001'].status).toBe('in_progress');
    });
  });

  // ========================================================================
  // AC4: Dependency resolution
  // ========================================================================
  describe('AC4: resolveDependencies()', () => {
    test('unblocks story when single dependency completes', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'blocked', depends_on: ['US-0001'] },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).toContain('US-0002');
      expect(data.stories['US-0002'].status).toBe('ready');
    });

    test('does NOT unblock when partial multi-dep (one still incomplete)', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'in_progress' },
          'US-0003': { id: 'US-0003', status: 'blocked', depends_on: ['US-0001', 'US-0002'] },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).not.toContain('US-0003');
      expect(data.stories['US-0003'].status).toBe('blocked');
    });

    test('unblocks when all multi-deps are met', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'completed' },
          'US-0003': { id: 'US-0003', status: 'blocked', depends_on: ['US-0001', 'US-0002'] },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0002');

      expect(result.unblocked).toContain('US-0003');
      expect(data.stories['US-0003'].status).toBe('ready');
    });

    test('ignores non-blocked stories', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'in_progress', depends_on: ['US-0001'] },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).toHaveLength(0);
      // Status unchanged since it's not blocked
      expect(data.stories['US-0002'].status).toBe('in_progress');
    });

    test('treats "done" as equivalent to "completed"', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'done' },
          'US-0002': { id: 'US-0002', status: 'blocked', depends_on: ['US-0001'] },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).toContain('US-0002');
      expect(data.stories['US-0002'].status).toBe('ready');
    });

    test('handles blocked_by field (alternative to depends_on)', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'blocked', blocked_by: ['US-0001'] },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).toContain('US-0002');
      expect(data.stories['US-0002'].status).toBe('ready');
    });

    test('handles mixed depends_on and blocked_by fields', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'completed' },
          'US-0003': {
            id: 'US-0003',
            status: 'blocked',
            depends_on: ['US-0001'],
            blocked_by: ['US-0002'],
          },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).toContain('US-0003');
      expect(data.stories['US-0003'].status).toBe('ready');
    });

    test('returns empty when no stories have dependencies', () => {
      const data = {
        stories: {
          'US-0001': { id: 'US-0001', status: 'completed' },
          'US-0002': { id: 'US-0002', status: 'blocked' },
        },
      };

      const result = statusWriter.resolveDependencies(data, 'US-0001');

      expect(result.unblocked).toHaveLength(0);
    });

    test('handles null/undefined data gracefully', () => {
      expect(statusWriter.resolveDependencies(null, 'US-0001')).toEqual({ unblocked: [] });
      expect(statusWriter.resolveDependencies({}, 'US-0001')).toEqual({ unblocked: [] });
    });

    test('updateStory triggers resolveDependencies on completion', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', status: 'in_review' },
          'US-0002': { id: 'US-0002', status: 'blocked', depends_on: ['US-0001'] },
        },
      });

      const result = statusWriter.updateStory(testDir, 'US-0001', { status: 'completed' });

      expect(result.ok).toBe(true);
      expect(result.unblocked).toContain('US-0002');

      const data = readStatus();
      expect(data.stories['US-0001'].status).toBe('completed');
      expect(data.stories['US-0002'].status).toBe('ready');
    });
  });

  // ========================================================================
  // readStory()
  // ========================================================================
  describe('readStory()', () => {
    test('reads a story successfully', () => {
      writeStatus({
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      });

      const result = statusWriter.readStory(testDir, 'US-0001');
      expect(result.ok).toBe(true);
      expect(result.story.title).toBe('Test');
    });

    test('returns error for missing story', () => {
      writeStatus({ stories: {} });

      const result = statusWriter.readStory(testDir, 'US-9999');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('US-9999');
    });

    test('returns error for missing file', () => {
      const result = statusWriter.readStory(testDir, 'US-0001');
      expect(result.ok).toBe(false);
    });
  });
});
