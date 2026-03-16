/**
 * Tests for workspace-registry.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkspaceRegistry } = require('../../../scripts/lib/workspace-registry');
const { WORKSPACE_DIR, initWorkspace } = require('../../../scripts/lib/workspace-discovery');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-reg-test-'));
  // Create workspace structure
  fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WorkspaceRegistry', () => {
  describe('load/save', () => {
    test('creates default registry when none exists', () => {
      const reg = new WorkspaceRegistry(tmpDir);
      const data = reg.load();
      expect(data.schema_version).toBe('1.0.0');
      expect(data.sessions).toEqual({});
    });

    test('saves and loads registry', () => {
      const reg = new WorkspaceRegistry(tmpDir);
      const data = reg.load();
      data.sessions['frontend-1'] = { project: 'frontend', status: 'active' };
      reg.save(data);

      const reg2 = new WorkspaceRegistry(tmpDir);
      const loaded = reg2.load();
      expect(loaded.sessions['frontend-1']).toBeDefined();
      expect(loaded.sessions['frontend-1'].project).toBe('frontend');
    });
  });

  describe('registerSession', () => {
    test('registers a session with project prefix', () => {
      const reg = new WorkspaceRegistry(tmpDir);
      const result = reg.registerSession('frontend', {
        sessionId: '1',
        path: '/path/to/frontend-1',
        branch: 'feature/auth',
        nickname: 'auth',
      });

      expect(result.ok).toBe(true);
      expect(result.workspaceSessionId).toBe('frontend-1');

      const sessions = reg.getWorkspaceSessions();
      expect(sessions['frontend-1']).toBeDefined();
      expect(sessions['frontend-1'].project).toBe('frontend');
      expect(sessions['frontend-1'].branch).toBe('feature/auth');
    });

    test('registers multiple sessions from different projects', () => {
      const reg = new WorkspaceRegistry(tmpDir);
      reg.registerSession('frontend', { sessionId: '1', path: '/a' });
      reg.registerSession('backend', { sessionId: '1', path: '/b' });
      reg.registerSession('frontend', { sessionId: '2', path: '/c' });

      const sessions = reg.getWorkspaceSessions();
      expect(Object.keys(sessions)).toHaveLength(3);
      expect(sessions['frontend-1']).toBeDefined();
      expect(sessions['backend-1']).toBeDefined();
      expect(sessions['frontend-2']).toBeDefined();
    });
  });

  describe('unregisterSession', () => {
    test('removes a session', () => {
      const reg = new WorkspaceRegistry(tmpDir);
      reg.registerSession('frontend', { sessionId: '1', path: '/a' });
      reg.unregisterSession('frontend-1');

      const sessions = reg.getWorkspaceSessions();
      expect(sessions['frontend-1']).toBeUndefined();
    });
  });

  describe('getAllSessions (federated)', () => {
    test('federates per-project registries', () => {
      // Create two projects with session registries
      const frontendDir = path.join(tmpDir, 'frontend');
      const backendDir = path.join(tmpDir, 'backend');
      fs.mkdirSync(path.join(frontendDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(backendDir, '.agileflow', 'sessions'), { recursive: true });

      // Write per-project registries
      const frontendRegistry = {
        sessions: {
          1: { path: frontendDir, branch: 'main', nickname: null },
          2: { path: `${frontendDir}-auth`, branch: 'feature/auth', nickname: 'auth' },
        },
      };
      const backendRegistry = {
        sessions: {
          1: { path: backendDir, branch: 'main', nickname: null },
        },
      };

      fs.writeFileSync(
        path.join(frontendDir, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify(frontendRegistry)
      );
      fs.writeFileSync(
        path.join(backendDir, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify(backendRegistry)
      );

      // Write workspace config
      const config = {
        schema_version: '1.0.0',
        projects: [
          { name: 'frontend', path: frontendDir },
          { name: 'backend', path: backendDir },
        ],
      };
      fs.writeFileSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'), JSON.stringify(config));

      const reg = new WorkspaceRegistry(tmpDir);
      const all = reg.getAllSessions();

      expect(all).toHaveLength(2);

      const frontend = all.find(p => p.project === 'frontend');
      expect(frontend.sessions).toHaveLength(2);
      expect(frontend.sessions[0].workspaceId).toBe('frontend-1');
      expect(frontend.sessions[1].workspaceId).toBe('frontend-2');

      const backend = all.find(p => p.project === 'backend');
      expect(backend.sessions).toHaveLength(1);
    });
  });

  describe('getAllSessionsFlat', () => {
    test('returns flat list of all sessions', () => {
      // Setup projects
      const frontendDir = path.join(tmpDir, 'frontend');
      fs.mkdirSync(path.join(frontendDir, '.agileflow', 'sessions'), { recursive: true });
      fs.writeFileSync(
        path.join(frontendDir, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify({ sessions: { 1: { path: frontendDir } } })
      );
      fs.writeFileSync(
        path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'),
        JSON.stringify({
          schema_version: '1.0.0',
          projects: [{ name: 'frontend', path: frontendDir }],
        })
      );

      const reg = new WorkspaceRegistry(tmpDir);
      const flat = reg.getAllSessionsFlat();
      expect(flat).toHaveLength(1);
      expect(flat[0].project).toBe('frontend');
    });
  });

  describe('getSummary', () => {
    test('returns correct summary', () => {
      const frontendDir = path.join(tmpDir, 'frontend');
      const backendDir = path.join(tmpDir, 'backend');
      fs.mkdirSync(path.join(frontendDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(backendDir, '.agileflow', 'sessions'), { recursive: true });

      fs.writeFileSync(
        path.join(frontendDir, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify({ sessions: { 1: {}, 2: {} } })
      );
      fs.writeFileSync(
        path.join(backendDir, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify({ sessions: { 1: {} } })
      );
      fs.writeFileSync(
        path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'),
        JSON.stringify({
          schema_version: '1.0.0',
          projects: [
            { name: 'frontend', path: frontendDir },
            { name: 'backend', path: backendDir },
          ],
        })
      );

      const reg = new WorkspaceRegistry(tmpDir);
      const summary = reg.getSummary();
      expect(summary.totalProjects).toBe(2);
      expect(summary.totalSessions).toBe(3);
      expect(summary.byProject.frontend).toBe(2);
      expect(summary.byProject.backend).toBe(1);
    });
  });
});
