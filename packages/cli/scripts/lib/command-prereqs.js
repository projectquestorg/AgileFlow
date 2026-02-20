#!/usr/bin/env node
/**
 * command-prereqs.js
 *
 * Declarative prerequisite checker for AgileFlow commands.
 * Validates that environment signals are met before command execution
 * and provides actionable warnings with fix instructions.
 *
 * Uses:
 *   - resolveSignalPath() from feature-catalog.js for signal checking
 *   - mtime-based caching pattern from damage-control-utils.js
 *   - safeLoad() from yaml-utils.js for YAML parsing
 *
 * All functions fail-open: errors return empty/safe defaults.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import resolveSignalPath from feature-catalog
const { resolveSignalPath } = require('./feature-catalog');

// Lazy-load yaml-utils (may not be available in all environments)
let safeLoad;
try {
  safeLoad = require('../../lib/yaml-utils').safeLoad;
} catch {
  // Fallback: no YAML parsing available
  safeLoad = null;
}

// Inline colors (standalone - no dependency on colors.js for hook compat)
const c = {
  coral: '\x1b[38;5;203m',
  amber: '\x1b[38;5;215m',
  mintGreen: '\x1b[38;5;158m',
  skyBlue: '\x1b[38;5;117m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

// Severity display config
const SEVERITY = {
  critical: { icon: '\u2718', color: c.coral, label: 'CRITICAL' },
  high: { icon: '!', color: c.amber, label: 'HIGH' },
  medium: { icon: '\u25CB', color: c.dim, label: 'MEDIUM' },
};

// =============================================================================
// Config Cache (mtime-based invalidation, same pattern as damage-control-utils)
// =============================================================================

const _prereqCache = {
  /** @type {string|null} */ filePath: null,
  /** @type {number} */ mtime: 0,
  /** @type {object|null} */ config: null,
};

/**
 * Clear the prereq config cache (for testing or forced reload).
 */
function clearPrereqCache() {
  _prereqCache.filePath = null;
  _prereqCache.mtime = 0;
  _prereqCache.config = null;
}

// Config search paths (installed location, then source template)
const CONFIG_PATHS = [
  '.agileflow/templates/command-prerequisites.yaml',
  '.agileflow/templates/command-prerequisites.yml',
  '.agileflow/config/command-prerequisites.yaml',
];

/**
 * Load prerequisite configuration from YAML with mtime-based caching.
 * Returns safe defaults on any error (fail-open).
 *
 * @param {string} [projectRoot] - Project root directory (defaults to cwd)
 * @returns {{ commands: Object, settings: Object }} Parsed config
 */
function loadPrereqConfig(projectRoot) {
  const root = projectRoot || process.cwd();
  const defaultConfig = { commands: {}, settings: { fail_open: true, max_warnings: 5 } };

  if (!safeLoad) {
    return defaultConfig;
  }

  for (const configPath of CONFIG_PATHS) {
    const fullPath = path.join(root, configPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const stat = fs.statSync(fullPath);
      const mtime = stat.mtimeMs;

      // Return cached if file hasn't changed
      if (
        _prereqCache.filePath === fullPath &&
        _prereqCache.mtime === mtime &&
        _prereqCache.config
      ) {
        return _prereqCache.config;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const parsed = safeLoad(content);

      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const config = {
        commands: parsed.commands || {},
        settings: { ...defaultConfig.settings, ...(parsed.settings || {}) },
      };

      // Store in cache
      _prereqCache.filePath = fullPath;
      _prereqCache.mtime = mtime;
      _prereqCache.config = config;

      return config;
    } catch {
      // Continue to next path
    }
  }

  return defaultConfig;
}

// =============================================================================
// Prerequisite Checking (pure function)
// =============================================================================

/**
 * Check prerequisites for a specific command against current signals.
 * Pure function - no I/O, no side effects.
 *
 * @param {string} commandName - Command to check (e.g. 'deploy', 'babysit')
 * @param {Object} signals - Extracted signals from smart-detect
 * @param {{ commands: Object, settings: Object }} config - Loaded prereq config
 * @returns {{
 *   command: string,
 *   hasPrereqs: boolean,
 *   allMet: boolean,
 *   results: Array<{ signal: string, description: string, fix: string, severity: string, met: boolean }>,
 *   unmet: Array<{ signal: string, description: string, fix: string, severity: string }>,
 *   criticalUnmet: number,
 *   highUnmet: number
 * }}
 */
function checkCommandPrereqs(commandName, signals, config) {
  const result = {
    command: commandName,
    hasPrereqs: false,
    allMet: true,
    results: [],
    unmet: [],
    criticalUnmet: 0,
    highUnmet: 0,
  };

  if (!commandName || !config || !config.commands) {
    return result;
  }

  const commandConfig = config.commands[commandName];
  if (!commandConfig || !Array.isArray(commandConfig.prerequisites)) {
    return result;
  }

  result.hasPrereqs = true;
  const prereqs = commandConfig.prerequisites;

  for (const prereq of prereqs) {
    if (!prereq.signal) continue;

    const value = resolveSignalPath(signals || {}, prereq.signal);
    // Evaluate signal: empty arrays and empty strings are "unmet"
    // (e.g. git.filesChanged=[] means no changes, which is unmet)
    const met = Array.isArray(value) ? value.length > 0 : !!value;

    const entry = {
      signal: prereq.signal,
      description: prereq.description || prereq.signal,
      fix: prereq.fix || '',
      severity: prereq.severity || 'medium',
      met,
    };

    result.results.push(entry);

    if (!met) {
      result.allMet = false;
      result.unmet.push(entry);

      if (entry.severity === 'critical') {
        result.criticalUnmet++;
      } else if (entry.severity === 'high') {
        result.highUnmet++;
      }
    }
  }

  return result;
}

// =============================================================================
// Warning Formatting
// =============================================================================

/**
 * Format unmet prerequisite warnings with ANSI colors.
 * Returns empty string if all prerequisites are met.
 *
 * @param {{ allMet: boolean, command: string, unmet: Array, criticalUnmet: number }} checkResult
 * @param {{ max_warnings?: number }} [settings] - Display settings
 * @returns {string} Formatted warning string (with trailing newline) or empty string
 */
function formatPrereqWarnings(checkResult, settings) {
  if (!checkResult || checkResult.allMet || checkResult.unmet.length === 0) {
    return '';
  }

  const maxWarnings = (settings && settings.max_warnings) || 5;
  const { command, unmet, criticalUnmet } = checkResult;

  const lines = [];
  const headerColor = criticalUnmet > 0 ? c.coral : c.amber;
  const headerIcon = criticalUnmet > 0 ? '\u26A0\uFE0F' : '\u2139\uFE0F';

  lines.push('');
  lines.push(
    `${headerColor}${c.bold}\u2501\u2501\u2501 ${headerIcon} Command Prerequisites: /${command} \u2501\u2501\u2501${c.reset}`
  );

  if (criticalUnmet > 0) {
    lines.push(
      `${c.coral}${criticalUnmet} critical prerequisite(s) not met - command may fail${c.reset}`
    );
  } else {
    lines.push(
      `${c.amber}${unmet.length} prerequisite(s) not met - results may be suboptimal${c.reset}`
    );
  }

  lines.push('');

  const displayed = unmet.slice(0, maxWarnings);
  for (const prereq of displayed) {
    const sev = SEVERITY[prereq.severity] || SEVERITY.medium;
    lines.push(`  ${sev.color}${sev.icon} [${sev.label}]${c.reset} ${prereq.description}`);
    if (prereq.fix) {
      lines.push(`    ${c.dim}\u2192 Fix: ${prereq.fix}${c.reset}`);
    }
  }

  if (unmet.length > maxWarnings) {
    lines.push(`  ${c.dim}... and ${unmet.length - maxWarnings} more${c.reset}`);
  }

  lines.push('');

  return lines.join('\n');
}

module.exports = {
  loadPrereqConfig,
  checkCommandPrereqs,
  formatPrereqWarnings,
  clearPrereqCache,
  // Exported for testing
  CONFIG_PATHS,
  SEVERITY,
};
