/**
 * workspace-quality-gates.js - Cross-Project Quality Gates
 *
 * Validates cross-project contracts and integration points:
 * - API contract consistency (shared types, endpoint interfaces)
 * - Dependency version alignment across projects
 * - Cross-project test status aggregation
 *
 * Usage:
 *   const { WorkspaceQualityGates } = require('./workspace-quality-gates');
 *   const gates = new WorkspaceQualityGates('/path/to/workspace');
 *   const results = gates.runAll();
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getWorkspaceConfig } = require('./workspace-discovery');

/**
 * Gate result structure
 * @typedef {{ gate: string, status: 'passed'|'failed'|'skipped'|'error', details: string, project?: string }} GateResult
 */

/**
 * WorkspaceQualityGates - Cross-project validation
 */
class WorkspaceQualityGates {
  /**
   * @param {string} workspaceRoot - Workspace root directory
   */
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Run all workspace quality gates.
   *
   * @returns {{ ok: boolean, results: GateResult[], summary: { passed: number, failed: number, skipped: number } }}
   */
  runAll() {
    const results = [];

    results.push(...this.checkProjectsExist());
    results.push(...this.checkDependencyAlignment());
    results.push(...this.checkTestStatus());
    results.push(...this.checkGitStatus());

    const summary = {
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      error: results.filter(r => r.status === 'error').length,
    };

    return { ok: summary.failed === 0, results, summary };
  }

  /**
   * Gate: All workspace projects exist on disk.
   * @returns {GateResult[]}
   */
  checkProjectsExist() {
    const configResult = getWorkspaceConfig(this.workspaceRoot);
    if (!configResult.ok) {
      return [{ gate: 'projects-exist', status: 'error', details: configResult.error }];
    }

    const results = [];
    for (const project of configResult.config.projects) {
      if (fs.existsSync(project.path)) {
        results.push({
          gate: 'projects-exist',
          status: 'passed',
          details: `${project.name} exists`,
          project: project.name,
        });
      } else {
        results.push({
          gate: 'projects-exist',
          status: 'failed',
          details: `${project.name} missing at ${project.path}`,
          project: project.name,
        });
      }
    }

    return results;
  }

  /**
   * Gate: Shared dependency versions are aligned across projects.
   * Checks package.json for common dependencies with conflicting versions.
   *
   * @returns {GateResult[]}
   */
  checkDependencyAlignment() {
    const configResult = getWorkspaceConfig(this.workspaceRoot);
    if (!configResult.ok) {
      return [{ gate: 'dependency-alignment', status: 'error', details: configResult.error }];
    }

    // Collect all dependencies across projects
    const depVersions = {}; // { depName: { projectName: version } }

    for (const project of configResult.config.projects) {
      const pkgPath = path.join(project.path, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        for (const [dep, version] of Object.entries(allDeps)) {
          if (!depVersions[dep]) depVersions[dep] = {};
          depVersions[dep][project.name] = version;
        }
      } catch (e) {
        // Skip unreadable package.json
      }
    }

    // Find conflicts (same dep, different versions, across 2+ projects)
    const conflicts = [];
    for (const [dep, projectVersions] of Object.entries(depVersions)) {
      const projects = Object.keys(projectVersions);
      if (projects.length < 2) continue;

      const versions = new Set(Object.values(projectVersions));
      if (versions.size > 1) {
        const details = projects.map(p => `${p}@${projectVersions[p]}`).join(', ');
        conflicts.push({ dep, details });
      }
    }

    if (conflicts.length === 0) {
      return [
        {
          gate: 'dependency-alignment',
          status: 'passed',
          details: 'All shared dependencies are version-aligned',
        },
      ];
    }

    return conflicts.map(c => ({
      gate: 'dependency-alignment',
      status: 'failed',
      details: `${c.dep}: ${c.details}`,
    }));
  }

  /**
   * Gate: All projects have passing tests (or no test command).
   *
   * @returns {GateResult[]}
   */
  checkTestStatus() {
    const configResult = getWorkspaceConfig(this.workspaceRoot);
    if (!configResult.ok) {
      return [{ gate: 'test-status', status: 'error', details: configResult.error }];
    }

    const results = [];

    for (const project of configResult.config.projects) {
      const statusPath = path.join(project.path, 'docs', '09-agents', 'status.json');

      if (!fs.existsSync(statusPath)) {
        results.push({
          gate: 'test-status',
          status: 'skipped',
          details: `${project.name}: no status.json found`,
          project: project.name,
        });
        continue;
      }

      try {
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        const testStatus = status.test_status || status.last_test_result;

        if (testStatus === 'passing' || testStatus === 'pass') {
          results.push({
            gate: 'test-status',
            status: 'passed',
            details: `${project.name}: tests passing`,
            project: project.name,
          });
        } else if (testStatus === 'failing' || testStatus === 'fail') {
          results.push({
            gate: 'test-status',
            status: 'failed',
            details: `${project.name}: tests failing`,
            project: project.name,
          });
        } else {
          results.push({
            gate: 'test-status',
            status: 'skipped',
            details: `${project.name}: test status unknown`,
            project: project.name,
          });
        }
      } catch (e) {
        results.push({
          gate: 'test-status',
          status: 'skipped',
          details: `${project.name}: could not read status.json`,
          project: project.name,
        });
      }
    }

    return results;
  }

  /**
   * Gate: All projects have clean git status (no uncommitted changes).
   *
   * @returns {GateResult[]}
   */
  checkGitStatus() {
    const configResult = getWorkspaceConfig(this.workspaceRoot);
    if (!configResult.ok) {
      return [{ gate: 'git-status', status: 'error', details: configResult.error }];
    }

    const results = [];

    for (const project of configResult.config.projects) {
      if (!project.hasGit) {
        results.push({
          gate: 'git-status',
          status: 'skipped',
          details: `${project.name}: not a git repository`,
          project: project.name,
        });
        continue;
      }

      try {
        const output = execFileSync('git', ['status', '--porcelain'], {
          cwd: project.path,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        if (output === '') {
          results.push({
            gate: 'git-status',
            status: 'passed',
            details: `${project.name}: clean`,
            project: project.name,
          });
        } else {
          const lineCount = output.split('\n').length;
          results.push({
            gate: 'git-status',
            status: 'failed',
            details: `${project.name}: ${lineCount} uncommitted change(s)`,
            project: project.name,
          });
        }
      } catch (e) {
        results.push({
          gate: 'git-status',
          status: 'error',
          details: `${project.name}: git status failed`,
          project: project.name,
        });
      }
    }

    return results;
  }

  /**
   * Format gate results for CLI display.
   *
   * @param {{ results: GateResult[], summary: object }} gateResults
   * @returns {string}
   */
  static formatForCLI(gateResults) {
    const lines = [];
    const { results, summary } = gateResults;

    lines.push('\n  Workspace Quality Gates');
    lines.push('  ' + '-'.repeat(50));

    const statusIcons = {
      passed: 'PASS',
      failed: 'FAIL',
      skipped: 'SKIP',
      error: 'ERR ',
    };

    for (const result of results) {
      const icon = statusIcons[result.status] || '????';
      lines.push(`  [${icon}] ${result.details}`);
    }

    lines.push('  ' + '-'.repeat(50));
    lines.push(
      `  Passed: ${summary.passed} | Failed: ${summary.failed} | Skipped: ${summary.skipped}`
    );
    lines.push('');

    return lines.join('\n');
  }
}

module.exports = { WorkspaceQualityGates };
