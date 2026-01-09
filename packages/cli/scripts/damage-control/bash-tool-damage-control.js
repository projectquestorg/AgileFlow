#!/usr/bin/env node

/**
 * bash-tool-damage-control.js - Validate bash commands against security patterns
 *
 * This PreToolUse hook runs before every Bash tool execution.
 * It checks the command against patterns.yaml to block or ask for
 * confirmation on dangerous commands.
 *
 * Exit codes:
 *   0 = Allow command to proceed (or ask with JSON output)
 *   2 = Block command
 *
 * For ask confirmation, outputs JSON:
 *   {"result": "ask", "message": "Reason for asking"}
 *
 * Usage (as PreToolUse hook):
 *   node .claude/hooks/damage-control/bash-tool-damage-control.js
 *
 * Environment:
 *   CLAUDE_TOOL_INPUT - JSON string with tool input (contains "command")
 *   CLAUDE_PROJECT_DIR - Project root directory
 */

const fs = require('fs');
const path = require('path');

// ANSI colors for output
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

// Exit codes
const EXIT_ALLOW = 0;
const EXIT_BLOCK = 2;

/**
 * Load patterns from YAML file
 * Falls back to built-in patterns if YAML parsing fails
 */
function loadPatterns(projectDir) {
  const locations = [
    path.join(projectDir, '.claude/hooks/damage-control/patterns.yaml'),
    path.join(projectDir, '.agileflow/hooks/damage-control/patterns.yaml'),
    path.join(projectDir, 'patterns.yaml'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      try {
        const content = fs.readFileSync(loc, 'utf8');
        // Simple YAML parsing for our specific structure
        return parseSimpleYaml(content);
      } catch (e) {
        console.error(`Warning: Could not parse ${loc}: ${e.message}`);
      }
    }
  }

  // Return built-in defaults if no file found
  return getDefaultPatterns();
}

/**
 * Simple YAML parser for patterns.yaml structure
 * Only handles the specific structure we use (arrays of objects with pattern/reason/ask)
 */
function parseSimpleYaml(content) {
  const patterns = {
    bashToolPatterns: [],
    askPatterns: [],
    agileflowPatterns: [],
  };

  let currentSection = null;
  let currentItem = null;

  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    // Check for section headers
    if (line.match(/^bashToolPatterns:/)) {
      currentSection = 'bashToolPatterns';
      continue;
    }
    if (line.match(/^askPatterns:/)) {
      currentSection = 'askPatterns';
      continue;
    }
    if (line.match(/^agileflowPatterns:/)) {
      currentSection = 'agileflowPatterns';
      continue;
    }
    if (line.match(/^(zeroAccessPaths|readOnlyPaths|noDeletePaths|config):/)) {
      currentSection = null; // Skip non-pattern sections
      continue;
    }

    // Parse pattern items
    if (currentSection && patterns[currentSection]) {
      const patternMatch = line.match(/^\s+-\s*pattern:\s*['"]?(.+?)['"]?\s*$/);
      if (patternMatch) {
        currentItem = { pattern: patternMatch[1] };
        patterns[currentSection].push(currentItem);
        continue;
      }

      const reasonMatch = line.match(/^\s+reason:\s*['"]?(.+?)['"]?\s*$/);
      if (reasonMatch && currentItem) {
        currentItem.reason = reasonMatch[1];
        continue;
      }

      const askMatch = line.match(/^\s+ask:\s*(true|false)\s*$/);
      if (askMatch && currentItem) {
        currentItem.ask = askMatch[1] === 'true';
        continue;
      }
    }
  }

  return patterns;
}

/**
 * Built-in default patterns (used if patterns.yaml not found)
 */
function getDefaultPatterns() {
  return {
    bashToolPatterns: [
      { pattern: '\\brm\\s+-[rRf]', reason: 'rm with recursive or force flags' },
      { pattern: 'DROP\\s+(TABLE|DATABASE)', reason: 'DROP commands are destructive' },
      { pattern: 'DELETE\\s+FROM\\s+\\w+\\s*;', reason: 'DELETE without WHERE clause' },
      { pattern: 'TRUNCATE\\s+(TABLE\\s+)?\\w+', reason: 'TRUNCATE removes all data' },
      { pattern: 'git\\s+push\\s+.*--force', reason: 'Force push can overwrite history', ask: true },
      { pattern: 'git\\s+reset\\s+--hard', reason: 'Hard reset discards changes', ask: true },
    ],
    askPatterns: [
      { pattern: 'DELETE\\s+FROM\\s+\\w+\\s+WHERE', reason: 'Confirm record deletion' },
      { pattern: 'npm\\s+publish', reason: 'Publishing to npm is permanent' },
    ],
    agileflowPatterns: [
      { pattern: 'rm.*\\.agileflow', reason: 'Deleting .agileflow breaks installation' },
      { pattern: 'rm.*\\.claude', reason: 'Deleting .claude breaks configuration' },
    ],
  };
}

/**
 * Check command against patterns
 * Returns: { blocked: boolean, ask: boolean, reason: string }
 */
function checkCommand(command, patterns) {
  // Combine all pattern sources
  const allPatterns = [
    ...(patterns.bashToolPatterns || []),
    ...(patterns.agileflowPatterns || []),
  ];

  // Check block/ask patterns
  for (const p of allPatterns) {
    try {
      const regex = new RegExp(p.pattern, 'i');
      if (regex.test(command)) {
        if (p.ask) {
          return { blocked: false, ask: true, reason: p.reason };
        }
        return { blocked: true, ask: false, reason: p.reason };
      }
    } catch (e) {
      // Invalid regex, skip
      console.error(`Warning: Invalid regex pattern: ${p.pattern}`);
    }
  }

  // Check ask-only patterns
  for (const p of (patterns.askPatterns || [])) {
    try {
      const regex = new RegExp(p.pattern, 'i');
      if (regex.test(command)) {
        return { blocked: false, ask: true, reason: p.reason };
      }
    } catch (e) {
      // Invalid regex, skip
    }
  }

  return { blocked: false, ask: false, reason: null };
}

/**
 * Main entry point
 */
function main() {
  // Get tool input from environment
  const toolInput = process.env.CLAUDE_TOOL_INPUT;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!toolInput) {
    // No input, allow by default
    process.exit(EXIT_ALLOW);
  }

  let input;
  try {
    input = JSON.parse(toolInput);
  } catch (e) {
    console.error('Error parsing CLAUDE_TOOL_INPUT:', e.message);
    process.exit(EXIT_ALLOW);
  }

  const command = input.command;
  if (!command) {
    process.exit(EXIT_ALLOW);
  }

  // Load patterns
  const patterns = loadPatterns(projectDir);

  // Check command
  const result = checkCommand(command, patterns);

  if (result.blocked) {
    // Block the command
    console.error(`${c.red}${c.bold}BLOCKED${c.reset}: ${result.reason}`);
    console.error(`${c.yellow}Command: ${command}${c.reset}`);
    console.error(`${c.cyan}This command was blocked by damage control.${c.reset}`);
    process.exit(EXIT_BLOCK);
  }

  if (result.ask) {
    // Ask for confirmation
    const response = {
      result: 'ask',
      message: `${result.reason}\n\nCommand: ${command}\n\nProceed with this command?`,
    };
    console.log(JSON.stringify(response));
    process.exit(EXIT_ALLOW);
  }

  // Allow the command
  process.exit(EXIT_ALLOW);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { checkCommand, loadPatterns, parseSimpleYaml };
