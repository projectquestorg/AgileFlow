#!/usr/bin/env node

/**
 * edit-tool-damage-control.js - Enforce path protection for Edit tool
 *
 * This PreToolUse hook runs before every Edit tool execution.
 * It checks the file path against patterns.yaml to block edits
 * to protected paths.
 *
 * Path protection levels:
 *   zeroAccessPaths: Cannot read, write, edit, or delete
 *   readOnlyPaths: Can read, cannot modify or delete
 *   noDeletePaths: Can read and modify, cannot delete (Edit is allowed)
 *
 * Exit codes:
 *   0 = Allow edit to proceed
 *   2 = Block edit
 *
 * Usage (as PreToolUse hook):
 *   node .claude/hooks/damage-control/edit-tool-damage-control.js
 *
 * Environment:
 *   CLAUDE_TOOL_INPUT - JSON string with tool input (contains "file_path")
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
 * Load path protection rules from patterns.yaml
 */
function loadPathRules(projectDir) {
  const locations = [
    path.join(projectDir, '.claude/hooks/damage-control/patterns.yaml'),
    path.join(projectDir, '.agileflow/hooks/damage-control/patterns.yaml'),
    path.join(projectDir, 'patterns.yaml'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      try {
        const content = fs.readFileSync(loc, 'utf8');
        return parsePathRules(content);
      } catch (e) {
        console.error(`Warning: Could not parse ${loc}: ${e.message}`);
      }
    }
  }

  return getDefaultPathRules();
}

/**
 * Parse path rules from YAML content
 */
function parsePathRules(content) {
  const rules = {
    zeroAccessPaths: [],
    readOnlyPaths: [],
    noDeletePaths: [],
  };

  let currentSection = null;

  const lines = content.split('\n');

  for (const line of lines) {
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    if (line.match(/^zeroAccessPaths:/)) {
      currentSection = 'zeroAccessPaths';
      continue;
    }
    if (line.match(/^readOnlyPaths:/)) {
      currentSection = 'readOnlyPaths';
      continue;
    }
    if (line.match(/^noDeletePaths:/)) {
      currentSection = 'noDeletePaths';
      continue;
    }
    if (line.match(/^(bashToolPatterns|askPatterns|agileflowPatterns|config):/)) {
      currentSection = null;
      continue;
    }

    if (currentSection && rules[currentSection]) {
      const pathMatch = line.match(/^\s+-\s*['"]?(.+?)['"]?\s*$/);
      if (pathMatch) {
        rules[currentSection].push(pathMatch[1]);
      }
    }
  }

  return rules;
}

/**
 * Default path rules if patterns.yaml not found
 */
function getDefaultPathRules() {
  return {
    zeroAccessPaths: [
      '~/.ssh/',
      '~/.aws/credentials',
      '.env',
      '.env.local',
      '.env.production',
    ],
    readOnlyPaths: [
      '/etc/',
      '~/.bashrc',
      '~/.zshrc',
      'package-lock.json',
      'yarn.lock',
      '.git/',
    ],
    noDeletePaths: [
      '.agileflow/',
      '.claude/',
      'docs/09-agents/status.json',
      'CLAUDE.md',
    ],
  };
}

/**
 * Expand home directory in path
 */
function expandHome(filePath) {
  if (filePath.startsWith('~/')) {
    return path.join(process.env.HOME || '', filePath.slice(2));
  }
  return filePath;
}

/**
 * Check if a file path matches a pattern
 * Supports:
 *   - Exact paths
 *   - Directory prefixes (ending with /)
 *   - Glob wildcards (**)
 */
function pathMatches(filePath, pattern) {
  const expandedPattern = expandHome(pattern);
  const normalizedFile = path.normalize(filePath);
  const normalizedPattern = path.normalize(expandedPattern);

  // Exact match
  if (normalizedFile === normalizedPattern) return true;

  // Directory prefix match (pattern ends with /)
  if (pattern.endsWith('/')) {
    if (normalizedFile.startsWith(normalizedPattern)) return true;
  }

  // Glob pattern (**/)
  if (pattern.includes('**/')) {
    const globPart = pattern.split('**/')[1];
    if (normalizedFile.includes(globPart)) return true;
  }

  // Simple wildcard at end
  if (pattern.endsWith('*')) {
    const prefix = normalizedPattern.slice(0, -1);
    if (normalizedFile.startsWith(prefix)) return true;
  }

  // Basename match (for patterns like .env)
  if (!pattern.includes('/') && !pattern.includes(path.sep)) {
    const basename = path.basename(normalizedFile);
    if (basename === pattern) return true;
    // Pattern like .env* matching .env.local
    if (pattern.endsWith('*')) {
      const patternBase = pattern.slice(0, -1);
      if (basename.startsWith(patternBase)) return true;
    }
  }

  return false;
}

/**
 * Check if file path is protected
 * Returns: { blocked: boolean, reason: string, level: string }
 */
function checkPath(filePath, rules) {
  // Check zero access paths (blocked completely)
  for (const pattern of rules.zeroAccessPaths) {
    if (pathMatches(filePath, pattern)) {
      return {
        blocked: true,
        reason: `Path is in zero-access protected list: ${pattern}`,
        level: 'zero-access',
      };
    }
  }

  // Check read-only paths (cannot edit)
  for (const pattern of rules.readOnlyPaths) {
    if (pathMatches(filePath, pattern)) {
      return {
        blocked: true,
        reason: `Path is read-only: ${pattern}`,
        level: 'read-only',
      };
    }
  }

  // noDeletePaths allows editing, so we don't block here
  // (deletion is handled by a different mechanism or file watcher)

  return { blocked: false, reason: null, level: null };
}

/**
 * Main entry point
 */
function main() {
  const toolInput = process.env.CLAUDE_TOOL_INPUT;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!toolInput) {
    process.exit(EXIT_ALLOW);
  }

  let input;
  try {
    input = JSON.parse(toolInput);
  } catch (e) {
    console.error('Error parsing CLAUDE_TOOL_INPUT:', e.message);
    process.exit(EXIT_ALLOW);
  }

  const filePath = input.file_path;
  if (!filePath) {
    process.exit(EXIT_ALLOW);
  }

  // Resolve to absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectDir, filePath);

  // Load rules
  const rules = loadPathRules(projectDir);

  // Check path
  const result = checkPath(absolutePath, rules);

  if (result.blocked) {
    console.error(`${c.red}${c.bold}BLOCKED${c.reset}: ${result.reason}`);
    console.error(`${c.yellow}File: ${filePath}${c.reset}`);
    console.error(`${c.cyan}This file is protected by damage control (${result.level}).${c.reset}`);
    process.exit(EXIT_BLOCK);
  }

  process.exit(EXIT_ALLOW);
}

if (require.main === module) {
  main();
}

module.exports = { checkPath, loadPathRules, pathMatches };
