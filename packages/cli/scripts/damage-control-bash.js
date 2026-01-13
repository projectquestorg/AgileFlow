#!/usr/bin/env node
/**
 * damage-control-bash.js - PreToolUse hook for Bash tool
 *
 * Validates bash commands against patterns in damage-control-patterns.yaml
 * before execution. Part of AgileFlow's damage control system.
 *
 * Exit codes:
 *   0 - Allow command (or ask via JSON output)
 *   2 - Block command
 *
 * For "ask" response, output JSON to stdout:
 *   { "result": "ask", "message": "Confirm this action?" }
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
 */

const {
  findProjectRoot,
  loadPatterns,
  outputBlocked,
  runDamageControlHook,
  parseBashPatterns,
  c,
} = require('./lib/damage-control-utils');

/**
 * Test command against a single pattern rule
 */
function matchesPattern(command, rule) {
  try {
    const flags = rule.flags || '';
    const regex = new RegExp(rule.pattern, flags);
    return regex.test(command);
  } catch (e) {
    // Invalid regex - skip this pattern
    return false;
  }
}

/**
 * Validate command against all patterns
 */
function validateCommand(command, config) {
  // Check blocked patterns (bashToolPatterns + agileflowProtections)
  const blockedPatterns = [
    ...(config.bashToolPatterns || []),
    ...(config.agileflowProtections || []),
  ];

  for (const rule of blockedPatterns) {
    if (matchesPattern(command, rule)) {
      return {
        action: 'block',
        reason: rule.reason || 'Command blocked by damage control',
      };
    }
  }

  // Check ask patterns
  for (const rule of config.askPatterns || []) {
    if (matchesPattern(command, rule)) {
      return {
        action: 'ask',
        reason: rule.reason || 'Please confirm this command',
      };
    }
  }

  // Allow by default
  return { action: 'allow' };
}

// Run the hook
const projectRoot = findProjectRoot();
const defaultConfig = { bashToolPatterns: [], askPatterns: [], agileflowProtections: [] };

runDamageControlHook({
  getInputValue: input => input.command || input.tool_input?.command,
  loadConfig: () => loadPatterns(projectRoot, parseBashPatterns, defaultConfig),
  validate: validateCommand,
  onBlock: (result, command) => {
    outputBlocked(
      result.reason,
      `Command: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`
    );
  },
});
