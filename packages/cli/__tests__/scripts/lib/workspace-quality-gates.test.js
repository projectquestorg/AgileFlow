/**
 * Tests for workspace-quality-gates.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkspaceQualityGates } = require('../../../scripts/lib/workspace-quality-gates');
const { WORKSPACE_DIR } = require('../../../scripts/lib/workspace-discovery');

let tmpDir;

function setupWorkspace(projects) {
  fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true });

  const projectConfigs = projects.map(p => {
    const projectPath = path.join(tmpDir, p.name);
    fs.mkdirSync(path.join(projectPath, '.agileflow'), { recursive: true });
    if (p.hasGit !== false) {
      fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });
    }
    return { name: p.name, path: projectPath, hasGit: p.hasGit !== false };
  });

  fs.writeFileSync(
    path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'),
    JSON.stringify({ schema_version: '1.0.0', projects: projectConfigs })
  );

  return projectConfigs;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-gates-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WorkspaceQualityGates', () => {
  describe('checkProjectsExist', () => {
    test('passes when all projects exist', () => {
      setupWorkspace([{ name: 'frontend' }, { name: 'backend' }]);

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkProjectsExist();

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'passed')).toBe(true);
    });

    test('fails when project is missing', () => {
      fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'),
        JSON.stringify({
          schema_version: '1.0.0',
          projects: [{ name: 'ghost', path: path.join(tmpDir, 'ghost') }],
        })
      );

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkProjectsExist();

      expect(results[0].status).toBe('failed');
      expect(results[0].details).toContain('ghost missing');
    });
  });

  describe('checkDependencyAlignment', () => {
    test('passes when deps are aligned', () => {
      const projects = setupWorkspace([{ name: 'a' }, { name: 'b' }]);

      // Both projects have same version of react
      for (const p of projects) {
        fs.writeFileSync(
          path.join(p.path, 'package.json'),
          JSON.stringify({ dependencies: { react: '^18.2.0' } })
        );
      }

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkDependencyAlignment();

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('passed');
    });

    test('fails when deps have version mismatch', () => {
      const projects = setupWorkspace([{ name: 'a' }, { name: 'b' }]);

      fs.writeFileSync(
        path.join(projects[0].path, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.2.0' } })
      );
      fs.writeFileSync(
        path.join(projects[1].path, 'package.json'),
        JSON.stringify({ dependencies: { react: '^17.0.0' } })
      );

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkDependencyAlignment();

      expect(results.some(r => r.status === 'failed')).toBe(true);
      expect(results[0].details).toContain('react');
    });
  });

  describe('checkTestStatus', () => {
    test('passes when tests are passing', () => {
      const projects = setupWorkspace([{ name: 'frontend' }]);

      fs.mkdirSync(path.join(projects[0].path, 'docs', '09-agents'), { recursive: true });
      fs.writeFileSync(
        path.join(projects[0].path, 'docs', '09-agents', 'status.json'),
        JSON.stringify({ test_status: 'passing' })
      );

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkTestStatus();

      expect(results[0].status).toBe('passed');
    });

    test('fails when tests are failing', () => {
      const projects = setupWorkspace([{ name: 'frontend' }]);

      fs.mkdirSync(path.join(projects[0].path, 'docs', '09-agents'), { recursive: true });
      fs.writeFileSync(
        path.join(projects[0].path, 'docs', '09-agents', 'status.json'),
        JSON.stringify({ test_status: 'failing' })
      );

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkTestStatus();

      expect(results[0].status).toBe('failed');
    });

    test('skips when no status.json', () => {
      setupWorkspace([{ name: 'frontend' }]);

      const gates = new WorkspaceQualityGates(tmpDir);
      const results = gates.checkTestStatus();

      expect(results[0].status).toBe('skipped');
    });
  });

  describe('runAll', () => {
    test('returns aggregated results with summary', () => {
      setupWorkspace([{ name: 'frontend', hasGit: false }]);

      const gates = new WorkspaceQualityGates(tmpDir);
      const result = gates.runAll();

      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('skipped');
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe('formatForCLI', () => {
    test('formats results as string', () => {
      setupWorkspace([{ name: 'frontend', hasGit: false }]);

      const gates = new WorkspaceQualityGates(tmpDir);
      const result = gates.runAll();
      const output = WorkspaceQualityGates.formatForCLI(result);

      expect(output).toContain('Quality Gates');
      expect(output).toContain('Passed:');
    });
  });
});
