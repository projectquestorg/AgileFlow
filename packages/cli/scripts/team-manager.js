#!/usr/bin/env node

/**
 * team-manager.js - CLI bridge for Agent Teams management
 *
 * Provides team lifecycle operations: start, stop, status, list.
 * When native Agent Teams is enabled, coordinates teammate sessions.
 * When disabled, falls back to orchestrator subagent mode.
 *
 * Usage:
 *   node team-manager.js list                    - List available templates
 *   node team-manager.js start <template>        - Start a team
 *   node team-manager.js status                  - Show team status
 *   node team-manager.js stop                    - Stop active team
 *   node team-manager.js template <name>         - Get template details
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

const fs = require('fs');
const path = require('path');

// Lazy-load paths module
let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../lib/paths');
    } catch (e) {
      // Fallback for installed context
      _paths = require('./lib/paths-fallback');
    }
  }
  return _paths;
}

// Lazy-load feature flags
let _featureFlags;
function getFeatureFlags() {
  if (!_featureFlags) {
    try {
      _featureFlags = require('../lib/feature-flags');
    } catch (e) {
      // Feature flags not available - assume disabled
      _featureFlags = {
        isAgentTeamsEnabled: () => false,
        getAgentTeamsMode: () => 'subagent',
        getFeatureFlags: () => ({ agentTeams: false, agentTeamsMode: 'subagent' }),
      };
    }
  }
  return _featureFlags;
}

// Lazy-load file-lock for atomic writes
let _fileLock;
function getFileLock() {
  if (!_fileLock) {
    try {
      _fileLock = require('./lib/file-lock');
    } catch (e) {
      // Fall back to direct writes
      _fileLock = null;
    }
  }
  return _fileLock;
}

// Lazy-load messaging bridge for event logging
let _messagingBridge;
function getMessagingBridge() {
  if (!_messagingBridge) {
    try {
      _messagingBridge = require('./messaging-bridge');
    } catch (e) {
      _messagingBridge = null;
    }
  }
  return _messagingBridge;
}

/**
 * Find the teams directory
 */
function getTeamsDir(rootDir) {
  const agileflowDir = path.join(rootDir, '.agileflow');
  const teamsDir = path.join(agileflowDir, 'teams');

  // Installed location
  if (fs.existsSync(teamsDir)) return teamsDir;

  // Dev location (running from source)
  const devTeamsDir = path.join(rootDir, 'packages', 'cli', 'src', 'core', 'teams');
  if (fs.existsSync(devTeamsDir)) return devTeamsDir;

  return null;
}

/**
 * List all available team templates
 */
function listTemplates(rootDir) {
  const teamsDir = getTeamsDir(rootDir);
  if (!teamsDir) {
    return { ok: false, error: 'No teams directory found. Run: npx agileflow update' };
  }

  const files = fs.readdirSync(teamsDir).filter(f => f.endsWith('.json'));
  const templates = [];

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(teamsDir, file), 'utf8'));
      templates.push({
        name: content.name,
        description: content.description,
        teammates: content.teammates ? content.teammates.length : 0,
        tags: content.tags || [],
        file,
      });
    } catch (e) {
      // Skip invalid template files
    }
  }

  return { ok: true, templates };
}

/**
 * Get a specific template by name
 */
function getTemplate(rootDir, name) {
  const teamsDir = getTeamsDir(rootDir);
  if (!teamsDir) {
    return { ok: false, error: 'No teams directory found' };
  }

  const filePath = path.join(teamsDir, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Template "${name}" not found` };
  }

  try {
    const template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, template };
  } catch (e) {
    return { ok: false, error: `Failed to parse template "${name}": ${e.message}` };
  }
}

/**
 * Build the native TeamCreate payload from an AgileFlow template.
 * This structures the template data in the format expected by Claude Code's
 * experimental Agent Teams TeamCreate tool.
 *
 * @param {object} template - Parsed team template
 * @param {string} templateName - Template name
 * @returns {object} Native TeamCreate payload
 */
function buildNativeTeamPayload(template, templateName) {
  return {
    name: template.name || templateName,
    description: template.description || `AgileFlow team: ${templateName}`,
    teammates: (template.teammates || []).map(t => ({
      name: t.agent,
      role: t.role || t.domain,
      instructions: t.instructions || `${t.role} agent for ${t.domain}`,
    })),
    delegate_mode: template.delegate_mode !== false,
  };
}

/**
 * Start a team from a template.
 * When native Agent Teams is enabled, builds a TeamCreate-compatible payload.
 * When disabled, falls back to subagent orchestration mode.
 *
 * Uses atomic writes for session-state.json to prevent concurrent write conflicts.
 */
function startTeam(rootDir, templateName) {
  const ff = getFeatureFlags();
  const mode = ff.getAgentTeamsMode({ rootDir });

  // Load template
  const result = getTemplate(rootDir, templateName);
  if (!result.ok) return result;

  const template = result.template;

  // Build native payload when in native mode
  let nativePayload = null;
  if (mode === 'native') {
    nativePayload = buildNativeTeamPayload(template, templateName);
  }

  // Generate trace ID for correlating events across the team lifecycle
  const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Record active team in session-state.json using atomic writes
  try {
    const paths = getPaths();
    const sessionStatePath = paths.getSessionStatePath(rootDir);
    const fileLock = getFileLock();

    const updateState = state => {
      state.active_team = {
        template: templateName,
        mode,
        trace_id: traceId,
        native_payload: nativePayload,
        lead: template.lead,
        teammates: template.teammates.map(t => ({
          agent: t.agent,
          role: t.role,
          domain: t.domain,
          status: 'pending',
        })),
        quality_gates: template.quality_gates,
        started_at: new Date().toISOString(),
      };

      state.team_metrics = {
        started_at: new Date().toISOString(),
        template: templateName,
        mode,
        trace_id: traceId,
        teammate_count: template.teammates.length,
        tasks_assigned: 0,
        tasks_completed: 0,
        messages_sent: 0,
        gate_runs: [],
      };

      return state;
    };

    if (fileLock) {
      // Use atomic read-modify-write when available
      if (fs.existsSync(sessionStatePath)) {
        fileLock.atomicReadModifyWrite(sessionStatePath, updateState);
      } else {
        fileLock.atomicWriteJSON(sessionStatePath, updateState({}));
      }
    } else {
      // Fallback to direct write
      let state = {};
      if (fs.existsSync(sessionStatePath)) {
        state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      }
      state = updateState(state);
      fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    }
  } catch (e) {
    // Non-critical - team can still function without state tracking
  }

  // Log team_created event to bus
  try {
    const bridge = getMessagingBridge();
    if (bridge) {
      bridge.sendMessage(rootDir, {
        from: 'team-manager',
        to: 'team-lead',
        type: 'team_created',
        template: templateName,
        mode,
        trace_id: traceId,
        teammate_count: template.teammates.length,
      });
    }
  } catch (e) {
    // Non-critical
  }

  return {
    ok: true,
    mode,
    trace_id: traceId,
    template: templateName,
    lead: template.lead,
    teammates: template.teammates,
    quality_gates: template.quality_gates,
    native_payload: nativePayload,
  };
}

/**
 * Get active team status
 */
function getTeamStatus(rootDir) {
  try {
    const paths = getPaths();
    const sessionStatePath = paths.getSessionStatePath(rootDir);
    if (!fs.existsSync(sessionStatePath)) {
      return { ok: true, active: false };
    }

    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    if (!state.active_team) {
      return { ok: true, active: false };
    }

    return {
      ok: true,
      active: true,
      team: state.active_team,
      metrics: state.team_metrics || null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Stop active team.
 * Uses atomic writes for session-state.json.
 * Logs team_stopped event to bus.
 */
function stopTeam(rootDir) {
  try {
    const paths = getPaths();
    const sessionStatePath = paths.getSessionStatePath(rootDir);
    if (!fs.existsSync(sessionStatePath)) {
      return { ok: false, error: 'No session state found' };
    }

    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    if (!state.active_team) {
      return { ok: false, error: 'No active team session' };
    }

    const team = state.active_team;
    const duration = Date.now() - new Date(team.started_at).getTime();

    // Finalize team metrics with completion data
    if (state.team_metrics) {
      state.team_metrics.completed_at = new Date().toISOString();
      state.team_metrics.duration_ms = duration;
    }

    // Clear active team
    delete state.active_team;

    // Write atomically
    const fileLock = getFileLock();
    if (fileLock) {
      fileLock.atomicWriteJSON(sessionStatePath, state);
    } else {
      fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    }

    // Log team_stopped event
    try {
      const bridge = getMessagingBridge();
      if (bridge) {
        bridge.sendMessage(rootDir, {
          from: 'team-manager',
          to: 'system',
          type: 'team_stopped',
          template: team.template,
          mode: team.mode,
          trace_id: team.trace_id,
          duration_ms: duration,
          tasks_completed: state.team_metrics ? state.team_metrics.tasks_completed : 0,
        });
      }
    } catch (e) {
      // Non-critical
    }

    // Aggregate and save team metrics by trace_id
    try {
      if (team.trace_id) {
        const teamEvents = require('./lib/team-events');
        const metrics = teamEvents.aggregateTeamMetrics(rootDir, team.trace_id);
        if (metrics.ok) {
          teamEvents.saveAggregatedMetrics(rootDir, metrics);
        }
      }
    } catch (e) {
      // Non-critical - metrics aggregation is best-effort
    }

    return {
      ok: true,
      template: team.template,
      duration_ms: duration,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// CLI entry point
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Auto-detect project root
  let rootDir = process.cwd();
  try {
    const paths = getPaths();
    rootDir = paths.getProjectRoot();
  } catch (e) {
    // Use cwd
  }

  let result;

  switch (command) {
    case 'list':
      result = listTemplates(rootDir);
      break;

    case 'start':
      if (!args[1]) {
        result = { ok: false, error: 'Usage: team-manager.js start <template-name>' };
      } else {
        result = startTeam(rootDir, args[1]);
      }
      break;

    case 'status':
      result = getTeamStatus(rootDir);
      break;

    case 'stop':
      result = stopTeam(rootDir);
      break;

    case 'template':
      if (!args[1]) {
        result = { ok: false, error: 'Usage: team-manager.js template <name>' };
      } else {
        result = getTemplate(rootDir, args[1]);
      }
      break;

    default:
      result = {
        ok: false,
        error: `Unknown command: ${command}\nUsage: team-manager.js <list|start|status|stop|template>`,
      };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

// Export for use by other scripts
module.exports = {
  listTemplates,
  getTemplate,
  startTeam,
  getTeamStatus,
  stopTeam,
  getTeamsDir,
  buildNativeTeamPayload,
};

// Run CLI if invoked directly
if (require.main === module) {
  main();
}
