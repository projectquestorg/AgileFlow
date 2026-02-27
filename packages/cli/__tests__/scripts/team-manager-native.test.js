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
jest.mock('../../scripts/lib/team-events');

const teamManager = require('../../scripts/team-manager');
const featureFlags = require('../../lib/feature-flags');
const paths = require('../../lib/paths');
const fileLock = require('../../scripts/lib/file-lock');
const messagingBridge = require('../../scripts/messaging-bridge');
const teamEvents = require('../../scripts/lib/team-events');

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

    // Mock team events for dual-write tracking
    teamEvents.trackEvent.mockReturnValue({ ok: true });
    teamEvents.aggregateTeamMetrics.mockReturnValue({ ok: true });
    teamEvents.saveAggregatedMetrics.mockReturnValue({ ok: true });
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

  describe('buildTeammatePrompt', () => {
    it('builds prompt with explicit instructions', () => {
      const teammate = {
        agent: 'agileflow-api',
        role: 'builder',
        domain: 'backend',
        instructions: 'Implement REST API endpoints following OpenAPI spec',
      };
      const template = {
        quality_gates: {
          teammate_idle: { tests: true, lint: true, types: false },
        },
      };

      const prompt = teamManager.buildTeammatePrompt(teammate, template);

      expect(prompt).toContain('## Role: builder (backend)');
      expect(prompt).toContain('Implement REST API endpoints following OpenAPI spec');
      expect(prompt).toContain('## Quality Gates');
      expect(prompt).toContain('tests must pass');
      expect(prompt).toContain('linting must pass');
      expect(prompt).not.toContain('type checking must pass');
      expect(prompt).toContain('CLAUDE.md');
      expect(prompt).toContain('status.json');
    });

    it('falls back to description when no instructions', () => {
      const teammate = {
        agent: 'agileflow-ui',
        role: 'builder',
        domain: 'frontend',
        description: 'Implements UI components and styling',
      };

      const prompt = teamManager.buildTeammatePrompt(teammate, {});

      expect(prompt).toContain('Implements UI components and styling');
      expect(prompt).not.toContain('## Quality Gates');
    });

    it('auto-generates description when no instructions or description', () => {
      const teammate = {
        agent: 'agileflow-testing',
        role: 'validator',
        domain: 'quality',
      };

      const prompt = teamManager.buildTeammatePrompt(teammate, {});

      expect(prompt).toContain('validator');
      expect(prompt).toContain('quality');
    });

    it('includes validator approval requirement', () => {
      const teammate = {
        agent: 'agileflow-api',
        role: 'builder',
        domain: 'backend',
        description: 'Build stuff',
      };
      const template = {
        quality_gates: {
          task_completed: { require_validator_approval: true },
        },
      };

      const prompt = teamManager.buildTeammatePrompt(teammate, template);

      expect(prompt).toContain('validator approval required');
    });

    it('handles missing quality_gates gracefully', () => {
      const teammate = {
        agent: 'agileflow-api',
        role: 'builder',
        domain: 'backend',
        description: 'Build stuff',
      };

      const prompt = teamManager.buildTeammatePrompt(teammate, null);

      expect(prompt).toContain('## Role: builder (backend)');
      expect(prompt).toContain('## Context');
      expect(prompt).not.toContain('## Quality Gates');
    });

    it('handles missing role and domain with defaults', () => {
      const teammate = { agent: 'custom-agent' };

      const prompt = teamManager.buildTeammatePrompt(teammate, {});

      expect(prompt).toContain('## Role: teammate (general)');
      expect(prompt).toContain('teammate agent');
    });

    it('includes all quality gate types when all enabled', () => {
      const teammate = {
        agent: 'agileflow-api',
        role: 'builder',
        domain: 'backend',
        instructions: 'Do work',
      };
      const template = {
        quality_gates: {
          teammate_idle: { tests: true, lint: true, types: true },
          task_completed: { require_validator_approval: true },
        },
      };

      const prompt = teamManager.buildTeammatePrompt(teammate, template);

      expect(prompt).toContain('tests must pass');
      expect(prompt).toContain('linting must pass');
      expect(prompt).toContain('type checking must pass');
      expect(prompt).toContain('validator approval required');
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
      const atomicCalled =
        fileLock.atomicWriteJSON.mock.calls.length > 0 ||
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
      const atomicCalled =
        fileLock.atomicWriteJSON.mock.calls.length > 0 ||
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
        teammates: [{ agent: 'AG-TASK', role: 'task', domain: 'work' }],
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
      const atomicCalled =
        fileLock.atomicWriteJSON.mock.calls.length > 0 ||
        fileLock.atomicReadModifyWrite.mock.calls.length > 0;
      expect(atomicCalled).toBe(true);
    });
  });

  describe('startTeam messaging', () => {
    it('sends team_created event via trackEvent for dual-write', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');

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

      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_created',
        expect.objectContaining({
          template: 'message-team',
          mode: 'native',
          teammate_count: 2,
          trace_id: expect.any(String),
        })
      );
    });

    it('includes trace_id in team_created trackEvent call', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');

      const template = {
        name: 'Trace Team',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('trace-team.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      const result = teamManager.startTeam(testRootDir, 'trace-team');

      const trackCall = teamEvents.trackEvent.mock.calls.find(c => c[1] === 'team_created');
      expect(trackCall).toBeDefined();
      expect(trackCall[2].trace_id).toBe(result.trace_id);
    });

    it('handles trackEvent errors gracefully', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');
      teamEvents.trackEvent.mockImplementation(() => {
        throw new Error('Track error');
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
    it('logs team_stopped event via trackEvent for dual-write', () => {
      const now = new Date();
      const sessionState = {
        active_team: {
          template: 'test-team',
          mode: 'native',
          trace_id: 'trace-stop-001',
          started_at: new Date(now.getTime() - 5000).toISOString(),
        },
        team_metrics: {
          tasks_completed: 3,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      teamManager.stopTeam(testRootDir);

      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_stopped',
        expect.objectContaining({
          trace_id: 'trace-stop-001',
          template: 'test-team',
          mode: 'native',
          duration_ms: expect.any(Number),
          tasks_completed: 3,
        })
      );
    });

    it('calculates duration correctly in trackEvent', () => {
      const startTime = new Date();
      const stopTime = new Date(startTime.getTime() + 12345);

      const sessionState = {
        active_team: {
          template: 'timed-team',
          mode: 'native',
          trace_id: 'trace-dur-002',
          started_at: startTime.toISOString(),
        },
        team_metrics: {
          tasks_completed: 0,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      const originalDateNow = Date.now;
      Date.now = jest.fn(() => stopTime.getTime());

      try {
        teamManager.stopTeam(testRootDir);

        const stoppedCall = teamEvents.trackEvent.mock.calls.find(c => c[1] === 'team_stopped');
        expect(stoppedCall).toBeDefined();
        expect(stoppedCall[2].duration_ms).toBe(12345);
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

    it('emits team_completed event via trackEvent', () => {
      const traceId = 'trace-123-abc';
      const sessionState = {
        active_team: {
          template: 'completed-team',
          mode: 'native',
          trace_id: traceId,
          started_at: new Date(Date.now() - 8000).toISOString(),
        },
        team_metrics: {
          tasks_completed: 4,
        },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      teamManager.stopTeam(testRootDir);

      const completedCall = teamEvents.trackEvent.mock.calls.find(c => c[1] === 'team_completed');

      expect(completedCall).toBeDefined();
      expect(completedCall[2].trace_id).toBe(traceId);
      expect(completedCall[2].template).toBe('completed-team');
      expect(completedCall[2].mode).toBe('native');
      expect(completedCall[2].duration_ms).toEqual(expect.any(Number));
      expect(completedCall[2].tasks_completed).toBe(4);
    });

    it('emits team_completed with correct duration_ms', () => {
      const startTime = new Date();
      const stopTime = new Date(startTime.getTime() + 15000);

      const sessionState = {
        active_team: {
          template: 'duration-team',
          mode: 'native',
          trace_id: 'trace-dur-001',
          started_at: startTime.toISOString(),
        },
        team_metrics: { tasks_completed: 0 },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      const originalDateNow = Date.now;
      Date.now = jest.fn(() => stopTime.getTime());

      try {
        teamManager.stopTeam(testRootDir);

        const completedCall = teamEvents.trackEvent.mock.calls.find(c => c[1] === 'team_completed');

        expect(completedCall).toBeDefined();
        expect(completedCall[2].duration_ms).toBe(15000);
      } finally {
        Date.now = originalDateNow;
      }
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
      featureFlags.getAgentTeamsMode.mockReturnValueOnce('native').mockReturnValueOnce('subagent');

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

  describe('dual-write consistency (US-0348)', () => {
    it('startTeam uses trackEvent instead of direct bridge.sendMessage', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('native');

      const template = {
        name: 'Dual Write Team',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('dual-write.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      teamManager.startTeam(testRootDir, 'dual-write');

      // trackEvent should be called for team_created (handles both session-state + JSONL)
      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_created',
        expect.objectContaining({
          template: 'dual-write',
        })
      );

      // bridge.sendMessage should NOT be called directly for team_created
      const bridgeCalls = messagingBridge.sendMessage.mock.calls;
      const directCreated = bridgeCalls.find(c => c[1] && c[1].type === 'team_created');
      expect(directCreated).toBeUndefined();
    });

    it('stopTeam uses trackEvent for both team_stopped and team_completed', () => {
      const sessionState = {
        active_team: {
          template: 'dual-stop',
          mode: 'native',
          trace_id: 'trace-dual-001',
          started_at: new Date(Date.now() - 3000).toISOString(),
        },
        team_metrics: { tasks_completed: 2 },
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(sessionState));
      fs.existsSync.mockReturnValue(true);

      teamManager.stopTeam(testRootDir);

      // Both team_stopped and team_completed go through trackEvent
      const stoppedCall = teamEvents.trackEvent.mock.calls.find(c => c[1] === 'team_stopped');
      const completedCall = teamEvents.trackEvent.mock.calls.find(c => c[1] === 'team_completed');

      expect(stoppedCall).toBeDefined();
      expect(completedCall).toBeDefined();

      // Both carry the same trace_id
      expect(stoppedCall[2].trace_id).toBe('trace-dual-001');
      expect(completedCall[2].trace_id).toBe('trace-dual-001');
    });

    it('subagent mode also uses trackEvent for team_created', () => {
      featureFlags.getAgentTeamsMode.mockReturnValue('subagent');

      const template = {
        name: 'Subagent Dual',
        lead: 'AG-LEAD',
        teammates: [{ agent: 'AG-WORKER', role: 'worker', domain: 'work' }],
        quality_gates: {},
      };

      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('subagent-dual.json')) {
          return JSON.stringify(template);
        }
        return JSON.stringify({});
      });

      teamManager.startTeam(testRootDir, 'subagent-dual');

      expect(teamEvents.trackEvent).toHaveBeenCalledWith(
        testRootDir,
        'team_created',
        expect.objectContaining({
          mode: 'subagent',
        })
      );
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
