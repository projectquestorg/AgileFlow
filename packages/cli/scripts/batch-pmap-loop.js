#!/usr/bin/env node

/**
 * batch-pmap-loop.js - Autonomous Batch Processing Loop
 *
 * Enables iterative batch processing with quality gates for pmap operations.
 * Processes items one at a time, running quality gates after each iteration.
 *
 * Usage (as Stop hook):
 *   node scripts/batch-pmap-loop.js
 *
 * Manual control:
 *   node scripts/batch-pmap-loop.js --init --pattern="src/components/*.tsx" --action="add-tests"
 *   node scripts/batch-pmap-loop.js --status
 *   node scripts/batch-pmap-loop.js --stop
 *   node scripts/batch-pmap-loop.js --reset
 *
 * V1 Scope: Tests gate only, sequential processing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../lib/errors');
const { parseIntBounded } = require('../lib/validate');

// ===== SESSION STATE HELPERS =====

function getSessionState(rootDir) {
  const statePath = path.join(rootDir, 'docs/09-agents/session-state.json');
  const result = safeReadJSON(statePath, { defaultValue: {} });
  return result.ok ? result.data : {};
}

function saveSessionState(rootDir, state) {
  const statePath = path.join(rootDir, 'docs/09-agents/session-state.json');
  safeWriteJSON(statePath, state, { createDir: true });
}

// ===== GLOB RESOLUTION =====

async function resolveGlob(pattern, rootDir) {
  // Use bash globbing for pattern expansion
  try {
    const result = execSync(
      `bash -c 'shopt -s nullglob; for f in ${pattern}; do echo "$f"; done'`,
      {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    const files = result
      .split('\n')
      .filter(f => f.trim())
      .filter(f => !f.includes('node_modules') && !f.includes('.git'));
    return files.sort();
  } catch (e) {
    // Fallback: use ls
    try {
      const result = execSync(`ls -1 ${pattern} 2>/dev/null | head -100`, {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: 10000,
      });
      const files = result
        .split('\n')
        .filter(f => f.trim())
        .filter(f => !f.includes('node_modules') && !f.includes('.git'));
      return files.sort();
    } catch (e2) {
      return [];
    }
  }
}

// ===== TEST GATE =====

/**
 * Run tests for a specific file
 * Uses Jest's testPathPattern to run only relevant tests
 */
function runTestsForFile(rootDir, filePath) {
  const result = { passed: false, output: '', duration: 0 };
  const startTime = Date.now();

  // Extract filename without extension for test pattern
  const basename = path.basename(filePath, path.extname(filePath));

  // Try to run tests matching this file
  // Common patterns: Button.tsx -> Button.test.tsx, Button.spec.tsx
  const testPattern = basename.replace(/\.(test|spec)$/, '');

  try {
    const output = execSync(`npm test -- --testPathPattern="${testPattern}" --passWithNoTests`, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000, // 2 minute timeout per file
    });
    result.passed = true;
    result.output = output;
  } catch (e) {
    result.passed = false;
    result.output = (e.stdout || '') + '\n' + (e.stderr || '');
    if (e.message) {
      result.output += '\n' + e.message;
    }
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ===== BATCH LOOP CORE =====

function getNextPendingItem(items) {
  for (const [itemPath, itemState] of Object.entries(items)) {
    if (itemState.status === 'pending') {
      return itemPath;
    }
  }
  return null;
}

function getCurrentItem(items) {
  for (const [itemPath, itemState] of Object.entries(items)) {
    if (itemState.status === 'in_progress') {
      return itemPath;
    }
  }
  return null;
}

function updateSummary(items) {
  const summary = {
    total: Object.keys(items).length,
    completed: 0,
    in_progress: 0,
    pending: 0,
    failed: 0,
  };

  for (const item of Object.values(items)) {
    summary[item.status] = (summary[item.status] || 0) + 1;
  }

  return summary;
}

function generateBatchId() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `batch-${timestamp}`;
}

// ===== MAIN LOOP HANDLER =====

function handleBatchLoop(rootDir) {
  const state = getSessionState(rootDir);
  const loop = state.batch_loop;

  // Check if batch loop mode is enabled
  if (!loop || !loop.enabled) {
    return; // Silent exit - not in batch loop mode
  }

  const iteration = (loop.iteration || 0) + 1;
  const maxIterations = loop.max_iterations || 50;

  console.log('');
  console.log(
    `${c.brand}${c.bold}======================================================${c.reset}`
  );
  console.log(
    `${c.brand}${c.bold}  BATCH LOOP - Iteration ${iteration}/${maxIterations}${c.reset}`
  );
  console.log(
    `${c.brand}${c.bold}======================================================${c.reset}`
  );
  console.log('');

  // State Narration: Loop iteration marker
  console.log(`🔄 Iteration ${iteration}/${maxIterations}`);

  // Check iteration limit
  if (iteration > maxIterations) {
    console.log(`${c.yellow}⚠ Max iterations (${maxIterations}) reached. Stopping loop.${c.reset}`);
    state.batch_loop.enabled = false;
    state.batch_loop.stopped_reason = 'max_iterations';
    saveSessionState(rootDir, state);
    return;
  }

  const items = loop.items || {};
  const currentItem = getCurrentItem(items);

  if (!currentItem) {
    // No item in progress - find next pending
    const nextItem = getNextPendingItem(items);
    if (!nextItem) {
      // All items completed!
      const summary = updateSummary(items);
      state.batch_loop.enabled = false;
      state.batch_loop.stopped_reason = 'batch_complete';
      state.batch_loop.completed_at = new Date().toISOString();
      state.batch_loop.summary = summary;
      saveSessionState(rootDir, state);

      console.log('');
      console.log(
        `${c.green}${c.bold}======================================================${c.reset}`
      );
      console.log(`${c.green}${c.bold}  🎉 BATCH COMPLETE!${c.reset}`);
      console.log(
        `${c.green}${c.bold}======================================================${c.reset}`
      );
      console.log('');
      console.log(`${c.green}Pattern: ${loop.pattern}${c.reset}`);
      console.log(
        `${c.dim}${summary.completed} items completed in ${iteration - 1} iterations${c.reset}`
      );
      return;
    }

    // Start next item
    items[nextItem] = {
      ...items[nextItem],
      status: 'in_progress',
      iterations: 0,
      started_at: new Date().toISOString(),
    };
    state.batch_loop.items = items;
    state.batch_loop.current_item = nextItem;
    state.batch_loop.summary = updateSummary(items);
    saveSessionState(rootDir, state);

    console.log(`📍 Starting: ${nextItem}`);
    console.log('');
    console.log(`${c.brand}▶ Implement "${loop.action}" for this file${c.reset}`);
    console.log(`${c.dim}  Run tests when ready. Loop will validate and continue.${c.reset}`);
    return;
  }

  // Current item in progress - run quality gate
  console.log(`📍 Working on: ${currentItem}`);
  console.log('');

  // Update item iterations
  items[currentItem].iterations = (items[currentItem].iterations || 0) + 1;

  // Run tests for this file
  console.log(`${c.blue}Running tests for:${c.reset} ${currentItem}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  const testResult = runTestsForFile(rootDir, currentItem);

  if (testResult.passed) {
    console.log(`${c.green}✓ Tests passed${c.reset} (${(testResult.duration / 1000).toFixed(1)}s)`);

    // Mark item complete
    items[currentItem].status = 'completed';
    items[currentItem].completed_at = new Date().toISOString();
    state.batch_loop.items = items;
    state.batch_loop.summary = updateSummary(items);
    state.batch_loop.iteration = iteration;

    // Find next item
    const nextItem = getNextPendingItem(items);

    if (nextItem) {
      // Start next item
      items[nextItem] = {
        ...items[nextItem],
        status: 'in_progress',
        iterations: 0,
        started_at: new Date().toISOString(),
      };
      state.batch_loop.items = items;
      state.batch_loop.current_item = nextItem;
      state.batch_loop.summary = updateSummary(items);
      saveSessionState(rootDir, state);

      const summary = state.batch_loop.summary;
      console.log('');
      console.log(`✅ Item complete: ${currentItem}`);
      console.log('');
      console.log(`${c.cyan}━━━ Next Item ━━━${c.reset}`);
      console.log(`${c.bold}${nextItem}${c.reset}`);
      console.log('');
      console.log(
        `${c.dim}Progress: ${summary.completed}/${summary.total} items complete${c.reset}`
      );
      console.log('');
      console.log(`${c.brand}▶ Implement "${loop.action}" for this file${c.reset}`);
      console.log(`${c.dim}  Run tests when ready. Loop will validate and continue.${c.reset}`);
    } else {
      // Batch complete!
      state.batch_loop.enabled = false;
      state.batch_loop.stopped_reason = 'batch_complete';
      state.batch_loop.completed_at = new Date().toISOString();
      saveSessionState(rootDir, state);

      const summary = state.batch_loop.summary;
      console.log('');
      console.log(
        `${c.green}${c.bold}======================================================${c.reset}`
      );
      console.log(`${c.green}${c.bold}  🎉 BATCH COMPLETE!${c.reset}`);
      console.log(
        `${c.green}${c.bold}======================================================${c.reset}`
      );
      console.log('');
      console.log(`${c.green}Pattern: ${loop.pattern}${c.reset}`);
      console.log(`${c.green}Action: ${loop.action}${c.reset}`);
      console.log(
        `${c.dim}${summary.completed} items completed in ${iteration} iterations${c.reset}`
      );
    }
  } else {
    // Tests failed - continue iterating
    console.log(`${c.red}✗ Tests failed${c.reset} (${(testResult.duration / 1000).toFixed(1)}s)`);
    console.log('');

    state.batch_loop.items = items;
    state.batch_loop.iteration = iteration;
    state.batch_loop.last_failure = new Date().toISOString();
    saveSessionState(rootDir, state);

    console.log(`${c.yellow}━━━ Test Failures ━━━${c.reset}`);

    // Show truncated output (last 30 lines most relevant)
    const outputLines = testResult.output.split('\n');
    const relevantLines = outputLines.slice(-30);
    console.log(relevantLines.join('\n'));

    console.log('');
    console.log(`${c.brand}▶ Fix the failing tests and continue${c.reset}`);
    console.log(`${c.dim}  Loop will re-run tests when you stop.${c.reset}`);
    console.log(`${c.dim}  Item iterations: ${items[currentItem].iterations}${c.reset}`);
    console.log(`${c.dim}  Batch iterations: ${iteration}/${maxIterations}${c.reset}`);
  }

  console.log('');
}

// ===== CLI HANDLERS =====

async function handleInit(args, rootDir) {
  const patternArg = args.find(a => a.startsWith('--pattern='));
  const actionArg = args.find(a => a.startsWith('--action='));
  const maxArg = args.find(a => a.startsWith('--max='));

  if (!patternArg) {
    console.log(`${c.red}Error: --pattern="glob" is required${c.reset}`);
    console.log(`${c.dim}Example: --pattern="src/**/*.tsx"${c.reset}`);
    return;
  }

  const pattern = patternArg.split('=').slice(1).join('=').replace(/"/g, '');
  const action = actionArg ? actionArg.split('=').slice(1).join('=').replace(/"/g, '') : 'process';
  const maxIterations = parseIntBounded(maxArg ? maxArg.split('=')[1] : null, 50, 1, 200);

  // Resolve glob pattern
  console.log(`${c.dim}Resolving pattern: ${pattern}${c.reset}`);
  const files = await resolveGlob(pattern, rootDir);

  if (files.length === 0) {
    console.log(`${c.yellow}No files found matching: ${pattern}${c.reset}`);
    return;
  }

  // Build items map
  const items = {};
  for (const file of files) {
    items[file] = {
      status: 'pending',
      iterations: 0,
      started_at: null,
      completed_at: null,
    };
  }

  // Mark first item as in_progress
  const firstItem = files[0];
  items[firstItem].status = 'in_progress';
  items[firstItem].started_at = new Date().toISOString();

  // Initialize batch loop state
  const state = getSessionState(rootDir);
  state.batch_loop = {
    enabled: true,
    batch_id: generateBatchId(),
    pattern: pattern,
    action: action,
    quality_gate: 'tests',
    current_item: firstItem,
    items: items,
    summary: updateSummary(items),
    iteration: 0,
    max_iterations: maxIterations,
    started_at: new Date().toISOString(),
  };
  saveSessionState(rootDir, state);

  console.log('');
  console.log(`${c.green}${c.bold}Batch Loop Initialized${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Pattern: ${c.cyan}${pattern}${c.reset}`);
  console.log(`  Action: ${c.cyan}${action}${c.reset}`);
  console.log(`  Items: ${files.length} files`);
  console.log(`  Gate: tests (pass/fail)`);
  console.log(`  Max Iterations: ${maxIterations}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log('');
  console.log(`${c.brand}▶ Starting Item:${c.reset} ${firstItem}`);
  console.log('');
  console.log(`${c.dim}Work on this file. When you stop, tests will run automatically.${c.reset}`);
  console.log(`${c.dim}If tests pass, the next item will be loaded.${c.reset}`);
  console.log('');
}

function handleStatus(rootDir) {
  const state = getSessionState(rootDir);
  const loop = state.batch_loop;

  if (!loop || !loop.enabled) {
    console.log(`${c.dim}Batch Loop: not active${c.reset}`);
    return;
  }

  const summary = loop.summary || updateSummary(loop.items || {});

  console.log(`${c.green}Batch Loop: active${c.reset}`);
  console.log(`  Pattern: ${loop.pattern}`);
  console.log(`  Action: ${loop.action}`);
  console.log(`  Current Item: ${loop.current_item || 'none'}`);
  console.log(
    `  Progress: ${summary.completed}/${summary.total} (${summary.in_progress} in progress)`
  );
  console.log(`  Iteration: ${loop.iteration || 0}/${loop.max_iterations || 50}`);
}

function handleStop(rootDir) {
  const state = getSessionState(rootDir);
  if (state.batch_loop) {
    state.batch_loop.enabled = false;
    state.batch_loop.stopped_reason = 'manual';
    saveSessionState(rootDir, state);
    console.log(`${c.yellow}Batch Loop stopped${c.reset}`);
  } else {
    console.log(`${c.dim}Batch Loop was not active${c.reset}`);
  }
}

function handleReset(rootDir) {
  const state = getSessionState(rootDir);
  delete state.batch_loop;
  saveSessionState(rootDir, state);
  console.log(`${c.green}Batch Loop state reset${c.reset}`);
}

function showHelp() {
  console.log(`
${c.brand}${c.bold}batch-pmap-loop.js${c.reset} - Autonomous Batch Processing

${c.bold}Usage:${c.reset}
  node scripts/batch-pmap-loop.js                                Run loop check (Stop hook)
  node scripts/batch-pmap-loop.js --init --pattern="*.tsx" --action="add-tests"
  node scripts/batch-pmap-loop.js --status                       Check loop status
  node scripts/batch-pmap-loop.js --stop                         Stop the loop
  node scripts/batch-pmap-loop.js --reset                        Reset loop state

${c.bold}Options:${c.reset}
  --pattern="glob"    Glob pattern for files (required for --init)
  --action="action"   Action to perform on each file (default: "process")
  --max=N             Max total iterations (default: 50)

${c.bold}Quality Gate:${c.reset}
  V1 supports tests gate only:
  - Runs: npm test -- --testPathPattern="filename"
  - Passes if tests for this file pass (or no matching tests)
  - Fails if tests for this file fail

${c.bold}How it works:${c.reset}
  1. Initialize with: /agileflow:batch pmap "pattern" action MODE=loop
  2. Work on current file
  3. When you stop, tests run for that file
  4. If pass: next file loaded
  5. If fail: continue fixing
  6. Repeats until all files done or max iterations
`);
}

// ===== MAIN =====

async function main() {
  const args = process.argv.slice(2);
  const rootDir = getProjectRoot();

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--status')) {
    handleStatus(rootDir);
    return;
  }

  if (args.includes('--stop')) {
    handleStop(rootDir);
    return;
  }

  if (args.includes('--reset')) {
    handleReset(rootDir);
    return;
  }

  if (args.some(a => a.startsWith('--init'))) {
    await handleInit(args, rootDir);
    return;
  }

  // Default: run as Stop hook
  handleBatchLoop(rootDir);
}

main().catch(e => {
  console.error(`${c.red}Error: ${e.message}${c.reset}`);
  process.exit(1);
});
