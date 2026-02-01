/**
 * Tests for session-display.js - Session visualization and health checks
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const {
  getFileDetails,
  getSessionsHealth,
  formatKanbanBoard,
  groupSessionsByPhase,
  renderKanbanBoard,
  renderKanbanBoardAsync,
  formatSessionsTable,
} = require('../../lib/session-display');
const { SESSION_PHASES } = require('../../lib/git-operations');

describe('session-display', () => {
  describe('getFileDetails', () => {
    let testDir;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-details-test-'));
      execSync('git init', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, encoding: 'utf8' });
      execSync('git config user.name "Test"', { cwd: testDir, encoding: 'utf8' });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('parses status and file from git status line', () => {
      const changes = ['M  package.json'];
      const result = getFileDetails(testDir, changes);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('M');
      expect(result[0].file).toBe('package.json');
    });

    it('marks config/cache files as trivial', () => {
      const changes = ['?? .claude/cache/data.json', '?? .agileflow/cache/test.json'];
      const result = getFileDetails(testDir, changes);

      expect(result[0].trivial).toBe(true);
      expect(result[1].trivial).toBe(true);
    });

    it('handles untracked files', () => {
      const changes = ['?? newfile.txt'];
      const result = getFileDetails(testDir, changes);

      expect(result[0].status).toBe('??');
      expect(result[0].file).toBe('newfile.txt');
    });

    it('handles multiple changes', () => {
      const changes = ['M  file1.txt', 'A  file2.txt', '?? file3.txt'];
      const result = getFileDetails(testDir, changes);

      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('M');
      expect(result[1].status).toBe('A');
      expect(result[2].status).toBe('??');
    });
  });

  describe('groupSessionsByPhase', () => {
    it('groups sessions by phase', () => {
      const sessions = [
        { id: '1', phase: SESSION_PHASES.TODO },
        { id: '2', phase: SESSION_PHASES.CODING },
        { id: '3', phase: SESSION_PHASES.CODING },
        { id: '4', phase: SESSION_PHASES.REVIEW },
        { id: '5', phase: SESSION_PHASES.MERGED },
      ];

      const result = groupSessionsByPhase(sessions);

      expect(result[SESSION_PHASES.TODO]).toHaveLength(1);
      expect(result[SESSION_PHASES.CODING]).toHaveLength(2);
      expect(result[SESSION_PHASES.REVIEW]).toHaveLength(1);
      expect(result[SESSION_PHASES.MERGED]).toHaveLength(1);
    });

    it('handles empty sessions array', () => {
      const result = groupSessionsByPhase([]);

      expect(result[SESSION_PHASES.TODO]).toHaveLength(0);
      expect(result[SESSION_PHASES.CODING]).toHaveLength(0);
      expect(result[SESSION_PHASES.REVIEW]).toHaveLength(0);
      expect(result[SESSION_PHASES.MERGED]).toHaveLength(0);
    });

    it('handles all sessions in one phase', () => {
      const sessions = [
        { id: '1', phase: SESSION_PHASES.CODING },
        { id: '2', phase: SESSION_PHASES.CODING },
      ];

      const result = groupSessionsByPhase(sessions);

      expect(result[SESSION_PHASES.CODING]).toHaveLength(2);
      expect(result[SESSION_PHASES.TODO]).toHaveLength(0);
    });
  });

  describe('formatKanbanBoard', () => {
    it('formats board with sessions in each phase', () => {
      const byPhase = {
        [SESSION_PHASES.TODO]: [{ id: '1', nickname: 'todo-task' }],
        [SESSION_PHASES.CODING]: [{ id: '2', nickname: 'coding-task' }],
        [SESSION_PHASES.REVIEW]: [{ id: '3', nickname: 'review-task' }],
        [SESSION_PHASES.MERGED]: [{ id: '4', nickname: 'done-task' }],
      };

      const result = formatKanbanBoard(byPhase);

      expect(result).toContain('Sessions (Kanban View)');
      expect(result).toContain('[1]');
      expect(result).toContain('[2]');
      expect(result).toContain('[3]');
      expect(result).toContain('[4]');
    });

    it('handles empty phases', () => {
      const byPhase = {
        [SESSION_PHASES.TODO]: [],
        [SESSION_PHASES.CODING]: [],
        [SESSION_PHASES.REVIEW]: [],
        [SESSION_PHASES.MERGED]: [],
      };

      const result = formatKanbanBoard(byPhase);

      expect(result).toContain('Sessions (Kanban View)');
      expect(result).toContain('To Do: 0');
      expect(result).toContain('Coding: 0');
    });

    it('includes summary counts', () => {
      const byPhase = {
        [SESSION_PHASES.TODO]: [{ id: '1' }, { id: '2' }],
        [SESSION_PHASES.CODING]: [{ id: '3' }],
        [SESSION_PHASES.REVIEW]: [],
        [SESSION_PHASES.MERGED]: [{ id: '4' }, { id: '5' }, { id: '6' }],
      };

      const result = formatKanbanBoard(byPhase);

      expect(result).toContain('To Do: 2');
      expect(result).toContain('Coding: 1');
      expect(result).toContain('Review: 0');
      expect(result).toContain('Merged: 3');
    });

    it('truncates long nicknames', () => {
      const byPhase = {
        [SESSION_PHASES.TODO]: [{ id: '1', nickname: 'very-long-nickname-that-should-be-truncated' }],
        [SESSION_PHASES.CODING]: [],
        [SESSION_PHASES.REVIEW]: [],
        [SESSION_PHASES.MERGED]: [],
      };

      const result = formatKanbanBoard(byPhase);

      // Should contain truncation indicator
      expect(result).toContain('...');
    });
  });

  describe('formatSessionsTable', () => {
    it('formats sessions as table', () => {
      const sessions = [
        { id: '1', nickname: 'test', branch: 'main', path: '/path/1', active: true, current: false },
        { id: '2', nickname: null, branch: 'feature', path: '/path/2', active: false, current: true },
      ];

      const result = formatSessionsTable(sessions);

      expect(result).toContain('Active Sessions');
      // Session IDs are wrapped with ANSI bold codes, so check for 'm1' pattern
      expect(result).toMatch(/\[.*1.*\]/);
      expect(result).toMatch(/\[.*2.*\]/);
      expect(result).toContain('"test"');
      expect(result).toContain('feature');
      expect(result).toContain('(current)');
    });

    it('shows story when present', () => {
      const sessions = [
        { id: '1', branch: 'main', path: '/path', active: true, current: false, story: 'US-001' },
      ];

      const result = formatSessionsTable(sessions);

      expect(result).toContain('US-001');
    });

    it('handles empty sessions array', () => {
      const result = formatSessionsTable([]);

      expect(result).toContain('Active Sessions');
    });
  });

  describe('renderKanbanBoard', () => {
    it('renders board for sessions with phases', () => {
      const sessions = [
        { id: '1', is_main: true, path: '/path' },
        { id: '2', merged_at: '2024-01-01', path: '/path2' },
      ];

      const result = renderKanbanBoard(sessions);

      expect(result).toContain('Sessions (Kanban View)');
      expect(result).toContain('[1]');
      expect(result).toContain('[2]');
    });
  });

  describe('renderKanbanBoardAsync', () => {
    it('renders board asynchronously', async () => {
      const sessions = [
        { id: '1', is_main: true, path: '/path' },
        { id: '2', merged_at: '2024-01-01', path: '/path2' },
      ];

      const result = await renderKanbanBoardAsync(sessions);

      expect(result).toContain('Sessions (Kanban View)');
      expect(result).toContain('[1]');
      expect(result).toContain('[2]');
    });

    it('handles empty sessions', async () => {
      const result = await renderKanbanBoardAsync([]);

      expect(result).toContain('Sessions (Kanban View)');
      expect(result).toContain('To Do: 0');
    });
  });

  describe('getSessionsHealth', () => {
    it('returns health report structure', () => {
      const mockRegistry = {
        sessions: {},
      };
      const loadRegistry = () => mockRegistry;

      const result = getSessionsHealth({}, loadRegistry);

      expect(result).toHaveProperty('stale');
      expect(result).toHaveProperty('uncommitted');
      expect(result).toHaveProperty('orphanedRegistry');
      expect(result).toHaveProperty('orphanedWorktrees');
      expect(result).toHaveProperty('healthy');
    });

    it('detects orphaned registry entries', () => {
      const mockRegistry = {
        sessions: {
          '1': { is_main: false, path: '/nonexistent/path', last_active: new Date().toISOString() },
        },
      };
      const loadRegistry = () => mockRegistry;

      const result = getSessionsHealth({}, loadRegistry);

      expect(result.orphanedRegistry).toHaveLength(1);
      expect(result.orphanedRegistry[0].id).toBe('1');
      expect(result.orphanedRegistry[0].reason).toBe('path_missing');
    });

    it('detects stale sessions', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days ago

      const mockRegistry = {
        sessions: {
          '1': { is_main: false, path: os.tmpdir(), last_active: oldDate.toISOString() },
        },
      };
      const loadRegistry = () => mockRegistry;

      const result = getSessionsHealth({ staleDays: 7 }, loadRegistry);

      expect(result.stale.length).toBeGreaterThanOrEqual(1);
    });

    it('skips main session', () => {
      const mockRegistry = {
        sessions: {
          '1': { is_main: true, path: '/nonexistent', last_active: new Date().toISOString() },
        },
      };
      const loadRegistry = () => mockRegistry;

      const result = getSessionsHealth({}, loadRegistry);

      // Should not appear in orphanedRegistry because main is skipped
      expect(result.orphanedRegistry).toHaveLength(0);
    });

    it('respects staleDays option', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

      const mockRegistry = {
        sessions: {
          '1': { is_main: false, path: os.tmpdir(), last_active: recentDate.toISOString() },
        },
      };
      const loadRegistry = () => mockRegistry;

      // With 7 day threshold, 3 days old is not stale
      const result = getSessionsHealth({ staleDays: 7 }, loadRegistry);
      expect(result.stale.filter(s => s.id === '1')).toHaveLength(0);

      // With 2 day threshold, 3 days old is stale
      const result2 = getSessionsHealth({ staleDays: 2 }, loadRegistry);
      expect(result2.stale.filter(s => s.id === '1')).toHaveLength(1);
    });
  });
});
