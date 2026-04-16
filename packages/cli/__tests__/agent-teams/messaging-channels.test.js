/**
 * Tests for channel-based message scoping and message budget in messaging-bridge.js
 *
 * Covers:
 * - Channel assignment on messages (default to 'general')
 * - Channel filtering in readMessages()
 * - Channel-aware getAgentContext()
 * - Sequence number assignment per trace_id
 * - Global message budget enforcement (50/session)
 * - Backward compatibility (no channel field = general)
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
  isAgentTeamsEnabled: jest.fn(() => false),
}));

describe('messaging-bridge channels & budget', () => {
  let testDir;
  let messagingBridge;
  let logPath;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-channels-test-'));
    fs.mkdirSync(path.join(testDir, 'docs', '09-agents', 'bus'), { recursive: true });
    logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');

    delete require.cache[require.resolve('../../scripts/messaging-bridge')];
    messagingBridge = require('../../scripts/messaging-bridge');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // Channel assignment
  // =========================================================================

  describe('channel assignment', () => {
    test('messages default to general channel', () => {
      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        to: 'AG-UI',
        type: 'coordination',
        message: 'Hello',
      });

      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(entry.channel).toBe('general');
    });

    test('explicit channel is preserved', () => {
      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        to: 'AG-UI',
        type: 'coordination',
        message: 'Frontend update',
        channel: 'frontend',
      });

      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(entry.channel).toBe('frontend');
    });

    test('sendTeamMessage accepts channel parameter', () => {
      messagingBridge.sendTeamMessage(
        testDir,
        'AG-API',
        'AG-UI',
        'Backend schema updated',
        'trace-001',
        'backend'
      );

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = JSON.parse(lines[0]);
      expect(entry.channel).toBe('backend');
      expect(entry.type).toBe('team_message');
    });

    test('sendTeamMessage defaults to general when no channel', () => {
      messagingBridge.sendTeamMessage(testDir, 'AG-API', 'AG-UI', 'Hello');

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = JSON.parse(lines[0]);
      expect(entry.channel).toBe('general');
    });
  });

  // =========================================================================
  // Channel filtering
  // =========================================================================

  describe('channel filtering in readMessages()', () => {
    beforeEach(() => {
      const messages = [
        JSON.stringify({
          from: 'AG-API',
          channel: 'backend',
          type: 'msg',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-UI',
          channel: 'frontend',
          type: 'msg',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-SEC',
          channel: 'security-review',
          type: 'msg',
          at: new Date().toISOString(),
        }),
        JSON.stringify({ from: 'AG-LEAD', type: 'msg', at: new Date().toISOString() }), // No channel = general
      ];
      fs.writeFileSync(logPath, messages.join('\n'));
    });

    test('filters messages by channel', () => {
      const result = messagingBridge.readMessages(testDir, { channel: 'backend' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].from).toBe('AG-API');
    });

    test('filters messages without channel as general', () => {
      const result = messagingBridge.readMessages(testDir, { channel: 'general' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].from).toBe('AG-LEAD');
    });

    test('returns no messages for non-existent channel', () => {
      const result = messagingBridge.readMessages(testDir, { channel: 'nonexistent' });
      expect(result.messages).toHaveLength(0);
    });

    test('channel filter combines with other filters', () => {
      // Add more messages
      const extra = [
        JSON.stringify({
          from: 'AG-API',
          channel: 'backend',
          type: 'coordination',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-API',
          channel: 'backend',
          type: 'task_assignment',
          at: new Date().toISOString(),
        }),
      ];
      fs.appendFileSync(logPath, '\n' + extra.join('\n'));

      const result = messagingBridge.readMessages(testDir, {
        channel: 'backend',
        type: 'coordination',
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('coordination');
    });

    test('no channel filter returns all messages', () => {
      const result = messagingBridge.readMessages(testDir);
      expect(result.messages).toHaveLength(4);
    });
  });

  // =========================================================================
  // Channel-aware getAgentContext()
  // =========================================================================

  describe('channel-aware getAgentContext()', () => {
    beforeEach(() => {
      const messages = [
        JSON.stringify({
          from: 'AG-LEAD',
          to: 'AG-API',
          type: 'task_assignment',
          channel: 'backend',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-LEAD',
          to: 'AG-API',
          type: 'task_assignment',
          channel: 'frontend',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-LEAD',
          type: 'coordination',
          channel: 'backend',
          at: new Date(Date.now() + 1).toISOString(),
        }),
        JSON.stringify({
          from: 'AG-LEAD',
          type: 'coordination',
          channel: 'frontend',
          at: new Date(Date.now() + 2).toISOString(),
        }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));
    });

    test('returns all channels when no channel filter', () => {
      const result = messagingBridge.getAgentContext(testDir, 'AG-API');
      expect(result.ok).toBe(true);
      expect(result.context.length).toBeGreaterThanOrEqual(2);
    });

    test('filters context by allowed channels', () => {
      const result = messagingBridge.getAgentContext(testDir, 'AG-API', {
        channels: ['backend'],
      });
      expect(result.ok).toBe(true);
      // Should only have backend channel messages
      result.context.forEach(m => {
        expect(m.channel || 'general').toBe('backend');
      });
    });

    test('allows multiple channels', () => {
      const result = messagingBridge.getAgentContext(testDir, 'AG-API', {
        channels: ['backend', 'frontend'],
      });
      expect(result.ok).toBe(true);
      expect(result.context.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Backward compatibility
  // =========================================================================

  describe('backward compatibility', () => {
    test('messages without channel field are treated as general', () => {
      // Write legacy messages (no channel field)
      const messages = [
        JSON.stringify({ from: 'AG-API', type: 'msg', at: new Date().toISOString() }),
        JSON.stringify({ from: 'AG-UI', type: 'msg', at: new Date().toISOString() }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      // Read with general channel filter should find them
      const result = messagingBridge.readMessages(testDir, { channel: 'general' });
      expect(result.messages).toHaveLength(2);
    });

    test('mixed legacy and channel messages work together', () => {
      const messages = [
        JSON.stringify({ from: 'AG-API', type: 'msg', at: new Date().toISOString() }), // legacy
        JSON.stringify({
          from: 'AG-UI',
          channel: 'frontend',
          type: 'msg',
          at: new Date().toISOString(),
        }),
        JSON.stringify({
          from: 'AG-SEC',
          channel: 'general',
          type: 'msg',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(logPath, messages.join('\n'));

      const general = messagingBridge.readMessages(testDir, { channel: 'general' });
      expect(general.messages).toHaveLength(2); // legacy + explicit general

      const frontend = messagingBridge.readMessages(testDir, { channel: 'frontend' });
      expect(frontend.messages).toHaveLength(1);
    });
  });

  // =========================================================================
  // Sequence numbers
  // =========================================================================

  describe('sequence numbers', () => {
    test('assigns sequence numbers when trace_id is present', () => {
      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'msg',
        trace_id: 'trace-seq-001',
      });

      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(entry.seq).toBe(1);
    });

    test('sequence numbers are monotonically increasing per trace_id', () => {
      for (let i = 0; i < 5; i++) {
        messagingBridge.sendMessage(testDir, {
          from: 'AG-API',
          type: 'msg',
          trace_id: 'trace-seq-002',
        });
      }

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const seqs = lines.map(l => JSON.parse(l).seq);
      expect(seqs).toEqual([1, 2, 3, 4, 5]);
    });

    test('different trace_ids have independent sequences', () => {
      messagingBridge.sendMessage(testDir, { from: 'A', type: 'msg', trace_id: 'trace-a' });
      messagingBridge.sendMessage(testDir, { from: 'B', type: 'msg', trace_id: 'trace-b' });
      messagingBridge.sendMessage(testDir, { from: 'A', type: 'msg', trace_id: 'trace-a' });

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entries = lines.map(l => JSON.parse(l));

      expect(entries[0].seq).toBe(1); // trace-a first
      expect(entries[1].seq).toBe(1); // trace-b first
      expect(entries[2].seq).toBe(2); // trace-a second
    });

    test('no sequence number when no trace_id', () => {
      messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'msg',
      });

      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(entry.seq).toBeUndefined();
    });
  });

  // =========================================================================
  // Message budget
  // =========================================================================

  describe('message budget', () => {
    test('checkMessageBudget returns count for trace_id', () => {
      for (let i = 0; i < 5; i++) {
        messagingBridge.sendMessage(testDir, {
          from: 'AG-API',
          type: 'msg',
          trace_id: 'trace-budget-001',
        });
      }

      const budget = messagingBridge.checkMessageBudget(logPath, 'trace-budget-001');
      expect(budget.count).toBe(5);
      expect(budget.exceeded).toBe(false);
      expect(budget.limit).toBe(50);
    });

    test('checkMessageBudget returns exceeded when at limit', () => {
      // Write 50 messages directly to avoid the budget check in sendMessage
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push(
          JSON.stringify({
            from: 'AG-API',
            type: 'msg',
            trace_id: 'trace-budget-002',
            seq: i + 1,
            at: new Date().toISOString(),
          })
        );
      }
      fs.writeFileSync(logPath, lines.join('\n'));

      const budget = messagingBridge.checkMessageBudget(logPath, 'trace-budget-002');
      expect(budget.exceeded).toBe(true);
      expect(budget.count).toBe(50);
    });

    test('sendMessage blocks when budget exceeded', () => {
      // Write 50 messages directly
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push(
          JSON.stringify({
            from: 'AG-API',
            type: 'msg',
            trace_id: 'trace-budget-003',
            seq: i + 1,
            at: new Date().toISOString(),
          })
        );
      }
      fs.writeFileSync(logPath, lines.join('\n'));

      // Try to send one more
      const result = messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'msg',
        trace_id: 'trace-budget-003',
      });

      expect(result.ok).toBe(false);
      expect(result.budget_exceeded).toBe(true);
      expect(result.error).toMatch(/budget exceeded/i);
    });

    test('budget applies per trace_id not globally', () => {
      // Write 50 messages for trace-a
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push(
          JSON.stringify({
            from: 'AG-API',
            type: 'msg',
            trace_id: 'trace-a-full',
            seq: i + 1,
            at: new Date().toISOString(),
          })
        );
      }
      fs.writeFileSync(logPath, lines.join('\n'));

      // trace-b should still work
      const result = messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'msg',
        trace_id: 'trace-b-ok',
      });
      expect(result.ok).toBe(true);
    });

    test('messages without trace_id are not budget-limited', () => {
      const result = messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'msg',
      });
      expect(result.ok).toBe(true);
      expect(result.budget_remaining).toBeUndefined();
    });

    test('sendMessage returns budget_remaining', () => {
      const result = messagingBridge.sendMessage(testDir, {
        from: 'AG-API',
        type: 'msg',
        trace_id: 'trace-remaining-001',
      });

      expect(result.ok).toBe(true);
      expect(result.budget_remaining).toBe(49); // 50 - 1
    });

    test('checkMessageBudget returns 0 count for unknown trace_id', () => {
      const budget = messagingBridge.checkMessageBudget(logPath, 'nonexistent-trace');
      expect(budget.count).toBe(0);
      expect(budget.exceeded).toBe(false);
    });

    test('checkMessageBudget handles missing log file', () => {
      const missingPath = path.join(testDir, 'nonexistent.jsonl');
      const budget = messagingBridge.checkMessageBudget(missingPath, 'trace-001');
      expect(budget.count).toBe(0);
      expect(budget.exceeded).toBe(false);
    });
  });

  // =========================================================================
  // Constants export
  // =========================================================================

  describe('exported constants', () => {
    test('DEFAULT_CHANNEL is general', () => {
      expect(messagingBridge.DEFAULT_CHANNEL).toBe('general');
    });

    test('MESSAGE_BUDGET_PER_SESSION is 50', () => {
      expect(messagingBridge.MESSAGE_BUDGET_PER_SESSION).toBe(50);
    });
  });
});
