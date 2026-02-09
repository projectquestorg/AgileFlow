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
if (!utils || typeof utils.createPathHook !== 'function') {
  // Fail-open: never block Write tool because hook bootstrap failed.
  process.exit(0);
}

try {
  utils.createPathHook('write')();
} catch (e) {
  // Fail-open on runtime errors to avoid breaking CLI workflows.
  process.exit(0);
}
