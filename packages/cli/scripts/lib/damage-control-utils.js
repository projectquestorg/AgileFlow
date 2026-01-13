/**
 * damage-control-utils.js - Shared utilities for damage-control hooks
 *
 * IMPORTANT: These scripts must FAIL OPEN (exit 0 on error)
 * to avoid blocking users when config is broken.
 *
 * This module is copied to .agileflow/scripts/lib/ at install time
 * and used by damage-control-bash.js, damage-control-edit.js, damage-control-write.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Inline colors (no external dependency - keeps scripts standalone)
const c = {
  coral: '\x1b[38;5;203m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

// Shared constants
const CONFIG_PATHS = [
  '.agileflow/config/damage-control-patterns.yaml',
  '.agileflow/config/damage-control-patterns.yml',
  '.agileflow/templates/damage-control-patterns.yaml',
];

const STDIN_TIMEOUT_MS = 4000;

/**
 * Find project root by looking for .agileflow directory
 * @returns {string} Project root path or current working directory
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
 * @param {string} p - Path that may start with ~/
 * @returns {string} Expanded path
 */
function expandPath(p) {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Load patterns configuration from YAML file
 * Returns empty config if not found (fail-open)
 *
 * @param {string} projectRoot - Project root directory
 * @param {function} parseYAML - Function to parse YAML content
 * @param {object} defaultConfig - Default config if no file found
 * @returns {object} Parsed configuration
 */
function loadPatterns(projectRoot, parseYAML, defaultConfig = {}) {
  for (const configPath of CONFIG_PATHS) {
    const fullPath = path.join(projectRoot, configPath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        return parseYAML(content);
      } catch (e) {
        // Continue to next path
      }
    }
  }

  // Return empty config if no file found (fail-open)
  return defaultConfig;
}

/**
 * Check if a file path matches any of the protected patterns
 *
 * @param {string} filePath - File path to check
 * @param {string[]} patterns - Array of patterns to match against
 * @returns {string|null} Matched pattern or null
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
 * Output blocked message to stderr
 *
 * @param {string} reason - Main reason for blocking
 * @param {string} [detail] - Additional detail
 * @param {string} [context] - Context info (file path or command)
 */
function outputBlocked(reason, detail, context) {
  console.error(`${c.coral}[BLOCKED]${c.reset} ${reason}`);
  if (detail) {
    console.error(`${c.dim}${detail}${c.reset}`);
  }
  if (context) {
    console.error(`${c.dim}${context}${c.reset}`);
  }
  // Help message for AI and user
  console.error('');
  console.error(
    `${c.dim}This is intentional - AgileFlow Damage Control blocked a potentially dangerous operation.${c.reset}`
  );
  console.error(
    `${c.dim}DO NOT retry this command. Ask the user if they want to proceed manually.${c.reset}`
  );
  console.error(`${c.dim}To disable: run /configure → Infrastructure → Damage Control${c.reset}`);
}

/**
 * Run damage control hook with stdin parsing
 * Handles common error cases and timeout
 *
 * @param {object} options - Hook options
 * @param {function} options.getInputValue - Extract value from parsed input (input) => value
 * @param {function} options.loadConfig - Load configuration () => config
 * @param {function} options.validate - Validate input (value, config) => { action, reason, detail? }
 * @param {function} options.onBlock - Handle blocked result (result, value) => void
 * @param {function} [options.onAsk] - Handle ask result (result, value) => void (optional)
 */
function runDamageControlHook(options) {
  const { getInputValue, loadConfig, validate, onBlock, onAsk } = options;

  let inputData = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    inputData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      // Parse tool input from Claude Code
      const input = JSON.parse(inputData);
      const value = getInputValue(input);

      if (!value) {
        // No value to validate - allow
        process.exit(0);
      }

      // Load patterns and validate
      const config = loadConfig();
      const result = validate(value, config);

      switch (result.action) {
        case 'block':
          onBlock(result, value);
          process.exit(2);
          break;

        case 'ask':
          if (onAsk) {
            onAsk(result, value);
          } else {
            // Default ask behavior - output JSON
            console.log(
              JSON.stringify({
                result: 'ask',
                message: result.reason,
              })
            );
          }
          process.exit(0);
          break;

        case 'allow':
        default:
          process.exit(0);
      }
    } catch (e) {
      // Parse error or other issue - fail open
      process.exit(0);
    }
  });

  // Handle no stdin (direct invocation)
  process.stdin.on('error', () => {
    process.exit(0);
  });

  // Set timeout to prevent hanging
  setTimeout(() => {
    process.exit(0);
  }, STDIN_TIMEOUT_MS);
}

/**
 * Parse simplified YAML for damage control patterns
 * Handles both pattern-based sections (with pattern/reason/flags objects)
 * and list-based sections (with simple string arrays)
 *
 * @param {string} content - YAML file content
 * @param {object} sectionConfig - Map of section names to their type ('patterns' or 'list')
 * @returns {object} Parsed configuration
 *
 * @example
 * // For bash patterns (pattern objects):
 * parseSimpleYAML(content, {
 *   bashToolPatterns: 'patterns',
 *   askPatterns: 'patterns',
 *   agileflowProtections: 'patterns',
 * })
 *
 * @example
 * // For path lists (string arrays):
 * parseSimpleYAML(content, {
 *   zeroAccessPaths: 'list',
 *   readOnlyPaths: 'list',
 *   noDeletePaths: 'list',
 * })
 */
function parseSimpleYAML(content, sectionConfig) {
  // Initialize result with empty arrays for each section
  const config = {};
  for (const section of Object.keys(sectionConfig)) {
    config[section] = [];
  }

  let currentSection = null;
  let currentPattern = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check if this line is a section header we care about
    const sectionMatch = trimmed.match(/^(\w+):$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1];
      if (sectionConfig[sectionName]) {
        currentSection = sectionName;
        currentPattern = null;
      } else {
        // Section we don't care about
        currentSection = null;
        currentPattern = null;
      }
      continue;
    }

    // Skip if we're not in a tracked section
    if (!currentSection) continue;

    const sectionType = sectionConfig[currentSection];

    if (sectionType === 'patterns') {
      // Pattern-based section (objects with pattern/reason/flags)
      if (trimmed.startsWith('- pattern:')) {
        const patternValue = trimmed
          .replace('- pattern:', '')
          .trim()
          .replace(/^["']|["']$/g, '');
        currentPattern = { pattern: patternValue };
        config[currentSection].push(currentPattern);
      } else if (trimmed.startsWith('reason:') && currentPattern) {
        currentPattern.reason = trimmed
          .replace('reason:', '')
          .trim()
          .replace(/^["']|["']$/g, '');
      } else if (trimmed.startsWith('flags:') && currentPattern) {
        currentPattern.flags = trimmed
          .replace('flags:', '')
          .trim()
          .replace(/^["']|["']$/g, '');
      }
    } else if (sectionType === 'list') {
      // List-based section (simple string arrays)
      if (trimmed.startsWith('- ')) {
        const value = trimmed.slice(2).replace(/^["']|["']$/g, '');
        config[currentSection].push(value);
      }
    }
  }

  return config;
}

/**
 * Pre-configured parser for bash tool patterns
 */
function parseBashPatterns(content) {
  return parseSimpleYAML(content, {
    bashToolPatterns: 'patterns',
    askPatterns: 'patterns',
    agileflowProtections: 'patterns',
  });
}

/**
 * Pre-configured parser for path patterns (edit/write)
 */
function parsePathPatterns(content) {
  return parseSimpleYAML(content, {
    zeroAccessPaths: 'list',
    readOnlyPaths: 'list',
    noDeletePaths: 'list',
  });
}

/**
 * Validate file path against path patterns
 * Used by both edit and write hooks
 *
 * @param {string} filePath - File path to validate
 * @param {object} config - Parsed path patterns config
 * @param {string} operation - Operation type ('edit' or 'write') for error messages
 * @returns {object} Validation result { action, reason?, detail? }
 */
function validatePathAgainstPatterns(filePath, config, operation = 'access') {
  // Check zero access paths - completely blocked
  const zeroMatch = pathMatches(filePath, config.zeroAccessPaths || []);
  if (zeroMatch) {
    return {
      action: 'block',
      reason: `Zero-access path: ${zeroMatch}`,
      detail: 'This file is protected and cannot be accessed',
    };
  }

  // Check read-only paths - cannot edit/write
  const readOnlyMatch = pathMatches(filePath, config.readOnlyPaths || []);
  if (readOnlyMatch) {
    return {
      action: 'block',
      reason: `Read-only path: ${readOnlyMatch}`,
      detail: `This file is read-only and cannot be ${operation === 'edit' ? 'edited' : 'written to'}`,
    };
  }

  // Allow by default
  return { action: 'allow' };
}

module.exports = {
  c,
  findProjectRoot,
  expandPath,
  loadPatterns,
  pathMatches,
  outputBlocked,
  runDamageControlHook,
  parseSimpleYAML,
  parseBashPatterns,
  parsePathPatterns,
  validatePathAgainstPatterns,
  CONFIG_PATHS,
  STDIN_TIMEOUT_MS,
};
