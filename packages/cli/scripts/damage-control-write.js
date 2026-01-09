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
const os = require('os');
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
 * Expand ~ to home directory
 */
function expandPath(p) {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Parse simplified YAML for path patterns
 */
function parseSimpleYAML(content) {
  const config = {
    zeroAccessPaths: [],
    readOnlyPaths: [],
    noDeletePaths: []
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
  return { zeroAccessPaths: [], readOnlyPaths: [], noDeletePaths: [] };
}

/**
 * Check if a file path matches any of the protected patterns
 */
function pathMatches(filePath, patterns) {
  if (!filePath) return null;

  const normalizedPath = path.resolve(filePath);
  const relativePath = path.relative(process.cwd(), normalizedPath);

  for (const pattern of patterns) {
    const expandedPattern = expandPath(pattern);

    // Check if pattern is a directory prefix
    if (pattern.endsWith('/')) {
      const patternDir = expandedPattern.slice(0, -1);
      if (normalizedPath.startsWith(patternDir)) {
        return pattern;
      }
    }

    // Check exact match
    if (normalizedPath === expandedPattern) {
      return pattern;
    }

    // Check if normalized path ends with pattern (for filenames like "id_rsa")
    if (normalizedPath.endsWith(pattern) || relativePath.endsWith(pattern)) {
      return pattern;
    }

    // Check if pattern appears in path (for patterns like "*.pem")
    if (pattern.startsWith('*')) {
      const ext = pattern.slice(1);
      if (normalizedPath.endsWith(ext) || relativePath.endsWith(ext)) {
        return pattern;
      }
    }

    // Check if path contains pattern (for things like ".env.production")
    const patternBase = path.basename(pattern);
    if (path.basename(normalizedPath) === patternBase) {
      return pattern;
    }
  }

  return null;
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
      detail: 'This file is protected and cannot be accessed'
    };
  }

  // Check read-only paths - cannot write
  const readOnlyMatch = pathMatches(filePath, config.readOnlyPaths || []);
  if (readOnlyMatch) {
    return {
      action: 'block',
      reason: `Read-only path: ${readOnlyMatch}`,
      detail: 'This file is read-only and cannot be written to'
    };
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
      const filePath = input.file_path || input.tool_input?.file_path || '';

      if (!filePath) {
        // No path to validate - allow
        process.exit(0);
      }

      // Load patterns and validate
      const config = loadPatterns(projectRoot);
      const result = validatePath(filePath, config);

      if (result.action === 'block') {
        console.error(`${c.coral}[BLOCKED]${c.reset} ${result.reason}`);
        console.error(`${c.dim}${result.detail}${c.reset}`);
        console.error(`${c.dim}File: ${filePath}${c.reset}`);
        process.exit(2);
      }

      // Allow
      process.exit(0);
    } catch (e) {
      // Parse error or other issue - fail open
      process.exit(0);
    }
  });

  // Handle no stdin
  process.stdin.on('error', () => {
    process.exit(0);
  });

  // Set timeout to prevent hanging
  setTimeout(() => {
    process.exit(0);
  }, 4000);
}

main();
