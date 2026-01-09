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
  c,
} = require('./lib/damage-control-utils');

/**
 * Parse simplified YAML for damage control patterns
 * Only parses the structure we need - not a full YAML parser
 */
function parseSimpleYAML(content) {
  const config = {
    bashToolPatterns: [],
    askPatterns: [],
    agileflowProtections: [],
  };

  let currentSection = null;
  let currentPattern = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect section headers
    if (trimmed === 'bashToolPatterns:') {
      currentSection = 'bashToolPatterns';
      currentPattern = null;
    } else if (trimmed === 'askPatterns:') {
      currentSection = 'askPatterns';
      currentPattern = null;
    } else if (trimmed === 'agileflowProtections:') {
      currentSection = 'agileflowProtections';
      currentPattern = null;
    } else if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      // Other sections we don't care about for bash validation
      currentSection = null;
      currentPattern = null;
    } else if (trimmed.startsWith('- pattern:') && currentSection) {
      // New pattern entry
      const patternValue = trimmed
        .replace('- pattern:', '')
        .trim()
        .replace(/^["']|["']$/g, '');
      currentPattern = { pattern: patternValue };
      config[currentSection].push(currentPattern);
    } else if (trimmed.startsWith('reason:') && currentPattern) {
      currentPattern.reason = trimmed
        .replace('reason:', '')
        .trim()
        .replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('flags:') && currentPattern) {
      currentPattern.flags = trimmed
        .replace('flags:', '')
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }

  return config;
}

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
  loadConfig: () => loadPatterns(projectRoot, parseSimpleYAML, defaultConfig),
  validate: validateCommand,
  onBlock: (result, command) => {
    outputBlocked(
      result.reason,
      `Command: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`
    );
  },
});
