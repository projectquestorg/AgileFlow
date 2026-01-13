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
  outputBlocked,
  runDamageControlHook,
  parsePathPatterns,
  validatePathAgainstPatterns,
} = require('./lib/damage-control-utils');

// Run the hook
const projectRoot = findProjectRoot();
const defaultConfig = { zeroAccessPaths: [], readOnlyPaths: [], noDeletePaths: [] };

runDamageControlHook({
  getInputValue: input => input.file_path || input.tool_input?.file_path,
  loadConfig: () => loadPatterns(projectRoot, parsePathPatterns, defaultConfig),
  validate: (filePath, config) => validatePathAgainstPatterns(filePath, config, 'write'),
  onBlock: (result, filePath) => {
    outputBlocked(result.reason, result.detail, `File: ${filePath}`);
  },
});
