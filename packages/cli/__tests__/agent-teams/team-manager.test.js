/**
 * Tests for scripts/team-manager.js
 *
 * Team lifecycle management for Agent Teams.
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
  getMetadataPath: jest.fn(
    root => `${root || '/test/project'}/docs/00-meta/agileflow-metadata.json`
  ),
}));

jest.mock('../../lib/feature-flags', () => ({
  isAgentTeamsEnabled: jest.fn(() => true),
  getAgentTeamsMode: jest.fn(() => 'native'),
}));

describe('team-manager.js', () => {
  let testDir;
  let teamManager;
  const mockTeamTemplate = {
    name: 'test-team',
    description: 'Test team template',
    lead: 'AG-LEAD',
    teammates: [
      {
        agent: 'AG-API',
        role: 'Backend Engineer',
        domain: 'API',
      },
      {
        agent: 'AG-UI',
        role: 'Frontend Engineer',
        domain: 'UI',
      },
    ],
    quality_gates: {
      task_completed: {
        require_validator_approval: false,
      },
    },
    tags: ['backend', 'frontend'],
  };

  beforeEach(() => {
    // Create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-team-manager-test-'));

    // Create directory structure
    fs.mkdirSync(path.join(testDir, '.agileflow', 'teams'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs', '09-agents'), { recursive: true });

    // Write a test template
    fs.writeFileSync(
      path.join(testDir, '.agileflow', 'teams', 'test-team.json'),
      JSON.stringify(mockTeamTemplate)
    );

    // Reset require cache
    delete require.cache[require.resolve('../../scripts/team-manager')];
    teamManager = require('../../scripts/team-manager');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('listTemplates()', () => {
    test('finds templates in teams directory', () => {
      // Add another template
      const anotherTemplate = { ...mockTeamTemplate, name: 'another-team' };
      fs.writeFileSync(
        path.join(testDir, '.agileflow', 'teams', 'another-team.json'),
        JSON.stringify(anotherTemplate)
      );

      const result = teamManager.listTemplates(testDir);

      expect(result.ok).toBe(true);
      expect(result.templates).toHaveLength(2);
      expect(result.templates.map(t => t.name)).toContain('test-team');
      expect(result.templates.map(t => t.name)).toContain('another-team');
    });

    test('returns template metadata', () => {
      const result = teamManager.listTemplates(testDir);

      expect(result.templates[0]).toMatchObject({
        name: 'test-team',
        description: 'Test team template',
        teammates: 2,
        tags: ['backend', 'frontend'],
      });
    });

    test('skips invalid template files', () => {
      // Write an invalid JSON file
      fs.writeFileSync(
        path.join(testDir, '.agileflow', 'teams', 'invalid.json'),
        'not valid json {]'
      );

      const result = teamManager.listTemplates(testDir);

      expect(result.ok).toBe(true);
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].name).toBe('test-team');
    });

    test('returns error when teams directory not found', () => {
      const emptyDir = path.join(testDir, 'empty-project');
      fs.mkdirSync(emptyDir);

      const result = teamManager.listTemplates(emptyDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('teams directory');
    });

    test('returns empty list when no templates present', () => {
      const noTemplatesDir = path.join(testDir, 'no-templates');
      fs.mkdirSync(path.join(noTemplatesDir, '.agileflow', 'teams'), { recursive: true });

      const result = teamManager.listTemplates(noTemplatesDir);

      expect(result.ok).toBe(true);
      expect(result.templates).toHaveLength(0);
    });
  });

  describe('getTemplate()', () => {
    test('loads and parses template JSON', () => {
      const result = teamManager.getTemplate(testDir, 'test-team');

      expect(result.ok).toBe(true);
      expect(result.template).toEqual(mockTeamTemplate);
    });

    test('returns error when template not found', () => {
      const result = teamManager.getTemplate(testDir, 'nonexistent');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('returns error when template JSON is invalid', () => {
      fs.writeFileSync(
        path.join(testDir, '.agileflow', 'teams', 'test-team.json'),
        'invalid json {]'
      );

      const result = teamManager.getTemplate(testDir, 'test-team');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });

    test('returns error when teams directory not found', () => {
      const emptyDir = path.join(testDir, 'empty-project');
      fs.mkdirSync(emptyDir);

      const result = teamManager.getTemplate(emptyDir, 'test-team');

      expect(result.ok).toBe(false);
    });
  });

  describe('startTeam()', () => {
    test('records active team in session-state.json', () => {
      const result = teamManager.startTeam(testDir, 'test-team');

      expect(result.ok).toBe(true);

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      expect(fs.existsSync(sessionPath)).toBe(true);

      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(state.active_team).toBeDefined();
      expect(state.active_team.template).toBe('test-team');
    });

    test('sets team lead from template', () => {
      teamManager.startTeam(testDir, 'test-team');

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      expect(state.active_team.lead).toBe('AG-LEAD');
    });

    test('records teammates in active team', () => {
      teamManager.startTeam(testDir, 'test-team');

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      expect(state.active_team.teammates).toHaveLength(2);
      expect(state.active_team.teammates[0].agent).toBe('AG-API');
      expect(state.active_team.teammates[0].status).toBe('pending');
    });

    test('records team quality gates', () => {
      teamManager.startTeam(testDir, 'test-team');

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      expect(state.active_team.quality_gates).toEqual(mockTeamTemplate.quality_gates);
    });

    test('initializes team metrics', () => {
      teamManager.startTeam(testDir, 'test-team');

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      expect(state.team_metrics).toBeDefined();
      expect(state.team_metrics.started_at).toBeDefined();
      expect(state.team_metrics.template).toBe('test-team');
      expect(state.team_metrics.teammate_count).toBe(2);
    });

    test('returns agent teams mode', () => {
      const result = teamManager.startTeam(testDir, 'test-team');

      expect(result.mode).toBeDefined();
    });

    test('returns error when template not found', () => {
      const result = teamManager.startTeam(testDir, 'nonexistent');

      expect(result.ok).toBe(false);
    });

    test('sets started_at timestamp', () => {
      const before = new Date();
      teamManager.startTeam(testDir, 'test-team');
      const after = new Date();

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      const startedTime = new Date(state.active_team.started_at);
      expect(startedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(startedTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getTeamStatus()', () => {
    test('returns inactive status when no active team', () => {
      const result = teamManager.getTeamStatus(testDir);

      expect(result.ok).toBe(true);
      expect(result.active).toBe(false);
    });

    test('returns active status when team running', () => {
      teamManager.startTeam(testDir, 'test-team');
      const result = teamManager.getTeamStatus(testDir);

      expect(result.ok).toBe(true);
      expect(result.active).toBe(true);
      expect(result.team).toBeDefined();
      expect(result.team.template).toBe('test-team');
    });

    test('includes team metrics', () => {
      teamManager.startTeam(testDir, 'test-team');
      const result = teamManager.getTeamStatus(testDir);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.template).toBe('test-team');
    });

    test('returns error when session state corrupted', () => {
      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      fs.writeFileSync(sessionPath, 'invalid json {]');

      const result = teamManager.getTeamStatus(testDir);

      expect(result.ok).toBe(false);
    });
  });

  describe('stopTeam()', () => {
    test('clears active_team from session state', () => {
      teamManager.startTeam(testDir, 'test-team');
      teamManager.stopTeam(testDir);

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      expect(state.active_team).toBeUndefined();
    });

    test('finalizes team metrics', () => {
      teamManager.startTeam(testDir, 'test-team');
      teamManager.stopTeam(testDir);

      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      expect(state.team_metrics.completed_at).toBeDefined();
      expect(state.team_metrics.duration_ms).toBeDefined();
    });

    test('calculates duration', () => {
      teamManager.startTeam(testDir, 'test-team');

      // Wait a bit
      const delay = 50;
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait
      }

      const result = teamManager.stopTeam(testDir);

      expect(result.duration_ms).toBeGreaterThanOrEqual(delay - 10);
    });

    test('returns error when no active team', () => {
      // Create empty session state
      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      fs.writeFileSync(sessionPath, JSON.stringify({}));

      const result = teamManager.stopTeam(testDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('No active team');
    });

    test('returns team template in result', () => {
      teamManager.startTeam(testDir, 'test-team');
      const result = teamManager.stopTeam(testDir);

      expect(result.ok).toBe(true);
      expect(result.template).toBe('test-team');
    });
  });

  describe('Integration tests', () => {
    test('start and stop team workflow', () => {
      const startResult = teamManager.startTeam(testDir, 'test-team');
      expect(startResult.ok).toBe(true);

      const statusResult = teamManager.getTeamStatus(testDir);
      expect(statusResult.active).toBe(true);

      const stopResult = teamManager.stopTeam(testDir);
      expect(stopResult.ok).toBe(true);

      const finalStatus = teamManager.getTeamStatus(testDir);
      expect(finalStatus.active).toBe(false);
    });

    test('preserves session state structure', () => {
      // Start with existing state
      const sessionPath = path.join(testDir, 'docs', '09-agents', 'session-state.json');
      const initialState = {
        some_other_field: 'preserved',
      };
      fs.writeFileSync(sessionPath, JSON.stringify(initialState));

      // Start team
      teamManager.startTeam(testDir, 'test-team');

      // Check that other fields are preserved
      const updated = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(updated.some_other_field).toBe('preserved');
      expect(updated.active_team).toBeDefined();
    });
  });

  describe('Dev vs installed locations', () => {
    test('uses installed location when available', () => {
      // The normal test setup creates .agileflow/teams with test-team
      const result = teamManager.listTemplates(testDir);

      expect(result.ok).toBe(true);
      expect(result.templates.map(t => t.name)).toContain('test-team');
    });

    test('finds templates in dev location structure', () => {
      // Create a completely new test directory without any .agileflow
      const devTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-dev-only-test-'));

      try {
        fs.mkdirSync(path.join(devTestDir, 'packages', 'cli', 'src', 'core', 'teams'), {
          recursive: true,
        });
        const devTemplate = { ...mockTeamTemplate, name: 'dev-template' };
        fs.writeFileSync(
          path.join(devTestDir, 'packages', 'cli', 'src', 'core', 'teams', 'dev-template.json'),
          JSON.stringify(devTemplate)
        );

        // Re-require to avoid cached paths from previous tests
        delete require.cache[require.resolve('../../scripts/team-manager')];
        const freshTeamManager = require('../../scripts/team-manager');

        const result = freshTeamManager.listTemplates(devTestDir);

        expect(result.ok).toBe(true);
        expect(result.templates).toHaveLength(1);
        expect(result.templates[0].name).toBe('dev-template');
      } finally {
        if (fs.existsSync(devTestDir)) {
          fs.rmSync(devTestDir, { recursive: true, force: true });
        }
      }
    });
  });
});
