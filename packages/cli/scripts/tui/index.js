#!/usr/bin/env node
'use strict';

/**
 * AgileFlow TUI - Terminal User Interface
 *
 * Full-screen, flicker-free dashboard for session monitoring, multi-agent
 * orchestration, and interactive workflow control.
 *
 * Usage:
 *   node scripts/tui/index.js
 *   npx agileflow tui
 *   npx agileflow tui --fallback  (use simple ANSI version)
 *
 * Key bindings:
 *   1-3       Switch tabs (Sessions, Output, Trace)
 *   Tab       Next tab
 *   j/k       Navigate list items
 *   r         Refresh data
 *   ?/h       Toggle help overlay
 *   q         Quit TUI
 */

// Check for --fallback flag
const useFallback = process.argv.includes('--fallback') || process.argv.includes('--simple');

/**
 * Main entry point
 */
async function main() {
  if (useFallback) {
    // Use simple TUI (pure Node.js ANSI codes, no dependencies)
    try {
      const { main: simpleTuiMain } = require('./simple-tui');
      simpleTuiMain();
    } catch (err) {
      console.error('Simple TUI Error:', err.message);
      process.exit(1);
    }
  } else {
    // Use blessed TUI (professional full-screen interface)
    try {
      const { main: blessedMain } = require('./blessed');
      blessedMain();
    } catch (err) {
      // If blessed fails (missing deps, terminal issues), fall back to simple
      console.error('Blessed TUI failed to load:', err.message);
      console.error('Falling back to simple TUI...\n');

      try {
        const { main: simpleTuiMain } = require('./simple-tui');
        simpleTuiMain();
      } catch (fallbackErr) {
        console.error('Fallback TUI also failed:', fallbackErr.message);
        console.error('\nTry running with: npx agileflow status');
        process.exit(1);
      }
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('TUI Error:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
