#!/usr/bin/env node

/**
 * edit-tool-damage-control.js - PreToolUse hook for Edit tool
 *
 * Validates file paths against access control patterns in damage-control-patterns.yaml
 * before allowing file edits. Part of AgileFlow's damage control system.
 *
 * Exit codes:
 *   0 - Allow operation
 *   2 - Block operation
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
 */

const { createPathHook } = require('../lib/damage-control-utils');

// Run the hook using factory
createPathHook('edit')();
