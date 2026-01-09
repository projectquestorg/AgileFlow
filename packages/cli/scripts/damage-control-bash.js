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

const fs = require('fs');
const path = require('path');
const { c } = require('../lib/colors');

/**
 * Find project root by looking for .agileflow directory
 */
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.agileflow'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Parse simplified YAML for damage control patterns
 * Only parses the structure we need - not a full YAML parser
 */
function parseSimpleYAML(content) {
  const config = {
    bashToolPatterns: [],
    askPatterns: [],
    agileflowProtections: []
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
      const patternValue = trimmed.replace('- pattern:', '').trim().replace(/^["']|["']$/g, '');
      currentPattern = { pattern: patternValue };
      config[currentSection].push(currentPattern);
    } else if (trimmed.startsWith('reason:') && currentPattern) {
      currentPattern.reason = trimmed.replace('reason:', '').trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('flags:') && currentPattern) {
      currentPattern.flags = trimmed.replace('flags:', '').trim().replace(/^["']|["']$/g, '');
    }
  }

  return config;
}

/**
 * Load patterns configuration from YAML file
 */
function loadPatterns(projectRoot) {
  const configPaths = [
    path.join(projectRoot, '.agileflow/config/damage-control-patterns.yaml'),
    path.join(projectRoot, '.agileflow/config/damage-control-patterns.yml'),
    path.join(projectRoot, '.agileflow/templates/damage-control-patterns.yaml')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        return parseSimpleYAML(content);
      } catch (e) {
        // Continue to next path
      }
    }
  }

  // Return empty config if no file found (fail-open)
  return { bashToolPatterns: [], askPatterns: [], agileflowProtections: [] };
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
    ...(config.agileflowProtections || [])
  ];

  for (const rule of blockedPatterns) {
    if (matchesPattern(command, rule)) {
      return {
        action: 'block',
        reason: rule.reason || 'Command blocked by damage control'
      };
    }
  }

  // Check ask patterns
  for (const rule of config.askPatterns || []) {
    if (matchesPattern(command, rule)) {
      return {
        action: 'ask',
        reason: rule.reason || 'Please confirm this command'
      };
    }
  }

  // Allow by default
  return { action: 'allow' };
}

/**
 * Main function - read input and validate
 */
function main() {
  const projectRoot = findProjectRoot();
  let inputData = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    inputData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      // Parse tool input from Claude Code
      const input = JSON.parse(inputData);
      const command = input.command || input.tool_input?.command || '';

      if (!command) {
        // No command to validate - allow
        process.exit(0);
      }

      // Load patterns and validate
      const config = loadPatterns(projectRoot);
      const result = validateCommand(command, config);

      switch (result.action) {
        case 'block':
          // Output error message and block
          console.error(`${c.coral}[BLOCKED]${c.reset} ${result.reason}`);
          console.error(`${c.dim}Command: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}${c.reset}`);
          process.exit(2);
          break;

        case 'ask':
          // Output JSON to trigger user confirmation
          console.log(JSON.stringify({
            result: 'ask',
            message: result.reason
          }));
          process.exit(0);
          break;

        case 'allow':
        default:
          // Allow command to proceed
          process.exit(0);
      }
    } catch (e) {
      // Parse error or other issue - fail open
      // This ensures broken config doesn't block all commands
      process.exit(0);
    }
  });

  // Handle no stdin (direct invocation)
  process.stdin.on('error', () => {
    process.exit(0);
  });

  // Set timeout to prevent hanging
  setTimeout(() => {
    process.exit(0);
  }, 4000);
}

main();
