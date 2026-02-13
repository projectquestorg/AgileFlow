/**
 * Tests for trace_id propagation in messaging-bridge helper functions (US-0342)
 *
 * Verifies that sendTaskAssignment, sendPlanProposal, sendPlanDecision,
 * and sendValidationResult pass trace_id through to sendMessage.
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('../../lib/paths');
jest.mock('../../lib/feature-flags');

// Don't mock messaging-bridge itself - we test the real helpers
const messagingBridge = require('../../scripts/messaging-bridge');
const featureFlags = require('../../lib/feature-flags');
const pathsMock = require('../../lib/paths');

describe('messaging-bridge trace_id propagation', () => {
  const testRootDir = '/tmp/test-trace';
  const busLogPath = path.join(testRootDir, 'docs/09-agents/bus/log.jsonl');

  beforeEach(() => {
    jest.clearAllMocks();

    pathsMock.getBusLogPath.mockReturnValue(busLogPath);
    featureFlags.isAgentTeamsEnabled.mockReturnValue(false);

    fs.existsSync.mockReturnValue(true);
    fs.appendFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
  });

  function getLastAppendedEntry() {
    const calls = fs.appendFileSync.mock.calls;
    if (calls.length === 0) return null;
    const lastLine = calls[calls.length - 1][1];
    return JSON.parse(lastLine.trim());
  }

  describe('sendTaskAssignment', () => {
    it('includes trace_id when provided', () => {
      messagingBridge.sendTaskAssignment(
        testRootDir,
        'lead',
        'worker',
        'task_1',
        'Build feature',
        'trace-aaa'
      );

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBe('trace-aaa');
      expect(entry.type).toBe('task_assignment');
      expect(entry.task_id).toBe('task_1');
    });

    it('omits trace_id when not provided', () => {
      messagingBridge.sendTaskAssignment(testRootDir, 'lead', 'worker', 'task_1', 'Build feature');

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBeUndefined();
      expect(entry.type).toBe('task_assignment');
    });
  });

  describe('sendPlanProposal', () => {
    it('includes trace_id when provided', () => {
      messagingBridge.sendPlanProposal(
        testRootDir,
        'worker',
        'lead',
        'task_1',
        'My plan here',
        'trace-bbb'
      );

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBe('trace-bbb');
      expect(entry.type).toBe('plan_proposal');
    });

    it('omits trace_id when not provided', () => {
      messagingBridge.sendPlanProposal(testRootDir, 'worker', 'lead', 'task_1', 'My plan');

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBeUndefined();
    });
  });

  describe('sendPlanDecision', () => {
    it('includes trace_id when approving', () => {
      messagingBridge.sendPlanDecision(
        testRootDir,
        'lead',
        'worker',
        'task_1',
        true,
        'Looks good',
        'trace-ccc'
      );

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBe('trace-ccc');
      expect(entry.type).toBe('plan_approved');
    });

    it('includes trace_id when rejecting', () => {
      messagingBridge.sendPlanDecision(
        testRootDir,
        'lead',
        'worker',
        'task_1',
        false,
        'Needs work',
        'trace-ccc'
      );

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBe('trace-ccc');
      expect(entry.type).toBe('plan_rejected');
    });

    it('omits trace_id when not provided', () => {
      messagingBridge.sendPlanDecision(testRootDir, 'lead', 'worker', 'task_1', true, 'OK');

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBeUndefined();
    });
  });

  describe('sendValidationResult', () => {
    it('includes trace_id when provided', () => {
      messagingBridge.sendValidationResult(
        testRootDir,
        'validator',
        'task_1',
        'approved',
        { score: 95 },
        'trace-ddd'
      );

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBe('trace-ddd');
      expect(entry.type).toBe('validation');
      expect(entry.status).toBe('approved');
    });

    it('omits trace_id when not provided', () => {
      messagingBridge.sendValidationResult(testRootDir, 'validator', 'task_1', 'approved', {});

      const entry = getLastAppendedEntry();
      expect(entry.trace_id).toBeUndefined();
    });
  });
});
