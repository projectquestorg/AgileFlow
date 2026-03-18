/**
 * Tests for workspace-discovery.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  isAgileflowProject,
  isWorkspaceRoot,
  findWorkspaceRoot,
  discoverProjects,
  detectWorkspaceMode,
  getWorkspaceConfig,
  initWorkspace,
  getWorkspacePaths,
  WORKSPACE_DIR,
} = require('../../../scripts/lib/workspace-discovery');

// Create temp directories for testing
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('isAgileflowProject', () => {
  test('returns true when .agileflow/ exists', () => {
    const proj = path.join(tmpDir, 'myproject');
    fs.mkdirSync(path.join(proj, '.agileflow'), { recursive: true });
    expect(isAgileflowProject(proj)).toBe(true);
  });

  test('returns false when .agileflow/ does not exist', () => {
    const proj = path.join(tmpDir, 'noproject');
    fs.mkdirSync(proj, { recursive: true });
    expect(isAgileflowProject(proj)).toBe(false);
  });
});

describe('isWorkspaceRoot', () => {
  test('returns true when .agileflow-workspace/ exists', () => {
    fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true });
    expect(isWorkspaceRoot(tmpDir)).toBe(true);
  });

  test('returns false when .agileflow-workspace/ does not exist', () => {
    expect(isWorkspaceRoot(tmpDir)).toBe(false);
  });
});

describe('findWorkspaceRoot', () => {
  test('finds workspace root in parent directory', () => {
    // Setup: workspace root with .agileflow-workspace/
    fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true });
    const childProject = path.join(tmpDir, 'frontend');
    fs.mkdirSync(path.join(childProject, '.agileflow'), { recursive: true });

    expect(findWorkspaceRoot(childProject)).toBe(tmpDir);
  });

  test('finds workspace root when starting from it', () => {
    fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR), { recursive: true });
    expect(findWorkspaceRoot(tmpDir)).toBe(tmpDir);
  });

  test('returns null when no workspace found', () => {
    const isolated = path.join(tmpDir, 'isolated');
    fs.mkdirSync(isolated, { recursive: true });
    expect(findWorkspaceRoot(isolated)).toBeNull();
  });
});

describe('discoverProjects', () => {
  test('discovers AgileFlow projects in directory', () => {
    // Create two projects
    fs.mkdirSync(path.join(tmpDir, 'frontend', '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', '.agileflow'), { recursive: true });
    // Create non-project directory
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });

    const projects = discoverProjects(tmpDir);
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('backend');
    expect(projects[1].name).toBe('frontend');
    expect(projects[0].path).toBe(path.join(tmpDir, 'backend'));
    expect(projects[1].path).toBe(path.join(tmpDir, 'frontend'));
  });

  test('skips hidden directories', () => {
    fs.mkdirSync(path.join(tmpDir, '.hidden', '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'visible', '.agileflow'), { recursive: true });

    const projects = discoverProjects(tmpDir);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('visible');
  });

  test('returns empty array for empty directory', () => {
    expect(discoverProjects(tmpDir)).toEqual([]);
  });

  test('follows symlinked project directories', () => {
    // Create a real project
    const realProject = path.join(tmpDir, 'real-project');
    fs.mkdirSync(path.join(realProject, '.agileflow'), { recursive: true });

    // Create a symlink to it
    const symlinkPath = path.join(tmpDir, 'linked-project');
    try {
      fs.symlinkSync(realProject, symlinkPath, 'dir');
    } catch (e) {
      // Skip test if symlinks not supported (e.g., Windows without admin)
      return;
    }

    const projects = discoverProjects(tmpDir);
    const names = projects.map(p => p.name);
    expect(names).toContain('linked-project');
    expect(names).toContain('real-project');
  });

  test('detects git presence', () => {
    fs.mkdirSync(path.join(tmpDir, 'with-git', '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'with-git', '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'no-git', '.agileflow'), { recursive: true });

    const projects = discoverProjects(tmpDir);
    const withGit = projects.find(p => p.name === 'with-git');
    const noGit = projects.find(p => p.name === 'no-git');
    expect(withGit.hasGit).toBe(true);
    expect(noGit.hasGit).toBe(false);
  });
});

describe('detectWorkspaceMode', () => {
  test('detects multi-repo when projects have own .git', () => {
    const projects = [
      { name: 'a', path: path.join(tmpDir, 'a'), hasGit: true },
      { name: 'b', path: path.join(tmpDir, 'b'), hasGit: true },
    ];
    expect(detectWorkspaceMode(tmpDir, projects)).toBe('multi-repo');
  });

  test('detects monorepo when root has .git but projects do not', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    const projects = [
      { name: 'a', path: path.join(tmpDir, 'a'), hasGit: false },
      { name: 'b', path: path.join(tmpDir, 'b'), hasGit: false },
    ];
    expect(detectWorkspaceMode(tmpDir, projects)).toBe('monorepo');
  });

  test('detects monorepo when pnpm-workspace.yaml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    const projects = [{ name: 'a', path: path.join(tmpDir, 'a'), hasGit: true }];
    expect(detectWorkspaceMode(tmpDir, projects)).toBe('monorepo');
  });

  test('detects monorepo when package.json has workspaces', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] })
    );
    const projects = [{ name: 'a', path: path.join(tmpDir, 'a'), hasGit: true }];
    expect(detectWorkspaceMode(tmpDir, projects)).toBe('monorepo');
  });

  test('defaults to multi-repo when no indicators', () => {
    const projects = [{ name: 'a', path: path.join(tmpDir, 'a'), hasGit: false }];
    expect(detectWorkspaceMode(tmpDir, projects)).toBe('multi-repo');
  });
});

describe('initWorkspace', () => {
  test('creates workspace directory and config', () => {
    fs.mkdirSync(path.join(tmpDir, 'frontend', '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', '.agileflow'), { recursive: true });

    const result = initWorkspace(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.config.projects).toHaveLength(2);
    expect(fs.existsSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace-registry.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, WORKSPACE_DIR, 'workspace-bus', 'log.jsonl'))).toBe(
      true
    );
  });

  test('fails when no projects found', () => {
    const result = initWorkspace(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No AgileFlow projects found');
  });

  test('accepts explicit project list', () => {
    fs.mkdirSync(path.join(tmpDir, 'myapp', '.agileflow'), { recursive: true });

    const result = initWorkspace(tmpDir, { projects: ['myapp'] });
    expect(result.ok).toBe(true);
    expect(result.config.projects).toHaveLength(1);
    expect(result.config.projects[0].name).toBe('myapp');
  });

  test('stores detected mode in config', () => {
    fs.mkdirSync(path.join(tmpDir, 'frontend', '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'frontend', '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', '.agileflow'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', '.git'), { recursive: true });

    const result = initWorkspace(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.config.mode).toBe('multi-repo');
  });

  test('accepts explicit mode override', () => {
    fs.mkdirSync(path.join(tmpDir, 'pkg', '.agileflow'), { recursive: true });

    const result = initWorkspace(tmpDir, { projects: ['pkg'], mode: 'monorepo' });
    expect(result.ok).toBe(true);
    expect(result.config.mode).toBe('monorepo');
  });
});

describe('getWorkspaceConfig', () => {
  test('reads existing workspace.json', () => {
    const wsDir = path.join(tmpDir, WORKSPACE_DIR);
    fs.mkdirSync(wsDir, { recursive: true });
    const config = { schema_version: '1.0.0', projects: [{ name: 'test' }] };
    fs.writeFileSync(path.join(wsDir, 'workspace.json'), JSON.stringify(config));

    const result = getWorkspaceConfig(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.config.projects).toHaveLength(1);
  });

  test('returns error when workspace.json not found', () => {
    const result = getWorkspaceConfig(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No workspace.json found');
  });
});

describe('getWorkspacePaths', () => {
  test('returns correct paths', () => {
    const paths = getWorkspacePaths(tmpDir);
    expect(paths.wsDir).toBe(path.join(tmpDir, WORKSPACE_DIR));
    expect(paths.configPath).toContain('workspace.json');
    expect(paths.registryPath).toContain('workspace-registry.json');
    expect(paths.busLogPath).toContain('log.jsonl');
  });
});
