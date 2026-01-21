#!/usr/bin/env node
/**
 * damage-control-write.js - PreToolUse hook for Write tool
 *
 * Validates file paths against access control patterns in damage-control-patterns.yaml
 * before allowing file writes. Part of AgileFlow's damage control system.
 *
 * Exit codes:
 *   0 - Allow operation
 *   2 - Block operation
 *
 * Usage: Configured as PreToolUse hook in .claude/settings.json
 */

const { createPathHook } = require('./lib/damage-control-utils');

// Run the hook using factory
createPathHook('write')();
