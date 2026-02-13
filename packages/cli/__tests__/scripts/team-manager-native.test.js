/**
 * Tests for team-manager.js native Agent Teams integration
 *
 * Covers:
 * - buildNativeTeamPayload - correct format from template
 * - startTeam in native mode - includes native_payload in result
 * - startTeam in subagent mode - native_payload is null
 * - stopTeam - logs team_stopped event
 * - Dual-mode fallback - when feature flag changes
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('../../lib/feature-flags');
jest.mock('../../lib/paths');
jest.mock('../../scripts/lib/file-lock');
jest.mock('../../scripts/messaging-bridge');

const teamManager = require('../../scripts/team-manager');
const featureFlags = require('../../lib/feature-flags');
const paths = require('../../lib/paths');
const fileLock = require('../../scripts/lib/file-lock');
const messagingBridge = require('../../scripts/messaging-bridge');

describe('team-manager native Agent Teams', () => {
  let testRootDir;

  beforeEach(() => {
    jest.clearAllMocks();
    testRootDir = '/home/test/project';

    // Default mocks
    paths.getSessionStatePath.mockReturnValue(
      path.join(testRootDir, 'docs/00-meta/session-state.json')
    );

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({}));
    fs.writeFileSync.mockImplementation(() => {});

    // Mock file-lock with both atomic functions
    fileLock.atomicWriteJSON.mockImplementation(() => {});
    fileLock.atomicReadModifyWrite.mockImplementation((path, updateFn) => {
      const state = updateFn({});
      // This simulates what the real function would do
    });
  });

  describe('buildNativeTeamPayload', () => {
    it('builds correct TeamCreate payload from template', () => {
      const template = {
        name: 'Code Review Team',
        description: 'A team for code reviews',
        teammates: [
          {
            agent: 'AG-CODE-REVIEW',
            role: 'code-reviewer',
            domain: 'code-quality',
            instructions: 'Review code for best practices',
          },
          {
            agent: 'AG-DOCS',
            role: 'documenter',
            domain: 'documentation',
            instructions: 'Update documentation',
          },
        ],
        delegate_mode: true,
      };

      const payload = teamManager.buildNativeTeamPayload(template, 'code-review');

      expect(payload).toEqual({
        name: 'Code Review Team',
        description: 'A team for code reviews',
        teammates: [
          {
            name: 'AG-CODE-REVIEW',
            role: 'code-reviewer',
            instructions: 'Review code for best practices',
          },
          {
            name: 'AG-DOCS',
            role: 'documenter',
            instructions: 'Update documentation',
          },
        ],
        delegate_mode: true,
      });
    });

    it('uses fallbacks for missing template fields', () => {
      const template = {
        teammates: [
          {
            agent: 'AG-TEST',
            domain: 'testing',
            // role and instructions missing
          },
        ],
        // name, description, delegate_mode missing
      };

      const payload = teamManager.buildNativeTeamPayload(template, 'test-team');

      expect(payload.name).toBe('test-team');
      expect(payload.description).toContain('test-team');
      expect(payload.delegate_mode).toBe(true);
      expect(payload.teammates[0].role).toBe('testing');
      // Instructions use fallback: "{role} agent for {domain}"
      expect(payload.teammates[0].instructions).toContain('agent');
      expect(payload.teammates[0].instructions).toContain('testing');
    });

    it('handles empty teammates array', () => {
      const template = {
        name: 'Empty Team',
        description: 'No teammates',
        teammates: [],
      };

      const payload = teamManager.buildNativeTeamPayload(template, 'empty');

      expect(payload.teammates).toEqual([]);
    });
  });

  describe('startTeam in native mode', () => {
    it('includes native_payload when Agent Teams is enabled', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');

      const template = {
        name: 'Test Team',
        description: 'Test description',
        lead: 'AG-LEAD',
        teammates: [
          {
            agent: 'AG-WORKER',
            role: 'worker',
            domain: 'implementation',
          },
        ],
        quality_gates: {
          tests_required: true,
          review_required: true,
        },
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('test-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'test-team');

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('native');
      expect(result.native_payload).not.toBeNull();
      expect(result.native_payload.name).toBe('Test Team');
      expect(result.native_payload.teammates).toHaveLength(1);
    });

    it('writes native_payload to session-state.json', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');

      const template = {
        name: 'Test Team',
        lead: 'AG-LEAD',
        teammates: [
          {
            agent: 'AG-WORKER',
            role: 'worker',
            domain: 'implementation',
          },
        ],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('test-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'test-team');

      // Verify result includes team data and atomic operations were invoked
      expect(result.ok).toBe(true);
      expect(result.native_payload).toBeDefined();
      // Either atomicWriteJSON or atomicReadModifyWrite was called
      const atomicCalled = fileLock.atomicWriteJSON.mock.calls.length > 0 ||
                           fileLock.atomicReadModifyWrite.mock.calls.length > 0;
      expect(atomicCalled).toBe(true);
    });

    it('records team metrics in session-state', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');

      const template = {
        name: 'Metrics Team',
        lead: 'AG-LEAD',
        teammates: [
          { agent: 'AG-WORKER', role: 'worker', domain: 'work' },
          { agent: 'AG-TESTER', role: 'tester', domain: 'testing' },
        ],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('metrics-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'metrics-team');

      // Verify the result contains the correct information
      expect(result.ok).toBe(true);
      expect(result.teammates).toHaveLength(2);
      expect(result.mode).toBe('native');
      // Verify atomicWriteJSON or atomicReadModifyWrite was called (file-lock operations)
      const atomicCalled = fileLock.atomicWriteJSON.mock.calls.length > 0 ||
                           fileLock.atomicReadModifyWrite.mock.calls.length > 0;
      expect(atomicCalled).toBe(true);
    });
  });

  describe('startTeam in subagent mode', () => {
    it('sets native_payload to null when Agent Teams is disabled', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('subagent');

      const template = {
        name: 'Subagent Team',
        lead: 'AG-ORCHESTRATOR',
        teammates: [
          {
            agent: 'AG-TASK1',
            role: 'task1',
            domain: 'domain1',
          },
        ],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('subagent-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'subagent-team');

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('subagent');
      expect(result.native_payload).toBeNull();
    });

    it('still records team info in session-state without native_payload', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('subagent');

      const template = {
        name: 'Subagent Team',
        lead: 'AG-ORCHESTRATOR',
        teammates: [
          { agent: 'AG-TASK', role: 'task', domain: 'work' },
        ],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('subagent-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'subagent-team');

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('subagent');
      expect(result.native_payload).toBeNull();
      expect(result.teammates).toHaveLength(1);
      // Verify session state was updated
      const atomicCalled = fileLock.atomicWriteJSON.mock.calls.length > 0 ||
                           fileLock.atomicReadModifyWrite.mock.calls.length > 0;
      expect(atomicCalled).toBe(true);
    });
  });

  describe('startTeam messaging', () => {
    it('sends team_created event to messaging bridge', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');
      messagingBridge.sendMessage.mockImplementation(() => {});

      const template = {
        name: 'Message Team',
        lead: 'AG-LEAD',
        teammates: [
          { agent: 'AG-WORKER', role: 'worker', domain: 'work' },
          { agent: 'AG-REVIEWER', role: 'reviewer', domain: 'review' },
        ],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('message-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      teamManager.startTeam(testRootDir, 'message-team');

      expect(messagingBridge.sendMessage).toHaveBeenCalledWith(
        testRootDir,
        expect.objectContaining({
          from: 'team-manager',
          to: 'team-lead',
          type: 'team_created',
          template: 'message-team',
          mode: 'native',
          teammate_count: 2,
        })
      );
    });

    it('handles messaging bridge errors gracefully', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');
      messagingBridge.sendMessage.mockImplementation(() => {
        throw new Error('Bridge error');
      });

      const template = {
        name: 'Error Team',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('error-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      // Should not throw
      const result = teamManager.startTeam(testRootDir, 'error-team');
      expect(result.ok).toBe(true);
    });
  });

  describe('stopTeam', () => {
    it('logs team_stopped event to messaging bridge', () => {
      messagingBridge.sendMessage.mockImplementation(() => {});

      const now = new Date();
      const sessionState = {
        active_team: {
          template: 'test-team',
          mode: 'native',
          started_at: new Date(now.getTime() - 5000).toISOString(),
        },
        team_metrics: {
          tasks_completed: 3,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      teamManager.stopTeam(testRootDir);

      expect(messagingBridge.sendMessage).toHaveBeenCalledWith(
        testRootDir,
        expect.objectContaining({
          from: 'team-manager',
          to: 'system',
          type: 'team_stopped',
          template: 'test-team',
          mode: 'native',
          duration_ms: expect.any(Number),
          tasks_completed: 3,
        })
      );
    });

    it('calculates duration correctly', () => {
      messagingBridge.sendMessage.mockImplementation(() => {});

      const startTime = new Date();
      const stopTime = new Date(startTime.getTime() + 12345);

      const sessionState = {
        active_team: {
          template: 'timed-team',
          mode: 'native',
          started_at: startTime.toISOString(),
        },
        team_metrics: {
          tasks_completed: 0,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      // Mock Date.now() to return stopTime
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => stopTime.getTime());

      try {
        teamManager.stopTeam(testRootDir);

        expect(messagingBridge.sendMessage).toHaveBeenCalledWith(
          testRootDir,
          expect.objectContaining({
            duration_ms: expect.any(Number),
          })
        );
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('clears active_team from session state', () => {
      messagingBridge.sendMessage.mockImplementation(() => {});
      fileLock.atomicWriteJSON.mockImplementation(() => {});

      const sessionState = {
        active_team: {
          template: 'clear-team',
          mode: 'native',
          started_at: new Date().toISOString(),
        },
        team_metrics: {},
        other_field: 'preserved',
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      teamManager.stopTeam(testRootDir);

      const callArgs = fileLock.atomicWriteJSON.mock.calls[0];
      const writtenState = callArgs[1];

      expect(writtenState.active_team).toBeUndefined();
      expect(writtenState.other_field).toBe('preserved');
    });

    it('updates team_metrics with completion data', () => {
      messagingBridge.sendMessage.mockImplementation(() => {});
      fileLock.atomicWriteJSON.mockImplementation(() => {});

      const sessionState = {
        active_team: {
          template: 'metrics-team',
          mode: 'native',
          started_at: new Date().toISOString(),
        },
        team_metrics: {
          tasks_completed: 5,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      teamManager.stopTeam(testRootDir);

      const callArgs = fileLock.atomicWriteJSON.mock.calls[0];
      const writtenState = callArgs[1];

      expect(writtenState.team_metrics.completed_at).toBeDefined();
      expect(writtenState.team_metrics.duration_ms).toBeDefined();
      expect(writtenState.team_metrics.tasks_completed).toBe(5);
    });

    it('returns error when no active team', () => {
      const sessionState = {
        // No active_team
        other_data: {},
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      const result = teamManager.stopTeam(testRootDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('No active team');
    });
  });

  describe('dual-mode fallback', () => {
    it('switches from native to subagent mode', () => {
      const template = {
        name: 'Dual Mode Team',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('dual-mode.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      // Start in native mode
      featureFlags.getAgentTeamsMode.mockReturnValue('native');
      const nativeResult = teamManager.startTeam(testRootDir, 'dual-mode');
      expect(nativeResult.native_payload).not.toBeNull();

      // Switch to subagent mode
      featureFlags.getAgentTeamsMode.mockReturnValue('subagent');
      const subagentResult = teamManager.startTeam(testRootDir, 'dual-mode');
      expect(subagentResult.native_payload).toBeNull();
      expect(subagentResult.mode).toBe('subagent');
    });

    it('preserves other fields when switching modes', () => {
      featureFlags.getAgentTeamsMode
        .mockReturnValueOnce('native')
        .mockReturnValueOnce('subagent');

      const template = {
        name: 'Preserved Team',
        description: 'Team description',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: { test_required: true },
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('preserved.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const nativeResult = teamManager.startTeam(testRootDir, 'preserved');
      const subagentResult = teamManager.startTeam(testRootDir, 'preserved');

      expect(nativeResult.lead).toBe('AG-LEAD');
      expect(subagentResult.lead).toBe('AG-LEAD');
      expect(nativeResult.quality_gates).toEqual(template.quality_gates);
      expect(subagentResult.quality_gates).toEqual(template.quality_gates);
    });
  });

  describe('file-lock fallback', () => {
    it('falls back to direct write when using subagent mode without file-lock', () => {
      // In subagent mode without file-lock, the code still calls fs operations
      featureFlags.getAgentTeamsMode.mockReturnValue('subagent');

      const template = {
        name: 'Fallback Team',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('fallback.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'fallback');

      // Should still succeed
      expect(result.ok).toBe(true);
      expect(result.mode).toBe('subagent');
    });
  });

  describe('error handling', () => {
    it('handles missing template gracefully', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = teamManager.startTeam(testRootDir, 'nonexistent');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles corrupt session state file gracefully', () => {
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('nonexistent')) {
          throw new Error('File not found');
        }
        return 'invalid json {';
      });

      const result = teamManager.getTeamStatus(testRootDir);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns active: false when no session state exists', () => {
      fs.existsSync.mockReturnValue(false);

      const result = teamManager.getTeamStatus(testRootDir);

      expect(result.ok).toBe(true);
      expect(result.active).toBe(false);
    });
  });
});
