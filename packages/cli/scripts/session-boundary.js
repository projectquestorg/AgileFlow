#!/usr/bin/env node
/**
 * session-boundary.js - PreToolUse hook for Edit/Write session isolation
 *
 * Prevents Claude from editing files outside the active session directory.
 * Used with PreToolUse:Edit and PreToolUse:Write hooks.
 *
 * Exit codes:
 *   0 = Allow the operation
 *   2 = Block with message (shown to Claude)
 *
 * Input: JSON on stdin with tool_input.file_path
 * Output: Error message to stderr if blocking
 */

const fs = require('fs');
const path = require('path');

// Inline colors (no external dependency)
const c = {
  coral: '\x1b[38;5;203m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

const STDIN_TIMEOUT_MS = 4000;

// Find project root by looking for .agileflow directory
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.agileflow'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, 'docs', '09-agents'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const ROOT = findProjectRoot();
const SESSION_STATE_PATH = path.join(ROOT, 'docs', '09-agents', 'session-state.json');

// Get active session from session-state.json
function getActiveSession() {
  try {
    if (!fs.existsSync(SESSION_STATE_PATH)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(SESSION_STATE_PATH, 'utf8'));
    return data.active_session || null;
  } catch (e) {
    return null;
  }
}

// Check if filePath is inside sessionPath
function isInsideSession(filePath, sessionPath) {
  const normalizedFile = path.resolve(filePath);
  const normalizedSession = path.resolve(sessionPath);

  return (
    normalizedFile.startsWith(normalizedSession + path.sep) || normalizedFile === normalizedSession
  );
}

// Output blocked message
function outputBlocked(filePath, activeSession) {
  const sessionName = activeSession.nickname
    ? `"${activeSession.nickname}"`
    : `Session ${activeSession.id}`;

  console.error(`${c.coral}[SESSION BOUNDARY]${c.reset} Edit blocked`);
  console.error(`${c.dim}File: ${filePath}${c.reset}`);
  console.error(`${c.dim}Active session: ${sessionName} (${activeSession.path})${c.reset}`);
  console.error('');
  console.error(`${c.dim}The file is outside the active session directory.${c.reset}`);
  console.error(`${c.dim}Use /agileflow:session:resume to switch sessions first.${c.reset}`);
}

// Main logic - run with stdin events (async)
function main() {
  let inputData = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    inputData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      // Parse tool input from Claude Code
      const hookData = JSON.parse(inputData);
      const filePath = hookData?.tool_input?.file_path;

      if (!filePath) {
        // No file path in input - allow
        process.exit(0);
      }

      // Get active session
      const activeSession = getActiveSession();

      if (!activeSession || !activeSession.path) {
        // No active session set - allow all (normal behavior)
        process.exit(0);
      }

      // Check if file is inside active session
      if (isInsideSession(filePath, activeSession.path)) {
        // File is inside active session - allow
        process.exit(0);
      }

      // File is OUTSIDE active session - BLOCK
      outputBlocked(filePath, activeSession);
      process.exit(2);
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

main();
