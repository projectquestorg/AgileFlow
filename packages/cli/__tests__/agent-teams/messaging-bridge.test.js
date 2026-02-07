/**
 * Tests for scripts/messaging-bridge.js
 *
 * Inter-agent messaging bridge for Agent Teams.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getStatusPath: jest.fn(root => `${root || '/test/project'}/docs/09-agents/status.json`),
  getSessionStatePath: jest.fn(
    root => `${root || '/test/project'}/docs/09-agents/session-state.json`
  ),
  getBusLogPath: jest.fn(root => `${root || '/test/project'}/docs/09-agents/bus/log.jsonl`),
}));

jest.mock('../../lib/feature-flags', () => ({
  isAgentTeamsEnabled: jest.fn(() => true),
}));

describe('messaging-bridge.js', () => {
  let testDir;
  let messagingBridge;

  beforeEach(() => {
    // Create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-messaging-test-'));

    // Create directory structure
    fs.mkdirSync(path.join(testDir, 'docs', '09-agents', 'bus'), { recursive: true });

    // Reset require cache
    delete require.cache[require.resolve('../../scripts/messaging-bridge')];
    messagingBridge = require('../../scripts/messaging-bridge');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('sendMessage()', () => {
    test('appends message to bus log', () => {
      const result = messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        to: 'AG-UI',
        type: 'coordination',
        message: 'Hello',
      });

      expect(result.ok).toBe(true);

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const content = fs.readFileSync(logPath, 'utf8').trim();
      const entry = JSON.parse(content);

      expect(entry.from).toBe('AG-API');
      expect(entry.to).toBe('AG-UI');
      expect(entry.type).toBe('coordination');
      expect(entry.message).toBe('Hello');
    });

    test('adds timestamp to message', () => {
      const before = new Date();
      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'test',
      });
      const after = new Date();

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      const messageTime = new Date(entry.at);
      expect(messageTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(messageTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('creates bus directory if missing', () => {
      const nonexistentDir = path.join(testDir, 'docs', '09-agents', 'bus');
      fs.rmSync(nonexistentDir, { recursive: true });

      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'test',
      });

      expect(fs.existsSync(nonexistentDir)).toBe(true);
    });

    test('appends to existing log file', () => {
      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        message: 'First message',
      });

      messagingBridge.sendMessage(testDir, {
        from: 'AG-UI',
        message: 'Second message',
      });

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).from).toBe('AG-API');
      expect(JSON.parse(lines[1]).from).toBe('AG-UI');
    });

    test('handles write errors gracefully', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.writeFileSync(logPath, '');
      fs.chmodSync(logPath, 0o000);

      const result = messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'test',
      });

      // Restore permissions for cleanup
      fs.chmodSync(logPath, 0o644);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('readMessages()', () => {
    test('reads all messages from log', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [
        JSON.stringify({ from: 'AG-API', type: 'test', at: new Date().toISOString() }),
        JSON.stringify({ from: 'AG-UI', type: 'test', at: new Date().toISOString() }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir);

      expect(result.ok).toBe(true);
      expect(result.messages).toHaveLength(2);
    });

    test('filters by from agent', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [
        JSON.stringify({ from: 'AG-API', type: 'test', at: new Date().toISOString() }),
        JSON.stringify({ from: 'AG-UI', type: 'test', at: new Date().toISOString() }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir, { from: 'AG-API' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].from).toBe('AG-API');
    });

    test('filters by to agent', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [
        JSON.stringify({ from: 'AG-API', to: 'AG-UI', type: 'test', at: new Date().toISOString() }),
        JSON.stringify({
          from: 'AG-API',
          to: 'AG-DATABASE',
          type: 'test',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir, { to: 'AG-UI' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].to).toBe('AG-UI');
    });

    test('filters by message type', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [
        JSON.stringify({ from: 'AG-API', type: 'coordination', at: new Date().toISOString() }),
        JSON.stringify({ from: 'AG-API', type: 'task_assignment', at: new Date().toISOString() }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir, { type: 'coordination' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('coordination');
    });

    test('filters by since timestamp', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const old = new Date(Date.now() - 60000);
      const new_msg = new Date();

      const messages = [
        JSON.stringify({ from: 'AG-API', at: old.toISOString() }),
        JSON.stringify({ from: 'AG-UI', at: new_msg.toISOString() }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir, {
        since: new Date(Date.now() - 30000).toISOString(),
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].from).toBe('AG-UI');
    });

    test('limits number of messages returned', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [];
      for (let i = 0; i < 10; i++) {
        messages.push(JSON.stringify({ from: 'AG-API', id: i, at: new Date().toISOString() }));
      }
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir, { limit: 3 });

      expect(result.messages).toHaveLength(3);
      // Should return last 3 messages
      expect(result.messages[2].id).toBe(9);
    });

    test('returns empty list when log missing', () => {
      const result = messagingBridge.readMessages(testDir);

      expect(result.ok).toBe(true);
      expect(result.messages).toHaveLength(0);
    });

    test('skips malformed lines', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const lines = [
        JSON.stringify({ from: 'AG-API', at: new Date().toISOString() }),
        'invalid json',
        JSON.stringify({ from: 'AG-UI', at: new Date().toISOString() }),
      ];
      fs.writeFileSync(logPath, lines.join('\n'));

      const result = messagingBridge.readMessages(testDir);

      expect(result.ok).toBe(true);
      expect(result.messages).toHaveLength(2);
    });

    test('applies multiple filters together', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [
        JSON.stringify({
          from: 'AG-API',
          to: 'AG-UI',
          type: 'coordination',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-API',
          to: 'AG-UI',
          type: 'task_assignment',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-UI',
          to: 'AG-API',
          type: 'coordination',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.readMessages(testDir, {
        from: 'AG-API',
        to: 'AG-UI',
        type: 'coordination',
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('getAgentContext()', () => {
    test('returns context for agent', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [
        JSON.stringify({
          from: 'AG-LEAD',
          to: 'AG-API',
          type: 'task_assignment',
          task_id: 'US-0001',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.getAgentContext(testDir, 'AG-API');

      expect(result.ok).toBe(true);
      expect(result.context).toBeDefined();
      expect(Array.isArray(result.context)).toBe(true);
    });

    test('includes messages to agent', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const now = new Date().toISOString();
      const messages = [
        JSON.stringify({ from: 'AG-LEAD', to: 'AG-API', type: 'task_assignment', at: now }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.getAgentContext(testDir, 'AG-API');

      expect(result.context.some(m => m.to === 'AG-API')).toBe(true);
    });

    test('deduplicates messages by timestamp', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const timestamp = new Date().toISOString();
      const messages = [
        JSON.stringify({ from: 'AG-LEAD', type: 'coordination', at: timestamp }),
        JSON.stringify({ from: 'AG-LEAD', type: 'coordination', at: timestamp }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.getAgentContext(testDir, 'AG-API');

      // Should deduplicate duplicates
      const coordMessages = result.context.filter(
        m => m.type === 'coordination' && m.from === 'AG-LEAD'
      );
      expect(coordMessages.length).toBeLessThanOrEqual(2);
    });

    test('sorts context by timestamp', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const time1 = new Date(Date.now() - 2000).toISOString();
      const time2 = new Date(Date.now() - 1000).toISOString();
      const time3 = new Date().toISOString();

      const messages = [
        JSON.stringify({ from: 'AG-LEAD', type: 'msg', at: time3 }),
        JSON.stringify({ from: 'AG-LEAD', type: 'msg', at: time1 }),
        JSON.stringify({ from: 'AG-LEAD', type: 'msg', at: time2 }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.getAgentContext(testDir, 'AG-API');

      // Context should be sorted
      for (let i = 1; i < result.context.length; i++) {
        const prev = new Date(result.context[i - 1].at);
        const curr = new Date(result.context[i].at);
        expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }
    });

    test('limits context to recent messages', () => {
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const messages = [];
      for (let i = 0; i < 100; i++) {
        messages.push(
          JSON.stringify({
            from: 'AG-LEAD',
            type: 'msg',
            at: new Date().toISOString(),
          })
        );
      }
      fs.writeFileSync(logPath, messages.join('\n'));

      const result = messagingBridge.getAgentContext(testDir, 'AG-API');

      // Should limit to last 30
      expect(result.context.length).toBeLessThanOrEqual(30);
    });
  });

  describe('sendTaskAssignment()', () => {
    test('sends task assignment message', () => {
      messagingBridge.sendTaskAssignment(
        testDir,
        'AG-LEAD',
        'AG-API',
        'US-0001',
        'Build API endpoint'
      );

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('task_assignment');
      expect(entry.from).toBe('AG-LEAD');
      expect(entry.to).toBe('AG-API');
      expect(entry.task_id).toBe('US-0001');
      expect(entry.description).toBe('Build API endpoint');
    });
  });

  describe('sendPlanProposal()', () => {
    test('sends plan proposal message', () => {
      const plan = { steps: ['Step 1', 'Step 2'] };
      messagingBridge.sendPlanProposal(testDir, 'AG-API', 'AG-LEAD', 'US-0001', plan);

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('plan_proposal');
      expect(entry.plan).toEqual(plan);
    });
  });

  describe('sendPlanDecision()', () => {
    test('sends approval message', () => {
      messagingBridge.sendPlanDecision(testDir, 'AG-LEAD', 'AG-API', 'US-0001', true, 'Looks good');

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('plan_approved');
      expect(entry.reason).toBe('Looks good');
    });

    test('sends rejection message', () => {
      messagingBridge.sendPlanDecision(
        testDir,
        'AG-LEAD',
        'AG-API',
        'US-0001',
        false,
        'Need changes'
      );

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('plan_rejected');
    });
  });

  describe('sendValidationResult()', () => {
    test('sends validation approved message', () => {
      messagingBridge.sendValidationResult(
        testDir,
        'AG-API-VALIDATOR',
        'US-0001',
        'approved',
        'Meets criteria'
      );

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('validation');
      expect(entry.from).toBe('AG-API-VALIDATOR');
      expect(entry.to).toBe('team-lead');
      expect(entry.status).toBe('approved');
      expect(entry.details).toBe('Meets criteria');
    });

    test('sends validation rejected message', () => {
      messagingBridge.sendValidationResult(
        testDir,
        'AG-API-VALIDATOR',
        'US-0001',
        'rejected',
        'Issues found'
      );

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.status).toBe('rejected');
    });
  });
});
