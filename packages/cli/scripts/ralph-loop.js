#!/usr/bin/env node

/**
 * ralph-loop.js - Autonomous Story Processing Loop
 *
 * This script is the brain of AgileFlow's autonomous work mode.
 * It runs as a Stop hook and handles:
 *   1. Checking if loop mode is enabled
 *   2. Running test validation
 *   3. Running screenshot verification (Visual Mode)
 *   4. Updating story status on success
 *   5. Feeding context back for next iteration
 *   6. Tracking iterations and enforcing limits
 *
 * Named after the "Ralph Wiggum" pattern from Anthropic.
 *
 * Visual Mode:
 *   When visual_mode is enabled, the loop also verifies that all
 *   screenshots have been reviewed (verified- prefix). This ensures
 *   Claude actually looks at UI screenshots before declaring completion.
 *
 * Usage (as Stop hook):
 *   node scripts/ralph-loop.js
 *
 * Manual control:
 *   node scripts/ralph-loop.js --status     # Check loop status
 *   node scripts/ralph-loop.js --stop       # Stop the loop
 *   node scripts/ralph-loop.js --reset      # Reset loop state
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../lib/errors');
const { isValidEpicId, parseIntBounded } = require('../lib/validate');

// Read session state
function getSessionState(rootDir) {
  const statePath = path.join(rootDir, 'docs/09-agents/session-state.json');
  const result = safeReadJSON(statePath, { defaultValue: {} });
  return result.ok ? result.data : {};
}

// Write session state
function saveSessionState(rootDir, state) {
  const statePath = path.join(rootDir, 'docs/09-agents/session-state.json');
  safeWriteJSON(statePath, state, { createDir: true });
}

// Read status.json for stories
function getStatus(rootDir) {
  const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
  const result = safeReadJSON(statusPath, { defaultValue: { stories: {}, epics: {} } });
  return result.ok ? result.data : { stories: {}, epics: {} };
}

// Save status.json
function saveStatus(rootDir, status) {
  const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
  safeWriteJSON(statusPath, status);
}

// Get test command from package.json or metadata
function getTestCommand(rootDir) {
  // Check agileflow metadata first
  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.test_command) {
    return result.data.ralph_loop.test_command;
  }

  // Default to npm test
  return 'npm test';
}

// Run tests and return result
function runTests(rootDir, testCommand) {
  const result = { passed: false, output: '', duration: 0 };
  const startTime = Date.now();

  try {
    const output = execSync(testCommand, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000, // 5 minute timeout
    });
    result.passed = true;
    result.output = output;
  } catch (e) {
    result.passed = false;
    result.output = e.stdout || '' + '\n' + (e.stderr || '');
    if (e.message) {
      result.output += '\n' + e.message;
    }
  }

  result.duration = Date.now() - startTime;
  return result;
}

// Get coverage command from metadata or default
function getCoverageCommand(rootDir) {
  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.coverage_command) {
    return result.data.ralph_loop.coverage_command;
  }

  // Default: try common coverage commands
  return 'npm run test:coverage || npm test -- --coverage';
}

// Get coverage report path from metadata or default
function getCoverageReportPath(rootDir) {
  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.coverage_report_path) {
    return result.data.ralph_loop.coverage_report_path;
  }

  return 'coverage/coverage-summary.json';
}

// ===== DISCRETION MARKERS =====
// Semantic conditions wrapped in **...**
// These are evaluated by the loop to determine completion

/**
 * Built-in discretion conditions that can be evaluated programmatically
 * Format: condition key -> evaluation function
 */
const DISCRETION_CONDITIONS = {
  // Test-related conditions
  'all tests passing': (rootDir, _ctx) => {
    const testCommand = getTestCommand(rootDir);
    const result = runTests(rootDir, testCommand);
    return {
      passed: result.passed,
      message: result.passed
        ? 'All tests passing'
        : `Tests failing: ${result.output.split('\n').slice(-3).join(' ').substring(0, 100)}`,
    };
  },

  'tests pass': (rootDir, _ctx) => {
    const testCommand = getTestCommand(rootDir);
    const result = runTests(rootDir, testCommand);
    return {
      passed: result.passed,
      message: result.passed ? 'Tests pass' : 'Tests failing',
    };
  },

  // Coverage conditions (requires threshold in context)
  'coverage above threshold': (rootDir, ctx) => {
    const threshold = ctx.coverageThreshold || 80;
    const result = verifyCoverage(rootDir, threshold);
    return {
      passed: result.passed,
      message: `Coverage: ${result.coverage?.toFixed(1) || 0}% (threshold: ${threshold}%)`,
    };
  },

  // Lint conditions
  'no linting errors': (rootDir, _ctx) => {
    try {
      execSync('npm run lint', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      return { passed: true, message: 'No linting errors' };
    } catch (e) {
      return { passed: false, message: 'Linting errors found' };
    }
  },

  // Type checking conditions
  'no type errors': (rootDir, _ctx) => {
    try {
      execSync('npx tsc --noEmit', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      return { passed: true, message: 'No type errors' };
    } catch (e) {
      return { passed: false, message: 'Type errors found' };
    }
  },

  // Build conditions
  'build succeeds': (rootDir, _ctx) => {
    try {
      execSync('npm run build', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000,
      });
      return { passed: true, message: 'Build succeeds' };
    } catch (e) {
      return { passed: false, message: 'Build failed' };
    }
  },

  // Screenshot/visual conditions
  'all screenshots verified': (rootDir, _ctx) => {
    const result = verifyScreenshots(rootDir);
    return {
      passed: result.passed,
      message: result.passed
        ? 'All screenshots verified'
        : `${result.unverified?.length || 0} unverified screenshots`,
    };
  },

  // AC conditions (checks story acceptance criteria in status.json)
  'all acceptance criteria verified': (rootDir, ctx) => {
    const storyId = ctx.currentStoryId;
    if (!storyId) {
      return { passed: false, message: 'No story ID in context' };
    }
    const status = getStatus(rootDir);
    const story = status.stories?.[storyId];
    if (!story) {
      return { passed: false, message: `Story ${storyId} not found` };
    }
    // Check if story has AC and if they're marked complete
    const ac = story.acceptance_criteria || story.ac || [];
    if (!Array.isArray(ac) || ac.length === 0) {
      return { passed: true, message: 'No AC defined (assuming complete)' };
    }
    // Check for ac_status field or assume AC are verified if tests pass
    const acStatus = story.ac_status || {};
    const allVerified = ac.every((_, i) => acStatus[i] === 'verified' || acStatus[i] === true);
    return {
      passed: allVerified,
      message: allVerified
        ? 'All AC verified'
        : `${Object.values(acStatus).filter(v => v === 'verified' || v === true).length}/${ac.length} AC verified`,
    };
  },
};

/**
 * Parse discretion condition from string
 * @param {string} condition - e.g., "**all tests passing**" or "**coverage above 80%**"
 * @returns {object} { key, threshold? }
 */
function parseDiscretionCondition(condition) {
  // Remove ** markers
  const cleaned = condition.replace(/\*\*/g, '').trim().toLowerCase();

  // Check for threshold patterns like "coverage above 80%"
  const coverageMatch = cleaned.match(/coverage (?:above|>=?) (\d+)%?/);
  if (coverageMatch) {
    return { key: 'coverage above threshold', threshold: parseInt(coverageMatch[1]) };
  }

  return { key: cleaned };
}

/**
 * Evaluate a discretion condition
 * @param {string} condition - The condition string (with or without ** markers)
 * @param {string} rootDir - Project root
 * @param {object} ctx - Context (currentStoryId, coverageThreshold, etc.)
 * @returns {object} { passed: boolean, message: string }
 */
function evaluateDiscretionCondition(condition, rootDir, ctx = {}) {
  const parsed = parseDiscretionCondition(condition);

  // Set threshold in context if parsed from condition
  if (parsed.threshold) {
    ctx.coverageThreshold = parsed.threshold;
  }

  const evaluator = DISCRETION_CONDITIONS[parsed.key];
  if (!evaluator) {
    return {
      passed: false,
      message: `Unknown condition: "${parsed.key}". Available: ${Object.keys(DISCRETION_CONDITIONS).join(', ')}`,
    };
  }

  return evaluator(rootDir, ctx);
}

/**
 * Get discretion conditions from metadata
 * @param {string} rootDir
 * @returns {string[]} Array of condition strings
 */
function getDiscretionConditions(rootDir) {
  const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
  const result = safeReadJSON(metadataPath, { defaultValue: {} });

  if (result.ok && result.data?.ralph_loop?.conditions) {
    return result.data.ralph_loop.conditions;
  }

  return [];
}

// Parse coverage report (Jest/NYC format)
function parseCoverageReport(rootDir) {
  const reportPath = getCoverageReportPath(rootDir);
  const fullPath = path.join(rootDir, reportPath);
  const report = safeReadJSON(fullPath, { defaultValue: null });

  if (!report.ok || !report.data) {
    return { passed: false, coverage: 0, error: 'Coverage report not found at ' + reportPath };
  }

  // Jest/NYC format: { total: { lines: { pct: 80 }, statements: { pct: 80 } } }
  const total = report.data.total;
  if (!total) {
    return { passed: false, coverage: 0, error: 'Invalid coverage report format' };
  }

  const coverage = total.lines?.pct || total.statements?.pct || 0;

  return { passed: true, coverage, raw: report.data };
}

// Verify coverage meets threshold
function verifyCoverage(rootDir, threshold) {
  const result = parseCoverageReport(rootDir);

  if (!result.passed) {
    return {
      passed: false,
      coverage: 0,
      message: `${c.red}✗ ${result.error}${c.reset}`,
    };
  }

  const met = result.coverage >= threshold;

  return {
    passed: met,
    coverage: result.coverage,
    threshold: threshold,
    message: met
      ? `${c.green}✓ Coverage ${result.coverage.toFixed(1)}% ≥ ${threshold}%${c.reset}`
      : `${c.yellow}⏳ Coverage ${result.coverage.toFixed(1)}% < ${threshold}% (need ${(threshold - result.coverage).toFixed(1)}% more)${c.reset}`,
  };
}

// Run coverage command
function runCoverage(rootDir) {
  const coverageCmd = getCoverageCommand(rootDir);
  const result = { passed: false, output: '', duration: 0 };
  const startTime = Date.now();

  try {
    const output = execSync(coverageCmd, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000, // 5 minute timeout
    });
    result.passed = true;
    result.output = output;
  } catch (e) {
    // Coverage command might fail but still generate report
    result.passed = true; // We'll check the report
    result.output = e.stdout || '' + '\n' + (e.stderr || '');
  }

  result.duration = Date.now() - startTime;
  return result;
}

// Get screenshots directory from metadata or default
function getScreenshotsDir(rootDir) {
  try {
    const metadataPath = path.join(rootDir, 'docs/00-meta/agileflow-metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata.ralph_loop?.screenshots_dir) {
        return metadata.ralph_loop.screenshots_dir;
      }
    }
  } catch (e) {}
  return './screenshots';
}

// Run screenshot verification (Visual Mode)
function verifyScreenshots(rootDir) {
  const result = { passed: false, output: '', total: 0, verified: 0, unverified: [] };
  const screenshotsDir = getScreenshotsDir(rootDir);
  const fullPath = path.resolve(rootDir, screenshotsDir);

  // Check if directory exists
  if (!fs.existsSync(fullPath)) {
    result.passed = true; // No screenshots = nothing to verify
    result.output = 'No screenshots directory found';
    return result;
  }

  // Get all image files
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  let files;
  try {
    files = fs.readdirSync(fullPath).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });
  } catch (e) {
    result.output = `Error reading screenshots directory: ${e.message}`;
    return result;
  }

  if (files.length === 0) {
    result.passed = true;
    result.output = 'No screenshots found in directory';
    return result;
  }

  // Check each file for verified- prefix
  for (const file of files) {
    if (file.startsWith('verified-')) {
      result.verified++;
    } else {
      result.unverified.push(file);
    }
  }

  result.total = files.length;
  result.passed = result.unverified.length === 0;

  if (result.passed) {
    result.output = `All ${result.total} screenshots verified`;
  } else {
    result.output = `${result.unverified.length} screenshots missing 'verified-' prefix`;
  }

  return result;
}

// Get next ready story in epic
function getNextStory(status, epicId, currentStoryId) {
  const stories = status.stories || {};

  // Get all stories in this epic that are ready
  const readyStories = Object.entries(stories)
    .filter(([id, story]) => {
      return story.epic === epicId && story.status === 'ready' && id !== currentStoryId;
    })
    .sort((a, b) => {
      // Sort by story number if possible
      const numA = parseInt(a[0].replace(/\D/g, '')) || 0;
      const numB = parseInt(b[0].replace(/\D/g, '')) || 0;
      return numA - numB;
    });

  if (readyStories.length > 0) {
    return { id: readyStories[0][0], ...readyStories[0][1] };
  }
  return null;
}

// Mark story as completed
function markStoryComplete(rootDir, storyId) {
  const status = getStatus(rootDir);
  if (status.stories && status.stories[storyId]) {
    status.stories[storyId].status = 'completed';
    status.stories[storyId].completed_at = new Date().toISOString();
    saveStatus(rootDir, status);
    return true;
  }
  return false;
}

// Mark story as in_progress
function markStoryInProgress(rootDir, storyId) {
  const status = getStatus(rootDir);
  if (status.stories && status.stories[storyId]) {
    status.stories[storyId].status = 'in_progress';
    status.stories[storyId].started_at = new Date().toISOString();
    saveStatus(rootDir, status);
    return true;
  }
  return false;
}

// Get story details
function getStoryDetails(rootDir, storyId) {
  const status = getStatus(rootDir);
  if (status.stories && status.stories[storyId]) {
    return { id: storyId, ...status.stories[storyId] };
  }
  return null;
}

// Count stories in epic by status
function getEpicProgress(status, epicId) {
  const stories = status.stories || {};
  const epicStories = Object.entries(stories).filter(([_, s]) => s.epic === epicId);

  return {
    total: epicStories.length,
    completed: epicStories.filter(([_, s]) => s.status === 'completed').length,
    in_progress: epicStories.filter(([_, s]) => s.status === 'in_progress').length,
    ready: epicStories.filter(([_, s]) => s.status === 'ready').length,
    blocked: epicStories.filter(([_, s]) => s.status === 'blocked').length,
  };
}

// Main loop logic
function handleLoop(rootDir) {
  const state = getSessionState(rootDir);
  const loop = state.ralph_loop;

  // Check if loop mode is enabled
  if (!loop || !loop.enabled) {
    return; // Silent exit - not in loop mode
  }

  const status = getStatus(rootDir);
  const iteration = (loop.iteration || 0) + 1;
  const maxIterations = loop.max_iterations || 20;
  const visualMode = loop.visual_mode || false;
  const coverageMode = loop.coverage_mode || false;
  const coverageThreshold = loop.coverage_threshold || 80;
  const discretionConditions = loop.conditions || getDiscretionConditions(rootDir);
  // Visual, Coverage, and Discretion modes require at least 2 iterations for confirmation
  const hasDiscretionConditions = discretionConditions.length > 0;
  const minIterations = visualMode || coverageMode || hasDiscretionConditions ? 2 : 1;

  console.log('');
  console.log(
    `${c.brand}${c.bold}══════════════════════════════════════════════════════════${c.reset}`
  );
  let modeLabel = '';
  if (visualMode) modeLabel += ' [VISUAL]';
  if (coverageMode) modeLabel += ` [COVERAGE ≥${coverageThreshold}%]`;
  if (hasDiscretionConditions) modeLabel += ` [${discretionConditions.length} CONDITIONS]`;
  console.log(
    `${c.brand}${c.bold}  RALPH LOOP - Iteration ${iteration}/${maxIterations}${modeLabel}${c.reset}`
  );
  console.log(
    `${c.brand}${c.bold}══════════════════════════════════════════════════════════${c.reset}`
  );
  console.log('');
  // State Narration: Loop iteration marker
  console.log(`🔄 Iteration ${iteration}/${maxIterations}`);

  // Check iteration limit
  if (iteration > maxIterations) {
    console.log(`${c.yellow}⚠ Max iterations (${maxIterations}) reached. Stopping loop.${c.reset}`);
    console.log(`${c.dim}Run /agileflow:babysit MODE=loop to restart${c.reset}`);
    state.ralph_loop.enabled = false;
    state.ralph_loop.stopped_reason = 'max_iterations';
    saveSessionState(rootDir, state);
    return;
  }

  // Get current story
  const currentStoryId = loop.current_story;
  const currentStory = getStoryDetails(rootDir, currentStoryId);
  const epicId = loop.epic;

  if (!currentStory) {
    console.log(`${c.red}✗ Current story ${currentStoryId} not found${c.reset}`);
    state.ralph_loop.enabled = false;
    state.ralph_loop.stopped_reason = 'story_not_found';
    saveSessionState(rootDir, state);
    return;
  }

  // State Narration: Current position marker
  console.log(`📍 Working on: ${currentStoryId} - ${currentStory.title || 'Untitled'}`);
  console.log('');

  // Run tests
  const testCommand = getTestCommand(rootDir);
  console.log(`${c.blue}Running:${c.reset} ${testCommand}`);
  console.log(`${c.dim}${'─'.repeat(58)}${c.reset}`);

  const testResult = runTests(rootDir, testCommand);

  if (testResult.passed) {
    console.log(`${c.green}✓ Tests passed${c.reset} (${(testResult.duration / 1000).toFixed(1)}s)`);

    // Visual Mode: Also verify screenshots
    let screenshotResult = { passed: true };
    if (visualMode) {
      console.log('');
      console.log(`${c.blue}Verifying screenshots...${c.reset}`);
      screenshotResult = verifyScreenshots(rootDir);

      if (screenshotResult.passed) {
        console.log(`${c.green}✓ ${screenshotResult.output}${c.reset}`);
        state.ralph_loop.screenshots_verified = true;
      } else {
        console.log(`${c.yellow}⚠ ${screenshotResult.output}${c.reset}`);
        if (screenshotResult.unverified.length > 0) {
          console.log(`${c.dim}Unverified screenshots:${c.reset}`);
          screenshotResult.unverified.slice(0, 5).forEach(file => {
            console.log(`  ${c.yellow}- ${file}${c.reset}`);
          });
          if (screenshotResult.unverified.length > 5) {
            console.log(
              `  ${c.dim}... and ${screenshotResult.unverified.length - 5} more${c.reset}`
            );
          }
        }
        state.ralph_loop.screenshots_verified = false;
      }
    }

    // Coverage Mode: Run coverage and verify threshold
    let coverageResult = { passed: true };
    if (coverageMode) {
      console.log('');
      console.log(`${c.blue}Running coverage check...${c.reset}`);
      runCoverage(rootDir);
      coverageResult = verifyCoverage(rootDir, coverageThreshold);
      console.log(coverageResult.message);

      // Update state with current coverage
      state.ralph_loop.coverage_current = coverageResult.coverage;

      if (coverageResult.passed) {
        state.ralph_loop.coverage_verified = true;
      } else {
        state.ralph_loop.coverage_verified = false;
      }
    }

    // Enforce minimum iterations for Visual and Coverage modes
    if ((visualMode || coverageMode) && iteration < minIterations) {
      const modeNames = [];
      if (visualMode) modeNames.push('Visual');
      if (coverageMode) modeNames.push('Coverage');

      console.log('');
      console.log(
        `${c.yellow}⚠ ${modeNames.join(' + ')} Mode requires ${minIterations}+ iterations for confirmation${c.reset}`
      );
      console.log(
        `${c.dim}Current: iteration ${iteration}. Let loop run once more to confirm.${c.reset}`
      );

      state.ralph_loop.iteration = iteration;
      saveSessionState(rootDir, state);

      console.log('');
      console.log(`${c.brand}▶ Continue working. Loop will verify again.${c.reset}`);
      return;
    }

    // Evaluate discretion conditions
    let discretionResults = [];
    if (hasDiscretionConditions) {
      console.log('');
      console.log(`${c.blue}Evaluating discretion conditions...${c.reset}`);
      const ctx = { currentStoryId, coverageThreshold };

      for (const condition of discretionConditions) {
        const result = evaluateDiscretionCondition(condition, rootDir, ctx);
        discretionResults.push({ condition, ...result });
        const marker = result.passed ? `${c.green}✓` : `${c.yellow}⏳`;
        console.log(
          `  ${marker} **${condition.replace(/\*\*/g, '')}**: ${result.message}${c.reset}`
        );
      }

      // Track which conditions have been verified
      const allConditionsPassed = discretionResults.every(r => r.passed);
      state.ralph_loop.conditions_verified = allConditionsPassed;
      state.ralph_loop.condition_results = discretionResults.map(r => ({
        condition: r.condition,
        passed: r.passed,
        message: r.message,
      }));
    }

    // Check if all verification modes passed
    const allDiscretionPassed = !hasDiscretionConditions || discretionResults.every(r => r.passed);
    const canComplete =
      testResult.passed &&
      (!visualMode || screenshotResult.passed) &&
      (!coverageMode || coverageResult.passed) &&
      allDiscretionPassed;

    if (!canComplete) {
      // Something not verified yet
      state.ralph_loop.iteration = iteration;
      saveSessionState(rootDir, state);

      console.log('');
      if (visualMode && !screenshotResult.passed) {
        console.log(`${c.cyan}▶ Review unverified screenshots:${c.reset}`);
        console.log(`${c.dim}  1. View each screenshot in screenshots/ directory${c.reset}`);
        console.log(`${c.dim}  2. Rename verified files with 'verified-' prefix${c.reset}`);
        console.log(`${c.dim}  3. Loop will re-verify when you stop${c.reset}`);
      }
      if (coverageMode && !coverageResult.passed) {
        console.log(`${c.cyan}▶ Increase test coverage:${c.reset}`);
        console.log(`${c.dim}  Current: ${coverageResult.coverage?.toFixed(1) || 0}%${c.reset}`);
        console.log(`${c.dim}  Target: ${coverageThreshold}%${c.reset}`);
        console.log(`${c.dim}  Write more tests to cover uncovered code paths.${c.reset}`);
      }
      if (hasDiscretionConditions && !allDiscretionPassed) {
        const failedConditions = discretionResults.filter(r => !r.passed);
        console.log(`${c.cyan}▶ Fix failing conditions:${c.reset}`);
        for (const fc of failedConditions) {
          console.log(`${c.dim}  - ${fc.condition.replace(/\*\*/g, '')}: ${fc.message}${c.reset}`);
        }
      }
      return;
    }
    console.log('');

    // Mark story complete
    markStoryComplete(rootDir, currentStoryId);
    // State Narration: Completion marker
    console.log(`✅ Story complete: ${currentStoryId}`);
    console.log(`${c.green}✓ Marked ${currentStoryId} as completed${c.reset}`);

    // Get next story
    const nextStory = getNextStory(status, epicId, currentStoryId);

    if (nextStory) {
      // Move to next story
      markStoryInProgress(rootDir, nextStory.id);
      state.ralph_loop.current_story = nextStory.id;
      state.ralph_loop.iteration = iteration;
      saveSessionState(rootDir, state);

      const progress = getEpicProgress(getStatus(rootDir), epicId);
      console.log('');
      console.log(`${c.cyan}━━━ Next Story ━━━${c.reset}`);
      console.log(`${c.bold}${nextStory.id}:${c.reset} ${nextStory.title || 'Untitled'}`);
      if (nextStory.acceptance_criteria) {
        console.log(`${c.dim}Acceptance Criteria:${c.reset}`);
        const criteria = Array.isArray(nextStory.acceptance_criteria)
          ? nextStory.acceptance_criteria
          : [nextStory.acceptance_criteria];
        criteria.slice(0, 3).forEach(ac => console.log(`  • ${ac}`));
      }
      console.log('');
      console.log(
        `${c.dim}Epic Progress: ${progress.completed}/${progress.total} stories complete${c.reset}`
      );
      console.log('');
      console.log(`${c.brand}▶ Continue implementing ${nextStory.id}${c.reset}`);
      console.log(`${c.dim}  Run tests when ready. Loop will validate and continue.${c.reset}`);
    } else {
      // No more stories - epic complete!
      const progress = getEpicProgress(getStatus(rootDir), epicId);
      state.ralph_loop.enabled = false;
      state.ralph_loop.stopped_reason = 'epic_complete';
      state.ralph_loop.completed_at = new Date().toISOString();
      saveSessionState(rootDir, state);

      console.log('');
      console.log(
        `${c.green}${c.bold}════════════════════════════════════════════════════════${c.reset}`
      );
      console.log(`${c.green}${c.bold}  🎉 EPIC COMPLETE!${c.reset}`);
      console.log(
        `${c.green}${c.bold}════════════════════════════════════════════════════════${c.reset}`
      );
      console.log('');
      console.log(`${c.green}Epic ${epicId} finished in ${iteration} iterations${c.reset}`);
      console.log(`${c.dim}${progress.completed} stories completed${c.reset}`);
      console.log('');
    }
  } else {
    // Tests failed - feed back to Claude
    // State Narration: Error marker
    console.log(`⚠️ Error: Test failure - ${(testResult.duration / 1000).toFixed(1)}s`);
    console.log(`${c.red}✗ Tests failed${c.reset} (${(testResult.duration / 1000).toFixed(1)}s)`);
    console.log('');

    state.ralph_loop.iteration = iteration;
    state.ralph_loop.last_failure = new Date().toISOString();
    saveSessionState(rootDir, state);

    console.log(`${c.yellow}━━━ Test Failures ━━━${c.reset}`);

    // Show truncated output (last 50 lines most relevant)
    const outputLines = testResult.output.split('\n');
    const relevantLines = outputLines.slice(-50);
    console.log(relevantLines.join('\n'));

    console.log('');
    console.log(`${c.brand}▶ Fix the failing tests and continue${c.reset}`);
    console.log(`${c.dim}  Loop will re-run tests when you stop.${c.reset}`);
    console.log(`${c.dim}  Iteration ${iteration}/${maxIterations}${c.reset}`);
  }

  console.log('');
}

// Handle CLI arguments
function handleCLI() {
  const args = process.argv.slice(2);
  const rootDir = getProjectRoot();

  if (args.includes('--status')) {
    const state = getSessionState(rootDir);
    const loop = state.ralph_loop;

    if (!loop || !loop.enabled) {
      console.log(`${c.dim}Ralph Loop: not active${c.reset}`);
    } else {
      let modeLabel = '';
      if (loop.visual_mode) modeLabel += ` ${c.cyan}[VISUAL]${c.reset}`;
      if (loop.coverage_mode)
        modeLabel += ` ${c.magenta}[COVERAGE ≥${loop.coverage_threshold}%]${c.reset}`;
      if (loop.conditions?.length > 0)
        modeLabel += ` ${c.blue}[${loop.conditions.length} CONDITIONS]${c.reset}`;
      console.log(`${c.green}Ralph Loop: active${c.reset}${modeLabel}`);
      console.log(`  Epic: ${loop.epic}`);
      console.log(`  Current Story: ${loop.current_story}`);
      console.log(`  Iteration: ${loop.iteration || 0}/${loop.max_iterations || 20}`);
      if (loop.visual_mode) {
        const verified = loop.screenshots_verified
          ? `${c.green}yes${c.reset}`
          : `${c.yellow}no${c.reset}`;
        console.log(`  Screenshots Verified: ${verified}`);
      }
      if (loop.coverage_mode) {
        const verified = loop.coverage_verified
          ? `${c.green}yes${c.reset}`
          : `${c.yellow}no${c.reset}`;
        console.log(
          `  Coverage: ${(loop.coverage_current || 0).toFixed(1)}% / ${loop.coverage_threshold}% (Verified: ${verified})`
        );
        console.log(`  Baseline: ${(loop.coverage_baseline || 0).toFixed(1)}%`);
      }
      if (loop.conditions?.length > 0) {
        const verified = loop.conditions_verified
          ? `${c.green}yes${c.reset}`
          : `${c.yellow}no${c.reset}`;
        console.log(
          `  Discretion Conditions: ${loop.conditions.length} (All Verified: ${verified})`
        );
        for (const result of loop.condition_results || []) {
          const mark = result.passed ? `${c.green}✓${c.reset}` : `${c.yellow}⏳${c.reset}`;
          console.log(`    ${mark} ${result.condition.replace(/\*\*/g, '')}`);
        }
      }
    }
    return true;
  }

  if (args.includes('--stop')) {
    const state = getSessionState(rootDir);
    if (state.ralph_loop) {
      state.ralph_loop.enabled = false;
      state.ralph_loop.stopped_reason = 'manual';
      saveSessionState(rootDir, state);
      console.log(`${c.yellow}Ralph Loop stopped${c.reset}`);
    } else {
      console.log(`${c.dim}Ralph Loop was not active${c.reset}`);
    }
    return true;
  }

  if (args.includes('--reset')) {
    const state = getSessionState(rootDir);
    delete state.ralph_loop;
    saveSessionState(rootDir, state);
    console.log(`${c.green}Ralph Loop state reset${c.reset}`);
    return true;
  }

  // Handle --init
  if (args.some(a => a.startsWith('--init'))) {
    const epicArg = args.find(a => a.startsWith('--epic='));
    const maxArg = args.find(a => a.startsWith('--max='));
    const visualArg = args.includes('--visual') || args.includes('-v');
    const coverageArg = args.find(a => a.startsWith('--coverage='));
    // Parse conditions (--condition="**all tests passing**" or -c "...")
    const conditionArgs = args.filter(a => a.startsWith('--condition=') || a.startsWith('-c='));
    const conditions = conditionArgs.map(a => a.split('=').slice(1).join('=').replace(/"/g, ''));

    if (!epicArg) {
      console.log(`${c.red}Error: --epic=EP-XXXX is required${c.reset}`);
      return true;
    }

    const epicId = epicArg.split('=')[1];

    // Validate epic ID format
    if (!isValidEpicId(epicId)) {
      console.log(`${c.red}Error: Invalid epic ID "${epicId}". Expected format: EP-XXXX${c.reset}`);
      return true;
    }

    // Validate and bound max iterations (1-100)
    const maxIterations = parseIntBounded(maxArg ? maxArg.split('=')[1] : null, 20, 1, 100);
    const visualMode = visualArg;

    // Parse coverage threshold (0-100)
    let coverageMode = false;
    let coverageThreshold = 80;
    if (coverageArg) {
      coverageMode = true;
      const threshold = parseFloat(coverageArg.split('=')[1]);
      if (!isNaN(threshold)) {
        coverageThreshold = Math.max(0, Math.min(100, threshold));
      }
    }

    // Find first ready story in epic
    const status = getStatus(rootDir);
    const stories = status.stories || {};
    const readyStories = Object.entries(stories)
      .filter(([_, s]) => s.epic === epicId && s.status === 'ready')
      .sort((a, b) => {
        const numA = parseInt(a[0].replace(/\D/g, '')) || 0;
        const numB = parseInt(b[0].replace(/\D/g, '')) || 0;
        return numA - numB;
      });

    if (readyStories.length === 0) {
      console.log(`${c.yellow}No ready stories found in ${epicId}${c.reset}`);
      console.log(`${c.dim}Create stories with status "ready" first${c.reset}`);
      return true;
    }

    const firstStory = readyStories[0];
    const storyId = firstStory[0];

    // Mark first story as in_progress
    markStoryInProgress(rootDir, storyId);

    // Get baseline coverage if coverage mode is enabled
    let coverageBaseline = 0;
    if (coverageMode) {
      console.log(`${c.dim}Running baseline coverage check...${c.reset}`);
      runCoverage(rootDir);
      const baseline = parseCoverageReport(rootDir);
      if (baseline.passed) {
        coverageBaseline = baseline.coverage;
        console.log(`${c.dim}Baseline coverage: ${coverageBaseline.toFixed(1)}%${c.reset}`);
      }
    }

    // Get conditions from metadata if not provided via CLI
    const allConditions = conditions.length > 0 ? conditions : getDiscretionConditions(rootDir);

    // Initialize loop state
    const state = getSessionState(rootDir);
    state.ralph_loop = {
      enabled: true,
      epic: epicId,
      current_story: storyId,
      iteration: 0,
      max_iterations: maxIterations,
      visual_mode: visualMode,
      screenshots_verified: false,
      coverage_mode: coverageMode,
      coverage_threshold: coverageThreshold,
      coverage_baseline: coverageBaseline,
      coverage_current: coverageBaseline,
      coverage_verified: false,
      conditions: allConditions,
      conditions_verified: false,
      condition_results: [],
      started_at: new Date().toISOString(),
    };
    saveSessionState(rootDir, state);

    const progress = getEpicProgress(status, epicId);

    console.log('');
    let modeLabel = '';
    if (visualMode) modeLabel += ` ${c.cyan}[VISUAL]${c.reset}`;
    if (coverageMode) modeLabel += ` ${c.magenta}[COVERAGE ≥${coverageThreshold}%]${c.reset}`;
    console.log(`${c.green}${c.bold}Ralph Loop Initialized${c.reset}${modeLabel}`);
    console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    console.log(`  Epic: ${c.cyan}${epicId}${c.reset}`);
    console.log(`  Stories: ${progress.ready} ready, ${progress.total} total`);
    console.log(`  Max Iterations: ${maxIterations}`);
    if (visualMode) {
      console.log(`  Visual Mode: ${c.cyan}enabled${c.reset} (screenshot verification)`);
    }
    if (coverageMode) {
      console.log(
        `  Coverage Mode: ${c.magenta}enabled${c.reset} (threshold: ${coverageThreshold}%)`
      );
      console.log(`  Baseline: ${coverageBaseline.toFixed(1)}%`);
    }
    if (allConditions.length > 0) {
      console.log(`  Conditions: ${c.blue}${allConditions.length} discretion conditions${c.reset}`);
      for (const cond of allConditions) {
        console.log(`    - **${cond.replace(/\*\*/g, '')}**`);
      }
    }
    if (visualMode || coverageMode || allConditions.length > 0) {
      console.log(`  Min Iterations: 2 (for confirmation)`);
    }
    console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    console.log('');
    console.log(`${c.brand}▶ Starting Story:${c.reset} ${storyId}`);
    console.log(`  ${firstStory[1].title || 'Untitled'}`);
    if (firstStory[1].acceptance_criteria) {
      const criteria = Array.isArray(firstStory[1].acceptance_criteria)
        ? firstStory[1].acceptance_criteria
        : [firstStory[1].acceptance_criteria];
      console.log(`${c.dim}  Acceptance Criteria:${c.reset}`);
      criteria.slice(0, 3).forEach(ac => console.log(`    • ${ac}`));
    }
    console.log('');
    console.log(
      `${c.dim}Work on this story. When you stop, tests will run automatically.${c.reset}`
    );
    console.log(`${c.dim}If tests pass, the next story will be loaded.${c.reset}`);
    console.log('');

    return true;
  }

  if (args.includes('--help')) {
    console.log(`
${c.brand}${c.bold}ralph-loop.js${c.reset} - Autonomous Story Processing

${c.bold}Usage:${c.reset}
  node scripts/ralph-loop.js                                  Run loop check (Stop hook)
  node scripts/ralph-loop.js --init --epic=EP-XXX             Initialize loop for epic
  node scripts/ralph-loop.js --init --epic=EP-XXX --visual    Initialize with Visual Mode
  node scripts/ralph-loop.js --init --epic=EP-XXX --coverage=80  Initialize with Coverage Mode
  node scripts/ralph-loop.js --init --epic=EP-XXX --condition="**all tests passing**"
  node scripts/ralph-loop.js --status                         Check loop status
  node scripts/ralph-loop.js --stop                           Stop the loop
  node scripts/ralph-loop.js --reset                          Reset loop state

${c.bold}Options:${c.reset}
  --epic=EP-XXXX      Epic ID to process (required for --init)
  --max=N             Max iterations (default: 20)
  --visual, -v        Enable Visual Mode (screenshot verification)
  --coverage=N        Enable Coverage Mode (iterate until N% coverage)
  --condition="..."   Add discretion condition (can use multiple times)

${c.bold}Visual Mode:${c.reset}
  When --visual is enabled, the loop also verifies that all screenshots
  in the screenshots/ directory have been reviewed (verified- prefix).

  This ensures Claude actually looks at UI screenshots before declaring
  completion. Requires minimum 2 iterations for confirmation.

${c.bold}Coverage Mode:${c.reset}
  When --coverage=N is enabled, the loop verifies test coverage meets
  the threshold N% before completing stories.

  Coverage is read from coverage/coverage-summary.json (Jest/NYC format).
  Configure in docs/00-meta/agileflow-metadata.json:
    { "ralph_loop": { "coverage_command": "npm run test:coverage" } }

  Workflow:
    1. Tests run → must pass
    2. Coverage checked → must meet threshold
    3. Minimum 2 iterations → confirms coverage is stable
    4. Only then → story marked complete

${c.bold}Discretion Conditions:${c.reset}
  Semantic conditions that must pass before story completion.
  Use --condition multiple times for multiple conditions.

  Built-in conditions:
    **all tests passing**            Tests must pass
    **tests pass**                   Tests must pass (alias)
    **coverage above 80%**           Coverage must meet threshold
    **no linting errors**            npm run lint must pass
    **no type errors**               npx tsc --noEmit must pass
    **build succeeds**               npm run build must pass
    **all screenshots verified**     Screenshots need verified- prefix
    **all acceptance criteria verified**  AC marked complete in status.json

  Configure in docs/00-meta/agileflow-metadata.json:
    {
      "ralph_loop": {
        "conditions": [
          "**all tests passing**",
          "**no linting errors**"
        ]
      }
    }

${c.bold}How it works:${c.reset}
  1. Start loop with /agileflow:babysit EPIC=EP-XXX MODE=loop COVERAGE=80
  2. Work on the current story
  3. When you stop, this hook runs tests and verifications
  4. If all pass → story marked complete, next story loaded
  5. If any fail → failures shown, you continue fixing
  6. Loop repeats until epic done or max iterations
`);
    return true;
  }

  return false;
}

// Main
function main() {
  // Handle CLI commands first
  if (handleCLI()) {
    return;
  }

  // Otherwise run the loop handler
  const rootDir = getProjectRoot();
  handleLoop(rootDir);
}

main();
