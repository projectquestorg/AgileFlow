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

function loadDamageControlUtils() {
  const candidates = [
    path.join(__dirname, 'lib', 'damage-control-utils.js'),
    path.join(process.cwd(), '.agileflow', 'scripts', 'lib', 'damage-control-utils.js'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return require(candidate);
      }
    } catch (e) {
      // Try next candidate
    }
  }

  return null;
}

const utils = loadDamageControlUtils();
if (!utils || typeof utils.createBashHook !== 'function') {
  // Fail-open: never block Bash tool because hook bootstrap failed.
  process.exit(0);
}

try {
  utils.createBashHook()();
} catch (e) {
  // Fail-open on runtime errors to avoid breaking CLI workflows.
  process.exit(0);
}
