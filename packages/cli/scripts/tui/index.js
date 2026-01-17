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

// Use simple-tui (pure Node.js) - Ink has React version conflicts in monorepo
const useInk = false;

/**
 * Main entry point
 */
async function main() {
  if (useInk) {
    // Use the React/Ink-based Dashboard for modern terminals
    const React = require('react');
    const { render } = require('ink');
    const { Dashboard } = require('./Dashboard');

    // Handle actions from the dashboard
    const handleAction = action => {
      // TODO: Implement loop control actions
      // console.log('Action:', action);
    };

    // Render the dashboard
    const { waitUntilExit } = render(React.createElement(Dashboard, { onAction: handleAction }));

    // Wait for exit
    await waitUntilExit();
  } else {
    // Use simple TUI (pure Node.js, no React dependencies)
    const { main: simpleTuiMain } = require('./simple-tui');
    simpleTuiMain();
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
