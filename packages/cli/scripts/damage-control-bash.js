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

const { createBashHook } = require('./lib/damage-control-utils');

// Run the hook using factory
createBashHook()();
