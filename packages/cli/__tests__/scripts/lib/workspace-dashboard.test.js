/**
 * Tests for workspace-dashboard.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkspaceDashboard } = require('../../../scripts/lib/workspace-dashboard');
const { WORKSPACE_DIR, WORKSPACE_BUS_DIR } = require('../../../scripts/lib/workspace-discovery');

let tmpDir;

function setupWorkspace(projects = ['frontend', 'backend']) {
  // Create workspace structure
  fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR, WORKSPACE_BUS_DIR), { recursive: true });

  const projectConfigs = [];
  for (const name of projects) {
    const projectPath = path.join(tmpDir, name);
    fs.mkdirSync(path.join(projectPath, '.agileflow', 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'docs', '09-agents', 'bus'), { recursive: true });
    projectConfigs.push({ name, path: projectPath, hasGit: false });
  }

  const config = {
    schema_version: '1.0.0',
    projects: projectConfigs,
  };
  fs.writeFileSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'), JSON.stringify(config));

  return config;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-dash-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WorkspaceDashboard', () => {
  describe('getData', () => {
    test('returns project list with session and story data', () => {
      setupWorkspace();

      // Add a status.json to frontend
      const statusPath = path.join(tmpDir, 'frontend', 'docs', '09-agents', 'status.json');
      fs.writeFileSync(
        statusPath,
        JSON.stringify({
          stories: {
            'US-001': { status: 'in_progress', title: 'Auth' },
            'US-002': { status: 'ready', title: 'Nav' },
            'US-003': { status: 'completed', title: 'Login' },
          },
        })
      );

      const dash = new WorkspaceDashboard(tmpDir);
      const result = dash.getData();

      expect(result.ok).toBe(true);
      expect(result.data.projects).toHaveLength(2);

      const frontend = result.data.projects.find(p => p.name === 'frontend');
      expect(frontend.stories.in_progress).toBe(1);
      expect(frontend.stories.ready).toBe(1);
      expect(frontend.stories.completed).toBe(1);
      expect(frontend.stories.total).toBe(3);
    });

    test('returns summary with totals', () => {
      setupWorkspace();

      const dash = new WorkspaceDashboard(tmpDir);
      const result = dash.getData();

      expect(result.data.summary.totalProjects).toBe(2);
      expect(result.data.summary.totalSessions).toBe(0);
    });

    test('returns error when no workspace config', () => {
      const dash = new WorkspaceDashboard(tmpDir);
      const result = dash.getData();
      expect(result.ok).toBe(false);
    });
  });

  describe('formatForCLI', () => {
    test('returns formatted string', () => {
      setupWorkspace();

      const dash = new WorkspaceDashboard(tmpDir);
      const output = dash.formatForCLI();

      expect(output).toContain('Workspace:');
      expect(output).toContain('frontend/');
      expect(output).toContain('backend/');
    });
  });
});
