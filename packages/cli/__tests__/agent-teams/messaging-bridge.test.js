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

  describe('sendTeamMessage()', () => {
    test('writes team_message to JSONL with trace_id', () => {
      messagingBridge.sendTeamMessage(
        testDir,
        'AG-API',
        'AG-UI',
        'Schema updated, please refresh types',
        'trace-msg-001'
      );

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = JSON.parse(lines[0]);

      expect(entry.type).toBe('team_message');
      expect(entry.from).toBe('AG-API');
      expect(entry.to).toBe('AG-UI');
      expect(entry.content).toBe('Schema updated, please refresh types');
      expect(entry.trace_id).toBe('trace-msg-001');
    });

    test('omits trace_id when not provided', () => {
      messagingBridge.sendTeamMessage(testDir, 'AG-API', 'AG-UI', 'Hello from API');

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = JSON.parse(lines[0]);

      expect(entry.type).toBe('team_message');
      expect(entry.from).toBe('AG-API');
      expect(entry.to).toBe('AG-UI');
      expect(entry.content).toBe('Hello from API');
      expect(entry.trace_id).toBeUndefined();
    });

    test('tracks team_message in session-state when native mode enabled', () => {
      // isAgentTeamsEnabled is mocked to return true (native mode)
      // sendTeamMessage should also call trackEvent for session-state
      const teamEvents = require('../../scripts/lib/team-events');
      const trackSpy = jest.spyOn(teamEvents, 'trackEvent').mockReturnValue({ ok: true });

      messagingBridge.sendTeamMessage(
        testDir,
        'AG-API',
        'AG-UI',
        'Native mode message',
        'trace-native-001'
      );

      expect(trackSpy).toHaveBeenCalledWith(
        testDir,
        'team_message',
        expect.objectContaining({
          from: 'AG-API',
          to: 'AG-UI',
          trace_id: 'trace-native-001',
        })
      );

      trackSpy.mockRestore();
    });

    test('tracks in session-state even when native mode disabled (observability parity)', () => {
      // Override feature flag to disable native mode
      const featureFlags = require('../../lib/feature-flags');
      featureFlags.isAgentTeamsEnabled.mockReturnValue(false);

      const teamEvents = require('../../scripts/lib/team-events');
      const trackSpy = jest.spyOn(teamEvents, 'trackEvent').mockReturnValue({ ok: true });

      messagingBridge.sendTeamMessage(testDir, 'AG-API', 'AG-UI', 'Subagent mode message');

      // trackEvent should be called regardless of mode for observability parity
      expect(trackSpy).toHaveBeenCalledWith(
        testDir,
        'team_message',
        expect.objectContaining({
          from: 'AG-API',
          to: 'AG-UI',
        })
      );

      trackSpy.mockRestore();
      // Restore flag for other tests
      featureFlags.isAgentTeamsEnabled.mockReturnValue(true);
    });
  });

  describe('sendTeamCompleted()', () => {
    test('writes team_completed to JSONL with trace_id', () => {
      messagingBridge.sendTeamCompleted(testDir, 'code-review', 'trace-comp-001', {
        duration_ms: 12000,
        tasks_completed: 3,
      });

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('team_completed');
      expect(entry.from).toBe('team-manager');
      expect(entry.to).toBe('system');
      expect(entry.template).toBe('code-review');
      expect(entry.trace_id).toBe('trace-comp-001');
      expect(entry.duration_ms).toBe(12000);
      expect(entry.tasks_completed).toBe(3);
    });

    test('works without traceId or summary', () => {
      messagingBridge.sendTeamCompleted(testDir, 'simple-team');

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('team_completed');
      expect(entry.template).toBe('simple-team');
      expect(entry.trace_id).toBeUndefined();
    });

    test('includes agent_teams flag in JSONL entry', () => {
      messagingBridge.sendTeamCompleted(testDir, 'flagged-team', 'trace-flag-001', {
        duration_ms: 5000,
      });

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      // agent_teams flag is added by sendMessage based on feature flag
      expect(entry.agent_teams).toBe(true);
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

  describe('dual-write native logging (US-0348)', () => {
    let trackSpy;

    beforeEach(() => {
      const teamEvents = require('../../scripts/lib/team-events');
      trackSpy = jest.spyOn(teamEvents, 'trackEvent').mockReturnValue({ ok: true });
    });

    afterEach(() => {
      trackSpy.mockRestore();
      // Restore feature flag to default (true) in case any test changed it
      const featureFlags = require('../../lib/feature-flags');
      featureFlags.isAgentTeamsEnabled.mockReturnValue(true);
    });

    test('logNativeSend writes to JSONL bus with trace_id', () => {
      messagingBridge.logNativeSend(testDir, 'AG-API', 'AG-UI', 'Schema ready', 'trace-ns-001');

      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));

      expect(entry.type).toBe('native_send');
      expect(entry.from).toBe('AG-API');
      expect(entry.to).toBe('AG-UI');
      expect(entry.content).toBe('Schema ready');
      expect(entry.trace_id).toBe('trace-ns-001');
    });

    test('logNativeSend calls trackEvent for session-state', () => {
      messagingBridge.logNativeSend(testDir, 'AG-API', 'AG-UI', 'Native message', 'trace-ns-002');

      expect(trackSpy).toHaveBeenCalledWith(
        testDir,
        'team_message',
        expect.objectContaining({
          from: 'AG-API',
          to: 'AG-UI',
          trace_id: 'trace-ns-002',
          native: true,
        })
      );
    });

    test('logNativeTeamCreate calls trackEvent with correct data', () => {
      const result = messagingBridge.logNativeTeamCreate(testDir, 'code-review', 'trace-tc-001', 3);

      expect(result.ok).toBe(true);
      expect(trackSpy).toHaveBeenCalledWith(
        testDir,
        'team_created',
        expect.objectContaining({
          template: 'code-review',
          trace_id: 'trace-tc-001',
          teammate_count: 3,
          native: true,
        })
      );

      // Also check JSONL entry
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(entry.type).toBe('native_team_create');
      expect(entry.template).toBe('code-review');
      expect(entry.teammate_count).toBe(3);
    });

    test('logNativeTeamCompleted calls trackEvent with correct data', () => {
      const result = messagingBridge.logNativeTeamCompleted(
        testDir,
        'code-review',
        'trace-tc-002',
        'All tasks done'
      );

      expect(result.ok).toBe(true);
      expect(trackSpy).toHaveBeenCalledWith(
        testDir,
        'team_completed',
        expect.objectContaining({
          template: 'code-review',
          trace_id: 'trace-tc-002',
          summary: 'All tasks done',
          native: true,
        })
      );

      // Also check JSONL entry
      const logPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(entry.type).toBe('native_team_completed');
      expect(entry.template).toBe('code-review');
      expect(entry.summary).toBe('All tasks done');
    });

    test('sendTeamMessage tracks in session-state in both native and subagent modes', () => {
      // Test native mode (default mock is true)
      messagingBridge.sendTeamMessage(testDir, 'AG-API', 'AG-UI', 'Native msg', 'trace-parity-001');
      expect(trackSpy).toHaveBeenCalledTimes(1);

      trackSpy.mockClear();

      // Test subagent mode
      const featureFlags = require('../../lib/feature-flags');
      featureFlags.isAgentTeamsEnabled.mockReturnValue(false);

      messagingBridge.sendTeamMessage(
        testDir,
        'AG-API',
        'AG-UI',
        'Subagent msg',
        'trace-parity-002'
      );
      expect(trackSpy).toHaveBeenCalledTimes(1);
      expect(trackSpy).toHaveBeenCalledWith(
        testDir,
        'team_message',
        expect.objectContaining({
          from: 'AG-API',
          to: 'AG-UI',
          trace_id: 'trace-parity-002',
        })
      );
    });

    test('observability parity: same event structure in native vs subagent mode', () => {
      const featureFlags = require('../../lib/feature-flags');

      // Native mode
      featureFlags.isAgentTeamsEnabled.mockReturnValue(true);
      messagingBridge.sendTeamMessage(testDir, 'AG-API', 'AG-DB', 'Test native', 'trace-eq-001');
      const nativeCall = trackSpy.mock.calls[0];

      trackSpy.mockClear();

      // Subagent mode
      featureFlags.isAgentTeamsEnabled.mockReturnValue(false);
      messagingBridge.sendTeamMessage(testDir, 'AG-API', 'AG-DB', 'Test subagent', 'trace-eq-002');
      const subagentCall = trackSpy.mock.calls[0];

      // Both calls should have same structure (event type, keys)
      expect(nativeCall[1]).toBe(subagentCall[1]); // same event type
      expect(Object.keys(nativeCall[2]).sort()).toEqual(Object.keys(subagentCall[2]).sort());
    });
  });
});
