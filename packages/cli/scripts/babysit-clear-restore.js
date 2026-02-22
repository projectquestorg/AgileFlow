#!/usr/bin/env node
/**
 * babysit-clear-restore.js - SessionStart hook for babysit context preservation
 *
 * When context is cleared (e.g., after plan approval), this hook:
 * 1. Detects source="clear" from Claude Code's SessionStart event
 * 2. Checks if /babysit is active in session-state.json
 * 3. If both, outputs the COMPACT_SUMMARY from the babysit command file
 * 4. Sets last_precompact_at so the welcome script preserves active_commands
 *
 * This eliminates the need to manually embed babysit rules in plan files (Rule #6).
 * The hook automatically injects the rules into the fresh context after clear.
 *
 * Exit codes:
 *   0 = Success (always - SessionStart hooks should never block)
 *
 * Input: JSON on stdin with { source: "startup"|"resume"|"clear"|"compact", ... }
 * Output: Babysit compact summary to stdout (appears as system-reminder)
 */

const fs = require('fs');
const path = require('path');

const STDIN_TIMEOUT_MS = 3000;

function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.agileflow'))) return dir;
    if (fs.existsSync(path.join(dir, 'docs', '09-agents'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const ROOT = findProjectRoot();

function getSessionState() {
  const statePath = path.join(ROOT, 'docs', '09-agents', 'session-state.json');
  try {
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch (e) {
    // Silently fail
  }
  return null;
}

function isBabysitActive(state) {
  if (!state) return false;
  const activeCommands = state.active_commands || [];
  return activeCommands.some(cmd => cmd.name === 'babysit');
}

function setPrecompactTimestamp(state) {
  const statePath = path.join(ROOT, 'docs', '09-agents', 'session-state.json');
  try {
    state.last_precompact_at = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    // Silently fail
  }
}

function getBabysitCompactSummary() {
  // Search for the babysit command file in known locations
  const locations = [
    path.join(ROOT, 'packages', 'cli', 'src', 'core', 'commands', 'babysit.md'),
    path.join(ROOT, '.agileflow', 'commands', 'babysit.md'),
    path.join(ROOT, '.claude', 'commands', 'agileflow', 'babysit.md'),
  ];

  for (const filePath of locations) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(
        /<!-- COMPACT_SUMMARY_START[\s\S]*?-->([\s\S]*?)<!-- COMPACT_SUMMARY_END -->/
      );
      if (match) {
        return match[1].trim();
      }
    } catch (e) {
      // Try next location
    }
  }
  return null;
}

// Read stdin for hook event data
let inputData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(inputData);
    const source = input.source;

    // Only act on "clear" events (context cleared after plan approval, /clear, etc.)
    if (source !== 'clear') {
      process.exit(0);
      return;
    }

    const state = getSessionState();
    if (!isBabysitActive(state)) {
      process.exit(0);
      return;
    }

    // Set last_precompact_at so the welcome script preserves active_commands
    // instead of clearing them (it checks this timestamp)
    setPrecompactTimestamp(state);

    // Output the babysit compact summary
    const summary = getBabysitCompactSummary();
    if (summary) {
      console.log('## ACTIVE COMMAND: /agileflow:babysit (restored after context clear)');
      console.log('');
      console.log(summary);
    } else {
      // Fallback: output minimal babysit rules if command file not found
      console.log('## /agileflow:babysit IS ACTIVE (restored after context clear)');
      console.log('');
      console.log('MANDATORY RULES:');
      console.log('1. ALWAYS end responses with AskUserQuestion tool (specific options, not text)');
      console.log('2. Use EnterPlanMode for non-trivial tasks');
      console.log('3. Delegate complex work to domain experts via Task tool');
      console.log('4. Track progress with TaskCreate/TaskUpdate for multi-step work');
      console.log(
        '5. ALWAYS suggest logic audit post-implementation (after tests pass, make Recommended)'
      );
    }
  } catch (e) {
    // Parse failed or other error - fail open
  }
  process.exit(0);
});

// Handle no stdin (direct invocation or timeout)
process.stdin.on('error', () => {
  process.exit(0);
});

// Timeout safety - don't hang
setTimeout(() => {
  process.exit(0);
}, STDIN_TIMEOUT_MS);
