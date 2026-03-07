#!/usr/bin/env node
/**
 * agent-loop.js - Isolated loop manager for domain agents
 *
 * Enables agents to run their own quality-gate loops independently,
 * with state isolation to prevent race conditions when multiple
 * agents run in parallel.
 *
 * Usage:
 *   agent-loop.js --init --gate=coverage --threshold=80 --max=5 --loop-id=uuid
 *   agent-loop.js --check --loop-id=uuid
 *   agent-loop.js --status --loop-id=uuid
 *   agent-loop.js --complete --loop-id=uuid
 *   agent-loop.js --abort --loop-id=uuid --reason=timeout
 *
 * State stored in: .agileflow/sessions/agent-loops/{loop-id}.json
 * Events emitted to: docs/09-agents/bus/log.jsonl
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON, safeWriteJSON, debugLog } = require('../lib/errors');
const { buildSpawnArgs } = require('../lib/validate-commands');
const { initializeForProject, injectCorrelation } = require('../lib/correlation');
const qualityGates = require('./lib/quality-gates');

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_ITERATIONS_HARD_LIMIT = 5;
const MAX_AGENTS_HARD_LIMIT = 3;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per loop
const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes without progress
const REPEATED_FAILURE_LIMIT = 3; // Abort after 3 identical failures

const GATES = {
  tests: { name: 'Tests', metric: 'pass/fail' },
  coverage: { name: 'Coverage', metric: 'percentage' },
  visual: { name: 'Visual', metric: 'verified/unverified' },
  lint: { name: 'Lint', metric: 'pass/fail' },
  types: { name: 'TypeScript', metric: 'pass/fail' },
};

// Map agent-loop gate names to quality-gates GATE_TYPES
const GATE_TYPE_MAP = {
  tests: qualityGates.GATE_TYPES.TESTS,
  coverage: qualityGates.GATE_TYPES.COVERAGE,
  lint: qualityGates.GATE_TYPES.LINT,
  types: qualityGates.GATE_TYPES.TYPES,
};

// ============================================================================
// ROOT RESOLUTION (lazy for testability)
// ============================================================================

function _getRoot(rootDir) {
  return rootDir || getProjectRoot();
}

function _loopsDir(rootDir) {
  return path.join(_getRoot(rootDir), '.agileflow', 'sessions', 'agent-loops');
}

function _busPath(rootDir) {
  return path.join(_getRoot(rootDir), 'docs', '09-agents', 'bus', 'log.jsonl');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function ensureLoopsDir(rootDir) {
  const dir = _loopsDir(rootDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLoopPath(loopId, rootDir) {
  return path.join(_loopsDir(rootDir), `${loopId}.json`);
}

function generateLoopId() {
  return crypto.randomUUID().split('-')[0]; // Short UUID (8 chars)
}

function loadLoop(loopId, rootDir) {
  const loopPath = getLoopPath(loopId, rootDir);
  const result = safeReadJSON(loopPath, { defaultValue: null });
  return result.ok ? result.data : null;
}

function saveLoop(loopId, state, rootDir) {
  ensureLoopsDir(rootDir);
  const loopPath = getLoopPath(loopId, rootDir);
  state.updated_at = new Date().toISOString();
  safeWriteJSON(loopPath, state, { createDir: true });
}

function emitEvent(event, rootDir) {
  const busPath = _busPath(rootDir);
  const busDir = path.dirname(busPath);
  if (!fs.existsSync(busDir)) {
    fs.mkdirSync(busDir, { recursive: true });
  }

  // Inject correlation IDs (trace_id, session_id, span_id)
  const correlatedEvent = injectCorrelation({
    ...event,
    timestamp: new Date().toISOString(),
  });

  const line = JSON.stringify(correlatedEvent) + '\n';

  fs.appendFileSync(busPath, line);
}

// ============================================================================
// QUALITY GATE INTEGRATION
// ============================================================================

/**
 * Run a command safely using spawn with validated arguments
 * @param {string} cmd - Command string to run
 * @param {string} [rootDir] - Project root directory
 * @returns {{ passed: boolean, exitCode: number, error?: string, blocked?: boolean }}
 */
function runCommand(cmd, rootDir) {
  const root = _getRoot(rootDir);

  // Validate command against allowlist
  const validation = buildSpawnArgs(cmd, { strict: true, logBlocked: true });

  if (!validation.ok) {
    console.error(
      `${c.red}Command blocked: ${validation.error}${c.reset}` +
        (validation.severity ? ` [${validation.severity}]` : '')
    );
    debugLog('runCommand', {
      blocked: true,
      command: cmd.slice(0, 50),
      error: validation.error,
      severity: validation.severity,
    });
    return { passed: false, exitCode: 1, error: validation.error, blocked: true };
  }

  const { file, args } = validation.data;

  try {
    // Use spawnSync with array arguments (no shell injection possible)
    const result = spawnSync(file, args, {
      cwd: root,
      stdio: 'inherit',
      shell: false, // CRITICAL: Do not use shell to prevent injection
    });

    if (result.error) {
      // spawn itself failed (e.g., command not found)
      console.error(`${c.red}Spawn error: ${result.error.message}${c.reset}`);
      return { passed: false, exitCode: 1, error: result.error.message };
    }

    return {
      passed: result.status === 0,
      exitCode: result.status || 0,
    };
  } catch (error) {
    return { passed: false, exitCode: error.status || 1, error: error.message };
  }
}

/**
 * Get custom command from project metadata for a gate
 * @param {string} gateName - Gate name (tests, coverage)
 * @param {string} rootDir - Project root
 * @returns {string|undefined} Custom command or undefined
 */
function getCommandFromMetadata(gateName, rootDir) {
  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (!result.ok || !result.data?.ralph_loop) return undefined;

  const metaKey = {
    tests: 'test_command',
    coverage: 'coverage_command',
  };

  return result.data.ralph_loop[metaKey[gateName]] || undefined;
}

/**
 * Check visual gate (filesystem-based, not command-based)
 * @param {string} rootDir - Project root
 * @returns {{ passed: boolean, value: number, message: string }}
 */
function checkVisualGate(rootDir) {
  const screenshotsDir = path.join(rootDir, 'screenshots');

  if (!fs.existsSync(screenshotsDir)) {
    return {
      passed: false,
      value: 0,
      message: 'Screenshots directory not found',
    };
  }

  const files = fs
    .readdirSync(screenshotsDir)
    .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

  if (files.length === 0) {
    return {
      passed: false,
      value: 0,
      message: 'No screenshots found',
    };
  }

  const verified = files.filter(f => f.startsWith('verified-'));
  const allVerified = verified.length === files.length;

  return {
    passed: allVerified,
    value: (verified.length / files.length) * 100,
    message: allVerified
      ? `All ${files.length} screenshots verified`
      : `${verified.length}/${files.length} screenshots verified (missing: ${files.filter(f => !f.startsWith('verified-')).join(', ')})`,
  };
}

/**
 * Run a quality gate check using quality-gates.js integration
 * @param {string} gateName - Gate name from GATES
 * @param {number} threshold - Threshold value (for coverage)
 * @param {string} rootDir - Project root directory
 * @returns {{ passed: boolean, value: number, message: string }}
 */
function runGateCheck(gateName, threshold, rootDir) {
  // Visual gate is filesystem-based, not command-based
  if (gateName === 'visual') {
    return checkVisualGate(rootDir);
  }

  const gateType = GATE_TYPE_MAP[gateName];
  if (!gateType) {
    return { passed: false, value: 0, message: `Unknown gate: ${gateName}` };
  }

  // Get custom command from metadata if available
  const command = getCommandFromMetadata(gateName, rootDir);

  const gate = qualityGates.createGate({
    type: gateType,
    name: GATES[gateName].name,
    command: command,
    threshold: threshold || undefined,
  });

  const result = qualityGates.executeGate(gate, { cwd: rootDir });

  // Map quality-gates result to agent-loop format
  const passed = result.status === qualityGates.GATE_STATUS.PASSED;
  const value = result.value !== undefined ? result.value : passed ? 100 : 0;

  return { passed, value, message: result.message };
}

// ============================================================================
// CORE LOOP FUNCTIONS
// ============================================================================

function initLoop(options) {
  const {
    loopId = generateLoopId(),
    gate,
    threshold = 0,
    maxIterations = MAX_ITERATIONS_HARD_LIMIT,
    agentType = 'unknown',
    parentId = null,
    rootDir,
  } = options;

  const root = _getRoot(rootDir);

  // Initialize correlation context (trace_id, session_id)
  const { traceId, sessionId } = initializeForProject(root);

  // Validate gate
  if (!GATES[gate]) {
    console.error(`${c.red}Invalid gate: ${gate}${c.reset}`);
    console.error(`Available gates: ${Object.keys(GATES).join(', ')}`);
    return null;
  }

  // Enforce hard limits
  const maxIter = Math.min(maxIterations, MAX_ITERATIONS_HARD_LIMIT);

  // Check if we're under the agent limit
  ensureLoopsDir(rootDir);
  const loopsDir = _loopsDir(rootDir);
  const existingLoops = fs
    .readdirSync(loopsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const loop = safeReadJSON(path.join(loopsDir, f), { defaultValue: null });
      return loop.ok ? loop.data : null;
    })
    .filter(l => l && l.status === 'running');

  if (existingLoops.length >= MAX_AGENTS_HARD_LIMIT) {
    console.error(
      `${c.red}Max concurrent agent loops (${MAX_AGENTS_HARD_LIMIT}) reached${c.reset}`
    );
    return null;
  }

  const state = {
    loop_id: loopId,
    trace_id: traceId,
    session_id: sessionId,
    agent_type: agentType,
    parent_orchestration: parentId,
    quality_gate: gate,
    threshold,
    iteration: 0,
    max_iterations: maxIter,
    current_value: 0,
    status: 'running',
    regression_count: 0,
    failure_streak: 0,
    last_failure_message: null,
    started_at: new Date().toISOString(),
    last_progress_at: new Date().toISOString(),
    events: [],
  };

  saveLoop(loopId, state, rootDir);

  emitEvent(
    {
      type: 'agent_loop',
      event: 'init',
      loop_id: loopId,
      agent: agentType,
      gate,
      threshold,
      max_iterations: maxIter,
    },
    rootDir
  );

  console.log(`${c.green}${c.bold}Agent Loop Initialized${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Loop ID: ${c.cyan}${loopId}${c.reset}`);
  console.log(`  Trace ID: ${c.dim}${traceId}${c.reset}`);
  console.log(`  Gate: ${c.magenta}${GATES[gate].name}${c.reset}`);
  console.log(`  Threshold: ${threshold > 0 ? threshold + '%' : 'pass/fail'}`);
  console.log(`  Max Iterations: ${maxIter}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);

  return loopId;
}

function checkLoop(loopId, options = {}) {
  const { rootDir } = options;
  const root = _getRoot(rootDir);
  const state = loadLoop(loopId, rootDir);

  if (!state) {
    console.error(`${c.red}Loop not found: ${loopId}${c.reset}`);
    return null;
  }

  if (state.status !== 'running') {
    console.log(`${c.yellow}Loop already ${state.status}${c.reset}`);
    return state;
  }

  // Check timeout
  const elapsed = Date.now() - new Date(state.started_at).getTime();
  if (elapsed > TIMEOUT_MS) {
    state.status = 'aborted';
    state.stopped_reason = 'timeout';
    saveLoop(loopId, state, rootDir);

    emitEvent(
      {
        type: 'agent_loop',
        event: 'abort',
        loop_id: loopId,
        agent: state.agent_type,
        reason: 'timeout',
        iteration: state.iteration,
      },
      rootDir
    );

    console.log(`${c.red}Loop aborted: timeout (${Math.round(elapsed / 1000)}s)${c.reset}`);
    return state;
  }

  // Increment iteration
  state.iteration++;

  // Check max iterations
  if (state.iteration > state.max_iterations) {
    state.status = 'failed';
    state.stopped_reason = 'max_iterations';
    saveLoop(loopId, state, rootDir);

    emitEvent(
      {
        type: 'agent_loop',
        event: 'failed',
        loop_id: loopId,
        agent: state.agent_type,
        reason: 'max_iterations',
        final_value: state.current_value,
      },
      rootDir
    );

    console.log(`${c.red}Loop failed: max iterations (${state.max_iterations}) reached${c.reset}`);
    return state;
  }

  console.log(
    `\n${c.cyan}${c.bold}Agent Loop - Iteration ${state.iteration}/${state.max_iterations}${c.reset}`
  );
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);

  // Run gate check via quality-gates integration
  const result = runGateCheck(state.quality_gate, state.threshold, root);
  const previousValue = state.current_value;
  state.current_value = result.value;

  // Record event
  state.events.push({
    iter: state.iteration,
    value: result.value,
    passed: result.passed,
    message: result.message,
    at: new Date().toISOString(),
  });

  // Emit progress
  emitEvent(
    {
      type: 'agent_loop',
      event: 'iteration',
      loop_id: loopId,
      agent: state.agent_type,
      gate: state.quality_gate,
      iter: state.iteration,
      value: result.value,
      threshold: state.threshold,
      passed: result.passed,
    },
    rootDir
  );

  // Check for repeated failure (same failure message 3+ times)
  if (!result.passed) {
    if (result.message === state.last_failure_message) {
      state.failure_streak++;
    } else {
      state.failure_streak = 1;
      state.last_failure_message = result.message;
    }

    if (state.failure_streak >= REPEATED_FAILURE_LIMIT) {
      state.status = 'failed';
      state.stopped_reason = 'repeated_failure';
      saveLoop(loopId, state, rootDir);

      emitEvent(
        {
          type: 'agent_loop',
          event: 'failed',
          loop_id: loopId,
          agent: state.agent_type,
          reason: 'repeated_failure',
          final_value: result.value,
          failure_message: result.message,
        },
        rootDir
      );

      console.log(
        `${c.red}Loop failed: same failure repeated ${state.failure_streak} times${c.reset}`
      );
      return state;
    }
  } else {
    // Reset failure streak on success
    state.failure_streak = 0;
    state.last_failure_message = null;
  }

  // Check for regression
  if (state.iteration > 1 && result.value < previousValue) {
    state.regression_count++;
    console.log(
      `${c.yellow}Warning: Regression detected (${previousValue} → ${result.value})${c.reset}`
    );

    if (state.regression_count >= 2) {
      state.status = 'failed';
      state.stopped_reason = 'regression_detected';
      saveLoop(loopId, state, rootDir);

      emitEvent(
        {
          type: 'agent_loop',
          event: 'failed',
          loop_id: loopId,
          agent: state.agent_type,
          reason: 'regression_detected',
          final_value: result.value,
        },
        rootDir
      );

      console.log(`${c.red}Loop failed: regression detected 2+ times${c.reset}`);
      return state;
    }
  } else if (result.value > previousValue) {
    state.last_progress_at = new Date().toISOString();
    state.regression_count = 0; // Reset on progress
  } else {
    // Value held steady (no regression, no progress) - reset regression count
    state.regression_count = 0;
  }

  // Check for stall
  const timeSinceProgress = Date.now() - new Date(state.last_progress_at).getTime();
  if (timeSinceProgress > STALL_THRESHOLD_MS) {
    state.status = 'failed';
    state.stopped_reason = 'stalled';
    saveLoop(loopId, state, rootDir);

    emitEvent(
      {
        type: 'agent_loop',
        event: 'failed',
        loop_id: loopId,
        agent: state.agent_type,
        reason: 'stalled',
        final_value: result.value,
      },
      rootDir
    );

    console.log(`${c.red}Loop failed: stalled (no progress for 5+ minutes)${c.reset}`);
    return state;
  }

  // Output result
  const statusIcon = result.passed ? `${c.green}✓${c.reset}` : `${c.yellow}⏳${c.reset}`;
  console.log(`  ${statusIcon} ${result.message}`);

  if (result.passed) {
    // Gate passed - check if we need multi-iteration confirmation
    const passedIterations = state.events.filter(e => e.passed).length;

    if (passedIterations >= 2) {
      // Confirmed pass
      state.status = 'passed';
      state.completed_at = new Date().toISOString();
      saveLoop(loopId, state, rootDir);

      emitEvent(
        {
          type: 'agent_loop',
          event: 'passed',
          loop_id: loopId,
          agent: state.agent_type,
          gate: state.quality_gate,
          final_value: result.value,
          iterations: state.iteration,
        },
        rootDir
      );

      console.log(`\n${c.green}${c.bold}Loop PASSED${c.reset} after ${state.iteration} iterations`);
      console.log(`Final value: ${result.value}${state.threshold > 0 ? '%' : ''}`);
    } else {
      // Need confirmation iteration
      console.log(`${c.dim}Gate passed - need 1 more iteration to confirm${c.reset}`);
      saveLoop(loopId, state, rootDir);
    }
  } else {
    saveLoop(loopId, state, rootDir);
    console.log(`${c.dim}Continue iterating...${c.reset}`);
  }

  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}\n`);

  return state;
}

function getStatus(loopId, options = {}) {
  const { rootDir } = options;
  const state = loadLoop(loopId, rootDir);

  if (!state) {
    console.error(`${c.red}Loop not found: ${loopId}${c.reset}`);
    return null;
  }

  const elapsed = Date.now() - new Date(state.started_at).getTime();
  const elapsedStr = `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`;

  console.log(`\n${c.cyan}${c.bold}Agent Loop Status${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Loop ID: ${state.loop_id}`);
  console.log(`  Agent: ${state.agent_type}`);
  console.log(`  Gate: ${GATES[state.quality_gate]?.name || state.quality_gate}`);
  console.log(
    `  Status: ${state.status === 'passed' ? c.green : state.status === 'running' ? c.yellow : c.red}${state.status}${c.reset}`
  );
  console.log(`  Iteration: ${state.iteration}/${state.max_iterations}`);
  console.log(`  Current Value: ${state.current_value}${state.threshold > 0 ? '%' : ''}`);
  console.log(`  Threshold: ${state.threshold > 0 ? state.threshold + '%' : 'pass/fail'}`);
  console.log(`  Elapsed: ${elapsedStr}`);

  if (state.events.length > 0) {
    console.log(`\n  ${c.dim}History:${c.reset}`);
    state.events.forEach(e => {
      const icon = e.passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      console.log(`    ${icon} Iter ${e.iter}: ${e.value}${state.threshold > 0 ? '%' : ''}`);
    });
  }

  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}\n`);

  return state;
}

function abortLoop(loopId, reason = 'manual', options = {}) {
  const { rootDir } = options;
  const state = loadLoop(loopId, rootDir);

  if (!state) {
    console.error(`${c.red}Loop not found: ${loopId}${c.reset}`);
    return null;
  }

  if (state.status !== 'running') {
    console.log(`${c.yellow}Loop already ${state.status}${c.reset}`);
    return state;
  }

  state.status = 'aborted';
  state.stopped_reason = reason;
  state.completed_at = new Date().toISOString();
  saveLoop(loopId, state, rootDir);

  emitEvent(
    {
      type: 'agent_loop',
      event: 'abort',
      loop_id: loopId,
      agent: state.agent_type,
      reason,
      final_value: state.current_value,
    },
    rootDir
  );

  console.log(`${c.yellow}Loop aborted: ${reason}${c.reset}`);
  return state;
}

function listLoops(options = {}) {
  const { rootDir } = options;
  const loopsDir = _loopsDir(rootDir);
  ensureLoopsDir(rootDir);

  const files = fs.readdirSync(loopsDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(`${c.dim}No agent loops found${c.reset}`);
    return [];
  }

  const loops = files
    .map(f => {
      const result = safeReadJSON(path.join(loopsDir, f), { defaultValue: null });
      return result.ok ? result.data : null;
    })
    .filter(Boolean);

  console.log(`\n${c.cyan}${c.bold}Agent Loops${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);

  loops.forEach(loop => {
    const statusColor =
      loop.status === 'passed' ? c.green : loop.status === 'running' ? c.yellow : c.red;

    console.log(`  ${statusColor}●${c.reset} [${loop.loop_id}] ${loop.agent_type}`);
    console.log(
      `      ${GATES[loop.quality_gate]?.name || loop.quality_gate}: ${loop.current_value}${loop.threshold > 0 ? '%' : ''} / ${loop.threshold > 0 ? loop.threshold + '%' : 'pass'}  |  Iter: ${loop.iteration}/${loop.max_iterations}  |  ${loop.status}`
    );
  });

  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}\n`);

  return loops;
}

function cleanupLoops(options = {}) {
  const { rootDir } = options;
  const loopsDir = _loopsDir(rootDir);
  ensureLoopsDir(rootDir);

  const files = fs.readdirSync(loopsDir).filter(f => f.endsWith('.json'));
  let cleaned = 0;

  files.forEach(f => {
    const filePath = path.join(loopsDir, f);
    const result = safeReadJSON(filePath, { defaultValue: null });
    if (result.ok && result.data && result.data.status !== 'running') {
      fs.unlinkSync(filePath);
      cleaned++;
    }
  });

  console.log(`${c.green}Cleaned ${cleaned} completed loop(s)${c.reset}`);
  return cleaned;
}

// ============================================================================
// CLI
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = name => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };

  const hasFlag = name => args.includes(`--${name}`);

  if (hasFlag('init')) {
    const loopId = initLoop({
      loopId: getArg('loop-id'),
      gate: getArg('gate'),
      threshold: parseFloat(getArg('threshold') || '0'),
      maxIterations: parseInt(getArg('max') || '5', 10),
      agentType: getArg('agent') || 'unknown',
      parentId: getArg('parent'),
    });

    if (loopId) {
      console.log(`\n${c.dim}Use in agent prompt:${c.reset}`);
      console.log(`  node .agileflow/scripts/agent-loop.js --check --loop-id=${loopId}`);
    }
    return;
  }

  if (hasFlag('check')) {
    const loopId = getArg('loop-id');
    if (!loopId) {
      console.error(`${c.red}--loop-id required${c.reset}`);
      process.exit(1);
    }
    const state = checkLoop(loopId);
    process.exit(state?.status === 'passed' ? 0 : state?.status === 'running' ? 2 : 1);
  }

  if (hasFlag('status')) {
    const loopId = getArg('loop-id');
    if (!loopId) {
      console.error(`${c.red}--loop-id required${c.reset}`);
      process.exit(1);
    }
    getStatus(loopId);
    return;
  }

  if (hasFlag('abort')) {
    const loopId = getArg('loop-id');
    if (!loopId) {
      console.error(`${c.red}--loop-id required${c.reset}`);
      process.exit(1);
    }
    abortLoop(loopId, getArg('reason') || 'manual');
    return;
  }

  if (hasFlag('list')) {
    listLoops();
    return;
  }

  if (hasFlag('cleanup')) {
    cleanupLoops();
    return;
  }

  // Help
  console.log(`
${c.brand}${c.bold}Agent Loop Manager${c.reset} - Isolated quality-gate loops for domain agents

${c.cyan}Commands:${c.reset}
  --init                     Initialize a new agent loop
    --gate=<gate>            Quality gate: tests, coverage, visual, lint, types
    --threshold=<n>          Target percentage (for coverage gate)
    --max=<n>                Max iterations (default: 5, hard limit: 5)
    --agent=<type>           Agent type (for logging)
    --loop-id=<id>           Custom loop ID (optional, auto-generated if omitted)
    --parent=<id>            Parent orchestration ID (optional)

  --check --loop-id=<id>     Run gate check and update loop state
  --status --loop-id=<id>    Show loop status
  --abort --loop-id=<id>     Abort the loop
    --reason=<reason>        Abort reason (default: manual)

  --list                     List all agent loops
  --cleanup                  Remove completed/aborted loops

${c.cyan}Exit Codes:${c.reset}
  0 = Loop passed (gate satisfied)
  1 = Loop failed/aborted
  2 = Loop still running (gate not yet satisfied)

${c.cyan}Examples:${c.reset}
  # Initialize coverage loop
  node agent-loop.js --init --gate=coverage --threshold=80 --agent=agileflow-api

  # Check loop progress
  node agent-loop.js --check --loop-id=abc123

  # View status
  node agent-loop.js --status --loop-id=abc123

${c.cyan}State Storage:${c.reset}
  .agileflow/sessions/agent-loops/{loop-id}.json

${c.cyan}Event Bus:${c.reset}
  docs/09-agents/bus/log.jsonl
`);
}

// Export for module use
module.exports = {
  initLoop,
  checkLoop,
  getStatus,
  abortLoop,
  listLoops,
  cleanupLoops,
  loadLoop,
  runCommand,
  runGateCheck,
  GATES,
  GATE_TYPE_MAP,
  MAX_ITERATIONS_HARD_LIMIT,
  MAX_AGENTS_HARD_LIMIT,
  REPEATED_FAILURE_LIMIT,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
