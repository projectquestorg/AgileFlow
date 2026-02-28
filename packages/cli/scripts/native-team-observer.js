#!/usr/bin/env node
/**
 * native-team-observer.js - PostToolUse hook for native Agent Teams observability
 *
 * Logs native TeamCreate, SendMessage, and ListTeams tool calls to the
 * AgileFlow JSONL bus so that native mode has observability parity with
 * subagent mode (where team-manager.js handles dual-write).
 *
 * Exit codes:
 *   0 - Always (observability hook, never blocks)
 *
 * Usage: Configured as PostToolUse hook in .claude/settings.json
 */

const fs = require('fs');
const path = require('path');

// Tools this hook observes
const NATIVE_TEAM_TOOLS = ['TeamCreate', 'SendMessage', 'ListTeams'];

// Lazy-load modules to minimize startup cost
let _featureFlags;
function getFeatureFlags() {
  if (!_featureFlags) {
    const candidates = [
      path.join(__dirname, '..', 'lib', 'feature-flags.js'),
      path.join(__dirname, 'lib', 'feature-flags.js'),
      path.join(process.cwd(), '.agileflow', 'lib', 'feature-flags.js'),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          _featureFlags = require(candidate);
          return _featureFlags;
        }
      } catch (e) {
        // Try next
      }
    }
    return null;
  }
  return _featureFlags;
}

let _paths;
function getPaths() {
  if (!_paths) {
    const candidates = [
      path.join(__dirname, '..', 'lib', 'paths.js'),
      path.join(__dirname, 'lib', 'paths.js'),
      path.join(process.cwd(), '.agileflow', 'lib', 'paths.js'),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          _paths = require(candidate);
          return _paths;
        }
      } catch (e) {
        // Try next
      }
    }
    return null;
  }
  return _paths;
}

let _messagingBridge;
function getMessagingBridge() {
  if (!_messagingBridge) {
    const candidates = [
      path.join(__dirname, 'messaging-bridge.js'),
      path.join(process.cwd(), '.agileflow', 'scripts', 'messaging-bridge.js'),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          _messagingBridge = require(candidate);
          return _messagingBridge;
        }
      } catch (e) {
        // Try next
      }
    }
    return null;
  }
  return _messagingBridge;
}

/**
 * Read trace_id from session-state.json active_team.
 * Returns undefined if not available.
 */
function getTraceId(rootDir) {
  try {
    const paths = getPaths();
    if (!paths) return undefined;
    const sessionStatePath = paths.getSessionStatePath(rootDir);
    if (!fs.existsSync(sessionStatePath)) return undefined;
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    return state.active_team?.trace_id;
  } catch (e) {
    return undefined;
  }
}

/**
 * Get the active_team template name from session-state.json.
 */
function getActiveTeamTemplate(rootDir) {
  try {
    const paths = getPaths();
    if (!paths) return undefined;
    const sessionStatePath = paths.getSessionStatePath(rootDir);
    if (!fs.existsSync(sessionStatePath)) return undefined;
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    return state.active_team?.template;
  } catch (e) {
    return undefined;
  }
}

/**
 * Check if session-state has an active_team.
 */
function hasActiveTeam(rootDir) {
  try {
    const paths = getPaths();
    if (!paths) return false;
    const sessionStatePath = paths.getSessionStatePath(rootDir);
    if (!fs.existsSync(sessionStatePath)) return false;
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
    return !!state.active_team;
  } catch (e) {
    return false;
  }
}

// Read stdin and process
let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const toolName = context.tool_name;

    // Skip non-matching tools
    if (!NATIVE_TEAM_TOOLS.includes(toolName)) {
      process.exit(0);
    }

    // Check if native Agent Teams is enabled
    const featureFlags = getFeatureFlags();
    if (!featureFlags || !featureFlags.isAgentTeamsEnabled({ rootDir: process.cwd() })) {
      process.exit(0);
    }

    const rootDir = process.cwd();
    const bridge = getMessagingBridge();
    if (!bridge) {
      process.exit(0);
    }

    const traceId = getTraceId(rootDir);
    const toolInput = context.tool_input || {};
    const toolOutput = context.tool_output;

    switch (toolName) {
      case 'TeamCreate': {
        const teamName = toolInput.name || 'unknown';
        const teammateCount = Array.isArray(toolInput.teammates)
          ? toolInput.teammates.length
          : undefined;
        bridge.logNativeTeamCreate(rootDir, teamName, traceId, teammateCount);
        break;
      }

      case 'SendMessage': {
        const to = toolInput.to || 'unknown';
        const content = toolInput.message || toolInput.content || '';
        bridge.logNativeSend(rootDir, 'lead', to, content, traceId);
        break;
      }

      case 'ListTeams': {
        // Detect team completion: ListTeams returns no active teams but
        // session-state still has an active_team
        if (hasActiveTeam(rootDir)) {
          let noActiveTeams = false;
          try {
            if (typeof toolOutput === 'string') {
              const parsed = JSON.parse(toolOutput);
              noActiveTeams = Array.isArray(parsed) ? parsed.length === 0 : !parsed.teams?.length;
            } else if (typeof toolOutput === 'object' && toolOutput !== null) {
              noActiveTeams = Array.isArray(toolOutput)
                ? toolOutput.length === 0
                : !toolOutput.teams?.length;
            }
          } catch (e) {
            // Can't parse output - skip completion detection
          }

          if (noActiveTeams) {
            const template = getActiveTeamTemplate(rootDir) || 'unknown';
            bridge.logNativeTeamCompleted(rootDir, template, traceId, 'completed');
          }
        }
        break;
      }
    }
  } catch (e) {
    // Fail-open: observability hook should never block
  }

  process.exit(0);
});

// Handle empty stdin (timeout safety)
setTimeout(() => process.exit(0), 4000);
