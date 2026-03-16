/**
 * workspace-dashboard.js - Workspace Dashboard Data Aggregation
 *
 * Aggregates session, task, and event data across workspace projects
 * into a unified dashboard view. Designed for both CLI display and
 * potential future WebSocket dashboard integration.
 *
 * Usage:
 *   const { WorkspaceDashboard } = require('./workspace-dashboard');
 *   const dash = new WorkspaceDashboard('/path/to/workspace');
 *   const data = dash.getData();
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getWorkspaceConfig, WORKSPACE_DIR } = require('./workspace-discovery');
const { WorkspaceRegistry } = require('./workspace-registry');
const { WorkspaceBus } = require('./workspace-bus');

/**
 * WorkspaceDashboard - Cross-project data aggregation
 */
class WorkspaceDashboard {
  /**
   * @param {string} workspaceRoot - Workspace root directory
   */
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.registry = new WorkspaceRegistry(workspaceRoot);
    this.bus = new WorkspaceBus(workspaceRoot);
  }

  /**
   * Get full dashboard data across all projects.
   *
   * @returns {{ ok: boolean, data?: object, error?: string }}
   */
  getData() {
    const configResult = getWorkspaceConfig(this.workspaceRoot);
    if (!configResult.ok) {
      return { ok: false, error: configResult.error };
    }

    const config = configResult.config;
    const projects = config.projects || [];

    // Gather per-project data
    const projectData = projects.map(project => {
      const data = {
        name: project.name,
        path: project.path,
        exists: fs.existsSync(project.path),
        sessions: [],
        stories: { total: 0, in_progress: 0, ready: 0, completed: 0 },
        recentEvents: [],
      };

      // Per-project session data (federated)
      const projectSessions = this.registry.getProjectSessions(project.name);
      data.sessions = projectSessions;

      // Read project status.json for story counts
      const statusPath = path.join(project.path, 'docs', '09-agents', 'status.json');
      if (fs.existsSync(statusPath)) {
        try {
          const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
          const stories = status.stories || {};
          data.stories.total = Object.keys(stories).length;
          for (const story of Object.values(stories)) {
            const s = story.status || '';
            if (s === 'in_progress') data.stories.in_progress++;
            else if (s === 'ready') data.stories.ready++;
            else if (s === 'completed' || s === 'done') data.stories.completed++;
          }
        } catch (e) {
          // Non-critical
        }
      }

      return data;
    });

    // Recent workspace-level events
    const recentEvents = this.bus.read({ limit: 20 });

    // Summary
    const summary = {
      totalProjects: projects.length,
      totalSessions: projectData.reduce((sum, p) => sum + p.sessions.length, 0),
      totalStories: projectData.reduce((sum, p) => sum + p.stories.total, 0),
      inProgressStories: projectData.reduce((sum, p) => sum + p.stories.in_progress, 0),
      messageCounts: this.bus.getMessageCounts(),
    };

    return {
      ok: true,
      data: {
        workspace: this.workspaceRoot,
        config,
        projects: projectData,
        summary,
        recentEvents: recentEvents.messages || [],
      },
    };
  }

  /**
   * Format dashboard data for CLI display.
   *
   * @returns {string} Formatted dashboard string
   */
  formatForCLI() {
    const result = this.getData();
    if (!result.ok) return `Error: ${result.error}`;

    const { data } = result;
    const lines = [];

    lines.push(`\n  Workspace: ${data.workspace}`);
    lines.push(
      `  Projects: ${data.summary.totalProjects} | Sessions: ${data.summary.totalSessions} | Stories: ${data.summary.totalStories}`
    );
    lines.push('  ' + '-'.repeat(58));

    for (const project of data.projects) {
      const statusIcon = project.exists ? '' : ' [MISSING]';
      const sessionCount = project.sessions.length;
      const storyInfo = `${project.stories.in_progress} WIP, ${project.stories.ready} ready, ${project.stories.completed} done`;

      lines.push(`\n  ${project.name}/${statusIcon}`);
      lines.push(`    Stories: ${storyInfo}`);

      if (sessionCount > 0) {
        lines.push(`    Sessions (${sessionCount}):`);
        for (const session of project.sessions) {
          const branch = session.branch || 'unknown';
          const nickname = session.nickname || session.id;
          lines.push(`      ${nickname}  ${branch}`);
        }
      } else {
        lines.push('    No active sessions');
      }
    }

    if (data.recentEvents.length > 0) {
      lines.push('\n  Recent Events:');
      for (const event of data.recentEvents.slice(-5)) {
        const time = event.at ? new Date(event.at).toLocaleTimeString() : '?';
        const project = event.project || '?';
        const type = event.type || '?';
        lines.push(`    [${time}] ${project}: ${type}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }
}

module.exports = { WorkspaceDashboard };
