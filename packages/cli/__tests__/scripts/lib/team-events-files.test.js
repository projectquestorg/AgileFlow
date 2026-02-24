/**
 * Tests for file modification tracking per agent (US-0352)
 *
 * Covers:
 * - getModifiedFiles: git diff helper with mocked child_process
 * - aggregateTeamMetrics: files_modified per agent from task_completed events
 * - aggregateTeamMetrics: deduplication across multiple events for same agent
 * - aggregateTeamMetrics: all_files_modified union across agents
 * - aggregateTeamMetrics: missing files_modified defaults to []
 * - aggregateTeamMetrics: empty arrays handled correctly
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

jest.mock('fs');
jest.mock('child_process');
jest.mock('../../../lib/paths');
jest.mock('../../../lib/feature-flags');
jest.mock('../../../scripts/lib/file-lock');
jest.mock('../../../scripts/messaging-bridge');

const { getModifiedFiles, aggregateTeamMetrics } = require('../../../scripts/lib/team-events');
const paths = require('../../../lib/paths');

describe('getModifiedFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sorted file list from git diff output', () => {
    childProcess.execFileSync.mockReturnValue('src/b.js\nsrc/a.js\nREADME.md\n');

    const result = getModifiedFiles('/project', 'abc123');

    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'abc123'],
      expect.objectContaining({ cwd: '/project', encoding: 'utf8' })
    );
    expect(result).toEqual(['README.md', 'src/a.js', 'src/b.js']);
  });

  it('defaults sinceRef to HEAD when not provided', () => {
    childProcess.execFileSync.mockReturnValue('file.txt\n');

    getModifiedFiles('/project');

    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'HEAD'],
      expect.any(Object)
    );
  });

  it('deduplicates repeated file paths', () => {
    childProcess.execFileSync.mockReturnValue('a.js\nb.js\na.js\n');

    const result = getModifiedFiles('/project', 'HEAD');

    expect(result).toEqual(['a.js', 'b.js']);
  });

  it('returns empty array when git diff output is empty', () => {
    childProcess.execFileSync.mockReturnValue('');

    const result = getModifiedFiles('/project', 'HEAD');

    expect(result).toEqual([]);
  });

  it('returns empty array when git diff output is whitespace only', () => {
    childProcess.execFileSync.mockReturnValue('  \n  \n');

    const result = getModifiedFiles('/project', 'HEAD');

    // trim() produces empty string → returns []
    expect(result).toEqual([]);
  });

  it('returns empty array on git error (fail-open)', () => {
    childProcess.execFileSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = getModifiedFiles('/not-a-repo', 'HEAD');

    expect(result).toEqual([]);
  });
});

describe('aggregateTeamMetrics - file tracking', () => {
  const testRootDir = '/home/test/project';
  const sessionStatePath = path.join(testRootDir, 'docs/00-meta/session-state.json');

  beforeEach(() => {
    jest.clearAllMocks();
    paths.getSessionStatePath.mockReturnValue(sessionStatePath);
    fs.existsSync.mockReturnValue(true);
  });

  function mockEvents(events) {
    const state = {
      hook_metrics: {
        teams: { events, summary: {} },
      },
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(state));
  }

  it('collects files_modified from task_completed events per agent', () => {
    const traceId = 'trace-files-1';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'api-builder',
        trace_id: traceId,
        duration_ms: 1000,
        files_modified: ['src/api.js', 'src/models.js'],
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'task_completed',
        agent: 'ui-builder',
        trace_id: traceId,
        duration_ms: 2000,
        files_modified: ['src/App.tsx'],
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['api-builder'].files_modified).toEqual(['src/api.js', 'src/models.js']);
    expect(result.per_agent['ui-builder'].files_modified).toEqual(['src/App.tsx']);
  });

  it('deduplicates files across multiple task_completed events for same agent', () => {
    const traceId = 'trace-files-2';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'api-builder',
        trace_id: traceId,
        duration_ms: 1000,
        files_modified: ['src/api.js', 'src/models.js'],
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'task_completed',
        agent: 'api-builder',
        trace_id: traceId,
        duration_ms: 500,
        files_modified: ['src/api.js', 'src/routes.js'],
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['api-builder'].files_modified).toEqual([
      'src/api.js',
      'src/models.js',
      'src/routes.js',
    ]);
  });

  it('computes all_files_modified as union across all agents', () => {
    const traceId = 'trace-files-3';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'api-builder',
        trace_id: traceId,
        duration_ms: 1000,
        files_modified: ['src/api.js', 'shared/utils.js'],
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'task_completed',
        agent: 'ui-builder',
        trace_id: traceId,
        duration_ms: 2000,
        files_modified: ['src/App.tsx', 'shared/utils.js'],
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.all_files_modified).toEqual(['shared/utils.js', 'src/App.tsx', 'src/api.js']);
  });

  it('defaults files_modified to [] when event has no files_modified field', () => {
    const traceId = 'trace-files-4';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'worker',
        trace_id: traceId,
        duration_ms: 500,
        at: '2026-01-01T00:01:00Z',
        // no files_modified field
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['worker'].files_modified).toEqual([]);
    expect(result.all_files_modified).toEqual([]);
  });

  it('handles empty files_modified arrays correctly', () => {
    const traceId = 'trace-files-5';
    mockEvents([
      {
        type: 'task_completed',
        agent: 'validator',
        trace_id: traceId,
        duration_ms: 300,
        files_modified: [],
        at: '2026-01-01T00:01:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['validator'].files_modified).toEqual([]);
    expect(result.all_files_modified).toEqual([]);
  });

  it('returns empty all_files_modified when no events match', () => {
    mockEvents([]);

    const result = aggregateTeamMetrics(testRootDir, 'trace-empty');

    expect(result.all_files_modified).toEqual([]);
  });

  it('agents with only errors/timeouts have empty files_modified', () => {
    const traceId = 'trace-files-6';
    mockEvents([
      {
        type: 'agent_error',
        agent: 'broken-agent',
        trace_id: traceId,
        at: '2026-01-01T00:01:00Z',
      },
      {
        type: 'agent_timeout',
        agent: 'slow-agent',
        trace_id: traceId,
        at: '2026-01-01T00:02:00Z',
      },
    ]);

    const result = aggregateTeamMetrics(testRootDir, traceId);

    expect(result.per_agent['broken-agent'].files_modified).toEqual([]);
    expect(result.per_agent['slow-agent'].files_modified).toEqual([]);
    expect(result.all_files_modified).toEqual([]);
  });
});
