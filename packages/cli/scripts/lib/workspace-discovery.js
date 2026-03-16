/**
 * workspace-discovery.js - Workspace Discovery & Configuration
 *
 * Discovers multi-project workspaces by scanning a parent directory for
 * AgileFlow-enabled sub-projects. Provides workspace-level configuration
 * through workspace.json.
 *
 * A "workspace" is a parent directory containing 2+ AgileFlow projects:
 *
 *   parent-dir/                    ← workspace root
 *     .agileflow-workspace/        ← workspace state
 *       workspace.json             ← project manifest
 *     project-a/.agileflow/        ← AgileFlow project
 *     project-b/.agileflow/        ← AgileFlow project
 *
 * Usage:
 *   const ws = require('./workspace-discovery');
 *   const root = ws.findWorkspaceRoot('/path/to/project-a');
 *   const projects = ws.discoverProjects(root);
 *   const config = ws.getWorkspaceConfig(root);
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = '.agileflow-workspace';
const WORKSPACE_CONFIG = 'workspace.json';
const WORKSPACE_REGISTRY = 'workspace-registry.json';
const WORKSPACE_BUS_DIR = 'workspace-bus';

/**
 * Check if a directory is an AgileFlow project.
 * @param {string} dir - Directory to check
 * @returns {boolean}
 */
function isAgileflowProject(dir) {
  return fs.existsSync(path.join(dir, '.agileflow'));
}

/**
 * Check if a directory is a workspace root (has .agileflow-workspace/).
 * @param {string} dir - Directory to check
 * @returns {boolean}
 */
function isWorkspaceRoot(dir) {
  return fs.existsSync(path.join(dir, WORKSPACE_DIR));
}

/**
 * Find the workspace root by walking up from a starting directory.
 *
 * Strategy:
 * 1. If startDir has .agileflow-workspace/, it IS the workspace root
 * 2. If parent has .agileflow-workspace/, parent is workspace root
 * 3. If parent has 2+ children with .agileflow/, parent is candidate
 * 4. Walk up until / is reached
 *
 * @param {string} startDir - Directory to start searching from
 * @returns {string|null} Workspace root path, or null if not in a workspace
 */
function findWorkspaceRoot(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  // Check if startDir itself is a workspace root
  if (isWorkspaceRoot(dir)) {
    return dir;
  }

  // Walk up looking for .agileflow-workspace/
  let current = path.dirname(dir);
  while (current !== root && current !== dir) {
    if (isWorkspaceRoot(current)) {
      return current;
    }
    dir = current;
    current = path.dirname(current);
  }

  return null;
}

/**
 * Discover AgileFlow-enabled projects in a directory.
 * Scans immediate children for .agileflow/ directories.
 *
 * @param {string} workspaceRoot - Directory to scan
 * @returns {{ name: string, path: string, hasGit: boolean }[]}
 */
function discoverProjects(workspaceRoot) {
  const projects = [];

  let entries;
  try {
    entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
  } catch (e) {
    return projects;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip hidden dirs and workspace dir itself
    if (entry.name.startsWith('.')) continue;

    const projectPath = path.join(workspaceRoot, entry.name);

    if (isAgileflowProject(projectPath)) {
      projects.push({
        name: entry.name,
        path: projectPath,
        hasGit: fs.existsSync(path.join(projectPath, '.git')),
      });
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get or create workspace configuration.
 *
 * @param {string} workspaceRoot - Workspace root directory
 * @returns {{ ok: boolean, config?: object, error?: string }}
 */
function getWorkspaceConfig(workspaceRoot) {
  const configPath = path.join(workspaceRoot, WORKSPACE_DIR, WORKSPACE_CONFIG);

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ok: true, config };
    } catch (e) {
      return { ok: false, error: `Failed to parse workspace.json: ${e.message}` };
    }
  }

  return { ok: false, error: 'No workspace.json found. Run /agileflow:workspace:init' };
}

/**
 * Initialize a workspace at the given directory.
 * Creates .agileflow-workspace/ with workspace.json.
 *
 * @param {string} workspaceRoot - Directory to initialize as workspace
 * @param {object} [options] - Options
 * @param {string[]} [options.projects] - Explicit project list (auto-discovered if omitted)
 * @returns {{ ok: boolean, config?: object, error?: string }}
 */
function initWorkspace(workspaceRoot, options = {}) {
  const wsDir = path.join(workspaceRoot, WORKSPACE_DIR);
  const configPath = path.join(wsDir, WORKSPACE_CONFIG);

  // Discover projects
  const discovered = options.projects
    ? options.projects.map(name => ({
        name,
        path: path.join(workspaceRoot, name),
        hasGit: fs.existsSync(path.join(workspaceRoot, name, '.git')),
      }))
    : discoverProjects(workspaceRoot);

  if (discovered.length === 0) {
    return {
      ok: false,
      error: `No AgileFlow projects found in ${workspaceRoot}. Each project needs a .agileflow/ directory.`,
    };
  }

  // Create workspace directory structure
  try {
    fs.mkdirSync(wsDir, { recursive: true });
    fs.mkdirSync(path.join(wsDir, WORKSPACE_BUS_DIR), { recursive: true });
  } catch (e) {
    return { ok: false, error: `Failed to create workspace directory: ${e.message}` };
  }

  const config = {
    schema_version: '1.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    projects: discovered.map(p => ({
      name: p.name,
      path: p.path,
      hasGit: p.hasGit,
    })),
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  } catch (e) {
    return { ok: false, error: `Failed to write workspace.json: ${e.message}` };
  }

  // Initialize empty registry
  const registryPath = path.join(wsDir, WORKSPACE_REGISTRY);
  if (!fs.existsSync(registryPath)) {
    const registry = {
      schema_version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sessions: {},
    };
    try {
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
    } catch (e) {
      // Non-critical
    }
  }

  // Initialize empty bus log
  const busLogPath = path.join(wsDir, WORKSPACE_BUS_DIR, 'log.jsonl');
  if (!fs.existsSync(busLogPath)) {
    try {
      fs.writeFileSync(busLogPath, '');
    } catch (e) {
      // Non-critical
    }
  }

  return { ok: true, config };
}

/**
 * Get paths to workspace state files.
 *
 * @param {string} workspaceRoot - Workspace root directory
 * @returns {{ wsDir: string, configPath: string, registryPath: string, busLogPath: string }}
 */
function getWorkspacePaths(workspaceRoot) {
  const wsDir = path.join(workspaceRoot, WORKSPACE_DIR);
  return {
    wsDir,
    configPath: path.join(wsDir, WORKSPACE_CONFIG),
    registryPath: path.join(wsDir, WORKSPACE_REGISTRY),
    busLogPath: path.join(wsDir, WORKSPACE_BUS_DIR, 'log.jsonl'),
  };
}

module.exports = {
  // Constants
  WORKSPACE_DIR,
  WORKSPACE_CONFIG,
  WORKSPACE_REGISTRY,
  WORKSPACE_BUS_DIR,

  // Discovery
  isAgileflowProject,
  isWorkspaceRoot,
  findWorkspaceRoot,
  discoverProjects,

  // Configuration
  getWorkspaceConfig,
  initWorkspace,
  getWorkspacePaths,
};
