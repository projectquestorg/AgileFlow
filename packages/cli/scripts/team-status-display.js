#!/usr/bin/env node

/**
 * team-status-display.js - Team progress visualization for /babysit
 *
 * Shows teammate statuses, current tasks, quality gate results,
 * and coordination summary when Agent Teams is active.
 *
 * Usage:
 *   node team-status-display.js              # Full team status
 *   node team-status-display.js --compact    # One-line summary
 *   node team-status-display.js --json       # JSON output
 */

const fs = require('fs');
const path = require('path');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot, getSessionStatePath, getStatusPath } = require('../lib/paths');
const { safeReadJSON } = require('../lib/errors');

/**
 * Get team status from session-state.json.
 */
function getTeamStatus(rootDir) {
  const statePath = getSessionStatePath(rootDir);
  const result = safeReadJSON(statePath, { defaultValue: {} });
  const state = result.ok ? result.data : {};

  if (!state.active_team) {
    return { active: false };
  }

  return {
    active: true,
    team: state.active_team,
  };
}

/**
 * Get story progress for team's epic.
 */
function getEpicProgress(rootDir, epicId) {
  if (!epicId) return null;

  const statusPath = getStatusPath(rootDir);
  const result = safeReadJSON(statusPath, { defaultValue: {} });
  if (!result.ok) return null;

  const stories = result.data.stories || {};
  const epicStories = Object.entries(stories).filter(([_, s]) => s.epic === epicId);

  return {
    total: epicStories.length,
    completed: epicStories.filter(([_, s]) => s.status === 'completed').length,
    in_progress: epicStories.filter(([_, s]) => s.status === 'in_progress').length,
    ready: epicStories.filter(([_, s]) => s.status === 'ready').length,
    blocked: epicStories.filter(([_, s]) => s.status === 'blocked').length,
  };
}

/**
 * Format teammate status indicator.
 */
function formatTeammateStatus(status) {
  const indicators = {
    pending: `${c.dim}pending${c.reset}`,
    active: `${c.green}active${c.reset}`,
    idle: `${c.cyan}idle${c.reset}`,
    blocked: `${c.red}blocked${c.reset}`,
    completed: `${c.green}done${c.reset}`,
    error: `${c.red}error${c.reset}`,
  };
  return indicators[status] || `${c.dim}${status}${c.reset}`;
}

/**
 * Format quality gate result.
 */
function formatGateResult(gate) {
  if (!gate) return '';
  if (gate.passed) {
    return `${c.green}PASS${c.reset} (${gate.duration_ms || 0}ms)`;
  }
  return `${c.red}FAIL${c.reset}: ${gate.message || 'unknown'}`;
}

/**
 * Render full team status display.
 */
function renderTeamStatus(rootDir) {
  const { active, team } = getTeamStatus(rootDir);

  if (!active) {
    return `${c.dim}No active team session${c.reset}`;
  }

  const lines = [];

  // Header
  lines.push(`${c.cyan}${c.bold}Team: ${team.template}${c.reset} (${team.mode || 'native'})`);
  lines.push(`${c.dim}Started: ${team.started_at || 'unknown'}${c.reset}`);
  lines.push('');

  // Lead
  lines.push(`${c.bold}Lead:${c.reset} ${team.lead || 'team-lead'}`);
  lines.push('');

  // Teammates
  lines.push(`${c.bold}Teammates:${c.reset}`);
  const teammates = team.teammates || [];
  for (let i = 0; i < teammates.length; i++) {
    const t = teammates[i];
    const isLast = i === teammates.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';
    const status = formatTeammateStatus(t.status || 'pending');
    const domain = t.domain ? ` ${c.dim}(${t.domain})${c.reset}` : '';
    const task = t.current_task ? ` → ${c.dim}${t.current_task}${c.reset}` : '';
    lines.push(`${prefix} ${t.agent || t.name} [${status}]${domain}${task}`);
  }
  lines.push('');

  // Quality gates
  if (team.quality_gates) {
    lines.push(`${c.bold}Quality Gates:${c.reset}`);
    const gates = team.quality_gates;
    const gateNames = Array.isArray(gates) ? gates : Object.keys(gates);
    for (const gate of gateNames) {
      const name = typeof gate === 'string' ? gate : gate.name;
      const result = team.gate_results?.[name];
      const resultStr = result ? ` ${formatGateResult(result)}` : '';
      lines.push(`  - ${name}${resultStr}`);
    }
    lines.push('');
  }

  // Coordination summary
  if (team.messages_sent || team.tasks_completed) {
    lines.push(`${c.bold}Summary:${c.reset}`);
    if (team.tasks_completed) {
      lines.push(`  Tasks completed: ${team.tasks_completed}`);
    }
    if (team.messages_sent) {
      lines.push(`  Messages exchanged: ${team.messages_sent}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render compact one-line team status.
 */
function renderCompactStatus(rootDir) {
  const { active, team } = getTeamStatus(rootDir);

  if (!active) return '';

  const teammates = team.teammates || [];
  const activeCount = teammates.filter(t => t.status === 'active').length;
  const idleCount = teammates.filter(t => t.status === 'idle').length;
  const blockedCount = teammates.filter(t => t.status === 'blocked').length;

  let parts = [`Team: ${team.template}`];
  parts.push(`${teammates.length} members`);
  if (activeCount > 0) parts.push(`${c.green}${activeCount} active${c.reset}`);
  if (idleCount > 0) parts.push(`${c.cyan}${idleCount} idle${c.reset}`);
  if (blockedCount > 0) parts.push(`${c.red}${blockedCount} blocked${c.reset}`);

  return parts.join(' | ');
}

// CLI entry point
function main() {
  const args = process.argv.slice(2);
  const rootDir = getProjectRoot();

  if (args.includes('--json')) {
    const { active, team } = getTeamStatus(rootDir);
    console.log(JSON.stringify({ active, team: team || null }, null, 2));
  } else if (args.includes('--compact')) {
    const output = renderCompactStatus(rootDir);
    if (output) console.log(output);
  } else {
    console.log(renderTeamStatus(rootDir));
  }
}

module.exports = {
  getTeamStatus,
  renderTeamStatus,
  renderCompactStatus,
  formatTeammateStatus,
};

if (require.main === module) {
  main();
}
