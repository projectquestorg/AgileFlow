#!/usr/bin/env node

/**
 * teammate-idle-gate.js - TeammateIdle Hook for Quality Gate Enforcement
 *
 * Runs when a teammate finishes work and is about to go idle.
 * Evaluates configured quality gates (tests, lint, types).
 *
 * Exit codes:
 *   0 - Allow teammate to go idle (all gates pass)
 *   1 - Error (fail-open, teammate goes idle)
 *   2 - Block teammate from going idle (gate failure)
 *
 * Input: JSON on stdin from Claude Code with teammate info
 * Output: Reason on stderr when blocking (exit 2)
 *
 * Configuration: agileflow-metadata.json → quality_gates.teammate_idle
 *
 * Usage in .claude/settings.json:
 *   "hooks": {
 *     "TeammateIdle": [{ "hooks": [{ "type": "command", "command": "node scripts/teammate-idle-gate.js" }] }]
 *   }
 */

const fs = require('fs');
const path = require('path');

// Lazy-load modules for performance
let _gateRunner;
function getGateRunner() {
  if (!_gateRunner) {
    try {
      _gateRunner = require('../lib/gate-runner');
    } catch (e) {
      // Fail open if module not available
      return null;
    }
  }
  return _gateRunner;
}

let _hookMetrics;
function getHookMetrics() {
  if (!_hookMetrics) {
    try {
      _hookMetrics = require('./lib/hook-metrics');
    } catch (e) {
      return null;
    }
  }
  return _hookMetrics;
}

let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../lib/paths');
    } catch (e) {
      return null;
    }
  }
  return _paths;
}

/**
 * Read stdin for hook input (non-blocking with timeout)
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const timeout = setTimeout(() => resolve(data), 1000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    process.stdin.resume();
  });
}

/**
 * Load quality gate configuration from metadata or team template
 */
function loadGateConfig(rootDir) {
  // 1. Check active team template for gate config
  try {
    const paths = getPaths();
    if (paths) {
      const sessionStatePath = paths.getSessionStatePath(rootDir);
      if (fs.existsSync(sessionStatePath)) {
        const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
        if (state.active_team?.quality_gates?.teammate_idle) {
          return state.active_team.quality_gates.teammate_idle;
        }
      }
    }
  } catch (e) {
    // Fall through
  }

  // 2. Check agileflow-metadata.json
  try {
    const metadataPath = path.join(rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata.quality_gates?.teammate_idle) {
        return metadata.quality_gates.teammate_idle;
      }
    }
  } catch (e) {
    // Fall through
  }

  // 3. Default: only test gate enabled
  return { tests: true, lint: false, types: false };
}

/**
 * Output blocked message to stderr and exit with code 2
 */
function outputBlocked(reason, details) {
  console.error(`[BLOCKED] ${reason}`);
  if (details) {
    console.error(details);
  }
  process.exit(2);
}

async function main() {
  const rootDir = process.cwd();
  const hookMetrics = getHookMetrics();
  const timer = hookMetrics ? hookMetrics.startHookTimer('TeammateIdle', 'quality_gate') : null;

  try {
    // Read stdin for teammate context
    const stdin = await readStdin();
    let teammateInfo = {};
    try {
      if (stdin.trim()) {
        teammateInfo = JSON.parse(stdin);
      }
    } catch (e) {
      // Not JSON input - that's ok
    }

    // Load gate configuration
    const gateConfig = loadGateConfig(rootDir);

    // Check if any gates are enabled
    const enabledGates = Object.entries(gateConfig).filter(([_, enabled]) => enabled);
    if (enabledGates.length === 0) {
      // No gates configured - allow idle
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'success', 'no gates configured', { rootDir });
      }
      process.exit(0);
    }

    // Evaluate gates
    const gateRunner = getGateRunner();
    if (!gateRunner) {
      // Gate runner not available - fail open
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'error', 'gate-runner not available', { rootDir });
      }
      process.exit(0);
    }

    const results = gateRunner.evaluateGates(gateConfig, rootDir);

    // Record gate run in session state metrics
    if (timer && hookMetrics && results) {
      try {
        const paths = getPaths();
        if (paths) {
          const sessionStatePath = paths.getSessionStatePath(rootDir);
          if (fs.existsSync(sessionStatePath)) {
            const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
            if (!state.hook_metrics) state.hook_metrics = { last_updated: new Date().toISOString(), session_total_ms: 0, hooks: {} };
            if (!state.hook_metrics.hooks) state.hook_metrics.hooks = {};
            if (!state.hook_metrics.hooks.TeammateIdle) state.hook_metrics.hooks.TeammateIdle = {};
            state.hook_metrics.hooks.TeammateIdle.quality_gate = {
              duration_ms: timer.end ? Math.round((timer.end - timer.start)) : 0,
              status: results.allPassed ? 'success' : 'blocked',
              at: new Date().toISOString(),
              gates_evaluated: results.results ? results.results.length : 0,
              gates_passed: results.results ? results.results.filter(r => r.passed).length : 0,
            };
            state.hook_metrics.last_updated = new Date().toISOString();
            fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
          }
        }
      } catch (e) {
        // Non-critical - gate still completes
      }
    }

    if (results.allPassed) {
      // All gates pass - allow idle
      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'success', null, { rootDir });
      }
      process.exit(0);
    } else {
      // Some gates failed - block
      const failures = results.results.filter(r => !r.passed);
      const reason = failures.map(f => `${f.gate}: ${f.message}`).join('; ');

      if (timer && hookMetrics) {
        hookMetrics.recordHookMetrics(timer, 'blocked', reason, { rootDir });
      }

      outputBlocked(
        `Quality gate(s) failing: ${failures.map(f => f.gate).join(', ')}`,
        failures.map(f => `  ${f.gate}: ${f.message}`).join('\n')
      );
    }
  } catch (e) {
    // Fail open on unexpected errors
    if (timer && hookMetrics) {
      hookMetrics.recordHookMetrics(timer, 'error', e.message, { rootDir });
    }
    process.exit(0);
  }
}

main();
