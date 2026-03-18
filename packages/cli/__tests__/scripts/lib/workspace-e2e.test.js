/**
 * E2E integration test for workspace orchestration (US-0407)
 *
 * Validates the full workspace lifecycle:
 * 1. Init workspace from a parent directory with sub-projects
 * 2. Discover projects and detect mode
 * 3. Register sessions via WorkspaceRegistry
 * 4. Send and read events via WorkspaceBus
 * 5. Run quality gates via WorkspaceQualityGates
 * 6. Aggregate data via WorkspaceDashboard
 * 7. Track tasks via WorkspaceTaskRegistry with cross-project deps
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  initWorkspace,
  discoverProjects,
  findWorkspaceRoot,
  getWorkspaceConfig,
  detectWorkspaceMode,
  WORKSPACE_DIR,
} = require('../../../scripts/lib/workspace-discovery');
const { WorkspaceRegistry } = require('../../../scripts/lib/workspace-registry');
const { WorkspaceBus } = require('../../../scripts/lib/workspace-bus');
const { WorkspaceQualityGates } = require('../../../scripts/lib/workspace-quality-gates');
const { WorkspaceDashboard } = require('../../../scripts/lib/workspace-dashboard');
const {
  WorkspaceTaskRegistry,
  resetWorkspaceTaskRegistry,
} = require('../../../scripts/lib/workspace-task-registry');

let tmpDir;

/**
 * Create a realistic workspace with N projects, each with .agileflow/,
 * optional status.json, and optional package.json.
 */
function createWorkspace(projects) {
  for (const p of projects) {
    const projPath = path.join(tmpDir, p.name);
    fs.mkdirSync(path.join(projPath, '.agileflow', 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(projPath, 'docs', '09-agents', 'bus'), { recursive: true });

    if (p.hasGit !== false) {
      fs.mkdirSync(path.join(projPath, '.git'), { recursive: true });
    }

    if (p.statusJson) {
      fs.writeFileSync(
        path.join(projPath, 'docs', '09-agents', 'status.json'),
        JSON.stringify(p.statusJson)
      );
    }

    if (p.packageJson) {
      fs.writeFileSync(path.join(projPath, 'package.json'), JSON.stringify(p.packageJson));
    }

    // Create a per-project session registry if sessions provided
    if (p.sessions) {
      fs.writeFileSync(
        path.join(projPath, '.agileflow', 'sessions', 'registry.json'),
        JSON.stringify({ sessions: p.sessions })
      );
    }
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-e2e-'));
  resetWorkspaceTaskRegistry();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  resetWorkspaceTaskRegistry();
});

describe('Workspace E2E: Full Lifecycle', () => {
  test('complete workspace lifecycle from init to dashboard', () => {
    // === Step 1: Create projects ===
    createWorkspace([
      {
        name: 'frontend',
        statusJson: {
          stories: {
            'US-001': { status: 'in_progress', title: 'Auth UI' },
            'US-002': { status: 'ready', title: 'Nav' },
          },
        },
        packageJson: { dependencies: { react: '^18.2.0' } },
        sessions: { 1: { path: path.join(tmpDir, 'frontend'), branch: 'main' } },
      },
      {
        name: 'backend',
        statusJson: {
          stories: {
            'US-003': { status: 'in_progress', title: 'Auth API' },
          },
          test_status: 'passing',
        },
        packageJson: { dependencies: { react: '^18.2.0', express: '^4.18.0' } },
      },
    ]);

    // === Step 2: Init workspace ===
    const initResult = initWorkspace(tmpDir);
    expect(initResult.ok).toBe(true);
    expect(initResult.config.projects).toHaveLength(2);
    expect(initResult.config.mode).toBe('multi-repo');

    // Verify workspace root is discoverable
    const frontendPath = path.join(tmpDir, 'frontend');
    expect(findWorkspaceRoot(frontendPath)).toBe(tmpDir);

    // === Step 3: Register sessions ===
    const registry = new WorkspaceRegistry(tmpDir);
    const reg1 = registry.registerSession('frontend', {
      sessionId: '1',
      path: frontendPath,
      branch: 'feature/auth',
      nickname: 'auth-ui',
    });
    expect(reg1.ok).toBe(true);
    expect(reg1.workspaceSessionId).toBe('frontend-1');

    const reg2 = registry.registerSession('backend', {
      sessionId: '1',
      path: path.join(tmpDir, 'backend'),
      branch: 'feature/auth-api',
      nickname: 'auth-api',
    });
    expect(reg2.ok).toBe(true);

    // Federated view
    const allSessions = registry.getAllSessions();
    expect(allSessions).toHaveLength(2);
    const feSessionCount = allSessions.find(p => p.project === 'frontend').sessions.length;
    expect(feSessionCount).toBeGreaterThanOrEqual(1);

    // === Step 4: Send and read bus events ===
    const bus = new WorkspaceBus(tmpDir);
    bus.send('frontend', { type: 'task_started', agent: 'ui' });
    bus.send('backend', { type: 'task_started', agent: 'api' });
    bus.send('frontend', { type: 'task_completed', agent: 'ui' });

    const allMessages = bus.read();
    expect(allMessages.messages).toHaveLength(3);

    const feMessages = bus.read({ project: 'frontend' });
    expect(feMessages.messages).toHaveLength(2);

    const beMessages = bus.read({ project: 'backend' });
    expect(beMessages.messages).toHaveLength(1);

    // === Step 5: Quality gates ===
    const gates = new WorkspaceQualityGates(tmpDir);

    // Projects exist gate
    const existResults = gates.checkProjectsExist();
    expect(existResults.every(r => r.status === 'passed')).toBe(true);

    // Dependency alignment (both have react ^18.2.0 — aligned)
    const depResults = gates.checkDependencyAlignment();
    expect(depResults[0].status).toBe('passed');

    // Test status (backend has passing, frontend unknown)
    const testResults = gates.checkTestStatus();
    const backendTest = testResults.find(r => r.project === 'backend');
    expect(backendTest.status).toBe('passed');

    // Full run
    const fullResults = gates.runAll();
    expect(fullResults.summary.passed).toBeGreaterThan(0);

    // === Step 6: Dashboard ===
    const dashboard = new WorkspaceDashboard(tmpDir);
    const dashData = dashboard.getData();
    expect(dashData.ok).toBe(true);
    expect(dashData.data.summary.totalProjects).toBe(2);
    expect(dashData.data.summary.totalStories).toBe(3);
    expect(dashData.data.summary.inProgressStories).toBe(2);

    const cliOutput = dashboard.formatForCLI();
    expect(cliOutput).toContain('frontend/');
    expect(cliOutput).toContain('backend/');
    expect(cliOutput).toContain('Workspace:');

    // === Step 7: Cross-project tasks ===
    const taskReg = new WorkspaceTaskRegistry(tmpDir);

    const dbTask = taskReg.create({
      description: 'Create auth schema',
      project: 'backend',
      subagent_type: 'agileflow-database',
    });
    expect(dbTask.success).toBe(true);

    const uiTask = taskReg.create({
      description: 'Build login form',
      project: 'frontend',
      subagent_type: 'agileflow-ui',
      blockedBy: [dbTask.task.id],
    });
    expect(uiTask.success).toBe(true);

    // Cross-project deps detected
    const crossDeps = taskReg.getCrossProjectDependencies();
    expect(crossDeps).toHaveLength(1);
    expect(crossDeps[0].from.project).toBe('backend');
    expect(crossDeps[0].to.project).toBe('frontend');

    // Per-project grouping
    const grouped = taskReg.getTasksByProject();
    expect(grouped.backend).toHaveLength(1);
    expect(grouped.frontend).toHaveLength(1);

    // Workspace stats
    const stats = taskReg.getWorkspaceStats();
    expect(stats.total).toBe(2);
    expect(stats.by_project.backend.total).toBe(1);
    expect(stats.by_project.frontend.total).toBe(1);
  });

  test('workspace mode detection in init', () => {
    // Multi-repo: each project has .git
    createWorkspace([{ name: 'repo-a' }, { name: 'repo-b' }]);

    const multiResult = initWorkspace(tmpDir);
    expect(multiResult.config.mode).toBe('multi-repo');

    // Clean up and recreate as monorepo
    fs.rmSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    fs.rmSync(path.join(tmpDir, 'repo-a', '.git'), { recursive: true, force: true });
    fs.rmSync(path.join(tmpDir, 'repo-b', '.git'), { recursive: true, force: true });

    const monoResult = initWorkspace(tmpDir);
    expect(monoResult.config.mode).toBe('monorepo');
  });

  test('dependency version conflict detection', () => {
    createWorkspace([
      {
        name: 'app-a',
        packageJson: { dependencies: { lodash: '^4.17.21' } },
      },
      {
        name: 'app-b',
        packageJson: { dependencies: { lodash: '^3.10.0' } },
      },
    ]);
    initWorkspace(tmpDir);

    const gates = new WorkspaceQualityGates(tmpDir);
    const depResults = gates.checkDependencyAlignment();
    const lodashConflict = depResults.find(r => r.details.includes('lodash'));
    expect(lodashConflict).toBeDefined();
    expect(lodashConflict.status).toBe('failed');
  });

  test('stale project detection in federated sessions', () => {
    createWorkspace([{ name: 'exists' }]);
    initWorkspace(tmpDir);

    // Manually add a stale project to config
    const configPath = path.join(tmpDir, WORKSPACE_DIR, 'workspace.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.projects.push({ name: 'ghost', path: path.join(tmpDir, 'ghost'), hasGit: false });
    fs.writeFileSync(configPath, JSON.stringify(config));

    const registry = new WorkspaceRegistry(tmpDir);
    const allSessions = registry.getAllSessions();
    const ghostProject = allSessions.find(p => p.project === 'ghost');
    expect(ghostProject.stale).toBe(true);
  });

  test('bus message filtering with since parameter', () => {
    createWorkspace([{ name: 'app' }]);
    initWorkspace(tmpDir);

    const bus = new WorkspaceBus(tmpDir);
    bus.send('app', { type: 'old_event' });

    const futureDate = new Date(Date.now() + 60000).toISOString();
    const result = bus.read({ since: futureDate });
    expect(result.messages).toHaveLength(0);

    const invalidResult = bus.read({ since: 'invalid-date' });
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.error).toContain("Invalid 'since'");
  });
});
