#!/usr/bin/env node
/**
 * test-session-boundary.js - Test session boundary hook logic
 *
 * Usage:
 *   node test-session-boundary.js --active=/path/to/session --file=/path/to/file
 *
 * Examples:
 *   node test-session-boundary.js --active=/home/coder/project-bugfix --file=/home/coder/project-bugfix/src/App.tsx
 *   → ALLOWED (file is inside active session)
 *
 *   node test-session-boundary.js --active=/home/coder/project-bugfix --file=/home/coder/project/src/App.tsx
 *   → BLOCKED (file is outside active session)
 */

const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
let activeSessionPath = null;
let filePath = null;

for (const arg of args) {
  if (arg.startsWith('--active=')) {
    activeSessionPath = arg.slice('--active='.length);
  } else if (arg.startsWith('--file=')) {
    filePath = arg.slice('--file='.length);
  }
}

// Show usage if missing args
if (!activeSessionPath || !filePath) {
  console.log(`
Session Boundary Hook Tester

Usage:
  node test-session-boundary.js --active=<session_path> --file=<file_path>

Examples:
  # File INSIDE active session (should be ALLOWED)
  node test-session-boundary.js \\
    --active=/home/coder/project-bugfix \\
    --file=/home/coder/project-bugfix/src/App.tsx

  # File OUTSIDE active session (should be BLOCKED)
  node test-session-boundary.js \\
    --active=/home/coder/project-bugfix \\
    --file=/home/coder/project/src/App.tsx
`);
  process.exit(0);
}

// Normalize paths
const normalizedActive = path.resolve(activeSessionPath);
const normalizedFile = path.resolve(filePath);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Session Boundary Check');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`Active Session Path: ${normalizedActive}`);
console.log(`File Being Edited:   ${normalizedFile}`);
console.log('');

// Check if file is within active session path
const isInsideSession = normalizedFile.startsWith(normalizedActive + path.sep) ||
                        normalizedFile === normalizedActive;

if (isInsideSession) {
  console.log('✅ ALLOWED - File is inside the active session directory');
  console.log('');
  console.log('The hook would exit(0) and allow this edit.');
} else {
  console.log('❌ BLOCKED - File is OUTSIDE the active session directory!');
  console.log('');
  console.log('The hook would exit(2) and block this edit with message:');
  console.log(`  "Edit blocked: ${normalizedFile} is outside active session ${normalizedActive}"`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
