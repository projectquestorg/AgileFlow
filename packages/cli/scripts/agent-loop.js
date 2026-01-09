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
const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../lib/errors');

const ROOT = getProjectRoot();
const LOOPS_DIR = path.join(ROOT, '.agileflow', 'sessions', 'agent-loops');
const BUS_PATH = path.join(ROOT, 'docs', '09-agents', 'bus', 'log.jsonl');

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_ITERATIONS_HARD_LIMIT = 5;
const MAX_AGENTS_HARD_LIMIT = 3;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per loop
const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes without progress

const GATES = {
  tests: { name: 'Tests', metric: 'pass/fail' },
  coverage: { name: 'Coverage', metric: 'percentage' },
  visual: { name: 'Visual', metric: 'verified/unverified' },
  lint: { name: 'Lint', metric: 'pass/fail' },
  types: { name: 'TypeScript', metric: 'pass/fail' },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function ensureLoopsDir() {
  if (!fs.existsSync(LOOPS_DIR)) {
    fs.mkdirSync(LOOPS_DIR, { recursive: true });
  }
}

function getLoopPath(loopId) {
  return path.join(LOOPS_DIR, `${loopId}.json`);
}

function generateLoopId() {
  return crypto.randomUUID().split('-')[0]; // Short UUID (8 chars)
}

function loadLoop(loopId) {
  const loopPath = getLoopPath(loopId);
  const result = safeReadJSON(loopPath, { defaultValue: null });
  return result.ok ? result.data : null;
}

function saveLoop(loopId, state) {
  ensureLoopsDir();
  const loopPath = getLoopPath(loopId);
  state.updated_at = new Date().toISOString();
  safeWriteJSON(loopPath, state, { createDir: true });
}

function emitEvent(event) {
  const busDir = path.dirname(BUS_PATH);
  if (!fs.existsSync(busDir)) {
    fs.mkdirSync(busDir, { recursive: true });
  }

  const line =
    JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    }) + '\n';

  fs.appendFileSync(BUS_PATH, line);
}

// ============================================================================
// QUALITY GATE CHECKS
// ============================================================================

function getTestCommand() {
  const metadataPath = path.join(ROOT, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.test_command) {
    return result.data.ralph_loop.test_command;
  }
  return 'npm test';
}

function getCoverageCommand() {
  const metadataPath = path.join(ROOT, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.coverage_command) {
    return result.data.ralph_loop.coverage_command;
  }
  return 'npm run test:coverage || npm test -- --coverage';
}

function getCoverageReportPath() {
  const metadataPath = path.join(ROOT, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.coverage_report_path) {
    return result.data.ralph_loop.coverage_report_path;
  }
  return 'coverage/coverage-summary.json';
}

function runCommand(cmd) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    return { passed: true, exitCode: 0 };
  } catch (error) {
    return { passed: false, exitCode: error.status || 1 };
  }
}

function checkTestsGate() {
  const cmd = getTestCommand();
  console.log(`${c.dim}Running: ${cmd}${c.reset}`);
  const result = runCommand(cmd);
  return {
    passed: result.passed,
    value: result.passed ? 100 : 0,
    message: result.passed ? 'All tests passing' : 'Tests failing',
  };
}

function checkCoverageGate(threshold) {
  // Run coverage command
  const cmd = getCoverageCommand();
  console.log(`${c.dim}Running: ${cmd}${c.reset}`);
  runCommand(cmd);

  // Parse coverage report
  const reportPath = path.join(ROOT, getCoverageReportPath());
  const report = safeReadJSON(reportPath, { defaultValue: null });

  if (!report.ok || !report.data) {
    return {
      passed: false,
      value: 0,
      message: `Coverage report not found at ${getCoverageReportPath()}`,
    };
  }

  const total = report.data.total;
  const coverage = total?.lines?.pct || total?.statements?.pct || 0;
  const passed = coverage >= threshold;

  return {
    passed,
    value: coverage,
    message: passed
      ? `Coverage ${coverage.toFixed(1)}% >= ${threshold}%`
      : `Coverage ${coverage.toFixed(1)}% < ${threshold}% (need ${(threshold - coverage).toFixed(1)}% more)`,
  };
}

function checkVisualGate() {
  const screenshotsDir = path.join(ROOT, 'screenshots');

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

function checkLintGate() {
  console.log(`${c.dim}Running: npm run lint${c.reset}`);
  const result = runCommand('npm run lint');
  return {
    passed: result.passed,
    value: result.passed ? 100 : 0,
    message: result.passed ? 'Lint passing' : 'Lint errors found',
  };
}

function checkTypesGate() {
  console.log(`${c.dim}Running: npx tsc --noEmit${c.reset}`);
  const result = runCommand('npx tsc --noEmit');
  return {
    passed: result.passed,
    value: result.passed ? 100 : 0,
    message: result.passed ? 'No type errors' : 'Type errors found',
  };
}

function checkGate(gate, threshold) {
  switch (gate) {
    case 'tests':
      return checkTestsGate();
    case 'coverage':
      return checkCoverageGate(threshold);
    case 'visual':
      return checkVisualGate();
    case 'lint':
      return checkLintGate();
    case 'types':
      return checkTypesGate();
    default:
      return { passed: false, value: 0, message: `Unknown gate: ${gate}` };
  }
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
  } = options;

  // Validate gate
  if (!GATES[gate]) {
    console.error(`${c.red}Invalid gate: ${gate}${c.reset}`);
    console.error(`Available gates: ${Object.keys(GATES).join(', ')}`);
    return null;
  }

  // Enforce hard limits
  const maxIter = Math.min(maxIterations, MAX_ITERATIONS_HARD_LIMIT);

  // Check if we're under the agent limit
  ensureLoopsDir();
  const existingLoops = fs
    .readdirSync(LOOPS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const loop = safeReadJSON(path.join(LOOPS_DIR, f), { defaultValue: null });
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
    agent_type: agentType,
    parent_orchestration: parentId,
    quality_gate: gate,
    threshold,
    iteration: 0,
    max_iterations: maxIter,
    current_value: 0,
    status: 'running',
    regression_count: 0,
    started_at: new Date().toISOString(),
    last_progress_at: new Date().toISOString(),
    events: [],
  };

  saveLoop(loopId, state);

  emitEvent({
    type: 'agent_loop',
    event: 'init',
    loop_id: loopId,
    agent: agentType,
    gate,
    threshold,
    max_iterations: maxIter,
  });

  console.log(`${c.green}${c.bold}Agent Loop Initialized${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Loop ID: ${c.cyan}${loopId}${c.reset}`);
  console.log(`  Gate: ${c.magenta}${GATES[gate].name}${c.reset}`);
  console.log(`  Threshold: ${threshold > 0 ? threshold + '%' : 'pass/fail'}`);
  console.log(`  Max Iterations: ${maxIter}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);

  return loopId;
}

function checkLoop(loopId) {
  const state = loadLoop(loopId);

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
    saveLoop(loopId, state);

    emitEvent({
      type: 'agent_loop',
      event: 'abort',
      loop_id: loopId,
      agent: state.agent_type,
      reason: 'timeout',
      iteration: state.iteration,
    });

    console.log(`${c.red}Loop aborted: timeout (${Math.round(elapsed / 1000)}s)${c.reset}`);
    return state;
  }

  // Increment iteration
  state.iteration++;

  // Check max iterations
  if (state.iteration > state.max_iterations) {
    state.status = 'failed';
    state.stopped_reason = 'max_iterations';
    saveLoop(loopId, state);

    emitEvent({
      type: 'agent_loop',
      event: 'failed',
      loop_id: loopId,
      agent: state.agent_type,
      reason: 'max_iterations',
      final_value: state.current_value,
    });

    console.log(`${c.red}Loop failed: max iterations (${state.max_iterations}) reached${c.reset}`);
    return state;
  }

  console.log(
    `\n${c.cyan}${c.bold}Agent Loop - Iteration ${state.iteration}/${state.max_iterations}${c.reset}`
  );
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);

  // Run gate check
  const result = checkGate(state.quality_gate, state.threshold);
  const previousValue = state.current_value;
  state.current_value = result.value;

  // Record event
  state.events.push({
    iter: state.iteration,
    value: result.value,
    passed: result.passed,
    at: new Date().toISOString(),
  });

  // Emit progress
  emitEvent({
    type: 'agent_loop',
    event: 'iteration',
    loop_id: loopId,
    agent: state.agent_type,
    gate: state.quality_gate,
    iter: state.iteration,
    value: result.value,
    threshold: state.threshold,
    passed: result.passed,
  });

  // Check for regression
  if (state.iteration > 1 && result.value < previousValue) {
    state.regression_count++;
    console.log(
      `${c.yellow}Warning: Regression detected (${previousValue} → ${result.value})${c.reset}`
    );

    if (state.regression_count >= 2) {
      state.status = 'failed';
      state.stopped_reason = 'regression_detected';
      saveLoop(loopId, state);

      emitEvent({
        type: 'agent_loop',
        event: 'failed',
        loop_id: loopId,
        agent: state.agent_type,
        reason: 'regression_detected',
        final_value: result.value,
      });

      console.log(`${c.red}Loop failed: regression detected 2+ times${c.reset}`);
      return state;
    }
  } else if (result.value > previousValue) {
    state.last_progress_at = new Date().toISOString();
    state.regression_count = 0; // Reset on progress
  }

  // Check for stall
  const timeSinceProgress = Date.now() - new Date(state.last_progress_at).getTime();
  if (timeSinceProgress > STALL_THRESHOLD_MS) {
    state.status = 'failed';
    state.stopped_reason = 'stalled';
    saveLoop(loopId, state);

    emitEvent({
      type: 'agent_loop',
      event: 'failed',
      loop_id: loopId,
      agent: state.agent_type,
      reason: 'stalled',
      final_value: result.value,
    });

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
      saveLoop(loopId, state);

      emitEvent({
        type: 'agent_loop',
        event: 'passed',
        loop_id: loopId,
        agent: state.agent_type,
        gate: state.quality_gate,
        final_value: result.value,
        iterations: state.iteration,
      });

      console.log(`\n${c.green}${c.bold}Loop PASSED${c.reset} after ${state.iteration} iterations`);
      console.log(`Final value: ${result.value}${state.threshold > 0 ? '%' : ''}`);
    } else {
      // Need confirmation iteration
      console.log(`${c.dim}Gate passed - need 1 more iteration to confirm${c.reset}`);
      saveLoop(loopId, state);
    }
  } else {
    saveLoop(loopId, state);
    console.log(`${c.dim}Continue iterating...${c.reset}`);
  }

  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}\n`);

  return state;
}

function getStatus(loopId) {
  const state = loadLoop(loopId);

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

function abortLoop(loopId, reason = 'manual') {
  const state = loadLoop(loopId);

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
  saveLoop(loopId, state);

  emitEvent({
    type: 'agent_loop',
    event: 'abort',
    loop_id: loopId,
    agent: state.agent_type,
    reason,
    final_value: state.current_value,
  });

  console.log(`${c.yellow}Loop aborted: ${reason}${c.reset}`);
  return state;
}

function listLoops() {
  ensureLoopsDir();

  const files = fs.readdirSync(LOOPS_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(`${c.dim}No agent loops found${c.reset}`);
    return [];
  }

  const loops = files
    .map(f => {
      const result = safeReadJSON(path.join(LOOPS_DIR, f), { defaultValue: null });
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

function cleanupLoops() {
  ensureLoopsDir();

  const files = fs.readdirSync(LOOPS_DIR).filter(f => f.endsWith('.json'));
  let cleaned = 0;

  files.forEach(f => {
    const result = safeReadJSON(path.join(LOOPS_DIR, f), { defaultValue: null });
    if (result.ok && result.data && result.data.status !== 'running') {
      fs.unlinkSync(path.join(LOOPS_DIR, f));
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
  GATES,
  MAX_ITERATIONS_HARD_LIMIT,
  MAX_AGENTS_HARD_LIMIT,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
