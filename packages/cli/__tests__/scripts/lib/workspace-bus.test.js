/**
 * Tests for workspace-bus.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkspaceBus } = require('../../../scripts/lib/workspace-bus');
const { WORKSPACE_DIR, WORKSPACE_BUS_DIR } = require('../../../scripts/lib/workspace-discovery');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-bus-test-'));
  // Create workspace bus directory
  fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR, WORKSPACE_BUS_DIR), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WorkspaceBus', () => {
  describe('send', () => {
    test('writes message to workspace bus log', () => {
      const bus = new WorkspaceBus(tmpDir);
      const result = bus.send('frontend', { type: 'task_completed', agent: 'api' });

      expect(result.ok).toBe(true);

      const logPath = path.join(tmpDir, WORKSPACE_DIR, WORKSPACE_BUS_DIR, 'log.jsonl');
      const content = fs.readFileSync(logPath, 'utf8').trim();
      const entry = JSON.parse(content);
      expect(entry.project).toBe('frontend');
      expect(entry.type).toBe('task_completed');
      expect(entry.agent).toBe('api');
      expect(entry.at).toBeDefined();
    });

    test('appends multiple messages', () => {
      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'task_started' });
      bus.send('backend', { type: 'task_completed' });
      bus.send('frontend', { type: 'task_completed' });

      const logPath = path.join(tmpDir, WORKSPACE_DIR, WORKSPACE_BUS_DIR, 'log.jsonl');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    test('dual-writes to per-project bus when project bus dir exists', () => {
      // Create project with bus dir
      const projectPath = path.join(tmpDir, 'frontend');
      const projectBusDir = path.join(projectPath, 'docs', '09-agents', 'bus');
      fs.mkdirSync(projectBusDir, { recursive: true });

      // Write workspace config
      const config = {
        schema_version: '1.0.0',
        projects: [{ name: 'frontend', path: projectPath }],
      };
      fs.writeFileSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'), JSON.stringify(config));

      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'test_event' });

      // Verify workspace bus
      const wsLog = path.join(tmpDir, WORKSPACE_DIR, WORKSPACE_BUS_DIR, 'log.jsonl');
      expect(fs.readFileSync(wsLog, 'utf8').trim()).toContain('test_event');

      // Verify per-project bus
      const projectLog = path.join(projectBusDir, 'log.jsonl');
      expect(fs.readFileSync(projectLog, 'utf8').trim()).toContain('test_event');
    });

    test('skips dual-write when dualWrite is false', () => {
      const projectPath = path.join(tmpDir, 'frontend');
      const projectBusDir = path.join(projectPath, 'docs', '09-agents', 'bus');
      fs.mkdirSync(projectBusDir, { recursive: true });

      const config = {
        schema_version: '1.0.0',
        projects: [{ name: 'frontend', path: projectPath }],
      };
      fs.writeFileSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'), JSON.stringify(config));

      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'test_event' }, { dualWrite: false });

      const projectLog = path.join(projectBusDir, 'log.jsonl');
      expect(fs.existsSync(projectLog)).toBe(false);
    });
  });

  describe('read', () => {
    test('reads all messages when no filters', () => {
      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'a' });
      bus.send('backend', { type: 'b' });

      const result = bus.read();
      expect(result.ok).toBe(true);
      expect(result.messages).toHaveLength(2);
    });

    test('filters by project', () => {
      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'a' });
      bus.send('backend', { type: 'b' });
      bus.send('frontend', { type: 'c' });

      const result = bus.read({ project: 'frontend' });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].type).toBe('a');
      expect(result.messages[1].type).toBe('c');
    });

    test('filters by type', () => {
      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'task_completed' });
      bus.send('frontend', { type: 'task_started' });
      bus.send('backend', { type: 'task_completed' });

      const result = bus.read({ type: 'task_completed' });
      expect(result.messages).toHaveLength(2);
    });

    test('filters by limit', () => {
      const bus = new WorkspaceBus(tmpDir);
      for (let i = 0; i < 10; i++) {
        bus.send('frontend', { type: `event_${i}` });
      }

      const result = bus.read({ limit: 3 });
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].type).toBe('event_7');
      expect(result.messages[2].type).toBe('event_9');
    });

    test('returns empty when no log exists', () => {
      // Delete the log file
      const logPath = path.join(tmpDir, WORKSPACE_DIR, WORKSPACE_BUS_DIR, 'log.jsonl');
      if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

      const bus = new WorkspaceBus(tmpDir);
      const result = bus.read();
      expect(result.ok).toBe(true);
      expect(result.messages).toEqual([]);
    });

    test('returns error for invalid since filter', () => {
      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'a' });

      const result = bus.read({ since: 'not-a-date' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Invalid 'since'");
    });
  });

  describe('getMessageCounts', () => {
    test('returns per-project message counts', () => {
      const bus = new WorkspaceBus(tmpDir);
      bus.send('frontend', { type: 'a' });
      bus.send('frontend', { type: 'b' });
      bus.send('backend', { type: 'c' });

      const counts = bus.getMessageCounts();
      expect(counts.frontend).toBe(2);
      expect(counts.backend).toBe(1);
    });
  });
});
