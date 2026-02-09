/**
 * Tests for lib/session-switching.js
 *
 * Tests the extracted session switching and thread type management
 * operations via the factory pattern.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createSessionSwitching } = require('../../lib/session-switching');

// Mock dependencies
function createMockDeps(sessions = {}, overrides = {}) {
  let savedRegistry = null;

  return {
    ROOT: overrides.ROOT || '/mock/project',
    loadRegistry: jest.fn(() => ({
      schema_version: '1.0.0',
      next_id: 10,
      project_name: 'test-project',
      sessions: { ...sessions },
    })),
    saveRegistry: jest.fn(data => {
      savedRegistry = data;
    }),
    getSavedRegistry: () => savedRegistry,
    ...overrides,
  };
}

describe('session-switching', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-switch-test-'));
    // Create docs/09-agents directory for session state
    fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createSessionSwitching factory', () => {
    test('returns object with all expected functions', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);

      expect(typeof ops.switchSession).toBe('function');
      expect(typeof ops.clearActiveSession).toBe('function');
      expect(typeof ops.getActiveSession).toBe('function');
      expect(typeof ops.getSessionThreadType).toBe('function');
      expect(typeof ops.setSessionThreadType).toBe('function');
      expect(typeof ops.transitionThread).toBe('function');
      expect(typeof ops.getValidThreadTransitions).toBe('function');
    });
  });

  describe('switchSession', () => {
    test('returns error for non-existent session', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.switchSession('999');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('returns error when directory does not exist', () => {
      const deps = createMockDeps(
        {
          1: { path: '/nonexistent/path', nickname: 'test', branch: 'main' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.switchSession('1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('switches session by ID when path exists', () => {
      const deps = createMockDeps(
        {
          1: { path: tempDir, nickname: 'test', branch: 'main' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.switchSession('1');
      expect(result.success).toBe(true);
      expect(result.session.id).toBe('1');
      expect(result.path).toBe(tempDir);
    });

    test('switches session by nickname', () => {
      const deps = createMockDeps(
        {
          5: { path: tempDir, nickname: 'my-feat', branch: 'feature' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.switchSession('my-feat');
      expect(result.success).toBe(true);
      expect(result.session.nickname).toBe('my-feat');
    });

    test('writes session state file', () => {
      const deps = createMockDeps(
        {
          1: { path: tempDir, nickname: 'test', branch: 'main' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      ops.switchSession('1');

      const statePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
      expect(fs.existsSync(statePath)).toBe(true);
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(state.active_session.id).toBe('1');
    });

    test('updates last_active and saves registry', () => {
      const deps = createMockDeps(
        {
          1: { path: tempDir, nickname: 'test', branch: 'main' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      ops.switchSession('1');
      expect(deps.saveRegistry).toHaveBeenCalled();
    });

    test('includes addDirCommand in result', () => {
      const deps = createMockDeps(
        {
          1: { path: tempDir, nickname: 'test', branch: 'main' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.switchSession('1');
      expect(result.addDirCommand).toContain('/add-dir');
      expect(result.addDirCommand).toContain(tempDir);
    });
  });

  describe('clearActiveSession', () => {
    test('succeeds when no state file exists', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.clearActiveSession();
      expect(result.success).toBe(true);
    });

    test('removes active_session from state file', () => {
      const statePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
      fs.writeFileSync(
        statePath,
        JSON.stringify({
          active_session: { id: '1' },
          other_data: 'preserved',
        })
      );

      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.clearActiveSession();
      expect(result.success).toBe(true);

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(state.active_session).toBeUndefined();
      expect(state.other_data).toBe('preserved');
    });
  });

  describe('getActiveSession', () => {
    test('returns inactive when no state file', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.getActiveSession();
      expect(result.active).toBe(false);
    });

    test('returns active session when state has active_session', () => {
      const statePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
      fs.writeFileSync(
        statePath,
        JSON.stringify({
          active_session: { id: '3', nickname: 'feat' },
        })
      );

      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.getActiveSession();
      expect(result.active).toBe(true);
      expect(result.session.id).toBe('3');
    });

    test('returns inactive when state has no active_session', () => {
      const statePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
      fs.writeFileSync(statePath, JSON.stringify({ other: 'data' }));

      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.getActiveSession();
      expect(result.active).toBe(false);
    });

    test('returns inactive on corrupt state file', () => {
      const statePath = path.join(tempDir, 'docs', '09-agents', 'session-state.json');
      fs.writeFileSync(statePath, 'not-json');

      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.getActiveSession();
      expect(result.active).toBe(false);
    });
  });

  describe('getSessionThreadType', () => {
    test('returns error when session not found', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.getSessionThreadType('999');
      expect(result.success).toBe(false);
    });

    test('returns thread type for existing session', () => {
      const deps = createMockDeps(
        {
          1: { thread_type: 'fusion', is_main: false },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.getSessionThreadType('1');
      expect(result.success).toBe(true);
      expect(result.thread_type).toBe('fusion');
    });

    test('defaults to base for main session without thread_type', () => {
      const deps = createMockDeps(
        {
          1: { is_main: true },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.getSessionThreadType('1');
      expect(result.thread_type).toBe('base');
    });

    test('defaults to parallel for non-main session without thread_type', () => {
      const deps = createMockDeps(
        {
          1: { is_main: false },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.getSessionThreadType('1');
      expect(result.thread_type).toBe('parallel');
    });
  });

  describe('setSessionThreadType', () => {
    test('rejects invalid thread type', () => {
      const deps = createMockDeps({ 1: {} }, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.setSessionThreadType('1', 'invalid-type');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid thread type');
    });

    test('returns error for non-existent session', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.setSessionThreadType('999', 'parallel');
      expect(result.success).toBe(false);
    });

    test('updates thread type and saves', () => {
      const deps = createMockDeps(
        {
          1: { thread_type: 'parallel' },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.setSessionThreadType('1', 'fusion');
      expect(result.success).toBe(true);
      expect(result.thread_type).toBe('fusion');
      expect(deps.saveRegistry).toHaveBeenCalled();
    });
  });

  describe('transitionThread', () => {
    test('returns error for non-existent session', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.transitionThread('999', 'base');
      expect(result.success).toBe(false);
    });

    test('performs valid transition', () => {
      const deps = createMockDeps(
        {
          1: { thread_type: 'parallel', is_main: false },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.transitionThread('1', 'fusion');
      expect(result.success).toBe(true);
      expect(result.from).toBe('parallel');
      expect(result.to).toBe('fusion');
    });

    test('returns noop for same thread type', () => {
      const deps = createMockDeps(
        {
          1: { thread_type: 'parallel', is_main: false },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.transitionThread('1', 'parallel');
      expect(result.success).toBe(true);
      expect(result.noop).toBe(true);
    });

    test('force allows invalid transition', () => {
      const deps = createMockDeps(
        {
          1: { thread_type: 'parallel', is_main: false },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.transitionThread('1', 'big', { force: true });
      expect(result.success).toBe(true);
      expect(result.forced).toBe(true);
    });
  });

  describe('getValidThreadTransitions', () => {
    test('returns error for non-existent session', () => {
      const deps = createMockDeps({}, { ROOT: tempDir });
      const ops = createSessionSwitching(deps);
      const result = ops.getValidThreadTransitions('999');
      expect(result.success).toBe(false);
    });

    test('returns valid transitions for parallel session', () => {
      const deps = createMockDeps(
        {
          1: { thread_type: 'parallel', is_main: false },
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.getValidThreadTransitions('1');
      expect(result.success).toBe(true);
      expect(result.current).toBe('parallel');
      expect(Array.isArray(result.validTransitions)).toBe(true);
    });

    test('defaults legacy session to correct thread type', () => {
      const deps = createMockDeps(
        {
          1: { is_main: true }, // No thread_type
        },
        { ROOT: tempDir }
      );
      const ops = createSessionSwitching(deps);
      const result = ops.getValidThreadTransitions('1');
      expect(result.current).toBe('base');
    });
  });
});
