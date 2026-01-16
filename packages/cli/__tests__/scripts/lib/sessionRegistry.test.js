'use strict';

/**
 * Tests for SessionRegistry Event Bus Architecture
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('SessionRegistry', () => {
  const modulePath = path.join(__dirname, '../../../scripts/lib/sessionRegistry.js');

  describe('File Structure', () => {
    test('sessionRegistry.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../../scripts/lib/sessionRegistry');
    });

    test('exports SessionRegistry class', () => {
      expect(typeof module.SessionRegistry).toBe('function');
    });

    test('exports getRegistry function', () => {
      expect(typeof module.getRegistry).toBe('function');
    });

    test('exports resetRegistry function', () => {
      expect(typeof module.resetRegistry).toBe('function');
    });

    test('exports CACHE_TTL_MS constant', () => {
      expect(typeof module.CACHE_TTL_MS).toBe('number');
      expect(module.CACHE_TTL_MS).toBe(10000); // 10 seconds
    });
  });

  describe('SessionRegistry Class', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      // Create temp directory
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-test-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });

      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('constructor sets paths correctly', () => {
      expect(registry.rootDir).toBe(tempDir);
      expect(registry.sessionsDir).toBe(path.join(tempDir, '.agileflow', 'sessions'));
      expect(registry.registryPath).toBe(
        path.join(tempDir, '.agileflow', 'sessions', 'registry.json')
      );
    });

    test('load creates default registry if none exists', () => {
      const data = registry.load();

      expect(data.schema_version).toBe('1.0.0');
      expect(data.next_id).toBe(1);
      expect(data.sessions).toEqual({});
    });

    test('load returns cached data on second call', () => {
      const data1 = registry.load();
      const data2 = registry.load();

      expect(data1).toBe(data2); // Same reference
    });

    test('save persists registry to disk', () => {
      const data = registry.load();
      data.test_field = 'test_value';
      registry.save(data);

      // Read directly from disk
      const content = fs.readFileSync(registry.registryPath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.test_field).toBe('test_value');
    });

    test('invalidateCache clears cache', () => {
      registry.load();
      expect(registry.isCacheValid()).toBe(true);

      registry.invalidateCache();
      expect(registry.isCacheValid()).toBe(false);
    });

    test('inherits from EventEmitter', () => {
      const EventEmitter = require('events');
      expect(registry instanceof EventEmitter).toBe(true);
    });
  });

  describe('Lock Management', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-lock-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('writeLock creates lock file', () => {
      registry.writeLock('1', 12345);

      const lockPath = registry.getLockPath('1');
      expect(fs.existsSync(lockPath)).toBe(true);

      const content = fs.readFileSync(lockPath, 'utf8');
      expect(content).toContain('pid=12345');
    });

    test('readLock returns lock data', () => {
      registry.writeLock('2', 54321);
      const lock = registry.readLock('2');

      expect(lock.pid).toBe('54321');
      expect(lock.started).toBeDefined();
    });

    test('readLock returns null for missing lock', () => {
      const lock = registry.readLock('nonexistent');
      expect(lock).toBeNull();
    });

    test('removeLock deletes lock file', () => {
      registry.writeLock('3', 11111);
      expect(fs.existsSync(registry.getLockPath('3'))).toBe(true);

      registry.removeLock('3');
      expect(fs.existsSync(registry.getLockPath('3'))).toBe(false);
    });

    test('isActive returns true for alive PID', () => {
      // Use current process PID (known to be alive)
      registry.writeLock('4', process.pid);
      expect(registry.isActive('4')).toBe(true);
    });

    test('isActive returns false for dead PID', () => {
      // Use very large PID that doesn't exist
      registry.writeLock('5', 9999999);
      expect(registry.isActive('5')).toBe(false);
    });

    test('isActive returns false for missing lock', () => {
      expect(registry.isActive('nonexistent')).toBe(false);
    });
  });

  describe('Session Registration', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-reg-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('register creates new session', () => {
      const result = registry.register(tempDir, { nickname: 'test' });

      expect(result.isNew).toBe(true);
      expect(result.id).toBe('1');
      expect(result.session.nickname).toBe('test');
      expect(result.session.is_main).toBe(true);
    });

    test('register returns existing session on same path', () => {
      registry.register(tempDir, { nickname: 'first' });
      const result = registry.register(tempDir, { nickname: 'second' });

      expect(result.isNew).toBe(false);
      expect(result.id).toBe('1');
    });

    test('register increments next_id', () => {
      const otherPath = path.join(tempDir, 'other');
      fs.mkdirSync(otherPath, { recursive: true });

      registry.register(tempDir);
      const result = registry.register(otherPath);

      expect(result.id).toBe('2');
    });

    test('register emits registered event', done => {
      registry.once('registered', event => {
        expect(event.isNew).toBe(true);
        expect(event.id).toBe('1');
        done();
      });

      registry.register(tempDir);
    });

    test('register emits updated event for existing session', done => {
      registry.register(tempDir);

      registry.once('updated', event => {
        expect(event.id).toBe('1');
        done();
      });

      registry.register(tempDir);
    });
  });

  describe('Session Unregistration', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-unreg-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('unregister removes lock', () => {
      registry.register(tempDir);
      expect(fs.existsSync(registry.getLockPath('1'))).toBe(true);

      registry.unregister('1');
      expect(fs.existsSync(registry.getLockPath('1'))).toBe(false);
    });

    test('unregister emits unregistered event', done => {
      registry.register(tempDir);

      registry.once('unregistered', event => {
        expect(event.id).toBe('1');
        done();
      });

      registry.unregister('1');
    });
  });

  describe('Session Queries', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-query-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('getSession returns session by ID', () => {
      registry.register(tempDir, { nickname: 'test' });
      const session = registry.getSession('1');

      expect(session).not.toBeNull();
      expect(session.nickname).toBe('test');
    });

    test('getSession returns null for missing session', () => {
      const session = registry.getSession('999');
      expect(session).toBeNull();
    });

    test('getSessions returns all sessions', () => {
      const otherPath = path.join(tempDir, 'other');
      fs.mkdirSync(otherPath, { recursive: true });

      registry.register(tempDir);
      registry.register(otherPath);

      const { sessions } = registry.getSessions();
      expect(sessions.length).toBe(2);
    });

    test('getSessions includes active status', () => {
      registry.register(tempDir, { pid: process.pid });
      const { sessions } = registry.getSessions();

      expect(sessions[0].active).toBe(true);
    });

    test('getActiveCount returns count excluding path', () => {
      const otherPath = path.join(tempDir, 'other');
      fs.mkdirSync(otherPath, { recursive: true });

      registry.register(tempDir, { pid: process.pid });
      registry.register(otherPath, { pid: process.pid });

      // Exclude tempDir, so count should be 1 (otherPath)
      const count = registry.getActiveCount(tempDir);
      expect(count).toBe(1);
    });
  });

  describe('Session Deletion', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-del-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('delete removes session', () => {
      const otherPath = path.join(tempDir, 'other');
      fs.mkdirSync(otherPath, { recursive: true });

      registry.register(otherPath); // Creates non-main session
      const result = registry.delete('1');

      expect(result.success).toBe(true);
      expect(registry.getSession('1')).toBeNull();
    });

    test('delete fails for main session', () => {
      registry.register(tempDir); // Main session
      const result = registry.delete('1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('main');
    });

    test('delete fails for nonexistent session', () => {
      const result = registry.delete('999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Session Updates', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-upd-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('update modifies session fields', () => {
      registry.register(tempDir, { nickname: 'old' });
      const result = registry.update('1', { nickname: 'new' });

      expect(result.success).toBe(true);
      expect(result.session.nickname).toBe('new');
      expect(result.changes).toContain('nickname');
    });

    test('update emits updated event', done => {
      registry.register(tempDir);

      registry.once('updated', event => {
        expect(event.id).toBe('1');
        expect(event.changes).toContain('story');
        done();
      });

      registry.update('1', { story: 'US-0001' });
    });

    test('update fails for nonexistent session', () => {
      const result = registry.update('999', { nickname: 'test' });
      expect(result.success).toBe(false);
    });
  });

  describe('Batch Mode', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-batch-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('batch mode defers writes', () => {
      registry.startBatch();

      const data = registry.load();
      data.test_batch = true;
      registry.save(data);

      // File should not be updated yet (or should have old content)
      const content = fs.readFileSync(registry.registryPath, 'utf8');
      const parsed = JSON.parse(content);

      // test_batch should not be present until endBatch
      expect(parsed.test_batch).toBeUndefined();

      registry.endBatch();

      // Now it should be there
      const content2 = fs.readFileSync(registry.registryPath, 'utf8');
      const parsed2 = JSON.parse(content2);
      expect(parsed2.test_batch).toBe(true);
    });

    test('batch mode batches lock operations', () => {
      registry.startBatch();

      registry.writeLock('1', 12345);

      // Lock should not exist yet
      expect(fs.existsSync(registry.getLockPath('1'))).toBe(false);

      registry.endBatch();

      // Now it should exist
      expect(fs.existsSync(registry.getLockPath('1'))).toBe(true);
    });

    test('endBatch emits batchFlushed event', done => {
      registry.once('batchFlushed', () => {
        done();
      });

      registry.startBatch();
      registry.load();
      registry.endBatch();
    });
  });

  describe('Stale Lock Cleanup', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-cleanup-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('cleanupStaleLocks removes dead PID locks', () => {
      // Register a session
      registry.register(tempDir);

      // Manually create a lock with a dead PID
      const lockPath = registry.getLockPath('1');
      fs.writeFileSync(lockPath, 'pid=9999999\nstarted=1234567890\n');

      const result = registry.cleanupStaleLocks();

      expect(result.count).toBe(1);
      expect(result.sessions.length).toBe(1);
      expect(result.sessions[0].reason).toBe('pid_dead');
    });

    test('cleanupStaleLocks respects dryRun option', () => {
      registry.register(tempDir);
      const lockPath = registry.getLockPath('1');
      fs.writeFileSync(lockPath, 'pid=9999999\nstarted=1234567890\n');

      const result = registry.cleanupStaleLocks({ dryRun: true });

      expect(result.count).toBe(1);
      expect(fs.existsSync(lockPath)).toBe(true); // Still exists
    });

    test('cleanupStaleLocks emits cleaned event', done => {
      registry.register(tempDir);
      const lockPath = registry.getLockPath('1');
      fs.writeFileSync(lockPath, 'pid=9999999\nstarted=1234567890\n');

      registry.once('cleaned', event => {
        expect(event.count).toBe(1);
        done();
      });

      registry.cleanupStaleLocks();
    });
  });

  describe('Full Status', () => {
    let SessionRegistry;
    let tempDir;
    let registry;

    beforeAll(() => {
      SessionRegistry = require('../../../scripts/lib/sessionRegistry').SessionRegistry;
    });

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionregistry-fullstatus-'));
      fs.mkdirSync(path.join(tempDir, '.agileflow', 'sessions'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docs', '09-agents'), { recursive: true });
      registry = new SessionRegistry({ rootDir: tempDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    });

    test('getFullStatus returns combined data', () => {
      const result = registry.getFullStatus(tempDir);

      expect(result.registered).toBe(true);
      expect(result.id).toBe('1');
      expect(result.isNew).toBe(true);
      expect(result.current).not.toBeNull();
      expect(typeof result.otherActive).toBe('number');
      expect(typeof result.total).toBe('number');
    });

    test('getFullStatus uses batch mode', () => {
      // This is a side-effect test - batch mode should consolidate writes
      // The first save is from batch end, second is from getSessions cleanup
      // The key is that register + lock are batched together
      let batchFlushed = false;
      registry.on('batchFlushed', () => {
        batchFlushed = true;
      });

      registry.getFullStatus(tempDir);

      // Batch mode was used
      expect(batchFlushed).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    let getRegistry, resetRegistry;

    beforeAll(() => {
      const mod = require('../../../scripts/lib/sessionRegistry');
      getRegistry = mod.getRegistry;
      resetRegistry = mod.resetRegistry;
    });

    beforeEach(() => {
      resetRegistry();
    });

    test('getRegistry returns same instance', () => {
      const r1 = getRegistry();
      const r2 = getRegistry();

      expect(r1).toBe(r2);
    });

    test('getRegistry with forceNew creates new instance', () => {
      const r1 = getRegistry();
      const r2 = getRegistry({ forceNew: true });

      expect(r1).not.toBe(r2);
    });

    test('resetRegistry clears singleton', () => {
      const r1 = getRegistry();
      resetRegistry();
      const r2 = getRegistry();

      expect(r1).not.toBe(r2);
    });
  });

  describe('Module Structure', () => {
    test('sessionRegistry.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for key imports
      expect(content).toContain("require('events')");
      expect(content).toContain("require('fs')");
      expect(content).toContain("require('path')");
      expect(content).toContain("require('child_process')");

      // Check for class definition
      expect(content).toContain('class SessionRegistry extends EventEmitter');

      // Check for events
      expect(content).toContain("emit('registered'");
      expect(content).toContain("emit('unregistered'");
      expect(content).toContain("emit('updated'");
      expect(content).toContain("emit('loaded'");
      expect(content).toContain("emit('saved'");
      expect(content).toContain("emit('locked'");
      expect(content).toContain("emit('unlocked'");
      expect(content).toContain("emit('cleaned'");

      // Check for caching
      expect(content).toContain('CACHE_TTL_MS');
      expect(content).toContain('isCacheValid');
      expect(content).toContain('invalidateCache');

      // Check for batch mode
      expect(content).toContain('startBatch');
      expect(content).toContain('endBatch');
      expect(content).toContain('_batchMode');

      // Check for session operations
      expect(content).toContain('register(');
      expect(content).toContain('unregister(');
      expect(content).toContain('getSession(');
      expect(content).toContain('getSessions(');
      expect(content).toContain('delete(');
      expect(content).toContain('update(');

      // Check for lock operations
      expect(content).toContain('writeLock(');
      expect(content).toContain('readLock(');
      expect(content).toContain('removeLock(');
      expect(content).toContain('cleanupStaleLocks(');
    });
  });
});
