#!/usr/bin/env node

/**
 * AgileFlow TUI - Terminal User Interface
 *
 * Real-time visualization for session monitoring, multi-agent orchestration,
 * and interactive loop control.
 *
 * Usage:
 *   node scripts/tui/index.mjs
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

import React from 'react';
import { render, Box, Text } from 'ink';
import { App } from './App.mjs';
import { SessionPanel } from './panels/SessionPanel.mjs';
import { OutputPanel } from './panels/OutputPanel.mjs';

// Main TUI Layout - split panel view
function MainLayout() {
  return React.createElement(
    Box,
    { flexDirection: 'row', width: '100%', minHeight: 15 },
    // Left panel - Sessions (40% width)
    React.createElement(
      Box,
      { flexDirection: 'column', width: '40%', paddingRight: 1 },
      React.createElement(SessionPanel, { refreshInterval: 5000 })
    ),
    // Right panel - Agent Output (60% width)
    React.createElement(
      Box,
      { flexDirection: 'column', width: '60%' },
      React.createElement(OutputPanel, {
        maxMessages: 100,
        showTimestamp: true,
        title: 'AGENT OUTPUT',
      })
    )
  );
}

// Main entry point
function main() {
  const instance = render(
    React.createElement(App, { title: 'AgileFlow TUI' }, React.createElement(MainLayout))
  );

  // Handle clean exit
  instance.waitUntilExit().then(() => {
    console.log('AgileFlow TUI closed.');
    process.exit(0);
  });
}

// Run directly
main();

export { main };
