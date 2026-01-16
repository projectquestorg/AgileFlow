#!/usr/bin/env node
'use strict';

/**
 * AgileFlow TUI - Terminal User Interface
 *
 * Real-time visualization for session monitoring, multi-agent orchestration,
 * and interactive loop control.
 *
 * Usage:
 *   node scripts/tui/index.js
 *   npx agileflow tui
 *
 * Key bindings:
 *   q - Quit TUI
 *   s - Start loop on current story
 *   p - Pause active loop
 *   r - Resume paused loop
 *   t - Toggle trace panel
 *   1-9 - Switch session focus
 */

// Use the simple TUI implementation (pure Node.js, no React dependencies)
const { main } = require('./simple-tui');

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
