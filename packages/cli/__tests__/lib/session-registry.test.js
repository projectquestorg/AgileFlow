/**
 * Tests for SessionRegistry - Event Bus for Session Registry
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { SessionRegistry } = require('../../lib/session-registry');

describe('SessionRegistry', () => {
  let testDir;
  let registry;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-registry-test-'));
    registry = new SessionRegistry(testDir);
  });

  afterEach(() => {
    registry.removeAllListeners();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('creates registry with project root', () => {
      expect(registry.projectRoot).toBe(testDir);
      expect(registry.sessionsDir).toBe(path.join(testDir, '.agileflow', 'sessions'));
    });

    it('accepts custom sessions directory', () => {
      const customDir = path.join(testDir, 'custom-sessions');
      const customRegistry = new SessionRegistry(testDir, { sessionsDir: customDir });
      expect(customRegistry.sessionsDir).toBe(customDir);
    });
  });

  describe('load', () => {
    it('creates default registry if none exists', async () => {
      const data = await registry.load();

      expect(data.schema_version).toBe('1.0.0');
      expect(data.next_id).toBe(1);
      expect(data.sessions).toEqual({});
    });

    it('loads existing registry', async () => {
      // Create registry file
      const sessionsDir = path.join(testDir, '.agileflow', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionsDir, 'registry.json'),
        JSON.stringify({ schema_version: '1.0.0', next_id: 5, sessions: { 1: { name: 'test' } } })
      );

      const data = await registry.load();

      expect(data.next_id).toBe(5);
      expect(data.sessions['1']).toEqual({ name: 'test' });
    });

    it('caches loaded data', async () => {
      await registry.load();
      const cached = await registry.load();

      expect(cached).toBeDefined();
    });

    it('emits loaded event', async () => {
      const loadedHandler = jest.fn();
      registry.on('loaded', loadedHandler);

      await registry.load();

      expect(loadedHandler).toHaveBeenCalledWith(expect.objectContaining({ sessionCount: 0 }));
    });
  });

  describe('save', () => {
    it('saves registry data', async () => {
      const data = {
        schema_version: '1.0.0',
        next_id: 3,
        sessions: { 1: { name: 'session1' } },
      };

      const result = await registry.save(data);

      expect(result.ok).toBe(true);

      // Verify file was written
      const saved = JSON.parse(
        fs.readFileSync(path.join(registry.sessionsDir, 'registry.json'), 'utf8')
      );
      expect(saved.next_id).toBe(3);
    });

    it('emits saved event', async () => {
      const savedHandler = jest.fn();
      registry.on('saved', savedHandler);

      await registry.save({ schema_version: '1.0.0', next_id: 1, sessions: {} });

      expect(savedHandler).toHaveBeenCalledWith(expect.objectContaining({ sessionCount: 0 }));
    });
  });

  describe('registerSession', () => {
    it('registers new session', async () => {
      const result = await registry.registerSession(1, { worktree: '/path/to/worktree' });

      expect(result.ok).toBe(true);

      const session = await registry.getSession(1);
      expect(session.worktree).toBe('/path/to/worktree');
      expect(session.registered_at).toBeDefined();
    });

    it('updates next_id', async () => {
      await registry.registerSession(5, { name: 'session5' });

      const data = await registry.load();
      expect(data.next_id).toBe(6);
    });

    it('emits registered event', async () => {
      const registeredHandler = jest.fn();
      registry.on('registered', registeredHandler);

      await registry.registerSession(1, { name: 'test' });

      expect(registeredHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 1,
          session: expect.objectContaining({ name: 'test' }),
        })
      );
    });
  });

  describe('unregisterSession', () => {
    it('removes existing session', async () => {
      await registry.registerSession(1, { name: 'test' });
      const result = await registry.unregisterSession(1);

      expect(result.ok).toBe(true);
      expect(result.found).toBe(true);

      const session = await registry.getSession(1);
      expect(session).toBeNull();
    });

    it('returns found: false for non-existent session', async () => {
      const result = await registry.unregisterSession(999);

      expect(result.ok).toBe(true);
      expect(result.found).toBe(false);
    });

    it('emits unregistered event', async () => {
      const unregisteredHandler = jest.fn();
      registry.on('unregistered', unregisteredHandler);

      await registry.registerSession(1, { name: 'test' });
      await registry.unregisterSession(1);

      expect(unregisteredHandler).toHaveBeenCalledWith({ sessionId: 1 });
    });
  });

  describe('updateSession', () => {
    it('updates existing session', async () => {
      await registry.registerSession(1, { name: 'original', status: 'active' });
      const result = await registry.updateSession(1, { status: 'inactive' });

      expect(result.ok).toBe(true);
      expect(result.found).toBe(true);

      const session = await registry.getSession(1);
      expect(session.name).toBe('original'); // Preserved
      expect(session.status).toBe('inactive'); // Updated
      expect(session.updated_at).toBeDefined();
    });

    it('returns error for non-existent session', async () => {
      const result = await registry.updateSession(999, { status: 'inactive' });

      expect(result.ok).toBe(false);
      expect(result.found).toBe(false);
    });

    it('emits updated event', async () => {
      const updatedHandler = jest.fn();
      registry.on('updated', updatedHandler);

      await registry.registerSession(1, { name: 'test' });
      await registry.updateSession(1, { status: 'inactive' });

      expect(updatedHandler).toHaveBeenCalledWith({
        sessionId: 1,
        changes: { status: 'inactive' },
      });
    });
  });

  describe('getSession', () => {
    it('returns session by ID', async () => {
      await registry.registerSession(1, { name: 'test' });
      const session = await registry.getSession(1);

      expect(session.name).toBe('test');
    });

    it('returns null for non-existent session', async () => {
      const session = await registry.getSession(999);
      expect(session).toBeNull();
    });
  });

  describe('getAllSessions', () => {
    it('returns all sessions', async () => {
      await registry.registerSession(1, { name: 'session1' });
      await registry.registerSession(2, { name: 'session2' });

      const sessions = await registry.getAllSessions();

      expect(Object.keys(sessions)).toHaveLength(2);
      expect(sessions['1'].name).toBe('session1');
      expect(sessions['2'].name).toBe('session2');
    });

    it('returns empty object when no sessions', async () => {
      const sessions = await registry.getAllSessions();
      expect(sessions).toEqual({});
    });
  });

  describe('getNextId', () => {
    it('returns next available ID', async () => {
      await registry.registerSession(1, { name: 'test' });
      const nextId = await registry.getNextId();

      expect(nextId).toBe(2);
    });
  });

  describe('countSessions', () => {
    it('counts sessions by status', async () => {
      await registry.registerSession(1, { status: 'active' });
      await registry.registerSession(2, { status: 'active' });
      await registry.registerSession(3, { status: 'inactive' });

      const counts = await registry.countSessions();

      expect(counts.total).toBe(3);
      expect(counts.active).toBe(2);
      expect(counts.inactive).toBe(1);
    });
  });

  describe('batch operations', () => {
    it('queues operations in batch mode', async () => {
      registry.startBatch();
      registry.addToBatch('register', { sessionId: 1, sessionData: { name: 'session1' } });
      registry.addToBatch('register', { sessionId: 2, sessionData: { name: 'session2' } });

      // Not saved yet
      const beforeCommit = await registry.getSession(1);
      expect(beforeCommit).toBeNull();

      const result = await registry.commitBatch();

      expect(result.ok).toBe(true);
      expect(result.applied).toBe(2);

      // Now saved
      const afterCommit = await registry.getSession(1);
      expect(afterCommit.name).toBe('session1');
    });

    it('throws error when adding to batch without starting', () => {
      expect(() => {
        registry.addToBatch('register', { sessionId: 1 });
      }).toThrow('Not in batch mode');
    });

    it('can cancel batch', async () => {
      await registry.registerSession(1, { name: 'original' });

      registry.startBatch();
      registry.addToBatch('update', { sessionId: 1, updates: { name: 'changed' } });
      registry.cancelBatch();

      const session = await registry.getSession(1);
      expect(session.name).toBe('original'); // Not changed
    });
  });

  describe('cleanupStaleSessions', () => {
    it('removes stale sessions', async () => {
      await registry.registerSession(1, { pid: 123 });
      await registry.registerSession(2, { pid: 456 });
      await registry.registerSession(3, { pid: 789 });

      // Mock isAlive function - only session 2 is alive
      const isAlive = jest.fn((sessionId, session) => session.pid === 456);

      const result = await registry.cleanupStaleSessions(isAlive);

      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(2);

      const sessions = await registry.getAllSessions();
      expect(Object.keys(sessions)).toHaveLength(1);
      expect(sessions['2']).toBeDefined();
    });

    it('emits unregistered events for cleaned sessions', async () => {
      await registry.registerSession(1, { pid: 123 });
      const unregisteredHandler = jest.fn();
      registry.on('unregistered', unregisteredHandler);

      await registry.cleanupStaleSessions(() => false);

      expect(unregisteredHandler).toHaveBeenCalledWith({ sessionId: '1' });
    });
  });

  describe('clearCache', () => {
    it('clears cached registry data', async () => {
      await registry.load();
      expect(registry._cache).not.toBeNull();

      registry.clearCache();
      expect(registry._cache).toBeNull();
    });
  });

  describe('loadSync', () => {
    it('loads registry synchronously', () => {
      const data = registry.loadSync();

      expect(data.schema_version).toBe('1.0.0');
      expect(data.sessions).toEqual({});
    });
  });

  describe('saveSync', () => {
    it('saves registry synchronously', () => {
      const data = { schema_version: '1.0.0', next_id: 1, sessions: { 1: { test: true } } };
      const result = registry.saveSync(data);

      expect(result.ok).toBe(true);
    });
  });

  describe('audit logging', () => {
    it('logs operations when enabled', async () => {
      const auditRegistry = new SessionRegistry(testDir, { auditLog: true });

      await auditRegistry.registerSession(1, { name: 'test' });
      await auditRegistry.unregisterSession(1);

      const auditPath = path.join(auditRegistry.sessionsDir, 'audit.log');
      expect(fs.existsSync(auditPath)).toBe(true);

      const logs = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
