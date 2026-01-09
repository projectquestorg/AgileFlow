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

const {
  findProjectRoot,
  loadPatterns,
  pathMatches,
  outputBlocked,
  runDamageControlHook,
} = require('./lib/damage-control-utils');

/**
 * Parse simplified YAML for path patterns
 */
function parseSimpleYAML(content) {
  const config = {
    zeroAccessPaths: [],
    readOnlyPaths: [],
    noDeletePaths: [],
  };

  let currentSection = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect section headers
    if (trimmed === 'zeroAccessPaths:') {
      currentSection = 'zeroAccessPaths';
    } else if (trimmed === 'readOnlyPaths:') {
      currentSection = 'readOnlyPaths';
    } else if (trimmed === 'noDeletePaths:') {
      currentSection = 'noDeletePaths';
    } else if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      // Other sections we don't care about for path validation
      currentSection = null;
    } else if (trimmed.startsWith('- ') && currentSection && config[currentSection]) {
      // Path entry
      const pathValue = trimmed.slice(2).replace(/^["']|["']$/g, '');
      config[currentSection].push(pathValue);
    }
  }

  return config;
}

/**
 * Validate file path for write operation
 */
function validatePath(filePath, config) {
  // Check zero access paths - completely blocked
  const zeroMatch = pathMatches(filePath, config.zeroAccessPaths || []);
  if (zeroMatch) {
    return {
      action: 'block',
      reason: `Zero-access path: ${zeroMatch}`,
      detail: 'This file is protected and cannot be accessed',
    };
  }

  // Check read-only paths - cannot write
  const readOnlyMatch = pathMatches(filePath, config.readOnlyPaths || []);
  if (readOnlyMatch) {
    return {
      action: 'block',
      reason: `Read-only path: ${readOnlyMatch}`,
      detail: 'This file is read-only and cannot be written to',
    };
  }

  // Allow by default
  return { action: 'allow' };
}

// Run the hook
const projectRoot = findProjectRoot();
const defaultConfig = { zeroAccessPaths: [], readOnlyPaths: [], noDeletePaths: [] };

runDamageControlHook({
  getInputValue: input => input.file_path || input.tool_input?.file_path,
  loadConfig: () => loadPatterns(projectRoot, parseSimpleYAML, defaultConfig),
  validate: validatePath,
  onBlock: (result, filePath) => {
    outputBlocked(result.reason, result.detail, `File: ${filePath}`);
  },
});
