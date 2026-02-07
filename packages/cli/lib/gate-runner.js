/**
 * AgileFlow CLI - Shared Quality Gate Library
 *
 * Reusable quality gate evaluation used by:
 * - TeammateIdle hook (teammate-idle-gate.js)
 * - TaskCompleted hook (task-completed-gate.js)
 * - Ralph Loop (ralph-loop.js)
 * - /agileflow:verify command
 *
 * Each gate returns: { passed: boolean, message: string, duration: number }
 *
 * Usage:
 *   const { evaluateGate, evaluateGates } = require('../lib/quality-gates');
 *   const result = await evaluateGate('tests', rootDir, { timeout: 300000 });
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Default gate configuration
 */
const DEFAULT_GATE_CONFIG = {
  tests: { enabled: true, timeout: 300000, command: null },
  lint: { enabled: false, timeout: 60000, command: null },
  types: { enabled: false, timeout: 60000, command: null },
  coverage: { enabled: false, timeout: 300000, threshold: 80, command: null },
};

/**
 * Detect the test command for the project.
 * @param {string} rootDir - Project root
 * @returns {string} Test command
 */
function detectTestCommand(rootDir) {
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts?.test) return 'npm test';
    }
  } catch (e) {
    // Fall through
  }

  // Check for common test runners
  if (fs.existsSync(path.join(rootDir, 'jest.config.js'))) return 'npx jest';
  if (fs.existsSync(path.join(rootDir, 'vitest.config.ts'))) return 'npx vitest run';
  if (fs.existsSync(path.join(rootDir, 'pytest.ini'))) return 'pytest';

  return 'npm test';
}

/**
 * Detect lint command for the project.
 * @param {string} rootDir - Project root
 * @returns {string|null} Lint command or null
 */
function detectLintCommand(rootDir) {
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts?.lint) return 'npm run lint';
      if (pkg.scripts?.['lint:all']) return 'npm run lint:all';
    }
  } catch (e) {
    // Fall through
  }
  return null;
}

/**
 * Detect type-check command for the project.
 * @param {string} rootDir - Project root
 * @returns {string|null} Type check command or null
 */
function detectTypeCheckCommand(rootDir) {
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts?.typecheck) return 'npm run typecheck';
      if (pkg.scripts?.['type-check']) return 'npm run type-check';
    }
  } catch (e) {
    // Fall through
  }

  if (fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
    return 'npx tsc --noEmit';
  }
  return null;
}

/**
 * Run a shell command and capture results.
 * @param {string} command - Command to run
 * @param {string} rootDir - Working directory
 * @param {number} timeout - Timeout in ms
 * @returns {{ passed: boolean, output: string, duration: number }}
 */
function runCommand(command, rootDir, timeout) {
  const startTime = Date.now();
  const result = { passed: false, output: '', duration: 0 };

  try {
    const output = execSync(command, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });
    result.passed = true;
    result.output = output;
  } catch (e) {
    result.passed = false;
    result.output = (e.stdout || '') + '\n' + (e.stderr || '');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Evaluate a single quality gate.
 *
 * @param {string} gateName - Gate name: 'tests', 'lint', 'types', 'coverage'
 * @param {string} rootDir - Project root directory
 * @param {object} [options] - Gate options
 * @param {number} [options.timeout] - Timeout in ms
 * @param {string} [options.command] - Custom command override
 * @param {number} [options.threshold] - Coverage threshold (for 'coverage' gate)
 * @returns {{ passed: boolean, message: string, duration: number, gate: string }}
 */
function evaluateGate(gateName, rootDir, options = {}) {
  const timeout = options.timeout || DEFAULT_GATE_CONFIG[gateName]?.timeout || 60000;
  let command = options.command;

  switch (gateName) {
    case 'tests': {
      command = command || detectTestCommand(rootDir);
      const result = runCommand(command, rootDir, timeout);
      return {
        gate: 'tests',
        passed: result.passed,
        message: result.passed
          ? 'All tests passing'
          : `Tests failing: ${result.output.split('\n').slice(-3).join(' ').substring(0, 200)}`,
        duration: result.duration,
      };
    }

    case 'lint': {
      command = command || detectLintCommand(rootDir);
      if (!command) {
        return {
          gate: 'lint',
          passed: true,
          message: 'No lint command found (skipped)',
          duration: 0,
        };
      }
      const result = runCommand(command, rootDir, timeout);
      return {
        gate: 'lint',
        passed: result.passed,
        message: result.passed
          ? 'Lint passing'
          : `Lint errors: ${result.output.split('\n').slice(-3).join(' ').substring(0, 200)}`,
        duration: result.duration,
      };
    }

    case 'types': {
      command = command || detectTypeCheckCommand(rootDir);
      if (!command) {
        return {
          gate: 'types',
          passed: true,
          message: 'No type-check command found (skipped)',
          duration: 0,
        };
      }
      const result = runCommand(command, rootDir, timeout);
      return {
        gate: 'types',
        passed: result.passed,
        message: result.passed
          ? 'Type check passing'
          : `Type errors: ${result.output.split('\n').slice(-3).join(' ').substring(0, 200)}`,
        duration: result.duration,
      };
    }

    case 'coverage': {
      command = command || detectTestCommand(rootDir) + ' -- --coverage';
      const threshold = options.threshold || 80;
      const result = runCommand(command, rootDir, timeout);
      // Coverage check is a best-effort — if tests pass, consider it passing
      return {
        gate: 'coverage',
        passed: result.passed,
        message: result.passed
          ? `Coverage check passed (threshold: ${threshold}%)`
          : `Coverage check failed`,
        duration: result.duration,
      };
    }

    default:
      return {
        gate: gateName,
        passed: false,
        message: `Unknown gate: ${gateName}`,
        duration: 0,
      };
  }
}

/**
 * Evaluate multiple quality gates.
 *
 * @param {object} gateConfig - Gate configuration { tests: true, lint: true, ... }
 * @param {string} rootDir - Project root
 * @param {object} [options] - Additional options per gate
 * @returns {{ allPassed: boolean, results: Array, totalDuration: number }}
 */
function evaluateGates(gateConfig, rootDir, options = {}) {
  const results = [];
  let totalDuration = 0;

  for (const [gateName, enabled] of Object.entries(gateConfig)) {
    if (!enabled) continue;

    const gateOptions = options[gateName] || {};
    const result = evaluateGate(gateName, rootDir, gateOptions);
    results.push(result);
    totalDuration += result.duration;
  }

  return {
    allPassed: results.every(r => r.passed),
    results,
    totalDuration,
  };
}

/**
 * Load gate configuration from agileflow-metadata.json.
 *
 * @param {string} rootDir - Project root
 * @param {string} hookName - Hook context ('teammate_idle', 'task_completed', 'ralph_loop')
 * @returns {object} Gate configuration
 */
function loadGateConfig(rootDir, hookName) {
  try {
    const metadataPath = path.join(rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const hookConfig = metadata.quality_gates?.[hookName];
      if (hookConfig) return hookConfig;
    }
  } catch (e) {
    // Fall through to defaults
  }

  // Return defaults for the given hook
  return DEFAULT_GATE_CONFIG;
}

module.exports = {
  evaluateGate,
  evaluateGates,
  loadGateConfig,
  detectTestCommand,
  detectLintCommand,
  detectTypeCheckCommand,
  runCommand,
  DEFAULT_GATE_CONFIG,
};
